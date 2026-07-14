import type { DeviceInfo, DeviceSource, SourceEventHandler } from "./types.js";
import { MockSource } from "./mock-source.js";

/**
 * Owns every DeviceSource and fans their events out to listeners (the WS hub).
 * Sources are pluggable — register one per connection type at startup.
 */
export class SourceManager {
  private sources: DeviceSource[] = [];
  private listeners = new Set<SourceEventHandler>();

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
    for (const s of this.sources) {
      if (s.remove?.(deviceId)) return true;
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
