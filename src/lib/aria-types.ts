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
export type Frequency = "once" | "weekly" | "as-needed";

export interface FixedBlock {
  id: string;
  title: string;
  days: DayKey[];
  start: string; // "HH:MM" 24h
  end: string;
  category: Category;
}

export interface FlexibleTask {
  id: string;
  title: string;
  category: Category;
  durationMin: number;
  frequency: Frequency;
  preferredTimeOfDay: TimeOfDay;
  preferredDay?: DayKey | "any";
  priority: Priority;
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
  preferences: DEFAULT_PREFERENCES,
  events: [],
  chat: [],
};
