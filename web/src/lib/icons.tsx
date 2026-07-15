// Line icons (Lucide-style: 24px box, 2px stroke, round joins) drawn with
// currentColor so they inherit whatever the surrounding text colour is.
import type { ReactNode } from "react";

interface P {
  className?: string;
}

function S({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** Brand mark: the app icon itself, the same artwork the phone app and the .exe use. */
export function Logo({ className }: P) {
  return <img src="/logo.png" className={className} alt="" aria-hidden="true" />;
}

// ---- Sidebar / navigation ----

export const IconMonitor = ({ className }: P) => (
  <S className={className}>
    <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
  </S>
);

export const IconHistory = ({ className }: P) => (
  <S className={className}>
    <circle cx="12" cy="12" r="9" />
    <polyline points="12 7 12 12 15.5 14" />
  </S>
);

export const IconSettings = ({ className }: P) => (
  <S className={className}>
    <line x1="4" y1="8" x2="20" y2="8" />
    <line x1="4" y1="16" x2="20" y2="16" />
    <circle cx="9" cy="8" r="2.5" />
    <circle cx="15" cy="16" r="2.5" />
  </S>
);

export const IconDevices = ({ className }: P) => (
  <S className={className}>
    <rect x="3" y="4" width="10" height="16" rx="2" />
    <rect x="15" y="9" width="6" height="11" rx="1.5" />
    <line x1="6.5" y1="17" x2="9.5" y2="17" />
  </S>
);

// ---- Header ----

export const IconSearch = ({ className }: P) => (
  <S className={className}>
    <circle cx="11" cy="11" r="7" />
    <line x1="16.5" y1="16.5" x2="21" y2="21" />
  </S>
);

export const IconRefresh = ({ className }: P) => (
  <S className={className}>
    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
    <path d="M16 16h5v5" />
  </S>
);

export const IconExpand = ({ className }: P) => (
  <S className={className}>
    <path d="M8 3H5a2 2 0 0 0-2 2v3" />
    <path d="M16 3h3a2 2 0 0 1 2 2v3" />
    <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
    <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
  </S>
);

export const IconShrink = ({ className }: P) => (
  <S className={className}>
    <path d="M3 8h3a2 2 0 0 0 2-2V3" />
    <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
    <path d="M3 16h3a2 2 0 0 1 2 2v3" />
    <path d="M21 16h-3a2 2 0 0 0-2 2v3" />
  </S>
);

export const IconSliders = ({ className }: P) => (
  <S className={className}>
    <line x1="5" y1="21" x2="5" y2="14" />
    <line x1="5" y1="10" x2="5" y2="3" />
    <line x1="12" y1="21" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12" y2="3" />
    <line x1="19" y1="21" x2="19" y2="16" />
    <line x1="19" y1="12" x2="19" y2="3" />
    <line x1="2.5" y1="12" x2="7.5" y2="12" />
    <line x1="9.5" y1="10" x2="14.5" y2="10" />
    <line x1="16.5" y1="14" x2="21.5" y2="14" />
  </S>
);

export const IconSun = ({ className }: P) => (
  <S className={className}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </S>
);

export const IconMoon = ({ className }: P) => (
  <S className={className}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </S>
);

export const IconSystem = ({ className }: P) => (
  <S className={className}>
    <rect x="2" y="4" width="20" height="13" rx="2" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
  </S>
);

// ---- Cards / devices ----

export const IconPen = ({ className }: P) => (
  <S className={className}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
  </S>
);

export const IconPointer = ({ className }: P) => (
  <S className={className}>
    <path d="M5 3l14 8.5-6.2 1.6-2.4 6z" />
  </S>
);

export const IconDots = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
    <circle cx="12" cy="5" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="12" cy="19" r="1.8" />
  </svg>
);

export const IconEyeOff = ({ className }: P) => (
  <S className={className}>
    <path d="M9.9 5.1A9.5 9.5 0 0 1 12 5c5 0 9 4.5 9 7a11 11 0 0 1-2.3 3.4M6.2 6.2C3.9 7.7 3 10.2 3 12c0 2.5 4 7 9 7 1.8 0 3.4-.6 4.7-1.4" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    <line x1="3" y1="3" x2="21" y2="21" />
  </S>
);

export const IconEye = ({ className }: P) => (
  <S className={className}>
    <path d="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7z" />
    <circle cx="12" cy="12" r="3" />
  </S>
);

export const IconTrash = ({ className }: P) => (
  <S className={className}>
    <path d="M3 6h18" />
    <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
    <path d="M6 6l1 14a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-14" />
  </S>
);

export const IconPhone = ({ className }: P) => (
  <S className={className}>
    <rect x="6" y="2" width="12" height="20" rx="2.5" />
    <line x1="10.5" y1="18.5" x2="13.5" y2="18.5" />
  </S>
);



// ---- Control room ----

export const IconBack = ({ className }: P) => (
  <S className={className}>
    <line x1="20" y1="12" x2="5" y2="12" />
    <polyline points="11 18 5 12 11 6" />
  </S>
);

export const IconHome = ({ className }: P) => (
  <S className={className}>
    <path d="M3 11l9-8 9 8" />
    <path d="M5.5 9.5V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5" />
  </S>
);

export const IconRecents = ({ className }: P) => (
  <S className={className}>
    <rect x="4" y="4" width="16" height="16" rx="2.5" />
  </S>
);

export const IconBell = ({ className }: P) => (
  <S className={className}>
    <path d="M18 8a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6" />
    <path d="M10.5 20a2 2 0 0 0 3 0" />
  </S>
);

export const IconVolumeUp = ({ className }: P) => (
  <S className={className}>
    <path d="M11 5L6.5 9H3v6h3.5L11 19z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7" />
    <path d="M18.5 5.5a9 9 0 0 1 0 13" />
  </S>
);

export const IconVolumeDown = ({ className }: P) => (
  <S className={className}>
    <path d="M11 5L6.5 9H3v6h3.5L11 19z" />
    <line x1="16" y1="10" x2="21" y2="14" />
    <line x1="21" y1="10" x2="16" y2="14" />
  </S>
);

export const IconPower = ({ className }: P) => (
  <S className={className}>
    <path d="M12 3v9" />
    <path d="M18.4 6.6a9 9 0 1 1-12.8 0" />
  </S>
);

export const IconLock = ({ className }: P) => (
  <S className={className}>
    <rect x="4" y="10" width="16" height="11" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </S>
);

export const IconRotate = ({ className }: P) => (
  <S className={className}>
    <path d="M20.5 12a8.5 8.5 0 0 1-8.5 8.5" />
    <path d="M3.5 12A8.5 8.5 0 0 1 12 3.5" />
    <polyline points="12 1 12 6 8.5 3.5" />
    <polyline points="12 23 12 18 15.5 20.5" />
  </S>
);

export const IconCamera = ({ className }: P) => (
  <S className={className}>
    <path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <circle cx="12" cy="13" r="3.5" />
  </S>
);

export const IconRecord = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
    <circle cx="12" cy="12" r="4.5" fill="currentColor" />
  </svg>
);

