//! ที่จัดเก็บข้อมูลแอป: pointer file ในเครื่อง, Local/Network mode, instance lock และการย้ายข้อมูล
use crate::Result;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

pub const POINTER_FILE: &str = "storage.json";
pub const DB_FILE: &str = "crewnest.db";

/// ไฟล์ชี้ตำแหน่ง เก็บใน app_local_data_dir เสมอ (อ่านก่อนเปิด DB)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pointer {
    pub data_dir: PathBuf,
    pub previous: Option<PathBuf>,
}

pub fn read_pointer(local_dir: &Path) -> Result<Option<Pointer>> {
    match std::fs::read_to_string(local_dir.join(POINTER_FILE)) {
        Ok(text) => serde_json::from_str(&text)
            .map(Some)
            .map_err(|e| format!("storage.json เสียหาย: {e}")),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("อ่าน storage.json ไม่ได้: {e}")),
    }
}

/// เขียนแบบ atomic: temp แล้ว rename ทับ
pub fn write_pointer(local_dir: &Path, pointer: &Pointer) -> Result<()> {
    std::fs::create_dir_all(local_dir).map_err(|e| e.to_string())?;
    let temp = local_dir.join(format!("{POINTER_FILE}.tmp"));
    let text = serde_json::to_string_pretty(pointer).map_err(|e| e.to_string())?;
    std::fs::write(&temp, text).map_err(|e| e.to_string())?;
    std::fs::rename(&temp, local_dir.join(POINTER_FILE)).map_err(|e| e.to_string())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    Local,
    Network,
}

pub fn detect_mode(dir: &Path) -> Mode {
    let text = dir.to_string_lossy();
    if text.starts_with(r"\\?\UNC\") || (text.starts_with(r"\\") && !text.starts_with(r"\\?\")) {
        return Mode::Network;
    }
    if is_remote_drive(dir) {
        Mode::Network
    } else {
        Mode::Local
    }
}

/// แยกจาก crewnest.lock ที่ Core::new ล็อกอยู่ (ล็อกไฟล์เดียวกันสองครั้งบน Windows จะล้ม)
pub const LOCK_FILE: &str = "crewnest.instance.lock";
const OWNER_FILE: &str = "crewnest.owner";

