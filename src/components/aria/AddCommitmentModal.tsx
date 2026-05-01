import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORY_META, Category, DayKey, DAYS, Priority } from "@/lib/aria-types";
import { Loader2, Sparkles } from "lucide-react";

export interface NewCommitment {
  title: string;
  durationMin: number;
  hasDeadline: boolean;
  deadlineDay?: DayKey;
  fixedTime: boolean;
  fixedDay?: DayKey;
  fixedStart?: string;
  priority: Priority;
  canDisplace: boolean;
  category: Category;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (c: NewCommitment) => Promise<void>;
  loading: boolean;
}

export default function AddCommitmentModal({ open, onOpenChange, onSubmit, loading }: Props) {
  const [c, setC] = useState<NewCommitment>({
    title: "",
    durationMin: 60,
    hasDeadline: false,
    fixedTime: false,
    priority: "medium",
    canDisplace: true,
    category: "other",
  });
  const u = (patch: Partial<NewCommitment>) => setC({ ...c, ...patch });

  const handle = async () => {
    if (!c.title.trim()) return;
    await onSubmit(c);
    setC({
      title: "",
      durationMin: 60,
      hasDeadline: false,
      fixedTime: false,
      priority: "medium",
      canDisplace: true,
      category: "other",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Add a commitment</DialogTitle>
          <DialogDescription>Aria will find the best slot in your week.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>What is it?</Label>
            <Input
              value={c.title}
              onChange={(e) => u({ title: e.target.value })}
              placeholder="e.g. Coffee with Maya"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Duration (min)</Label>
              <Input type="number" min={5} step={5} value={c.durationMin} onChange={(e) => u({ durationMin: Number(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Category</Label>
              <Select value={c.category} onValueChange={(v) => u({ category: v as Category })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_META).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.emoji} {v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <ToggleRow
            title="Has a hard deadline"
            checked={c.hasDeadline}
            onChange={(v) => u({ hasDeadline: v })}
          />
          {c.hasDeadline && (
            <Select value={c.deadlineDay ?? ""} onValueChange={(v) => u({ deadlineDay: v as DayKey })}>
              <SelectTrigger><SelectValue placeholder="By which day?" /></SelectTrigger>
              <SelectContent>
                {DAYS.map((d) => <SelectItem key={d} value={d}>By end of {d}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          <ToggleRow
            title="Fixed time (don't let Aria pick)"
            checked={c.fixedTime}
            onChange={(v) => u({ fixedTime: v })}
          />
          {c.fixedTime && (
            <div className="grid grid-cols-2 gap-3">
              <Select value={c.fixedDay ?? ""} onValueChange={(v) => u({ fixedDay: v as DayKey })}>
                <SelectTrigger><SelectValue placeholder="Day" /></SelectTrigger>
                <SelectContent>
                  {DAYS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input type="time" value={c.fixedStart ?? ""} onChange={(e) => u({ fixedStart: e.target.value })} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Priority</Label>
            <Select value={c.priority} onValueChange={(v) => u({ priority: v as Priority })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <ToggleRow
            title="Can displace lower-priority tasks"
            desc="If needed, Aria will move other flexible items to fit this in."
            checked={c.canDisplace}
            onChange={(v) => u({ canDisplace: v })}
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
          <Button onClick={handle} disabled={loading || !c.title.trim()} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Find me a slot
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ToggleRow({ title, desc, checked, onChange }: { title: string; desc?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border bg-muted/20 p-3">
      <div>
        <div className="text-sm font-medium">{title}</div>
        {desc && <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
