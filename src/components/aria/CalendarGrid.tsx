import { useMemo, useRef, useState } from "react";
import { Utensils } from "lucide-react";
import { CATEGORY_META, DAYS, DayKey, ScheduledEvent } from "@/lib/aria-types";
import { cn } from "@/lib/utils";
import {
  computeOverlapColumnLayoutForDay,
  DayEventOverlapVisual,
  formatLabel,
  fromMin,
  snapMinutesToStep,
  toMin,
} from "@/lib/schedule-utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const LINE_CLAMP = ["line-clamp-1", "line-clamp-2", "line-clamp-3", "line-clamp-4", "line-clamp-5"] as const;

const DRAG_THRESHOLD_PX = 8;

/** Same template for header + body so day columns line up; minmax(0,1fr) avoids uneven fr tracks. */
const GRID_COLS = "grid grid-cols-[60px_repeat(7,minmax(0,1fr))]";

type DragPreview = { eventId: string; day: DayKey; startMin: number };

function eventDurationMinutes(ev: ScheduledEvent): number {
  const a = toMin(ev.start);
  const b = toMin(ev.end);
  const d = Number.isFinite(b) && b > a ? b - a : 60;
  return Math.max(15, Math.round(d / 5) * 5);
}

function projectedEventsForLayout(events: ScheduledEvent[], dragPreview: DragPreview | null): ScheduledEvent[] {
  if (!dragPreview) return events;
  return events.map((e) => {
    if (e.id !== dragPreview.eventId) return e;
    const dur = eventDurationMinutes(e);
    return {
      ...e,
      day: dragPreview.day,
      start: fromMin(dragPreview.startMin),
      end: fromMin(dragPreview.startMin + dur),
    };
  });
}

function clampDragStartMin(startMin: number, durMin: number, gridStart: number, gridEnd: number): number {
  let s = snapMinutesToStep(startMin, 15);
  const maxStart = gridEnd - durMin;
  if (!Number.isFinite(maxStart)) return s;
  return Math.max(gridStart, Math.min(maxStart, s));
}

function isDraggableCalendarEvent(ev: ScheduledEvent, recurringFixedIds: ReadonlySet<string> | undefined): boolean {
  if (ev.kind === "meal") return false;
  if (ev.kind === "flexible" || ev.kind === "tentative") return true;
  if (ev.kind === "fixed" && recurringFixedIds && !recurringFixedIds.has(ev.id)) return true;
  return false;
}

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
  /** Drag-drop reschedule for flexible / tentative / non-recurring fixed rows. */
  onEventMove?: (e: ScheduledEvent, next: { day: DayKey; start: string; end: string }) => void;
}

function overlapTooltipExtra(visual: DayEventOverlapVisual): string | null {
  if (visual === "conflict-muted")
    return "Two fixed blocks overlap here — adjust one or ask Aria to fix it.";
  if (visual === "flex-over-fixed")
    return "This task crosses a fixed time — drag it to another slot or ask Aria to replan.";
  if (visual === "flex-over-meal")
    return "This task crosses a meal band — drag it or ask Aria to replan.";
  return null;
}

