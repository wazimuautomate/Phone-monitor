// Theme choice mirrors the phone app: System / Light / Dark, defaulting to
// System. "System" follows the OS and keeps following it if the OS flips while
// the app is open.

export type ThemeMode = "system" | "light" | "dark";
export type Resolved = "light" | "dark";

const KEY = "pm.themeMode";

export function getThemeMode(): ThemeMode {
  const v = localStorage.getItem(KEY);
  return v === "light" || v === "dark" ? v : "system";
}

export function systemTheme(): Resolved {
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function resolveTheme(mode: ThemeMode): Resolved {
  return mode === "system" ? systemTheme() : mode;
}

export function applyTheme(mode: ThemeMode): Resolved {
  const resolved = resolveTheme(mode);
  document.documentElement.setAttribute("data-theme", resolved);
  return resolved;
}

export function setThemeMode(mode: ThemeMode): Resolved {
  localStorage.setItem(KEY, mode);
  return applyTheme(mode);
}

/** Re-apply on OS changes, but only while the user is on "System". */
export function watchSystemTheme(onChange: (resolved: Resolved) => void): () => void {
  const mq = window.matchMedia?.("(prefers-color-scheme: light)");
  if (!mq) return () => {};
  const handler = () => {
    if (getThemeMode() === "system") onChange(applyTheme("system"));
  };
  mq.addEventListener("change", handler);
  return () => mq.removeEventListener("change", handler);
}
