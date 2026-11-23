/* ไอคอนเส้นของ Astra (stroke 1.5 บน 24×24) วาดใหม่เอง ไม่ได้คัดลอกชุดไอคอนภายนอก */
import type { ReactNode } from "react";

const paths = {
  map: (
    <>
      <path d="M9 4.5 3.75 6.75v12.75L9 17.25l6 2.25 5.25-2.25V4.5L15 6.75z" />
      <path d="M9 4.5v12.75M15 6.75V19.5" />
    </>
  ),
  chat: (
    <path d="M4.5 6.75A2.25 2.25 0 0 1 6.75 4.5h10.5a2.25 2.25 0 0 1 2.25 2.25v7.5a2.25 2.25 0 0 1-2.25 2.25H10.5L6 19.5v-3H6.75" />
  ),
  grid: (
    <>
      <rect x="4.5" y="4.5" width="6" height="6" rx="1.5" />
      <rect x="13.5" y="4.5" width="6" height="6" rx="1.5" />
      <rect x="4.5" y="13.5" width="6" height="6" rx="1.5" />
      <rect x="13.5" y="13.5" width="6" height="6" rx="1.5" />
    </>
  ),
  queue: (
    <>
      <path d="M10.5 6.75h9M10.5 12h9M10.5 17.25h9" />
      <path d="m4.5 6.75 1.25 1.25L8 5.75M4.5 12l1.25 1.25L8 11" />
      <circle cx="6" cy="17.25" r="1.25" />
    </>
  ),
  folder: (
    <path d="M3.75 7.5A2.25 2.25 0 0 1 6 5.25h3.4l2.1 2.25H18a2.25 2.25 0 0 1 2.25 2.25v6.75A2.25 2.25 0 0 1 18 18.75H6a2.25 2.25 0 0 1-2.25-2.25z" />
  ),
  activity: <path d="M3.75 12h3.5l2.5-6 4.5 12 2.5-6h3.5" />,
  users: (
    <>
      <circle cx="9" cy="8.25" r="3" />
      <path d="M3.75 19.5a5.25 5.25 0 0 1 10.5 0" />
      <path d="M15.75 5.4a3 3 0 0 1 0 5.7M17.25 14.6a5.25 5.25 0 0 1 3 4.9" />
    </>
  ),
  plug: (
    <>
      <path d="M9 3.75V7.5M15 3.75V7.5" />
      <path d="M6.75 7.5h10.5v2.25a5.25 5.25 0 0 1-10.5 0z" />
      <path d="M12 15v5.25" />
    </>
  ),
  remote: (
    <>
      <circle cx="12" cy="12" r="1.75" />
      <path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M5.75 5.75a8.85 8.85 0 0 0 0 12.5M18.25 5.75a8.85 8.85 0 0 1 0 12.5" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="3.75" />
      <path d="M12 3v1.5M12 19.5V21M3 12h1.5M19.5 12H21M5.6 5.6l1.1 1.1M17.3 17.3l1.1 1.1M5.6 18.4l1.1-1.1M17.3 6.7l1.1-1.1" />
    </>
  ),
  moon: <path d="M19.5 14.25A7.5 7.5 0 0 1 9.75 4.5a7.5 7.5 0 1 0 9.75 9.75z" />,
  route: (
    <>
      <circle cx="6.75" cy="17.25" r="2.25" />
      <circle cx="17.25" cy="6.75" r="2.25" />
      <path d="M9 17.25h6a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="6" rx="7.5" ry="3" />
      <path d="M4.5 6v12c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3V6" />
      <path d="M4.5 12c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3" />
    </>
  ),
  layers: (
    <>
      <path d="m12 4.5 8.25 4.5L12 13.5 3.75 9z" />
      <path d="m3.75 12.75 8.25 4.5 8.25-4.5" />
      <path d="m3.75 16.25 8.25 4.5 8.25-4.5" />
    </>
  ),
  pen: (
    <>
      <path d="m15.75 4.5 3.75 3.75L9 18.75H5.25V15z" />
      <path d="m13.5 6.75 3.75 3.75" />
    </>
  ),
  code: (
    <>
      <path d="m8.25 7.5-4.5 4.5 4.5 4.5M15.75 7.5l4.5 4.5-4.5 4.5" />
      <path d="m13.5 5.25-3 13.5" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.75 5.25 6.375v5.25c0 4.125 2.85 7.35 6.75 8.625 3.9-1.275 6.75-4.5 6.75-8.625v-5.25z" />
      <path d="m9.25 12 2 2 3.5-3.75" />
    </>
  ),
  book: (
    <>
      <path d="M5.25 5.25A1.5 1.5 0 0 1 6.75 3.75H18.75v13.5H6.75a1.5 1.5 0 0 0-1.5 1.5z" />
      <path d="M5.25 18.75a1.5 1.5 0 0 0 1.5 1.5h12v-3M9 7.5h6" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8.25" r="3.75" />
      <path d="M4.5 20.25a7.5 7.5 0 0 1 15 0" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof paths;

export function Icon({
  name,
  size = 22,
  className = "rail-icon",
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}
