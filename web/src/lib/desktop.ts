// The native capabilities the Electron shell adds, behind one interface.
//
// The same renderer also runs in a plain browser (the web build), where these
// features either fall back to a web API or simply aren't available. Everything
// here is therefore optional and degrades instead of throwing.

export type UpdateInfo =
  | { status: "not-configured" }
  | { status: "up-to-date"; version: string }
  | { status: "available"; version: string; notes: string; exe: string; assetUrl: string }
  | { status: "error"; reason: string };

interface DesktopBridge {
  isDesktop: true;
  platform: string;
  electron: string;
  appVersion(): Promise<string>;
  defaultPaths(): Promise<{ screenshots: string; recordings: string }>;
  keepAwake(on: boolean): Promise<boolean>;
  pickFolder(current?: string): Promise<string | null>;
  saveCapture(dir: string, name: string, data: ArrayBuffer): Promise<string>;
  openPath(target: string): Promise<boolean>;
  setFullScreen(on: boolean): Promise<boolean>;
  isFullScreen(): Promise<boolean>;
  onFullScreenChanged(cb: (on: boolean) => void): () => void;
  checkForUpdate(): Promise<UpdateInfo>;
  installUpdate(assetUrl: string, exe: string): Promise<boolean>;
  onUpdateAvailable(cb: (info: UpdateInfo) => void): () => void;
}

function bridge(): DesktopBridge | undefined {
  return (window as unknown as { desktop?: DesktopBridge }).desktop;
}

export const isDesktop = (): boolean => !!bridge()?.isDesktop;

/** App version for the sidebar footer. Falls back to the web build's label. */
export async function appVersion(): Promise<string> {
  const d = bridge();
  if (!d) return "web";
  try {
    return await d.appVersion();
  } catch {
    return "—";
  }
}

export async function defaultCapturePaths(): Promise<{ screenshots: string; recordings: string }> {
  const d = bridge();
  if (!d) return { screenshots: "", recordings: "" };
  try {
    return await d.defaultPaths();
  } catch {
    return { screenshots: "", recordings: "" };
  }
}

/**
 * Keep the display from sleeping. Electron blocks display sleep outright; in a
 * browser we can only ask for a Screen Wake Lock, which the OS may still ignore.
 */
let wakeLock: { release(): Promise<void> } | null = null;
export async function setKeepAwake(on: boolean): Promise<boolean> {
  const d = bridge();
  if (d) {
    try {
      return await d.keepAwake(on);
    } catch {
      return false;
    }
  }
  // Browser fallback.
  try {
    const nav = navigator as unknown as {
      wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> };
    };
    if (on) {
      if (!wakeLock && nav.wakeLock) wakeLock = await nav.wakeLock.request("screen");
      return !!wakeLock;
    }
    await wakeLock?.release();
    wakeLock = null;
    return false;
  } catch {
    return false;
  }
}

export async function pickFolder(current?: string): Promise<string | null> {
  const d = bridge();
  if (!d) return null;
  try {
    return await d.pickFolder(current);
  } catch {
    return null;
  }
}

export async function openPath(target: string): Promise<void> {
  const d = bridge();
  if (!d || !target) return;
  try {
    await d.openPath(target);
  } catch {
    /* ignore */
  }
}

/**
 * Save a screenshot/recording. In the desktop app it lands in the configured
 * folder and we return the path; in a browser it falls back to a download and
 * we return null (nothing to reveal).
 */
export async function saveCapture(dir: string, name: string, blob: Blob): Promise<string | null> {
  const d = bridge();
  if (d) {
    try {
      const buf = await blob.arrayBuffer();
      return await d.saveCapture(dir, name, buf);
    } catch {
      return null;
    }
  }
  download(name, blob);
  return null;
}

function download(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- Fullscreen -------------------------------------------------------------

export async function setFullScreen(on: boolean): Promise<boolean> {
  const d = bridge();
  if (d) {
    try {
      return await d.setFullScreen(on);
    } catch {
      return false;
    }
  }
  try {
    if (on) {
      await document.documentElement.requestFullscreen?.();
      return true;
    }
    if (document.fullscreenElement) await document.exitFullscreen?.();
    return false;
  } catch {
    return false;
  }
}

/** Subscribe to fullscreen changes from any source (button, F11, Esc). */
export function onFullScreenChanged(cb: (on: boolean) => void): () => void {
  const d = bridge();
  if (d) return d.onFullScreenChanged(cb);
  const handler = () => cb(!!document.fullscreenElement);
  document.addEventListener("fullscreenchange", handler);
  return () => document.removeEventListener("fullscreenchange", handler);
}

// ---- Updates (desktop only) -------------------------------------------------

export async function checkForUpdate(): Promise<UpdateInfo> {
  const d = bridge();
  if (!d) return { status: "not-configured" };
  try {
    return await d.checkForUpdate();
  } catch {
    return { status: "error", reason: "check failed" };
  }
}

export async function installUpdate(assetUrl: string, exe: string): Promise<boolean> {
  const d = bridge();
  if (!d) return false;
  try {
    return await d.installUpdate(assetUrl, exe);
  } catch {
    return false;
  }
}

export function onUpdateAvailable(cb: (info: UpdateInfo) => void): () => void {
  const d = bridge();
  if (!d) return () => {};
  return d.onUpdateAvailable(cb);
}
