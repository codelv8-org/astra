/* เครื่องหมาย Astra: ดาวกลางหนึ่งดวง กับลูกเรือห้าคนบนวงโคจร (สีประจำ agent) */
const crew = [
  ["var(--c-astra)", 0],
  ["var(--c-forge)", 72],
  ["var(--c-mira)", 144],
  ["var(--c-vector)", 216],
  ["var(--c-scout)", 288],
] as const;

export function AstraMark({ size = 30 }: { size?: number }) {
  return (
    <svg
      className="astra-mark"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <ellipse
        cx="16"
        cy="16"
        rx="12.5"
        ry="12.5"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.28"
        strokeWidth="1.2"
      />
      <path
        d="M16 9.2l1.9 4.9 4.9 1.9-4.9 1.9-1.9 4.9-1.9-4.9-4.9-1.9 4.9-1.9z"
        fill="currentColor"
      />
      {crew.map(([color, angle]) => {
        const rad = ((angle - 90) * Math.PI) / 180;
        return (
          <circle
            key={angle}
            cx={16 + 12.5 * Math.cos(rad)}
            cy={16 + 12.5 * Math.sin(rad)}
            r="2.3"
            fill={color}
          />
        );
      })}
    </svg>
  );
}

/* ไอคอนสลับธีม: วงแสงเมื่อเป็นธีมมืด (กดเพื่อสว่าง) และจันทร์เสี้ยวเมื่อสว่าง */
export function ThemeGlyph({ theme }: { theme: string }) {
  return theme === "dark" ? (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4.2" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" />
      </g>
    </svg>
  ) : (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M20 14.6A8.3 8.3 0 0 1 9.4 4a8.3 8.3 0 1 0 10.6 10.6z"
        fill="currentColor"
      />
    </svg>
  );
}
