import { supabase } from "@/integrations/supabase/client";
import { AriaState, ChatMessage, DAYS, DayKey, FlexibleTask, ScheduledEvent } from "./aria-types";
import {
  allFixedEventsForScheduling,
  bumpFlexEventsClearOfMeals,
  mealBreaksToEvents,
  resolveFlexTentativeOverlaps,
} from "./schedule-utils";

/** Extra fields on tasks in the AI payload only (not persisted). */
export type FlexibleTaskAIContext = FlexibleTask & {
  ariaSchedulingContract?: string;
  ariaWeeklyOccurrenceContract?: string;
  ariaPreferredDaysContract?: string;
  ariaTimePreferenceContract?: string;
};

function buildDailySchedulingContract(task: FlexibleTask, freeDays: DayKey[]): string {
  const free = new Set(freeDays);
  const eligibleDays = DAYS.filter((d) => !free.has(d));
  const perDay = task.timesPerDay;
  const total = eligibleDays.length * perDay;
  const windowsDesc = task.preferredTimeWindows
    .map((w, i) => `#${i + 1} ${w.start}–${w.end}`)
    .join("; ");
  return (
    `DAILY TASK — NON-NEGOTIABLE COUNT: On EVERY calendar day in this week except preferences.freeDays, you must output EXACTLY ${perDay} separate flexible events for this task (not 1 per day). ` +
    `Eligible days for this task: ${eligibleDays.join(", ") || "(none — user marked all days free)"}. ` +
    `Minimum events this week for this task row: ${total} (=${eligibleDays.length} days × ${perDay} per day). ` +
    `Map occurrence order to preferredTimeWindows in order each day: ${windowsDesc}. ` +
    `Each event needs a unique id (e.g. "${task.id}-Tue-1" for Tuesday, 2nd occurrence).`
  );
}

function buildWeeklyOccurrenceContract(task: FlexibleTask): string | undefined {
  if (task.frequency !== "weekly") return undefined;
  const min = task.timesPerWeekMin;
  const max = task.timesPerWeekMax;
  if (min <= 1 && max <= 1) return undefined;
  const daysRule =
    task.preferredWeekdays?.length > 0
      ? `Every occurrence MUST fall on one of these days only: ${task.preferredWeekdays.join(", ")} — never on other weekdays.`
      : `Spread distinct sessions across the week when possible.`;
  return (
    `WEEKLY OCCURRENCES — NON-NEGOTIABLE COUNT: Task "${task.title}" (task id ${task.id}) is weekly with timesPerWeekMin=${min} and timesPerWeekMax=${max}. ` +
    `You must output at least ${min} and at most ${max} separate flexible events for this task THIS week (each a unique id, e.g. "${task.id}-Mon", "${task.id}-Thu-2"). ` +
    `If ${min} or more non-overlapping slots exist alongside fixed blocks, mealSlotsPlaced, freeDays, and evening protection, emitting fewer than ${min} is wrong. ` +
    daysRule
  );
}

/** Strong day-of-week guard for once / monthly / weekly (single or multi) when the UI has non-empty preferredWeekdays. */
function buildPreferredDaysContract(task: FlexibleTask): string | undefined {
  if (task.frequency === "daily") return undefined;
  const days = task.preferredWeekdays;
  if (!days?.length) return undefined;
  const scope =
    task.frequency === "weekly"
      ? "weekly"
      : task.frequency === "once"
        ? "once"
        : task.frequency === "monthly"
          ? "monthly"
          : "this task";
  return (
    `PREFERRED DAYS (${scope}) — STRICT for "${task.title}" (id ${task.id}): place flexible events for this task ONLY on: ${days.join(", ")}. ` +
    `Never schedule it on any other day. If no slot exists on those days, explain in your message rather than moving it to a forbidden day.`
  );
}

