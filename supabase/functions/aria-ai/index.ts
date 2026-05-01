// Aria AI edge function - calls Lovable AI Gateway (Gemini)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are Aria, a thoughtful AI scheduling assistant.

You receive:
- The user's fixed weekly blocks (work, class) — IMMOVABLE.
- A list of flexible tasks the user wants to fit in (with duration, frequency, preferred time-of-day, preferred day, priority).
- The user's preferences (morning start, cluster vs spread errands, protect evenings, free days).
- The current weekly schedule (already-placed events).
- A conversation history and the latest user message.

Rules:
- Days are "Mon" "Tue" "Wed" "Thu" "Fri" "Sat" "Sun".
- Times are 24h "HH:MM".
- NEVER overlap a flexible task with a fixed block.
- Respect free days and protected evenings (after 19:00) when "protectEvenings" is true.
- Honor priorities: high > medium > low. Lower-priority flexible tasks may be moved/dropped to make room for higher-priority ones when explicitly requested.
- Cluster errands together if "clusterErrands" is true; otherwise spread them across the week.
- Honor preferred time-of-day: morning = 06:00-12:00, afternoon = 12:00-17:00, evening = 17:00-22:00.
- Aim to schedule each task according to its frequency (once = 1x, weekly = 1x, as needed = 0-1x unless asked).
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
                description: "All scheduled events for the week (complete list).",
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
