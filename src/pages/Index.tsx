import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Plus, RotateCcw, Wand2, Settings2 } from "lucide-react";
import OnboardingWizard from "@/components/aria/OnboardingWizard";
import AriaLogoMark from "@/components/aria/AriaLogoMark";
import CalendarGrid from "@/components/aria/CalendarGrid";
import ChatPanel from "@/components/aria/ChatPanel";
import AddCommitmentModal, { NewCommitment } from "@/components/aria/AddCommitmentModal";
import ProfileSwitcher from "@/components/aria/ProfileSwitcher";
import { AriaState, ChatMessage, EMPTY_STATE, ProfilesRootState } from "@/lib/aria-types";
import {
  clearState,
  createDefaultProfilesRoot,
  loadProfilesRoot,
  saveProfilesRoot,
  uid,
} from "@/lib/aria-storage";
import { enrichEventsWithTaskEmojis, fixedBlocksToEvents, mergeDayBoundsForCalendar } from "@/lib/schedule-utils";
import { callAria } from "@/lib/aria-client";
import { getDemoState } from "@/lib/demo-data";

const Index = () => {
  const [profilesRoot, setProfilesRoot] = useState<ProfilesRootState>(createDefaultProfilesRoot());
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [scheduleSettingsOpen, setScheduleSettingsOpen] = useState(false);
  const [wizardMountKey, setWizardMountKey] = useState(0);
  const [newUserWizardOpen, setNewUserWizardOpen] = useState(false);
  const [pendingNewUserName, setPendingNewUserName] = useState<string | null>(null);
  const [newUserWizardKey, setNewUserWizardKey] = useState(0);

  useEffect(() => {
    setProfilesRoot(loadProfilesRoot());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveProfilesRoot(profilesRoot);
  }, [profilesRoot, hydrated]);

  const activeProfile = useMemo(
    () => profilesRoot.profiles.find((p) => p.id === profilesRoot.activeProfileId) ?? profilesRoot.profiles[0],
    [profilesRoot],
  );

  const state = activeProfile?.aria ?? EMPTY_STATE;

  const setAria = useCallback((u: AriaState | ((prev: AriaState) => AriaState)) => {
    setProfilesRoot((root) => {
      const id = root.activeProfileId;
      const idx = root.profiles.findIndex((p) => p.id === id);
      if (idx < 0) return root;
      const prev = root.profiles[idx]!.aria;
      const nextAria = typeof u === "function" ? (u as (p: AriaState) => AriaState)(prev) : u;
      const profiles = root.profiles.slice();
      profiles[idx] = { ...profiles[idx]!, aria: nextAria };
      return { ...root, profiles };
    });
  }, []);

  const allEvents = useMemo(() => {
    const fixed = fixedBlocksToEvents(state.fixedBlocks);
    const fixedIds = new Set(fixed.map((f) => f.id));
    const others = state.events.filter((e) => e.kind !== "fixed" && !fixedIds.has(e.id));
    return enrichEventsWithTaskEmojis([...fixed, ...others], state.tasks, state.customTaskCategories);
  }, [state.fixedBlocks, state.events, state.tasks, state.customTaskCategories]);

  const calendarBounds = useMemo(
    () => mergeDayBoundsForCalendar(state.preferences.dayStart, state.preferences.dayEnd, allEvents),
    [state.preferences.dayStart, state.preferences.dayEnd, allEvents],
  );

  const handleWizardComplete = async (next: AriaState) => {
    if (newUserWizardOpen && pendingNewUserName) {
      const id = uid();
      const trimmed = pendingNewUserName.trim();
      setProfilesRoot((r) => ({
        ...r,
        profiles: [...r.profiles, { id, name: trimmed, aria: next }],
        activeProfileId: id,
      }));
      setNewUserWizardOpen(false);
      setPendingNewUserName(null);
      toast.success(`Created calendar for ${trimmed}`);
      return;
    }

    const fromSettings = scheduleSettingsOpen;
    setAria(() => next);
    if (fromSettings) {
      setScheduleSettingsOpen(false);
      const shouldReplan = next.onboarded && next.tasks.length > 0;
      if (shouldReplan) {
        const regenPrompt =
          "I just saved updated schedule preferences in my app state (see context JSON: preferences.morningStart, preferredGapBetweenTasksMin, protectEvenings, protectEveningsFrom, freeDays, etc.). Regenerate my FULL week now: keep the same fixed blocks and the same tasks, but replace flexible-task placements so they strictly honor these NEW preferences. Treat preferences.morningStart as the earliest usual start time for flexible tasks; leave at least preferences.preferredGapBetweenTasksMin minutes between adjacent flexible blocks on the same day when it fits around fixed blocks and other rules; do not change fixed blocks. Return the complete updated schedule.";
        const ok = await sendToAria(regenPrompt, { silent: true, stateOverride: next });
        if (ok) {
          toast.success("Preferences saved — your week was replanned with the new settings.");
        } else {
          toast.warning(
            "Preferences saved. The week couldn’t be rebuilt automatically — ask Aria in chat to regenerate your week.",
          );
        }
      } else {
        toast.success("Schedule setup saved.");
      }
    } else {
      toast.success("You're all set! Use the chat to have Aria build or adjust this calendar.");
    }
  };

  const openScheduleSettings = () => {
    setNewUserWizardOpen(false);
    setPendingNewUserName(null);
    setWizardMountKey((k) => k + 1);
    setScheduleSettingsOpen(true);
  };

  const sendToAria = async (
    userText: string,
    opts?: { silent?: boolean; stateOverride?: AriaState },
  ): Promise<boolean> => {
    const base = opts?.stateOverride ?? state;
    const userMsg: ChatMessage = { role: "user", content: userText, timestamp: Date.now() };
    const newHistory = [...base.chat, userMsg];
    if (!opts?.silent) {
      setAria((s) => ({ ...s, chat: newHistory }));
    }
    setLoading(true);
    try {
      const res = await callAria({
        state: { ...base, chat: newHistory },
        history: base.chat,
        userMessage: userText,
      });
      const aiMsg: ChatMessage = { role: "assistant", content: res.explanation, timestamp: Date.now() };
      setAria((s) => ({
        ...s,
        events: res.events,
        chat: opts?.silent ? [...s.chat, aiMsg] : [...newHistory, aiMsg],
      }));
      return true;
    } catch (e: any) {
      toast.error(e.message || "Aria ran into an issue.");
      const errMsg: ChatMessage = {
        role: "assistant",
        content: `Sorry — ${e.message || "I couldn't update the schedule."}`,
        timestamp: Date.now(),
      };
      setAria((s) => ({
        ...s,
        chat: opts?.silent ? [...s.chat, errMsg] : [...newHistory, errMsg],
      }));
      return false;
    } finally {
      setLoading(false);
    }
  };

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
    setAria(() => getDemoState());
    toast.success("Demo data loaded for this calendar — use chat to have Aria plan the week.");
  };

  const resetAll = () => {
    if (!confirm("Reset all profiles and calendars on this device?")) return;
    clearState();
    setProfilesRoot(createDefaultProfilesRoot());
    toast.success("Reset.");
  };

  const handleStartAddUser = (name: string) => {
    setScheduleSettingsOpen(false);
    setPendingNewUserName(name);
    setNewUserWizardKey((k) => k + 1);
    setNewUserWizardOpen(true);
  };

  const wizardOpen = scheduleSettingsOpen || !state.onboarded || newUserWizardOpen;
  const wizardVariant = newUserWizardOpen ? "newUser" : scheduleSettingsOpen ? "settings" : "onboarding";
  const wizardInitial = newUserWizardOpen ? EMPTY_STATE : state;
  const wizardKey = newUserWizardOpen ? `new-user-${newUserWizardKey}` : `main-${wizardMountKey}`;

  if (!hydrated) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/60 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AriaLogoMark size="sm" decorative />
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
                <Button variant="outline" size="sm" onClick={openScheduleSettings} className="gap-1.5">
                  <Settings2 className="h-3.5 w-3.5" /> Settings
                </Button>
                <Button onClick={() => setAddOpen(true)} variant="outline" size="sm" className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> Add commitment
                </Button>
                <ProfileSwitcher
                  profiles={profilesRoot.profiles}
                  activeId={profilesRoot.activeProfileId}
                  onSelect={(id) => setProfilesRoot((r) => ({ ...r, activeProfileId: id }))}
                  onStartAddUser={handleStartAddUser}
                  onRenameProfile={(id, name) =>
                    setProfilesRoot((r) => ({
                      ...r,
                      profiles: r.profiles.map((p) => (p.id === id ? { ...p, name } : p)),
                    }))
                  }
                />
              </>
            )}
          </div>
        </div>
      </header>

      {state.onboarded && (
        <main className="max-w-[1600px] mx-auto px-6 py-5 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">
          <div className="space-y-3">
            {state.tasks.length === 0 && (
              <div className="rounded-xl border border-dashed bg-card/50 px-5 py-6 text-center">
                <div className="text-sm font-medium mb-1">Your week is empty</div>
                <div className="text-xs text-muted-foreground mb-3">
                  Add some tasks (or click <span className="font-medium text-foreground">Load demo data</span>) — then
                  use the chat to have Aria plan your week.
                </div>
                <Button size="sm" variant="outline" onClick={loadDemo} className="gap-1.5">
                  <Wand2 className="h-3.5 w-3.5" /> Load demo data
                </Button>
              </div>
            )}
            <CalendarGrid
              events={allEvents}
              dayStart={calendarBounds.dayStart}
              dayEnd={calendarBounds.dayEnd}
            />
            <Legend />
          </div>
          <div className="lg:h-[calc(100vh-100px)] lg:sticky lg:top-[76px]">
            <ChatPanel messages={state.chat} onSend={(t) => sendToAria(t)} loading={loading} />
          </div>
        </main>
      )}

      <OnboardingWizard
        key={wizardKey}
        open={wizardOpen}
        initial={wizardInitial}
        onComplete={handleWizardComplete}
        variant={wizardVariant}
        onRequestClose={() => {
          if (newUserWizardOpen) {
            setNewUserWizardOpen(false);
            setPendingNewUserName(null);
          } else {
            setScheduleSettingsOpen(false);
          }
        }}
      />

      <AddCommitmentModal open={addOpen} onOpenChange={setAddOpen} onSubmit={addCommitment} loading={loading} />
    </div>
  );
};

function Legend() {
  const items: { label: string; cls: string }[] = [
    { label: "Fixed (work/class)", cls: "bg-neutral-200 dark:bg-neutral-700" },
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
