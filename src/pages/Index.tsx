import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Link2, Plus, RotateCcw, Settings2, Wand2 } from "lucide-react";
import OnboardingWizard from "@/components/aria/OnboardingWizard";
import FirstLaunchPreamble from "@/components/aria/FirstLaunchPreamble";
import AriaLogoMark from "@/components/aria/AriaLogoMark";
import CalendarGrid from "@/components/aria/CalendarGrid";
import ChatPanel from "@/components/aria/ChatPanel";
import AddCommitmentModal, { NewCommitment } from "@/components/aria/AddCommitmentModal";
import ProfileSwitcher from "@/components/aria/ProfileSwitcher";
import EditScheduledEventModal, { findOnceTaskForEvent } from "@/components/aria/EditScheduledEventModal";
import {
  AriaState,
  CALENDAR_DENSITY_OPTIONS,
  ChatMessage,
  ChatOverlapPrompt,
  DayKey,
  EMPTY_STATE,
  ProfilesRootState,
  ScheduledEvent,
  normalizeFlexibleTask,
} from "@/lib/aria-types";
import {
  clearState,
  createDefaultProfilesRoot,
  loadProfilesRoot,
  saveProfilesRoot,
  uid,
} from "@/lib/aria-storage";
import { clearLaunchPreambleFlag, hasCompletedLaunchPreamble, setLaunchPreambleComplete } from "@/lib/launch-preamble";
import {
  allFixedEventsForScheduling,
  enrichEventsWithTaskEmojis,
  ensureWeeklyFlexibleMinPlacements,
  eventsTimeOverlap,
  fixedBlocksToEvents,
  fromMin,
  mealBreaksToEvents,
  mergePinnedUserFixedFromState,
  mergeDayBoundsForCalendar,
  storedUserPinnedFixedOnly,
  resolveFlexTentativeOverlaps,
  toMin,
} from "@/lib/schedule-utils";
import { callAria } from "@/lib/aria-client";
import {
  applyAriaScheduleSettingsPatch,
  hasStructuralSchedulePatch,
  type AriaScheduleSettingsPatch,
} from "@/lib/schedule-settings-patch";
import {
  inferFridayFriendsDinner730FixedEvent,
  inferReplacementDinnerFixedEvent,
  inferStandingDinnerRemovalPatch,
  stripConflictingReplacementFlexRows,
} from "@/lib/chat-schedule-inference";
import { findOverlapOfferContext } from "@/lib/overlap-offer";
import { getDemoState } from "@/lib/demo-data";
import { consumeShareTokenOnce, decodeShareSnapshot, encodeShareSnapshot } from "@/lib/share-snapshot";

/** Stops React Strict Mode from adding two “demo preset” profiles on one pageload. */
let urlBootstrapPresetDemoRan = false;

const GENERATE_FULL_WEEK_USER_MESSAGE =
  "Please generate my full week now. Place all my flexible tasks around the fixed blocks, respecting my preferences and priorities. Return the complete schedule.";

