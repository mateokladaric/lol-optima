import { championSimKey } from "@/app/actions/sim";

export type DdragonAssets = {
  version: string;
  championIdByName: Map<string, string>;
  itemIdByName: Map<string, string>;
};

let cache: DdragonAssets | null = null;
let loadPromise: Promise<DdragonAssets> | null = null;

const CHAMPION_ID_ALIASES: Record<string, string> = {
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
  "Bel'Veth": "Belveth",
  "Renata Glasc": "Renata",
  "K'Sante": "KSante",
};

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripVariantSuffix(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

function buildChampionLookup(
  data: Record<string, { id: string; name: string }>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of Object.values(data)) {
    map.set(entry.name, entry.id);
    map.set(entry.id, entry.id);
    map.set(normalizeName(entry.name), entry.id);
  }
  for (const [display, id] of Object.entries(CHAMPION_ID_ALIASES)) {
    map.set(display, id);
    map.set(normalizeName(display), id);
  }
  return map;
}

function buildItemLookup(
  data: Record<string, { name?: string }>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const [id, entry] of Object.entries(data)) {
    if (!entry.name || id === "0") continue;
    map.set(entry.name, id);
    map.set(normalizeName(entry.name), id);
    map.set(stripVariantSuffix(entry.name), id);
    map.set(normalizeName(stripVariantSuffix(entry.name)), id);
  }
  return map;
}

export function loadDdragonAssets(): Promise<DdragonAssets> {
  if (cache) return Promise.resolve(cache);
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const versionsRes = await fetch(
      "https://ddragon.leagueoflegends.com/api/versions.json",
    );
    const versions = (await versionsRes.json()) as string[];
    const version = versions[0];
    if (!version) throw new Error("No Data Dragon version");

    const [champRes, itemRes] = await Promise.all([
      fetch(
        `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`,
      ),
      fetch(
        `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/item.json`,
      ),
    ]);

    const champJson = (await champRes.json()) as {
      data: Record<string, { id: string; name: string }>;
    };
    const itemJson = (await itemRes.json()) as {
      data: Record<string, { name?: string }>;
    };

    cache = {
      version,
      championIdByName: buildChampionLookup(champJson.data),
      itemIdByName: buildItemLookup(itemJson.data),
    };
    return cache;
  })();

  return loadPromise;
}

export function getDdragonAssets(): DdragonAssets | null {
  return cache;
}

function resolveChampionId(
  assets: DdragonAssets,
  displayName: string,
): string | null {
  const base = stripVariantSuffix(displayName);
  return (
    assets.championIdByName.get(displayName) ??
    assets.championIdByName.get(base) ??
    assets.championIdByName.get(normalizeName(base)) ??
    CHAMPION_ID_ALIASES[displayName] ??
    CHAMPION_ID_ALIASES[base] ??
    championSimKey(base)
  );
}

function resolveItemId(assets: DdragonAssets, itemName: string): string | null {
  const stripped = stripVariantSuffix(itemName);
  return (
    assets.itemIdByName.get(itemName) ??
    assets.itemIdByName.get(stripped) ??
    assets.itemIdByName.get(normalizeName(itemName)) ??
    assets.itemIdByName.get(normalizeName(stripped)) ??
    null
  );
}

export function championIconUrl(
  assets: DdragonAssets,
  displayName: string,
): string | null {
  const id = resolveChampionId(assets, displayName);
  if (!id) return null;
  return `https://ddragon.leagueoflegends.com/cdn/${assets.version}/img/champion/${id}.png`;
}

export function itemIconUrl(
  assets: DdragonAssets,
  itemName: string,
): string | null {
  const id = resolveItemId(assets, itemName);
  if (!id) return null;
  return `https://ddragon.leagueoflegends.com/cdn/${assets.version}/img/item/${id}.png`;
}
