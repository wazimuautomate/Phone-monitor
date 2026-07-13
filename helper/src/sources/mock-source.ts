import type { ConnectionType, DeviceInfo, DeviceSource, SourceEventHandler, Tier } from "./types.js";

interface MockSpec {
  id: string;
  name: string;
  model: string;
  androidVersion: string;
  battery: number;
  connection: ConnectionType;
  tier: Tier;
}

// Mirrors the reference mockup so the dashboard looks right before real phones
// are connected. Mixed tiers/connections exercise the two-tier design in the UI.
const SPECS: MockSpec[] = [
  { id: "mock-1", name: "Device 1", model: "SM-G991B", androidVersion: "13", battery: 78, connection: "wifi-adb", tier: "control" },
  { id: "mock-2", name: "Device 2", model: "SM-A528B", androidVersion: "13", battery: 65, connection: "wifi-adb", tier: "control" },
  { id: "mock-3", name: "Device 3", model: "SM-A736B", androidVersion: "13", battery: 71, connection: "wifi-adb", tier: "control" },
  { id: "mock-4", name: "Device 4", model: "SM-S908B", androidVersion: "13", battery: 62, connection: "wifi-app", tier: "view" },
  { id: "mock-5", name: "Device 5", model: "SM-F721B", androidVersion: "13", battery: 80, connection: "wifi-app", tier: "view" },
  { id: "mock-6", name: "Device 6", model: "SM-M336B", androidVersion: "12", battery: 55, connection: "wifi-app", tier: "view" },
];

/**
 * A fake capture source: emits demo devices and jitters their stats every second
 * so the dashboard shows live movement without any hardware. Enabled by default
 * until real sources are wired; disable with MOCK=0.
 */
export class MockSource implements DeviceSource {
  readonly connection: ConnectionType = "wifi-app"; // nominal; each device carries its own
  private readonly devicesById = new Map<string, DeviceInfo>();
  private timer?: ReturnType<typeof setInterval>;

  async start(emit: SourceEventHandler): Promise<void> {
    const now = Date.now();
    for (const spec of SPECS) {
      const info: DeviceInfo = {
        ...spec,
        status: "online",
        charging: spec.battery < 70,
        fps: 30,
        lastUpdate: now,
      };
      this.devicesById.set(info.id, info);
      emit({ kind: "device", info });
    }

    let tick = 0;
    this.timer = setInterval(() => {
      tick++;
      for (const info of this.devicesById.values()) {
        // deterministic gentle jitter (no RNG needed)
        const fps = 28 + Math.round(Math.abs(Math.sin(tick / 3 + (info.battery ?? 0))) * 4);
        const battery = info.charging
          ? Math.min(100, (info.battery ?? 0) + (tick % 20 === 0 ? 1 : 0))
          : Math.max(1, (info.battery ?? 0) - (tick % 30 === 0 ? 1 : 0));
        info.fps = fps;
        info.battery = battery;
        info.lastUpdate = Date.now();
        emit({ kind: "stats", deviceId: info.id, patch: { fps, battery, lastUpdate: info.lastUpdate } });
      }
    }, 1000);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.devicesById.clear();
  }

  list(): DeviceInfo[] {
    return [...this.devicesById.values()];
  }
}
