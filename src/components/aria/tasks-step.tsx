import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DurationSelect5, TimeSelect5 } from "@/components/ui/quantized-selects";
import { Textarea } from "@/components/ui/textarea";
import { ChevronDown, FolderPlus, Pencil, Plus, Trash2 } from "lucide-react";
import {
  CATEGORY_META,
  Category,
  CustomTaskCategory,
  DAYS,
  DayKey,
  FlexibleTask,
  Frequency,
  MonthWeekOrdinal,
  PreferredTimeStyle,
  Priority,
  TimeOfDay,
  TimeWindow,
  normalizeFlexibleTask,
} from "@/lib/aria-types";
import { uid } from "@/lib/aria-storage";
import { SUGGESTED_CATEGORIES, SUGGESTED_TASKS, type SuggestedTask, suggestedToTask } from "@/lib/suggested-tasks";
import { cn } from "@/lib/utils";

/** Built-in category sections shown in onboarding (templates + tasks). */
const BUILTIN_TASK_SECTIONS: Category[] = [...SUGGESTED_CATEGORIES, "work", "other"];

const TIMES_PER_WEEK_OPTIONS = Array.from({ length: 7 }, (_, i) => {
  const n = i + 1;
  return { v: String(n), l: `${n}×` };
});

type GroupValue = `b:${Category}` | `c:${string}`;

function taskGroupValue(t: FlexibleTask): GroupValue {
  if (t.customCategoryId) return `c:${t.customCategoryId}`;
  return `b:${t.category}`;
}

function applyTaskGroup(draft: FlexibleTask, gv: GroupValue, customs: CustomTaskCategory[]): FlexibleTask {
  if (gv.startsWith("c:")) {
    const id = gv.slice(2);
    const c = customs.find((x) => x.id === id);
    if (!c) return draft;
    return { ...draft, category: c.paletteCategory, customCategoryId: id };
  }
  const cat = gv.slice(2) as Category;
  return { ...draft, category: cat, customCategoryId: undefined };
}

function newTaskTemplate(category: Category, customCategoryId?: string): FlexibleTask {
  return normalizeFlexibleTask({
    id: uid(),
    title: "New task",
    category,
    ...(customCategoryId ? { customCategoryId } : {}),
    durationMin: 60,
    frequency: "weekly",
    timesPerWeekMin: 1,
    timesPerWeekMax: 1,
    priority: "medium",
    preferredTimeStyle: "preset",
    preferredTimeOfDay: "any",
    preferredTimeWindows: [],
    preferredWeekdays: [],
    monthWeekOrdinal: "any",
    monthDaysOfMonth: [],
    schedulingNotes: "",
  });
}

