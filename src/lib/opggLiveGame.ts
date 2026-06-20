/**
 * OP.GG unofficial summoner / live-game client (server-only).
 *
 * Confirmed endpoints (2026-06):
 * - GET https://lol-api-summoner.op.gg/api/v3/{region}/summoners?riot_id={gameName%23tag}&hl=en_US
 * - POST https://op.gg/lol/summoners/{region}/{slug}/ingame (Next-Action renewal server action)
 * - POST ingame page Next-Action getInGameInfo (teamsData + champion_name)
 * - GET https://lol-api-summoner.op.gg/api/{region}/games/spectate (fallback; created_at is encrypted game_id)
 *
 * Flow: summoner search → renewal (Update) → getInGameInfo server action (retries). Region is auto-detected
 * across common servers when the selected region is wrong.
 */

import { Characters } from "@/app/actions/sim";

const SUMMONER_API = "https://lol-api-summoner.op.gg/api";
const OPGG_WEB = "https://op.gg";

/** OP.GG Next.js server action ids (ingame page chunks). */
const OPGG_RENEWAL_ACTION = "405a04669583947dc03eb8c7f367adf28c8f714e86";
const OPGG_RENEWAL_STATUS_ACTION = "400c02bdfd8c90756a329b312a7455e73880ad43ec";
const OPGG_INGAME_INFO_ACTION = "40f052435807841afcefdd3e993b4a019b4a1bf970";

const RENEW_POLL_MS = 1500;
const RENEW_POLL_MAX = 20;
const INGAME_INFO_RETRIES = 4;
const INGAME_INFO_RETRY_MS = 1000;

const REGION_FALLBACK_ORDER = ["na", "euw", "eune", "kr", "oce", "br", "lan", "las"] as const;

const OPGG_FETCH_HEADERS: Record<string, string> = {
  Accept: "application/json",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Origin: OPGG_WEB,
  Referer: `${OPGG_WEB}/`,
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
  /** OP.GG region segment where the account was found (may differ from UI selection). */
  resolvedRegion?: string;
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
  id?: number;
  summoner_id: string | null;
  puuid: string;
  game_name: string;
  tagline: string;
  revision_at?: string;
  updated_at?: string;
  renewable_at?: string;
  solo_tier_info?: unknown;
};

