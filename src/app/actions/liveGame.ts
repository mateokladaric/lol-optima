"use server";

import {
  type LiveGameImport,
  importLiveGameFromRiotId,
  LiveGameError,
} from "@/lib/opggLiveGame";

const COOLDOWN_MS = 10_000;
const lastFetchByKey = new Map<string, number>();

export type LiveGameImportResult =
  | { ok: true; data: LiveGameImport }
  | { ok: false; code: string; message: string };

export async function importLiveGameFromOpgg(
  riotId: string,
  region: string,
): Promise<LiveGameImportResult> {
  const key = `${region.toLowerCase()}:${riotId.trim().toLowerCase()}`;
  const now = Date.now();
  const last = lastFetchByKey.get(key);
  if (last != null && now - last < COOLDOWN_MS) {
    return {
      ok: false,
      code: "RATE_LIMITED",
      message: "Please wait a few seconds before refreshing live game data.",
    };
  }
  lastFetchByKey.set(key, now);

  try {
    const data = await importLiveGameFromRiotId(riotId, region);
    return { ok: true, data };
  } catch (e) {
    if (e instanceof LiveGameError) {
      console.error("[liveGame]", e.code, e.message);
      return { ok: false, code: e.code, message: e.message };
    }
    console.error("[liveGame]", e);
    return {
      ok: false,
      code: "OPGG_ERROR",
      message: "Failed to load live game data from OP.GG.",
    };
  }
}
