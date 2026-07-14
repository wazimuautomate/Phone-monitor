import type { WebSocket, WebSocketServer } from "ws";
import type { SourceManager } from "./sources/source-manager.js";
import type { SourceEvent, VideoPacket } from "./sources/types.js";

export interface ServerInfo {
  appUrls: string[];
  tokenRequired: boolean;
}

/**
 * Browser <-> helper protocol.
 *   - Control messages are JSON (device list, stats, server-info, commands).
 *   - Video frames are binary: [type][idLen][deviceId][H.264 payload].
 */
export function attachHub(wss: WebSocketServer, sources: SourceManager, info: ServerInfo): void {
  wss.on("connection", (ws: WebSocket) => {
    send(ws, { type: "server-info", appUrls: info.appUrls, tokenRequired: info.tokenRequired });
    send(ws, { type: "devices", devices: sources.devices() });

    const off = sources.onEvent((event) => forward(ws, event));
    ws.on("close", off);
    ws.on("message", (raw) => {
      let msg: { type?: string; deviceId?: string } | undefined;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return; // ignore non-JSON frames
      }
      switch (msg?.type) {
        case "list":
          send(ws, { type: "devices", devices: sources.devices() });
          break;
        case "remove":
          if (typeof msg.deviceId === "string") sources.remove(msg.deviceId);
          break;
        case "mock-add":
          sources.addMockDevice();
          break;
        case "mock-remove":
          sources.removeMockDevice();
          break;
        // Phase 8: remote-control commands (tap/swipe/keys) will be handled here.
      }
    });
  });
}

function forward(ws: WebSocket, event: SourceEvent): void {
  switch (event.kind) {
    case "device":
      send(ws, { type: "device", device: event.info });
      break;
    case "removed":
      send(ws, { type: "removed", deviceId: event.deviceId });
      break;
    case "stats":
      send(ws, { type: "stats", deviceId: event.deviceId, patch: event.patch });
      break;
    case "video":
      sendVideo(ws, event.packet);
      break;
  }
}

function send(ws: WebSocket, msg: unknown): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

// Binary video frame to the browser: [type][idLen][deviceId][H.264 payload].
function sendVideo(ws: WebSocket, packet: VideoPacket): void {
  if (ws.readyState !== ws.OPEN) return;
  const idBytes = Buffer.from(packet.deviceId, "utf8");
  const typeByte = packet.type === "config" ? 0 : packet.type === "keyframe" ? 1 : 2;
  const header = Buffer.from([typeByte, idBytes.length]);
  ws.send(Buffer.concat([header, idBytes, Buffer.from(packet.data)]), { binary: true });
}
