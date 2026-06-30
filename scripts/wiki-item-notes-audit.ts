/**
 * Wiki item Notes audit — surfaces item groups with curated notes vs wiki fetch gaps.
 *
 * Usage:
 *   npm run audit:wiki-items              # local report from itemWikiNotes.ts
 *   npm run audit:wiki-items -- --fetch   # also query wiki API (slow, network)
 *   npm run audit:wiki-items -- --item "Voltaic Cyclosword"
 */

import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { Items } from "../src/app/actions/sim";
import {
  findUnparsedWikiKeywords,
  getEquippedItemInteractionFlags,
  parseItemInteractionFlags,
} from "../src/lib/itemInteractions";
import { MODELED_ITEM_GROUPS } from "../src/lib/itemMechanics";
import {
  ITEM_WIKI_NOTES,
  allWikiNoteGroups,
  type ItemWikiEntry,
} from "../src/lib/itemWikiNotes";

const WIKI_API = "https://wiki.leagueoflegends.com/en-us/api.php";
const OUT_DIR = join(process.cwd(), "data");
const OUT_FILE = join(OUT_DIR, "wiki-item-notes-audit.json");

type WikiFetchResult = {
  group: string;
  pageTitle: string;
  ok: boolean;
  notesBullets: string[];
  error?: string;
};

function wikiPageTitle(group: string): string {
  const entry = ITEM_WIKI_NOTES[group];
  if (entry?.wikiUrl) {
    const slug = entry.wikiUrl.split("/").pop() ?? group;
    return decodeURIComponent(slug);
  }
  return group.replace(/'/g, "%27").replace(/ /g, "_");
}

function extractNotesSection(wikitext: string): string[] {
  const notesMatch = wikitext.match(
    /==\s*Notes\s*==([\s\S]*?)(?=\n==[^=]|\n===$|$)/i,
  );
  if (!notesMatch) return [];

  const section = notesMatch[1];
  const bullets: string[] = [];
  for (const line of section.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("*")) {
      const text = trimmed
        .replace(/^\*+\s*/, "")
        .replace(/\{\{[^}]+\}\}/g, "")
        .replace(/\[\[([^|\]]+\|)?([^\]]+)\]\]/g, "$2")
        .trim();
      if (text.length > 10) bullets.push(text.slice(0, 400));
    }
  }
  return bullets;
}

