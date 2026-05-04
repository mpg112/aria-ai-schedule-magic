import type { DayKey, ScheduledEvent } from "./aria-types";
import { firstWeekdayMentioned, parseExplicitClockMinutes } from "./chat-schedule-inference";
import { eventsTimeOverlap, fromMin, toMin } from "./schedule-utils";

function buildTitleHints(msg: string): string[] {
  const titleHints: string[] = [];
  const quoted = msg.match(/["']([^"']{2,})["']/);
  if (quoted) titleHints.push(...quoted[1]!.toLowerCase().split(/\s+/).filter((w) => w.length >= 3));
  if (/\bdoctor|dentist|appointment|checkup|physician\b/i.test(msg)) {
    titleHints.push("doctor", "appointment", "dentist", "checkup");
  }
  return [...new Set(titleHints)];
}

/** User asked to add/schedule something at an explicit clock time on a weekday. */
export function extractExplicitAddIntent(msg: string): {
  day: DayKey;
  startMin: number;
  durationMin: number;
  titleHints: string[];
} | null {
  const trimmed = msg.trim();
  if (!/\b(add|schedule|book|put|create)\b/i.test(trimmed)) return null;
  const day = firstWeekdayMentioned(msg);
  const startMin = parseExplicitClockMinutes(msg);
  if (!day || startMin === null) return null;

  let durationMin = 60;
  const hourDur = msg.match(/\b(\d+)\s*(?:hour|hr)s?\b/i);
  if (hourDur) durationMin = parseInt(hourDur[1]!, 10) * 60;
  const minDur = msg.match(/\b(\d+)\s*(?:minute|min)s?\b/i);
  if (minDur && !hourDur) durationMin = Math.max(15, parseInt(minDur[1]!, 10));

  return { day, startMin, durationMin, titleHints: buildTitleHints(msg) };
}

/** “Move my Wednesday appointment from 6pm to 3pm” — target clock is after the last “to …”. */
export function extractExplicitMoveIntent(msg: string): {
  day: DayKey;
  startMin: number;
  durationMin: number;
  titleHints: string[];
} | null {
  if (!/\bmove\b/i.test(msg.trim())) return null;
  const day = firstWeekdayMentioned(msg);
  if (!day) return null;
  const lower = msg.toLowerCase();
  const lastTo = lower.lastIndexOf(" to ");
  const slice = lastTo >= 0 ? msg.slice(lastTo + 4).trim() : msg;
  const startMin = parseExplicitClockMinutes(slice);
  if (startMin === null) return null;
  return { day, startMin, durationMin: 60, titleHints: buildTitleHints(msg) };
}

function extractUnifiedPlacementIntent(msg: string): {
  day: DayKey;
  startMin: number;
  durationMin: number;
  titleHints: string[];
} | null {
  return extractExplicitMoveIntent(msg) ?? extractExplicitAddIntent(msg);
}

function candidateMatchesHints(ev: ScheduledEvent, hints: string[]): boolean {
  if (!hints.length) return false;
  const t = ev.title.toLowerCase();
  return hints.some((h) => t.includes(h));
}

/**
 * Detect when overlap resolution slid a flexible row away from the user’s explicit requested time
 * that intersects fixed commitments — offer UI to pin at requested time with overlapDespiteFixed.
 */
export function findOverlapOfferContext(args: {
  userMessage: string;
  flexBeforeResolve: ScheduledEvent[];
  flexAfterResolve: ScheduledEvent[];
  fixedEvents: ScheduledEvent[];
}): null | {
  candidateId: string;
  intentDay: DayKey;
  intentStartMin: number;
  intentDurationMin: number;
  conflictingFixed: ScheduledEvent[];
  conflictSummaries: string[];
} {
  const intent = extractUnifiedPlacementIntent(args.userMessage);
  if (!intent) return null;

  const { day, startMin, durationMin: defaultDur, titleHints } = intent;
  let durationMin = defaultDur;

  const phantomBase = (dur: number): ScheduledEvent => ({
    id: "__intent__",
    title: "",
    day,
    start: fromMin(startMin),
    end: fromMin(startMin + dur),
    kind: "fixed",
    category: "other",
  });

  const conflictsAtDur = (dur: number) =>
    args.fixedEvents.filter((e) => e.kind === "fixed" && e.day === day && eventsTimeOverlap(e, phantomBase(dur)));

  let candidateId: string | null = null;

  for (const after of args.flexAfterResolve) {
    if (after.day !== day || (after.kind !== "flexible" && after.kind !== "tentative")) continue;
    const before = args.flexBeforeResolve.find((b) => b.id === after.id && b.day === after.day);
    if (!before) continue;
    const bs = toMin(before.start);
    const as = toMin(after.start);
    if (!Number.isFinite(bs) || !Number.isFinite(as)) continue;
    // Model placed near requested time; resolver slid it away.
    if (Math.abs(bs - startMin) <= 30 && Math.abs(as - startMin) >= 45) {
      candidateId = after.id;
      break;
    }
  }

  if (!candidateId && titleHints.length) {
    for (const after of args.flexAfterResolve) {
      if (after.day !== day || (after.kind !== "flexible" && after.kind !== "tentative")) continue;
      const before = args.flexBeforeResolve.find((b) => b.id === after.id && b.day === after.day);
      if (!before) continue;
      const bs = toMin(before.start);
      const as = toMin(after.start);
      if (!Number.isFinite(bs) || !Number.isFinite(as)) continue;
      if (
        candidateMatchesHints(after, titleHints) &&
        Math.abs(bs - startMin) <= 45 &&
        Math.abs(as - startMin) >= 45
      ) {
        candidateId = after.id;
        break;
      }
    }
  }

  /** Move / follow-up: model left the row at the wrong hour (e.g. still 6pm) but user asked for 3pm. */
  if (!candidateId && titleHints.length) {
    for (const after of args.flexAfterResolve) {
      if (after.day !== day || (after.kind !== "flexible" && after.kind !== "tentative")) continue;
      const as = toMin(after.start);
      if (!Number.isFinite(as)) continue;
      if (candidateMatchesHints(after, titleHints) && Math.abs(as - startMin) >= 30) {
        candidateId = after.id;
        const d = Math.max(15, toMin(after.end) - toMin(after.start));
        durationMin = Number.isFinite(d) ? d : durationMin;
        break;
      }
    }
  }

  if (!candidateId) return null;

  const conflictingFixed = conflictsAtDur(durationMin);
  if (!conflictingFixed.length) return null;

  const conflictSummaries = conflictingFixed.map((f) => `${f.title} (${f.start}–${f.end})`);

  return {
    candidateId,
    intentDay: day,
    intentStartMin: startMin,
    intentDurationMin: durationMin,
    conflictingFixed,
    conflictSummaries,
  };
}
