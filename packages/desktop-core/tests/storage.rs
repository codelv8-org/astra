use crewnest_core::storage::{detect_mode, read_pointer, write_pointer, Mode, Pointer};
use std::path::Path;

#[test]
fn pointer_roundtrip() {
    let t = tempfile::tempdir().unwrap();
    let p = Pointer {
        data_dir: t.path().join("data"),
        previous: Some(t.path().join("old")),
    };
    write_pointer(t.path(), &p).unwrap();
    assert_eq!(read_pointer(t.path()).unwrap(), Some(p));
    assert!(!t.path().join("storage.json.tmp").exists());
}

#[test]
fn missing_pointer_is_none() {
    let t = tempfile::tempdir().unwrap();
    assert_eq!(read_pointer(t.path()).unwrap(), None);
}

#[test]
fn corrupt_pointer_is_error() {
    let t = tempfile::tempdir().unwrap();
    std::fs::write(t.path().join("storage.json"), "{not json").unwrap();
    assert!(read_pointer(t.path()).is_err());
}

#[test]
fn unc_is_network() {
    assert_eq!(detect_mode(Path::new(r"\\server\share\astra")), Mode::Network);
    assert_eq!(
        detect_mode(Path::new(r"\\?\UNC\server\share\astra")),
        Mode::Network
    );
}

#[test]
fn tempdir_is_local() {
    let t = tempfile::tempdir().unwrap();
    assert_eq!(detect_mode(t.path()), Mode::Local);
}

mod lock_and_journal {
    use crewnest_core::storage::{InstanceLock, Mode};
    use crewnest_core::store::Store;

    #[test]
    fn second_lock_in_same_dir_fails() {
        let t = tempfile::tempdir().unwrap();
        let _first = InstanceLock::acquire(t.path()).unwrap();
        let second = InstanceLock::acquire(t.path());
        assert!(second.err().unwrap().contains("กำลังถูกใช้"));
    }

    #[test]
    fn stale_lock_file_is_reacquired() {
        let t = tempfile::tempdir().unwrap();
        drop(InstanceLock::acquire(t.path()).unwrap());
        assert!(t.path().join("crewnest.instance.lock").exists());
        assert!(InstanceLock::acquire(t.path()).is_ok());
    }

    fn journal(store: &Store) -> String {
        store
            .connect()
            .unwrap()
            .pragma_query_value(None, "journal_mode", |r| r.get(0))
            .unwrap()
    }

    #[test]
    fn network_mode_uses_delete_journal() {
        let t = tempfile::tempdir().unwrap();
        let store = Store::open_with(t.path().join("crewnest.db"), Mode::Network).unwrap();
        assert_eq!(journal(&store), "delete");
    }

    #[test]
    fn network_mode_converts_existing_wal_database() {
        let t = tempfile::tempdir().unwrap();
        let path = t.path().join("crewnest.db");
        drop(Store::open(&path).unwrap());
        let store = Store::open_with(&path, Mode::Network).unwrap();
        assert_eq!(journal(&store), "delete");
    }

    #[test]
    fn local_mode_uses_wal() {
        let t = tempfile::tempdir().unwrap();
        let store = Store::open_with(t.path().join("crewnest.db"), Mode::Local).unwrap();
        assert_eq!(journal(&store), "wal");
    }
}

mod migration {
    use crewnest_core::storage::{delete_previous, info, migrate, read_pointer, Mode, Target};
    use crewnest_core::store::Store;
    use std::path::{Path, PathBuf};

    struct Env {
        t: tempfile::TempDir,
        store: Store,
    }
    impl Env {
        fn new() -> Self {
            let t = tempfile::tempdir().unwrap();
            std::fs::create_dir_all(t.path().join("ws")).unwrap();
            std::fs::create_dir_all(t.path().join("new")).unwrap();
            let store = Store::open(t.path().join("old/crewnest.db")).unwrap();
            store.register_project("Keep me", "", &t.path().join("ws")).unwrap();
            Env { t, store }
        }
        fn local(&self) -> PathBuf {
            self.t.path().join("local")
        }
        fn old(&self) -> PathBuf {
            self.t.path().join("old")
        }
        fn new_dir(&self) -> PathBuf {
            self.t.path().join("new")
        }
    }
    fn projects(dir: &Path) -> usize {
        Store::open(dir.join("crewnest.db")).unwrap().snapshot().unwrap().projects.len()
    }

