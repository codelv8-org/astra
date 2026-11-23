import { useEffect, useState, type ReactNode } from "react";
import { Modal } from "../../../packages/ui/src/Modal";
import type { StorageStatus } from "../../../packages/shared/src";
import { bridge, desktopAvailable } from "./bridge";

export function formatBytes(bytes: number) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return unit === 0 ? `${value} B` : `${value.toFixed(1)} ${units[unit]}`;
}

const message = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause);

/** ย้ายที่จัดเก็บ: ปลายทางมี DB อยู่แล้ว → ถาม; สำเร็จ → ให้รีสตาร์ท */
function useStorageChange() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [existing, setExisting] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  async function apply(path: string, useExisting: boolean) {
    setBusy(true);
    setError("");
    try {
      await bridge.changeStorageFolder(path, useExisting);
      setExisting(null);
      setDone(true);
    } catch (cause) {
      const text = message(cause);
      if (text.includes("EXISTING_DB")) setExisting(path);
      else setError(text);
    } finally {
      setBusy(false);
    }
  }
  async function choose() {
    setError("");
    try {
      const path = await bridge.pickStorageFolder();
      if (path) await apply(path, false);
    } catch (cause) {
      setError(message(cause));
    }
  }
  const dialog = existing && (
    <Modal title="ใช้ข้อมูลที่มีอยู่?" onClose={() => setExisting(null)} busy={busy}>
      <p>
        พบข้อมูลเดิมที่ตำแหน่งนี้ ระบบจะไม่คัดลอกทับ — ใช้ข้อมูลนี้แทนข้อมูลปัจจุบันไหม?
      </p>
      <code className="path">{existing}</code>
      <div className="modal-actions">
        <button type="button" disabled={busy} onClick={() => setExisting(null)}>
          ยกเลิก
        </button>
        <button
          type="button"
          className="primary"
          disabled={busy}
          onClick={() => void apply(existing, true)}
        >
          ใช้ข้อมูลนี้
        </button>
      </div>
    </Modal>
  );
  return { busy, error, done, choose, dialog, setError, setBusy };
}

function RestartNotice() {
  return (
    <div className="storage-done" role="status">
      <span>ย้ายเสร็จแล้ว — กำลังรีสตาร์ทเพื่อใช้ตำแหน่งใหม่</span>
      <button className="primary" onClick={() => void bridge.restartApp()}>
        รีสตาร์ทเลย
      </button>
    </div>
  );
}

export function StoragePanel({ native }: { native: boolean }) {
  const [status, setStatus] = useState<StorageStatus | null>(null);
  const change = useStorageChange();
  useEffect(() => {
    if (!native) return;
    bridge
      .storageInfo()
      .then(setStatus)
      .catch((cause) => change.setError(message(cause)));
    // โหลดครั้งเดียวต่อการเปิดหน้า
  }, [native]);
  const info = status?.info;
  async function deletePrevious() {
    change.setBusy(true);
    change.setError("");
    try {
      await bridge.deletePreviousStorage();
      setStatus(await bridge.storageInfo());
    } catch (cause) {
      change.setError(message(cause));
    } finally {
      change.setBusy(false);
    }
  }
  return (
    <section className="tile span-12 storage-panel" aria-label="พื้นที่จัดเก็บ">
      {!native && <p className="hint">เปิด Astra Desktop เพื่อดูและเปลี่ยนที่จัดเก็บ</p>}
      {info && (
        <>
          <p>ข้อมูลของคุณ (โปรเจกต์ งาน ผลการรัน และ artifacts) เก็บอยู่ที่</p>
          <div className="storage-location">
            <code className="path">{info.dataDir}</code>
            <span className="chip" data-tone={info.mode === "network" ? "wait" : "ok"}>
              {info.mode === "network" ? "Network" : "Local"}
            </span>
          </div>
          <dl className="mini-metrics">
            <div>
              <dt>ขนาดข้อมูล</dt>
              <dd>{formatBytes(info.dbBytes)}</dd>
            </div>
            <div>
              <dt>พื้นที่ว่าง</dt>
              <dd>{formatBytes(info.freeBytes)}</dd>
            </div>
          </dl>
          {info.mode === "network" && (
            <p className="hint">
              ที่จัดเก็บบน File Sharing ใช้ได้ทีละเครื่อง — ถ้ามีเครื่องอื่นเปิดอยู่
              เครื่องนี้จะเปิดข้อมูลไม่ได้จนกว่าเครื่องนั้นจะปิดแอป
            </p>
          )}
        </>
      )}
      {change.done ? (
        <RestartNotice />
      ) : (
        <div className="storage-actions">
          <button
            className="primary"
            disabled={!native || change.busy}
            onClick={() => void change.choose()}
          >
            เปลี่ยนที่จัดเก็บ…
          </button>
          {info?.previous && (
            <button disabled={change.busy} onClick={() => void deletePrevious()}>
              ลบข้อมูลที่ตำแหน่งเดิม
            </button>
          )}
        </div>
      )}
      {info?.previous && !change.done && (
        <p className="hint">ตำแหน่งเดิม: {info.previous}</p>
      )}
      <p className="hint">
        ระบบคัดลอกข้อมูลไปที่ใหม่ ตรวจความครบถ้วน แล้วรีสตาร์ทแอปเองเพื่อใช้ตำแหน่งใหม่ ข้อมูลที่ตำแหน่งเดิมยังอยู่จนกว่าคุณจะลบ
      </p>
      {change.error && (
        <p role="alert" className="error">
          {change.error}
        </p>
      )}
      {change.dialog}
    </section>
  );
}

