import {
  AriaState,
  ChatMessage,
  EMPTY_STATE,
  FixedBlock,
  FlexibleTask,
  MealBreak,
  ProfilesRootState,
  ScheduledEvent,
  UserProfile,
  dedupeRepairFlexibleEventIds,
  normalizeFlexibleTask,
  normalizeMealBreak,
  normalizePreferences,
} from "./aria-types";

const KEY = "aria-state-v1";

export const uid = () =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** Persisted chat cannot replay overlap prompts — strip interactive payloads when loading/saving. */
export function sanitizeChatForPersist(messages: ChatMessage[]): ChatMessage[] {
  return messages.map(({ role, content, timestamp }) => ({
    role: role === "assistant" ? "assistant" : "user",
    content: typeof content === "string" ? content : "",
    timestamp: typeof timestamp === "number" ? timestamp : Date.now(),
  }));
}

/** Normalize persisted or URL-imported Aria JSON into a full `AriaState`. */
export function normalizeLoadedAria(parsed: Partial<AriaState> & Record<string, unknown>): AriaState {
  const rawEvents = (parsed as { events?: unknown }).events;
  const events = Array.isArray(rawEvents)
    ? dedupeRepairFlexibleEventIds(rawEvents as ScheduledEvent[])
    : EMPTY_STATE.events;

  const rawFixed = (parsed as { fixedBlocks?: unknown }).fixedBlocks;
  const fixedBlocks: FixedBlock[] = Array.isArray(rawFixed) ? (rawFixed as FixedBlock[]) : EMPTY_STATE.fixedBlocks;

  const rawChat = (parsed as { chat?: unknown }).chat;
  const chat: ChatMessage[] = Array.isArray(rawChat)
    ? sanitizeChatForPersist(rawChat as ChatMessage[])
    : EMPTY_STATE.chat;

  const onboarded = typeof parsed.onboarded === "boolean" ? parsed.onboarded : EMPTY_STATE.onboarded;

  return {
    ...EMPTY_STATE,
    ...parsed,
    onboarded,
    fixedBlocks,
    preferences: normalizePreferences({ ...EMPTY_STATE.preferences, ...(parsed.preferences ?? {}) }),
    customTaskCategories: Array.isArray(parsed.customTaskCategories)
      ? parsed.customTaskCategories
      : EMPTY_STATE.customTaskCategories,
    tasks: Array.isArray(parsed.tasks)
      ? (parsed.tasks as FlexibleTask[]).map((t) => normalizeFlexibleTask(t))
      : EMPTY_STATE.tasks,
    mealBreaks: Array.isArray((parsed as { mealBreaks?: unknown }).mealBreaks)
      ? ((parsed as { mealBreaks: Partial<MealBreak>[] }).mealBreaks).map((x) => normalizeMealBreak(x))
      : EMPTY_STATE.mealBreaks,
    events,
    chat,
  };
}

function normalizeUserProfile(raw: Record<string, unknown>): UserProfile {
  const id = typeof raw.id === "string" && raw.id ? raw.id : uid();
  const name =
    typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : "Me";
  const ariaRaw = raw.aria;
  const aria =
    ariaRaw && typeof ariaRaw === "object"
      ? normalizeLoadedAria(ariaRaw as Partial<AriaState> & Record<string, unknown>)
      : { ...EMPTY_STATE };
  return { id, name, aria };
}

function isProfilesBundle(p: unknown): p is { activeProfileId: string; profiles: unknown[] } {
  if (!p || typeof p !== "object") return false;
  const o = p as Record<string, unknown>;
  return (
    Array.isArray(o.profiles) &&
    o.profiles.length > 0 &&
    typeof o.activeProfileId === "string"
  );
}

/** One profile named “Me”, not onboarded — first visit or after reset. */
export function createDefaultProfilesRoot(): ProfilesRootState {
  const id = uid();
  return {
    activeProfileId: id,
    profiles: [{ id, name: "Me", aria: { ...EMPTY_STATE } }],
  };
}

function normalizeProfilesRoot(raw: ProfilesRootState): ProfilesRootState {
  let profiles = (raw.profiles ?? [])
    .filter((p): p is Record<string, unknown> => p !== null && typeof p === "object" && !Array.isArray(p))
    .map((p) => normalizeUserProfile(p));
  if (!profiles.length) profiles = createDefaultProfilesRoot().profiles;
  let activeProfileId =
    typeof raw.activeProfileId === "string" && raw.activeProfileId
      ? raw.activeProfileId
      : profiles[0]!.id;
  if (!profiles.some((p) => p.id === activeProfileId)) activeProfileId = profiles[0]!.id;
  return { activeProfileId, profiles };
}

/** Load persisted profiles (v2) or migrate legacy flat AriaState (v1). */
export function loadProfilesRoot(): ProfilesRootState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return createDefaultProfilesRoot();
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    if (parsed.schema === 2 && isProfilesBundle(parsed)) {
      return normalizeProfilesRoot({
        activeProfileId: parsed.activeProfileId as string,
        profiles: parsed.profiles as UserProfile[],
      });
    }

    if (isProfilesBundle(parsed)) {
      return normalizeProfilesRoot({
        activeProfileId: parsed.activeProfileId as string,
        profiles: parsed.profiles as UserProfile[],
      });
    }

    const id = uid();
    return {
      activeProfileId: id,
      profiles: [{ id, name: "Me", aria: normalizeLoadedAria(parsed as Partial<AriaState> & Record<string, unknown>) }],
    };
  } catch {
    return createDefaultProfilesRoot();
  }
}

export function saveProfilesRoot(root: ProfilesRootState) {
  const normalized = normalizeProfilesRoot(root);
  const profiles = normalized.profiles.map((p) => ({
    ...p,
    aria: { ...p.aria, chat: sanitizeChatForPersist(p.aria.chat) },
  }));
  localStorage.setItem(
    KEY,
    JSON.stringify({ schema: 2, activeProfileId: normalized.activeProfileId, profiles }),
  );
}

export function clearState() {
  localStorage.removeItem(KEY);
}
