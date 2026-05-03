import {
  CATEGORY_META,
  Category,
  CustomTaskCategory,
  DAYS,
  DayKey,
  FixedBlock,
  FlexibleTask,
  MealBreak,
  MealKind,
  MEAL_KIND_LABEL,
  Preferences,
  Priority,
  ScheduledEvent,
  dedupeRepairFlexibleEventIds,
  flexEventLikelyForWeeklyTask,
  normalizeMealBreak,
} from "./aria-types";
import { uid } from "./aria-storage";

const CAL_VIEW_PAD_MIN = 30;

// "HH:MM" -> minutes
export function toMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

// minutes -> "HH:MM"
export function fromMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function fixedBlocksToEvents(blocks: FixedBlock[]): ScheduledEvent[] {
  const out: ScheduledEvent[] = [];
  for (const b of blocks) {
    for (const d of b.days) {
      out.push({
        id: `${b.id}-${d}`,
        title: b.title,
        day: d,
        start: b.start,
        end: b.end,
        kind: "fixed",
        category: b.category,
        priority: "high",
      });
    }
  }
  return out;
}

/** Same clock commitment from blocks vs from AI `events` often differs only by id — treat as one bar. */
export function fixedEventFingerprint(ev: Pick<ScheduledEvent, "day" | "start" | "end" | "title" | "category">): string {
  const t = (ev.title ?? "").trim().toLowerCase();
  const c = ev.category ?? "";
  return `${ev.day}|${ev.start}|${ev.end}|${t}|${c}`;
}

/** Drop `kind: "fixed"` rows the assistant echoed for slots already covered by `fixedBlocks`. */
export function filterAiFixedNotRedundantWithBlocks(
  blockFixed: ScheduledEvent[],
  aiFixed: ScheduledEvent[],
): ScheduledEvent[] {
  const blockIds = new Set(blockFixed.map((e) => e.id));
  const blockFp = new Set(blockFixed.map((e) => fixedEventFingerprint(e)));
  return aiFixed.filter((e) => !blockIds.has(e.id) && !blockFp.has(fixedEventFingerprint(e)));
}

function dedupeFixedByFingerprint(events: ScheduledEvent[]): ScheduledEvent[] {
  const seen = new Set<string>();
  const out: ScheduledEvent[] = [];
  for (const e of events) {
    const fp = fixedEventFingerprint(e);
    if (seen.has(fp)) continue;
    seen.add(fp);
    out.push(e);
  }
  return out;
}

/**
 * User-added `kind: "fixed"` rows (not expanded onboarding blocks) must survive AI merges unchanged.
 * Drops AI fixed rows that collide with those by `id` or by day/start/end/title/category fingerprint.
 */
export function mergePinnedUserFixedFromState(
  persistedEvents: ScheduledEvent[],
  blockFixed: ScheduledEvent[],
  aiFixed: ScheduledEvent[],
): ScheduledEvent[] {
  const blockIds = new Set(blockFixed.map((e) => e.id));
  const blockFp = new Set(blockFixed.map((e) => fixedEventFingerprint(e)));
  const pinned = persistedEvents.filter(
    (e) =>
      e.kind === "fixed" &&
      !blockIds.has(e.id) &&
      !blockFp.has(fixedEventFingerprint(e)),
  );
  const pinnedIds = new Set(pinned.map((e) => e.id));
  const pinnedFp = new Set(pinned.map((e) => fixedEventFingerprint(e)));
  const aiSansPinned = aiFixed.filter(
    (e) => !pinnedIds.has(e.id) && !pinnedFp.has(fixedEventFingerprint(e)),
  );
  const fromAi = filterAiFixedNotRedundantWithBlocks(blockFixed, aiSansPinned);
  return dedupeFixedByFingerprint([...pinned, ...fromAi]);
}

/**
 * Recurring fixed blocks plus any `kind: "fixed"` rows already in `events` (e.g. one-offs from the assistant).
 * Rows that duplicate a block expansion (same id or same day/start/end/title/category fingerprint) are ignored.
 */
export function allFixedEventsForScheduling(input: {
  fixedBlocks: FixedBlock[];
  events: ScheduledEvent[];
}): ScheduledEvent[] {
  const fromBlocks = fixedBlocksToEvents(input.fixedBlocks);
  const blockIds = new Set(fromBlocks.map((e) => e.id));
  const blockFp = new Set(fromBlocks.map((e) => fixedEventFingerprint(e)));
  const rawStored = input.events.filter((e) => e.kind === "fixed" && !blockIds.has(e.id));
  const fromStored = dedupeFixedByFingerprint(
    rawStored.filter((e) => !blockFp.has(fixedEventFingerprint(e))),
  );
  return [...fromBlocks, ...fromStored];
}

type MinuteIv = { s: number; e: number };

function mealKindOrder(k: MealKind): number {
  if (k === "breakfast") return 0;
  if (k === "lunch") return 1;
  return 2;
}

function mergeMinuteIvs(ivs: MinuteIv[]): MinuteIv[] {
  if (!ivs.length) return [];
  const a = [...ivs].sort((x, y) => x.s - y.s);
  const out: MinuteIv[] = [];
  for (const cur of a) {
    const last = out[out.length - 1];
    if (!last || cur.s > last.e) out.push({ ...cur });
    else last.e = Math.max(last.e, cur.e);
  }
  return out;
}

