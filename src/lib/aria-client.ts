import { supabase } from "@/integrations/supabase/client";
import { AriaState, ChatMessage, DAYS, DayKey, FlexibleTask, ScheduledEvent } from "./aria-types";

/** Extra fields on tasks in the AI payload only (not persisted). */
export type FlexibleTaskAIContext = FlexibleTask & { ariaSchedulingContract?: string };

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

function tasksForAIContext(tasks: FlexibleTask[], freeDays: DayKey[]): FlexibleTaskAIContext[] {
  return tasks.map((t) =>
    t.frequency === "daily"
      ? { ...t, ariaSchedulingContract: buildDailySchedulingContract(t, freeDays) }
      : t,
  );
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

  const context = {
    fixedBlocks: state.fixedBlocks,
    tasks: tasksForAIContext(state.tasks, state.preferences.freeDays ?? []),
    preferences: state.preferences,
    currentEvents: state.events,
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
