/**
 * Maps Data Dragon / OP.GG item names to our internal Items[].name values.
 *
 * Our Items array uses variant suffixes like "(Base)", "(Melee)", "(Ranged)"
 * for items with multiple states. Data Dragon names are the "clean" versions.
 * This module bridges that gap and also provides basic stats for boots
 * (which aren't modeled in our Items array).
 */

import type { Item } from "@/app/actions/sim";
import { Items } from "@/app/actions/sim";

// ---------------------------------------------------------------------------
// Boot stats (HP, armor, MR only — we don't model boots as full Items)
// ---------------------------------------------------------------------------

export type BootStats = { hp: number; armor: number; mr: number };

const BOOT_STATS: Record<string, BootStats> = {
  "Berserker's Greaves": { hp: 0, armor: 0, mr: 0 },
  "Boots of Swiftness": { hp: 0, armor: 0, mr: 0 },
  "Ionian Boots of Lucidity": { hp: 0, armor: 0, mr: 0 },
  "Mercury's Treads": { hp: 0, armor: 0, mr: 20 },
  "Plated Steelcaps": { hp: 0, armor: 25, mr: 0 },
  "Sorcerer's Shoes": { hp: 0, armor: 0, mr: 0 },
  "Gluttonous Greaves": { hp: 0, armor: 0, mr: 0 },
  "Symbiotic Soles": { hp: 0, armor: 0, mr: 0 },
  "Synchronized Soles": { hp: 0, armor: 0, mr: 0 },
};

export function getBootStats(bootName: string): BootStats | undefined {
  return BOOT_STATS[bootName];
}

export function isBoot(name: string): boolean {
  return name in BOOT_STATS;
}

// ---------------------------------------------------------------------------
// Normalized lookup map: lowercase clean name → Item
// ---------------------------------------------------------------------------

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripVariantSuffix(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

const EXPLICIT_ALIASES: Record<string, string> = {
  "Blade of The Ruined King": "Blade of the Ruined King",
};

type ItemNameIndex = {
  byExactNorm: Map<string, Item>;
  byStrippedNorm: Map<string, Item>;
};

let _index: ItemNameIndex | null = null;

function getIndex(): ItemNameIndex {
  if (_index) return _index;

  const byExactNorm = new Map<string, Item>();
  const byStrippedNorm = new Map<string, Item>();

  for (const item of Items) {
    const norm = normalize(item.name);
    if (!byExactNorm.has(norm)) {
      byExactNorm.set(norm, item);
    }

    const stripped = normalize(stripVariantSuffix(item.name));
    if (!byStrippedNorm.has(stripped)) {
      byStrippedNorm.set(stripped, item);
    }
  }

  _index = { byExactNorm, byStrippedNorm };
  return _index;
}

// Component / non-completed items we can safely ignore
const KNOWN_COMPONENTS = new Set([
  "Dark Seal",
  "Tear of the Goddess",
  "Oblivion Orb",
  "Bramble Vest",
  "B. F. Sword",
  "Long Sword",
  "Amplifying Tome",
  "Needlessly Large Rod",
  "Pickaxe",
  "Blasting Wand",
  "Giant's Belt",
  "Chain Vest",
  "Negatron Cloak",
  "Cloth Armor",
  "Null-Magic Mantle",
  "Ruby Crystal",
  "Sapphire Crystal",
  "Recurve Bow",
  "Dagger",
  "Cloak of Agility",
  "Kircheis Shard",
  "Zeal",
  "Vampiric Scepter",
  "Serrated Dirk",
  "Hextech Alternator",
  "Bami's Cinder",
  "Tiamat",
  "Sheen",
  "Phage",
  "Executioner's Calling",
  "Hearthbound Axe",
  "Catalyst of Aeons",
  "Forbidden Idol",
  "Fiendish Codex",
  "Glacial Buckler",
  "Spectre's Cowl",
  "Warden's Mail",
  "Aegis of the Legion",
  "Chalice of Blessing",
  "Seeker's Armguard",
  "Verdant Barrier",
  "Winged Moonplate",
  "Haunting Guise",
  "Kindlegem",
  "Aether Wisp",
]);

/**
 * Resolve a Data Dragon item name to our internal Item object.
 * Returns null for boots, components, and truly unknown items.
 */
export function resolveItemByDDName(
  ddName: string,
  isMelee = true,
): Item | null {
  if (isBoot(ddName)) return null;

  // Check explicit alias first
  const aliased = EXPLICIT_ALIASES[ddName];
  if (aliased) {
    const idx = getIndex();
    const item = idx.byExactNorm.get(normalize(aliased));
    if (item) {
      // For melee/ranged variants, swap if needed
      if (!isMelee && aliased.includes("(Melee)")) {
        const rangedName = aliased.replace("(Melee)", "(Ranged)");
        const rangedItem = idx.byExactNorm.get(normalize(rangedName));
        if (rangedItem) return rangedItem;
      }
      return item;
    }
  }

  const idx = getIndex();

  // Try exact normalized match
  const exact = idx.byExactNorm.get(normalize(ddName));
  if (exact) return exact;

  // Try stripped match (removes variant suffixes from our Items names)
  const stripped = idx.byStrippedNorm.get(normalize(ddName));
  if (stripped) {
    // For melee/ranged: prefer the right one
    if (!isMelee && stripped.name.includes("(Melee)")) {
      const rangedName = stripped.name.replace("(Melee)", "(Ranged)");
      const rangedItem = idx.byExactNorm.get(normalize(rangedName));
      if (rangedItem) return rangedItem;
    }
    return stripped;
  }

  // Known component — silently skip
  if (KNOWN_COMPONENTS.has(ddName)) return null;

  return null;
}

/**
 * Extract HP/armor/MR contributions from an item build.
 * Uses our Items array for completed items and BOOT_STATS for boots.
 */
export function extractDefensiveStats(
  itemNames: string[],
  isMelee = true,
): { hp: number; armor: number; mr: number } {
  let hp = 0;
  let armor = 0;
  let mr = 0;

  for (const name of itemNames) {
    const boot = getBootStats(name);
    if (boot) {
      hp += boot.hp;
      armor += boot.armor;
      mr += boot.mr;
      continue;
    }

    const item = resolveItemByDDName(name, isMelee);
    if (!item) continue;

    const s = item.stats;
    hp += s.hp ?? 0;
    armor += s.armor ?? 0;
    mr += s.mr ?? 0;
  }

  return { hp, armor, mr };
}
