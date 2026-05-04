// Aria AI edge function - calls Lovable AI Gateway (Gemini)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const DAY_ENUM = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const CATEGORY_ENUM = ["work", "home", "health", "personal", "social", "admin", "other"] as const;

const SYSTEM_PROMPT = `You are Aria, a thoughtful AI scheduling assistant.

You receive:
- The user's fixed weekly blocks (fixedBlocks[]) — each row has a stable **id**. By default these behave like hard weekly commitments for placement.
- Optional mealBreaks[]: user meal rules (kind, days, window, duration). **mealSlotsPlaced[]** is computed on the client from mealBreaks plus **every** fixed interval (recurring fixedBlocks **and** any \`kind: "fixed"\` rows already in currentEvents), and meals **slide within their windows** to avoid overlapping flexible/tentative when a gap exists (e.g. dinner shifts after an evening catch-up). Meals are **soft**: they never overlap true fixed time; small spill outside the meal window is only used when unavoidable. **flexible/tentative** may still be client-nudged slightly for AI context. Later meals avoid earlier placed meals that day (breakfast → lunch → dinner).
- A list of flexible tasks (duration, frequency once/weekly/monthly/daily, priority; for weekly tasks also timesPerWeekMin/timesPerWeekMax = how many sessions per week e.g. 3–4 for gym; for daily tasks timesPerDay = 1–4 sessions every calendar day and preferredTimeStyle is always "windows" with exactly timesPerDay entries in preferredTimeWindows — the i-th window is the preferred band for the i-th occurrence that day (morning walk vs evening walk, etc.); preferredTimeStyle preset vs windows for non-daily tasks; preferredWeekdays (not used for daily), monthly hints monthWeekOrdinal/monthDaysOfMonth, schedulingNotes free text).
- The user's preferences: preferences.morningStartWeekday and preferences.morningStartWeekend = earliest usual time to *schedule* flexible tasks on Mon–Fri vs Sat–Sun (often the same; user may start later on weekends); preferredGapBetweenTasksMin; protect evenings + protectEveningsFrom; free days. preferences.dayStart and preferences.dayEnd appear in JSON for UI only—they control calendar grid hours shown to the user, NOT valid scheduling bounds unless the user says otherwise in chat.
- The current weekly schedule (already-placed events).
- A conversation history and the latest user message.

Rules:
- Days are "Mon" "Tue" "Wed" "Thu" "Fri" "Sat" "Sun".
- Times are 24h "HH:MM".
- CRITICAL — tasks with frequency "daily": timesPerDay means that many SEPARATE flexible events EVERY eligible day (all days except preferences.freeDays), including Saturday and Sunday unless those days are in freeDays. Example: timesPerDay=3 and no free days ⇒ 21 events for that task in the week (3×7), NOT 7 and NOT 3. If a task JSON includes ariaSchedulingContract, follow it exactly for counts and ids.
- CRITICAL — tasks with frequency "weekly" and timesPerWeekMin/timesPerWeekMax not both 1: if a task JSON includes ariaWeeklyOccurrenceContract, follow it exactly—output that many distinct flexible events for that task id (count them before returning).
- NEVER overlap a flexible or tentative task with a **fixed** block (from fixedBlocks or a \`kind: "fixed"\` row in currentEvents). Strongly avoid overlapping flexible/tentative with mealSlotsPlaced; if you truly cannot fit a movable task otherwise, you may overlap a meal interval slightly and say so briefly.
- **User asks to replace or cancel routine dinner on a named weekday** (e.g. "replace Tuesday dinner with mentor at 8pm", or "I'm not doing dinner on Sunday — instead schedule catch-up with Laura at 7pm"): use **mealBreakUpdates** / **fixedBlockUpdates** for **that** weekday—not only Friday. Use **ariaStructuralHints.dinnerMealBreakId** when present. Add that weekday to dinner **skipDays** (or shrink **fixedBlockUpdates.days**) so the usual dinner does **not** remain alongside the replacement. The replacement MUST be \`kind: "fixed"\` at the **exact** clock time the user gave (convert 8pm→20:00)—do **not** emit it as flexible slid to a later hour (e.g. 21:00) to dodge the old dinner.
- **User asks to remove or shrink a recurring fixed weekly block** on certain days (e.g. "drop my standing Friday dinner"): use **fixedBlockUpdates** with the block **id** from context.fixedBlocks or **ariaStructuralHints.fridayFixedBlocks** — remove that weekday from **days** (or **days: []** to delete the block).
- **One-off commitments at a specific clock time** (concert, flight, doctor, hard appointment)—including user chat like "Saturday 6pm concert"—MUST be \`kind: "fixed"\` with that exact start/end, even though they are not listed in fixedBlocks. Fixed rows always beat meal windows; the client redraws meals around them.
- **Fixed one-offs in currentEvents**: Include EVERY \`kind: "fixed"\` row you want to keep this week in \`events\`. Rows you omit are **removed**, except rows with \`userPinned: true\` (the user locked those in the app editor)—never drop or move userPinned rows; echo them back unchanged unless the user explicitly asks to change them.
- If currentEvents contains a userPinned fixed row (same **id** as before), you MUST echo it back with the **same id, day, start, and end** unless the user explicitly asked to change that commitment.
- Respect free days and protected evenings on weeknights (Mon–Fri) when "protectEvenings" is true: avoid placing flexible tasks that start at or after preferences.protectEveningsFrom (24h "HH:MM", e.g. 19:00) through the rest of that weekday (through 24:00). Do not use preferences.dayStart/dayEnd to define "day ends" for this rule.
- Honor priorities: high > medium > low. Lower-priority flexible tasks may be moved/dropped to make room for higher-priority ones when explicitly requested.
- Prefer at least preferences.preferredGapBetweenTasksMin minutes between adjacent flexible-task blocks on the same day when it fits around fixed blocks, free days, evening protection, and priorities — place tasks closer together when needed to satisfy harder constraints.
- preferences.morningStartWeekday / morningStartWeekend are **soft** default earliest starts for flexible tasks—not hard curfews. If a task is morning-preferred (preset "morning" or a morning preferredTimeWindows band) and room exists around fixed blocks and mealSlotsPlaced, you SHOULD schedule it earlier than morningStart when that clearly fits (e.g. gym 06:30–07:30 with breakfast immediately after in mealSlotsPlaced). Still never violate **fixed** intervals for flexible/tentative tasks.
- Same-day ordering: if a flexible task’s preferred band (preset or preferredTimeWindows) starts **earlier** than the **breakfast** meal window on that day, place that task **before** breakfast when both can fit (gym then breakfast), unless the user’s chat message explicitly asks to swap or override.
- Honor time preferences: if preferredTimeStyle is "preset", morning ≈ 06:00-12:00, afternoon ≈ 12:00-17:00, evening ≈ 17:00-22:00. If "windows", respect preferredTimeWindows start/end pairs when placing tasks.
- If a task row includes **ariaTimePreferenceContract** or **ariaPreferredDaysContract**, follow those strings exactly—they restate the user’s time windows and allowed weekdays in imperative form.
- Honor preferredWeekdays when non-empty (ignore for daily): never place that task on a day outside the listed weekdays. For monthly tasks, also respect monthWeekOrdinal (e.g. third Tue) and monthDaysOfMonth when provided; read schedulingNotes for extra constraints (ranges of dates, exceptions, etc.).
- Aim to schedule each task according to its frequency (once = 1x in the week; weekly uses timesPerWeekMin–timesPerWeekMax when present — place that many distinct occurrences in the week, default 1–1 ≈ once per week; monthly ≈ 1x in the month unless notes say otherwise; daily = on each day not in preferences.freeDays place timesPerDay distinct sessions, each within its matching preferredTimeWindows[i] band when possible).
- For weekly tasks with timesPerWeekMin–timesPerWeekMax > 1 (e.g. gym 3–4×/wk), you MUST output that many separate flexible events in the week whenever it is **physically possible** alongside fixed blocks, mealSlotsPlaced, freeDays, evening protection, and other higher-priority items—do not silently drop sessions if earlier morning or weekend slots are free.
- Keep events in 15-minute increments.
- In update_schedule.events return ONLY fixed, flexible, and tentative rows. Never return kind "meal" in the tool output—the app draws meals from mealBreaks (after any mealBreakUpdates); prefer keeping flexible/tentative clear of mealSlotsPlaced when practical.
- **mealBreakUpdates** and **fixedBlockUpdates** are optional; omit them when the user did not ask to change underlying meal rules or fixed weekly blocks. Only reference **existing ids** from context — never invent new meal or fixed-block ids.

Before you call update_schedule, do a **quick self-check as the calendar owner** (no separate step needed): skim each day—would anything feel off, cramped, backwards, or unlike how a real person would want the week to feel, even if it technically satisfies rules? If yes, adjust in this same tool call (still obeying every rule above). The app also post-processes meal spacing on the client.

You MUST respond by calling the "update_schedule" tool with the COMPLETE updated event list (replace, not patch), optional structural patches if needed, and a short, friendly explanation of what you changed and why.`;

