import { AriaState, EMPTY_STATE } from "./aria-types";

const KEY = "aria-state-v1";

export function loadState(): AriaState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw);
    return { ...EMPTY_STATE, ...parsed, preferences: { ...EMPTY_STATE.preferences, ...(parsed.preferences ?? {}) } };
  } catch {
    return EMPTY_STATE;
  }
}

export function saveState(state: AriaState) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function clearState() {
  localStorage.removeItem(KEY);
}

export const uid = () =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
