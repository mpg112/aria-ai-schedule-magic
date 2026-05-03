import type { AriaState } from "./aria-types";
import { normalizeLoadedAria } from "./aria-storage";

const SHARE_VERSION = 1 as const;
/** ~512 KB raw JSON — URLs get unwieldy earlier; copy will warn. */
const MAX_JSON_CHARS = 450_000;

export type ShareSnapshotPayload = {
  v: typeof SHARE_VERSION;
  profileName: string;
  aria: AriaState;
};

function base64UrlEncodeUtf8(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecodeToUtf8(token: string): string {
  let b64 = token.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeShareSnapshot(profileName: string, aria: AriaState): string {
  const payload: ShareSnapshotPayload = {
    v: SHARE_VERSION,
    profileName: profileName.trim() || "Shared calendar",
    aria,
  };
  const json = JSON.stringify(payload);
  if (json.length > MAX_JSON_CHARS) {
    throw new Error(
      "This calendar is too large to pack into a single link. Try removing some chat history or events, then copy again.",
    );
  }
  return base64UrlEncodeUtf8(json);
}

export function decodeShareSnapshot(token: string): { profileName: string; aria: AriaState } | null {
  const trimmed = token.trim();
  if (!trimmed) return null;
  let json: string;
  try {
    json = base64UrlDecodeToUtf8(trimmed);
  } catch {
    return null;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(json) as unknown;
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== SHARE_VERSION) return null;
  const profileName = typeof o.profileName === "string" ? o.profileName : "Shared calendar";
  const ariaRaw = o.aria;
  if (!ariaRaw || typeof ariaRaw !== "object") return null;
  try {
    const aria = normalizeLoadedAria(ariaRaw as Partial<AriaState> & Record<string, unknown>);
    return { profileName: profileName.trim() || "Shared calendar", aria };
  } catch {
    return null;
  }
}

/** Dedupe React Strict Mode double-effect and accidental duplicate applies. */
export function consumeShareTokenOnce(token: string): boolean {
  try {
    const key = `aria-share-applied:${token.length}:${token.slice(0, 64)}`;
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, "1");
    return true;
  } catch {
    return true;
  }
}
