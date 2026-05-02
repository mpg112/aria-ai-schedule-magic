import {
  CATEGORY_META,
  Category,
  CustomTaskCategory,
  DayKey,
  FixedBlock,
  FlexibleTask,
  ScheduledEvent,
} from "./aria-types";
import { uid } from "./aria-storage";

const CAL_VIEW_PAD_MIN = 30;

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

function emojiForTask(task: FlexibleTask, customTaskCategories: CustomTaskCategory[]): string {
  if (task.customCategoryId) {
    const c = customTaskCategories.find((x) => x.id === task.customCategoryId);
    if (c?.emoji) return c.emoji;
  }
  return CATEGORY_META[task.category].emoji;
}

/** First task per normalized title wins (duplicate titles share one icon). */
function taskByTitleLookup(tasks: FlexibleTask[]): Map<string, FlexibleTask> {
  const map = new Map<string, FlexibleTask>();
  for (const t of tasks) {
    const k = t.title.trim().toLowerCase();
    if (!map.has(k)) map.set(k, t);
  }
  return map;
}

/** Attach `emoji` to flexible/tentative events when the title matches a task (custom category icon or built-in). */
export function enrichEventsWithTaskEmojis(
  events: ScheduledEvent[],
  tasks: FlexibleTask[],
  customTaskCategories: CustomTaskCategory[],
): ScheduledEvent[] {
  if (!tasks.length) return events;
  const lookup = taskByTitleLookup(tasks);
  return events.map((ev) => {
    if (ev.kind === "fixed") return ev;
    const task = lookup.get(ev.title.trim().toLowerCase());
    if (!task) return ev;
    return { ...ev, emoji: emojiForTask(task, customTaskCategories) };
  });
}

/**
 * Week grid visible range: user prefs (display) widened only when an event starts before
 * dayStart or ends after dayEnd so fixed blocks and flex tasks are never clipped.
 */
export function mergeDayBoundsForCalendar(
  dayStartPref: string,
  dayEndPref: string,
  events: ScheduledEvent[],
): { dayStart: string; dayEnd: string } {
  let prefMin = toMin(dayStartPref.trim() ? dayStartPref : DEFAULT_DAY_START);
  let prefMax = toMin(dayEndPref.trim() ? dayEndPref : DEFAULT_DAY_END);
  if (!Number.isFinite(prefMin)) prefMin = toMin(DEFAULT_DAY_START);
  if (!Number.isFinite(prefMax)) prefMax = toMin(DEFAULT_DAY_END);
  if (dayEndPref.trim() === "24:00") prefMax = 24 * 60;

  let minM = prefMin;
  let maxM = prefMax;
  let sawEvent = false;
  let evtMin = Infinity;
  let evtMax = -Infinity;

  for (const ev of events) {
    const s = toMin(ev.start);
    let e = toMin(ev.end);
    if (!Number.isFinite(s)) continue;
    if (!Number.isFinite(e) || e <= s) e = s + 60;
    sawEvent = true;
    evtMin = Math.min(evtMin, s);
    evtMax = Math.max(evtMax, e);
  }

  if (sawEvent && Number.isFinite(evtMin)) {
    minM = Math.min(prefMin, evtMin - CAL_VIEW_PAD_MIN);
  }
  if (sawEvent && evtMax >= 0) {
    maxM = Math.max(prefMax, evtMax + CAL_VIEW_PAD_MIN);
  }

  minM = Math.max(0, Math.floor(minM / 60) * 60);
  maxM = Math.min(24 * 60, Math.ceil(maxM / 60) * 60);
  if (maxM <= minM) maxM = Math.min(24 * 60, minM + 60);

  return {
    dayStart: fromMin(minM),
    dayEnd: maxM >= 24 * 60 ? "24:00" : fromMin(maxM),
  };
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
