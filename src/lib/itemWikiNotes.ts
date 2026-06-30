/**
 * Wiki Notes per item group — sourced from data/wiki-item-notes-fetched.json.
 * Run `npm run fetch:wiki-items` to refresh from the LoL Wiki.
 */

import type { Item } from "@/app/actions/sim";
import {
  ITEM_WIKI_SIM_META,
  simMetaForGroup,
  wikiPageUrl,
  type ItemWikiSimStatus,
} from "./itemWikiMeta";
import fetchedFile from "../../data/wiki-item-notes-fetched.json";

export type { ItemWikiSimStatus };

export type ItemWikiEntry = {
  notes: string[];
  wikiUrl: string;
  wikiGaps?: string[];
  simStatus: ItemWikiSimStatus;
  /** True when notes came from last wiki fetch. */
  fromWikiFetch?: boolean;
};

type FetchedGroup = {
  group: string;
  wikiUrl: string;
  ok: boolean;
  notes: string[];
};

const FETCHED = fetchedFile as {
  generatedAt: string;
  entries: Record<string, FetchedGroup>;
};

const ITEM_NAME_ALIASES: Record<string, string> = {
  Muramana: "Manaflow",
  "Bloodletter's Curse": "Blight",
  Fimbulwinter: "Eternity",
  "Sunfire Aegis": "Immolate",
  Sheen: "Spellblade",
  "Zhonya's Hourglass": "Stasis",
  "Mercurial Scimitar": "Mercurial",
  "Quicksilver Sash": "Quicksilver",
  "Maw of Malmortius": "Lifeline",
  "Winter's Approach": "Eternity",
};

function resolveGroupKey(group: string): string {
  return ITEM_NAME_ALIASES[group] ?? group;
}

function buildEntry(group: string): ItemWikiEntry {
  const key = resolveGroupKey(group);
  const meta = simMetaForGroup(key);
  const fetched = FETCHED.entries[key] ?? FETCHED.entries[group];
  const notes =
    fetched?.ok && fetched.notes.length > 0 ? fetched.notes : [];
  return {
    notes,
    wikiUrl: fetched?.wikiUrl ?? wikiPageUrl(key),
    wikiGaps: meta.wikiGaps,
    simStatus: meta.simStatus,
    fromWikiFetch: Boolean(fetched?.ok && fetched.notes.length > 0),
  };
}

/** All groups with sim meta or fetched notes. */
export function allWikiNoteGroups(): string[] {
  const keys = new Set<string>([
    ...Object.keys(ITEM_WIKI_SIM_META),
    ...Object.keys(FETCHED.entries),
  ]);
  return [...keys].sort();
}

export const ITEM_WIKI_NOTES: Record<string, ItemWikiEntry> = new Proxy(
  {} as Record<string, ItemWikiEntry>,
  {
    get(_target, prop: string) {
      if (prop === "then") return undefined;
      return buildEntry(prop);
    },
    ownKeys() {
      return allWikiNoteGroups();
    },
    getOwnPropertyDescriptor(_target, prop: string) {
      return {
        enumerable: true,
        configurable: true,
        value: buildEntry(prop),
      };
    },
  },
);

export function getItemWikiNotes(item: Item): ItemWikiEntry | undefined {
  const mech = item.getMechanicsGroup();
  const group = item.getGroupName();
  const baseName = item.name.replace(/\s*\([^)]*\)\s*$/, "").trim();

  for (const key of [
    mech,
    group,
    baseName,
    resolveGroupKey(mech),
    resolveGroupKey(group),
    resolveGroupKey(baseName),
  ]) {
    const entry = buildEntry(key);
    if (entry.notes.length > 0 || ITEM_WIKI_SIM_META[key]) {
      return entry;
    }
  }
  return buildEntry(mech);
}

export function getEquippedItemNotes(items: Item[]): string[] {
  const seen = new Set<string>();
  const notes: string[] = [];
  for (const item of items) {
    const key = item.getMechanicsGroup();
    if (seen.has(key)) continue;
    seen.add(key);
    const entry = getItemWikiNotes(item);
    if (entry) notes.push(...entry.notes);
  }
  return notes;
}

export function itemsMissingWikiNotes(items: Item[]): string[] {
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const key = item.getMechanicsGroup();
    if (seen.has(key)) continue;
    seen.add(key);
    const entry = getItemWikiNotes(item);
    if (!entry?.notes.length) missing.push(key);
  }
  return missing;
}

export function wikiNotesFetchedAt(): string {
  return FETCHED.generatedAt;
}
