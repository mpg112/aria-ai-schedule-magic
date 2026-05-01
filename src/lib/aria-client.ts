import { supabase } from "@/integrations/supabase/client";
import { AriaState, ChatMessage, ScheduledEvent } from "./aria-types";

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
    tasks: state.tasks,
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
