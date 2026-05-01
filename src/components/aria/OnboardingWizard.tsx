import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { TimeSelect5 } from "@/components/ui/quantized-selects";
import { Calendar, ListChecks, Settings2, Plus, Trash2, Sparkles } from "lucide-react";
import { TasksStep } from "@/components/aria/tasks-step";
import { AriaState, CATEGORY_META, Category, DAYS, DayKey, FixedBlock } from "@/lib/aria-types";
import { uid } from "@/lib/aria-storage";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  initial: AriaState;
  onComplete: (state: AriaState) => void;
}

const STEPS = [
  { id: 1, title: "Your fixed schedule", icon: Calendar, desc: "Tell Aria when you're locked in for work or class." },
  { id: 2, title: "Your tasks", icon: ListChecks, desc: "Pick what you'd like to fit into the rest of your week." },
  { id: 3, title: "Your preferences", icon: Settings2, desc: "A few small details that shape how Aria plans." },
];

export default function OnboardingWizard({ open, initial, onComplete }: Props) {
  const [step, setStep] = useState(1);
  const [fixedBlocks, setFixedBlocks] = useState<FixedBlock[]>(
    initial.fixedBlocks.length
      ? initial.fixedBlocks
      : [{ id: uid(), title: "Work", days: ["Mon","Tue","Wed","Thu","Fri"], start: "09:00", end: "18:00", category: "work" }]
  );
  const [tasks, setTasks] = useState(initial.tasks);
  const [customTaskCategories, setCustomTaskCategories] = useState(initial.customTaskCategories ?? []);
  const [prefs, setPrefs] = useState(initial.preferences);

  const progress = (step / STEPS.length) * 100;
  const current = STEPS[step - 1];

  const finish = () => {
    onComplete({
      ...initial,
      onboarded: true,
      fixedBlocks,
      tasks,
      customTaskCategories,
      preferences: prefs,
    });
  };

  return (
    <Dialog open={open}>
      <DialogContent
        className="max-w-2xl p-0 gap-0 overflow-hidden [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <div className="px-7 pt-7 pb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-xl bg-primary/10 grid place-items-center text-primary">
              <current.icon className="h-5 w-5" />
            </div>
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Step {step} of {STEPS.length}
            </div>
          </div>
          <DialogHeader className="space-y-1.5 text-left">
            <DialogTitle className="font-display text-3xl">{current.title}</DialogTitle>
            <DialogDescription className="text-base">{current.desc}</DialogDescription>
          </DialogHeader>
          <Progress value={progress} className="mt-5 h-1.5" />
        </div>

        <div className="px-7 py-5 max-h-[55vh] overflow-y-auto">
          {step === 1 && <FixedStep blocks={fixedBlocks} setBlocks={setFixedBlocks} />}
          {step === 2 && (
            <TasksStep
              tasks={tasks}
              setTasks={setTasks}
              customTaskCategories={customTaskCategories}
              setCustomTaskCategories={setCustomTaskCategories}
            />
          )}
          {step === 3 && <PrefsStep prefs={prefs} setPrefs={setPrefs} />}
        </div>

        <div className="px-7 py-4 border-t bg-muted/30 flex items-center justify-between">
          <Button
            variant="ghost"
            disabled={step === 1}
            onClick={() => setStep((s) => Math.max(1, s - 1))}
          >
            Back
          </Button>
          {step < STEPS.length ? (
            <Button onClick={() => setStep((s) => s + 1)}>
              Continue
            </Button>
          ) : (
            <Button onClick={finish} className="gap-2">
              <Sparkles className="h-4 w-4" /> Open Aria
            </Button>
          )}
        </div>
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

function PrefsStep({ prefs, setPrefs }: { prefs: AriaState["preferences"]; setPrefs: (p: AriaState["preferences"]) => void }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <Label className="text-sm font-medium">Preferred morning start</Label>
        <TimeSelect5
          value={prefs.morningStart}
          onChange={(v) => setPrefs({ ...prefs, morningStart: v })}
          className="max-w-[260px]"
          triggerClassName="h-10 w-full"
        />
      </div>

      <ToggleRow
        title="Cluster errands"
        desc="Group errands & admin into one chunk instead of spreading them out."
        checked={prefs.clusterErrands}
        onChange={(v) => setPrefs({ ...prefs, clusterErrands: v })}
      />
      <ToggleRow
        title="Protect evenings"
        desc="Keep weeknight time after 7pm free for rest unless asked."
        checked={prefs.protectEvenings}
        onChange={(v) => setPrefs({ ...prefs, protectEvenings: v })}
      />

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

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border bg-card p-4 space-y-2">
          <Label className="text-sm font-medium">Day starts</Label>
          <TimeSelect5 value={prefs.dayStart} onChange={(v) => setPrefs({ ...prefs, dayStart: v })} triggerClassName="h-10 w-full" />
        </div>
        <div className="rounded-xl border bg-card p-4 space-y-2">
          <Label className="text-sm font-medium">Day ends</Label>
          <TimeSelect5
            value={prefs.dayEnd}
            onChange={(v) => setPrefs({ ...prefs, dayEnd: v })}
            triggerClassName="h-10 w-full"
            allowMidnightEnd
          />
        </div>
      </div>
    </div>
  );
}

function ToggleRow({ title, desc, checked, onChange }: { title: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border bg-card p-4">
      <div>
        <div className="font-medium text-sm">{title}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
