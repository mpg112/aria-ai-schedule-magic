const KEY = "aria-launch-preamble-v1";

export function hasCompletedLaunchPreamble(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setLaunchPreambleComplete(): void {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearLaunchPreambleFlag(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
