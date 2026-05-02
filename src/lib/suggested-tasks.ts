import { Category, FlexibleTask, PreferredTimeStyle, TimeWindow, normalizeFlexibleTask } from "./aria-types";
import { uid } from "./aria-storage";

export interface SuggestedTask {
  title: string;
  category: Category;
  durationMin: number;
  preferredTimeOfDay: FlexibleTask["preferredTimeOfDay"];
  frequency: FlexibleTask["frequency"];
  /** Weekly templates only: e.g. gym 3–4× per week */
  timesPerWeekMin?: number;
  timesPerWeekMax?: number;
  /** Daily templates: 1–4× per day */
  timesPerDay?: number;
  preferredTimeStyle?: PreferredTimeStyle;
  preferredTimeWindows?: TimeWindow[];
}

export const SUGGESTED_TASKS: Record<Category, SuggestedTask[]> = {
  home: [
    { title: "Grocery shopping", category: "home", durationMin: 60, preferredTimeOfDay: "morning", frequency: "weekly" },
    { title: "Meal prep", category: "home", durationMin: 90, preferredTimeOfDay: "afternoon", frequency: "weekly" },
    { title: "Laundry", category: "home", durationMin: 60, preferredTimeOfDay: "any", frequency: "weekly" },
    { title: "Cleaning", category: "home", durationMin: 60, preferredTimeOfDay: "morning", frequency: "weekly" },
    {
      title: "Dog walk",
      category: "home",
      durationMin: 20,
      preferredTimeOfDay: "any",
      frequency: "daily",
      timesPerDay: 3,
      preferredTimeStyle: "windows",
      preferredTimeWindows: [
        { start: "07:00", end: "09:00" },
        { start: "12:00", end: "14:00" },
        { start: "17:00", end: "20:00" },
      ],
    },
  ],
  health: [
    {
      title: "Gym session",
      category: "health",
      durationMin: 60,
      preferredTimeOfDay: "morning",
      frequency: "weekly",
      timesPerWeekMin: 3,
      timesPerWeekMax: 4,
    },
    { title: "Run", category: "health", durationMin: 45, preferredTimeOfDay: "morning", frequency: "weekly" },
    { title: "Doctor appointment", category: "health", durationMin: 60, preferredTimeOfDay: "morning", frequency: "once" },
  ],
  personal: [
    { title: "Reading", category: "personal", durationMin: 45, preferredTimeOfDay: "evening", frequency: "weekly" },
    { title: "Side project", category: "personal", durationMin: 90, preferredTimeOfDay: "evening", frequency: "weekly" },
  ],
  social: [
    { title: "Catch up with friends", category: "social", durationMin: 90, preferredTimeOfDay: "evening", frequency: "weekly" },
    { title: "Family call", category: "social", durationMin: 30, preferredTimeOfDay: "evening", frequency: "weekly" },
  ],
  admin: [
    { title: "Pay bills", category: "admin", durationMin: 30, preferredTimeOfDay: "afternoon", frequency: "weekly" },
    { title: "Errands", category: "admin", durationMin: 60, preferredTimeOfDay: "afternoon", frequency: "weekly" },
    { title: "Email & inbox cleanup", category: "admin", durationMin: 30, preferredTimeOfDay: "morning", frequency: "weekly" },
  ],
  work: [],
  other: [],
};

export const SUGGESTED_CATEGORIES: Category[] = ["home", "health", "personal", "social", "admin"];

export function suggestedToTask(s: SuggestedTask): FlexibleTask {
  return normalizeFlexibleTask({
    id: uid(),
    title: s.title,
    category: s.category,
    durationMin: s.durationMin,
    frequency: s.frequency,
    timesPerDay: s.timesPerDay ?? 1,
    ...(s.timesPerWeekMin != null ? { timesPerWeekMin: s.timesPerWeekMin } : {}),
    ...(s.timesPerWeekMax != null ? { timesPerWeekMax: s.timesPerWeekMax } : {}),
    priority: "medium",
    preferredTimeStyle: s.preferredTimeStyle ?? "preset",
    preferredTimeOfDay: s.preferredTimeOfDay,
    preferredTimeWindows: s.preferredTimeWindows ?? [],
    preferredWeekdays: [],
    monthWeekOrdinal: "any",
    monthDaysOfMonth: [],
    schedulingNotes: "",
  } as FlexibleTask);
}
