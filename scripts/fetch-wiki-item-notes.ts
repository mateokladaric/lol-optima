/**
 * Fetch full wiki Notes sections for all catalog item groups.
 * Run: npm run fetch:wiki-items
 * Output: data/wiki-item-notes-fetched.json
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { Items } from "../src/app/actions/sim";
import { extractItemWikiBullets } from "../src/lib/wikiItemNotesExtract";
import { ITEM_WIKI_PAGE_SLUGS } from "../src/lib/itemWikiMeta";

const WIKI_API = "https://wiki.leagueoflegends.com/en-us/api.php";
const OUT_DIR = join(process.cwd(), "data");
const OUT_FILE = join(OUT_DIR, "wiki-item-notes-fetched.json");

type FetchedEntry = {
  group: string;
  pageTitle: string;
  wikiUrl: string;
  ok: boolean;
  notes: string[];
  error?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function pageSlugForGroup(group: string): string {
  return (
    ITEM_WIKI_PAGE_SLUGS[group] ??
    group.replace(/'/g, "%27").replace(/ /g, "_")
  );
}

async function fetchGroup(group: string): Promise<FetchedEntry> {
  const pageTitle = decodeURIComponent(pageSlugForGroup(group));
  const wikiUrl = `https://wiki.leagueoflegends.com/en-us/${pageSlugForGroup(group)}`;
  const url = `${WIKI_API}?action=parse&page=${encodeURIComponent(pageTitle)}&prop=wikitext&format=json&formatversion=2`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "loloptima-wiki-item-fetch/1.0" },
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) {
      return {
        group,
        pageTitle,
        wikiUrl,
        ok: false,
        notes: [],
        error: `HTTP ${res.status}`,
      };
    }
    const json = (await res.json()) as { parse?: { wikitext?: string } };
    const wikitext = json.parse?.wikitext ?? "";
    const notes = extractItemWikiBullets(wikitext);
    return {
      group,
      pageTitle,
      wikiUrl,
      ok: notes.length > 0,
      notes,
      error: notes.length === 0 ? "no notes/passive extracted" : undefined,
    };
  } catch (e) {
    return {
      group,
      pageTitle,
      wikiUrl,
      ok: false,
      notes: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const itemIdx = args.indexOf("--item");
  const itemFilter =
    itemIdx >= 0 ? args[itemIdx + 1]?.replace(/^"|"$/g, "") : undefined;

  const groups = new Set<string>();
  for (const item of Items) groups.add(item.getMechanicsGroup());
  let list = [...groups].sort();
  if (itemFilter) {
    list = list.filter((g) => g === itemFilter || g.includes(itemFilter));
  }

  console.log(`Fetching wiki Notes for ${list.length} item groups…`);

  const entries: FetchedEntry[] = [];
  let ok = 0;
  let fail = 0;

  for (const group of list) {
    const result = await fetchGroup(group);
    entries.push(result);
    if (result.ok) {
      ok++;
      console.log(`  ✓ ${group}: ${result.notes.length} bullets`);
    } else {
      fail++;
      console.log(`  ✗ ${group}: ${result.error}`);
    }
    await sleep(320);
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    groupCount: list.length,
    okCount: ok,
    failCount: fail,
    entries: Object.fromEntries(entries.map((e) => [e.group, e])),
  };

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2));
  console.log(`\nWrote ${OUT_FILE} (${ok} ok, ${fail} failed)`);

  if (fail > 0 && !itemFilter) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