    #[test]
    fn copy_migrates_rows_and_updates_pointer() {
        let e = Env::new();
        migrate(&e.store, &e.local(), &e.old(), &e.new_dir(), Target::Copy).unwrap();
        assert_eq!(projects(&e.new_dir()), 1);
        let pointer = read_pointer(&e.local()).unwrap().unwrap();
        assert_eq!(pointer.data_dir, e.new_dir());
        assert_eq!(pointer.previous, Some(e.old()));
        assert!(!e.new_dir().join("crewnest.db.partial").exists());
        let audited: i64 = Store::open(e.new_dir().join("crewnest.db"))
            .unwrap()
            .connect()
            .unwrap()
            .query_row("SELECT COUNT(*) FROM audit_logs WHERE action='storage_changed'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(audited, 1);
        assert!(e.old().join("crewnest.db").exists());
    }

    #[test]
    fn existing_db_requires_use_existing() {
        let e = Env::new();
        drop(Store::open(e.new_dir().join("crewnest.db")).unwrap());
        let err = migrate(&e.store, &e.local(), &e.old(), &e.new_dir(), Target::Copy).unwrap_err();
        assert_eq!(err, "EXISTING_DB");
        assert_eq!(projects(&e.new_dir()), 0);
        assert_eq!(read_pointer(&e.local()).unwrap(), None);
    }

    #[test]
    fn use_existing_switches_pointer_only() {
        let e = Env::new();
        drop(Store::open(e.new_dir().join("crewnest.db")).unwrap());
        migrate(&e.store, &e.local(), &e.old(), &e.new_dir(), Target::UseExisting).unwrap();
        assert_eq!(projects(&e.new_dir()), 0);
        assert_eq!(read_pointer(&e.local()).unwrap().unwrap().data_dir, e.new_dir());
    }

    #[test]
    fn use_existing_without_db_is_rejected() {
        let e = Env::new();
        assert!(migrate(&e.store, &e.local(), &e.old(), &e.new_dir(), Target::UseExisting).is_err());
    }

    #[test]
    fn same_or_nested_destination_rejected() {
        let e = Env::new();
        let nested = e.old().join("sub");
        std::fs::create_dir_all(&nested).unwrap();
        assert!(migrate(&e.store, &e.local(), &e.old(), &e.old(), Target::Copy).is_err());
        assert!(migrate(&e.store, &e.local(), &e.old(), &nested, Target::Copy).is_err());
        assert_eq!(read_pointer(&e.local()).unwrap(), None);
    }

    #[test]
    fn missing_destination_rejected() {
        let e = Env::new();
        let gone = e.t.path().join("missing");
        assert!(migrate(&e.store, &e.local(), &e.old(), &gone, Target::Copy).is_err());
    }

    #[test]
    fn running_execution_blocks_migration() {
        let e = Env::new();
        let id = e.store.snapshot().unwrap().projects[0].id.clone();
        let db = e.store.connect().unwrap();
        db.execute("INSERT INTO tasks(id,project_id,agent_id,status) VALUES('t',?1,'astra','running')", [&id]).unwrap();
        db.execute("INSERT INTO executions(id,project_id,agent_id,task_id,adapter,prompt,status,created_at) VALUES('e',?1,'astra','t','mock','x','running','now')", [&id]).unwrap();
        assert!(migrate(&e.store, &e.local(), &e.old(), &e.new_dir(), Target::Copy).is_err());
        assert!(!e.new_dir().join("crewnest.db").exists());
    }

    #[test]
    fn interrupted_copy_leaves_pointer_unchanged() {
        let e = Env::new();
        // ไฟล์ค้างจากรอบที่ถูกขัดจังหวะ ถูกแทนที่ในรอบใหม่
        std::fs::write(e.new_dir().join("crewnest.db.partial"), "garbage").unwrap();
        migrate(&e.store, &e.local(), &e.old(), &e.new_dir(), Target::Copy).unwrap();
        assert!(!e.new_dir().join("crewnest.db.partial").exists());
        // ฐานข้อมูลปลายทางเสีย: ไม่สลับ pointer
        let e2 = Env::new();
        std::fs::write(e2.new_dir().join("crewnest.db"), "not a database").unwrap();
        assert!(migrate(&e2.store, &e2.local(), &e2.old(), &e2.new_dir(), Target::UseExisting).is_err());
        assert_eq!(read_pointer(&e2.local()).unwrap(), None);
    }

    #[test]
    fn delete_previous_removes_db_files_only() {
        let e = Env::new();
        std::fs::write(e.old().join("keep.txt"), "x").unwrap();
        migrate(&e.store, &e.local(), &e.old(), &e.new_dir(), Target::Copy).unwrap();
        // หลังรีสตาร์ท แอปทำงานอยู่ที่ new
        delete_previous(&e.local(), &e.new_dir()).unwrap();
        assert!(!e.old().join("crewnest.db").exists());
        assert!(e.old().join("keep.txt").exists());
        assert_eq!(read_pointer(&e.local()).unwrap().unwrap().previous, None);
        assert!(delete_previous(&e.local(), &e.new_dir()).is_err());
    }

    #[test]
    fn delete_previous_refuses_before_restart() {
        let e = Env::new();
        migrate(&e.store, &e.local(), &e.old(), &e.new_dir(), Target::Copy).unwrap();
        // ยังไม่รีสตาร์ท: แอปยังใช้ old ซึ่งคือ previous ใน pointer
        assert!(delete_previous(&e.local(), &e.old()).is_err());
        assert!(e.old().join("crewnest.db").exists());
    }

    #[test]
    fn delete_previous_refuses_when_old_folder_in_use() {
        let e = Env::new();
        migrate(&e.store, &e.local(), &e.old(), &e.new_dir(), Target::Copy).unwrap();
        let _other_machine = crewnest_core::storage::InstanceLock::acquire(&e.old()).unwrap();
        assert!(delete_previous(&e.local(), &e.new_dir()).is_err());
        assert!(e.old().join("crewnest.db").exists());
    }

    #[test]
    fn copy_pauses_scheduler() {
        let e = Env::new();
        e.store.set_scheduler_paused(false).unwrap();
        migrate(&e.store, &e.local(), &e.old(), &e.new_dir(), Target::Copy).unwrap();
        assert!(e.store.scheduler_paused().unwrap());
    }

    #[test]
    fn copy_ignores_orphan_sidecars() {
        let e = Env::new();
        // WAL ที่ใช้ได้จริงของฐานข้อมูลอื่น ค้างอยู่ที่ปลายทาง
        let other = e.t.path().join("other");
        std::fs::create_dir(&other).unwrap();
        let db = rusqlite::Connection::open(other.join("crewnest.db")).unwrap();
        db.execute_batch(
            "PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0;
             CREATE TABLE junk(v TEXT); INSERT INTO junk SELECT hex(randomblob(500)) FROM (WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM c WHERE x<200) SELECT x FROM c);",
        )
        .unwrap();
        std::fs::copy(other.join("crewnest.db-wal"), e.new_dir().join("crewnest.db-wal")).unwrap();
        std::fs::write(e.new_dir().join("crewnest.db-journal"), "orphan").unwrap();
        migrate(&e.store, &e.local(), &e.old(), &e.new_dir(), Target::Copy).unwrap();
        drop(db);
        assert!(!e.new_dir().join("crewnest.db-journal").exists());
        assert_eq!(projects(&e.new_dir()), 1);
        let check: String = rusqlite::Connection::open(e.new_dir().join("crewnest.db"))
            .unwrap()
            .query_row("PRAGMA integrity_check", [], |r| r.get(0))
            .unwrap();
        assert_eq!(check, "ok");
    }