/** ตรวจที่จัดเก็บก่อนเปิดแอป: เปิดไม่ได้ → หน้ากู้คืน (browser preview ข้ามการตรวจ) */
export function StorageGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<StorageStatus | "checking" | "ok">(
    desktopAvailable() ? "checking" : "ok",
  );
  useEffect(() => {
    if (status !== "checking") return;
    bridge
      .storageInfo()
      .then((next) => setStatus(next.status === "error" ? next : "ok"))
      // ระบบเก่าที่ยังไม่มีคำสั่งนี้ หรือ error อื่น: ให้แอปแสดง error ตามปกติ
      .catch(() => setStatus("ok"));
  }, [status]);
  if (status === "checking") return null;
  if (status === "ok") return <>{children}</>;
  return <StorageRecovery status={status} />;
}

/** หน้าเต็มเมื่อเปิดที่จัดเก็บไม่ได้: ไม่สร้างฐานข้อมูลใหม่เอง */
export function StorageRecovery({ status }: { status: StorageStatus }) {
  const change = useStorageChange();
  const [busy, setBusy] = useState(false);
  async function revert() {
    setBusy(true);
    change.setError("");
    try {
      await bridge.revertStorage();
      await bridge.restartApp();
    } catch (cause) {
      change.setError(message(cause));
    } finally {
      setBusy(false);
    }
  }
  // ข้อความจาก InstanceLock::acquire ใน desktop-core/src/storage.rs
  const inUse = status.error?.includes("กำลังถูกใช้โดย") ?? false;
  return (
    <main className="storage-recovery">
      <h1>{inUse ? "ข้อมูลเปิดอยู่บนเครื่องอื่น" : "เข้าถึงพื้นที่จัดเก็บไม่ได้"}</h1>
      <p role="alert" className="error">
        {status.error}
      </p>
      <p className="hint">
        {inUse
          ? "ปิด Astra บนเครื่องนั้นก่อน แล้วกดลองใหม่ ที่จัดเก็บบน File Sharing เปิดได้ทีละเครื่อง"
          : "ตรวจว่าเชื่อมต่อ File Sharing หรือไดรฟ์ที่เก็บข้อมูลอยู่ แล้วกดลองใหม่"}{" "}
        หรือเลือกตำแหน่งอื่น ระบบจะไม่สร้างฐานข้อมูลใหม่โดยไม่ถามคุณ
      </p>
      {change.done ? (
        <RestartNotice />
      ) : (
        <div className="storage-actions">
          <button className="primary" disabled={busy} onClick={() => void bridge.restartApp()}>
            ลองใหม่
          </button>
          <button disabled={busy || change.busy} onClick={() => void change.choose()}>
            เลือก folder อื่น
          </button>
          {status.previous && (
            <button disabled={busy} onClick={() => void revert()}>
              กลับไปใช้ตำแหน่งเดิม
            </button>
          )}
        </div>
      )}
      {change.error && (
        <p role="alert" className="error">
          {change.error}
        </p>
      )}
      {change.dialog}
    </main>
  );
}
