export type DayKey = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
export const DAYS: DayKey[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export type Category =
  | "work"
  | "home"
  | "health"
  | "personal"
  | "social"
  | "admin"
  | "other";

export const CATEGORY_META: Record<
  Category,
  { label: string; emoji: string }
> = {
  work: { label: "Work", emoji: "💼" },
  home: { label: "Home", emoji: "🏠" },
  health: { label: "Health", emoji: "💪" },
  personal: { label: "Personal", emoji: "🧠" },
  social: { label: "Social", emoji: "👥" },
  admin: { label: "Admin", emoji: "🛠️" },
  other: { label: "Other", emoji: "✨" },
};

export type Priority = "high" | "medium" | "low";
export type TimeOfDay = "morning" | "afternoon" | "evening" | "any";
export type Frequency = "once" | "weekly" | "monthly" | "daily";

/** Broad time-of-day vs explicit HH:MM windows (e.g. 9:00–11:00). */
export type PreferredTimeStyle = "preset" | "windows";

export interface TimeWindow {
  start: string; // "HH:MM" 24h
  end: string;
}

/** For monthly tasks: which occurrence of the weekday (or any). */
export type MonthWeekOrdinal = "first" | "second" | "third" | "fourth" | "last" | "any";

export interface FixedBlock {
  id: string;
  title: string;
  days: DayKey[];
  start: string; // "HH:MM" 24h
  end: string;
  category: Category;
}

export type MealKind = "breakfast" | "lunch" | "dinner";

export const MEAL_KIND_LABEL: Record<MealKind, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

/** Recurring meal / buffer: shown softly on the calendar; Aria avoids flexible tasks during these times. */
export interface MealBreak {
  id: string;
  kind: MealKind;
  enabled: boolean;
  days: DayKey[];
  /** Meal must fit entirely inside this window (24h HH:MM). */
  windowStart: string;
  windowEnd: string;
  durationMin: number;
}

function mealToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  if (!Number.isFinite(h)) return 7 * 60;
  return h * 60 + (Number.isFinite(m) ? m : 0);
}

