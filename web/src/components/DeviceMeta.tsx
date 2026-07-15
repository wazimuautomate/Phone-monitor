// Small shared read-outs so a phone's signal/battery look identical on the
// monitor card, the devices list and the control room.
import { BatteryIcon, SignalBars } from "../lib/icons";

export function batteryClass(level?: number): string {
  if (level === undefined) return "";
  if (level <= 20) return "low";
  if (level <= 45) return "mid";
  return "ok";
}

export function Signal({ level, className }: { level?: number; className?: string }) {
  return (
    <span
      title={typeof level === "number" ? `Signal ${level}/4` : "Signal not reported by this phone"}
      style={{ display: "inline-flex" }}
    >
      <SignalBars level={level} className={className ?? "sig"} />
    </span>
  );
}

export function Battery({
  level,
  charging,
  className,
  showText = true,
}: {
  level?: number;
  charging?: boolean;
  className?: string;
  showText?: boolean;
}) {
  return (
    <span className={`batwrap ${batteryClass(level)}`} title={charging ? "Charging" : "Battery"}>
      <BatteryIcon level={level} charging={charging} className={className ?? "bat"} />
      {showText && <span>{level === undefined ? "—" : `${level}%`}</span>}
    </span>
  );
}
