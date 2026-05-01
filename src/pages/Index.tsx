import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Sparkles, Plus, RotateCcw, Loader2, Wand2 } from "lucide-react";
import OnboardingWizard from "@/components/aria/OnboardingWizard";
import CalendarGrid from "@/components/aria/CalendarGrid";
import ChatPanel from "@/components/aria/ChatPanel";
import AddCommitmentModal, { NewCommitment } from "@/components/aria/AddCommitmentModal";
import { AriaState, ChatMessage, EMPTY_STATE } from "@/lib/aria-types";
import { loadState, saveState, clearState, uid } from "@/lib/aria-storage";
import { fixedBlocksToEvents } from "@/lib/schedule-utils";
import { callAria } from "@/lib/aria-client";
import { getDemoState } from "@/lib/demo-data";

const Index = () => {
  const [state, setState] = useState<AriaState>(EMPTY_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    setState(loadState());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveState(state);
  }, [state, hydrated]);

  // Combine fixed blocks (always rendered) with any AI-placed events
  const allEvents = useMemo(() => {
    const fixed = fixedBlocksToEvents(state.fixedBlocks);
    // Drop any AI events that duplicate a fixed-block id
    const fixedIds = new Set(fixed.map((f) => f.id));
    const others = state.events.filter((e) => e.kind !== "fixed" && !fixedIds.has(e.id));
    return [...fixed, ...others];
  }, [state.fixedBlocks, state.events]);

  const completeOnboarding = (next: AriaState) => {
    setState(next);
    toast.success("You're all set! Generate your week to see Aria in action.");
  };

  const sendToAria = async (userText: string, opts?: { silent?: boolean }) => {
    const userMsg: ChatMessage = { role: "user", content: userText, timestamp: Date.now() };
    const newHistory = [...state.chat, userMsg];
    if (!opts?.silent) {
      setState((s) => ({ ...s, chat: newHistory }));
    }
    setLoading(true);
    try {
      const res = await callAria({
        state: { ...state, chat: newHistory },
        history: state.chat,
        userMessage: userText,
      });
      const aiMsg: ChatMessage = { role: "assistant", content: res.explanation, timestamp: Date.now() };
      setState((s) => ({
        ...s,
        events: res.events,
        chat: opts?.silent ? [...s.chat, aiMsg] : [...newHistory, aiMsg],
      }));
    } catch (e: any) {
      toast.error(e.message || "Aria ran into an issue.");
      const errMsg: ChatMessage = {
        role: "assistant",
        content: `Sorry — ${e.message || "I couldn't update the schedule."}`,
        timestamp: Date.now(),
      };
      setState((s) => ({ ...s, chat: opts?.silent ? [...s.chat, errMsg] : [...newHistory, errMsg] }));
    } finally {
      setLoading(false);
    }
  };

  const generateWeek = () =>
    sendToAria(
      "Please generate my full week now. Place all my flexible tasks around the fixed blocks, respecting my preferences and priorities. Return the complete schedule."
    );

  const addCommitment = async (c: NewCommitment) => {
    const desc = [
      `Add a new commitment: "${c.title}".`,
      `Duration: ${c.durationMin} minutes. Category: ${c.category}. Priority: ${c.priority}.`,
      c.fixedTime && c.fixedDay && c.fixedStart
        ? `It must be placed at ${c.fixedDay} ${c.fixedStart}.`
        : "Find the best slot in the week.",
      c.hasDeadline && c.deadlineDay ? `It must be done by end of ${c.deadlineDay}.` : "",
      c.canDisplace
        ? "You may move lower-priority flexible tasks to make room."
        : "Do not displace any other tasks.",
      "Return the full updated schedule.",
    ].filter(Boolean).join(" ");

    setAddOpen(false);
    await sendToAria(desc);
  };

  const loadDemo = () => {
    const demo = getDemoState();
    setState(demo);
    toast.success("Demo data loaded — hit Generate my week to see Aria plan it.");
  };

  const resetAll = () => {
    if (!confirm("Reset all of Aria's data? This clears your schedule.")) return;
    clearState();
    setState({ ...EMPTY_STATE });
    toast.success("Reset.");
  };

  if (!hydrated) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/60 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary text-primary-foreground grid place-items-center shadow-soft">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h1 className="font-display text-2xl leading-none">Aria</h1>
              <div className="text-[11px] text-muted-foreground mt-0.5">AI scheduling assistant</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {state.onboarded && state.tasks.length === 0 && (
              <Button variant="outline" size="sm" onClick={loadDemo} className="gap-1.5">
                <Wand2 className="h-3.5 w-3.5" /> Load demo data
              </Button>
            )}
            {state.onboarded && (
              <>
                <Button variant="ghost" size="sm" onClick={resetAll} className="gap-1.5 text-muted-foreground">
                  <RotateCcw className="h-3.5 w-3.5" /> Reset
                </Button>
                <Button onClick={() => setAddOpen(true)} variant="outline" size="sm" className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> Add commitment
                </Button>
                <Button onClick={generateWeek} disabled={loading} size="sm" className="gap-1.5">
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  Generate my week
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main */}
      {state.onboarded && (
        <main className="max-w-[1600px] mx-auto px-6 py-5 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">
          <div className="space-y-3">
            {state.tasks.length === 0 && (
              <div className="rounded-xl border border-dashed bg-card/50 px-5 py-6 text-center">
                <div className="text-sm font-medium mb-1">Your week is empty</div>
                <div className="text-xs text-muted-foreground mb-3">
                  Add some tasks (or click <span className="font-medium text-foreground">Load demo data</span>) — then hit Generate my week.
                </div>
                <Button size="sm" variant="outline" onClick={loadDemo} className="gap-1.5">
                  <Wand2 className="h-3.5 w-3.5" /> Load demo data
                </Button>
              </div>
            )}
            <CalendarGrid
              events={allEvents}
              dayStart={state.preferences.dayStart}
              dayEnd={state.preferences.dayEnd}
            />
            <Legend />
          </div>
          <div className="lg:h-[calc(100vh-100px)] lg:sticky lg:top-[76px]">
            <ChatPanel
              messages={state.chat}
              onSend={(t) => sendToAria(t)}
              loading={loading}
            />
          </div>
        </main>
      )}

      <OnboardingWizard
        open={!state.onboarded}
        initial={state}
        onComplete={completeOnboarding}
      />

      <AddCommitmentModal
        open={addOpen}
        onOpenChange={setAddOpen}
        onSubmit={addCommitment}
        loading={loading}
      />
    </div>
  );
};

function Legend() {
  const items: { label: string; cls: string }[] = [
    { label: "Fixed (work/class)", cls: "bg-cat-work" },
    { label: "Home", cls: "bg-cat-home" },
    { label: "Health", cls: "bg-cat-health" },
    { label: "Personal", cls: "bg-cat-personal" },
    { label: "Social", cls: "bg-cat-social" },
    { label: "Admin", cls: "bg-cat-admin" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-[11px] text-muted-foreground">
      {items.map((i) => (
        <div key={i.label} className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-sm ${i.cls}`} />
          {i.label}
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm hatched border border-border" /> Tentative
      </div>
    </div>
  );
}

export default Index;
