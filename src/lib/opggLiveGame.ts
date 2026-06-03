/**
 * OP.GG unofficial summoner / live-game client (server-only).
 *
 * Confirmed endpoints (2026-06):
 * - GET https://lol-api-summoner.op.gg/api/v3/{region}/summoners?riot_id={gameName%23tag}&hl=en_US
 * - GET https://lol-api-summoner.op.gg/api/{region}/games/spectate?created_at={iso}&summoner_id={id}&hl=en_US
 * - RSC fallback: GET https://op.gg/lol/summoners/{region}/{gameName-tagLine}/ingame (Accept: text/x-component)
 *
 * `created_at` on spectate is an ISO timestamp for the active game (not a match history game_id).
 * When the summoner is not in game, spectate returns 422 (decrypt) or ingame RSC shows not_ingame copy.
 */

import { Characters } from "@/app/actions/sim";

const SUMMONER_API = "https://lol-api-summoner.op.gg/api";
const OPGG_WEB = "https://op.gg";

const OPGG_FETCH_HEADERS: Record<string, string> = {
  Accept: "application/json",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Origin: OPGG_WEB,
  Referer: `${OPGG_WEB}/`,
};

const RSC_HEADERS: Record<string, string> = {
  Accept: "text/x-component",
  RSC: "1",
  "User-Agent": OPGG_FETCH_HEADERS["User-Agent"] ?? "Mozilla/5.0",
};

/** UI region code → OP.GG API path segment (lowercase). */
export const OPGG_REGION_OPTIONS = [
  { value: "NA", label: "NA" },
  { value: "EUW", label: "EUW" },
  { value: "EUNE", label: "EUNE" },
  { value: "KR", label: "KR" },
  { value: "BR", label: "BR" },
  { value: "LAN", label: "LAN" },
  { value: "LAS", label: "LAS" },
  { value: "OCE", label: "OCE" },
  { value: "JP", label: "JP" },
  { value: "ME", label: "ME" },
  { value: "TR", label: "TR" },
  { value: "RU", label: "RU" },
  { value: "SEA", label: "SEA" },
] as const;

export type OpggRegionCode = (typeof OPGG_REGION_OPTIONS)[number]["value"];

export type LiveGameImport = {
  myChampion: string;
  enemyTeam: string[];
  queueLabel?: string;
};

export type LiveGameErrorCode =
  | "INVALID_RIOT_ID"
  | "NOT_FOUND"
  | "NOT_IN_GAME"
  | "CHAMPION_UNMAPPED"
  | "UNSUPPORTED_QUEUE"
  | "OPGG_ERROR";

export class LiveGameError extends Error {
  constructor(
    public readonly code: LiveGameErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "LiveGameError";
  }
}

type OpggSummonerRecord = {
  summoner_id: string;
  puuid: string;
  game_name: string;
  tagline: string;
  revision_at?: string;
  updated_at?: string;
  renewable_at?: string;
  solo_tier_info?: unknown;
};

type OpggParticipant = {
  champion_id?: number;
  team_key?: string;
  summoner?: {
    puuid?: string;
    game_name?: string;
    tagline?: string;
  };
};

type OpggLivePayload = {
  participants?: OpggParticipant[];
  queue_info?: { description?: string; name?: string };
  game_type?: string;
};

let championKeyCache: Map<number, string> | null = null;

function normalizeTag(s: string): string {
  return s.replace(/\s+/g, "").toLowerCase();
}

export function parseRiotId(input: string): { gameName: string; tagLine: string } {
  const trimmed = input.trim();
  const hash = trimmed.lastIndexOf("#");
  if (hash <= 0 || hash === trimmed.length - 1) {
    throw new LiveGameError(
      "INVALID_RIOT_ID",
      "Enter your Riot ID as Name#Tag (for example Faker#KR1).",
    );
  }
  const gameName = trimmed.slice(0, hash).trim();
  const tagLine = trimmed.slice(hash + 1).trim();
  if (!gameName || !tagLine) {
    throw new LiveGameError(
      "INVALID_RIOT_ID",
      "Enter your Riot ID as Name#Tag (for example Faker#KR1).",
    );
  }
  return { gameName, tagLine };
}

export function normalizeOpggRegion(region: string): string {
  return region.trim().toLowerCase();
}

export function summonerSlug(gameName: string, tagLine: string): string {
  const combined = `${gameName}-${tagLine}`;
  return combined.replace(/\s+/g, "-");
}

async function fetchJson<T>(url: string, headers: Record<string, string>): Promise<T> {
  const res = await fetch(url, { headers, cache: "no-store" });
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    throw new LiveGameError(
      "OPGG_ERROR",
      `OP.GG returned an unexpected response (${res.status}).`,
    );
  }
  if (!res.ok) {
    const msg =
      typeof body === "object" &&
      body !== null &&
      "message" in body &&
      typeof (body as { message: unknown }).message === "string"
        ? (body as { message: string }).message
        : `OP.GG request failed (${res.status}).`;
    if (res.status === 404) {
      throw new LiveGameError("NOT_FOUND", msg);
    }
    throw new LiveGameError("OPGG_ERROR", msg);
  }
  return body as T;
}

