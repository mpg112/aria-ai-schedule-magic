import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Calendar, ListChecks, Settings2, ChevronDown, Plus, Trash2, Sparkles } from "lucide-react";
import { AriaState, CATEGORY_META, Category, DAYS, DayKey, FixedBlock, FlexibleTask, Frequency, Priority, TimeOfDay } from "@/lib/aria-types";
import { uid } from "@/lib/aria-storage";
import { SUGGESTED_CATEGORIES, SUGGESTED_TASKS, suggestedToTask } from "@/lib/suggested-tasks";
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
  const [tasks, setTasks] = useState<FlexibleTask[]>(initial.tasks);
  const [prefs, setPrefs] = useState(initial.preferences);

  const progress = (step / STEPS.length) * 100;
  const current = STEPS[step - 1];

  const finish = () => {
    onComplete({
      ...initial,
      onboarded: true,
      fixedBlocks,
      tasks,
      preferences: prefs,
    });
  };

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden" hideClose>
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
          {step === 2 && <TasksStep tasks={tasks} setTasks={setTasks} />}
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
            <div>
              <Label className="text-xs text-muted-foreground">Start</Label>
              <Input type="time" value={b.start} onChange={(e) => update(b.id, { start: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">End</Label>
              <Input type="time" value={b.end} onChange={(e) => update(b.id, { end: e.target.value })} />
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

/* ---------- Step 2 ---------- */

function TasksStep({ tasks, setTasks }: { tasks: FlexibleTask[]; setTasks: (t: FlexibleTask[]) => void }) {
  const has = (title: string, cat: Category) => tasks.some((t) => t.title === title && t.category === cat);
  const toggleSuggested = (title: string, cat: Category) => {
    if (has(title, cat)) {
      setTasks(tasks.filter((t) => !(t.title === title && t.category === cat)));
    } else {
      const s = SUGGESTED_TASKS[cat].find((x) => x.title === title);
      if (s) setTasks([...tasks, suggestedToTask(s)]);
    }
  };
  const updateTask = (id: string, patch: Partial<FlexibleTask>) =>
    setTasks(tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const removeTask = (id: string) => setTasks(tasks.filter((t) => t.id !== id));
  const addCustom = () =>
    setTasks([
      ...tasks,
      { id: uid(), title: "New task", category: "other", durationMin: 60, frequency: "weekly", preferredTimeOfDay: "any", preferredDay: "any", priority: "medium" },
    ]);

  return (
    <div className="space-y-3">
      {SUGGESTED_CATEGORIES.map((cat) => {
        const meta = CATEGORY_META[cat];
        const items = SUGGESTED_TASKS[cat];
        return (
          <Collapsible key={cat} defaultOpen={cat === "home"}>
            <CollapsibleTrigger className="w-full flex items-center justify-between rounded-xl border bg-card px-4 py-3 hover:bg-muted/40 transition-colors group">
              <span className="flex items-center gap-2.5 font-medium">
                <span className="text-lg">{meta.emoji}</span> {meta.label}
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="px-4 pt-3 space-y-2">
              {items.map((s) => {
                const active = has(s.title, cat);
                return (
                  <label
                    key={s.title}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-all",
                      active ? "border-primary/50 bg-primary/5" : "border-border bg-background hover:border-primary/30"
                    )}
                  >
                    <Checkbox checked={active} onCheckedChange={() => toggleSuggested(s.title, cat)} />
                    <div className="flex-1">
                      <div className="font-medium text-sm">{s.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {s.durationMin} min · {s.preferredTimeOfDay} · {s.frequency}
                      </div>
                    </div>
                  </label>
                );
              })}
            </CollapsibleContent>
          </Collapsible>
        );
      })}

      {tasks.length > 0 && (
        <div className="pt-4 mt-2 border-t">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Selected tasks ({tasks.length}) — fine-tune
          </div>
          <div className="space-y-2">
            {tasks.map((t) => (
              <div key={t.id} className="rounded-lg border bg-card p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Input value={t.title} onChange={(e) => updateTask(t.id, { title: e.target.value })} className="font-medium h-9" />
                  <Button variant="ghost" size="icon" onClick={() => removeTask(t.id)} className="text-muted-foreground hover:text-destructive shrink-0">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <NumInput label="Min" value={t.durationMin} onChange={(v) => updateTask(t.id, { durationMin: v })} />
                  <SmallSelect
                    label="When"
                    value={t.preferredTimeOfDay}
                    onChange={(v) => updateTask(t.id, { preferredTimeOfDay: v as TimeOfDay })}
                    options={[{v:"any",l:"Any"},{v:"morning",l:"Morning"},{v:"afternoon",l:"Afternoon"},{v:"evening",l:"Evening"}]}
                  />
                  <SmallSelect
                    label="Day"
                    value={t.preferredDay ?? "any"}
                    onChange={(v) => updateTask(t.id, { preferredDay: v as DayKey | "any" })}
                    options={[{v:"any",l:"Any"}, ...DAYS.map(d=>({v:d,l:d}))]}
                  />
                  <SmallSelect
                    label="Frequency"
                    value={t.frequency}
                    onChange={(v) => updateTask(t.id, { frequency: v as Frequency })}
                    options={[{v:"once",l:"Once"},{v:"weekly",l:"Weekly"},{v:"as-needed",l:"As needed"}]}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Button variant="outline" onClick={addCustom} className="w-full gap-2 mt-3">
        <Plus className="h-4 w-4" /> Add a custom task
      </Button>
    </div>
  );
}

function NumInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      <Input type="number" min={5} step={5} value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-9" />
    </div>
  );
}
function SmallSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { v: string; l: string }[] }) {
  return (
    <div>
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

/* ---------- Step 3 ---------- */

function PrefsStep({ prefs, setPrefs }: { prefs: AriaState["preferences"]; setPrefs: (p: AriaState["preferences"]) => void }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <Label className="text-sm font-medium">Preferred morning start</Label>
        <Input type="time" value={prefs.morningStart} onChange={(e) => setPrefs({ ...prefs, morningStart: e.target.value })} className="max-w-[180px]" />
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
          <Input type="time" value={prefs.dayStart} onChange={(e) => setPrefs({ ...prefs, dayStart: e.target.value })} />
        </div>
        <div className="rounded-xl border bg-card p-4 space-y-2">
          <Label className="text-sm font-medium">Day ends</Label>
          <Input type="time" value={prefs.dayEnd} onChange={(e) => setPrefs({ ...prefs, dayEnd: e.target.value })} />
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
