/**
 * Parses wiki Notes (stored in itemWikiNotes.ts) into sim behavior flags.
 */

import type { Item } from "@/app/actions/sim";
import {
  getEquippedItemNotes,
  getItemWikiNotes,
  type ItemWikiEntry,
} from "./itemWikiNotes";

export type EnergizeStackProfile = {
  stacksPerBasicAttack: number;
  stacksPer24Units: number;
  stacksPerOnHitAbility: number;
  hasGalvanize: boolean;
};

export type ItemInteractionFlags = {
  energize?: EnergizeStackProfile;
  /** Firmament / energized proc lands before triggering attack damage. */
  damageBeforeTriggeringHit: boolean;
  /** Bonus lethality applies before proc's own damage (Voltaic Firmament). */
  temporaryPenBeforeProcDamage: boolean;
  temporaryLethalitySeconds: number;
  temporaryLethalityMelee: number;
  temporaryLethalityRanged: number;
  /** Proc damage — does not trigger spell effects (documentation). */
  isProcDamage: boolean;
  /** ICD in seconds if parsed from notes. */
  icdSeconds?: number;
  /** On-hit abilities generate energize stacks. */
  onHitAbilitiesGenerateStacks: boolean;
  /** Non-champion damage cap (wikiGap for 1v1). */
  nonChampionDamageCap?: number;
};

const DEFAULT_FLAGS: ItemInteractionFlags = {
  damageBeforeTriggeringHit: false,
  temporaryPenBeforeProcDamage: false,
  temporaryLethalitySeconds: 0,
  temporaryLethalityMelee: 0,
  temporaryLethalityRanged: 0,
  isProcDamage: false,
  onHitAbilitiesGenerateStacks: false,
};

function notesText(notes: string[]): string {
  return notes.join(" ").toLowerCase();
}

export function parseEnergizeStackRate(
  notes: string[],
): EnergizeStackProfile | undefined {
  const text = notesText(notes);
  if (!text.includes("energiz") && !text.includes("galvanize")) return undefined;

  const aaMatch = text.match(/(\d+)\s*(?:_)?energize(?:_)?\s*stack/i);
  const stacksPerAA = aaMatch
    ? Number(aaMatch[1])
    : text.includes("6 energize") || text.includes("6 _energize")
      ? 6
      : 6;

  const moveMatch = text.match(/every\s+(\d+)\s+in-game units/i);
  const stacksPer24Units = moveMatch ? 1 / Number(moveMatch[1]) : 1 / 24;

  const onHitAbilityStacks = text.includes("on-hit effects will also generate")
    ? stacksPerAA
    : 0;

  const hasGalvanize =
    text.includes("galvanize") ||
    text.includes("abilities trigger") ||
    text.includes("abilities can trigger");

  return {
    stacksPerBasicAttack: stacksPerAA,
    stacksPer24Units,
    stacksPerOnHitAbility: onHitAbilityStacks,
    hasGalvanize,
  };
}

export function parseGalvanize(notes: string[]): boolean {
  const text = notesText(notes);
  return (
    text.includes("galvanize") ||
    text.includes("abilities trigger energized") ||
    text.includes("abilities can trigger energized")
  );
}

export function parseDamageOrdering(notes: string[]): boolean {
  const text = notesText(notes);
  return (
    text.includes("before the damage of the triggering") ||
    text.includes("applied before its own damage") ||
    text.includes("damage is applied before")
  );
}

export function parseTemporaryPen(notes: string[]): {
  beforeProc: boolean;
  seconds: number;
  melee: number;
  ranged: number;
} {
  const text = notesText(notes);
  const beforeProc =
    text.includes("lethality") &&
    (text.includes("before its own damage") ||
      text.includes("applied before its own damage"));
  const secMatch = text.match(/lethality for (\d+(?:\.\d+)?) seconds?/i);
  const seconds = secMatch ? Number(secMatch[1]) : 0;
  const meleeMatch = text.match(/melee\s+(\d+)[^0-9]*ranged\s+(\d+)/i);
  const melee = meleeMatch ? Number(meleeMatch[1]) : 0;
  const ranged = meleeMatch ? Number(meleeMatch[2]) : 0;
  return { beforeProc, seconds, melee, ranged };
}

export function parseItemICD(notes: string[]): number | undefined {
  const text = notesText(notes);
  const m =
    text.match(/once every (\d+(?:\.\d+)?) seconds?/i) ??
    text.match(/(\d+(?:\.\d+)?)\s*second icd/i) ??
    text.match(/icd[:\s]+(\d+(?:\.\d+)?)s/i);
  return m ? Number(m[1]) : undefined;
}

export function parseOnHitFromAbilities(notes: string[]): boolean {
  const text = notesText(notes);
  return (
    text.includes("on-hit effects will also generate") ||
    text.includes("hitting abilities that apply on-hit")
  );
}

