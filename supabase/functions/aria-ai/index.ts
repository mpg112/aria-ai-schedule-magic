// Aria AI edge function - calls Lovable AI Gateway (Gemini)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are Aria, a thoughtful AI scheduling assistant.

You receive:
- The user's fixed weekly blocks (work, class) — IMMOVABLE.
- A list of flexible tasks (duration, frequency once/weekly/monthly/daily, priority; for weekly tasks also timesPerWeekMin/timesPerWeekMax = how many sessions per week e.g. 3–4 for gym; for daily tasks timesPerDay = 1–4 sessions every calendar day and preferredTimeStyle is always "windows" with exactly timesPerDay entries in preferredTimeWindows — the i-th window is the preferred band for the i-th occurrence that day (morning walk vs evening walk, etc.); preferredTimeStyle preset vs windows for non-daily tasks; preferredWeekdays (not used for daily), monthly hints monthWeekOrdinal/monthDaysOfMonth, schedulingNotes free text).
- The user's preferences: preferences.morningStart = earliest usual time to *schedule* flexible tasks; preferredGapBetweenTasksMin; protect evenings + protectEveningsFrom; free days. preferences.dayStart and preferences.dayEnd appear in JSON for UI only—they control calendar grid hours shown to the user, NOT valid scheduling bounds unless the user says otherwise in chat.
- The current weekly schedule (already-placed events).
- A conversation history and the latest user message.

Rules:
- Days are "Mon" "Tue" "Wed" "Thu" "Fri" "Sat" "Sun".
- Times are 24h "HH:MM".
- CRITICAL — tasks with frequency "daily": timesPerDay means that many SEPARATE flexible events EVERY eligible day (all days except preferences.freeDays), including Saturday and Sunday unless those days are in freeDays. Example: timesPerDay=3 and no free days ⇒ 21 events for that task in the week (3×7), NOT 7 and NOT 3. If a task JSON includes ariaSchedulingContract, follow it exactly for counts and ids.
- NEVER overlap a flexible task with a fixed block.
- Respect free days and protected evenings on weeknights (Mon–Fri) when "protectEvenings" is true: avoid placing flexible tasks that start at or after preferences.protectEveningsFrom (24h "HH:MM", e.g. 19:00) through the rest of that weekday (through 24:00). Do not use preferences.dayStart/dayEnd to define "day ends" for this rule.
- Honor priorities: high > medium > low. Lower-priority flexible tasks may be moved/dropped to make room for higher-priority ones when explicitly requested.
- Prefer at least preferences.preferredGapBetweenTasksMin minutes between adjacent flexible-task blocks on the same day when it fits around fixed blocks, free days, evening protection, and priorities — place tasks closer together when needed to satisfy harder constraints.
- Honor time preferences: if preferredTimeStyle is "preset", morning ≈ 06:00-12:00, afternoon ≈ 12:00-17:00, evening ≈ 17:00-22:00. If "windows", respect preferredTimeWindows start/end pairs when placing tasks.
- Honor preferredWeekdays when non-empty (ignore for daily). For monthly tasks, also respect monthWeekOrdinal (e.g. third Tue) and monthDaysOfMonth when provided; read schedulingNotes for extra constraints (ranges of dates, exceptions, etc.).
- Aim to schedule each task according to its frequency (once = 1x in the week; weekly uses timesPerWeekMin–timesPerWeekMax when present — place that many distinct occurrences in the week, default 1–1 ≈ once per week; monthly ≈ 1x in the month unless notes say otherwise; daily = on each day not in preferences.freeDays place timesPerDay distinct sessions, each within its matching preferredTimeWindows[i] band when possible).
- Keep events in 15-minute increments.

You MUST respond by calling the "update_schedule" tool with the COMPLETE updated event list (replace, not patch) and a short, friendly explanation of what you changed and why.`;

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
            "Return the complete updated weekly schedule and a short explanation.",
          parameters: {
            type: "object",
            properties: {
              events: {
                type: "array",
                description:
                  "All scheduled events for the week (complete list). For each flexible task with frequency daily and timesPerDay N, include N distinct flexible events on every day not in preferences.freeDays (each with a unique id).",
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
    return new Response(JSON.stringify(args), {
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