export const IconStop = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
    <rect x="8.5" y="8.5" width="7" height="7" rx="1.5" fill="currentColor" />
  </svg>
);

export const IconClose = ({ className }: P) => (
  <S className={className}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </S>
);

export const IconPlus = ({ className }: P) => (
  <S className={className}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </S>
);

export const IconMinus = ({ className }: P) => (
  <S className={className}>
    <line x1="5" y1="12" x2="19" y2="12" />
  </S>
);

export const IconLeave = ({ className }: P) => (
  <S className={className}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </S>
);

// ---- Status bar / misc ----

export const IconLink = ({ className }: P) => (
  <S className={className}>
    <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5" />
    <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7L12 19" />
  </S>
);

export const IconCopy = ({ className }: P) => (
  <S className={className}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
  </S>
);

export const IconHelp = ({ className }: P) => (
  <S className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.6 9.2a2.5 2.5 0 0 1 4.9.8c0 1.7-2.5 2.5-2.5 2.5" />
    <circle cx="12" cy="17" r="0.7" fill="currentColor" />
  </S>
);

export const IconFolder = ({ className }: P) => (
  <S className={className}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </S>
);

export const IconChevronLeft = ({ className }: P) => (
  <S className={className}>
    <polyline points="15 5 8 12 15 19" />
  </S>
);

export const IconChevronRight = ({ className }: P) => (
  <S className={className}>
    <polyline points="9 5 16 12 9 19" />
  </S>
);


export const IconCheck = ({ className }: P) => (
  <S className={className}>
    <polyline points="4 12.5 9.5 18 20 6.5" />
  </S>
);


// ---- Data-driven indicators ----

/**
 * Signal bars. `level` is 0..4; `undefined` means the phone never reported it,
 * which we show as flat muted bars rather than an alarming zero.
 */
export function SignalBars({ level, className }: { level?: number; className?: string }) {
  const known = typeof level === "number";
  return (
    <svg viewBox="0 0 18 14" className={className} aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <rect
          key={i}
          x={i * 4.6}
          y={11 - i * 3}
          width="3"
          height={3 + i * 3}
          rx="1"
          fill="currentColor"
          opacity={known && i < (level as number) ? 1 : 0.22}
        />
      ))}
    </svg>
  );
}

/** Battery with a proportional fill, plus a bolt while charging. */
export function BatteryIcon({
  level,
  charging,
  className,
}: {
  level?: number;
  charging?: boolean;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, level ?? 0));
  const w = (pct / 100) * 13.5;
  return (
    <svg viewBox="0 0 26 14" className={className} aria-hidden="true">
      <rect
        x="0.75"
        y="0.75"
        width="20.5"
        height="12.5"
        rx="3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.55"
      />
      <path d="M23 5v4a2.6 2.6 0 0 0 0-4z" fill="currentColor" opacity="0.55" />
      {typeof level === "number" && <rect x="3.2" y="3.2" width={w} height="7.6" rx="1.4" fill="currentColor" />}
      {charging && (
        <path
          d="M12.4 2.4L8.2 8h3.1l-0.7 4.2L15 6.4h-3.2z"
          fill="currentColor"
          stroke="var(--card)"
          strokeWidth="0.9"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
