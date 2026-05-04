import { CATEGORY_META, Category, DAYS, DayKey, FixedBlock, MealBreak, normalizeMealBreak } from "./aria-types";

const MAX_PATCH_ITEMS = 24;

export interface AriaScheduleSettingsPatch {
  mealBreakUpdates?: Array<Partial<MealBreak> & { id: string }>;
  fixedBlockUpdates?: Array<Partial<FixedBlock> & { id: string }>;
}

export function hasStructuralSchedulePatch(p: AriaScheduleSettingsPatch | undefined): boolean {
  return (p?.mealBreakUpdates?.length ?? 0) > 0 || (p?.fixedBlockUpdates?.length ?? 0) > 0;
}

function isCategory(c: unknown): c is Category {
  return typeof c === "string" && c in CATEGORY_META;
}

/**
 * Merge AI-returned structural edits into persisted schedule settings.
 * Only updates rows whose `id` already exists — never adds new blocks or meals from the model.
 */
export function applyAriaScheduleSettingsPatch(
  fixedBlocks: FixedBlock[],
  mealBreaks: MealBreak[],
  patch: AriaScheduleSettingsPatch | undefined | null,
): { fixedBlocks: FixedBlock[]; mealBreaks: MealBreak[] } {
  if (!patch) return { fixedBlocks, mealBreaks };

  let nextMeals = mealBreaks;
  if (patch.mealBreakUpdates?.length) {
    const updates = patch.mealBreakUpdates.slice(0, MAX_PATCH_ITEMS);
    const byId = new Map(mealBreaks.map((m) => [m.id, { ...m } as MealBreak]));
    for (const u of updates) {
      if (!u?.id || typeof u.id !== "string") continue;
      const prev = byId.get(u.id);
      if (!prev) continue;
      const mergedRaw = { ...prev } as MealBreak;
      if (Array.isArray(u.days)) {
        mergedRaw.days = u.days.filter((d): d is DayKey => DAYS.includes(d as DayKey));
      }
      if (typeof u.enabled === "boolean") mergedRaw.enabled = u.enabled;
      if (typeof u.windowStart === "string") mergedRaw.windowStart = u.windowStart;
      if (typeof u.windowEnd === "string") mergedRaw.windowEnd = u.windowEnd;
      if (typeof u.durationMin === "number") mergedRaw.durationMin = u.durationMin;
      if ("skipDays" in u && Array.isArray(u.skipDays)) {
        mergedRaw.skipDays = u.skipDays.filter((d): d is DayKey => DAYS.includes(d as DayKey));
      }
      if (u.kind === "breakfast" || u.kind === "lunch" || u.kind === "dinner") mergedRaw.kind = u.kind;
      byId.set(u.id, normalizeMealBreak(mergedRaw));
    }
    nextMeals = mealBreaks.map((m) => byId.get(m.id) ?? m);
  }

  let nextFixed = fixedBlocks;
  if (patch.fixedBlockUpdates?.length) {
    const updates = patch.fixedBlockUpdates.slice(0, MAX_PATCH_ITEMS);
    const byId = new Map(fixedBlocks.map((b) => [b.id, { ...b } as FixedBlock]));
    for (const u of updates) {
      if (!u?.id || typeof u.id !== "string") continue;
      const prev = byId.get(u.id);
      if (!prev) continue;
      let days = prev.days;
      if (Array.isArray(u.days)) {
        days = u.days.filter((d): d is DayKey => DAYS.includes(d as DayKey));
      }
      let category = prev.category;
      if (isCategory(u.category)) category = u.category;
      const merged: FixedBlock = {
        ...prev,
        days,
        category,
        ...(typeof u.title === "string" && u.title.trim() ? { title: u.title.trim() } : {}),
        ...(typeof u.start === "string" && u.start.trim() ? { start: u.start.trim() } : {}),
        ...(typeof u.end === "string" && u.end.trim() ? { end: u.end.trim() } : {}),
      };
      if (merged.days.length === 0) byId.delete(u.id);
      else byId.set(u.id, merged);
    }
    nextFixed = fixedBlocks.flatMap((b) => {
      const x = byId.get(b.id);
      return x ? [x] : [];
    });
  }

  return { fixedBlocks: nextFixed, mealBreaks: nextMeals };
}
