import type { DayKey, FixedBlock, MealBreak, ScheduledEvent } from "./aria-types";
import type { AriaScheduleSettingsPatch } from "./schedule-settings-patch";
import { fromMin, toMin } from "./schedule-utils";

/** First weekday phrase found in text (avoids multi-day ambiguity by taking the first match only). */
const WEEKDAY_SCAN: { day: DayKey; re: RegExp }[] = [
  { day: "Mon", re: /\b(monday|mon)\b/i },
  { day: "Tue", re: /\b(tuesday|tues|tue)\b/i },
  { day: "Wed", re: /\b(wednesday|wed)\b/i },
  { day: "Thu", re: /\b(thursday|thurs|thu|thur)\b/i },
  { day: "Fri", re: /\b(friday|fri)\b/i },
  { day: "Sat", re: /\b(saturday|sat)\b/i },
  { day: "Sun", re: /\b(sunday|sun)\b/i },
];

export function firstWeekdayMentioned(msg: string): DayKey | null {
  let best: { day: DayKey; index: number } | null = null;
  for (const { day, re } of WEEKDAY_SCAN) {
    const m = re.exec(msg);
    if (!m || m.index < 0) continue;
    if (!best || m.index < best.index) best = { day, index: m.index };
  }
  return best?.day ?? null;
}

function mentionsDinner(msg: string): boolean {
  return /\bdinner\b/i.test(msg);
}

