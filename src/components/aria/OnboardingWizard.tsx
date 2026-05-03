import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { TimeSelect5 } from "@/components/ui/quantized-selects";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, CalendarDays, Coffee, ListChecks, Settings2, Plus, Trash2 } from "lucide-react";
import { TasksStep } from "@/components/aria/tasks-step";
import { MealsStep } from "@/components/aria/meals-step";
import {
  AriaState,
  CALENDAR_DENSITY_OPTIONS,
  CATEGORY_META,
  Category,
  DAYS,
  DayKey,
  DEFAULT_PREFERENCES,
  FixedBlock,
  MealBreak,
  ScheduledEvent,
  createDefaultMealBreaks,
  normalizeMealBreak,
} from "@/lib/aria-types";
import { uid } from "@/lib/aria-storage";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  initial: AriaState;
  onComplete: (state: AriaState) => void | Promise<void>;
  /** Re-open after onboarding to edit fixed blocks, tasks, and preferences */
  variant?: "onboarding" | "settings" | "newUser";
  /** When variant is settings or newUser: overlay / Escape / close — parent should set open false */
  onRequestClose?: () => void;
}

const STEPS = [
  { id: 1, title: "Your fixed schedule", icon: Calendar, desc: "Tell Aria when you're locked in for work or class." },
  {
    id: 2,
    title: "Meals (optional)",
    icon: Coffee,
    desc: "Breakfast, lunch, and dinner are set up for you—adjust days and windows, add extras, or skip.",
  },
  { id: 3, title: "Your tasks", icon: ListChecks, desc: "Pick what you'd like to fit into the rest of your week." },
  { id: 4, title: "Your preferences", icon: Settings2, desc: "A few small details that shape how Aria plans." },
];

