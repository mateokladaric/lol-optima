/**
 * Wiki mechanics audit — surfaces champions whose kit traits affect builds
 * (shields, spell shields, heals) and optionally fetches wiki ability pages.
 *
 * Usage:
 *   npm run audit:wiki              # local trait report from sim data
 *   npm run audit:wiki -- --fetch   # also query wiki API (slow, network)
 *   npm run audit:wiki -- --champ "Kha'Zix"
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { Characters, championSimKey } from "../src/app/actions/sim";
import {
  CHAMPION_COMBAT_TRAIT_OVERRIDES,
  championsNeedingWikiAudit,
  computeChampionCombatTraits,
} from "../src/lib/championCombatTraits";

const WIKI_API = "https://wiki.leagueoflegends.com/en-us/api.php";
const OUT_DIR = join(process.cwd(), "data");
const OUT_FILE = join(OUT_DIR, "wiki-mechanics-audit.json");

type WikiFetchResult = {
  champion: string;
  pageTitle: string;
  ok: boolean;
  detailSnippets: string[];
  error?: string;
};

/** Keywords from wiki "Details" dropdowns that imply sim gaps. */
const WIKI_DETAIL_KEYWORDS = [
  "spell shield",
  "spellshield",
  "blocks",
  "shield",
  "heal",
  "lifesteal",
  "omnivamp",
  "damage reduction",
  "untargetable",
  "invulnerable",
  "stasis",
  "cleanse",
  "tenacity",
  "grievous",
  "anti-heal",
  "execute",
  "true damage",
  "cannot be",
  "immune",
];

function wikiPageTitle(championName: string): string {
  return championName.replace(/'/g, "%27").replace(/ /g, "_");
}

async function fetchWikiPage(championName: string): Promise<WikiFetchResult> {
  const pageTitle = wikiPageTitle(championName);
  const url = `${WIKI_API}?action=parse&page=${encodeURIComponent(pageTitle)}&prop=wikitext&format=json&formatversion=2`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "loloptima-wiki-audit/1.0" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      return {
        champion: championName,
        pageTitle,
        ok: false,
        detailSnippets: [],
        error: `HTTP ${res.status}`,
      };
    }
    const json = (await res.json()) as {
      parse?: { wikitext?: string };
    };
    const wikitext = json.parse?.wikitext ?? "";
    const detailSnippets: string[] = [];

    for (const kw of WIKI_DETAIL_KEYWORDS) {
      const re = new RegExp(`[^\\n]{0,80}${kw}[^\\n]{0,120}`, "gi");
      const matches = wikitext.match(re);
      if (matches) {
        for (const m of matches.slice(0, 2)) {
          detailSnippets.push(m.trim().replace(/\{\{[^}]+\}\}/g, "").slice(0, 200));
        }
      }
    }

    return {
      champion: championName,
      pageTitle,
      ok: true,
      detailSnippets: [...new Set(detailSnippets)].slice(0, 12),
    };
  } catch (e) {
    return {
      champion: championName,
      pageTitle,
      ok: false,
      detailSnippets: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const args = process.argv.slice(2);
  const doFetch = args.includes("--fetch");
  const champIdx = args.indexOf("--champ");
  const champFilter =
    champIdx >= 0 ? args[champIdx + 1]?.replace(/^"|"$/g, "") : undefined;

  const champions = Characters.filter(
    (c) => !champFilter || c.Name === champFilter,
  ).map((c) => c.Name);

  console.log(`Wiki mechanics audit — ${champions.length} champions`);
  console.log("");

  const traitRows = champions.map((name) => {
    const champ = Characters.find((c) => c.Name === name)!;
    const traits = computeChampionCombatTraits(champ);
    const key = championSimKey(name);
    const overrides = CHAMPION_COMBAT_TRAIT_OVERRIDES[key];
    return {
      champion: name,
      simKey: key,
      antiShieldScore: Math.round(traits.antiShieldScore),
      physicalShieldPool: Math.round(traits.physicalShieldPool),
      magicShieldPool: Math.round(traits.magicShieldPool),
      spellShieldBlockChance: traits.spellShieldBlockChance,
      rotationHealHPS: Math.round(traits.rotationHealHPS),
      hasWikiOverride: overrides != null,
      wikiGaps: overrides?.wikiGaps ?? [],
      shieldSources: traits.sources.slice(0, 5),
    };
  });

  const highShield = traitRows
    .filter((r) => r.antiShieldScore >= 30)
    .sort((a, b) => b.antiShieldScore - a.antiShieldScore);

  console.log("Top shield-heavy kits (Serpent's Fang relevance):");
  for (const r of highShield.slice(0, 15)) {
    console.log(
      `  ${r.champion.padEnd(18)} score=${r.antiShieldScore} phys=${r.physicalShieldPool} magic=${r.magicShieldPool} override=${r.hasWikiOverride}`,
    );
  }
  console.log("");

  const spellShield = traitRows
    .filter((r) => r.spellShieldBlockChance > 0)
    .sort((a, b) => b.spellShieldBlockChance - a.spellShieldBlockChance);
  console.log("Spell-shield kits:");
  for (const r of spellShield) {
    console.log(
      `  ${r.champion.padEnd(18)} block=${(r.spellShieldBlockChance * 100).toFixed(0)}%`,
    );
  }
  console.log("");

  const auditCandidates = championsNeedingWikiAudit();
  const needsOverride = auditCandidates.filter((c) => !c.hasOverride);
  console.log(
    `Audit candidates (shield/spellshield, no override): ${needsOverride.length}`,
  );
  for (const c of needsOverride.slice(0, 20)) {
    console.log(
      `  ${c.name.padEnd(18)} antiShield=${c.antiShieldScore.toFixed(0)} physPool=${c.physicalShieldPool.toFixed(0)}`,
    );
  }
  console.log("");

  let wikiFetches: WikiFetchResult[] = [];
  if (doFetch) {
    console.log("Fetching wiki pages (rate-limited)...");
    for (const name of champions) {
      const result = await fetchWikiPage(name);
      wikiFetches.push(result);
      if (result.ok && result.detailSnippets.length > 0) {
        console.log(`  ${name}: ${result.detailSnippets.length} detail hits`);
      } else if (!result.ok) {
        console.log(`  ${name}: fetch failed (${result.error})`);
      }
      await sleep(350);
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    championCount: champions.length,
    highShieldKits: highShield,
    spellShieldKits: spellShield,
    auditCandidates: needsOverride,
    traits: traitRows,
    wikiFetches: doFetch ? wikiFetches : undefined,
    nextSteps: [
      "Add CHAMPION_COMBAT_TRAIT_OVERRIDES entries from wiki Details sections",
      "Fix % max HP shields mis-tagged as flat in sim.ts ability rows",
      "Model unmodeled interactions listed in wikiGaps",
      "Re-run regression:sim after trait changes",
    ],
  };

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify(report, null, 2));
  console.log(`Wrote ${OUT_FILE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
