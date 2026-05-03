import { useMemo } from "react";
import { Utensils } from "lucide-react";
import { CATEGORY_META, DAYS, DayKey, ScheduledEvent } from "@/lib/aria-types";
import { cn } from "@/lib/utils";
import { computeOverlapColumnLayoutForDay, DayEventOverlapVisual, formatLabel, toMin } from "@/lib/schedule-utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const LINE_CLAMP = ["line-clamp-1", "line-clamp-2", "line-clamp-3", "line-clamp-4", "line-clamp-5"] as const;

/** Same template for header + body so day columns line up; minmax(0,1fr) avoids uneven fr tracks. */
const GRID_COLS = "grid grid-cols-[60px_repeat(7,minmax(0,1fr))]";

/**
 * Title lines from vertical budget (icon sits beside text, so most of the card height is for the title).
 * Times live in tooltip only.
 */
function titleLineClampClass(height: number): string {
  /** Reserve space for vertical padding + row icon alignment (icon is horizontal). */
  const padV = 12;
  const titleAvail = height - padV;
  if (titleAvail < 16) return LINE_CLAMP[0];
  if (titleAvail < 28) return LINE_CLAMP[1];
  if (titleAvail < 40) return LINE_CLAMP[2];
  const lines = Math.min(5, Math.max(3, Math.floor(titleAvail / 13)));
  return LINE_CLAMP[lines - 1];
}

function titleTextSizeClass(height: number, ultraNarrow: boolean): string {
  if (ultraNarrow && height < 40) return "text-[10px] leading-tight";
  if (height < 34) return "text-[11px] leading-tight";
  return "text-[11px] leading-snug sm:text-[12px]";
}

interface Props {
  events: ScheduledEvent[];
  dayStart: string;
  dayEnd: string;
  /** IDs of `fixed` events expanded from onboarding `fixedBlocks` (e.g. `blockId-Mon`). */
  recurringFixedEventIds?: ReadonlySet<string>;
  /** Pixels per hour; controls vertical density (from preferences). */
  hourHeightPx?: number;
  onEventClick?: (e: ScheduledEvent) => void;
}

function overlapTooltipExtra(visual: DayEventOverlapVisual): string | null {
  if (visual === "conflict-muted")
    return "Two fixed blocks overlap here — adjust one or ask Aria to fix it.";
  if (visual === "flex-over-fixed")
    return "This task crosses a fixed time — drag it in edit or ask Aria to move it.";
  if (visual === "flex-over-meal")
    return "This task crosses a meal band — nudge it or ask Aria to replan.";
  return null;
}