function fixedIntervalsForDay(day: DayKey, fixedEvents: ScheduledEvent[]): MinuteIv[] {
  const ivs: MinuteIv[] = [];
  for (const ev of fixedEvents) {
    if (ev.kind !== "fixed" || ev.day !== day) continue;
    let s = toMin(ev.start);
    let e = toMin(ev.end);
    if (!Number.isFinite(s)) continue;
    if (!Number.isFinite(e) || e <= s) e = s + 60;
    ivs.push({ s, e });
  }
  return mergeMinuteIvs(ivs);
}

function flexTentativeIntervalsForDay(day: DayKey, flexEvents: ScheduledEvent[]): MinuteIv[] {
  const ivs: MinuteIv[] = [];
  for (const ev of flexEvents) {
    if ((ev.kind !== "flexible" && ev.kind !== "tentative") || ev.day !== day) continue;
    let s = toMin(ev.start);
    let e = toMin(ev.end);
    if (!Number.isFinite(s)) continue;
    if (!Number.isFinite(e) || e <= s) e = s + 60;
    ivs.push({ s, e });
  }
  return mergeMinuteIvs(ivs);
}

function mealEventIntervalsForDay(day: DayKey, mealEvents: ScheduledEvent[]): MinuteIv[] {
  const ivs: MinuteIv[] = [];
  for (const ev of mealEvents) {
    if (ev.kind !== "meal" || ev.day !== day) continue;
    let s = toMin(ev.start);
    let e = toMin(ev.end);
    if (!Number.isFinite(s)) continue;
    if (!Number.isFinite(e) || e <= s) e = s + 60;
    ivs.push({ s, e });
  }
  return mergeMinuteIvs(ivs);
}

function isWeekendDay(d: DayKey): boolean {
  return d === "Sat" || d === "Sun";
}

/** When the user picked specific weekdays, only those days are valid for placement (no silent spill to other days). */
function daysToTryWeekly(task: FlexibleTask): DayKey[] {
  const pref = task.preferredWeekdays;
  if (pref?.length) {
    const set = new Set(pref);
    return DAYS.filter((d) => set.has(d));
  }
  return [...DAYS];
}

function weeklyTaskSearchBand(task: FlexibleTask): { lo: number; hi: number } {
  const cap = 24 * 60;
  if (task.preferredTimeStyle === "windows" && task.preferredTimeWindows.length > 0) {
    let lo = cap;
    let hi = 0;
    for (const w of task.preferredTimeWindows) {
      lo = Math.min(lo, toMin(w.start));
      hi = Math.max(hi, toMin(w.end));
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) {
      hi = Math.min(cap, lo + task.durationMin);
    }
    return { lo: Math.max(0, lo), hi: Math.min(cap, hi) };
  }
  const tod = task.preferredTimeOfDay ?? "any";
  const bands: Record<string, [number, number]> = {
    morning: [6 * 60, 12 * 60],
    afternoon: [12 * 60, 17 * 60],
    evening: [17 * 60, 22 * 60],
    any: [6 * 60, 22 * 60],
  };
  const b = bands[tod] ?? bands.any;
  return { lo: b[0], hi: Math.min(cap, b[1]) };
}

function placeOneWeeklyOccurrence(
  task: FlexibleTask,
  flex: ScheduledEvent[],
  fixed: ScheduledEvent[],
  meals: ScheduledEvent[],
  preferences: Preferences,
  free: Set<DayKey>,
): ScheduledEvent | null {
  const dur = task.durationMin;
  const step = 15;

  for (const day of daysToTryWeekly(task)) {
    if (free.has(day)) continue;
    const blocked = mergeMinuteIvs([
      ...fixedIntervalsForDay(day, fixed),
      ...flexTentativeIntervalsForDay(day, flex),
      ...mealEventIntervalsForDay(day, meals),
    ]);

    const { lo: bandLo, hi: bandHi } = weeklyTaskSearchBand(task);
    const ms = isWeekendDay(day) ? toMin(preferences.morningStartWeekend) : toMin(preferences.morningStartWeekday);
    const lo = Number.isFinite(ms) ? Math.max(bandLo, ms) : bandLo;
    const hi = bandHi;
    if (hi < lo + dur) continue;

    const overlaps = (S: number) => blocked.some((b) => S < b.e && S + dur > b.s);
    const protectFromMin =
      preferences.protectEvenings && !isWeekendDay(day) ? toMin(preferences.protectEveningsFrom) : null;

    const startS = Math.ceil(lo / step) * step;
    for (let S = startS; S + dur <= hi; S += step) {
      if (protectFromMin !== null && Number.isFinite(protectFromMin) && S >= protectFromMin) continue;
      if (!overlaps(S)) {
        return {
          id: `${task.id}-fill-${uid()}`,
          title: task.title,
          day,
          start: fromMin(S),
          end: fromMin(S + dur),
          kind: "flexible",
          category: task.category,
          priority: task.priority,
        };
      }
    }
  }
  return null;
}

/**
 * After an AI pass, ensure weekly tasks with timesPerWeekMin > 1 have at least that many flexible rows
 * (same title) when any slot exists in their preferred band.
 */
