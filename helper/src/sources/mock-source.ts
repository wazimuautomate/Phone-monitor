import type { ConnectionType, DeviceInfo, DeviceSource, SourceEventHandler, Tier } from "./types.js";

interface MockSpec {
  model: string;
  androidVersion: string;
  battery: number;
  connection: ConnectionType;
  tier: Tier;
}

// Mirrors the reference mockup; also used as a pool when adding demo devices.
const SPECS: MockSpec[] = [
  { model: "SM-G991B", androidVersion: "13", battery: 78, connection: "wifi-adb", tier: "control" },
  { model: "SM-A528B", androidVersion: "13", battery: 65, connection: "wifi-adb", tier: "control" },
  { model: "SM-A736B", androidVersion: "13", battery: 71, connection: "wifi-adb", tier: "control" },
  { model: "SM-S908B", androidVersion: "13", battery: 62, connection: "wifi-app", tier: "view" },
  { model: "SM-F721B", androidVersion: "13", battery: 80, connection: "wifi-app", tier: "view" },
  { model: "SM-M336B", androidVersion: "12", battery: 55, connection: "wifi-app", tier: "view" },
];

/**
 * A fake capture source: emits demo devices and jitters their stats every second
 * so the dashboard shows live movement without hardware. Supports add/remove so
 * the Settings drawer can grow/shrink the demo set. Disable entirely with MOCK=0.
 */
export class MockSource implements DeviceSource {
  readonly connection: ConnectionType = "wifi-app";
  private readonly devicesById = new Map<string, DeviceInfo>();
  private emit?: SourceEventHandler;
  private timer?: ReturnType<typeof setInterval>;
  private seq = 0;

  async start(emit: SourceEventHandler): Promise<void> {
    this.emit = emit;
    for (const spec of SPECS) this.spawn(spec);

    let tick = 0;
    this.timer = setInterval(() => {
      tick++;
      for (const info of this.devicesById.values()) {
        const fps = 28 + Math.round(Math.abs(Math.sin(tick / 3 + (info.battery ?? 0))) * 4);
        const battery = info.charging
          ? Math.min(100, (info.battery ?? 0) + (tick % 20 === 0 ? 1 : 0))
          : Math.max(1, (info.battery ?? 0) - (tick % 30 === 0 ? 1 : 0));
        info.fps = fps;
        info.battery = battery;
        info.lastUpdate = Date.now();
        this.emit?.({ kind: "stats", deviceId: info.id, patch: { fps, battery, lastUpdate: info.lastUpdate } });
      }
    }, 1000);
  }

  addDevice(): void {
    this.spawn(SPECS[this.seq % SPECS.length]);
  }

  removeLast(): void {
    const ids = [...this.devicesById.keys()];
    const last = ids[ids.length - 1];
    if (last) this.remove(last);
  }

  remove(id: string): boolean {
    if (this.devicesById.delete(id)) {
      this.emit?.({ kind: "removed", deviceId: id, reason: "user" });
      return true;
    }
    return false;
  }

  private spawn(spec: MockSpec): void {
    this.seq++;
    const id = `mock-${this.seq}`;
    const info: DeviceInfo = {
      id,
      name: `Device ${this.seq}`,
      model: spec.model,
      androidVersion: spec.androidVersion,
      battery: spec.battery,
      charging: spec.battery < 70,
      tier: spec.tier,
      connection: spec.connection,
      status: "online",
      fps: 30,
      lastUpdate: Date.now(),
    };
    this.devicesById.set(id, info);
    this.emit?.({ kind: "device", info });
  }

  list(): DeviceInfo[] {
    return [...this.devicesById.values()];
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.devicesById.clear();
  }
}