interface TokenUsageEntry {
  id: string;
  timestamp: number;
  userText: string;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  model?: string;
  source: "reported" | "estimated" | "unavailable";
}

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
  const [calendarEditEvent, setCalendarEditEvent] = useState<ScheduledEvent | null>(null);
  const [usageLog, setUsageLog] = useState<TokenUsageEntry[]>([]);
  const [usageOpen, setUsageOpen] = useState(false);
  /** After in-app welcome/intro/step preview, without waiting for another storage read. */
  const [preambleDismissed, setPreambleDismissed] = useState(false);

  useEffect(() => {
    let root = loadProfilesRoot();
    const params = new URLSearchParams(window.location.search);
    const pathAndHash = `${window.location.pathname}${window.location.hash}`;

    const token = params.get("share");
    if (token && consumeShareTokenOnce(token)) {
      const parsed = decodeShareSnapshot(token);
      if (parsed) {
        const id = uid();
        root = {
          ...root,
          profiles: [...root.profiles, { id, name: parsed.profileName, aria: parsed.aria }],
          activeProfileId: id,
        };
        window.history.replaceState({}, "", pathAndHash);
        queueMicrotask(() =>
          toast.success(`Opened “${parsed.profileName}” — switch profiles in the header anytime.`),
        );
      } else {
        window.history.replaceState({}, "", pathAndHash);
        queueMicrotask(() => toast.error("That share link is invalid or incomplete."));
      }
    } else if (params.get("preset")?.toLowerCase() === "demo" && !urlBootstrapPresetDemoRan) {
      urlBootstrapPresetDemoRan = true;
      const id = uid();
      root = {
        ...root,
        profiles: [...root.profiles, { id, name: "Demo calendar", aria: getDemoState() }],
        activeProfileId: id,
      };
      window.history.replaceState({}, "", pathAndHash);
      queueMicrotask(() =>
        toast.success("Loaded the built-in demo — try Generate my week, chat, or profiles."),
      );
    }

    setProfilesRoot(root);
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
    const fixed = allFixedEventsForScheduling({ fixedBlocks: state.fixedBlocks, events: state.events });
    const flexFromState = state.events.filter((e) => e.kind === "flexible" || e.kind === "tentative");
    const flexPacked = resolveFlexTentativeOverlaps(
      flexFromState,
      fixed,
      state.mealBreaks ?? [],
      state.preferences,
    );
    /** Meals shift around fixed + flex/tentative within each meal window when possible. */
    const meals = mealBreaksToEvents(state.mealBreaks ?? [], fixed, flexPacked);
    const fixedIds = new Set(fixed.map((f) => f.id));
    const mealIds = new Set(meals.map((m) => m.id));
    /** Meals are always derived from mealBreaks; drop any stale meal rows still stored in events (IDs can drift). */
    const others = state.events.filter(
      (e) =>
        e.kind !== "fixed" &&
        e.kind !== "meal" &&
        e.kind !== "flexible" &&
        e.kind !== "tentative" &&
        !String(e.id).startsWith("meal-") &&
        !fixedIds.has(e.id) &&
        !mealIds.has(e.id),
    );
    const merged = [...fixed, ...meals, ...others, ...flexPacked];
    const seen = new Set<string>();
    const deduped = merged.filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });
    return enrichEventsWithTaskEmojis(deduped, state.tasks, state.customTaskCategories);
  }, [state.fixedBlocks, state.mealBreaks, state.events, state.tasks, state.customTaskCategories]);

  const recurringFixedEventIds = useMemo(
    () => new Set(fixedBlocksToEvents(state.fixedBlocks).map((e) => e.id)),
    [state.fixedBlocks],
  );

  const calendarBounds = useMemo(
    () => mergeDayBoundsForCalendar(state.preferences.dayStart, state.preferences.dayEnd, allEvents),
    [state.preferences.dayStart, state.preferences.dayEnd, allEvents],
  );

  const usageSummary = useMemo(() => {
    if (usageLog.length === 0) return undefined;
    return {
      requests: usageLog.length,
      promptTokens: usageLog.reduce((sum, row) => sum + (row.promptTokens ?? 0), 0),
      completionTokens: usageLog.reduce((sum, row) => sum + (row.completionTokens ?? 0), 0),
      totalTokens: usageLog.reduce((sum, row) => sum + (row.totalTokens ?? 0), 0),
    };
  }, [usageLog]);

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
          "I just saved updated schedule preferences in my app state (see context JSON: preferences.morningStartWeekday, preferences.morningStartWeekend, preferredGapBetweenTasksMin, protectEvenings, protectEveningsFrom, freeDays, etc.). Regenerate my FULL week now: keep the same fixed blocks and the same tasks, but replace flexible-task placements so they strictly honor these NEW preferences. Use morningStartWeekday for Mon–Fri and morningStartWeekend for Sat–Sun as the earliest usual start for flexible tasks; leave at least preferences.preferredGapBetweenTasksMin minutes between adjacent flexible blocks on the same day when it fits around fixed blocks and other rules; do not change fixed blocks. Return the complete updated schedule.";
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
      /** Spread `base` so `stateOverride` (e.g. a pre-added fixed commitment) is not dropped. */
      setAria({ ...base, chat: newHistory });
    }
    setLoading(true);
    try {
      const res = await callAria({
        state: { ...base, chat: newHistory },
        history: base.chat,
        userMessage: userText,
      });
      setUsageLog((prev) => [
        ...prev,
        {
          id: uid(),
          timestamp: Date.now(),
          userText,
          promptTokens: res.usage?.promptTokens ?? null,
          completionTokens: res.usage?.completionTokens ?? null,
          totalTokens: res.usage?.totalTokens ?? null,
          model: res.usage?.model,
          source: res.usage?.source ?? "unavailable",
        },
      ]);
      const aiSettingsPatch: AriaScheduleSettingsPatch | undefined =
        (res.mealBreakUpdates?.length ?? 0) > 0 || (res.fixedBlockUpdates?.length ?? 0) > 0
          ? { mealBreakUpdates: res.mealBreakUpdates, fixedBlockUpdates: res.fixedBlockUpdates }
          : undefined;

      let patchedFixed = base.fixedBlocks;
      let patchedMeals = base.mealBreaks ?? [];
      if (hasStructuralSchedulePatch(aiSettingsPatch)) {
        const r = applyAriaScheduleSettingsPatch(patchedFixed, patchedMeals, aiSettingsPatch);
        patchedFixed = r.fixedBlocks;
        patchedMeals = r.mealBreaks;
      }
      /** Merge inferred removal after AI patches so a weak/wrong model patch cannot leave standing dinner in place. */
      const inferredRemoval = inferStandingDinnerRemovalPatch(userText, patchedFixed, patchedMeals);
      if (inferredRemoval) {
        const r2 = applyAriaScheduleSettingsPatch(patchedFixed, patchedMeals, inferredRemoval);
        patchedFixed = r2.fixedBlocks;
        patchedMeals = r2.mealBreaks;
      }
      let noMeals = res.events.filter((e) => e.kind !== "meal" && !String(e.id).startsWith("meal-"));
      const replacementFixed = inferReplacementDinnerFixedEvent(userText, noMeals);
      if (replacementFixed) {
        noMeals = stripConflictingReplacementFlexRows(noMeals, replacementFixed, userText);
        noMeals = [...noMeals, replacementFixed];
      } else {
        const inferredFriends = inferFridayFriendsDinner730FixedEvent(userText, noMeals);
        if (inferredFriends) noMeals = [...noMeals, inferredFriends];
      }
      const flexBase = noMeals.filter((e) => e.kind === "flexible" || e.kind === "tentative");
      const blockFixed = fixedBlocksToEvents(patchedFixed);
      const aiFixedPreview = noMeals.filter((e) => e.kind === "fixed");
      const fixedEv = allFixedEventsForScheduling({
        fixedBlocks: patchedFixed,
        events: [...storedUserPinnedFixedOnly(base.events), ...aiFixedPreview],
      });
      const flexFilled = ensureWeeklyFlexibleMinPlacements(
        base.tasks,
        flexBase,
        fixedEv,
        patchedMeals,
        base.preferences,
      );
      const flexPacked = resolveFlexTentativeOverlaps(
        flexFilled,
        fixedEv,
        patchedMeals,
        base.preferences,
      );
      const aiFixed = noMeals.filter((e) => e.kind === "fixed");
      const mergedFixed = mergePinnedUserFixedFromState(base.events, blockFixed, aiFixed);
      const other = noMeals.filter(
        (e) => e.kind !== "flexible" && e.kind !== "tentative" && e.kind !== "fixed",
      );
      const mergedEvents = [...other, ...mergedFixed, ...flexPacked];

      const overlapOffer =
        !opts?.silent &&
        findOverlapOfferContext({
          userMessage: userText,
          flexBeforeResolve: flexFilled,
          flexAfterResolve: flexPacked,
          fixedEvents: fixedEv,
        });

      const aiMsg: ChatMessage = {
        role: "assistant",
        content: overlapOffer
          ? `${res.explanation}\n\nYour requested time overlaps fixed commitments (${overlapOffer.conflictSummaries.join("; ")}). Want to place it there anyway so it overlaps on the calendar?`
          : res.explanation,
        timestamp: Date.now(),
        ...(overlapOffer
          ? {
              overlapPrompt: {
                promptId: uid(),
                candidateId: overlapOffer.candidateId,
                intentDay: overlapOffer.intentDay,
                intentStartMin: overlapOffer.intentStartMin,
                intentDurationMin: overlapOffer.intentDurationMin,
                conflictSummaries: overlapOffer.conflictSummaries,
              },
            }
          : {}),
      };
      setAria((s) => ({
        ...s,
        fixedBlocks: patchedFixed,
        mealBreaks: patchedMeals,
        events: mergedEvents,
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
      setAria({
        ...base,
        chat: opts?.silent ? [...base.chat, errMsg] : [...newHistory, errMsg],
      });
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
        ? `It must stay at ${c.fixedDay} ${c.fixedStart} (already added as a fixed row in currentEvents with that exact time — keep that row unchanged; only reschedule flexible/tentative tasks around it).`
        : "Find the best slot in the week.",
      c.hasDeadline && c.deadlineDay ? `It must be done by end of ${c.deadlineDay}.` : "",
      c.canDisplace
        ? "You may move lower-priority flexible tasks to make room."
        : "Do not displace any other tasks.",
      "Return the full updated schedule.",
    ].filter(Boolean).join(" ");

    setAddOpen(false);
    const clientPinned: ScheduledEvent | null =
      c.fixedTime && c.fixedDay && c.fixedStart
        ? {
            id: uid(),
            title: c.title.trim(),
            day: c.fixedDay,
            start: c.fixedStart,
            end: fromMin(toMin(c.fixedStart) + c.durationMin),
            kind: "fixed",
            category: c.category,
            priority: c.priority,
            userPinned: true,
          }
        : null;
    const stateOverride = clientPinned ? { ...state, events: [...state.events, clientPinned] } : undefined;
    await sendToAria(desc, stateOverride ? { stateOverride } : undefined);
  };

  const loadDemo = () => {
    setAria(() => getDemoState());
    toast.success("Demo data loaded for this calendar — use chat to have Aria plan the week.");
  };

  const copyUsageReport = useCallback(() => {
    const header = usageSummary
      ? `Requests: ${usageSummary.requests}\nPrompt tokens: ${usageSummary.promptTokens}\nCompletion tokens: ${usageSummary.completionTokens}\nTotal tokens: ${usageSummary.totalTokens}\n`
      : "No token usage captured yet.\n";
    const rows = usageLog
      .map((row, i) => {
        const t = new Date(row.timestamp).toLocaleString();
        return [
          `#${i + 1} - ${t}`,
          `User: ${row.userText}`,
          `Prompt: ${row.promptTokens ?? "missing from backend response"}`,
          `Completion: ${row.completionTokens ?? "missing from backend response"}`,
          `Total: ${row.totalTokens ?? "missing from backend response"}`,
          `Source: ${row.source === "reported" ? "provider-reported" : row.source === "estimated" ? "estimated" : "unavailable"}`,
          row.model ? `Model: ${row.model}` : null,
          "",
        ]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n");
    void navigator.clipboard.writeText(`${header}\n${rows}`.trim());
    toast.success("Token report copied.");
  }, [usageLog, usageSummary]);

  const resetAll = () => {
    if (!confirm("Reset all profiles and calendars on this device?")) return;
    clearState();
    clearLaunchPreambleFlag();
    setPreambleDismissed(false);
    setProfilesRoot(createDefaultProfilesRoot());
    toast.success("Reset.");
  };

  const handleCalendarEventClick = (ev: ScheduledEvent) => {
    if (ev.kind === "flexible" || ev.kind === "tentative") {
      setCalendarEditEvent(ev);
      return;
    }
    /** Fixed-time commitments live in `events`; onboarding recurring blocks are not editable here. */
    if (ev.kind === "fixed" && !recurringFixedEventIds.has(ev.id)) {
      setCalendarEditEvent(ev);
    }
  };

  const handleCalendarEventMove = useCallback(
    (ev: ScheduledEvent, next: { day: DayKey; start: string; end: string }) => {
      setAria((s) => {
        const idx = s.events.findIndex((e) => e.id === ev.id);
        if (idx < 0) return s;
        const prevRow = s.events[idx]!;
        const phantom: ScheduledEvent = {
          ...prevRow,
          day: next.day,
          start: next.start,
          end: next.end,
        };
        const fixedSlots = allFixedEventsForScheduling({
          fixedBlocks: s.fixedBlocks,
          events: s.events.filter((e) => e.id !== ev.id),
        });
        const overlapsFixed =
          (ev.kind === "flexible" || ev.kind === "tentative") &&
          fixedSlots.some(
            (f) => f.kind === "fixed" && f.day === next.day && eventsTimeOverlap(f, phantom),
          );

        const updatedEv: ScheduledEvent = {
          ...prevRow,
          day: next.day,
          start: next.start,
          end: next.end,
        };
        if (ev.kind === "flexible" || ev.kind === "tentative") {
          if (overlapsFixed) updatedEv.overlapDespiteFixed = true;
          else delete updatedEv.overlapDespiteFixed;
        }
        const events = s.events.slice();
        events[idx] = updatedEv;

        const linked = findOnceTaskForEvent(ev, s.tasks);
        let tasks = s.tasks;
        if (linked && (ev.kind === "flexible" || ev.kind === "tentative")) {
          tasks = s.tasks.map((t) => {
            if (t.id !== linked.id) return t;
            return normalizeFlexibleTask({
              ...t,
              preferredWeekdays: [next.day],
              preferredTimeStyle: "windows",
              preferredTimeWindows: [{ start: next.start, end: next.end }],
            });
          });
        }

        return { ...s, events, tasks };
      });
      toast.success("Moved");
    },
    [setAria],
  );

  const handleOverlapPromptResolve = useCallback(
    (prompt: ChatOverlapPrompt, accept: boolean) => {
      setAria((s) => {
        const chat = s.chat.map((m) =>
          m.overlapPrompt?.promptId === prompt.promptId ? { ...m, overlapPrompt: undefined } : m,
        );
        if (!accept) return { ...s, chat };

        const idx = s.events.findIndex((e) => e.id === prompt.candidateId);
        if (idx < 0) return { ...s, chat };

        const prev = s.events[idx]!;
        const nextStart = fromMin(prompt.intentStartMin);
        const nextEnd = fromMin(prompt.intentStartMin + prompt.intentDurationMin);
        const updatedEv: ScheduledEvent = {
          ...prev,
          day: prompt.intentDay,
          start: nextStart,
          end: nextEnd,
          overlapDespiteFixed: true,
        };
        const events = s.events.slice();
        events[idx] = updatedEv;

        const linked = findOnceTaskForEvent(prev, s.tasks);
        let tasks = s.tasks;
        if (linked && (prev.kind === "flexible" || prev.kind === "tentative")) {
          tasks = s.tasks.map((t) => {
            if (t.id !== linked.id) return t;
            return normalizeFlexibleTask({
              ...t,
              preferredWeekdays: [prompt.intentDay],
              preferredTimeStyle: "windows",
              preferredTimeWindows: [{ start: nextStart, end: nextEnd }],
            });
          });
        }

        return { ...s, events, chat, tasks };
      });
      toast.success(
        accept
          ? "Placed at your requested time — overlaps fixed commitments on the calendar."
          : "Keeping the adjusted placement.",
      );
    },
    [setAria],
  );

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

  if (!hydrated) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-2 text-muted-foreground">
        <AriaLogoMark size="md" decorative />
        <p className="text-sm">Loading your planner…</p>
      </div>
    );
  }

  const showLaunchPreamble =
    !state.onboarded &&
    !newUserWizardOpen &&
    !hasCompletedLaunchPreamble() &&
    !preambleDismissed;

  if (showLaunchPreamble) {
    return (
      <FirstLaunchPreamble
        onComplete={() => {
          setLaunchPreambleComplete();
          setPreambleDismissed(true);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/60 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex items-center gap-3 min-w-0 shrink-0">
            <AriaLogoMark size="sm" decorative />
            <div>
              <h1 className="font-display text-2xl leading-none">Aria</h1>
              <div className="text-[11px] text-muted-foreground mt-0.5">AI scheduling assistant</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 min-w-0">
            {state.onboarded && state.tasks.length === 0 && (
              <Button variant="outline" size="sm" onClick={loadDemo} className="gap-1.5">
                <Wand2 className="h-3.5 w-3.5" /> Load demo data
              </Button>
            )}
            {state.onboarded && (
              <>
                <Button
                  size="sm"
                  className="gap-1.5 shrink-0 text-xs sm:text-sm"
                  disabled={loading}
                  onClick={() => void sendToAria(GENERATE_FULL_WEEK_USER_MESSAGE)}
                >
                  <Wand2 className="h-3.5 w-3.5 shrink-0" />
                  Generate my week
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 shrink-0 text-xs sm:text-sm"
                  title="Copy a link that opens your current calendar as a new profile on someone else’s device"
                  onClick={() => {
                    try {
                      const token = encodeShareSnapshot(activeProfile?.name ?? "Me", state);
                      const u = new URL(window.location.href);
                      u.searchParams.set("share", token);
                      void navigator.clipboard.writeText(u.toString());
                      if (token.length > 14_000) {
                        toast.success("Link copied — it is long; use a current browser to open it.", {
                          duration: 6000,
                        });
                      } else {
                        toast.success(
                          "Share link copied — opening it adds this calendar as a new profile they can edit.",
                        );
                      }
                    } catch (e: unknown) {
                      const msg = e instanceof Error ? e.message : "Could not build share link.";
                      toast.error(msg);
                    }
                  }}
                >
                  <Link2 className="h-3.5 w-3.5 shrink-0" />
                  Copy share link
                </Button>
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

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-5 flex flex-col-reverse gap-5 lg:grid lg:grid-cols-[1fr_360px]">
          <div className="space-y-3 min-w-0">
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
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <span className="text-xs font-medium text-muted-foreground">Week view</span>
              <div className="flex items-center gap-2">
                <Label htmlFor="cal-hour-height" className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                  Density
                </Label>
                <Select
                  value={String(state.preferences.calendarHourHeightPx)}
                  onValueChange={(v) =>
                    setAria((s) => ({
                      ...s,
                      preferences: { ...s.preferences, calendarHourHeightPx: Number(v) },
                    }))
                  }
                >
                  <SelectTrigger id="cal-hour-height" className="h-8 min-w-[220px] max-w-[min(100%,280px)] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" className="min-w-[var(--radix-select-trigger-width)]">
                    {CALENDAR_DENSITY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={String(o.value)}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <CalendarGrid
              events={allEvents}
              dayStart={calendarBounds.dayStart}
              dayEnd={calendarBounds.dayEnd}
              recurringFixedEventIds={recurringFixedEventIds}
              hourHeightPx={state.preferences.calendarHourHeightPx}
              onEventClick={handleCalendarEventClick}
              onEventMove={handleCalendarEventMove}
            />
            <Legend />
          </div>
          <div className="h-[min(420px,52vh)] lg:h-[calc(100vh-100px)] lg:sticky lg:top-[76px]">
            <ChatPanel
              messages={state.chat}
              onSend={async (t) => {
                await sendToAria(t);
              }}
              loading={loading}
              generateWeekMessage={GENERATE_FULL_WEEK_USER_MESSAGE}
              usageSummary={usageSummary}
              onCopyUsage={copyUsageReport}
              onOpenUsageReport={() => setUsageOpen(true)}
              onOverlapPromptResolve={handleOverlapPromptResolve}
            />
          </div>
      </main>

      <Dialog open={usageOpen} onOpenChange={setUsageOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Token usage report</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border p-3 text-sm">
              <div>Requests: {usageSummary?.requests ?? 0}</div>
              <div>Input (prompt) tokens: {usageSummary?.promptTokens.toLocaleString() ?? 0}</div>
              <div>Output (completion) tokens: {usageSummary?.completionTokens.toLocaleString() ?? 0}</div>
              <div className="font-medium">Total tokens: {usageSummary?.totalTokens.toLocaleString() ?? 0}</div>
            </div>
            {usageLog.length === 0 ? (
              <div className="text-sm text-muted-foreground">No requests yet. Send a chat message first.</div>
            ) : (
              <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1">
                {usageLog.map((row, idx) => (
                  <div key={row.id} className="rounded-lg border p-3 text-xs space-y-1">
                    <div className="font-medium text-sm">Request {idx + 1}</div>
                    <div className="text-muted-foreground">{new Date(row.timestamp).toLocaleString()}</div>
                    <div className="text-foreground">Input: {row.promptTokens ?? "missing from backend response"}</div>
                    <div className="text-foreground">Output: {row.completionTokens ?? "missing from backend response"}</div>
                    <div className="text-foreground">Total: {row.totalTokens ?? "missing from backend response"}</div>
                    <div className="text-muted-foreground">
                      Source: {row.source === "reported" ? "provider-reported (exact)" : row.source === "estimated" ? "estimated fallback" : "unavailable"}
                    </div>
                    {row.model ? <div className="text-muted-foreground">Model: {row.model}</div> : null}
                    <div className="text-muted-foreground break-words">Message: {row.userText}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={copyUsageReport} disabled={usageLog.length === 0}>
                Copy report
              </Button>
              <Button type="button" variant="ghost" onClick={() => setUsageLog([])} disabled={usageLog.length === 0}>
                Clear
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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

      {calendarEditEvent ? (
        <EditScheduledEventModal
          key={calendarEditEvent.id}
          event={calendarEditEvent}
          tasks={state.tasks}
          onClose={() => setCalendarEditEvent(null)}
          onSave={(updated, taskSync) => {
            setAria((s) => ({
              ...s,
              events: s.events.map((e) => (e.id === updated.id ? updated : e)),
              tasks: taskSync
                ? s.tasks.map((t) =>
                    t.id === taskSync.taskId ? normalizeFlexibleTask({ ...t, ...taskSync.patch }) : t,
                  )
                : s.tasks,
            }));
            setCalendarEditEvent(null);
            toast.success("Event updated.");
          }}
        />
      ) : null}
    </div>
  );
};

function Legend() {
  const items: { label: string; cls: string }[] = [
    {
      label: "Recurring weekly blocks (onboarding)",
      cls: "border border-neutral-300/95 border-l-[3px] border-l-neutral-500 bg-neutral-300/90 dark:bg-neutral-600/85",
    },
    {
      label: "Meals",
      cls: "border border-zinc-200/85 border-l-[3px] border-l-zinc-400/55 bg-white/95 dark:border-zinc-600/70 dark:border-l-zinc-400/50 dark:bg-zinc-900/40",
    },
    { label: "Work", cls: "bg-cat-work-soft border border-cat-work" },
    { label: "Home", cls: "bg-cat-home-soft border border-cat-home" },
    { label: "Health", cls: "bg-cat-health-soft border border-cat-health" },
    { label: "Personal", cls: "bg-cat-personal-soft border border-cat-personal" },
    { label: "Social", cls: "bg-cat-social-soft border border-cat-social" },
    { label: "Admin", cls: "bg-cat-admin-soft border border-cat-admin" },
    { label: "Other", cls: "bg-cat-other-soft border border-cat-other" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-[11px] text-muted-foreground">
      <span className="basis-full text-[10px] text-muted-foreground/90">
        Category colors: flexible tasks and fixed-time commitments — not onboarding recurring blocks. Drag tasks or
        one-off fixed commitments to another day or time (snaps to 15 minutes).
      </span>
      {items.map((i) => (
        <div key={i.label} className="flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${i.cls}`} />
          {i.label}
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 shrink-0 rounded-sm hatched border border-border" />
        Tentative
      </div>
    </div>
  );
}

export default Index;