export function ensureWeeklyFlexibleMinPlacements(
  tasks: FlexibleTask[],
  flexEvents: ScheduledEvent[],
  fixedEvents: ScheduledEvent[],
  mealBreaks: MealBreak[],
  preferences: Preferences,
): ScheduledEvent[] {
  const free = new Set(preferences.freeDays ?? []);
  const flex = dedupeRepairFlexibleEventIds([...flexEvents]);

  for (const task of tasks) {
    if (task.frequency !== "weekly" || task.timesPerWeekMin <= 1) continue;
    const match = (e: ScheduledEvent) => flexEventLikelyForWeeklyTask(task, e);
    let count = flex.filter(match).length;

    while (count < task.timesPerWeekMin) {
      if (count >= task.timesPerWeekMax) break;
      const meals = mealBreaksToEvents(mealBreaks, fixedEvents, flex);
      const placed = placeOneWeeklyOccurrence(task, flex, fixedEvents, meals, preferences, free);
      if (!placed) break;
      flex.push(placed);
      count++;
    }
  }
  return flex;
}

/**
 * Best 5-min snapped start for [S, S+dur] avoiding blocked intervals.
 * Minimizes minutes **outside** the user's meal window [ws, we] (early + late); ties prefer less spill past `we`,
 * then less spill before `ws`, then earlier start — unless `preferLaterInWindowTie` (dinner + flex in window), then
 * among equal (p, late spill, early spill) prefer **later** start so the meal tends to sit after evening activities.
 */
function pickBestMealStart(
  sLo: number,
  sHi: number,
  dur: number,
  merged: MinuteIv[],
  ws: number,
  we: number,
  preferLater: boolean,
): number | null {
  const overlaps = (S: number) => merged.some((b) => S < b.e && S + dur > b.s);
  const penalty = (S: number) => Math.max(0, ws - S) + Math.max(0, S + dur - we);
  const lateSpill = (S: number) => Math.max(0, S + dur - we);
  const earlySpill = (S: number) => Math.max(0, ws - S);

  let best: number | null = null;
  let bestP = Infinity;
  let bestLate = Infinity;
  let bestEarly = Infinity;

  const first = Math.ceil(sLo / 5) * 5;
  for (let S = first; S <= sHi; S += 5) {
    if (overlaps(S)) continue;
    const p = penalty(S);
    const L = lateSpill(S);
    const E = earlySpill(S);
    if (p < bestP) {
      bestP = p;
      bestLate = L;
      bestEarly = E;
      best = S;
    } else if (p === bestP) {
      const betterLate = L < bestLate;
      const betterEarly = L === bestLate && E < bestEarly;
      const betterTieStart =
        L === bestLate &&
        E === bestEarly &&
        best !== null &&
        (preferLater ? S > best : S < best);
      if (betterLate || betterEarly || betterTieStart) {
        bestLate = L;
        bestEarly = E;
        best = S;
      }
    }
  }
  return best;
}

/**
 * Pick meal start: prefer fully inside [ws, we]; only if impossible, allow limited spill
 * (bounded band) so meals never land at arbitrary hours across the day.
 */
function mealStartMinutesPenalized(
  ws: number,
  we: number,
  dur: number,
  blocked: MinuteIv[],
  opts?: { preferLaterInWindowTie?: boolean },
): number | null {
  const preferLater = opts?.preferLaterInWindowTie ?? false;
  const merged = mergeMinuteIvs(blocked);
  if (we <= ws || dur <= 0) return null;

  const cap = 24 * 60;
  const strictLo = ws;
  const strictHi = Math.min(we - dur, cap - dur);
  if (strictLo <= strictHi) {
    const inWin = pickBestMealStart(strictLo, strictHi, dur, merged, ws, we, preferLater);
    if (inWin !== null) return inWin;
  }

  /** Max minutes a meal may start before ws or end after we when no in-window gap exists. */
  const spillMax = 90;
  const looseLo = Math.max(0, ws - spillMax);
  const looseHi = Math.min(cap - dur, we + spillMax - dur);
  return pickBestMealStart(looseLo, looseHi, dur, merged, ws, we, preferLater);
}

/**
 * Calendar + AI: place meals after **fixed** intervals, **avoiding flexible/tentative** when a free slot exists
 * inside the meal window (or with minimal spill outside only if needed). Earlier meals on the same day are blocked
 * for later ones. Dinner prefers a **later** start among tied in-window solutions when flex overlaps the dinner window,
 * so evening tasks (e.g. 18:00–19:30) tend to push dinner toward the end of the band. `bumpFlexEventsClearOfMeals`
 * still nudges flex for AI context when tiny residual overlaps remain.
 */
/** Minimum gap between end of one meal and start of the next on the same day (realistic spacing). */
const MIN_MINUTES_BETWEEN_MEALS = 90;

type MealWindowMeta = { ws: number; we: number; dur: number };