async function fetchWikiItemNotes(group: string): Promise<WikiFetchResult> {
  const pageTitle = wikiPageTitle(group);
  const url = `${WIKI_API}?action=parse&page=${encodeURIComponent(pageTitle)}&prop=wikitext&format=json&formatversion=2`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "loloptima-wiki-item-audit/1.0" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      return {
        group,
        pageTitle,
        ok: false,
        notesBullets: [],
        error: `HTTP ${res.status}`,
      };
    }
    const json = (await res.json()) as {
      parse?: { wikitext?: string };
    };
    const wikitext = json.parse?.wikitext ?? "";
    return {
      group,
      pageTitle,
      ok: true,
      notesBullets: extractNotesSection(wikitext),
    };
  } catch (e) {
    return {
      group,
      pageTitle,
      ok: false,
      notesBullets: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function catalogMechanicsGroups(): string[] {
  const groups = new Set<string>();
  for (const item of Items) {
    groups.add(item.getMechanicsGroup());
  }
  return [...groups].sort();
}

function auditEntry(
  group: string,
  entry: ItemWikiEntry | undefined,
): {
  group: string;
  hasNotes: boolean;
  noteCount: number;
  simStatus: string;
  unparsedKeywords: string[];
  wikiGaps: string[];
} {
  if (!entry) {
    return {
      group,
      hasNotes: false,
      noteCount: 0,
      simStatus: "missing",
      unparsedKeywords: [],
      wikiGaps: [],
    };
  }
  const flags = parseItemInteractionFlags(entry.notes);
  return {
    group,
    hasNotes: entry.notes.length > 0,
    noteCount: entry.notes.length,
    simStatus: entry.simStatus,
    unparsedKeywords: findUnparsedWikiKeywords(entry, flags),
    wikiGaps: entry.wikiGaps ?? [],
  };
}

async function main() {
  const args = process.argv.slice(2);
  const doFetch = args.includes("--fetch");
  const itemIdx = args.indexOf("--item");
  const itemFilter =
    itemIdx >= 0 ? args[itemIdx + 1]?.replace(/^"|"$/g, "") : undefined;

  const catalogGroups = catalogMechanicsGroups();
  const groups = itemFilter
    ? catalogGroups.filter((g) => g === itemFilter || g.includes(itemFilter))
    : catalogGroups;

  console.log(`Wiki item notes audit — ${groups.length} mechanics groups\n`);

  const rows = groups.map((g) => auditEntry(g, ITEM_WIKI_NOTES[g]));

  const missingNotes = rows.filter((r) => !r.hasNotes);
  const damageRelevant = rows.filter(
    (r) =>
      r.simStatus === "modeled" ||
      r.simStatus === "static" ||
      r.simStatus === "partial",
  );
  const unparsed = rows.filter((r) => r.unparsedKeywords.length > 0);

  console.log(`Curated wiki entries: ${allWikiNoteGroups().length}`);
  console.log(`Catalog mechanics groups: ${catalogGroups.length}`);
  console.log(`Missing notes: ${missingNotes.length}`);
  console.log(`Modeled groups (itemMechanics): ${MODELED_ITEM_GROUPS.length}`);
  console.log(`Unparsed keyword hits: ${unparsed.length}\n`);

  if (missingNotes.length > 0) {
    console.log("--- Missing wiki notes ---");
    for (const r of missingNotes.slice(0, 25)) {
      console.log(`  ${r.group}`);
    }
    if (missingNotes.length > 25) {
      console.log(`  ... +${missingNotes.length - 25} more`);
    }
    console.log();
  }

  const damageMissing = damageRelevant.filter((r) => !r.hasNotes);
  if (damageMissing.length > 0) {
    console.log("--- Damage-relevant groups missing notes ---");
    for (const r of damageMissing) {
      console.log(`  ${r.group} (${r.simStatus})`);
    }
    console.log();
  }

  if (unparsed.length > 0) {
    console.log("--- Unparsed DPS keywords (sample) ---");
    for (const r of unparsed.slice(0, 15)) {
      console.log(
        `  ${r.group}: ${r.unparsedKeywords.join(", ")}`,
      );
    }
    console.log();
  }

  let wikiFetches: WikiFetchResult[] | undefined;
  if (doFetch) {
    console.log("Fetching wiki Notes sections (rate-limited)...");
    wikiFetches = [];
    const fetchGroups = itemFilter ? groups : Object.keys(ITEM_WIKI_NOTES);
    for (const group of fetchGroups) {
      const result = await fetchWikiItemNotes(group);
      wikiFetches.push(result);
      if (result.ok && result.notesBullets.length > 0) {
        console.log(
          `  ${group}: ${result.notesBullets.length} bullets`,
        );
      } else if (!result.ok) {
        console.log(`  ${group}: fetch failed (${result.error})`);
      }
      await sleep(350);
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    catalogGroupCount: catalogGroups.length,
    curatedEntryCount: allWikiNoteGroups().length,
    missingNotes: missingNotes.map((r) => r.group),
    damageRelevantMissing: damageMissing.map((r) => r.group),
    entries: rows,
    wikiFetches,
    nextSteps: [
      "Curate fetched Notes into src/lib/itemWikiNotes.ts",
      "Extend itemInteractions.ts parsers for unparsed keywords",
      "Re-run audit:items and regression:sim after mechanics changes",
    ],
  };

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify(report, null, 2));
  console.log(`Wrote ${OUT_FILE}`);

  if (damageMissing.length > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
