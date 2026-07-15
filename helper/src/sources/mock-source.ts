import type {
  ConnectionType,
  DeviceInfo,
  DeviceSource,
  NetworkType,
  SourceEventHandler,
  Tier,
} from "./types.js";

interface MockSpec {
  model: string;
  androidVersion: string;
  battery: number;
  connection: ConnectionType;
  tier: Tier;
  signal: number;
  network: NetworkType;
}

// Mirrors the reference mockup; also used as a pool when adding demo devices.
const SPECS: MockSpec[] = [
  { model: "SM-G991B", androidVersion: "13", battery: 78, connection: "wifi-app", tier: "view", signal: 4, network: "wifi" },
  { model: "SM-A528B", androidVersion: "13", battery: 65, connection: "wifi-app", tier: "view", signal: 3, network: "wifi" },
  { model: "SM-A736B", androidVersion: "13", battery: 71, connection: "wifi-app", tier: "view", signal: 2, network: "cell" },
  { model: "SM-S908B", androidVersion: "13", battery: 62, connection: "wifi-app", tier: "view", signal: 4, network: "wifi" },
  { model: "SM-F721B", androidVersion: "13", battery: 80, connection: "wifi-app", tier: "view", signal: 3, network: "cell" },
  { model: "SM-M336B", androidVersion: "12", battery: 55, connection: "wifi-app", tier: "view", signal: 1, network: "cell" },
];

/**
 * A fake capture source: emits demo devices and jitters their stats every second
 * so the dashboard shows live movement without hardware.
 *
 * This source is ALWAYS registered, even when nothing is seeded — otherwise
 * "Add a demo phone" has no source to add to and silently does nothing.
 * `seed` only decides whether it starts with devices already in it.
 */
export class MockSource implements DeviceSource {
  /** @param seed start with the demo set already present (dev / MOCK=1). */
  constructor(private readonly seed: boolean = false) {}

  readonly connection: ConnectionType = "wifi-app";
  private readonly devicesById = new Map<string, DeviceInfo>();
  private readonly baseSignal = new Map<string, number>();
  private emit?: SourceEventHandler;
  private timer?: ReturnType<typeof setInterval>;
  private seq = 0;

  async start(emit: SourceEventHandler): Promise<void> {
    this.emit = emit;
    if (this.seed) for (const spec of SPECS) this.spawn(spec);

    let tick = 0;
    this.timer = setInterval(() => {
      tick++;
      for (const info of this.devicesById.values()) {
        const fps = 28 + Math.round(Math.abs(Math.sin(tick / 3 + (info.battery ?? 0))) * 4);
        const battery = info.charging
          ? Math.min(100, (info.battery ?? 0) + (tick % 20 === 0 ? 1 : 0))
          : Math.max(1, (info.battery ?? 0) - (tick % 30 === 0 ? 1 : 0));
        // Drift the bars around the device's baseline so the signal UI is alive.
        const base = this.baseSignal.get(info.id) ?? 3;
        const signal = Math.max(1, Math.min(4, base + (Math.sin(tick / 7 + base) > 0.8 ? -1 : 0)));
        info.fps = fps;
        info.battery = battery;
        info.signal = signal;
        info.lastUpdate = Date.now();
        this.emit?.({
          kind: "stats",
          deviceId: info.id,
          patch: { fps, battery, signal, lastUpdate: info.lastUpdate },
        });
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
    this.baseSignal.delete(id);
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
      name: `Demo phone ${this.seq}`,
      model: spec.model,
      androidVersion: spec.androidVersion,
      battery: spec.battery,
      charging: spec.battery < 70,
      signal: spec.signal,
      network: spec.network,
      tier: spec.tier,
      connection: spec.connection,
      status: "online",
      fps: 30,
      // A typical phone screen, so the demo tiles and the control room use the
      // same aspect ratio as a real device.
      width: 1080,
      height: 2400,
      controllable: true,
      canRotate: true,
      lastUpdate: Date.now(),
    };
    this.devicesById.set(id, info);
    this.baseSignal.set(id, spec.signal);
    this.emit?.({ kind: "device", info });
  }

  list(): DeviceInfo[] {
    return [...this.devicesById.values()];
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.devicesById.clear();
    this.baseSignal.clear();
  }
}
