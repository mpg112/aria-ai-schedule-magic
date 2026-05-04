import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORY_META, Category, DayKey, DAYS, FlexibleTask, Priority, ScheduledEvent } from "@/lib/aria-types";
import { DurationSelect5, TimeSelect5 } from "@/components/ui/quantized-selects";
import { fromMin, toMin } from "@/lib/schedule-utils";

export function findOnceTaskForEvent(ev: ScheduledEvent, tasks: FlexibleTask[]): FlexibleTask | undefined {
  return tasks.find(
    (t) =>
      t.frequency === "once" &&
      (t.id === ev.id ||
        ev.id.startsWith(`${t.id}-`) ||
        t.title.trim().toLowerCase() === ev.title.trim().toLowerCase()),
  );
}

interface Props {
  event: ScheduledEvent;
  tasks: FlexibleTask[];
  onClose: () => void;
  /** Persist updated event; optional sync for the linked one-time task definition. */
  onSave: (updated: ScheduledEvent, taskSync?: { taskId: string; patch: Partial<FlexibleTask> }) => void;
}

export default function EditScheduledEventModal({ event, tasks, onClose, onSave }: Props) {
  const [day, setDay] = useState<DayKey>("Mon");
  const [start, setStart] = useState("09:00");
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [category, setCategory] = useState<Category>("other");
  const [durationMin, setDurationMin] = useState(60);

  useEffect(() => {
    setDay(event.day);
    setStart(event.start);
    setTitle(event.title);
    setPriority(event.priority ?? "medium");
    setCategory(event.category);
    const s = toMin(event.start);
    let e = toMin(event.end);
    if (!Number.isFinite(e) || e <= s) e = s + 60;
    setDurationMin(Math.max(15, Math.round((e - s) / 5) * 5));
  }, [event]);

  const linkedOnce = event ? findOnceTaskForEvent(event, tasks) : undefined;

  const applyDuration = (dMin: number) => {
    setDurationMin(dMin);
  };

  const applyStart = (t: string) => {
    setStart(t);
  };

  const computedEnd = (() => {
    const s = toMin(start);
    if (!Number.isFinite(s)) return event.end;
    return fromMin(s + durationMin);
  })();

  const handleSave = () => {
    if (!event) return;
    const s = toMin(start);
    let endMin = s + durationMin;
    if (!Number.isFinite(s)) endMin = toMin(event.start) + durationMin;
    const updated: ScheduledEvent = {
      ...event,
      day,
      start,
      end: fromMin(endMin),
      title: title.trim() || event.title,
      priority,
      category,
      ...(event.kind === "fixed" ? { userPinned: true as const } : {}),
    };
    let taskSync: { taskId: string; patch: Partial<FlexibleTask> } | undefined;
    if (linkedOnce) {
      const patch: Partial<FlexibleTask> = {};
      if (durationMin !== linkedOnce.durationMin) patch.durationMin = durationMin;
      if (priority !== linkedOnce.priority) patch.priority = priority;
      if (category !== linkedOnce.category) patch.category = category;
      const nt = title.trim();
      if (nt && nt !== linkedOnce.title) patch.title = nt;
      const effectiveDay = linkedOnce.preferredWeekdays[0] ?? event.day;
      if (day !== effectiveDay) patch.preferredWeekdays = [day];
      const winEnd = fromMin(toMin(start) + durationMin);
      const w0 = linkedOnce.preferredTimeWindows[0];
      const timeMoved =
        linkedOnce.preferredTimeStyle !== "windows" ||
        !w0 ||
        w0.start !== start ||
        w0.end !== winEnd;
      if (timeMoved) {
        patch.preferredTimeStyle = "windows";
        patch.preferredTimeWindows = [{ start, end: winEnd }];
      }
      if (Object.keys(patch).length) taskSync = { taskId: linkedOnce.id, patch };
    }
    onSave(updated, taskSync);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Edit event</DialogTitle>
          <DialogDescription>
            {linkedOnce
              ? "This block is linked to a one-time task — changes here update the calendar and the task where noted."
              : event.kind === "fixed"
                ? "Fixed-time commitment — Aria will not move this; change day, start, or duration below when you need to."
                : "Adjust this flexible block on your calendar."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Day</Label>
            <Select value={day} onValueChange={(v) => setDay(v as DayKey)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAYS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Start</Label>
              <TimeSelect5 value={start} onChange={applyStart} triggerClassName="h-9 w-full" />
            </div>
            <div className="space-y-1.5">
              <DurationSelect5
                label="Duration"
                labelClassName="text-xs"
                value={durationMin}
                onChange={applyDuration}
                triggerClassName="h-9 w-full"
              />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground tabular-nums">
            Ends at {computedEnd} ({durationMin} min)
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_META).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v.emoji} {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
