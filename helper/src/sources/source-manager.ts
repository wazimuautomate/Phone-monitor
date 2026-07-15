import type { ControlCmd, DeviceInfo, DeviceSource, SourceEventHandler } from "./types.js";
import { MockSource } from "./mock-source.js";
import { RelaySource } from "./relay-source.js";

/**
 * Owns every DeviceSource and fans their events out to listeners (the WS hub).
 * Sources are pluggable — register one per connection type at startup.
 */
export class SourceManager {
  private sources: DeviceSource[] = [];
  private listeners = new Set<SourceEventHandler>();
  private relays = new Map<string, RelaySource>(); // remote phones, keyed by pairing code

  register(source: DeviceSource): this {
    this.sources.push(source);
    return this;
  }

  onEvent(handler: SourceEventHandler): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  private readonly emit: SourceEventHandler = (event) => {
    for (const listener of this.listeners) listener(event);
  };

  async start(): Promise<void> {
    await Promise.all(this.sources.map((s) => s.start(this.emit)));
  }

  async stop(): Promise<void> {
    await Promise.all(this.sources.map((s) => s.stop()));
  }

  devices(): DeviceInfo[] {
    return this.sources.flatMap((s) => s.list());
  }

  /** Remove/disconnect a device, whichever source owns it. */
  remove(deviceId: string): boolean {
    // A remote (relay) tile: "remove" means stop watching that pairing code.
    if (deviceId.startsWith("relay-")) {
      const code = deviceId.slice("relay-".length);
      if (this.relays.has(code)) {
        this.removeRelay(code);
        return true;
      }
    }
    for (const s of this.sources) {
      if (s.remove?.(deviceId)) return true;
    }
    return false;
  }

  // ---- Remote (relay) connections ----

  /** Start watching a remote phone by pairing code, via the relay. Idempotent. */
  async addRelay(relayUrl: string, code: string, token?: string): Promise<void> {
    if (this.relays.has(code)) return;
    const source = new RelaySource(relayUrl, code, token);
    this.relays.set(code, source);
    this.sources.push(source);
    await source.start(this.emit);
  }

  /** Stop watching a remote phone and disconnect its relay viewer socket. */
  removeRelay(code: string): void {
    const source = this.relays.get(code);
    if (!source) return;
    this.relays.delete(code);
    this.sources = this.sources.filter((s) => s !== source);
    void source.stop();
  }

  /** Pairing codes currently connected via the relay. */
  relayCodes(): string[] {
    return [...this.relays.keys()];
  }

  /** Route a remote-control command to whichever source owns the device. */
  sendControl(deviceId: string, cmd: ControlCmd): boolean {
    for (const s of this.sources) {
      if (s.sendControl?.(deviceId, cmd)) return true;
    }
    return false;
  }

  addMockDevice(): void {
    this.mockSource()?.addDevice();
  }

  removeMockDevice(): void {
    this.mockSource()?.removeLast();
  }

  private mockSource(): MockSource | undefined {
    return this.sources.find((s): s is MockSource => s instanceof MockSource);
  }
}
