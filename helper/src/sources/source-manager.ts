import type {
  DeviceInfo,
  DeviceSource,
  SourceEventHandler,
} from "./types.js";

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
}
