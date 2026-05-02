import {
  AriaState,
  EMPTY_STATE,
  FlexibleTask,
  ProfilesRootState,
  UserProfile,
  normalizeFlexibleTask,
  normalizePreferences,
} from "./aria-types";

const KEY = "aria-state-v1";

export const uid = () =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

function normalizeLoadedAria(parsed: Partial<AriaState> & Record<string, unknown>): AriaState {
  return {
    ...EMPTY_STATE,
    ...parsed,
    preferences: normalizePreferences({ ...EMPTY_STATE.preferences, ...(parsed.preferences ?? {}) }),
    customTaskCategories: Array.isArray(parsed.customTaskCategories)
      ? parsed.customTaskCategories
      : EMPTY_STATE.customTaskCategories,
    tasks: Array.isArray(parsed.tasks)
      ? (parsed.tasks as FlexibleTask[]).map((t) => normalizeFlexibleTask(t))
      : EMPTY_STATE.tasks,
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
  let profiles = (raw.profiles ?? []).map((p) => normalizeUserProfile(p as Record<string, unknown>));
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
  localStorage.setItem(
    KEY,
    JSON.stringify({ schema: 2, activeProfileId: normalized.activeProfileId, profiles: normalized.profiles }),
  );
}

export function clearState() {
  localStorage.removeItem(KEY);
}
