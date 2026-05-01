import { useMemo } from "react";
import { CATEGORY_META, DAYS, DayKey, ScheduledEvent } from "@/lib/aria-types";
import { cn } from "@/lib/utils";
import { formatLabel, toMin } from "@/lib/schedule-utils";

interface Props {
  events: ScheduledEvent[];
  dayStart: string;
  dayEnd: string;
  onEventClick?: (e: ScheduledEvent) => void;
}

const HOUR_HEIGHT = 56; // px per hour

export default function CalendarGrid({ events, dayStart, dayEnd, onEventClick }: Props) {
  const startMin = toMin(dayStart);
  const endMin = toMin(dayEnd);
  const totalMin = endMin - startMin;
  const totalHours = Math.ceil(totalMin / 60);

  const hours = useMemo(() => {
    const out: number[] = [];
    for (let h = startMin / 60; h < endMin / 60; h++) out.push(h);
    return out;
  }, [startMin, endMin]);

  const today = new Date().toLocaleDateString("en-US", { weekday: "short" }) as DayKey;

  return (
    <div className="rounded-xl border bg-card shadow-soft overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b bg-muted/30">
        <div />
        {DAYS.map((d) => {
          const isToday = d === today;
          return (
            <div
              key={d}
              className={cn(
                "px-3 py-3 text-center border-l first:border-l-0",
                isToday && "bg-primary/5"
              )}
            >
              <div className={cn("text-xs uppercase tracking-wider font-medium", isToday ? "text-primary" : "text-muted-foreground")}>
                {d}
              </div>
            </div>
          );
        })}
      </div>

      {/* Body */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] relative overflow-y-auto" style={{ maxHeight: "calc(100vh - 220px)" }}>
        {/* Hour gutter */}
        <div className="border-r bg-muted/10">
          {hours.map((h) => (
            <div key={h} style={{ height: HOUR_HEIGHT }} className="text-[10px] text-muted-foreground pr-2 pt-0 text-right relative">
              <span className="absolute -top-1.5 right-2">{formatLabel(`${h}:00`)}</span>
            </div>
          ))}
        </div>

        {/* Day columns */}
        {DAYS.map((d) => {
          const dayEvents = events.filter((e) => e.day === d);
          const isToday = d === today;
          return (
            <div
              key={d}
              className={cn(
                "relative border-l first:border-l-0",
                isToday && "bg-primary/[0.025]"
              )}
              style={{ height: totalHours * HOUR_HEIGHT }}
            >
              {/* Hour grid lines */}
              {hours.map((h, i) => (
                <div
                  key={h}
                  className={cn("absolute left-0 right-0 border-t", i === 0 && "border-t-0")}
                  style={{ top: i * HOUR_HEIGHT }}
                />
              ))}

              {dayEvents.map((ev) => {
                const top = ((toMin(ev.start) - startMin) / 60) * HOUR_HEIGHT;
                const height = Math.max(20, ((toMin(ev.end) - toMin(ev.start)) / 60) * HOUR_HEIGHT - 2);
                const meta = CATEGORY_META[ev.category];

                const baseColor =
                  ev.kind === "fixed"
                    ? "bg-cat-work text-white border-cat-work"
                    : `bg-cat-${ev.category}-soft border-cat-${ev.category} text-cat-${ev.category}`;

                return (
                  <button
                    key={ev.id}
                    onClick={() => onEventClick?.(ev)}
                    className={cn(
                      "absolute left-1 right-1 rounded-md border-l-[3px] px-2 py-1 text-left overflow-hidden transition-all hover:shadow-pop hover:z-10",
                      baseColor,
                      ev.kind === "tentative" && "hatched opacity-80"
                    )}
                    style={{ top, height }}
                  >
                    <div className="text-[11px] font-semibold leading-tight truncate">
                      <span className="mr-1">{meta.emoji}</span>{ev.title}
                    </div>
                    {height > 32 && (
                      <div className="text-[10px] opacity-80 mt-0.5">
                        {formatLabel(ev.start)} – {formatLabel(ev.end)}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
