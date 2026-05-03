import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DurationSelect5, TimeSelect5 } from "@/components/ui/quantized-selects";
import { Plus, Trash2 } from "lucide-react";
import { DAYS, DayKey, MealBreak, MealKind, MEAL_KIND_LABEL, createDefaultMealBreaks, normalizeMealBreak } from "@/lib/aria-types";
import { uid } from "@/lib/aria-storage";
import { cn } from "@/lib/utils";

function toggleDay(list: DayKey[], d: DayKey): DayKey[] {
  const set = new Set(list);
  if (set.has(d)) set.delete(d);
  else set.add(d);
  return DAYS.filter((x) => set.has(x));
}

function isPresetMealRow(id: string) {
  return id.startsWith("meal-default-");
}

function extraMealRow(): MealBreak {
  return normalizeMealBreak({
    id: uid(),
    kind: "breakfast",
    enabled: true,
    days: [...DAYS],
    windowStart: "08:00",
    windowEnd: "10:00",
    durationMin: 30,
  });
}

interface MealsStepProps {
  mealBreaks: MealBreak[];
  setMealBreaks: (m: MealBreak[]) => void;
}

export function MealsStep({ mealBreaks, setMealBreaks }: MealsStepProps) {
  const update = (id: string, patch: Partial<MealBreak>) =>
    setMealBreaks(mealBreaks.map((b) => (b.id === id ? normalizeMealBreak({ ...b, ...patch }) : b)));
  const remove = (id: string) => setMealBreaks(mealBreaks.filter((b) => b.id !== id));

  if (mealBreaks.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground leading-snug">
          Optional soft blocks on the calendar. Add the usual three, tweak days and windows, or add extra rows (e.g. a
          different weekend breakfast).
        </p>
        <div className="rounded-lg border border-dashed bg-muted/20 p-6 text-center space-y-3">
          <p className="text-sm text-muted-foreground">No meal blocks right now.</p>
          <Button type="button" variant="secondary" onClick={() => setMealBreaks(createDefaultMealBreaks())}>
            Add breakfast, lunch & dinner
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground leading-snug">
        Breakfast, lunch, and dinner are soft blocks. Choose days, the time band, and duration—the app picks a start
        inside the band. Add another meal if you need a different window (e.g. weekend breakfast).
      </p>

      {mealBreaks.map((b) => (
        <div key={b.id} className="rounded-xl border bg-card p-4 shadow-soft space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Switch checked={b.enabled} onCheckedChange={(v) => update(b.id, { enabled: v })} />
              {isPresetMealRow(b.id) ? (
                <span className="text-sm font-medium truncate">{MEAL_KIND_LABEL[b.kind]}</span>
              ) : (
                <Select value={b.kind} onValueChange={(v) => update(b.id, { kind: v as MealKind })}>
                  <SelectTrigger className="h-9 w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {(Object.keys(MEAL_KIND_LABEL) as MealKind[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {MEAL_KIND_LABEL[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => remove(b.id)}
              className="text-muted-foreground hover:text-destructive shrink-0"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:max-w-xs gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Duration</Label>
              <DurationSelect5 value={b.durationMin} onChange={(v) => update(b.id, { durationMin: v })} triggerClassName="h-9 w-full" />
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Days</Label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {DAYS.map((d) => {
                const active = b.days.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => update(b.id, { days: toggleDay(b.days, d) })}
                    className={cn(
                      "h-8 w-10 rounded-md text-xs font-medium border transition-all",
                      active ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground hover:border-primary/40",
                    )}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Window from</Label>
              <TimeSelect5 value={b.windowStart} onChange={(v) => update(b.id, { windowStart: v })} triggerClassName="h-9 w-full" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Window to</Label>
              <TimeSelect5 value={b.windowEnd} onChange={(v) => update(b.id, { windowEnd: v })} triggerClassName="h-9 w-full" allowMidnightEnd />
            </div>
          </div>
        </div>
      ))}

      <Button type="button" variant="outline" onClick={() => setMealBreaks([...mealBreaks, extraMealRow()])} className="w-full gap-2">
        <Plus className="h-4 w-4" /> Add another meal
      </Button>
    </div>
  );
}