export default function CalendarGrid(props: Props) {
  const { events, dayStart, dayEnd, hourHeightPx = 52, onEventClick, onEventMove, recurringFixedEventIds } = props;

  const hourH = Math.min(100, Math.max(28, Math.round(hourHeightPx / 4) * 4));
  const startMin = toMin(dayStart);
  const endMin = toMin(dayEnd);
  const totalMin = endMin - startMin;
  const totalHours = Math.ceil(totalMin / 60);

  const layoutPropsRef = useRef({ hourH, startMin, endMin, totalMin });
  layoutPropsRef.current = { hourH, startMin, endMin, totalMin };

  const columnRefs = useRef<Partial<Record<DayKey, HTMLDivElement | null>>>({});
  const suppressClickRef = useRef(false);
  const dragSessionRef = useRef<{
    pointerId: number;
    event: ScheduledEvent;
    originX: number;
    originY: number;
    moved: boolean;
    element: HTMLElement;
  } | null>(null);

  const onEventMoveRef = useRef(onEventMove);
  onEventMoveRef.current = onEventMove;

  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);

  const hours = useMemo(() => {
    const out: number[] = [];
    for (let h = startMin / 60; h < endMin / 60; h++) out.push(h);
    return out;
  }, [startMin, endMin]);

  const today = new Date().toLocaleDateString("en-US", { weekday: "short" }) as DayKey;

  const projectedEvents = useMemo(() => projectedEventsForLayout(events, dragPreview), [events, dragPreview]);

  const layoutsByDay = useMemo(() => {
    const m = new Map<DayKey, ReturnType<typeof computeOverlapColumnLayoutForDay>>();
    for (const d of DAYS) {
      m.set(d, computeOverlapColumnLayoutForDay(projectedEvents.filter((e) => e.day === d)));
    }
    return m;
  }, [projectedEvents]);

  const hitTestColumn = (clientX: number, clientY: number): { day: DayKey; startMin: number } | null => {
    const { startMin: gs, endMin: ge, totalMin: tm } = layoutPropsRef.current;
    for (const d of DAYS) {
      const el = columnRefs.current[d];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) continue;
      const y = clientY - r.top;
      const ratio = Math.max(0, Math.min(1, r.height > 0 ? y / r.height : 0));
      const mins = gs + ratio * tm;
      return { day: d, startMin: mins };
    }
    return null;
  };

  const attachDragListeners = () => {
    const sess0 = dragSessionRef.current;
    if (!sess0) return;
    const pid = sess0.pointerId;

    const move = (e: PointerEvent) => {
      const sess = dragSessionRef.current;
      if (!sess || e.pointerId !== pid) return;

      const dx = e.clientX - sess.originX;
      const dy = e.clientY - sess.originY;
      if (!sess.moved && Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX) {
        sess.moved = true;
        try {
          sess.element.setPointerCapture(pid);
        } catch {
          /* noop */
        }
      }
      if (!sess.moved) return;

      const hit = hitTestColumn(e.clientX, e.clientY);
      const { startMin: gs, endMin: ge } = layoutPropsRef.current;
      const durMin = eventDurationMinutes(sess.event);
      if (!hit) return;
      const clamped = clampDragStartMin(hit.startMin, durMin, gs, ge);
      setDragPreview({ eventId: sess.event.id, day: hit.day, startMin: clamped });
    };

    const up = (e: PointerEvent) => {
      if (e.pointerId !== pid) return;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);

      const sess = dragSessionRef.current;
      dragSessionRef.current = null;
      setDragPreview(null);

      if (sess) {
        try {
          sess.element.releasePointerCapture(pid);
        } catch {
          /* noop */
        }
      }

      if (!sess?.moved) return;
      suppressClickRef.current = true;

      if (!onEventMoveRef.current) return;

      const hit = hitTestColumn(e.clientX, e.clientY);
      const { startMin: gs, endMin: ge } = layoutPropsRef.current;
      const durMin = eventDurationMinutes(sess.event);
      if (!hit) return;

      const clamped = clampDragStartMin(hit.startMin, durMin, gs, ge);
      const nextStart = fromMin(clamped);
      const nextEnd = fromMin(clamped + durMin);
      const changed =
        sess.event.day !== hit.day || sess.event.start !== nextStart || sess.event.end !== nextEnd;
      if (changed) onEventMoveRef.current(sess.event, { day: hit.day, start: nextStart, end: nextEnd });
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  return (
    <div className="rounded-xl border bg-card shadow-soft overflow-hidden flex flex-col min-w-0">
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
            const dayEvents = projectedEvents.filter((e) => e.day === d);
            const layoutMap = layoutsByDay.get(d)!;
            const isTodayCol = d === today;
            return (
              <div
                key={d}
                ref={(el) => {
                  columnRefs.current[d] = el;
                }}
                data-calendar-day={d}
                className={cn(
                  "relative min-w-0",
                  di > 0 && "border-l border-border/60",
                  isTodayCol && "bg-primary/[0.025]",
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

                  const canDrag = Boolean(onEventMove && isDraggableCalendarEvent(ev, recurringFixedEventIds));
                  const isDragging = dragPreview?.eventId === ev.id;

                  return (
                    <Tooltip key={ev.id} delayDuration={ultra ? 100 : tight ? 200 : 400}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          title={ev.title}
                          aria-label={`${ev.title}, ${formatLabel(ev.start)} to ${formatLabel(ev.end)}`}
                          {...(canDrag ? { "aria-grabbed": isDragging } : {})}
                          onClick={() => {
                            if (suppressClickRef.current) {
                              suppressClickRef.current = false;
                              return;
                            }
                            onEventClick?.(ev);
                          }}
                          onPointerDown={(e) => {
                            if (!canDrag || e.button !== 0) return;
                            dragSessionRef.current = {
                              pointerId: e.pointerId,
                              event: ev,
                              originX: e.clientX,
                              originY: e.clientY,
                              moved: false,
                              element: e.currentTarget as HTMLElement,
                            };
                            attachDragListeners();
                          }}
                          className={cn(
                            "absolute flex min-h-0 min-w-0 flex-col rounded-md text-left shadow-sm",
                            padY,
                            padX,
                            "box-border overflow-hidden transition-shadow hover:shadow-md hover:!z-[50] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            baseColor,
                            ev.kind === "tentative" && "hatched",
                            overlapStyle,
                            canDrag && "cursor-grab touch-none active:cursor-grabbing",
                            isDragging && "z-[45] scale-[1.02] shadow-lg ring-2 ring-primary/35",
                          )}
                          style={{
                            top,
                            height,
                            zIndex: zPaint + (isDragging ? 40 : 0),
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
                        {canDrag ? (
                          <p className="text-xs text-muted-foreground mt-1.5 leading-snug">
                            Drag to another day or time to reschedule.
                          </p>
                        ) : null}
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
