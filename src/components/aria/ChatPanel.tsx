import { useState, useRef, useEffect } from "react";
import { Copy, Loader2, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChatMessage, ChatOverlapPrompt } from "@/lib/aria-types";
import { cn } from "@/lib/utils";

interface Props {
  messages: ChatMessage[];
  onSend: (text: string) => Promise<void>;
  loading: boolean;
  /** When set, empty state shows a primary “Generate my week” button that sends this text. */
  generateWeekMessage?: string;
  usageSummary?: {
    requests: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  onCopyUsage?: () => void;
  /** Resolve overlap confirmation chips on the last assistant turn (calendar bump vs fixed blocks). */
  onOverlapPromptResolve?: (prompt: ChatOverlapPrompt, accept: boolean) => void;
}

const QUICK = [
  "Find me 2 hours for a run this week",
  "Move laundry to Sunday morning",
  "I need a quiet evening on Wednesday",
  "Pack tomorrow lighter",
];

export default function ChatPanel({
  messages,
  onSend,
  loading,
  generateWeekMessage,
  usageSummary,
  onCopyUsage,
  onOverlapPromptResolve,
}: Props) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const submit = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    await onSend(text);
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-card border rounded-xl shadow-soft overflow-hidden">
      <div className="px-4 py-3 border-b flex items-center gap-2 bg-muted/30">
        <div className="h-7 w-7 rounded-full bg-primary/10 grid place-items-center text-primary">
          <Sparkles className="h-3.5 w-3.5" />
        </div>
        <div>
          <div className="text-sm font-semibold leading-tight">Aria</div>
          <div className="text-[11px] text-muted-foreground">Your scheduling assistant</div>
        </div>
        {usageSummary ? (
          <div className="ml-auto flex items-center gap-2">
            <div className="text-right leading-tight">
              <div className="text-[10px] text-muted-foreground">Session tokens</div>
              <div className="text-[11px] font-medium tabular-nums">
                {usageSummary.totalTokens.toLocaleString()} ({usageSummary.requests} calls)
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-7 w-7"
              title="Copy token usage summary"
              onClick={onCopyUsage}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : null}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && !loading && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Hi — I'm Aria. Use{" "}
              <span className="font-semibold text-foreground">Generate my week</span> to fill your calendar from your
              tasks and fixed blocks, or type a request below.
            </p>
            {generateWeekMessage ? (
              <Button
                className="w-full gap-2"
                disabled={loading}
                onClick={() => void onSend(generateWeekMessage)}
              >
                <Sparkles className="h-4 w-4" />
                Generate my week
              </Button>
            ) : null}
            <div className="space-y-1.5">
              {QUICK.map((q) => (
                <button
                  key={q}
                  onClick={() => setInput(q)}
                  className="w-full text-left text-xs px-3 py-2 rounded-lg border bg-background hover:border-primary/40 hover:bg-primary/5 transition-colors text-muted-foreground hover:text-foreground"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={`${m.timestamp}-${i}`} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[88%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap",
                m.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-sm"
                  : "bg-muted text-foreground rounded-bl-sm"
              )}
            >
              {m.content}
              {m.role === "assistant" && m.overlapPrompt && onOverlapPromptResolve ? (
                <div className="mt-3 pt-2 border-t border-border/60 space-y-2">
                  <p className="text-xs text-muted-foreground leading-snug">
                    Fixed commitments involved:{" "}
                    <span className="font-medium text-foreground">{m.overlapPrompt.conflictSummaries.join(" · ")}</span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={loading}
                      onClick={() => onOverlapPromptResolve(m.overlapPrompt!, true)}
                    >
                      Yes, overlap them
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={loading}
                      onClick={() => onOverlapPromptResolve(m.overlapPrompt!, false)}
                    >
                      No, keep the adjusted time
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-muted text-muted-foreground rounded-2xl rounded-bl-sm px-3.5 py-2 text-sm flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
            </div>
          </div>
        )}
      </div>

      <div className="p-3 border-t bg-muted/20">
        <div className="relative">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Ask Aria to adjust your week…"
            className="min-h-[60px] resize-none pr-11 text-sm"
            disabled={loading}
          />
          <Button
            size="icon"
            onClick={submit}
            disabled={loading || !input.trim()}
            className="absolute right-2 bottom-2 h-8 w-8"
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