function mealFromMin(min: number): string {
  const h = Math.floor(min / 60);
  const mm = Math.min(59, Math.max(0, min % 60));
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function newMealBreakId(): string {
  return `m${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}

/** Clamp meal window and duration; drop invalid days. (Legacy `placedStart` in JSON is ignored.) */
export function normalizeMealBreak(raw: Partial<MealBreak> & { id?: string; placedStart?: string }): MealBreak {
  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : newMealBreakId();
  const kind: MealKind =
    raw.kind === "lunch" || raw.kind === "dinner" || raw.kind === "breakfast" ? raw.kind : "breakfast";
  let durationMin = typeof raw.durationMin === "number" ? Math.round(raw.durationMin) : 30;
  durationMin = Math.min(180, Math.max(15, Math.round(durationMin / 5) * 5));
  const daySet = new Set(DAYS);
  const rawDayList = raw.days === undefined || raw.days === null ? [...DAYS] : [...raw.days];
  const days = rawDayList.filter((d): d is DayKey => daySet.has(d as DayKey));

  let ws = mealToMin(typeof raw.windowStart === "string" ? raw.windowStart : "07:00");
  let we = mealToMin(typeof raw.windowEnd === "string" ? raw.windowEnd : "09:00");
  if (!Number.isFinite(ws)) ws = 7 * 60;
  if (!Number.isFinite(we)) we = 9 * 60;
  if (we <= ws) we = ws + durationMin;
  let latestStart = we - durationMin;
  if (latestStart < ws) {
    we = ws + durationMin;
  }

  return {
    id,
    kind,
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : true,
    days,
    windowStart: mealFromMin(ws),
    windowEnd: mealFromMin(we),
    durationMin,
  };
}

/** Stable ids so preset breakfast / lunch / dinner rows stay identifiable in the UI. */
export function createDefaultMealBreaks(): MealBreak[] {
  return [
    normalizeMealBreak({
      id: "meal-default-breakfast",
      kind: "breakfast",
      enabled: true,
      days: [...DAYS],
      windowStart: "06:30",
      windowEnd: "10:00",
      durationMin: 30,
    }),
    normalizeMealBreak({
      id: "meal-default-lunch",
      kind: "lunch",
      enabled: true,
      days: [...DAYS],
      windowStart: "11:30",
      windowEnd: "14:00",
      durationMin: 45,
    }),
    normalizeMealBreak({
      id: "meal-default-dinner",
      kind: "dinner",
      enabled: true,
      days: [...DAYS],
      windowStart: "17:30",
      windowEnd: "21:00",
      durationMin: 60,
    }),
  ];
}

/** User-defined bucket for grouping tasks in onboarding (calendar uses paletteCategory). */
export interface CustomTaskCategory {
  id: string;
  label: string;
  emoji: string;
  /** Maps to built-in styling / AI bucket for scheduled events */
  paletteCategory: Category;
}

export interface FlexibleTask {
  id: string;
  title: string;
  category: Category;
  /** When set, task is listed under this custom category section */
  customCategoryId?: string;
  durationMin: number;
  frequency: Frequency;
  /** Daily only: 1–4 sessions per calendar day (each maps to one preferredTimeWindows slot). Normalized to 1 for other frequencies. */
  timesPerDay: number;
  /** Weekly (and non-daily): how many times per week (range inclusive). Default 1–1 = once per week. */
  timesPerWeekMin: number;
  timesPerWeekMax: number;
  priority: Priority;

  /** "preset" uses preferredTimeOfDay; "windows" uses preferredTimeWindows */
  preferredTimeStyle: PreferredTimeStyle;
  preferredTimeOfDay: TimeOfDay;
  preferredTimeWindows: TimeWindow[];

  /** Preferred weekdays (empty = no weekday preference). Used for weekly/monthly and optionally once. */
  preferredWeekdays: DayKey[];
  /** Legacy single day — migrated into preferredWeekdays on load */
  preferredDay?: DayKey | "any";

  /** Monthly: which week of the month for the chosen weekday(s), if applicable */
  monthWeekOrdinal: MonthWeekOrdinal;
  /** Monthly: calendar days of month (1–31) user prefers */
  monthDaysOfMonth: number[];

  /** Free-form scheduling constraints for the AI */
  schedulingNotes: string;
}

const DEFAULT_DAILY_SLOT_WINDOWS: TimeWindow[] = [
  { start: "07:00", end: "09:00" },
  { start: "12:00", end: "13:00" },
  { start: "17:00", end: "19:00" },
  { start: "20:00", end: "22:00" },
];

function alignDailyWindows(existing: TimeWindow[], count: number): TimeWindow[] {
  const base = existing.map((w) => ({ start: w.start, end: w.end }));
  const out: TimeWindow[] = [];
  for (let i = 0; i < count; i++) {
    if (base[i]) {
      out.push(base[i]);
    } else {
      const def = DEFAULT_DAILY_SLOT_WINDOWS[Math.min(i, DEFAULT_DAILY_SLOT_WINDOWS.length - 1)];
      out.push({ start: def.start, end: def.end });
    }
  }
  return out;
}

/** Fill defaults and migrate legacy preferredDay → preferredWeekdays */
export function normalizeFlexibleTask(raw: FlexibleTask): FlexibleTask {
  const rawFreq = raw.frequency as string | undefined;
  const frequency: Frequency =
    rawFreq === "once" || rawFreq === "weekly" || rawFreq === "monthly" || rawFreq === "daily"
      ? rawFreq
      : rawFreq === "as-needed"
        ? "once"
        : "weekly";

  let timesPerDay =
    typeof raw.timesPerDay === "number" && Number.isFinite(raw.timesPerDay) ? Math.round(raw.timesPerDay) : 1;
  timesPerDay = Math.min(4, Math.max(1, timesPerDay));

  let preferredWeekdays = [...(raw.preferredWeekdays ?? [])];
  if (frequency === "daily") {
    preferredWeekdays = [];
  } else if (preferredWeekdays.length === 0 && raw.preferredDay && raw.preferredDay !== "any") {
    preferredWeekdays = [raw.preferredDay];
  }

  let timesPerWeekMin =
    typeof raw.timesPerWeekMin === "number" && Number.isFinite(raw.timesPerWeekMin) ? Math.round(raw.timesPerWeekMin) : 1;
  let timesPerWeekMax =
    typeof raw.timesPerWeekMax === "number" && Number.isFinite(raw.timesPerWeekMax)
      ? Math.round(raw.timesPerWeekMax)
      : timesPerWeekMin;
  timesPerWeekMin = Math.min(7, Math.max(1, timesPerWeekMin));
  timesPerWeekMax = Math.min(7, Math.max(1, timesPerWeekMax));
  /** If max was below min, raise max—do not lower min (swap would drop the user’s minimum, e.g. 3×/wk). */
  if (timesPerWeekMin > timesPerWeekMax) {
    timesPerWeekMax = timesPerWeekMin;
  }

  let preferredTimeWindows = [...(raw.preferredTimeWindows ?? [])];
  let style: PreferredTimeStyle = raw.preferredTimeStyle ?? "preset";

  if (frequency === "daily") {
    style = "windows";
    preferredTimeWindows = alignDailyWindows(preferredTimeWindows, timesPerDay);
  } else {
    timesPerDay = 1;
    if (style === "windows" && preferredTimeWindows.length === 0) {
      preferredTimeWindows = [{ start: "09:00", end: "11:00" }];
    }
  }

  return {
    ...raw,
    frequency,
    timesPerDay,
    timesPerWeekMin,
    timesPerWeekMax,
    preferredTimeStyle: style,
    preferredTimeOfDay: raw.preferredTimeOfDay ?? "any",
    preferredTimeWindows,
    preferredWeekdays,
    monthWeekOrdinal: raw.monthWeekOrdinal ?? "any",
    monthDaysOfMonth: [...(raw.monthDaysOfMonth ?? [])].filter((n) => n >= 1 && n <= 31),
    schedulingNotes: raw.schedulingNotes ?? "",
  };
}

export interface Preferences {
  /** Earliest usual time Mon–Fri for Aria to *schedule* flexible tasks (not calendar grid display). */
  morningStartWeekday: string; // "07:00"
  /** Earliest usual time Sat–Sun (often later than weekdays). */
  morningStartWeekend: string; // "09:00"
  /** Preferred minimum gap (minutes) between flexible-task blocks on the same day when possible; soft constraint. */
  preferredGapBetweenTasksMin: number;
  protectEvenings: boolean;
  /** When protectEvenings is true: flexible tasks should not start at or after this time on weeknights (Mon–Fri). */
  protectEveningsFrom: string; // "HH:MM" 24h, e.g. "19:00"
  freeDays: DayKey[];
  /** Week grid visible range only — cosmetic; does not define when tasks may run. */
  dayStart: string;
  /** Week grid visible range only — cosmetic; does not define when tasks may run. */
  dayEnd: string;
  /** Pixels per hour on the week calendar (display only). Must be one of `CALENDAR_DENSITY_HEIGHT_PX`. */
  calendarHourHeightPx: number;
}

/** Week calendar row heights (px per hour); labels in the UI are qualitative, not raw pixels. */
export const CALENDAR_DENSITY_HEIGHT_PX = [32, 52, 72, 96] as const;

export type CalendarDensityHeightPx = (typeof CALENDAR_DENSITY_HEIGHT_PX)[number];

export function snapCalendarDensityPx(px: number): CalendarDensityHeightPx {
  const allowed = [...CALENDAR_DENSITY_HEIGHT_PX];
  let best = allowed[0]!;
  let bestDist = Infinity;
  for (const p of allowed) {
    const d = Math.abs(px - p);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
}

export const CALENDAR_DENSITY_OPTIONS: { value: CalendarDensityHeightPx; label: string }[] = [
  { value: 32, label: "Compact — fit more on screen" },
  { value: 52, label: "Balanced" },
  { value: 72, label: "Comfortable" },
  { value: 96, label: "Spacious — easiest to read" },
];

export interface ScheduledEvent {
  id: string;
  title: string;
  day: DayKey;
  start: string; // HH:MM
  end: string;
  kind: "fixed" | "flexible" | "tentative" | "meal";
  category: Category;
  priority?: Priority;
  /** UI: when set (e.g. from task / custom category), calendar shows this instead of category default. */
  emoji?: string;
}

/** AI may reuse the same id for multiple flex rows; the calendar dedupes by id so only one block shows. */
export function dedupeRepairFlexibleEventIds(events: ScheduledEvent[]): ScheduledEvent[] {
  const seen = new Set<string>();
  return events.map((e, idx) => {
    if (e.kind !== "flexible" && e.kind !== "tentative") return e;
    let id = String(e.id ?? "").trim();
    if (!id) id = `flex-${idx}`;
    if (!seen.has(id)) {
      seen.add(id);
      return { ...e, id };
    }
    let n = 2;
    let next = `${id}-dup${n}`;
    while (seen.has(next)) {
      n++;
      next = `${id}-dup${n}`;
    }
    seen.add(next);
    return { ...e, id: next };
  });
}

function normTitleWords(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function firstWordTitle(s: string): string {
  const t = normTitleWords(s);
  return t.split(" ")[0] ?? "";
}

/** Count / match flex rows to a weekly task: id link, exact title, or same first word (e.g. Gym vs Gym session). */
export function flexEventLikelyForWeeklyTask(task: FlexibleTask, e: ScheduledEvent): boolean {
  if (e.kind !== "flexible" && e.kind !== "tentative") return false;
  if (e.id === task.id || e.id.startsWith(`${task.id}-`)) return true;
  const a = normTitleWords(task.title);
  const b = normTitleWords(e.title);
  if (a === b) return true;
  const fw = firstWordTitle(task.title);
  const ew = firstWordTitle(e.title);
  return fw.length >= 3 && ew.length >= 3 && fw === ew;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface AriaState {
  onboarded: boolean;
  fixedBlocks: FixedBlock[];
  /** Optional meal buffers — soft on the calendar; block flexible scheduling like fixed times. */
  mealBreaks: MealBreak[];
  tasks: FlexibleTask[];
  customTaskCategories: CustomTaskCategory[];
  preferences: Preferences;
  events: ScheduledEvent[];
  chat: ChatMessage[];
}

export const DEFAULT_PREFERENCES: Preferences = {
  morningStartWeekday: "07:00",
  morningStartWeekend: "07:00",
  preferredGapBetweenTasksMin: 15,
  protectEvenings: true,
  protectEveningsFrom: "19:00",
  freeDays: [],
  dayStart: "07:00",
  dayEnd: "24:00",
  calendarHourHeightPx: 52,
};

/** Merge persisted prefs with defaults; migrate legacy `morningStart` → weekday/weekend. */
export function normalizePreferences(raw: Partial<Preferences> | undefined): Preferences {
  const legacy = raw as (Partial<Preferences> & { morningStart?: string }) | undefined;
  const legacyMorning =
    typeof legacy?.morningStart === "string" && legacy.morningStart.trim() ? legacy.morningStart.trim() : undefined;
  const m = { ...DEFAULT_PREFERENCES, ...(raw ?? {}) };
  let gap = Number(m.preferredGapBetweenTasksMin);
  if (!Number.isFinite(gap)) gap = DEFAULT_PREFERENCES.preferredGapBetweenTasksMin;
  gap = Math.min(120, Math.max(0, Math.round(gap / 5) * 5));

  const morningStartWeekday =
    (m.morningStartWeekday && m.morningStartWeekday.trim()) ||
    legacyMorning ||
    DEFAULT_PREFERENCES.morningStartWeekday;
  const morningStartWeekendRaw =
    (m.morningStartWeekend && m.morningStartWeekend.trim()) || legacyMorning || morningStartWeekday;

  let calendarHourHeightPx = Number((m as { calendarHourHeightPx?: unknown }).calendarHourHeightPx);
  if (!Number.isFinite(calendarHourHeightPx)) calendarHourHeightPx = DEFAULT_PREFERENCES.calendarHourHeightPx;
  calendarHourHeightPx = snapCalendarDensityPx(Math.round(calendarHourHeightPx / 4) * 4);

  const freeDays = Array.isArray(m.freeDays) ? [...m.freeDays] : [...DEFAULT_PREFERENCES.freeDays];

  return {
    morningStartWeekday,
    morningStartWeekend: morningStartWeekendRaw,
    preferredGapBetweenTasksMin: gap,
    protectEvenings: Boolean(m.protectEvenings),
    protectEveningsFrom: m.protectEveningsFrom ?? DEFAULT_PREFERENCES.protectEveningsFrom,
    freeDays,
    dayStart: (m.dayStart && String(m.dayStart).trim()) || DEFAULT_PREFERENCES.dayStart,
    dayEnd: (m.dayEnd && String(m.dayEnd).trim()) || DEFAULT_PREFERENCES.dayEnd,
    calendarHourHeightPx,
  };
}

export const EMPTY_STATE: AriaState = {
  onboarded: false,
  fixedBlocks: [],
  mealBreaks: [],
  tasks: [],
  customTaskCategories: [],
  preferences: DEFAULT_PREFERENCES,
  events: [],
  chat: [],
};

/** One person’s calendar + tasks (e.g. PA managing multiple clients on one device). */
export interface UserProfile {
  id: string;
  name: string;
  aria: AriaState;
}

/** Persisted app shell: which profile is active + all profiles’ AriaState. */
export interface ProfilesRootState {
  activeProfileId: string;
  profiles: UserProfile[];
}
