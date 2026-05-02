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
  if (timesPerWeekMin > timesPerWeekMax) {
    const swap = timesPerWeekMin;
    timesPerWeekMin = timesPerWeekMax;
    timesPerWeekMax = swap;
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
  /** Earliest usual time for Aria to *schedule* flexible tasks (scheduling — not grid display). */
  morningStart: string; // "07:00"
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
}

export interface ScheduledEvent {
  id: string;
  title: string;
  day: DayKey;
  start: string; // HH:MM
  end: string;
  kind: "fixed" | "flexible" | "tentative";
  category: Category;
  priority?: Priority;
  /** UI: when set (e.g. from task / custom category), calendar shows this instead of category default. */
  emoji?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface AriaState {
  onboarded: boolean;
  fixedBlocks: FixedBlock[];
  tasks: FlexibleTask[];
  customTaskCategories: CustomTaskCategory[];
  preferences: Preferences;
  events: ScheduledEvent[];
  chat: ChatMessage[];
}

export const DEFAULT_PREFERENCES: Preferences = {
  morningStart: "07:00",
  preferredGapBetweenTasksMin: 15,
  protectEvenings: true,
  protectEveningsFrom: "19:00",
  freeDays: [],
  dayStart: "07:00",
  dayEnd: "24:00",
};

/** Merge persisted prefs with defaults; clamp gap to a sane slider step (migration from legacy clusterErrands). */
export function normalizePreferences(raw: Partial<Preferences> | undefined): Preferences {
  const m = { ...DEFAULT_PREFERENCES, ...(raw ?? {}) };
  let gap = Number(m.preferredGapBetweenTasksMin);
  if (!Number.isFinite(gap)) gap = DEFAULT_PREFERENCES.preferredGapBetweenTasksMin;
  gap = Math.min(120, Math.max(0, Math.round(gap / 5) * 5));
  return {
    morningStart: m.morningStart,
    preferredGapBetweenTasksMin: gap,
    protectEvenings: m.protectEvenings,
    protectEveningsFrom: m.protectEveningsFrom,
    freeDays: [...m.freeDays],
    dayStart: m.dayStart,
    dayEnd: m.dayEnd,
  };
}

export const EMPTY_STATE: AriaState = {
  onboarded: false,
  fixedBlocks: [],
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
