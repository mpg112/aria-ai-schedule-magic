import { AriaState, FlexibleTask, createDefaultMealBreaks, normalizeFlexibleTask } from "./aria-types";
import { uid } from "./aria-storage";

export function getDemoState(): AriaState {
  return {
    onboarded: true,
    fixedBlocks: [
      {
        id: uid(),
        title: "Work",
        days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
        start: "09:00",
        end: "18:00",
        category: "work",
      },
      {
        id: uid(),
        title: "Generative AI for Managers",
        days: ["Tue", "Thu"],
        start: "18:30",
        end: "20:00",
        category: "work",
      },
    ],
    mealBreaks: createDefaultMealBreaks(),
    customTaskCategories: [],
    tasks: [
      {
        id: uid(),
        title: "Gym session",
        category: "health",
        durationMin: 60,
        frequency: "weekly",
        timesPerWeekMin: 3,
        timesPerWeekMax: 4,
        preferredTimeOfDay: "morning",
        preferredDay: "any",
        priority: "high",
      },
      { id: uid(), title: "Run", category: "health", durationMin: 45, frequency: "weekly", preferredTimeOfDay: "morning", preferredDay: "Sat", priority: "medium" },
      { id: uid(), title: "Grocery shopping", category: "home", durationMin: 60, frequency: "weekly", preferredTimeOfDay: "morning", preferredDay: "Sat", priority: "high" },
      { id: uid(), title: "Meal prep", category: "home", durationMin: 90, frequency: "weekly", preferredTimeOfDay: "afternoon", preferredDay: "Sun", priority: "medium" },
      { id: uid(), title: "Laundry", category: "home", durationMin: 60, frequency: "weekly", preferredTimeOfDay: "any", preferredDay: "any", priority: "low" },
      { id: uid(), title: "Reading", category: "personal", durationMin: 45, frequency: "weekly", preferredTimeOfDay: "evening", preferredDay: "any", priority: "medium" },
      { id: uid(), title: "Side project", category: "personal", durationMin: 90, frequency: "weekly", preferredTimeOfDay: "evening", preferredDay: "any", priority: "medium" },
      { id: uid(), title: "Catch up with friends", category: "social", durationMin: 120, frequency: "weekly", preferredTimeOfDay: "evening", preferredDay: "Fri", priority: "high" },
      { id: uid(), title: "Family call", category: "social", durationMin: 30, frequency: "weekly", preferredTimeOfDay: "evening", preferredDay: "Sun", priority: "medium" },
      { id: uid(), title: "Pay bills & inbox", category: "admin", durationMin: 45, frequency: "weekly", preferredTimeOfDay: "afternoon", preferredDay: "any", priority: "low" },
    ].map((t) => normalizeFlexibleTask(t as FlexibleTask)),
    preferences: {
      morningStartWeekday: "07:00",
      morningStartWeekend: "09:00",
      preferredGapBetweenTasksMin: 15,
      protectEvenings: false,
      protectEveningsFrom: "19:00",
      freeDays: [],
      dayStart: "07:00",
      dayEnd: "24:00",
    },
    events: [],
    chat: [],
  };
}
