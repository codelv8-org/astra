import { useEffect, useId, useRef, type ReactNode } from "react";

export function Modal({
  title,
  children,
  onClose,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => {
      dialog.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) close.current();
      }}
    >
      <header className="modal-header">
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          aria-label="ปิดหน้าต่าง"
        >
          ×
        </button>
      </header>
      {children}
    </dialog>
  );
}