async function searchSummoner(
  region: string,
  gameName: string,
  tagLine: string,
): Promise<OpggSummonerRecord> {
  const riotId = encodeURIComponent(`${gameName}#${tagLine}`);
  const url = `${SUMMONER_API}/v3/${region}/summoners?riot_id=${riotId}&hl=en_US`;
  const body = await fetchJson<{ data?: OpggSummonerRecord[] }>(
    url,
    OPGG_FETCH_HEADERS,
  );
  const list = body.data ?? [];
  if (list.length === 0) {
    throw new LiveGameError(
      "NOT_FOUND",
      `No summoner found for ${gameName}#${tagLine} in ${region.toUpperCase()}. Check the region and Riot ID.`,
    );
  }

  const wantName = gameName.toLowerCase();
  const wantTag = normalizeTag(tagLine);
  const exact = list.filter(
    (s) =>
      s.game_name.toLowerCase() === wantName &&
      normalizeTag(s.tagline) === wantTag,
  );
  const pool = exact.length > 0 ? exact : list;

  const ranked = pool.find((s) => s.solo_tier_info != null);
  const pick = ranked ?? pool[0];
  if (!pick) {
    throw new LiveGameError("NOT_FOUND", "No summoner matched that Riot ID.");
  }
  return pick;
}

async function fetchIngameRsc(
  region: string,
  gameName: string,
  tagLine: string,
): Promise<string> {
  const slug = summonerSlug(gameName, tagLine);
  const url = `${OPGG_WEB}/lol/summoners/${region}/${encodeURIComponent(slug)}/ingame`;
  const res = await fetch(url, { headers: RSC_HEADERS, cache: "no-store" });
  if (!res.ok) {
    throw new LiveGameError(
      "OPGG_ERROR",
      `Could not load OP.GG live game page (${res.status}).`,
    );
  }
  return res.text();
}