function toNonNegInt(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, context } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const contextMessage = {
      role: "user" as const,
      content: `CURRENT SCHEDULING CONTEXT (JSON):\n${JSON.stringify(context, null, 2)}`,
    };

    const tools = [
      {
        type: "function",
        function: {
          name: "update_schedule",
          description:
            "Return the complete updated weekly schedule, optional edits to meal rules / fixed weekly blocks, and a short explanation.",
          parameters: {
            type: "object",
            properties: {
              events: {
                type: "array",
                description:
                  "All scheduled events for the week (complete list): only fixed, flexible, and tentative. Do NOT emit meal rows—meals are client-side from mealBreaks. For each flexible task with frequency daily and timesPerDay N, include N distinct flexible events on every day not in preferences.freeDays (each with a unique id). For each weekly task with timesPerWeekMin M (and ariaWeeklyOccurrenceContract if present), include at least M distinct flexible events that week for that task (unique ids).",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    title: { type: "string" },
                    day: {
                      type: "string",
                      enum: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
                    },
                    start: {
                      type: "string",
                      description: "24h HH:MM",
                    },
                    end: { type: "string", description: "24h HH:MM" },
                    kind: {
                      type: "string",
                      enum: ["fixed", "flexible", "tentative"],
                    },
                    category: {
                      type: "string",
                      enum: [
                        "work",
                        "home",
                        "health",
                        "personal",
                        "social",
                        "admin",
                        "other",
                      ],
                    },
                    priority: {
                      type: "string",
                      enum: ["high", "medium", "low"],
                    },
                  },
                  required: ["id", "title", "day", "start", "end", "kind", "category"],
                  additionalProperties: false,
                },
              },
              explanation: {
                type: "string",
                description: "Short, friendly plain-language explanation.",
              },
              mealBreakUpdates: {
                type: "array",
                description:
                  "Optional patches to existing mealBreaks rows (same id as in context). Use skipDays or days to free a weekday for a replacement fixed social meal.",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string", description: "Existing mealBreak id from context" },
                    kind: { type: "string", enum: ["breakfast", "lunch", "dinner"] },
                    enabled: { type: "boolean" },
                    days: { type: "array", items: { type: "string", enum: [...DAY_ENUM] } },
                    skipDays: {
                      type: "array",
                      items: { type: "string", enum: [...DAY_ENUM] },
                      description: "Weekdays when this meal rule should not run.",
                    },
                    windowStart: { type: "string", description: "24h HH:MM" },
                    windowEnd: { type: "string", description: "24h HH:MM" },
                    durationMin: { type: "number" },
                  },
                  required: ["id"],
                  additionalProperties: false,
                },
              },
              fixedBlockUpdates: {
                type: "array",
                description:
                  "Optional patches to existing fixedBlocks rows (same id as in context). Shrink days or use days: [] to remove a recurring block the user asked to drop.",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string", description: "Existing fixedBlocks id from context" },
                    title: { type: "string" },
                    days: { type: "array", items: { type: "string", enum: [...DAY_ENUM] } },
                    start: { type: "string", description: "24h HH:MM" },
                    end: { type: "string", description: "24h HH:MM" },
                    category: { type: "string", enum: [...CATEGORY_ENUM] },
                  },
                  required: ["id"],
                  additionalProperties: false,
                },
              },
            },
            required: ["events", "explanation"],
            additionalProperties: false,
          },
        },
      },
    ];

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            contextMessage,
            ...messages,
          ],
          tools,
          tool_choice: { type: "function", function: { name: "update_schedule" } },
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit reached. Please wait a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Add credits in workspace settings." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      console.error("Gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(
        JSON.stringify({
          error: "No tool call returned",
          fallback: data.choices?.[0]?.message?.content ?? "",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const args = JSON.parse(toolCall.function.arguments);
    const usage = {
      promptTokens: toNonNegInt(data?.usage?.prompt_tokens),
      completionTokens: toNonNegInt(data?.usage?.completion_tokens),
      totalTokens: toNonNegInt(data?.usage?.total_tokens),
      model: typeof data?.model === "string" ? data.model : undefined,
    };

    return new Response(JSON.stringify({ ...args, usage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("aria-ai error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
