import { fromMin } from "./schedule-utils";

export const TIME_STEP_MIN = 5;
export const DURATION_STEP_MIN = 5;
export const DURATION_MIN_MINUTES = 5;
export const DURATION_MAX_MINUTES = 12 * 60;

/** Minute-of-hour values aligned to 5-minute steps. */
export const FIVE_MINUTE_TICKS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55] as const;

/** Snap "HH:MM" (24h, optional 24:00) to the nearest TIME_STEP_MIN boundary. */
export function snapTimeToStep(hhmm: string, stepMin = TIME_STEP_MIN): string {
  const s = hhmm.trim();
  if (!s) return "";
  const parts = s.split(":");
  if (parts.length !== 2) return "09:00";
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "09:00";
  if (h === 24 && m === 0) return "24:00";
  let total = h * 60 + m;
  total = Math.round(total / stepMin) * stepMin;
  total = Math.max(0, Math.min(24 * 60, total));
  return fromMin(total);
}

export function snapDurationToStep(min: number, step = DURATION_STEP_MIN): number {
  if (!Number.isFinite(min)) return DURATION_MIN_MINUTES;
  const rounded = Math.round(min / step) * step;
  return Math.max(DURATION_MIN_MINUTES, Math.min(DURATION_MAX_MINUTES, rounded));
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Compose 24h time; use hour 24 only with minute 0 (end of day). */
export function composeTime(hour: number, minute: number): string {
  if (hour === 24) return "24:00";
  return `${pad2(hour)}:${pad2(minute)}`;
}

/** Parse snapped HH:MM after snapTimeToStep; null if empty. */
export function parseHourMinuteSnapped(hhmm: string): { hour: number; minute: number } | null {
  const s = hhmm.trim();
  if (!s) return null;
  const n = snapTimeToStep(s);
  const [h, m] = n.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return { hour: 9, minute: 0 };
  return { hour: h, minute: m };
}

export function hourChoices(allowMidnightEnd: boolean): number[] {
  const out = Array.from({ length: 24 }, (_, i) => i);
  if (allowMidnightEnd) out.push(24);
  return out;
}

/** Single-line display e.g. "9:05", "18:00", "24:00" (no leading zero on hour). */
export function formatTimeDisplayCompact(hhmm: string): string {
  const s = hhmm.trim();
  if (!s) return "";
  const snapped = snapTimeToStep(s);
  const [hs, ms] = snapped.split(":");
  const h = Number(hs);
  const minutePart = (ms ?? "00").padStart(2, "0");
  return `${h}:${minutePart}`;
}
