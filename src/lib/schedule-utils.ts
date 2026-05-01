import { Category, DayKey, FixedBlock, ScheduledEvent } from "./aria-types";
import { uid } from "./aria-storage";

// "HH:MM" -> minutes
export function toMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

// minutes -> "HH:MM"
export function fromMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function fixedBlocksToEvents(blocks: FixedBlock[]): ScheduledEvent[] {
  const out: ScheduledEvent[] = [];
  for (const b of blocks) {
    for (const d of b.days) {
      out.push({
        id: `${b.id}-${d}`,
        title: b.title,
        day: d,
        start: b.start,
        end: b.end,
        kind: "fixed",
        category: b.category,
        priority: "high",
      });
    }
  }
  return out;
}

export function categoryClasses(c: Category) {
  return {
    bg: `bg-cat-${c}`,
    soft: `bg-cat-${c}-soft`,
    text: `text-cat-${c}`,
    border: `border-cat-${c}`,
  };
}

export function formatLabel(t: string) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "p" : "a";
  const hh = h % 12 || 12;
  return m === 0 ? `${hh}${ampm}` : `${hh}:${String(m).padStart(2, "0")}${ampm}`;
}

export const DEFAULT_DAY_START = "07:00";
export const DEFAULT_DAY_END = "24:00";

export function newEventId() {
  return uid();
}

export function dayLabel(d: DayKey, long = false): string {
  const map: Record<DayKey, string> = {
    Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday",
    Fri: "Friday", Sat: "Saturday", Sun: "Sunday",
  };
  return long ? map[d] : d;
}
