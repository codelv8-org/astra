//! UAT บน SMB share จริง: รันเองเท่านั้น
//! `CREWNEST_UAT_SHARE=X:\astra-uat cargo test -p crewnest-core --test storage_uat -- --ignored --nocapture`
use crewnest_core::storage::{
    delete_previous, detect_mode, migrate, read_pointer, InstanceLock, Mode, Target,
};
use crewnest_core::store::Store;
use std::path::PathBuf;

fn share_root() -> PathBuf {
    PathBuf::from(std::env::var("CREWNEST_UAT_SHARE").expect("set CREWNEST_UAT_SHARE"))
}

fn journal(store: &Store) -> String {
    store
        .connect()
        .unwrap()
        .pragma_query_value(None, "journal_mode", |r| r.get(0))
        .unwrap()
}

#[test]
#[ignore = "needs a real SMB share"]
fn uat_move_to_share_and_back() {
    let root = share_root();
    std::fs::create_dir_all(&root).unwrap();
    let a = root.join("a");
    let b = root.join("b");
    std::fs::create_dir_all(&a).unwrap();
    std::fs::create_dir_all(&b).unwrap();
    let t = tempfile::tempdir().unwrap();
    let local = t.path().join("local");
    let old = t.path().join("old");
    std::fs::create_dir_all(t.path().join("ws")).unwrap();

    // 1) ข้อมูลตั้งต้นในเครื่อง (WAL)
    let store = Store::open(old.join("crewnest.db")).unwrap();
    store.register_project("UAT", "", &t.path().join("ws")).unwrap();
    for i in 0..300 {
        store.audit("uat_seed", &i.to_string()).unwrap();
    }
    println!("mode(share)={:?}", detect_mode(&a));
    assert_eq!(detect_mode(&a), Mode::Network);

    // 2) local -> share
    let started = std::time::Instant::now();
    migrate(&store, &local, &old, &a, Target::Copy).unwrap();
    println!("migrate local->share {:?}", started.elapsed());
    let on_share = Store::open_with(a.join("crewnest.db"), Mode::Network).unwrap();
    assert_eq!(journal(&on_share), "delete");
    assert_eq!(on_share.snapshot().unwrap().projects.len(), 1);
    assert!(!a.join("crewnest.db-wal").exists());

    // 3) lock บน share: ซ้อนไม่ได้, ปล่อยแล้วได้ใหม่
    let lock = InstanceLock::acquire(&a).unwrap();
    assert!(InstanceLock::acquire(&a).is_err());
    drop(lock);
    let lock = InstanceLock::acquire(&a).unwrap();

    // 4) เขียนพร้อมกันหลาย connection บน share (busy_timeout + journal DELETE)
    let started = std::time::Instant::now();
    let writers: Vec<_> = (0..4)
        .map(|w| {
            let s = on_share.clone();
            std::thread::spawn(move || {
                for i in 0..50 {
                    s.audit("uat_write", &format!("{w}-{i}")).unwrap();
                }
            })
        })
        .collect();
    for w in writers {
        w.join().unwrap();
    }
    println!("200 concurrent writes on share {:?}", started.elapsed());
    let writes: i64 = on_share
        .connect()
        .unwrap()
        .query_row("SELECT COUNT(*) FROM audit_logs WHERE action='uat_write'", [], |r| r.get(0))
        .unwrap();
    assert_eq!(writes, 200);
    let check: String = on_share
        .connect()
        .unwrap()
        .query_row("PRAGMA integrity_check", [], |r| r.get(0))
        .unwrap();
    assert_eq!(check, "ok");

    // 5) หลัง "รีสตาร์ท" ลบข้อมูลเดิมในเครื่อง
    delete_previous(&local, &a).unwrap();
    assert!(!old.join("crewnest.db").exists());

    // 6) share -> share อีก folder แล้วลบต้นทางบน share (lock ของต้นทางต้องปล่อยก่อน)
    let started = std::time::Instant::now();
    migrate(&on_share, &local, &a, &b, Target::Copy).unwrap();
    println!("migrate share->share {:?}", started.elapsed());
    assert!(delete_previous(&local, &b).is_err(), "a ยังถูก lock อยู่ ต้องลบไม่ได้");
    drop(lock);
    delete_previous(&local, &b).unwrap();
    assert!(!a.join("crewnest.db").exists());
    assert_eq!(read_pointer(&local).unwrap().unwrap().data_dir, b);
    let moved = Store::open_with(b.join("crewnest.db"), Mode::Network).unwrap();
    assert_eq!(moved.snapshot().unwrap().projects.len(), 1);
    drop(moved);
    drop(on_share);

    std::fs::remove_dir_all(&root).unwrap();
    println!("UAT ok, cleaned {}", root.display());
}