/** Try to find live-game created_at embedded in ingame RSC when a match is active. */
function extractLiveCreatedAtFromRsc(rsc: string): string | null {
  const patterns = [
    /"live_game"\s*:\s*\{[^}]*"created_at"\s*:\s*"([^"]+)"/,
    /"liveGame"\s*:\s*\{[^}]*"created_at"\s*:\s*"([^"]+)"/,
    /"game_start_time"\s*:\s*"([^"]+)"/,
    /"spectate"\s*:\s*\{[^}]*"created_at"\s*:\s*"([^"]+)"/,
  ];
  for (const re of patterns) {
    const m = rsc.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

function candidateCreatedAtTimes(summoner: OpggSummonerRecord, rsc: string): string[] {
  const fromRsc = extractLiveCreatedAtFromRsc(rsc);
  const candidates = [
    fromRsc,
    summoner.revision_at,
    summoner.updated_at,
    summoner.renewable_at,
  ].filter((x): x is string => Boolean(x));
  return [...new Set(candidates)];
}

async function fetchSpectate(
  region: string,
  summonerId: string,
  createdAt: string,
): Promise<{ ok: true; data: OpggLivePayload } | { ok: false; status: number }> {
  const q = new URLSearchParams({
    created_at: createdAt,
    summoner_id: summonerId,
    hl: "en_US",
  });
  const url = `${SUMMONER_API}/${region}/games/spectate?${q}`;
  const res = await fetch(url, { headers: OPGG_FETCH_HEADERS, cache: "no-store" });
  const text = await res.text();
  if (res.status === 200) {
    const body = JSON.parse(text) as { data?: OpggLivePayload };
    return { ok: true, data: body.data ?? {} };
  }
  return { ok: false, status: res.status };
}

async function loadChampionKeyMap(): Promise<Map<number, string>> {
  if (championKeyCache) return championKeyCache;

  const versionsRes = await fetch(
    "https://ddragon.leagueoflegends.com/api/versions.json",
    { cache: "force-cache" },
  );
  const versions = (await versionsRes.json()) as string[];
  const version = versions[0];
  if (!version) {
    throw new LiveGameError("OPGG_ERROR", "Could not load Data Dragon versions.");
  }

  const champRes = await fetch(
    `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`,
    { cache: "force-cache" },
  );
  const champJson = (await champRes.json()) as {
    data: Record<string, { key: string }>;
  };

  const map = new Map<number, string>();
  for (const [id, entry] of Object.entries(champJson.data)) {
    map.set(Number(entry.key), id);
  }
  championKeyCache = map;
  return map;
}

const CHAMPION_ALIASES: Record<string, string> = {
  Wukong: "MonkeyKing",
  "Nunu & Willump": "Nunu",
  Nunu: "Nunu",
  "Dr. Mundo": "DrMundo",
  "Cho'Gath": "ChoGath",
  "Kog'Maw": "KogMaw",
  "Kai'Sa": "Kaisa",
  "Kha'Zix": "Khazix",
  "Vel'Koz": "Velkoz",
  "Rek'Sai": "RekSai",
};

function resolveCharacterName(ddId: string): string | null {
  const aliased = CHAMPION_ALIASES[ddId] ?? ddId;
  const found = Characters.find((c) => c.Name === aliased);
  return found?.Name ?? null;
}

function mapChampionId(champMap: Map<number, string>, championId: number): string {
  const ddId = champMap.get(championId);
  if (!ddId) {
    throw new LiveGameError(
      "CHAMPION_UNMAPPED",
      `Unknown champion id ${championId} from OP.GG.`,
    );
  }
  const name = resolveCharacterName(ddId);
  if (!name) {
    throw new LiveGameError(
      "CHAMPION_UNMAPPED",
      `Champion "${ddId}" is not available in this simulator.`,
    );
  }
  return name;
}

async function buildImportFromSpectateAsync(
  payload: OpggLivePayload,
  summoner: OpggSummonerRecord,
): Promise<LiveGameImport> {
  const participants = payload.participants ?? [];
  if (participants.length < 2) {
    throw new LiveGameError(
      "NOT_IN_GAME",
      "No active game found on OP.GG. Start a match first, then try again.",
    );
  }

  const self =
    participants.find((p) => p.summoner?.puuid === summoner.puuid) ??
    participants.find(
      (p) =>
        p.summoner?.game_name?.toLowerCase() === summoner.game_name.toLowerCase() &&
        normalizeTag(p.summoner?.tagline ?? "") === normalizeTag(summoner.tagline),
    );

  if (!self?.team_key || self.champion_id == null) {
    throw new LiveGameError(
      "OPGG_ERROR",
      "Could not determine your champion in the live game payload.",
    );
  }

  const champMap = await loadChampionKeyMap();
  const myChampion = mapChampionId(champMap, self.champion_id);
  const myTeam = self.team_key;

  const enemyTeam: string[] = [];
  const unmapped: number[] = [];

  for (const p of participants) {
    if (p.team_key === myTeam || p.champion_id == null) continue;
    try {
      const name = mapChampionId(champMap, p.champion_id);
      if (!enemyTeam.includes(name)) enemyTeam.push(name);
    } catch (e) {
      if (e instanceof LiveGameError && e.code === "CHAMPION_UNMAPPED") {
        unmapped.push(p.champion_id);
      } else {
        throw e;
      }
    }
  }

  if (enemyTeam.length === 0) {
    throw new LiveGameError(
      "CHAMPION_UNMAPPED",
      unmapped.length > 0
        ? `Could not map enemy champion ids: ${unmapped.join(", ")}.`
        : "No enemy champions found in the live game.",
    );
  }

  return {
    myChampion,
    enemyTeam: enemyTeam.slice(0, 5),
    queueLabel: payload.queue_info?.description ?? payload.game_type,
  };
}

/** Parse embedded live payload from ingame RSC when spectate data is inlined. */
function tryParseEmbeddedLiveGame(rsc: string): OpggLivePayload | null {
  const idx = rsc.indexOf('"participants":');
  if (idx < 0) return null;
  const snippet = rsc.slice(idx, idx + 8000);
  if (!snippet.includes("champion_id") || !snippet.includes("team_key")) {
    return null;
  }
  const start = rsc.lastIndexOf("{", idx);
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < Math.min(rsc.length, start + 120000); i++) {
    const ch = rsc[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          const obj = JSON.parse(rsc.slice(start, i + 1)) as OpggLivePayload;
          if (obj.participants && obj.participants.length >= 2) return obj;
        } catch {
          return null;
        }
        break;
      }
    }
  }
  return null;
}

export async function fetchOpggLiveGame(params: {
  gameName: string;
  tagLine: string;
  region: string;
}): Promise<LiveGameImport> {
  const region = normalizeOpggRegion(params.region);
  const summoner = await searchSummoner(region, params.gameName, params.tagLine);
  const rsc = await fetchIngameRsc(region, params.gameName, params.tagLine);

  const embedded = tryParseEmbeddedLiveGame(rsc);
  if (embedded) {
    return buildImportFromSpectateAsync(embedded, summoner);
  }

  const times = candidateCreatedAtTimes(summoner, rsc);
  let lastStatus = 0;
  for (const createdAt of times) {
    const result = await fetchSpectate(region, summoner.summoner_id, createdAt);
    if (result.ok) {
      return buildImportFromSpectateAsync(result.data, summoner);
    }
    lastStatus = result.status;
  }

  if (lastStatus === 404) {
    throw new LiveGameError(
      "NOT_IN_GAME",
      `${params.gameName}#${params.tagLine} is not in an active game on OP.GG.`,
    );
  }

  throw new LiveGameError(
    "NOT_IN_GAME",
    `${params.gameName}#${params.tagLine} is not in an active game on OP.GG, or live data is not available yet.`,
  );
}

export async function importLiveGameFromRiotId(
  riotId: string,
  region: string,
): Promise<LiveGameImport> {
  const { gameName, tagLine } = parseRiotId(riotId);
  return fetchOpggLiveGame({ gameName, tagLine, region });
}