export function parseStackCap(notes: string[]): number | undefined {
  const text = notesText(notes);
  const m = text.match(/capped at (\d+) against non-champions/i);
  return m ? Number(m[1]) : undefined;
}

export function parseItemInteractionFlags(notes: string[]): ItemInteractionFlags {
  const energize = parseEnergizeStackRate(notes);
  const tempPen = parseTemporaryPen(notes);
  const icd = parseItemICD(notes);

  return {
    ...DEFAULT_FLAGS,
    energize,
    damageBeforeTriggeringHit: parseDamageOrdering(notes),
    temporaryPenBeforeProcDamage: tempPen.beforeProc,
    temporaryLethalitySeconds: tempPen.seconds,
    temporaryLethalityMelee: tempPen.melee,
    temporaryLethalityRanged: tempPen.ranged,
    isProcDamage: notesText(notes).includes("proc damage"),
    icdSeconds: icd,
    onHitAbilitiesGenerateStacks: parseOnHitFromAbilities(notes),
    nonChampionDamageCap: parseStackCap(notes),
  };
}

/** Merge interaction flags from all equipped items' wiki notes. */
export function getEquippedItemInteractionFlags(
  items: Item[],
): ItemInteractionFlags {
  const notes = getEquippedItemNotes(items);
  const flags = parseItemInteractionFlags(notes);

  for (const item of items) {
    const entry = getItemWikiNotes(item);
    if (!entry) continue;
    const perItem = parseItemInteractionFlags(entry.notes);
    if (perItem.energize && !flags.energize) flags.energize = perItem.energize;
    if (perItem.damageBeforeTriggeringHit) flags.damageBeforeTriggeringHit = true;
    if (perItem.temporaryPenBeforeProcDamage) {
      flags.temporaryPenBeforeProcDamage = true;
      flags.temporaryLethalitySeconds = Math.max(
        flags.temporaryLethalitySeconds,
        perItem.temporaryLethalitySeconds,
      );
      flags.temporaryLethalityMelee = Math.max(
        flags.temporaryLethalityMelee,
        perItem.temporaryLethalityMelee,
      );
      flags.temporaryLethalityRanged = Math.max(
        flags.temporaryLethalityRanged,
        perItem.temporaryLethalityRanged,
      );
    }
    if (perItem.isProcDamage) flags.isProcDamage = true;
    if (perItem.onHitAbilitiesGenerateStacks) {
      flags.onHitAbilitiesGenerateStacks = true;
    }
    if (perItem.icdSeconds != null) {
      flags.icdSeconds = perItem.icdSeconds;
    }
  }

  return flags;
}

/** Keywords from wiki Notes that imply DPS-relevant or gap mechanics. */
export const ITEM_WIKI_DPS_KEYWORDS = [
  "energize",
  "galvanize",
  "firmament",
  "proc damage",
  "before the damage",
  "lethality",
  "on-hit",
  "once every",
  "icd",
  "spell shield",
  "structure",
  "cleave",
  "execute",
  "sheen",
  "spellblade",
] as const;

export function findUnparsedWikiKeywords(
  entry: ItemWikiEntry,
  flags: ItemInteractionFlags,
): string[] {
  const text = notesText([...entry.notes, ...(entry.wikiGaps ?? [])]);
  const unparsed: string[] = [];

  for (const kw of ITEM_WIKI_DPS_KEYWORDS) {
    if (!text.includes(kw)) continue;
    const covered =
      (kw === "energize" && flags.energize != null) ||
      (kw === "galvanize" && flags.energize?.hasGalvanize) ||
      (kw === "firmament" && flags.temporaryPenBeforeProcDamage) ||
      (kw === "proc damage" && flags.isProcDamage) ||
      (kw === "before the damage" && flags.damageBeforeTriggeringHit) ||
      (kw === "lethality" && flags.temporaryLethalitySeconds > 0) ||
      (kw === "on-hit" && flags.onHitAbilitiesGenerateStacks) ||
      (kw === "once every" && flags.icdSeconds != null) ||
      (kw === "icd" && flags.icdSeconds != null) ||
      (kw === "spell shield" && (entry.wikiGaps?.length ?? 0) > 0) ||
      (kw === "structure" && (entry.wikiGaps?.length ?? 0) > 0) ||
      (kw === "cleave" && (entry.wikiGaps?.length ?? 0) > 0) ||
      (kw === "execute" && entry.simStatus === "static") ||
      (kw === "sheen" || kw === "spellblade") ||
      entry.simStatus === "modeled" ||
      entry.simStatus === "static" ||
      entry.simStatus === "partial" ||
      entry.simStatus === "gap" ||
      entry.simStatus === "support";
    if (!covered) unparsed.push(kw);
  }

  return [...new Set(unparsed)];
}
