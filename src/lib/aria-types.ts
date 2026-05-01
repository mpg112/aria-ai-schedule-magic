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
export type Frequency = "once" | "weekly" | "monthly" | "as-needed";

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
  /** Weekly only: how many times per week (range inclusive). Default 1–1 = once per week. */
  timesPerWeekMin: number;
  timesPerWeekMax: number;
  priority: Priority;

  /** "preset" uses preferredTimeOfDay; "windows" uses preferredTimeWindows */
  preferredTimeStyle: PreferredTimeStyle;
  preferredTimeOfDay: TimeOfDay;
  preferredTimeWindows: TimeWindow[];

  /** Preferred weekdays (empty = no weekday preference). Used for weekly/monthly and optionally once/as-needed. */
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

/** Fill defaults and migrate legacy preferredDay → preferredWeekdays */
export function normalizeFlexibleTask(raw: FlexibleTask): FlexibleTask {
  let preferredWeekdays = [...(raw.preferredWeekdays ?? [])];
  if (preferredWeekdays.length === 0 && raw.preferredDay && raw.preferredDay !== "any") {
    preferredWeekdays = [raw.preferredDay];
  }

  let preferredTimeWindows = [...(raw.preferredTimeWindows ?? [])];
  const style: PreferredTimeStyle = raw.preferredTimeStyle ?? "preset";
  if (style === "windows" && preferredTimeWindows.length === 0) {
    preferredTimeWindows = [{ start: "09:00", end: "11:00" }];
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

  return {
    ...raw,
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
  morningStart: string; // "07:00"
  clusterErrands: boolean;
  protectEvenings: boolean;
  freeDays: DayKey[];
  dayStart: string;
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
  clusterErrands: false,
  protectEvenings: true,
  freeDays: [],
  dayStart: "07:00",
  dayEnd: "24:00",
};

export const EMPTY_STATE: AriaState = {
  onboarded: false,
  fixedBlocks: [],
  tasks: [],
  customTaskCategories: [],
  preferences: DEFAULT_PREFERENCES,
  events: [],
  chat: [],
};