    #[test]
    fn info_reports_size_and_mode() {
        let e = Env::new();
        let i = info(&e.old(), None).unwrap();
        assert_eq!(i.mode, Mode::Local);
        assert!(i.db_bytes > 0);
        assert!(i.free_bytes > 0);
        assert_eq!(i.previous, None);
    }
}

mod recovery {
    use crewnest_core::storage::{adopt, create_new, read_pointer, revert, write_pointer, Pointer};
    use crewnest_core::store::Store;

    #[test]
    fn adopt_points_at_valid_existing_db() {
        let t = tempfile::tempdir().unwrap();
        let (local, dest) = (t.path().join("local"), t.path().join("share"));
        drop(Store::open(dest.join("crewnest.db")).unwrap());
        adopt(&local, None, &dest).unwrap();
        assert_eq!(read_pointer(&local).unwrap().unwrap().data_dir, dest);
    }

    #[test]
    fn adopt_rejects_folder_without_db() {
        let t = tempfile::tempdir().unwrap();
        std::fs::create_dir(t.path().join("empty")).unwrap();
        assert!(adopt(&t.path().join("local"), None, &t.path().join("empty")).is_err());
        assert_eq!(read_pointer(&t.path().join("local")).unwrap(), None);
    }

    #[test]
    fn create_new_makes_db_then_points_at_it() {
        let t = tempfile::tempdir().unwrap();
        let (local, dest) = (t.path().join("local"), t.path().join("fresh"));
        std::fs::create_dir(&dest).unwrap();
        create_new(&local, Some(&t.path().join("old")), &dest).unwrap();
        assert!(dest.join("crewnest.db").exists());
        let p = read_pointer(&local).unwrap().unwrap();
        assert_eq!(p.data_dir, dest);
        assert_eq!(p.previous, Some(t.path().join("old")));
        assert!(create_new(&local, None, &dest).is_err());
    }

    #[test]
    fn revert_swaps_to_previous_with_db() {
        let t = tempfile::tempdir().unwrap();
        let (local, old, new) = (t.path().join("local"), t.path().join("old"), t.path().join("new"));
        drop(Store::open(old.join("crewnest.db")).unwrap());
        std::fs::create_dir(&new).unwrap();
        write_pointer(&local, &Pointer { data_dir: new.clone(), previous: Some(old.clone()) }).unwrap();
        revert(&local).unwrap();
        let p = read_pointer(&local).unwrap().unwrap();
        assert_eq!((p.data_dir, p.previous), (old, Some(new)));
    }

    #[test]
    fn revert_without_previous_db_fails() {
        let t = tempfile::tempdir().unwrap();
        let local = t.path().join("local");
        write_pointer(&local, &Pointer { data_dir: t.path().join("new"), previous: Some(t.path().join("gone")) }).unwrap();
        assert!(revert(&local).is_err());
    }
}