function parseDaysOfMonthInput(s: string): number[] {
  const out: number[] = [];
  for (const part of s.split(/[\s,;]+/).filter(Boolean)) {
    if (part.includes("-")) {
      const [a, b] = part.split("-").map((x) => parseInt(x.trim(), 10));
      if (Number.isFinite(a) && Number.isFinite(b)) {
        const lo = Math.max(1, Math.min(31, Math.min(a, b)));
        const hi = Math.max(1, Math.min(31, Math.max(a, b)));
        for (let d = lo; d <= hi; d++) out.push(d);
      }
    } else {
      const n = parseInt(part, 10);
      if (n >= 1 && n <= 31) out.push(n);
    }
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

function toggleWeekday(list: DayKey[], d: DayKey): DayKey[] {
  const set = new Set(list);
  if (set.has(d)) set.delete(d);
  else set.add(d);
  return DAYS.filter((x) => set.has(x));
}

function frequencyMeta(t: FlexibleTask): string {
  if (t.frequency === "monthly") {
    const bits: string[] = [];
    if (t.monthWeekOrdinal !== "any") bits.push(`${t.monthWeekOrdinal} wk`);
    if (t.monthDaysOfMonth.length) bits.push(`dom ${t.monthDaysOfMonth.join(",")}`);
    const mo = bits.length ? ` · ${bits.join(" · ")}` : "";
    return `monthly${mo}`;
  }
  if (t.frequency === "weekly") {
    const a = t.timesPerWeekMin;
    const b = t.timesPerWeekMax;
    if (a === 1 && b === 1) return "weekly";
    if (a === b) return `${a}×/wk`;
    return `${a}–${b}×/wk`;
  }
  return t.frequency;
}

function metaLine(t: FlexibleTask) {
  const time =
    t.preferredTimeStyle === "windows" && t.preferredTimeWindows.length > 0
      ? t.preferredTimeWindows.map((w) => `${w.start}–${w.end}`).join(", ")
      : t.preferredTimeOfDay;
  const days = t.preferredWeekdays.length ? t.preferredWeekdays.join("·") : "any";
  const note = t.schedulingNotes.trim() ? " · ✎" : "";
  return `${t.durationMin}m · ${time} · ${days} · ${frequencyMeta(t)} · ${t.priority}${note}`;
}

function suggestedPreviewMeta(s: SuggestedTask): string {
  return metaLine(
    normalizeFlexibleTask({
      id: "preview",
      title: s.title,
      category: s.category,
      durationMin: s.durationMin,
      frequency: s.frequency,
      ...(s.timesPerWeekMin != null ? { timesPerWeekMin: s.timesPerWeekMin } : {}),
      ...(s.timesPerWeekMax != null ? { timesPerWeekMax: s.timesPerWeekMax } : {}),
      priority: "medium",
      preferredTimeStyle: "preset",
      preferredTimeOfDay: s.preferredTimeOfDay,
      preferredTimeWindows: [],
      preferredWeekdays: [],
      monthWeekOrdinal: "any",
      monthDaysOfMonth: [],
      schedulingNotes: "",
    }),
  );
}

/** Nested wizard Dialog + portaled Select/Popover: block dismiss/focus steal when using dropdowns. */
function guardDialogAgainstFloatingUi(e: { preventDefault: () => void; target: EventTarget | null }) {
  const target = e.target as HTMLElement | null;
  if (!target?.closest) return;
  if (
    target.closest('[role="listbox"]') ||
    target.closest("[data-radix-popper-content-wrapper]")
  ) {
    e.preventDefault();
  }
}

function SmallSelect({
  label,
  value,
  onChange,
  options,
  dense,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { v: string; l: string }[];
  dense?: boolean;
}) {
  return (
    <div className={cn("space-y-1", dense && "space-y-0.5")}>
      <Label className={cn("text-muted-foreground", dense ? "text-[10px] leading-none" : "text-xs")}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className={cn(dense ? "h-8 text-xs px-2" : "h-10")}>
          <SelectValue placeholder="Choose…" />
        </SelectTrigger>
        <SelectContent position="popper">
          {options.map((o) => (
            <SelectItem key={o.v} value={o.v} className={dense ? "text-xs py-1.5" : undefined}>
              {o.l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function WeekdayChips({
  label,
  hint,
  days,
  onChange,
}: {
  label: string;
  hint?: string;
  days: DayKey[];
  onChange: (next: DayKey[]) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] text-muted-foreground leading-none">{label}</Label>
      <div className="flex flex-wrap gap-1">
        {DAYS.map((d) => {
          const on = days.includes(d);
          return (
            <button
              key={d}
              type="button"
              onClick={() => onChange(toggleWeekday(days, d))}
              className={cn(
                "h-7 min-w-[2.25rem] rounded border px-1 text-[10px] font-medium transition-colors",
                on ? "border-primary bg-primary/12 text-foreground" : "border-border bg-muted/30 text-muted-foreground hover:border-primary/35",
              )}
            >
              {d}
            </button>
          );
        })}
      </div>
      {hint ? <p className="text-[10px] text-muted-foreground leading-tight">{hint}</p> : null}
    </div>
  );
}

function TaskEditorDialog({
  open,
  onOpenChange,
  initialTask,
  isCreate,
  onCommit,
  customTaskCategories,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialTask: FlexibleTask | null;
  isCreate: boolean;
  onCommit: (task: FlexibleTask) => void;
  customTaskCategories: CustomTaskCategory[];
}) {
  const [draft, setDraft] = useState<FlexibleTask | null>(null);

  useLayoutEffect(() => {
    if (open && initialTask) setDraft(normalizeFlexibleTask(initialTask));
    else setDraft(null);
  }, [open, initialTask]);

  const groupOptions = useMemo(() => {
    const built = BUILTIN_TASK_SECTIONS.map((cat) => {
      const m = CATEGORY_META[cat];
      return { v: `b:${cat}` as GroupValue, l: `${m.emoji} ${m.label}` };
    });
    const cust = customTaskCategories.map((c) => ({
      v: `c:${c.id}` as GroupValue,
      l: `${c.emoji} ${c.label}`,
    }));
    return [...built, ...cust];
  }, [customTaskCategories]);

  const u = (patch: Partial<FlexibleTask>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const save = () => {
    if (!draft) return;
    const title = draft.title.trim();
    if (!title) return;
    const next = normalizeFlexibleTask({ ...draft, title });
    if (isCreate) {
      onCommit({ ...next, id: uid() });
    } else {
      onCommit(next);
    }
    onOpenChange(false);
  };

  const rawGroupValue = draft ? taskGroupValue(draft) : "";
  const categorySelectValue =
    draft &&
    groupOptions.some((o) => o.v === rawGroupValue)
      ? rawGroupValue
      : draft
        ? (`b:${draft.category}` as GroupValue)
        : "";

  const ordinalOpts = useMemo(
    () =>
      (
        [
          ["any", "Any week"],
          ["first", "1st"],
          ["second", "2nd"],
          ["third", "3rd"],
          ["fourth", "4th"],
          ["last", "Last"],
        ] as const
      ).map(([v, l]) => ({ v, l })),
    [],
  );

  return (
    <Dialog modal={false} open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[440px] max-h-[min(92vh,680px)] overflow-y-auto z-[120] p-4 gap-3"
        onInteractOutside={guardDialogAgainstFloatingUi}
        onFocusOutside={guardDialogAgainstFloatingUi}
        onPointerDownOutside={guardDialogAgainstFloatingUi}
      >
        <DialogHeader className="space-y-1 pb-0">
          <DialogTitle className="font-display text-base">{isCreate ? "Add task" : "Edit task"}</DialogTitle>
          <DialogDescription className="text-[11px] leading-snug">
            Frequency first, then days & times. Notes go to the AI verbatim.
          </DialogDescription>
        </DialogHeader>
        {draft ? (
          <>
            <div className="space-y-2.5">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Title</Label>
                <Input
                  value={draft.title}
                  onChange={(e) => u({ title: e.target.value })}
                  placeholder="Task name"
                  className="h-8 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <SmallSelect
                  dense
                  label="Frequency"
                  value={draft.frequency}
                  onChange={(v) =>
                    setDraft((d) => (d ? normalizeFlexibleTask({ ...d, frequency: v as Frequency }) : d))
                  }
                  options={[
                    { v: "once", l: "Once" },
                    { v: "weekly", l: "Weekly" },
                    { v: "monthly", l: "Monthly" },
                    { v: "as-needed", l: "As needed" },
                  ]}
                />
                <SmallSelect
                  dense
                  label="Priority"
                  value={draft.priority}
                  onChange={(v) => u({ priority: v as Priority })}
                  options={[
                    { v: "high", l: "High" },
                    { v: "medium", l: "Medium" },
                    { v: "low", l: "Low" },
                  ]}
                />
              </div>

              {draft.frequency === "weekly" ? (
                <div className="grid grid-cols-2 gap-2">
                  <SmallSelect
                    dense
                    label="Min × per week"
                    value={String(draft.timesPerWeekMin)}
                    onChange={(v) => {
                      const n = parseInt(v, 10);
                      u({ timesPerWeekMin: n, timesPerWeekMax: Math.max(n, draft.timesPerWeekMax) });
                    }}
                    options={TIMES_PER_WEEK_OPTIONS}
                  />
                  <SmallSelect
                    dense
                    label="Max × per week"
                    value={String(draft.timesPerWeekMax)}
                    onChange={(v) => {
                      const n = parseInt(v, 10);
                      u({ timesPerWeekMin: Math.min(n, draft.timesPerWeekMin), timesPerWeekMax: n });
                    }}
                    options={TIMES_PER_WEEK_OPTIONS}
                  />
                  <p className="col-span-2 text-[10px] text-muted-foreground leading-tight -mt-1">
                    Same min & max = exactly that many times (e.g. min 3, max 4 = three or four sessions).
                  </p>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-2">
                <SmallSelect
                  dense
                  label="Category"
                  value={categorySelectValue}
                  onChange={(gv) =>
                    setDraft((d) => (d ? applyTaskGroup(d, gv as GroupValue, customTaskCategories) : d))
                  }
                  options={groupOptions.map((o) => ({ v: o.v, l: o.l }))}
                />
                <DurationSelect5
                  label="Duration"
                  labelClassName="text-[10px] text-muted-foreground"
                  value={draft.durationMin}
                  onChange={(v) => u({ durationMin: v })}
                  triggerClassName="h-8 w-full text-xs"
                />
              </div>

              <div className="rounded-md border border-border/80 bg-muted/20 px-2 py-2 space-y-2">
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">When you prefer to do it</Label>
                <div className="flex rounded-md border border-border/60 bg-background p-0.5 gap-0.5">
                  <button
                    type="button"
                    className={cn(
                      "flex-1 rounded-sm py-1 text-[11px] font-medium transition-colors",
                      draft.preferredTimeStyle === "preset" ? "bg-muted shadow-sm" : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => u({ preferredTimeStyle: "preset" as PreferredTimeStyle })}
                  >
                    Part of day
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "flex-1 rounded-sm py-1 text-[11px] font-medium transition-colors",
                      draft.preferredTimeStyle === "windows" ? "bg-muted shadow-sm" : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() =>
                      u({
                        preferredTimeStyle: "windows" as PreferredTimeStyle,
                        preferredTimeWindows:
                          draft.preferredTimeWindows.length > 0
                            ? draft.preferredTimeWindows
                            : [{ start: "09:00", end: "11:00" }],
                      })
                    }
                  >
                    Time ranges
                  </button>
                </div>
                {draft.preferredTimeStyle === "preset" ? (
                  <SmallSelect
                    dense
                    label="General time"
                    value={draft.preferredTimeOfDay}
                    onChange={(v) => u({ preferredTimeOfDay: v as TimeOfDay })}
                    options={[
                      { v: "any", l: "Any" },
                      { v: "morning", l: "Morning" },
                      { v: "afternoon", l: "Afternoon" },
                      { v: "evening", l: "Evening" },
                    ]}
                  />
                ) : (
                  <div className="space-y-1.5">
                    {draft.preferredTimeWindows.map((w, i) => (
                      <div key={i} className="flex flex-wrap items-end gap-1.5">
                        <div className="grid grid-cols-2 gap-1.5 flex-1 min-w-[200px]">
                          <div className="space-y-0.5">
                            <span className="text-[10px] text-muted-foreground">From</span>
                            <TimeSelect5 value={w.start} onChange={(v) => patchWindow(draft, u, i, { start: v })} triggerClassName="h-8 w-full text-xs" />
                          </div>
                          <div className="space-y-0.5">
                            <span className="text-[10px] text-muted-foreground">To</span>
                            <TimeSelect5 value={w.end} onChange={(v) => patchWindow(draft, u, i, { end: v })} triggerClassName="h-8 w-full text-xs" />
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-[11px] shrink-0"
                          disabled={draft.preferredTimeWindows.length <= 1}
                          onClick={() => removeWindow(draft, u, i)}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-[11px] w-full"
                      disabled={draft.preferredTimeWindows.length >= 4}
                      onClick={() =>
                        u({
                          preferredTimeWindows: [...draft.preferredTimeWindows, { start: "15:00", end: "17:00" }],
                        })
                      }
                    >
                      + Add range
                    </Button>
                  </div>
                )}
              </div>

              {draft.frequency === "weekly" ? (
                <WeekdayChips
                  label="Preferred weekdays"
                  hint="Choose none for any day."
                  days={draft.preferredWeekdays}
                  onChange={(next) => u({ preferredWeekdays: next })}
                />
              ) : null}

              {draft.frequency === "monthly" ? (
                <div className="space-y-2 rounded-md border border-border/80 bg-muted/15 px-2 py-2">
                  <WeekdayChips
                    label="Weekdays you prefer"
                    hint="Optional — combine with week-of-month and/or calendar days below."
                    days={draft.preferredWeekdays}
                    onChange={(next) => u({ preferredWeekdays: next })}
                  />
                  <SmallSelect
                    dense
                    label="Week of month (for those weekdays)"
                    value={draft.monthWeekOrdinal}
                    onChange={(v) => u({ monthWeekOrdinal: v as MonthWeekOrdinal })}
                    options={ordinalOpts.map((o) => ({ v: o.v, l: o.l }))}
                  />
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Days of month (1–31)</Label>
                    <Input
                      className="h-8 text-xs"
                      placeholder="e.g. 5, 15, 20–23"
                      value={draft.monthDaysOfMonth.length ? draft.monthDaysOfMonth.join(", ") : ""}
                      onChange={(e) => u({ monthDaysOfMonth: parseDaysOfMonthInput(e.target.value) })}
                    />
                    <p className="text-[10px] text-muted-foreground leading-tight">
                      Comma-separated; ranges like 20–23 expand to each day.
                    </p>
                  </div>
                </div>
              ) : null}

              {(draft.frequency === "once" || draft.frequency === "as-needed") && (
                <WeekdayChips
                  label="If possible, prefer these days"
                  hint="Optional soft preference."
                  days={draft.preferredWeekdays}
                  onChange={(next) => u({ preferredWeekdays: next })}
                />
              )}

              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Extra scheduling detail</Label>
                <Textarea
                  value={draft.schedulingNotes}
                  onChange={(e) => u({ schedulingNotes: e.target.value })}
                  placeholder='e.g. "Between the 20th and 23rd only", "Never Fridays", …'
                  rows={2}
                  className="min-h-[52px] text-xs resize-none py-2 leading-snug"
                />
              </div>
            </div>
            <DialogFooter className="gap-2 pt-1 sm:gap-2">
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button size="sm" className="h-8 text-xs" onClick={save} disabled={!draft.title.trim()}>
                Save
              </Button>
            </DialogFooter>
          </>
        ) : (
          <p className="text-xs text-muted-foreground py-6 text-center">Loading…</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function patchWindow(draft: FlexibleTask, u: (p: Partial<FlexibleTask>) => void, i: number, part: Partial<TimeWindow>) {
  const next = [...draft.preferredTimeWindows];
  next[i] = { ...next[i], ...part };
  u({ preferredTimeWindows: next });
}

function removeWindow(draft: FlexibleTask, u: (p: Partial<FlexibleTask>) => void, i: number) {
  const next = draft.preferredTimeWindows.filter((_, j) => j !== i);
  u({ preferredTimeWindows: next.length ? next : [{ start: "09:00", end: "11:00" }] });
}

function AddCategoryDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreate: (c: CustomTaskCategory) => void;
}) {
  const [emoji, setEmoji] = useState("📌");
  const [label, setLabel] = useState("");
  const [paletteCategory, setPaletteCategory] = useState<Category>("other");

  useEffect(() => {
    if (open) {
      setEmoji("📌");
      setLabel("");
      setPaletteCategory("other");
    }
  }, [open]);

  const save = () => {
    const name = label.trim();
    if (!name) return;
    onCreate({
      id: uid(),
      label: name,
      emoji: emoji.trim() || "📌",
      paletteCategory,
    });
    onOpenChange(false);
  };

  return (
    <Dialog modal={false} open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md z-[120]"
        onInteractOutside={guardDialogAgainstFloatingUi}
        onFocusOutside={guardDialogAgainstFloatingUi}
        onPointerDownOutside={guardDialogAgainstFloatingUi}
      >
        <DialogHeader>
          <DialogTitle className="font-display text-xl">New category</DialogTitle>
          <DialogDescription>Add a group for your tasks. Calendar colors follow the type you pick.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-[auto_1fr] gap-3 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs">Icon</Label>
              <Input value={emoji} onChange={(e) => setEmoji(e.target.value)} className="w-14 text-center text-lg px-1" maxLength={4} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Name</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Kids, Band practice" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Calendar type</Label>
            <Select value={paletteCategory} onValueChange={(v) => setPaletteCategory(v as Category)}>
              <SelectTrigger className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {(Object.keys(CATEGORY_META) as Category[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {CATEGORY_META[k].emoji} {CATEGORY_META[k].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!label.trim()}>
            Create category
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompactTaskCard({
  selected,
  onSelectedChange,
  title,
  subtitle,
  onEdit,
  onDelete,
  deleteDisabled,
  disableSelect,
}: {
  selected: boolean;
  onSelectedChange?: (v: boolean) => void;
  title: string;
  subtitle: string;
  onEdit: () => void;
  onDelete: () => void;
  deleteDisabled?: boolean;
  /** When true, show a locked checkbox (always in list) instead of toggling */
  disableSelect?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border px-2 py-1 min-h-[34px] transition-colors",
        selected
          ? "border-border bg-card"
          : "border-dashed border-muted-foreground/30 bg-muted/20 opacity-75 saturate-75",
      )}
    >
      <div className="flex shrink-0 items-center justify-center w-8">
        {disableSelect ? (
          <Checkbox checked disabled className="opacity-60" aria-label="In your list" />
        ) : (
          <Checkbox
            checked={selected}
            onCheckedChange={(v) => onSelectedChange?.(v === true)}
            aria-label={selected ? "Remove from task list" : "Add to task list"}
            className={cn("shrink-0", !selected && "opacity-70")}
          />
        )}
      </div>
      <button
        type="button"
        className="flex-1 min-w-0 text-left"
        onClick={onEdit}
      >
        <div
          className={cn(
            "text-sm font-medium leading-tight truncate",
            !selected && !disableSelect && "text-muted-foreground",
          )}
        >
          {title}
        </div>
        <div
          className={cn(
            "text-[11px] leading-tight truncate",
            !selected && !disableSelect ? "text-muted-foreground/75" : "text-muted-foreground",
          )}
        >
          {subtitle}
        </div>
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
        aria-label="Edit"
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive disabled:opacity-30"
        aria-label="Delete"
        disabled={deleteDisabled}
        onClick={(e) => {
          e.stopPropagation();
          if (!deleteDisabled) onDelete();
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

type EditorOpen =
  | { mode: "edit"; task: FlexibleTask }
  | { mode: "create"; draft: FlexibleTask };

export function TasksStep({
  tasks,
  setTasks,
  customTaskCategories,
  setCustomTaskCategories,
}: {
  tasks: FlexibleTask[];
  setTasks: (t: FlexibleTask[]) => void;
  customTaskCategories: CustomTaskCategory[];
  setCustomTaskCategories: (c: CustomTaskCategory[]) => void;
}) {
  const [editor, setEditor] = useState<EditorOpen | null>(null);
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);

  const findSuggestedTask = (cat: Category, title: string) =>
    tasks.find((t) => !t.customCategoryId && t.category === cat && t.title === title);

  const toggleSuggestedMembership = (cat: Category, title: string) => {
    const exists = findSuggestedTask(cat, title);
    if (exists) {
      setTasks(tasks.filter((t) => t.id !== exists.id));
    } else {
      const s = SUGGESTED_TASKS[cat]?.find((x) => x.title === title);
      if (s) setTasks([...tasks, suggestedToTask(s)]);
    }
  };

  const removeTaskById = (id: string) => {
    setTasks(tasks.filter((t) => t.id !== id));
    setEditor((e) => (e?.mode === "edit" && e.task.id === id ? null : e));
  };

  const commitEditor = (next: FlexibleTask, isCreate: boolean) => {
    setTasks((prev) => {
      if (isCreate) return [...prev, next];
      return prev.map((t) => (t.id === next.id ? next : t));
    });
    setEditor(null);
  };

  const openEditorSuggested = (cat: Category, s: SuggestedTask) => {
    const existing = findSuggestedTask(cat, s.title);
    if (existing) setEditor({ mode: "edit", task: existing });
    else setEditor({ mode: "create", draft: suggestedToTask(s) });
  };

  const openEditorCustom = (t: FlexibleTask) => {
    setEditor({ mode: "edit", task: t });
  };

  const openEditorNewInBuiltin = (cat: Category) => {
    setEditor({ mode: "create", draft: newTaskTemplate(cat) });
  };

  const openEditorNewInCustom = (customId: string, palette: Category) => {
    setEditor({ mode: "create", draft: newTaskTemplate(palette, customId) });
  };

  const addTaskInBuiltin = (cat: Category) => openEditorNewInBuiltin(cat);
  const addTaskInCustom = (customId: string, palette: Category) => openEditorNewInCustom(customId, palette);

  const removeCustomCategory = (id: string) => {
    if (!confirm("Remove this category and all tasks inside it?")) return;
    setCustomTaskCategories(customTaskCategories.filter((c) => c.id !== id));
    setTasks(tasks.filter((t) => t.customCategoryId !== id));
  };

  const onCreateCategory = (c: CustomTaskCategory) => {
    setCustomTaskCategories([...customTaskCategories, c]);
  };

  const dialogInitial = editor?.mode === "edit" ? editor.task : editor?.mode === "create" ? editor.draft : null;
  const dialogCreate = editor?.mode === "create";

  return (
    <div className="space-y-2">
      {BUILTIN_TASK_SECTIONS.map((cat) => {
        const meta = CATEGORY_META[cat];
        const suggested = SUGGESTED_TASKS[cat] ?? [];
        const sectionTasks = tasks.filter((t) => !t.customCategoryId && t.category === cat);
        const suggestedTitles = new Set(suggested.map((s) => s.title));
        const orphanTasks = sectionTasks.filter((t) => !suggestedTitles.has(t.title));

        return (
          <Collapsible key={cat} defaultOpen={cat === "home"}>
            <CollapsibleTrigger className="w-full flex items-center justify-between rounded-lg border bg-card px-3 py-2 hover:bg-muted/40 transition-colors group text-sm">
              <span className="flex items-center gap-2 font-medium">
                <span className="text-base leading-none">{meta.emoji}</span>
                {meta.label}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180 shrink-0" />
            </CollapsibleTrigger>
            <CollapsibleContent className="px-2 pt-1.5 pb-1 space-y-1">
              {suggested.map((s) => {
                const existing = findSuggestedTask(cat, s.title);
                const selected = !!existing;
                const subtitle = existing ? metaLine(existing) : suggestedPreviewMeta(s);
                return (
                  <CompactTaskCard
                    key={`${cat}-${s.title}`}
                    selected={selected}
                    onSelectedChange={() => toggleSuggestedMembership(cat, s.title)}
                    title={s.title}
                    subtitle={subtitle}
                    onEdit={() => openEditorSuggested(cat, s)}
                    onDelete={() => existing && removeTaskById(existing.id)}
                    deleteDisabled={!existing}
                  />
                );
              })}
              {orphanTasks.map((t) => (
                <CompactTaskCard
                  key={t.id}
                  selected
                  disableSelect
                  title={t.title}
                  subtitle={metaLine(t)}
                  onEdit={() => openEditorCustom(t)}
                  onDelete={() => removeTaskById(t.id)}
                />
              ))}
              <Button type="button" variant="outline" size="sm" className="h-8 w-full gap-1.5 text-xs mt-1" onClick={() => addTaskInBuiltin(cat)}>
                <Plus className="h-3.5 w-3.5" /> Add task in {meta.label}
              </Button>
            </CollapsibleContent>
          </Collapsible>
        );
      })}

      {customTaskCategories.map((cc) => {
        const sectionTasks = tasks.filter((t) => t.customCategoryId === cc.id);
        return (
          <Collapsible key={cc.id} defaultOpen>
            <div className="flex items-stretch rounded-lg border bg-card overflow-hidden">
              <CollapsibleTrigger className="flex flex-1 items-center justify-between gap-2 px-3 py-2 hover:bg-muted/40 transition-colors group text-left min-w-0 rounded-none border-0 bg-transparent shadow-none text-sm focus-visible:ring-2 focus-visible:ring-ring">
                <span className="flex items-center gap-2 font-medium min-w-0">
                  <span className="text-base shrink-0 leading-none">{cc.emoji}</span>
                  <span className="truncate">{cc.label}</span>
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <button
                type="button"
                className="shrink-0 px-2.5 border-l border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                aria-label="Remove category"
                onClick={() => removeCustomCategory(cc.id)}
              >
                <Trash2 className="h-3.5 w-3.5 mx-auto" />
              </button>
            </div>
            <CollapsibleContent className="px-2 pt-1.5 pb-1 space-y-1">
              {sectionTasks.length === 0 ? (
                <p className="text-xs text-muted-foreground px-1 py-0.5">No tasks yet.</p>
              ) : (
                sectionTasks.map((t) => (
                  <CompactTaskCard
                    key={t.id}
                    selected
                    disableSelect
                    title={t.title}
                    subtitle={metaLine(t)}
                    onEdit={() => openEditorCustom(t)}
                    onDelete={() => removeTaskById(t.id)}
                  />
                ))
              )}
              <Button type="button" variant="outline" size="sm" className="h-8 w-full gap-1.5 text-xs mt-1" onClick={() => addTaskInCustom(cc.id, cc.paletteCategory)}>
                <Plus className="h-3.5 w-3.5" /> Add task in {cc.label}
              </Button>
            </CollapsibleContent>
          </Collapsible>
        );
      })}

      <Button type="button" variant="secondary" size="sm" className="h-9 w-full gap-2 text-xs" onClick={() => setAddCategoryOpen(true)}>
        <FolderPlus className="h-3.5 w-3.5" /> Add section (category)
      </Button>

      <TaskEditorDialog
        key={editor && dialogInitial ? `${editor.mode}-${dialogInitial.id}` : "task-editor"}
        open={editor !== null && dialogInitial !== null}
        onOpenChange={(o) => {
          if (!o) setEditor(null);
        }}
        initialTask={dialogInitial}
        isCreate={!!dialogCreate}
        onCommit={(t) => commitEditor(t, !!dialogCreate)}
        customTaskCategories={customTaskCategories}
      />

      <AddCategoryDialog open={addCategoryOpen} onOpenChange={setAddCategoryOpen} onCreate={onCreateCategory} />
    </div>
  );
}
