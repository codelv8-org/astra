import { useState } from "react";
import { bridge } from "./bridge";

const storageKey = "crewnest-second-brain-vault";

/** ลิงก์เปิดโฟลเดอร์ vault ในแอป Obsidian (Obsidian ต้องติดตั้งในเครื่อง) */
export function obsidianUri(vault: string) {
  return `obsidian://open?path=${encodeURIComponent(vault)}`;
}

function readVault() {
  try {
    return localStorage.getItem(storageKey) ?? "";
  } catch {
    return "";
  }
}

// shortcut: เก็บพาธ vault ใน localStorage ของเครื่องนี้เท่านั้น — ย้ายไป Desktop Core เมื่อ agent ต้องใช้ vault
export function SecondBrainPanel({ native }: { native: boolean }) {
  const [saved, setSaved] = useState(readVault);
  const [draft, setDraft] = useState(saved);
  const [error, setError] = useState("");
  function save(value: string) {
    const vault = value.trim();
    try {
      if (vault) localStorage.setItem(storageKey, vault);
      else localStorage.removeItem(storageKey);
    } catch {
      // เก็บไม่ได้ (เช่น private mode) ยังใช้ได้จนปิดหน้า
    }
    setSaved(vault);
    setDraft(vault);
  }
  async function choose() {
    setError("");
    try {
      const path = await bridge.pickFolder();
      if (path) save(path);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }
  return (
    <section className="tile span-12 storage-panel" aria-label="Second Brain">
      <p>เชื่อมต่อ Second Brain ผ่าน Obsidian โดยระบุโฟลเดอร์ vault ของคุณ</p>
      <div className="storage-location">
        <code className="path">{saved || "ยังไม่ได้ตั้งค่า"}</code>
        <span className="chip" data-tone={saved ? "ok" : "wait"}>
          {saved ? "เชื่อมต่อแล้ว" : "ยังไม่เชื่อมต่อ"}
        </span>
      </div>
      <form
        className="storage-actions"
        onSubmit={(event) => {
          event.preventDefault();
          save(draft);
        }}
      >
        <label>
          โฟลเดอร์ vault
          <input
            value={draft}
            placeholder="เช่น X:\second-brain"
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>
        <button type="submit" disabled={draft.trim() === saved}>
          บันทึก
        </button>
        {native && (
          <button type="button" onClick={() => void choose()}>
            เลือก folder…
          </button>
        )}
        {saved && (
          <button
            type="button"
            className="primary"
            onClick={() => window.location.assign(obsidianUri(saved))}
          >
            เปิดใน Obsidian
          </button>
        )}
        {saved && (
          <button type="button" onClick={() => save("")}>
            ยกเลิกการเชื่อมต่อ
          </button>
        )}
      </form>
      <p className="hint">
        ปุ่ม "เปิดใน Obsidian" ต้องติดตั้ง Obsidian ในเครื่องนี้ และโฟลเดอร์ต้องเป็น vault
        ที่ Obsidian รู้จัก ค่านี้เก็บเฉพาะเครื่องนี้
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