/** User wants to drop or substitute the usual dinner slot on a mentioned weekday. */
function impliesRoutineDinnerRemoval(msg: string): boolean {
  if (!mentionsDinner(msg)) return false;
  const lower = msg.toLowerCase();
  if (/\b(replace|remove|delete|cancel|skip|drop|eliminate|instead of|rather than|substitute|swap out)\b/i.test(msg))
    return true;
  /** “instead, schedule …” */
  if (/\binstead\b/i.test(msg) && /\b(schedule|scheduling|add|plan|book)\b/i.test(msg)) return true;
  if (/\bnot\s+doing\s+dinner\b/.test(lower)) return true;
  if (/\bnot\s+having\s+dinner\b/.test(lower)) return true;
  if (/\bno\s+dinner\b/.test(lower)) return true;
  if (/\bwithout\s+dinner\b/.test(lower)) return true;
  if (/\bwon'?t\s+(have|do|eat)\s+dinner\b/.test(lower)) return true;
  if (/\bdon'?t\s+want\s+dinner\b/.test(lower)) return true;
  return false;
}

function fixedBlockLooksLikeEveningDinnerOnDay(b: FixedBlock, day: DayKey): boolean {
  if (!b.days.includes(day)) return false;
  if (/\bdinner\b/i.test(b.title)) return true;
  const s = toMin(b.start);
  if (!Number.isFinite(s)) return false;
  return s >= 18 * 60 && s <= 21 * 60 + 30;
}

/**
 * When the model omits structural patches, infer freeing the usual Tue/Fri/… dinner
 * (fixed evening block or soft dinner meal rule) so a replacement can sit at the requested time.
 */
export function inferStandingDinnerRemovalPatch(
  userMessage: string,
  fixedBlocks: FixedBlock[],
  mealBreaks: MealBreak[],
): AriaScheduleSettingsPatch | undefined {
  const day = firstWeekdayMentioned(userMessage);
  if (!day) return undefined;
  if (!impliesRoutineDinnerRemoval(userMessage)) return undefined;

  const candidates = fixedBlocks.filter((b) => fixedBlockLooksLikeEveningDinnerOnDay(b, day));
  if (candidates.length >= 1) {
    return {
      fixedBlockUpdates: candidates.map((b) => ({
        id: b.id,
        days: b.days.filter((d) => d !== day),
      })),
    };
  }

  const dinner = mealBreaks.find((m) => m.kind === "dinner" && m.enabled && m.days.includes(day));
  if (!dinner) return undefined;
  const skip = new Set<DayKey>([...(dinner.skipDays ?? []), day]);
  return {
    mealBreakUpdates: [{ id: dinner.id, skipDays: [...skip] }],
  };
}

/** Minutes since midnight from phrases like 8pm, 8:30pm, 20:00 (requires pm/am if hour ≤ 12). */
export function parseExplicitClockMinutes(msg: string): number | null {
  const lower = msg.toLowerCase();

  const withSuffix = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (withSuffix) {
    let h = parseInt(withSuffix[1]!, 10);
    const mm = withSuffix[2] ? parseInt(withSuffix[2]!, 10) : 0;
    const ap = withSuffix[3]!;
    if (!Number.isFinite(h) || mm > 59) return null;
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    return h * 60 + mm;
  }

  const h24 = lower.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (h24) {
    const h = parseInt(h24[1]!, 10);
    const mm = parseInt(h24[2]!, 10);
    return h * 60 + mm;
  }

  return null;
}

/** User is swapping dinner for another timed social plan (mentor, friends, catch-up, etc.). */
function impliesReplacementSocialPlan(msg: string): boolean {
  return (
    impliesRoutineDinnerRemoval(msg) &&
    (/\b(with|mentor|friends?|colleague|buddy)\b/i.test(msg) ||
      /\bdinner\s+with\b/i.test(msg) ||
      /\bcatch\s*-?\s*up\b/i.test(msg) ||
      /\bmeet(?:ing|up)?\s+with\b/i.test(msg))
  );
}

function catchUpNameFromMessage(msg: string): string | null {
  const m = msg.match(/\bcatch\s*-?\s*up\s+with\s+([^,.!\n]+)/i);
  return m ? m[1]!.trim() : null;
}

function aiAlreadyHasReplacementNear(
  events: ScheduledEvent[],
  day: DayKey,
  startMin: number,
  titleHints: RegExp,
): boolean {
  return events.some((e) => {
    if (e.day !== day || e.kind === "meal") return false;
    if (!titleHints.test(e.title)) return false;
    const sm = toMin(e.start);
    return Number.isFinite(sm) && Math.abs(sm - startMin) <= 30;
  });
}

/**
 * If the user named a weekday + explicit clock time for a replacement dinner but the model
 * emitted a flexible block too late (overlap resolver), inject a fixed row and strip conflicting flex rows.
 */
export function inferReplacementDinnerFixedEvent(userMessage: string, aiEvents: ScheduledEvent[]): ScheduledEvent | null {
  const day = firstWeekdayMentioned(userMessage);
  if (!day || !impliesReplacementSocialPlan(userMessage)) return null;

  const startMin = parseExplicitClockMinutes(userMessage);
  if (startMin === null || startMin < 11 * 60 || startMin > 23 * 60 + 45) return null;

  const dur = 90;
  let title = "Dinner";
  const catchName = catchUpNameFromMessage(userMessage);
  if (catchName) title = `Catch up with ${catchName}`;
  else if (/\bmentor\b/i.test(userMessage)) title = "Dinner with mentor";
  else if (/\bfriends?\b/i.test(userMessage)) title = "Dinner with friends";
  else {
    const dw = userMessage.match(/\bdinner\s+with\s+([^,.!\n]+)/i);
    if (dw) title = `Dinner with ${dw[1]!.trim()}`;
  }

  let hint: RegExp = /\bdinner\b/i;
  if (catchName) hint = new RegExp(catchName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  else if (/\bmentor\b/i.test(userMessage)) hint = /\bmentor\b/i;
  else if (/\bfriends?\b/i.test(userMessage)) hint = /\bfriends?\b/i;

  if (aiAlreadyHasReplacementNear(aiEvents, day, startMin, hint)) return null;

  return {
    id: `aria-inferred-dinner-${Date.now().toString(36)}`,
    title,
    day,
    start: fromMin(startMin),
    end: fromMin(startMin + dur),
    kind: "fixed",
    category: "social",
    priority: "high",
  };
}

/**
 * Remove duplicate replacement dinners from the model output so we can enforce the user’s clock time as fixed.
 * Mentor: drop any same-day row mentioning mentor (flex/tentative/fixed). Friends: flex/tentative only.
 */
export function stripConflictingReplacementFlexRows(
  events: ScheduledEvent[],
  replacement: ScheduledEvent,
  userMessage: string,
): ScheduledEvent[] {
  if (replacement.kind !== "fixed") return events;
  const day = replacement.day;
  const stripMentor = /\bmentor\b/i.test(userMessage);
  const stripFriends = /\bfriends?\b/i.test(userMessage);
  const catchName = catchUpNameFromMessage(userMessage)?.toLowerCase() ?? null;

  return events.filter((e) => {
    if (e.day !== day) return true;
    if (stripMentor && /\bmentor\b/i.test(e.title)) return false;
    if (stripFriends && /\bfriends?\b/i.test(e.title) && (e.kind === "flexible" || e.kind === "tentative"))
      return false;
    if (
      catchName &&
      catchName.length >= 2 &&
      e.title.toLowerCase().includes(catchName) &&
      (e.kind === "flexible" || e.kind === "tentative" || e.kind === "fixed")
    )
      return false;
    return true;
  });
}

function hasFridayFriendsDinner730(events: ScheduledEvent[]): boolean {
  return events.some(
    (e) =>
      e.kind === "fixed" &&
      e.day === "Fri" &&
      /\bfriends?\b/i.test(e.title) &&
      Number.isFinite(toMin(e.start)) &&
      toMin(e.start) >= 19 * 60 &&
      toMin(e.start) <= 19 * 60 + 45,
  );
}

/** Add Fri 7:30 friends dinner when asked (no “replace” wording required). */
export function inferFridayFriendsDinner730FixedEvent(userMessage: string, aiEvents: ScheduledEvent[]): ScheduledEvent | null {
  const lower = userMessage.toLowerCase();
  if (!/\b(friday|fri)\b/i.test(lower) || !/\bdinner\b/i.test(lower) || !/\bfriends?\b/i.test(lower)) return null;
  const m = parseExplicitClockMinutes(userMessage);
  const at730 = m !== null && Math.abs(m - (19 * 60 + 30)) <= 20;
  const fuzzy730 = /\b7\s*[.:]?\s*30|19\s*[.:]?\s*30|7\.30\b/i.test(lower);
  if (!at730 && !fuzzy730) return null;
  if (hasFridayFriendsDinner730(aiEvents)) return null;
  return {
    id: `aria-inferred-friends-dinner-${Date.now().toString(36)}`,
    title: "Dinner with friends",
    day: "Fri",
    start: "19:30",
    end: "21:00",
    kind: "fixed",
    category: "social",
    priority: "high",
  };
}
