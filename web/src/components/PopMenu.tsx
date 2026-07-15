import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconDots } from "../lib/icons";

export interface MenuItem {
  label: string;
  icon: (p: { className?: string }) => JSX.Element;
  onSelect: () => void;
  danger?: boolean;
}

const MENU_W = 158;

/**
 * A 3-dot menu that renders into <body> at fixed coordinates.
 *
 * It has to escape its container: these live inside the sidebar's scrolling
 * device list, and an absolutely-positioned menu would be clipped by it.
 */
export function PopMenu({ items, label = "Options" }: { items: MenuItem[]; label?: string }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.max(8, Math.min(r.right - MENU_W, window.innerWidth - MENU_W - 8));
    const height = items.length * 36 + 10;
    // Flip above the button when there isn't room below.
    const below = r.bottom + 6;
    const top = below + height > window.innerHeight - 8 ? Math.max(8, r.top - height - 6) : below;
    setPos({ top, left });
  };

  useLayoutEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    // Any scroll or resize invalidates the anchor, so just close.
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [pos]);

  useEffect(() => {
    if (!pos) return;
    const onDown = (e: MouseEvent) => {
      if (!btnRef.current?.contains(e.target as Node)) setPos(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [pos]);

  return (
    <>
      <button
        ref={btnRef}
        className="dots-btn"
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          pos ? setPos(null) : place();
        }}
      >
        <IconDots />
      </button>
      {pos &&
        createPortal(
          <div
            className="menu menu-fixed"
            style={{ top: pos.top, left: pos.left, width: MENU_W }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {items.map((it) => (
              <button
                key={it.label}
                className={it.danger ? "danger" : undefined}
                onClick={() => {
                  setPos(null);
                  it.onSelect();
                }}
              >
                <it.icon />
                {it.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