export default function OnboardingWizard({
  open,
  initial,
  onComplete,
  variant = "onboarding",
  onRequestClose,
}: Props) {
  const isSettings = variant === "settings";
  const isNewUser = variant === "newUser";
  const [step, setStep] = useState(1);

  useEffect(() => {
    setStep((s) => {
      const v = Math.min(STEPS.length, Math.max(1, s));
      return v === s ? s : v;
    });
  }, [step]);
  const [settingsTab, setSettingsTab] = useState<"fixed" | "meals" | "tasks" | "preferences">("preferences");
  const [fixedBlocks, setFixedBlocks] = useState<FixedBlock[]>(
    initial.fixedBlocks?.length
      ? initial.fixedBlocks
      : [{ id: uid(), title: "Work", days: ["Mon","Tue","Wed","Thu","Fri"], start: "09:00", end: "18:00", category: "work" }]
  );
  const [mealBreaks, setMealBreaks] = useState<MealBreak[]>(() =>
    (initial.mealBreaks?.length ?? 0) > 0 ? (initial.mealBreaks ?? []).map((x) => normalizeMealBreak(x)) : createDefaultMealBreaks(),
  );
  const [tasks, setTasks] = useState(() => initial.tasks ?? []);
  const [customTaskCategories, setCustomTaskCategories] = useState(initial.customTaskCategories ?? []);
  const [prefs, setPrefs] = useState(initial.preferences);

  const safeStep = Math.min(STEPS.length, Math.max(1, step));
  const progress = (safeStep / STEPS.length) * 100;
  const current = STEPS[safeStep - 1]!;

  const finish = () => {
    void onComplete({
      ...initial,
      onboarded: true,
      fixedBlocks,
      mealBreaks: mealBreaks.map((x) => normalizeMealBreak(x)),
      tasks,
      customTaskCategories,
      preferences: prefs,
      /** Drop AI-placed flex/tentative events so the calendar matches new fixed blocks & tasks until the next generate/replan. */
      ...(isSettings ? { events: [] as ScheduledEvent[] } : {}),
    });
  };

  const locked = variant === "onboarding";

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !locked) {
          onRequestClose?.();
        }
      }}
    >
      <DialogContent
        overlayClassName={locked ? "bg-black/40 backdrop-blur-[1px]" : undefined}
        className={cn(
          "flex max-h-[90vh] max-w-2xl flex-col gap-0 overflow-hidden p-0",
          locked && "[&>button]:hidden",
        )}
        onPointerDownOutside={locked ? (e) => e.preventDefault() : undefined}
        onEscapeKeyDown={locked ? (e) => e.preventDefault() : undefined}
      >
        {isSettings ? (
          <Tabs
            value={settingsTab}
            onValueChange={(v) => setSettingsTab(v as "fixed" | "meals" | "tasks" | "preferences")}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="shrink-0 border-b bg-muted/20 px-7 pb-4 pt-7">
              <DialogHeader className="space-y-1.5 text-left">
                <DialogTitle className="font-display text-2xl sm:text-3xl">Schedule setup</DialogTitle>
                <DialogDescription className="text-sm sm:text-base">
                  Jump to any section. Save when you&apos;re done—Aria will replan if you have tasks.
                </DialogDescription>
              </DialogHeader>
              <TabsList className="mt-5 grid h-auto w-full grid-cols-2 sm:grid-cols-4 gap-1.5 rounded-lg bg-muted p-1.5">
                <TabsTrigger value="fixed" className="text-xs sm:text-sm">
                  Fixed
                </TabsTrigger>
                <TabsTrigger value="meals" className="text-xs sm:text-sm">
                  Meals
                </TabsTrigger>
                <TabsTrigger value="tasks" className="text-xs sm:text-sm">
                  Tasks
                </TabsTrigger>
                <TabsTrigger value="preferences" className="text-xs sm:text-sm">
                  Preferences
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-7 py-5">
              <TabsContent value="fixed" className="m-0 mt-0 outline-none focus-visible:ring-0 focus-visible:ring-offset-0">
                <FixedStep blocks={fixedBlocks} setBlocks={setFixedBlocks} />
              </TabsContent>
              <TabsContent value="meals" className="m-0 mt-0 outline-none focus-visible:ring-0 focus-visible:ring-offset-0">
                <MealsStep mealBreaks={mealBreaks} setMealBreaks={setMealBreaks} />
              </TabsContent>
              <TabsContent value="tasks" className="m-0 mt-0 outline-none focus-visible:ring-0 focus-visible:ring-offset-0">
                <TasksStep
                  tasks={tasks}
                  setTasks={setTasks}
                  customTaskCategories={customTaskCategories}
                  setCustomTaskCategories={setCustomTaskCategories}
                />
              </TabsContent>
              <TabsContent value="preferences" className="m-0 mt-0 outline-none focus-visible:ring-0 focus-visible:ring-offset-0">
                <PrefsStep prefs={prefs} setPrefs={setPrefs} prefsVariant="settings" />
              </TabsContent>
            </div>

            <div className="flex shrink-0 items-center justify-between gap-3 border-t bg-muted/30 px-7 py-4">
              <Button type="button" variant="ghost" onClick={() => onRequestClose?.()}>
                Cancel
              </Button>
              <Button type="button" onClick={finish} className="gap-2">
                <CalendarDays className="h-4 w-4" /> Save changes
              </Button>
            </div>
          </Tabs>
        ) : (
          <>
            <div className="shrink-0 px-7 pt-7 pb-4">
              <div className="mb-4 flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                  <current.icon className="h-5 w-5" />
                </div>
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Step {safeStep} of {STEPS.length}
                </div>
              </div>
              <DialogHeader className="space-y-1.5 text-left">
                <DialogTitle className="font-display text-3xl">{current.title}</DialogTitle>
                <DialogDescription className="text-base">
                  {isNewUser ? `New profile — ${current.desc}` : current.desc}
                </DialogDescription>
              </DialogHeader>
              <Progress value={progress} className="mt-5 h-1.5" />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-7 py-5">
              {safeStep === 1 && <FixedStep blocks={fixedBlocks} setBlocks={setFixedBlocks} />}
              {safeStep === 2 && <MealsStep mealBreaks={mealBreaks} setMealBreaks={setMealBreaks} />}
              {safeStep === 3 && (
                <TasksStep
                  tasks={tasks}
                  setTasks={setTasks}
                  customTaskCategories={customTaskCategories}
                  setCustomTaskCategories={setCustomTaskCategories}
                />
              )}
              {safeStep === 4 && <PrefsStep prefs={prefs} setPrefs={setPrefs} prefsVariant="onboarding" />}
            </div>

            <div className="flex shrink-0 items-center justify-between gap-3 border-t bg-muted/30 px-7 py-4">
              <div className="flex flex-wrap items-center gap-1">
                {locked ? (
                  <Button type="button" variant="link" className="h-auto px-2 text-muted-foreground" onClick={() => finish()}>
                    Skip setup — show calendar
                  </Button>
                ) : null}
                <Button variant="ghost" disabled={safeStep === 1} onClick={() => setStep((s) => Math.max(1, s - 1))}>
                  Back
                </Button>
                {safeStep === 2 ? (
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto px-2 text-muted-foreground"
                    onClick={() => {
                      setMealBreaks([]);
                      setStep(3);
                    }}
                  >
                    Skip meals
                  </Button>
                ) : null}
              </div>
              {safeStep < STEPS.length ? (
                <Button onClick={() => setStep((s) => Math.min(STEPS.length, s + 1))}>Continue</Button>
              ) : (
                <Button onClick={finish} className="gap-2">
                  <CalendarDays className="h-4 w-4" /> Open Aria
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Step 1 ---------- */

function FixedStep({ blocks, setBlocks }: { blocks: FixedBlock[]; setBlocks: (b: FixedBlock[]) => void }) {
  const update = (id: string, patch: Partial<FixedBlock>) =>
    setBlocks(blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const remove = (id: string) => setBlocks(blocks.filter((b) => b.id !== id));
  const add = () =>
    setBlocks([
      ...blocks,
      { id: uid(), title: "Class", days: ["Tue", "Thu"], start: "10:00", end: "11:30", category: "work" },
    ]);

  return (
    <div className="space-y-4">
      {blocks.map((b) => (
        <div key={b.id} className="rounded-xl border bg-card p-4 shadow-soft">
          <div className="flex items-start gap-3 mb-3">
            <Input
              value={b.title}
              onChange={(e) => update(b.id, { title: e.target.value })}
              className="font-medium"
              placeholder="e.g. Work, Class"
            />
            <Button variant="ghost" size="icon" onClick={() => remove(b.id)} className="text-muted-foreground hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {DAYS.map((d) => {
              const active = b.days.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() =>
                    update(b.id, {
                      days: active ? b.days.filter((x) => x !== d) : [...b.days, d],
                    })
                  }
                  className={cn(
                    "h-9 w-11 rounded-lg text-sm font-medium border transition-all",
                    active
                      ? "bg-primary text-primary-foreground border-primary shadow-soft"
                      : "bg-background border-border text-muted-foreground hover:border-primary/40"
                  )}
                >
                  {d}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Start</Label>
              <TimeSelect5 value={b.start} onChange={(v) => update(b.id, { start: v })} triggerClassName="h-9 w-full" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">End</Label>
              <TimeSelect5
                value={b.end}
                onChange={(v) => update(b.id, { end: v })}
                triggerClassName="h-9 w-full"
                allowMidnightEnd
              />
            </div>
          </div>
        </div>
      ))}
      <Button variant="outline" onClick={add} className="w-full gap-2">
        <Plus className="h-4 w-4" /> Add a fixed block
      </Button>
    </div>
  );
}

/* ---------- Step 3 ---------- */

function PrefsStep({
  prefs,
  setPrefs,
  prefsVariant,
}: {
  prefs: AriaState["preferences"];
  setPrefs: (p: AriaState["preferences"]) => void;
  prefsVariant: "onboarding" | "settings";
}) {
  const showCalendarDisplayOnly = prefsVariant === "settings";

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="space-y-1">
          <Label className="text-sm font-medium">When flexible tasks can start</Label>
          <p className="text-xs text-muted-foreground leading-snug">
            Earliest time Aria should usually place flexible tasks—separately for weekdays vs weekends if you like (e.g. sleep in Saturday). Fixed blocks, evening protection, and per-task times still apply.
            {showCalendarDisplayOnly ? <> Not when your calendar grid begins.</> : null}
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">Monday – Friday</Label>
            <TimeSelect5
              value={prefs.morningStartWeekday}
              onChange={(v) => setPrefs({ ...prefs, morningStartWeekday: v })}
              triggerClassName="h-10 w-full"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">Saturday – Sunday</Label>
            <TimeSelect5
              value={prefs.morningStartWeekend}
              onChange={(v) => setPrefs({ ...prefs, morningStartWeekend: v })}
              triggerClassName="h-10 w-full"
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-4">
        <div className="space-y-1">
          <Label className="text-sm font-medium">Space between tasks</Label>
          <p className="text-xs text-muted-foreground leading-snug">
            How much breathing room you usually want between flexible tasks on the same day. Aria will try to leave at least this many minutes free in between—when fixed blocks, priorities, free days, and other rules allow it, tasks can sit closer together.
          </p>
        </div>
        <Slider
          aria-label="Preferred minimum gap between flexible tasks in minutes"
          value={[prefs.preferredGapBetweenTasksMin]}
          min={0}
          max={120}
          step={5}
          onValueChange={(v) =>
            setPrefs({ ...prefs, preferredGapBetweenTasksMin: typeof v[0] === "number" ? v[0] : 0 })
          }
          className="w-full max-w-md py-1"
        />
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>0 (tight)</span>
          <span className="tabular-nums font-medium text-foreground">
            {prefs.preferredGapBetweenTasksMin} min usual gap
          </span>
          <span>120 min</span>
        </div>
      </div>
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="font-medium text-sm">Protect evenings</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              On weeknights (Mon–Fri), avoid placing flexible tasks after the time you pick—unless your notes say otherwise.
            </div>
          </div>
          <Switch
            checked={prefs.protectEvenings}
            onCheckedChange={(v) => setPrefs({ ...prefs, protectEvenings: v })}
          />
        </div>
        {prefs.protectEvenings ? (
          <div className="space-y-2 border-t border-border/60 pt-3">
            <Label className="text-sm font-medium">Evening quiet starts at</Label>
            <p className="text-xs text-muted-foreground leading-snug">
              Flexible tasks won&apos;t begin at or after this time on weekdays.
            </p>
            <TimeSelect5
              value={prefs.protectEveningsFrom}
              onChange={(v) => setPrefs({ ...prefs, protectEveningsFrom: v })}
              className="max-w-[260px]"
              triggerClassName="h-10 w-full"
            />
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div>
          <Label className="text-sm font-medium">Days kept fully free</Label>
          <div className="text-xs text-muted-foreground mt-0.5">Aria won't schedule flexible tasks on these.</div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map((d) => {
            const active = prefs.freeDays.includes(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() =>
                  setPrefs({
                    ...prefs,
                    freeDays: active ? prefs.freeDays.filter((x) => x !== d) : [...prefs.freeDays, d],
                  })
                }
                className={cn(
                  "h-9 w-11 rounded-lg text-sm font-medium border transition-all",
                  active
                    ? "bg-primary text-primary-foreground border-primary shadow-soft"
                    : "bg-background border-border text-muted-foreground hover:border-primary/40"
                )}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>

      {showCalendarDisplayOnly ? (
        <div className="rounded-xl border border-dashed border-muted-foreground/35 bg-muted/20 p-4 space-y-3">
          <div className="space-y-1">
            <Label className="text-sm font-medium">Calendar view (display only)</Label>
            <p className="text-xs text-muted-foreground leading-snug">
              Chooses which hours show on the week calendar (display only).
              When tasks actually run still follows fixed blocks, task choices, and the scheduling options above—not these times.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="rounded-lg border bg-background p-3 space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">Grid starts at</Label>
              <TimeSelect5 value={prefs.dayStart} onChange={(v) => setPrefs({ ...prefs, dayStart: v })} triggerClassName="h-10 w-full" />
            </div>
            <div className="rounded-lg border bg-background p-3 space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">Grid ends at</Label>
              <TimeSelect5
                value={prefs.dayEnd}
                onChange={(v) => setPrefs({ ...prefs, dayEnd: v })}
                triggerClassName="h-10 w-full"
                allowMidnightEnd
              />
            </div>
          </div>
          <div className="rounded-lg border bg-background p-3 space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">Week calendar density</Label>
            <p className="text-[11px] text-muted-foreground leading-snug">
              How tall each hour looks on the week view — pick what fits your screen and reading comfort.
            </p>
            <Select
              value={String(prefs.calendarHourHeightPx ?? DEFAULT_PREFERENCES.calendarHourHeightPx)}
              onValueChange={(v) => setPrefs({ ...prefs, calendarHourHeightPx: Number(v) })}
            >
              <SelectTrigger className="h-10 w-full">
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
      ) : null}
    </div>
  );
}
