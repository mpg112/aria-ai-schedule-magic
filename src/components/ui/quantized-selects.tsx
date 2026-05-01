import { useEffect, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  DURATION_MAX_MINUTES,
  DURATION_MIN_MINUTES,
  FIVE_MINUTE_TICKS,
  composeTime,
  formatTimeDisplayCompact,
  hourChoices,
  pad2,
  parseHourMinuteSnapped,
  snapDurationToStep,
  snapTimeToStep,
} from "@/lib/time-grid";

const popoverTimeTriggerClass =
  "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1";

function TimePair({
  hour,
  minute,
  onHourChange,
  onMinuteChange,
  allowMidnightEnd,
  triggerClassName,
}: {
  hour: number;
  minute: number;
  onHourChange: (hour: number) => void;
  onMinuteChange: (minute: number) => void;
  allowMidnightEnd: boolean;
  triggerClassName?: string;
}) {
  const midnightEnd = hour === 24;
  const minuteTicks = midnightEnd ? ([0] as const) : FIVE_MINUTE_TICKS;

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Hour</span>
        <Select value={pad2(hour)} onValueChange={(v) => onHourChange(Number(v))}>
          <SelectTrigger className={cn(triggerClassName)}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            {hourChoices(allowMidnightEnd).map((h) => (
              <SelectItem key={h} value={pad2(h)}>
                {pad2(h)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Min</span>
        <Select
          value={pad2(minute)}
          onValueChange={(v) => onMinuteChange(Number(v))}
          disabled={midnightEnd}
        >
          <SelectTrigger className={cn(triggerClassName)} disabled={midnightEnd}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            {minuteTicks.map((m) => (
              <SelectItem key={m} value={pad2(m)}>
                {pad2(m)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

/** Time of day: one field showing e.g. "9:00"; popover picks hour + 5-minute steps. */
export function TimeSelect5({
  value,
  onChange,
  label,
  labelClassName,
  className,
  triggerClassName,
  allowMidnightEnd = false,
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  labelClassName?: string;
  className?: string;
  triggerClassName?: string;
  /** When true, hour 24 is allowed (only valid time is 24:00). */
  allowMidnightEnd?: boolean;
}) {
  const normalized = value.trim() ? snapTimeToStep(value) : "";

  useEffect(() => {
    if (!value.trim()) return;
    let next = snapTimeToStep(value);
    if (next === "24:00" && !allowMidnightEnd) next = "23:55";
    if (next !== value) onChange(next);
  }, [value, allowMidnightEnd, onChange]);

  const parts = useMemo(() => {
    const raw = normalized ? parseHourMinuteSnapped(normalized) : null;
    const fallback = { hour: 9, minute: 0 };
    let hour = raw?.hour ?? fallback.hour;
    let minute = raw?.minute ?? fallback.minute;
    if (!allowMidnightEnd && hour === 24) {
      hour = 23;
      minute = 55;
    }
    if (hour === 24 && minute !== 0) {
      minute = 0;
    }
    return { hour, minute };
  }, [normalized, allowMidnightEnd]);

  const commit = (nextHour: number, nextMinute: number) => {
    if (nextHour === 24) {
      onChange("24:00");
      return;
    }
    onChange(snapTimeToStep(composeTime(nextHour, nextMinute)));
  };

  const display = normalized ? formatTimeDisplayCompact(normalized) : "";

  const body = (
    <Popover modal={false}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(popoverTimeTriggerClass, triggerClassName)}
        >
          <span className={cn(!display && "text-muted-foreground")}>
            {display || "Select time"}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto min-w-[240px] p-3">
        <TimePair
          hour={parts.hour}
          minute={parts.minute}
          allowMidnightEnd={allowMidnightEnd}
          triggerClassName="h-9 w-full"
          onHourChange={(h) => {
            if (h === 24) commit(24, 0);
            else commit(h, parts.minute);
          }}
          onMinuteChange={(m) => commit(parts.hour, m)}
        />
      </PopoverContent>
    </Popover>
  );

  if (label) {
    return (
      <div className={cn("space-y-1.5", className)}>
        <Label className={cn("text-xs text-muted-foreground", labelClassName)}>{label}</Label>
        {body}
      </div>
    );
  }

  return <div className={className}>{body}</div>;
}

/** Duration: hours (0–12) + minutes on the 5-minute grid (total min 5–720). */
export function DurationSelect5({
  value,
  onChange,
  label,
  labelClassName,
  className,
  triggerClassName,
}: {
  value: number;
  onChange: (v: number) => void;
  label?: string;
  labelClassName?: string;
  className?: string;
  triggerClassName?: string;
}) {
  const total = snapDurationToStep(value);

  useEffect(() => {
    if (total !== value) {
      onChange(total);
    }
    // Snap alignment only when value/total differ — avoid re-running when parent passes new function refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, total]);

  const hours = Math.floor(total / 60);
  const minutes = total % 60;

  const applyRawTotal = (raw: number) => {
    const clamped = Math.max(DURATION_MIN_MINUTES, Math.min(DURATION_MAX_MINUTES, raw));
    onChange(snapDurationToStep(clamped));
  };

  const pair = (
    <div className="grid grid-cols-2 gap-2">
      <div className="space-y-1">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Hours</span>
        <Select
          value={String(hours)}
          onValueChange={(v) => applyRawTotal(Number(v) * 60 + minutes)}
        >
          <SelectTrigger className={cn(triggerClassName)}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            {Array.from({ length: 13 }, (_, h) => (
              <SelectItem key={h} value={String(h)}>
                {h}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Min</span>
        <Select
          value={pad2(minutes)}
          onValueChange={(v) => applyRawTotal(hours * 60 + Number(v))}
        >
          <SelectTrigger className={cn(triggerClassName)}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            {FIVE_MINUTE_TICKS.map((m) => (
              <SelectItem key={m} value={pad2(m)}>
                {pad2(m)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  if (label) {
    return (
      <div className={cn("space-y-1.5", className)}>
        <Label className={cn("text-xs text-muted-foreground", labelClassName)}>{label}</Label>
        {pair}
      </div>
    );
  }

  return <div className={className}>{pair}</div>;
}