function buildTimePreferenceContract(task: FlexibleTask): string | undefined {
  if (task.frequency === "daily") return undefined;
  if (task.preferredTimeStyle === "windows" && task.preferredTimeWindows.length > 0) {
    const desc = task.preferredTimeWindows.map((w, i) => `#${i + 1} ${w.start}–${w.end}`).join("; ");
    return (
      `TIME WINDOWS for "${task.title}" (id ${task.id}): preferredTimeStyle is "windows" — each occurrence must start/end inside one of: ${desc} (respect duration ${task.durationMin} min).`
    );
  }
  if (task.preferredTimeStyle === "preset" && task.preferredTimeOfDay && task.preferredTimeOfDay !== "any") {
    const band =
      task.preferredTimeOfDay === "morning"
        ? "≈06:00–12:00"
        : task.preferredTimeOfDay === "afternoon"
          ? "≈12:00–17:00"
          : "≈17:00–22:00";
    return (
      `TIME OF DAY for "${task.title}" (id ${task.id}): preferredTimeStyle is "preset" with preferredTimeOfDay="${task.preferredTimeOfDay}" — keep each occurrence in ${band} when physically possible (never violate fixed blocks).`
    );
  }
  return undefined;
}

function tasksForAIContext(tasks: FlexibleTask[], freeDays: DayKey[]): FlexibleTaskAIContext[] {
  return tasks.map((t) => {
    if (t.frequency === "daily") {
      return { ...t, ariaSchedulingContract: buildDailySchedulingContract(t, freeDays) };
    }
    const weekly = buildWeeklyOccurrenceContract(t);
    const daysC = buildPreferredDaysContract(t);
    const timeC = buildTimePreferenceContract(t);
    const extra: Partial<FlexibleTaskAIContext> = {};
    if (weekly) extra.ariaWeeklyOccurrenceContract = weekly;
    if (daysC) extra.ariaPreferredDaysContract = daysC;
    if (timeC) extra.ariaTimePreferenceContract = timeC;
    if (Object.keys(extra).length === 0) return t;
    return { ...t, ...extra };
  });
}

export interface AriaResponse {
  events: ScheduledEvent[];
  explanation: string;
}

interface CallArgs {
  state: AriaState;
  history: ChatMessage[];
  userMessage: string;
}

export async function callAria({ state, history, userMessage }: CallArgs): Promise<AriaResponse> {
  const messages = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: userMessage },
  ];

  const fixedSlots = allFixedEventsForScheduling({ fixedBlocks: state.fixedBlocks, events: state.events });
  const flexRaw = state.events.filter((e) => e.kind === "flexible" || e.kind === "tentative");
  const flexPacked = resolveFlexTentativeOverlaps(
    flexRaw,
    fixedSlots,
    state.mealBreaks ?? [],
    state.preferences,
  );
  const mealSlotsPlaced = mealBreaksToEvents(state.mealBreaks ?? [], fixedSlots, flexPacked);
  const flexBumped = bumpFlexEventsClearOfMeals(flexPacked, mealSlotsPlaced, fixedSlots);
  const nonFlexEvents = state.events.filter((e) => e.kind !== "flexible" && e.kind !== "tentative");

  const context = {
    fixedBlocks: state.fixedBlocks,
    mealBreaks: state.mealBreaks ?? [],
    /** Exact meal intervals after client placement (meals avoid fixed + flex when possible; flex may still be nudged for AI context). */
    mealSlotsPlaced: mealSlotsPlaced.map((e) => ({
      day: e.day,
      start: e.start,
      end: e.end,
      label: e.title,
    })),
    tasks: tasksForAIContext(state.tasks, state.preferences.freeDays ?? []),
    preferences: state.preferences,
    currentEvents: [...nonFlexEvents, ...flexBumped],
  };

  const { data, error } = await supabase.functions.invoke("aria-ai", {
    body: { messages, context },
  });

  if (error) {
    // Try to surface the response body for friendly errors
    const ctx: any = (error as any).context;
    if (ctx?.status === 429) throw new Error("Aria is getting a lot of requests right now. Try again in a moment.");
    if (ctx?.status === 402) throw new Error("AI credits are exhausted. Add credits in workspace settings.");
    throw new Error(error.message || "Aria couldn't reach the AI service.");
  }

  if (!data || data.error) {
    throw new Error(data?.error || "Aria returned an empty response.");
  }

  return data as AriaResponse;
}
