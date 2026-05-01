import { Category, FlexibleTask } from "./aria-types";
import { uid } from "./aria-storage";

export interface SuggestedTask {
  title: string;
  category: Category;
  durationMin: number;
  preferredTimeOfDay: FlexibleTask["preferredTimeOfDay"];
  frequency: FlexibleTask["frequency"];
}

export const SUGGESTED_TASKS: Record<Category, SuggestedTask[]> = {
  home: [
    { title: "Grocery shopping", category: "home", durationMin: 60, preferredTimeOfDay: "morning", frequency: "weekly" },
    { title: "Meal prep", category: "home", durationMin: 90, preferredTimeOfDay: "afternoon", frequency: "weekly" },
    { title: "Laundry", category: "home", durationMin: 60, preferredTimeOfDay: "any", frequency: "weekly" },
    { title: "Cleaning", category: "home", durationMin: 60, preferredTimeOfDay: "morning", frequency: "weekly" },
  ],
  health: [
    { title: "Gym session", category: "health", durationMin: 60, preferredTimeOfDay: "morning", frequency: "weekly" },
    { title: "Run", category: "health", durationMin: 45, preferredTimeOfDay: "morning", frequency: "weekly" },
    { title: "Doctor appointment", category: "health", durationMin: 60, preferredTimeOfDay: "morning", frequency: "as-needed" },
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
  return {
    id: uid(),
    title: s.title,
    category: s.category,
    durationMin: s.durationMin,
    preferredTimeOfDay: s.preferredTimeOfDay,
    preferredDay: "any",
    frequency: s.frequency,
    priority: "medium",
  };
}