function mealIntervalsForDayExcluding(
  day: DayKey,
  meals: ScheduledEvent[],
  excludeId: string,
): MinuteIv[] {
  const ivs: MinuteIv[] = [];
  for (const ev of meals) {
    if (ev.kind !== "meal" || ev.day !== day || ev.id === excludeId) continue;
    let s = toMin(ev.start);
    let e = toMin(ev.end);
    if (!Number.isFinite(s)) continue;
    if (!Number.isFinite(e) || e <= s) e = s + 60;
    ivs.push({ s, e });
  }
  return mergeMinuteIvs(ivs);
}

function mealCanStartAt(
  day: DayKey,
  startMin: number,
  dur: number,
  excludeId: string,
  meals: ScheduledEvent[],
  fixedOnly: ScheduledEvent[],
  flexOnly: ScheduledEvent[],
): boolean {
  const e = startMin + dur;
  const blocked = mergeMinuteIvs([
    ...fixedIntervalsForDay(day, fixedOnly),
    ...flexTentativeIntervalsForDay(day, flexOnly),
    ...mealIntervalsForDayExcluding(day, meals, excludeId),
  ]);
  return !blocked.some((b) => startMin < b.e && e > b.s);
}

/** Like `mealCanStartAt` but requires the meal interval to stay inside [ws, we]. */
function mealCanStartAtInWindow(
  day: DayKey,
  startMin: number,
  dur: number,
  ws: number,
  we: number,
  excludeId: string,
  meals: ScheduledEvent[],
  fixedOnly: ScheduledEvent[],
  flexOnly: ScheduledEvent[],
): boolean {
  if (startMin < ws || startMin + dur > we) return false;
  return mealCanStartAt(day, startMin, dur, excludeId, meals, fixedOnly, flexOnly);
}

/**
 * After initial meal placement, slide meals earlier/later within their windows so consecutive meals
 * are not unrealistically close (e.g. breakfast ending at 10:40 with lunch at 11:30).
 */
