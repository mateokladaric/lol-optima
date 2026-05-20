import { writeFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DDChampionEntry = {
  id: string; // e.g. "Aatrox"
  key: string; // e.g. "266" (numeric string)
  name: string; // e.g. "Aatrox"
  stats: {
    hp: number;
    hpperlevel: number;
    armor: number;
    armorperlevel: number;
    spellblock: number;
    spellblockperlevel: number;
  };
};

type DDItemEntry = { name: string; gold: { purchasable: boolean } };

type OpggPosition = {
  name: string;
  stats: { play: number; pick_rate: number; role_rate: number };
};

type OpggChampion = {
  id: number;
  is_rip: boolean;
  positions: OpggPosition[];
};

type OpggItemSet = { ids: number[]; play: number; win: number; pick_rate: number };

type OpggItemsResponse = {
  data: {
    core_items: OpggItemSet[];
    boots: OpggItemSet[];
    last_items: OpggItemSet[];
  };
  meta: { version: string };
};

export type ScrapedChampionBuild = {
  position: string;
  items: string[];
  boots: string | null;
  fullBuild: string[];
  baseStatsLv18: { hp: number; armor: number; mr: number };
};

export type ScrapedBuildsFile = {
  patch: string;
  scrapedAt: string;
  champions: Record<string, ScrapedChampionBuild>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DDRAGON_VERSION_URL = "https://ddragon.leagueoflegends.com/api/versions.json";
const DDRAGON_BASE = "https://ddragon.leagueoflegends.com/cdn";
const OPGG_API = "https://lol-api-champion.op.gg/api/KR/champions/ranked";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json() as Promise<T>;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function statAtLevel(base: number, perLevel: number, level: number): number {
  return base + perLevel * (level - 1);
}

// Normalize item name for fuzzy matching:
// lowercase, strip apostrophes, collapse whitespace
function normalizeItemName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const level = 18;

  // 1. Get latest DDragon version
  console.log("[scrape] Fetching Data Dragon version…");
  const versions = await fetchJson<string[]>(DDRAGON_VERSION_URL);
  const ddVersion = versions[0];
  console.log(`[scrape] Using Data Dragon ${ddVersion}`);

  // 2. Fetch champion data (name → riot numeric key + base stats)
  console.log("[scrape] Fetching champion data…");
  const ddChampUrl = `${DDRAGON_BASE}/${ddVersion}/data/en_US/champion.json`;
  const ddChampData = await fetchJson<{ data: Record<string, DDChampionEntry> }>(ddChampUrl);

  const champByRiotId = new Map<number, DDChampionEntry>();
  const champByName = new Map<string, DDChampionEntry>();
  for (const c of Object.values(ddChampData.data)) {
    champByRiotId.set(Number(c.key), c);
    champByName.set(c.name, c);
  }
  console.log(`[scrape] Loaded ${champByRiotId.size} champions from Data Dragon`);

  // 3. Fetch item data (riot item ID → name)
  console.log("[scrape] Fetching item data…");
  const ddItemUrl = `${DDRAGON_BASE}/${ddVersion}/data/en_US/item.json`;
  const ddItemData = await fetchJson<{ data: Record<string, DDItemEntry> }>(ddItemUrl);

  const itemNameById = new Map<number, string>();
  for (const [id, item] of Object.entries(ddItemData.data)) {
    itemNameById.set(Number(id), item.name);
  }
  console.log(`[scrape] Loaded ${itemNameById.size} items from Data Dragon`);

  // 4. Fetch OP.GG ranked champion list
  console.log("[scrape] Fetching OP.GG ranked data…");
  const opggRanked = await fetchJson<{ data: OpggChampion[] }>(OPGG_API);
  console.log(`[scrape] Got ${opggRanked.data.length} champions from OP.GG`);

  // 5. For each champion, fetch most common build
  const champions: Record<string, ScrapedChampionBuild> = {};
  let patchVersion = "";
  let processed = 0;
  let skipped = 0;

  for (const opggChamp of opggRanked.data) {
    if (opggChamp.is_rip) continue;

    const ddChamp = champByRiotId.get(opggChamp.id);
    if (!ddChamp) {
      console.warn(`[scrape] Unknown champion ID ${opggChamp.id}, skipping`);
      skipped++;
      continue;
    }

    // Pick highest pick-rate position
    const positions = opggChamp.positions.filter((p) => p.stats.play > 50);
    if (positions.length === 0) {
      console.warn(`[scrape] ${ddChamp.name}: no positions with enough games, skipping`);
      skipped++;
      continue;
    }
    const bestPos = positions.reduce((a, b) =>
      b.stats.play > a.stats.play ? b : a,
    );

    // Rate limit: 80ms between requests
    await sleep(80);

    let itemsData: OpggItemsResponse;
    try {
      itemsData = await fetchJson<OpggItemsResponse>(
        `${OPGG_API}/${opggChamp.id}/${bestPos.name}/items`,
      );
    } catch (e) {
      console.warn(`[scrape] ${ddChamp.name} (${bestPos.name}): failed to fetch items — ${e}`);
      skipped++;
      continue;
    }

    if (!patchVersion && itemsData.meta?.version) {
      patchVersion = itemsData.meta.version;
    }

    // Build the 6-item loadout for duel/meta reference (not purchase order in-app):
    // 1) Top core_items entry (3 items, API order = typical completion 1→3)
    // 2) Top boots entry
    // 3) Fill from last_items by play rate
    const coreIds: number[] =
      itemsData.data.core_items.length > 0
        ? itemsData.data.core_items[0].ids
        : [];

    const bootIds: number[] =
      itemsData.data.boots.length > 0 ? itemsData.data.boots[0].ids : [];

    const usedIds = new Set([...coreIds, ...bootIds]);

    // Sort last_items by play count descending, pick up to (6 - core - boots) more
    const remaining = 6 - coreIds.length - bootIds.length;
    const fillIds: number[] = [];
    if (remaining > 0) {
      const sorted = [...itemsData.data.last_items]
        .filter((li) => li.ids.length === 1 && !usedIds.has(li.ids[0]))
        .sort((a, b) => b.play - a.play);
      for (const li of sorted) {
        if (fillIds.length >= remaining) break;
        fillIds.push(li.ids[0]);
        usedIds.add(li.ids[0]);
      }
    }

    const resolveIds = (ids: number[]): string[] =>
      ids.map((id) => itemNameById.get(id) ?? `Unknown(${id})`).filter(Boolean);

    const coreNames = resolveIds(coreIds);
    const bootName = bootIds.length > 0 ? (itemNameById.get(bootIds[0]) ?? null) : null;
    const fillNames = resolveIds(fillIds);

    const fullBuild = [...coreNames, ...(bootName ? [bootName] : []), ...fillNames];

    const { stats: s } = ddChamp;
    champions[ddChamp.name] = {
      position: bestPos.name,
      items: coreNames,
      boots: bootName,
      fullBuild,
      baseStatsLv18: {
        hp: Math.round(statAtLevel(s.hp, s.hpperlevel, level)),
        armor: Math.round(statAtLevel(s.armor, s.armorperlevel, level)),
        mr: Math.round(statAtLevel(s.spellblock, s.spellblockperlevel, level)),
      },
    };

    processed++;
    if (processed % 20 === 0) {
      console.log(`[scrape] Processed ${processed} champions…`);
    }
  }

  const result: ScrapedBuildsFile = {
    patch: patchVersion || ddVersion,
    scrapedAt: new Date().toISOString(),
    champions,
  };

  const outPath = join(process.cwd(), "public", "data", "opggBuilds.json");
  writeFileSync(outPath, JSON.stringify(result, null, 2), "utf8");
  console.log(
    `[scrape] Done! Wrote ${outPath} (${processed} champions, ${skipped} skipped)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