export default function CalendarGrid(props: Props) {
  const { events, dayStart, dayEnd, hourHeightPx = 52, onEventClick } = props;
  const recurringFixedEventIds = props.recurringFixedEventIds;

  const hourH = Math.min(100, Math.max(28, Math.round(hourHeightPx / 4) * 4));
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

  const layoutsByDay = useMemo(() => {
    const m = new Map<DayKey, ReturnType<typeof computeOverlapColumnLayoutForDay>>();
    for (const d of DAYS) {
      m.set(d, computeOverlapColumnLayoutForDay(events.filter((e) => e.day === d)));
    }
    return m;
  }, [events]);

  return (
    <div className="rounded-xl border bg-card shadow-soft overflow-hidden flex flex-col min-w-0">
      {/*
        Single scroll region + sticky header: scrollbar gutter applies once so weekday headers
        stay aligned with day columns (avoids body-only scrollbar shrinking the grid).
      */}
      <div className="max-h-[calc(100vh-220px)] min-h-[280px] overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable] overscroll-y-contain">
        <div
          className={cn(
            GRID_COLS,
            "sticky top-0 z-20 shrink-0 border-b bg-muted/30 backdrop-blur-sm",
          )}
        >
          <div className="min-w-0 border-r border-border/60" aria-hidden />
          {DAYS.map((d, di) => {
            const isToday = d === today;
            return (
              <div
                key={d}
                className={cn(
                  "min-w-0 px-2 py-2.5 sm:px-3 sm:py-3 text-center",
                  di > 0 && "border-l border-border/60",
                  isToday && "bg-primary/5",
                )}
              >
                <div
                  className={cn(
                    "text-xs uppercase tracking-wider font-medium",
                    isToday ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {d}
                </div>
              </div>
            );
          })}
        </div>

        <div className={cn(GRID_COLS, "relative isolate")}>
          {/* Hour gutter */}
          <div className="min-w-0 border-r border-border/60 bg-muted/10">
            {hours.map((h) => (
              <div
                key={h}
                style={{ height: hourH }}
                className="text-[10px] text-muted-foreground pr-1.5 sm:pr-2 pt-0 text-right relative"
              >
                <span className="absolute -top-1.5 right-1.5 sm:right-2">{formatLabel(`${h}:00`)}</span>
              </div>
            ))}
          </div>

          {DAYS.map((d, di) => {
            const dayEvents = events.filter((e) => e.day === d);
            const layoutMap = layoutsByDay.get(d)!;
            const isToday = d === today;
            return (
              <div
                key={d}
                className={cn(
                  "relative min-w-0",
                  di > 0 && "border-l border-border/60",
                  isToday && "bg-primary/[0.025]",
                )}
                style={{ height: totalHours * hourH }}
              >
                {hours.map((h, i) => (
                  <div
                    key={h}
                    className={cn("absolute left-0 right-0 border-t border-border/40", i === 0 && "border-t-0")}
                    style={{ top: i * hourH }}
                  />
                ))}

                {dayEvents.map((ev) => {
                  const lay =
                    layoutMap.get(ev.id) ??
                    ({ column: 0, columnCount: 1, visual: "normal" as const });
                  const top = ((toMin(ev.start) - startMin) / 60) * hourH;
                  /** True duration height only — inflating short blocks made them spill into other times visually. */
                  const durationPx = ((toMin(ev.end) - toMin(ev.start)) / 60) * hourH;
                  const height = Math.max(14, Math.floor(durationPx) - 1);
                  const meta = CATEGORY_META[ev.category];
                  const emoji = ev.emoji ?? meta.emoji;
                  const tight = lay.columnCount >= 2;
                  const ultra = lay.columnCount >= 3;
                  const edgePad = lay.columnCount >= 3 ? 3 : 4;
                  const isRecurringFixed =
                    ev.kind === "fixed" && recurringFixedEventIds && recurringFixedEventIds.has(ev.id);
                  /** Draw flexible / one-off fixed above meals and recurring fixed bars. */
                  const zPaint =
                    ev.kind === "meal"
                      ? 10 + lay.column
                      : ev.kind === "fixed" && isRecurringFixed
                        ? 11 + lay.column
                        : 20 + lay.column;
                  const leftExpr = `calc(${edgePad}px + ${lay.column} * (100% - ${edgePad * 2}px) / ${lay.columnCount})`;
                  const widthExpr = `calc((100% - ${edgePad * 2}px) / ${lay.columnCount})`;

                  const baseColor =
                    ev.kind === "meal"
                      ? "border border-zinc-200/85 border-l-[3px] border-l-zinc-400/55 bg-white/95 text-zinc-900 shadow-sm dark:border-zinc-600/70 dark:border-l-zinc-400/50 dark:bg-zinc-900/40 dark:text-zinc-50"
                      : isRecurringFixed
                        ? "border border-neutral-300/95 border-l-[3px] border-l-neutral-500 bg-neutral-300/90 text-neutral-950 shadow-sm dark:border-neutral-600 dark:border-l-neutral-400 dark:bg-neutral-600/85 dark:text-neutral-50"
                        : `bg-cat-${ev.category}-soft border border-cat-${ev.category} border-l-[3px] text-foreground shadow-sm`;

                  const clamp = titleLineClampClass(height);
                  const titleSize = titleTextSizeClass(height, ultra);

                  const overlapStyle =
                    lay.visual === "conflict-muted"
                      ? "opacity-[0.72] grayscale-[0.2] border-dashed border-muted-foreground/60 ring-inset ring-1 ring-muted-foreground/20"
                      : lay.visual === "flex-over-fixed"
                        ? "ring-inset ring-1 ring-amber-500/45 border-amber-700/25 dark:ring-amber-400/40"
                        : lay.visual === "flex-over-meal"
                          ? "ring-inset ring-1 ring-sky-400/40 border-sky-800/15 dark:ring-sky-500/35"
                          : "";

                  const extra = overlapTooltipExtra(lay.visual);
                  const padX = tight ? "px-1 sm:px-1.5" : "px-1.5 sm:px-2";
                  const padY = height < 32 ? "py-0.5" : height < 42 ? "py-1" : "py-1.5";

                  return (
                    <Tooltip key={ev.id} delayDuration={ultra ? 100 : tight ? 200 : 400}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          title={ev.title}
                          aria-label={`${ev.title}, ${formatLabel(ev.start)} to ${formatLabel(ev.end)}`}
                          onClick={() => onEventClick?.(ev)}
                          className={cn(
                            "absolute flex min-h-0 min-w-0 flex-col rounded-md text-left shadow-sm",
                            padY,
                            padX,
                            "box-border overflow-hidden transition-shadow hover:shadow-md hover:!z-[50] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            baseColor,
                            ev.kind === "tentative" && "hatched",
                            overlapStyle,
                          )}
                          style={{
                            top,
                            height,
                            zIndex: zPaint,
                            left: leftExpr,
                            width: widthExpr,
                          }}
                        >
                          <div className="flex min-h-0 min-w-0 flex-1 flex-row items-start gap-1 overflow-hidden">
                            {ev.kind === "meal" ? (
                              <span
                                className="mt-0.5 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center text-stone-600 dark:text-stone-300"
                                aria-hidden
                              >
                                <Utensils className="h-3 w-3" strokeWidth={2} />
                              </span>
                            ) : (
                              <span className="mt-0.5 shrink-0 text-[11px] leading-none sm:text-[12px]" aria-hidden>
                                {emoji}
                              </span>
                            )}
                            <span
                              className={cn(
                                "min-w-0 flex-1 font-semibold tracking-tight break-words [overflow-wrap:anywhere] [hyphens:auto]",
                                titleSize,
                                clamp,
                                ev.kind === "meal" && "font-semibold text-stone-900 dark:text-stone-100",
                                ev.kind !== "meal" && "text-foreground",
                              )}
                            >
                              {ev.title}
                            </span>
                          </div>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs">
                        <p className="font-medium leading-snug">{ev.title}</p>
                        <p className="text-xs text-muted-foreground mt-1 tabular-nums">
                          {d} · {ev.start}–{ev.end} ({formatLabel(ev.start)} – {formatLabel(ev.end)})
                        </p>
                        {extra ? <p className="text-xs text-muted-foreground mt-1.5 leading-snug">{extra}</p> : null}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