/// ล็อก data folder ตลอดอายุแอป กันเครื่องอื่นเปิด DB บน share ซ้อน;
/// OS ปล่อย lock เองเมื่อ process ตาย จึงไม่มี lock ค้าง
pub struct InstanceLock(#[allow(dead_code)] std::fs::File);

impl InstanceLock {
    pub fn acquire(dir: &Path) -> Result<Self> {
        use fs2::FileExt;
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        let file = std::fs::OpenOptions::new()
            .create(true)
            .truncate(false)
            .write(true)
            .open(dir.join(LOCK_FILE))
            .map_err(|e| format!("เปิด lock file ไม่ได้: {e}"))?;
        if file.try_lock_exclusive().is_err() {
            // ไฟล์ที่ถูกล็อกอ่านไม่ได้บน Windows จึงเก็บชื่อผู้ถือไว้อีกไฟล์
            let owner = std::fs::read_to_string(dir.join(OWNER_FILE))
                .unwrap_or_else(|_| "โปรแกรมอื่น".into());
            return Err(format!("ข้อมูลกำลังถูกใช้โดย {}", owner.trim()));
        }
        let host = std::env::var("COMPUTERNAME").unwrap_or_else(|_| "unknown".into());
        let _ = std::fs::write(
            dir.join(OWNER_FILE),
            format!("{host} pid {} ({})", std::process::id(), crate::now()),
        );
        Ok(Self(file))
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Info {
    pub data_dir: String,
    pub mode: Mode,
    pub db_bytes: u64,
    pub free_bytes: u64,
    pub previous: Option<String>,
}

pub fn info(data_dir: &Path, previous: Option<&Path>) -> Result<Info> {
    let plain = |p: &Path| p.to_string_lossy().trim_start_matches(r"\\?\").to_string();
    Ok(Info {
        data_dir: plain(data_dir),
        mode: detect_mode(data_dir),
        db_bytes: std::fs::metadata(data_dir.join(DB_FILE))
            .map(|m| m.len())
            .unwrap_or(0),
        free_bytes: fs2::available_space(data_dir).map_err(|e| e.to_string())?,
        previous: previous.map(plain),
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Target {
    /// คัดลอกฐานข้อมูลปัจจุบันไปที่ใหม่
    Copy,
    /// ปลายทางมี crewnest.db อยู่แล้ว ใช้ข้อมูลนั้นแทน
    UseExisting,
}

/// ตารางหลักที่ต้องมีจำนวนแถวเท่ากันหลังคัดลอก
const COUNTED: [&str; 5] = ["projects", "tasks", "executions", "execution_events", "workflows"];

fn counts(db: &rusqlite::Connection) -> Result<Vec<i64>> {
    COUNTED
        .iter()
        .map(|table| {
            db.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r.get(0))
                .map_err(|e| e.to_string())
        })
        .collect()
}

fn check_database(path: &Path) -> Result<rusqlite::Connection> {
    let db = rusqlite::Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| format!("เปิดฐานข้อมูลปลายทางไม่ได้: {e}"))?;
    let status: String = db
        .query_row("PRAGMA integrity_check", [], |r| r.get(0))
        .map_err(|e| format!("ฐานข้อมูลปลายทางเสียหาย: {e}"))?;
    if status != "ok" {
        return Err(format!("ฐานข้อมูลปลายทางเสียหาย: {status}"));
    }
    let version: i64 = db
        .pragma_query_value(None, "user_version", |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if version > crate::store::SCHEMA_VERSION {
        return Err("ฐานข้อมูลปลายทางเป็นเวอร์ชันใหม่กว่าแอปนี้".into());
    }
    Ok(db)
}

fn overlaps(a: &Path, b: &Path) -> bool {
    let key = |p: &Path| p.to_string_lossy().trim_end_matches('\\').to_lowercase();
    let (a, b) = (key(a), key(b));
    a == b || a.starts_with(&format!("{b}\\")) || b.starts_with(&format!("{a}\\"))
}

/// ย้ายที่จัดเก็บ: เขียน pointer เป็นขั้นสุดท้าย ถ้าพังกลางทาง แอปยังใช้ที่เดิม
pub fn migrate(
    store: &crate::store::Store,
    local_dir: &Path,
    current: &Path,
    dest: &Path,
    target: Target,
) -> Result<()> {
    let dest_c = dest
        .canonicalize()
        .map_err(|_| "ไม่พบ folder ปลายทาง")?;
    if !dest_c.is_dir() {
        return Err("ปลายทางต้องเป็น folder".into());
    }
    let current_c = current.canonicalize().unwrap_or_else(|_| current.to_path_buf());
    if overlaps(&dest_c, &current_c) {
        return Err("ปลายทางต้องไม่ใช่ตำแหน่งเดิมหรือ folder ย่อยของตำแหน่งเดิม".into());
    }
    let probe = dest.join(".crewnest-write-test");
    std::fs::write(&probe, b"ok").map_err(|e| format!("เขียนไฟล์ที่ปลายทางไม่ได้: {e}"))?;
    let _ = std::fs::remove_file(&probe);
    let db_path = dest.join(DB_FILE);
    match target {
        Target::Copy => {
            if db_path.exists() {
                return Err("EXISTING_DB".into());
            }
            // หยุดคิวก่อนตรวจงานที่รัน กันงานใหม่เริ่มระหว่างคัดลอก (หลังรีสตาร์ท scheduler ยังหยุดอยู่)
            store.set_scheduler_paused(true)?;
            let source = store.connect()?;
            let running: i64 = source
                .query_row("SELECT COUNT(*) FROM executions WHERE status='running'", [], |r| r.get(0))
                .map_err(|e| e.to_string())?;
            if running > 0 {
                return Err("ย้ายที่จัดเก็บไม่ได้ขณะมีงานกำลังรัน".into());
            }
            let size = std::fs::metadata(&store.path).map(|m| m.len()).unwrap_or(0);
            let free = fs2::available_space(dest).map_err(|e| e.to_string())?;
            if (free as f64) < size as f64 * 1.2 {
                return Err("พื้นที่ว่างที่ปลายทางไม่พอ".into());
            }
            let partial = dest.join(format!("{DB_FILE}.partial"));
            let _ = std::fs::remove_file(&partial);
            source
                .execute("VACUUM INTO ?1", [partial.to_string_lossy()])
                .map_err(|e| format!("คัดลอกฐานข้อมูลไม่สำเร็จ: {e}"))?;
            let copied = check_database(&partial)?;
            if counts(&copied)? != counts(&source)? {
                drop(copied);
                let _ = std::fs::remove_file(&partial);
                return Err("จำนวนข้อมูลที่คัดลอกไม่ตรงกับต้นทาง".into());
            }
            drop(copied);
            // -wal/-journal กำพร้าที่ปลายทางจะถูก replay ลงไฟล์ใหม่ตอนเปิด ต้องลบก่อน
            remove_db_files(dest)?;
            std::fs::rename(&partial, &db_path).map_err(|e| e.to_string())?;
            let moved = crate::store::Store::open_with(&db_path, detect_mode(dest))?;
            moved.audit("storage_changed", &dest.to_string_lossy())?;
        }
        Target::UseExisting => return adopt(local_dir, Some(current), dest),
    }
    write_pointer(
        local_dir,
        &Pointer {
            data_dir: dest.to_path_buf(),
            previous: Some(current.to_path_buf()),
        },
    )
}

/// ชี้ไปที่ฐานข้อมูลที่มีอยู่แล้ว (ใช้ในหน้ากู้คืน ที่ไม่มี Store เปิดอยู่)
pub fn adopt(local_dir: &Path, current: Option<&Path>, dest: &Path) -> Result<()> {
    let db_path = dest.join(DB_FILE);
    if !db_path.exists() {
        return Err("ไม่พบข้อมูลเดิมที่ตำแหน่งนี้".into());
    }
    check_database(&db_path)?;
    write_pointer(
        local_dir,
        &Pointer {
            data_dir: dest.to_path_buf(),
            previous: current.map(Path::to_path_buf),
        },
    )
}

/// สร้างฐานข้อมูลใหม่ที่ folder ว่าง แล้วชี้ไปที่นั่น (ผู้ใช้ต้องยืนยันก่อนเรียก)
pub fn create_new(local_dir: &Path, current: Option<&Path>, dest: &Path) -> Result<()> {
    if dest.join(DB_FILE).exists() {
        return Err("EXISTING_DB".into());
    }
    drop(crate::store::Store::open_with(dest.join(DB_FILE), detect_mode(dest))?);
    write_pointer(
        local_dir,
        &Pointer {
            data_dir: dest.to_path_buf(),
            previous: current.map(Path::to_path_buf),
        },
    )
}

/// กลับไปใช้ตำแหน่งก่อนหน้า (สลับ data_dir กับ previous)
pub fn revert(local_dir: &Path) -> Result<()> {
    let pointer = read_pointer(local_dir)?.ok_or("ยังไม่เคยย้ายที่จัดเก็บ")?;
    let previous = pointer.previous.ok_or("ไม่มีตำแหน่งเดิมให้กลับไป")?;
    check_database(&previous.join(DB_FILE))
        .map_err(|e| format!("ใช้ตำแหน่งเดิมไม่ได้: {e}"))?;
    write_pointer(
        local_dir,
        &Pointer {
            data_dir: previous,
            previous: Some(pointer.data_dir),
        },
    )
}

/// sidecar ก่อนไฟล์หลัก: ถ้าลบค้างกลางทางจะไม่เหลือ -wal/-journal กำพร้าให้ replay ทีหลัง
const DB_FILES: [&str; 4] = ["-wal", "-shm", "-journal", ""];

fn remove_db_files(dir: &Path) -> Result<()> {
    for suffix in DB_FILES {
        let name = format!("{DB_FILE}{suffix}");
        match std::fs::remove_file(dir.join(&name)) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(format!("ลบ {name} ไม่ได้: {e}")),
        }
    }
    Ok(())
}

/// ลบไฟล์ฐานข้อมูลที่ตำแหน่งเดิม (ไม่ลบ folder หรือไฟล์อื่น); `running` คือ data folder ที่แอปเปิดอยู่จริง
pub fn delete_previous(local_dir: &Path, running: &Path) -> Result<()> {
    let mut pointer = read_pointer(local_dir)?.ok_or("ยังไม่เคยย้ายที่จัดเก็บ")?;
    if !overlaps(&pointer.data_dir, running) {
        return Err("รีสตาร์ทแอปก่อน แล้วจึงลบข้อมูลที่ตำแหน่งเดิม".into());
    }
    let previous = pointer.previous.take().ok_or("ไม่มีข้อมูลที่ตำแหน่งเดิม")?;
    if overlaps(&previous, running) {
        return Err("ตำแหน่งเดิมคือที่ใช้อยู่ ลบไม่ได้".into());
    }
    // ถ้ามีเครื่องอื่นเปิดข้อมูลชุดนั้นอยู่ จะได้ lock ไม่ได้และไม่ลบ
    let lock = InstanceLock::acquire(&previous).map_err(|e| format!("ลบไม่ได้: {e}"))?;
    remove_db_files(&previous)?;
    drop(lock);
    for name in [LOCK_FILE, OWNER_FILE, "crewnest.lock"] {
        let _ = std::fs::remove_file(previous.join(name));
    }
    write_pointer(local_dir, &pointer)
}

#[cfg(windows)]
fn is_remote_drive(dir: &Path) -> bool {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::GetDriveTypeW;
    /// ค่าคืนของ GetDriveTypeW สำหรับ network drive (WinBase.h)
    const DRIVE_REMOTE: u32 = 4;
    let text = dir.to_string_lossy();
    let plain = text.trim_start_matches(r"\\?\");
    let mut chars = plain.chars();
    let (Some(letter), Some(':')) = (chars.next(), chars.next()) else {
        return false;
    };
    let root: Vec<u16> = std::ffi::OsStr::new(&format!("{letter}:\\"))
        .encode_wide()
        .chain(Some(0))
        .collect();
    // SAFETY: root เป็น wide string ที่ปิดท้ายด้วย NUL
    unsafe { GetDriveTypeW(root.as_ptr()) == DRIVE_REMOTE }
}

#[cfg(not(windows))]
fn is_remote_drive(_: &Path) -> bool {
    false
}