function refineConsecutiveMealGaps(
  meals: ScheduledEvent[],
  metaById: Map<string, MealWindowMeta>,
  fixedOnly: ScheduledEvent[],
  flexOnly: ScheduledEvent[],
): ScheduledEvent[] {
  const list = meals.map((e) => ({ ...e }));

  const rowForDay = (day: DayKey) =>
    list
      .map((e, i) => ({ e, i }))
      .filter((x) => x.e.kind === "meal" && x.e.day === day)
      .sort((a, b) => toMin(a.e.start) - toMin(b.e.start));

  for (let pass = 0; pass < 16; pass++) {
    let changed = false;
    for (const day of DAYS) {
      const row = rowForDay(day);
      for (let j = 0; j < row.length - 1; j++) {
        const { e: a, i: ia } = row[j]!;
        const { e: b, i: ib } = row[j + 1]!;
        const metaA = metaById.get(a.id);
        const metaB = metaById.get(b.id);
        if (!metaA || !metaB) continue;

        let aStart = toMin(a.start);
        let aEnd = toMin(a.end);
        if (!Number.isFinite(aEnd) || aEnd <= aStart) aEnd = aStart + metaA.dur;
        let bStart = toMin(b.start);
        let bEnd = toMin(b.end);
        if (!Number.isFinite(bEnd) || bEnd <= bStart) bEnd = bStart + metaB.dur;

        const gap = bStart - aEnd;
        if (gap >= MIN_MINUTES_BETWEEN_MEALS) continue;

        const minBStart = aEnd + MIN_MINUTES_BETWEEN_MEALS;
        const maxBStart = metaB.we - metaB.dur;

        let chosenB: number | null = null;
        if (minBStart <= maxBStart) {
          const first = Math.max(bStart, Math.ceil(minBStart / 5) * 5);
          for (let trial = first; trial <= maxBStart; trial += 5) {
            if (
              mealCanStartAtInWindow(day, trial, metaB.dur, metaB.ws, metaB.we, b.id, list, fixedOnly, flexOnly)
            ) {
              chosenB = trial;
              break;
            }
          }
        }
        if (chosenB !== null && chosenB > bStart) {
          list[ib] = {
            ...b,
            start: fromMin(chosenB),
            end: fromMin(chosenB + metaB.dur),
          };
          changed = true;
          continue;
        }

        const latestAStart = bStart - MIN_MINUTES_BETWEEN_MEALS - metaA.dur;
        let chosenA: number | null = null;
        const maxAStart = metaA.we - metaA.dur;
        if (latestAStart >= metaA.ws && maxAStart >= metaA.ws) {
          const candidateStart = Math.min(aStart, Math.floor(latestAStart / 5) * 5);
          const first = Math.min(candidateStart, maxAStart);
          for (let trial = first; trial >= metaA.ws; trial -= 5) {
            if (
              !mealCanStartAtInWindow(day, trial, metaA.dur, metaA.ws, metaA.we, a.id, list, fixedOnly, flexOnly)
            ) {
              continue;
            }
            chosenA = trial;
            break;
          }
        }
        if (chosenA !== null && chosenA < aStart) {
          list[ia] = {
            ...a,
            start: fromMin(chosenA),
            end: fromMin(chosenA + metaA.dur),
          };
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return list;
}

export function mealBreaksToEvents(
  breaks: MealBreak[],
  fixedEvents: ScheduledEvent[],
  flexTentative?: ScheduledEvent[],
): ScheduledEvent[] {
  const fixedOnly = fixedEvents.filter((e) => e.kind === "fixed");
  const flexOnly = (flexTentative ?? []).filter((e) => e.kind === "flexible" || e.kind === "tentative");
  const sorted = [...breaks]
    .map(normalizeMealBreak)
    .filter((m) => m.enabled && m.days.length)
    .sort((a, b) => {
      const o = mealKindOrder(a.kind) - mealKindOrder(b.kind);
      return o !== 0 ? o : a.id.localeCompare(b.id);
    });

  const out: ScheduledEvent[] = [];
  const mealMetaById = new Map<string, MealWindowMeta>();
  const placedByDay = new Map<DayKey, MinuteIv[]>();

  for (const m of sorted) {
    for (const d of m.days) {
      const ws = toMin(m.windowStart);
      const we = toMin(m.windowEnd);
      const dur = m.durationMin;
      const flexIvs = flexTentativeIntervalsForDay(d, flexOnly);
      const flexOverlapsMealWindow = flexIvs.some((iv) => iv.s < we && iv.e > ws);
      const blocked: MinuteIv[] = [
        ...fixedIntervalsForDay(d, fixedOnly),
        ...(placedByDay.get(d) ?? []),
        ...flexIvs,
      ];
      const preferLaterDinner = m.kind === "dinner" && flexOverlapsMealWindow;
      const start = mealStartMinutesPenalized(ws, we, dur, blocked, {
        preferLaterInWindowTie: preferLaterDinner,
      });
      if (start === null) continue;

      const endMin = start + dur;
      const id = `meal-${m.id}-${d}`;
      mealMetaById.set(id, { ws, we, dur });
      out.push({
        id,
        title: MEAL_KIND_LABEL[m.kind],
        day: d,
        start: fromMin(start),
        end: fromMin(endMin),
        kind: "meal",
        category: "other",
      });
      const arr = placedByDay.get(d) ?? [];
      arr.push({ s: start, e: endMin });
      placedByDay.set(d, mergeMinuteIvs(arr));
    }
  }
  let placed = refineConsecutiveMealGaps(out, mealMetaById, fixedOnly, flexOnly);
  placed = placed.map((ev) => {
    const meta = mealMetaById.get(ev.id);
    if (!meta) return ev;
    let s = toMin(ev.start);
    if (!Number.isFinite(s)) return ev;
    s = Math.min(Math.max(s, meta.ws), Math.max(meta.ws, meta.we - meta.dur));
    return { ...ev, start: fromMin(s), end: fromMin(s + meta.dur) };
  });
  return dedupeMealsSameDayTitle(placed);
}

/** If two meal rows share the same day and title (e.g. duplicate breakfast rules), keep one bar. */
function dedupeMealsSameDayTitle(meals: ScheduledEvent[]): ScheduledEvent[] {
  const best = new Map<string, ScheduledEvent>();
  for (const ev of meals) {
    if (ev.kind !== "meal") continue;
    const key = `${ev.day}|${ev.title}`;
    const prev = best.get(key);
    if (!prev || toMin(ev.start) < toMin(prev.start)) best.set(key, ev);
  }
  const keep = new Set([...best.values()].map((x) => x.id));
  return meals.filter((ev) => ev.kind !== "meal" || keep.has(ev.id));
}

const BUMP_FLEX_DAY_LO = 6 * 60;
/** Allow nudging flexible tasks through late evening so they can clear dinner without staying at 22:00 cap. */
const BUMP_FLEX_DAY_HI = 24 * 60;
const BUMP_STEP_MIN = 15;

/**
 * Shift flexible/tentative events minimally so they do not overlap placed **meals** (cleanup when meals could not
 * fully slide around flex inside `mealBreaksToEvents`, or for AI context).
 */
export function bumpFlexEventsClearOfMeals(
  flex: ScheduledEvent[],
  meals: ScheduledEvent[],
  fixedEvents: ScheduledEvent[],
): ScheduledEvent[] {
  const fixedOnly = fixedEvents.filter((e) => e.kind === "fixed");
  const mealPlaced = meals.filter((e) => e.kind === "meal");
  if (!flex.length || !mealPlaced.length) return flex.map((e) => ({ ...e }));

  let result = flex.map((e) => ({ ...e }));

  const overlapsMealOnDay = (day: DayKey, s: number, e: number) =>
    mealPlaced.some((m) => {
      if (m.day !== day) return false;
      const ms = toMin(m.start);
      let me = toMin(m.end);
      if (!Number.isFinite(ms)) return false;
      if (!Number.isFinite(me) || me <= ms) me = ms + 60;
      return s < me && e > ms;
    });

  const sortFlex = (xs: ScheduledEvent[]) =>
    [...xs].sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || toMin(a.start) - toMin(b.start));

  for (let pass = 0; pass < 18; pass++) {
    let changed = false;
    for (const f of sortFlex(result)) {
      let s0 = toMin(f.start);
      let e0 = toMin(f.end);
      if (!Number.isFinite(s0)) s0 = BUMP_FLEX_DAY_LO;
      if (!Number.isFinite(e0) || e0 <= s0) e0 = s0 + 60;
      const dur = e0 - s0;
      if (dur <= 0) continue;

      if (!overlapsMealOnDay(f.day, s0, e0)) continue;

      const blocked = mergeMinuteIvs([
        ...fixedIntervalsForDay(f.day, fixedOnly),
        ...mealEventIntervalsForDay(f.day, mealPlaced),
        ...flexTentativeIntervalsForDay(
          f.day,
          result.filter((x) => x.id !== f.id),
        ),
      ]);
      const overlapsBlocked = (S: number) => blocked.some((b) => S < b.e && S + dur > b.s);

      let bestS: number | null = null;
      let bestDist = Infinity;
      const firstS = Math.ceil(BUMP_FLEX_DAY_LO / BUMP_STEP_MIN) * BUMP_STEP_MIN;
      for (let S = firstS; S + dur <= BUMP_FLEX_DAY_HI; S += BUMP_STEP_MIN) {
        if (overlapsBlocked(S)) continue;
        const dist = Math.abs(S - s0);
        if (dist < bestDist || (dist === bestDist && bestS !== null && S < bestS)) {
          bestDist = dist;
          bestS = S;
        }
      }

      if (bestS !== null && bestS !== s0) {
        result = result.map((e) =>
          e.id === f.id ? { ...e, start: fromMin(bestS!), end: fromMin(bestS! + dur) } : e,
        );
        changed = true;
      }
    }
    if (!changed) break;
  }

  return result;
}

/** Sortable priority for overlap UI (fixed defaults to high when missing). */
export function priorityRank(p: Priority | undefined, kind: ScheduledEvent["kind"]): number {
  if (p === "high") return 3;
  if (p === "low") return 1;
  if (p === "medium") return 2;
  if (kind === "fixed" || kind === "meal") return 3;
  return 2;
}

/**
 * Remove flex↔flex (and flex↔fixed / flex↔meal) time overlaps by shifting lower-priority / later-start tasks later
 * in 15-minute steps. Honors morningStart*, preferredGapBetweenTasksMin as a trailing gap after each placed flex,
 * and recomputes meal bands each pass so layout stays consistent.
 */
export function resolveFlexTentativeOverlaps(
  flex: ScheduledEvent[],
  fixedEvents: ScheduledEvent[],
  mealBreaks: MealBreak[],
  preferences: Preferences,
): ScheduledEvent[] {
  let out = dedupeRepairFlexibleEventIds(flex.map((e) => ({ ...e })));
  const fixedOnly = fixedEvents.filter((e) => e.kind === "fixed");
  const gap = Math.max(0, Math.round((preferences.preferredGapBetweenTasksMin ?? 0) / 5) * 5);

  for (let pass = 0; pass < 10; pass++) {
    let changed = false;
    const meals = mealBreaksToEvents(
      mealBreaks,
      fixedEvents,
      out.filter((e) => e.kind === "flexible" || e.kind === "tentative"),
    );

    for (const day of DAYS) {
      const morningRaw = isWeekendDay(day) ? preferences.morningStartWeekend : preferences.morningStartWeekday;
      let morning = toMin(morningRaw || "00:00");
      if (!Number.isFinite(morning)) morning = 0;

      const baseBlocked = mergeMinuteIvs([
        ...fixedIntervalsForDay(day, fixedOnly),
        ...mealEventIntervalsForDay(day, meals),
      ]);

      const flexIdx = out
        .map((e, i) => ({ e, i }))
        .filter((x) => x.e.day === day && (x.e.kind === "flexible" || x.e.kind === "tentative"))
        .sort((a, b) => {
          const rp = priorityRank(b.e.priority, b.e.kind) - priorityRank(a.e.priority, a.e.kind);
          if (rp !== 0) return rp;
          const ds = toMin(a.e.start) - toMin(b.e.start);
          if (ds !== 0) return ds;
          return a.e.id.localeCompare(b.e.id);
        });

      let placedFlex: MinuteIv[] = [];

      for (const { e, i } of flexIdx) {
        let s = toMin(e.start);
        let eM = toMin(e.end);
        if (!Number.isFinite(s)) s = morning;
        if (!Number.isFinite(eM) || eM <= s) eM = s + 60;
        const durRaw = eM - s;
        const dur = Math.max(15, Math.round(durRaw / 5) * 5);

        s = Math.max(s, morning);

        const gapBlock =
          gap > 0 ? placedFlex.map((iv) => ({ s: iv.s, e: iv.e + gap } as MinuteIv)) : placedFlex;
        const mergedOcc = mergeMinuteIvs([...baseBlocked, ...gapBlock]);

        const overlapsAt = (S: number) => mergedOcc.some((b) => S < b.e && S + dur > b.s);
        let guard = 0;
        while (s + dur <= 24 * 60 && overlapsAt(s) && guard < 200) {
          s += 15;
          guard++;
        }

        if (s + dur > 24 * 60) {
          s = 24 * 60 - dur;
          s = Math.max(0, Math.floor(s / 15) * 15);
        }
        s = Math.max(s, morning);

        const ns = fromMin(s);
        const ne = fromMin(s + dur);
        if (ns !== e.start || ne !== e.end) {
          out[i] = { ...e, start: ns, end: ne };
          changed = true;
        }

        const pe = s + dur;
        placedFlex = mergeMinuteIvs([...placedFlex, { s, e: pe }]);
      }
    }

    if (!changed) break;
  }

  return out;
}

export function eventsTimeOverlap(a: ScheduledEvent, b: ScheduledEvent): boolean {
  if (a.day !== b.day) return false;
  let s1 = toMin(a.start);
  let e1 = toMin(a.end);
  let s2 = toMin(b.start);
  let e2 = toMin(b.end);
  if (!Number.isFinite(s1)) return false;
  if (!Number.isFinite(s2)) return false;
  if (!Number.isFinite(e1) || e1 <= s1) e1 = s1 + 60;
  if (!Number.isFinite(e2) || e2 <= s2) e2 = s2 + 60;
  return s1 < e2 && e1 > s2;
}

/** True if `dominant` should win a same-kind tie-break over `other` (earlier start wins). */
function eventWinsOverlapTie(dominant: ScheduledEvent, other: ScheduledEvent): boolean {
  const pd = priorityRank(dominant.priority, dominant.kind);
  const po = priorityRank(other.priority, other.kind);
  if (pd !== po) return pd > po;
  return toMin(dominant.start) < toMin(other.start);
}

export type DayEventOverlapVisual = "normal" | "conflict-muted" | "flex-over-fixed" | "flex-over-meal";

/**
 * How to paint an event when it shares time with others on the same day.
 * Hard “can’t have both” styling is only for **fixed vs fixed**. Meals are soft; flex overlapping a meal is
 * a lighter cue than overlapping a real fixed block.
 */
export function overlapVisualForEvent(ev: ScheduledEvent, dayEvents: ScheduledEvent[]): DayEventOverlapVisual {
  const others = dayEvents.filter((o) => o.id !== ev.id);
  const ov = others.filter((o) => eventsTimeOverlap(ev, o));
  if (!ov.length) return "normal";

  if (ev.kind === "fixed") {
    if (ov.some((o) => o.kind === "fixed" && eventWinsOverlapTie(o, ev))) return "conflict-muted";
  }
  if (ev.kind === "flexible" || ev.kind === "tentative") {
    if (ov.some((o) => o.kind === "fixed")) return "flex-over-fixed";
    if (ov.some((o) => o.kind === "meal")) return "flex-over-meal";
  }
  return "normal";
}

function eventIntervalMinutes(ev: ScheduledEvent): { s: number; e: number } {
  let s = toMin(ev.start);
  let e = toMin(ev.end);
  if (!Number.isFinite(s)) s = 0;
  if (!Number.isFinite(e) || e <= s) e = s + 60;
  return { s, e };
}

function intervalMinutesOverlap(s1: number, e1: number, s2: number, e2: number): boolean {
  return s1 < e2 && e1 > s2;
}

/** Max events covering any instant inside `ev`'s interval (same day). Drives column width only when truly concurrent. */
function maxConcurrentOverlapsDuringSpan(ev: ScheduledEvent, dayEvents: ScheduledEvent[]): number {
  const { s: s0, e: e0 } = eventIntervalMinutes(ev);
  const onDay = dayEvents.filter((x) => x.day === ev.day);
  const pts = new Set<number>([s0, e0]);
  for (const o of onDay) {
    const { s, e } = eventIntervalMinutes(o);
    if (intervalMinutesOverlap(s0, e0, s, e)) {
      pts.add(s);
      pts.add(e);
    }
  }
  const sorted = [...pts].filter((t) => t >= s0 && t < e0).sort((a, b) => a - b);
  let maxc = 1;
  for (const t of sorted) {
    const probe = t + 0.01;
    if (probe >= e0) continue;
    let c = 0;
    for (const o of onDay) {
      const { s, e } = eventIntervalMinutes(o);
      if (probe >= s && probe < e) c++;
    }
    maxc = Math.max(maxc, c);
  }
  for (let i = 0; i < sorted.length - 1; i++) {
    const probe = (sorted[i]! + sorted[i + 1]!) / 2;
    if (probe < s0 || probe >= e0) continue;
    let c = 0;
    for (const o of onDay) {
      const { s, e } = eventIntervalMinutes(o);
      if (probe >= s && probe < e) c++;
    }
    maxc = Math.max(maxc, c);
  }
  return Math.max(1, maxc);
}

type ActiveSeg = { s: number; e: number; col: number };

/** Greedy columns: only intervals that **actually** overlap the current event stay in `active` (avoids bogus side-by-side). */
function assignColumnsForDay(dayEvents: ScheduledEvent[]): Map<string, number> {
  const sorted = [...dayEvents].sort((a, b) => {
    const ds = toMin(a.start) - toMin(b.start);
    if (ds !== 0) return ds;
    return toMin(b.end) - toMin(a.end);
  });
  const colById = new Map<string, number>();
  let active: ActiveSeg[] = [];
  for (const ev of sorted) {
    const { s, e } = eventIntervalMinutes(ev);
    active = active.filter((x) => intervalMinutesOverlap(x.s, x.e, s, e));
    const used = new Set(active.map((x) => x.col));
    let c = 0;
    while (used.has(c)) c++;
    colById.set(ev.id, c);
    active.push({ s, e, col: c });
  }
  return colById;
}

/**
 * Side-by-side columns only when intervals truly overlap in time. Non-overlapping events stay full width.
 */
export function computeOverlapColumnLayoutForDay(dayEvents: ScheduledEvent[]): Map<
  string,
  { column: number; columnCount: number; visual: DayEventOverlapVisual }
> {
  const out = new Map<string, { column: number; columnCount: number; visual: DayEventOverlapVisual }>();
  if (!dayEvents.length) return out;
  const colById = assignColumnsForDay(dayEvents);
  for (const ev of dayEvents) {
    const column = colById.get(ev.id) ?? 0;
    const mc = maxConcurrentOverlapsDuringSpan(ev, dayEvents);
    /** Greedy lane index must fit in [0, columnCount); also fixes undercount if probes miss a busy instant. */
    const columnCount = Math.max(mc, column + 1);
    out.set(ev.id, { column, columnCount, visual: overlapVisualForEvent(ev, dayEvents) });
  }
  return out;
}

function emojiForTask(task: FlexibleTask, customTaskCategories: CustomTaskCategory[]): string {
  if (task.customCategoryId) {
    const c = customTaskCategories.find((x) => x.id === task.customCategoryId);
    if (c?.emoji) return c.emoji;
  }
  return CATEGORY_META[task.category].emoji;
}

/** First task per normalized title wins (duplicate titles share one icon). */
function taskByTitleLookup(tasks: FlexibleTask[]): Map<string, FlexibleTask> {
  const map = new Map<string, FlexibleTask>();
  for (const t of tasks) {
    const k = t.title.trim().toLowerCase();
    if (!map.has(k)) map.set(k, t);
  }
  return map;
}

/** Attach `emoji` to flexible/tentative events when the title matches a task (custom category icon or built-in). */
export function enrichEventsWithTaskEmojis(
  events: ScheduledEvent[],
  tasks: FlexibleTask[],
  customTaskCategories: CustomTaskCategory[],
): ScheduledEvent[] {
  if (!tasks.length) return events;
  const lookup = taskByTitleLookup(tasks);
  return events.map((ev) => {
    if (ev.kind === "fixed" || ev.kind === "meal") return ev;
    const title = typeof ev.title === "string" ? ev.title.trim() : "";
    if (!title) return ev;
    const task = lookup.get(title.toLowerCase());
    if (!task) return ev;
    return { ...ev, emoji: emojiForTask(task, customTaskCategories) };
  });
}

/**
 * Week grid visible range: user prefs (display) widened only when an event starts before
 * dayStart or ends after dayEnd so fixed blocks and flex tasks are never clipped.
 */
export function mergeDayBoundsForCalendar(
  dayStartPref: string,
  dayEndPref: string,
  events: ScheduledEvent[],
): { dayStart: string; dayEnd: string } {
  let prefMin = toMin(dayStartPref.trim() ? dayStartPref : DEFAULT_DAY_START);
  let prefMax = toMin(dayEndPref.trim() ? dayEndPref : DEFAULT_DAY_END);
  if (!Number.isFinite(prefMin)) prefMin = toMin(DEFAULT_DAY_START);
  if (!Number.isFinite(prefMax)) prefMax = toMin(DEFAULT_DAY_END);
  if (dayEndPref.trim() === "24:00") prefMax = 24 * 60;

  let minM = prefMin;
  let maxM = prefMax;
  let sawEvent = false;
  let evtMin = Infinity;
  let evtMax = -Infinity;

  for (const ev of events) {
    const s = toMin(ev.start);
    let e = toMin(ev.end);
    if (!Number.isFinite(s)) continue;
    if (!Number.isFinite(e) || e <= s) e = s + 60;
    sawEvent = true;
    evtMin = Math.min(evtMin, s);
    evtMax = Math.max(evtMax, e);
  }

  if (sawEvent && Number.isFinite(evtMin)) {
    minM = Math.min(prefMin, evtMin - CAL_VIEW_PAD_MIN);
  }
  if (sawEvent && evtMax >= 0) {
    maxM = Math.max(prefMax, evtMax + CAL_VIEW_PAD_MIN);
  }

  minM = Math.max(0, Math.floor(minM / 60) * 60);
  maxM = Math.min(24 * 60, Math.ceil(maxM / 60) * 60);
  if (maxM <= minM) maxM = Math.min(24 * 60, minM + 60);

  return {
    dayStart: fromMin(minM),
    dayEnd: maxM >= 24 * 60 ? "24:00" : fromMin(maxM),
  };
}

export function categoryClasses(c: Category) {
  return {
    bg: `bg-cat-${c}`,
    soft: `bg-cat-${c}-soft`,
    text: `text-cat-${c}`,
    border: `border-cat-${c}`,
  };
}

export function formatLabel(t: string) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "p" : "a";
  const hh = h % 12 || 12;
  return m === 0 ? `${hh}${ampm}` : `${hh}:${String(m).padStart(2, "0")}${ampm}`;
}

export const DEFAULT_DAY_START = "07:00";
export const DEFAULT_DAY_END = "24:00";

export function newEventId() {
  return uid();
}

export function dayLabel(d: DayKey, long = false): string {
  const map: Record<DayKey, string> = {
    Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday",
    Fri: "Friday", Sat: "Saturday", Sun: "Sunday",
  };
  return long ? map[d] : d;
}