type OpggRenewalState = {
  status: string;
  delay?: number;
  lastUpdatedAt?: string;
  renewableAt?: string;
  statusCode?: number;
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

type OpggInGameParticipant = {
  puuid?: string;
  game_name?: string;
  tagline?: string;
  champion_name?: string;
  team_key?: string;
};

type OpggInGameTeam = {
  key?: string;
  participants?: OpggInGameParticipant[];
};

type OpggInGamePayload = {
  game_id?: string;
  created_at?: string;
  game_type?: { game_translate?: string; game_type?: string };
  teamsData?: {
    blueTeam?: OpggInGameTeam;
    redTeam?: OpggInGameTeam;
  };
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

function pickSummonerFromList(
  list: OpggSummonerRecord[],
  gameName: string,
  tagLine: string,
): OpggSummonerRecord | null {
  const wantName = gameName.toLowerCase();
  const wantTag = normalizeTag(tagLine);
  const exact = list.filter(
    (s) =>
      s.game_name.toLowerCase() === wantName &&
      normalizeTag(s.tagline) === wantTag,
  );
  const pool = exact.length > 0 ? exact : list;
  const ranked = pool.find((s) => s.solo_tier_info != null);
  return ranked ?? pool[0] ?? null;
}

async function searchSummonerInRegion(
  region: string,
  gameName: string,
  tagLine: string,
): Promise<OpggSummonerRecord | null> {
  const riotId = encodeURIComponent(`${gameName}#${tagLine}`);
  const url = `${SUMMONER_API}/v3/${region}/summoners?riot_id=${riotId}&hl=en_US`;
  try {
    const body = await fetchJson<{ data?: OpggSummonerRecord[] }>(
      url,
      OPGG_FETCH_HEADERS,
    );
    return pickSummonerFromList(body.data ?? [], gameName, tagLine);
  } catch (e) {
    if (e instanceof LiveGameError && e.code === "NOT_FOUND") return null;
    throw e;
  }
}

async function searchSummoner(
  region: string,
  gameName: string,
  tagLine: string,
): Promise<OpggSummonerRecord & { resolvedRegion: string }> {
  const normalized = normalizeOpggRegion(region);
  let pick = await searchSummonerInRegion(normalized, gameName, tagLine);
  let resolvedRegion = normalized;

  if (!pick) {
    const others = REGION_FALLBACK_ORDER.filter((r) => r !== normalized);
    for (const r of others) {
      pick = await searchSummonerInRegion(r, gameName, tagLine);
      if (pick) {
        resolvedRegion = r;
        break;
      }
    }
  }

  if (!pick) {
    throw new LiveGameError(
      "NOT_FOUND",
      `No summoner found for ${gameName}#${tagLine}. Check the Riot ID and region.`,
    );
  }

  return { ...pick, resolvedRegion };
}

function ingamePageUrl(region: string, gameName: string, tagLine: string): string {
  const slug = summonerSlug(gameName, tagLine);
  return `${OPGG_WEB}/lol/summoners/${region}/${encodeURIComponent(slug)}/ingame`;
}

function resolveSpectateSummonerId(summoner: OpggSummonerRecord): string {
  if (summoner.summoner_id != null && summoner.summoner_id !== "") {
    return String(summoner.summoner_id);
  }
  if (summoner.id != null) {
    return String(summoner.id);
  }
  throw new LiveGameError(
    "OPGG_ERROR",
    "OP.GG did not return a summoner id for spectate.",
  );
}

function parseOpggActionResponse(text: string): OpggRenewalState | null {
  const line = text.split("\n").find((l) => l.startsWith("1:"));
  if (!line) return null;
  try {
    return JSON.parse(line.slice(2)) as OpggRenewalState;
  } catch {
    return null;
  }
}

async function callOpggServerAction(
  actionId: string,
  payload: unknown,
  pageUrl: string,
): Promise<string> {
  const res = await fetch(pageUrl, {
    method: "POST",
    headers: {
      Accept: "text/x-component",
      "Content-Type": "text/plain;charset=UTF-8",
      "Next-Action": actionId,
      Origin: OPGG_WEB,
      Referer: pageUrl,
      "User-Agent": OPGG_FETCH_HEADERS["User-Agent"] ?? "Mozilla/5.0",
    },
    body: JSON.stringify([payload]),
    cache: "no-store",
  });
  return res.text();
}

/** Mirrors OP.GG "Update" — required before live match data is available. */
async function triggerOpggRenewal(
  region: string,
  puuid: string,
  pageUrl: string,
): Promise<OpggRenewalState> {
  const text = await callOpggServerAction(
    OPGG_RENEWAL_ACTION,
    { region, puuid },
    pageUrl,
  );
  const state = parseOpggActionResponse(text);
  if (!state) {
    throw new LiveGameError(
      "OPGG_ERROR",
      "OP.GG renewal did not return a valid response.",
    );
  }
  if (state.status === "UNKNOWN" || state.status === "REQUEST_FAILED") {
    throw new LiveGameError(
      "OPGG_ERROR",
      "OP.GG could not refresh this summoner. Try again in a moment.",
    );
  }
  return state;
}

async function pollOpggRenewalUntilFinish(
  region: string,
  puuid: string,
  pageUrl: string,
  initial: OpggRenewalState,
): Promise<OpggRenewalState> {
  let state = initial;
  let polls = 0;
  while (state.status === "RENEWING" && polls < RENEW_POLL_MAX) {
    const waitMs = state.delay ?? RENEW_POLL_MS;
    await new Promise((r) => setTimeout(r, waitMs));
    const text = await callOpggServerAction(
      OPGG_RENEWAL_STATUS_ACTION,
      { region, puuid },
      pageUrl,
    );
    const next = parseOpggActionResponse(text);
    if (next) state = next;
    polls++;
  }
  if (state.status === "RENEWING") {
    throw new LiveGameError(
      "OPGG_ERROR",
      "OP.GG renewal is still in progress. Wait a few seconds and try again.",
    );
  }
  return state;
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
  "Lee Sin": "LeeSin",
  "Master Yi": "MasterYi",
  "Miss Fortune": "MissFortune",
  "Twisted Fate": "TwistedFate",
  "Jarvan IV": "JarvanIV",
  "Aurelion Sol": "AurelionSol",
  "BelVeth": "Belveth",
  "Renata Glasc": "Renata",
  Kayn: "Kayn (Rhaast)",
};

function mapOpggDisplayChampion(displayName: string): string {
  const aliased = CHAMPION_ALIASES[displayName];
  if (aliased) {
    const hit = Characters.find((c) => c.Name === aliased);
    if (hit) return hit.Name;
  }
  const compact = displayName.replace(/[^a-zA-Z]/g, "");
  const byCompact = Characters.find(
    (c) => c.Name.toLowerCase() === compact.toLowerCase(),
  );
  if (byCompact) return byCompact.Name;
  const byExact = Characters.find((c) => c.Name === displayName);
  if (byExact) return byExact.Name;
  throw new LiveGameError(
    "CHAMPION_UNMAPPED",
    `Champion "${displayName}" is not available in this simulator.`,
  );
}

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

function parseInGameInfoActionResponse(text: string): OpggInGamePayload | null {
  for (const line of text.split("\n")) {
    if (!line.startsWith("1:") || !line.includes("teamsData")) continue;
    try {
      return JSON.parse(line.slice(2)) as OpggInGamePayload;
    } catch {
      continue;
    }
  }
  return null;
}

async function fetchInGameInfoViaAction(
  region: string,
  puuid: string,
  pageUrl: string,
): Promise<OpggInGamePayload | null> {
  const text = await callOpggServerAction(
    OPGG_INGAME_INFO_ACTION,
    { region, puuid, locale: "en" },
    pageUrl,
  );
  return parseInGameInfoActionResponse(text);
}

function buildImportFromInGamePayload(
  payload: OpggInGamePayload,
  summoner: OpggSummonerRecord,
): LiveGameImport {
  const blue = payload.teamsData?.blueTeam?.participants ?? [];
  const red = payload.teamsData?.redTeam?.participants ?? [];
  const all = [...blue, ...red];

  const self =
    all.find((p) => p.puuid === summoner.puuid) ??
    all.find(
      (p) =>
        p.game_name?.toLowerCase() === summoner.game_name.toLowerCase() &&
        normalizeTag(p.tagline ?? "") === normalizeTag(summoner.tagline),
    );

  if (!self?.champion_name) {
    throw new LiveGameError(
      "OPGG_ERROR",
      "Could not determine your champion in the live game payload.",
    );
  }

  const myTeamKey =
    self.team_key ??
    (blue.some((p) => p.puuid === summoner.puuid) ? "BLUE" : "RED");
  const myChampion = mapOpggDisplayChampion(self.champion_name);

  const enemyTeam: string[] = [];
  const unmapped: string[] = [];
  const enemies = myTeamKey === "BLUE" ? red : blue;

  for (const p of enemies) {
    if (!p.champion_name) continue;
    try {
      const name = mapOpggDisplayChampion(p.champion_name);
      if (!enemyTeam.includes(name)) enemyTeam.push(name);
    } catch (e) {
      if (e instanceof LiveGameError && e.code === "CHAMPION_UNMAPPED") {
        unmapped.push(p.champion_name);
      } else {
        throw e;
      }
    }
  }

  if (enemyTeam.length === 0) {
    throw new LiveGameError(
      "CHAMPION_UNMAPPED",
      unmapped.length > 0
        ? `Could not map enemy champions: ${unmapped.join(", ")}.`
        : "No enemy champions found in the live game.",
    );
  }

  return {
    myChampion,
    enemyTeam: enemyTeam.slice(0, 5),
    queueLabel: payload.game_type?.game_translate ?? payload.game_type?.game_type,
  };
}

async function fetchInGameInfoWithRetries(
  region: string,
  puuid: string,
  pageUrl: string,
): Promise<OpggInGamePayload | null> {
  for (let i = 0; i < INGAME_INFO_RETRIES; i++) {
    const payload = await fetchInGameInfoViaAction(region, puuid, pageUrl);
    if (payload?.teamsData) return payload;
    if (i < INGAME_INFO_RETRIES - 1) {
      await new Promise((r) => setTimeout(r, INGAME_INFO_RETRY_MS));
    }
  }
  return null;
}

function regionCodeFromOpggSegment(segment: string): OpggRegionCode {
  const upper = segment.toUpperCase();
  const hit = OPGG_REGION_OPTIONS.find((o) => o.value === upper);
  return hit?.value ?? "NA";
}

export async function fetchOpggLiveGame(params: {
  gameName: string;
  tagLine: string;
  region: string;
}): Promise<LiveGameImport> {
  const summoner = await searchSummoner(
    params.region,
    params.gameName,
    params.tagLine,
  );
  const region = summoner.resolvedRegion;
  const pageUrl = ingamePageUrl(region, params.gameName, params.tagLine);

  let renewal = await triggerOpggRenewal(region, summoner.puuid, pageUrl);
  if (renewal.status === "RENEWING") {
    renewal = await pollOpggRenewalUntilFinish(
      region,
      summoner.puuid,
      pageUrl,
      renewal,
    );
  }

  const inGame = await fetchInGameInfoWithRetries(region, summoner.puuid, pageUrl);
  const resolvedRegion = regionCodeFromOpggSegment(region);

  if (inGame?.teamsData) {
    return {
      ...buildImportFromInGamePayload(inGame, summoner),
      resolvedRegion,
    };
  }

  const spectateSummonerId = resolveSpectateSummonerId(summoner);
  const gameId = inGame?.game_id;
  if (gameId) {
    const createdAt = inGame.created_at ?? gameId;
    const result = await fetchSpectate(region, spectateSummonerId, createdAt);
    if (result.ok) {
      return {
        ...(await buildImportFromSpectateAsync(result.data, summoner)),
        resolvedRegion,
      };
    }
    const result2 = await fetchSpectate(region, spectateSummonerId, gameId);
    if (result2.ok) {
      return {
        ...(await buildImportFromSpectateAsync(result2.data, summoner)),
        resolvedRegion,
      };
    }
  }

  const regionHint =
    resolvedRegion !== regionCodeFromOpggSegment(normalizeOpggRegion(params.region))
      ? ` Account is on ${resolvedRegion}.`
      : "";

  throw new LiveGameError(
    "NOT_IN_GAME",
    `${params.gameName}#${params.tagLine} is not in an active game on OP.GG.${regionHint} Start a match, wait until OP.GG shows Live Game, then try again.`,
  );
}

export async function importLiveGameFromRiotId(
  riotId: string,
  region: string,
): Promise<LiveGameImport> {
  const { gameName, tagLine } = parseRiotId(riotId);
  return fetchOpggLiveGame({ gameName, tagLine, region });
}
