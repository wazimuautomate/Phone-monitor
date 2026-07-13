import { useEffect, useState } from "react";
import type { Device } from "../types";

/**
 * Renders a phone's screen.
 * Phase 1+: when a live H.264 track exists for this device, it is decoded via
 * WebCodecs and drawn to a <canvas> here. Until capture is wired, we show a
 * synthetic screen so the dashboard layout matches the real product.
 */
export function PhoneScreen({ device }: { device: Device }) {
  return (
    <div className="screen">
      <MockScreen device={device} />
      <span className="fps-badge">{device.fps ?? 0} fps</span>
    </div>
  );
}

function MockScreen({ device }: { device: Device }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const date = now.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const hue = (device.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0) * 37) % 360;

  return (
    <div
      className="mock-screen"
      style={{
        background: `linear-gradient(160deg, hsl(${hue} 45% 24%), hsl(${(hue + 40) % 360} 55% 12%))`,
      }}
    >
      <div className="mock-statusbar">
        <span>{hh}:{mm}</span>
        <span className="mock-icons">▮▮▮</span>
      </div>
      <div className="mock-clock">
        <div className="mock-time">{hh}:{mm}</div>
        <div className="mock-date">{date}</div>
      </div>
      <div className="mock-badge">
        demo screen · {device.tier === "view" ? "Tier 2 · view only" : "Tier 1 · control"}
      </div>
    </div>
  );
}
