/**
 * Champion combat traits for matchup-aware build simulation.
 *
 * Derived from ability data in sim.ts plus wiki-audited overrides
 * (see scripts/wiki-mechanics-audit.ts). Powers Serpent's Fang value,
 * enemy EHP (shields), and spell-shield damage reduction.
 */

import {
  type Character,
  Characters,
  CHAMPION_ROTATION_PROFILES,
  championBaseStatsAtLevel,
  championSimKey,
  computeRotationHealHPS,
  resolveSimulationScenario,
  type SimulationScenario,
} from "@/app/actions/sim";
import { resolveItemByDDName } from "@/lib/itemNameMap";

export type ShieldKind = "physical" | "magic" | "any";

/** Wiki-audited corrections the structured ability rows do not capture. */
export type ChampionCombatTraitOverrides = {
  /** Flat physical shield pool typically active in a duel (HP). */
  extraPhysicalShieldPool?: number;
  /** Flat magic shield pool (HP). Serpent's Fang does not shred these. */
  extraMagicShieldPool?: number;
  /** Sustained physical shield re-application (HP/s). */
  extraPhysicalShieldHPS?: number;
  extraMagicShieldHPS?: number;
  /**
   * Fraction of ability damage lost to spell shields in a typical fight (0–1).
   * One blocked spell ≈ 1 / casts-per-window.
   */
  spellShieldBlockChance?: number;
  extraHealHPS?: number;
  /** Scale passive shield pool (flow shields are not always full). */
  passiveShieldPoolMultiplier?: number;
  /** Fraction of enemy projectile ability damage blocked in a duel. */
  projectileBlockUptime?: number;
  /** Wiki detail gaps still unmodeled in sim.ts */
  wikiGaps?: string[];
};

/**
 * Manual overrides from wiki "Details" sections. Expand via `npm run audit:wiki`.
 * Keys use championSimKey format (Khazix, LeeSin, …).
 */
export const CHAMPION_COMBAT_TRAIT_OVERRIDES: Record<
  string,
  ChampionCombatTraitOverrides
> = {
  Sivir: {
    spellShieldBlockChance: 0.22,
    wikiGaps: ["Ricochet can proc on spell-shielded targets differently"],
  },
  Nocturne: {
    spellShieldBlockChance: 0.18,
  },
  Fiora: {
    spellShieldBlockChance: 0.2,
    wikiGaps: ["Riposte stun vs channel interactions"],
  },
  Morgana: {
    extraMagicShieldPool: 280,
    extraMagicShieldHPS: 35,
    wikiGaps: ["Black Shield: magic-only; cleanses CC on application"],
  },
  Malzahar: {
    extraMagicShieldPool: 200,
    wikiGaps: ["Passive shield blocks one spell; 45s CD at 18"],
  },
  Lissandra: {
    extraPhysicalShieldPool: 0,
    wikiGaps: ["Self-R stasis heal scales with missing HP"],
  },
  Sett: {
    extraPhysicalShieldPool: 350,
    wikiGaps: ["Haymaker grey health → true damage conversion"],
  },
  Mordekaiser: {
    extraMagicShieldPool: 300,
    wikiGaps: ["Indestructible during R"],
  },
  Karma: {
    extraPhysicalShieldPool: 220,
    extraPhysicalShieldHPS: 28,
  },
  Janna: {
    extraPhysicalShieldPool: 200,
    extraPhysicalShieldHPS: 22,
  },
  Lulu: {
    extraPhysicalShieldPool: 240,
    extraPhysicalShieldHPS: 25,
  },
  Locke: {
    extraHealHPS: 28,
    wikiGaps: ["Soul Ignition grey health recast heal"],
  },
  Shen: {
    extraPhysicalShieldPool: 180,
    extraPhysicalShieldHPS: 20,
  },
  JarvanIV: {
    extraPhysicalShieldPool: 140,
    extraPhysicalShieldHPS: 35,
  },
  Ivern: {
    extraPhysicalShieldPool: 55,
    extraPhysicalShieldHPS: 18,
  },
  Rakan: {
    extraPhysicalShieldPool: 120,
    extraPhysicalShieldHPS: 15,
    extraHealHPS: 12,
  },
  Yone: {
    extraPhysicalShieldPool: 140,
    extraPhysicalShieldHPS: 18,
    wikiGaps: ["Spirit Cleave shield scales with bonus AD"],
  },
  Tryndamere: {
    extraPhysicalShieldPool: 200,
    wikiGaps: ["Undying R: cannot die for 5s (minimum 30 HP)"],
  },
  Kayle: {
    extraPhysicalShieldPool: 160,
    extraPhysicalShieldHPS: 18,
  },
  Yasuo: {
    passiveShieldPoolMultiplier: 0.55,
    projectileBlockUptime: 0.22,
    wikiGaps: ["Wind Wall blocks projectiles, not a sustain shield"],
  },
  Samira: {
    projectileBlockUptime: 0.12,
    wikiGaps: ["Blade Whirl blocks projectiles for 0.75s"],
  },
};

export type ChampionCombatTraits = {
  physicalShieldPool: number;
  magicShieldPool: number;
  physicalShieldHPS: number;
  magicShieldHPS: number;
  rotationHealHPS: number;
  /** 0–1: fraction of ability damage negated by spell shields. */
  spellShieldBlockChance: number;
  /** 0–100: how much Serpent's Fang / anti-shield items matter vs this kit. */
  antiShieldScore: number;
  /** 0–1: fraction of projectile ability damage blocked (Wind Wall, etc.). */
  projectileBlockUptime: number;
  sources: string[];
};

const SPELL_SHIELD_ITEM_GROUPS = new Set(["Annul"]);

function abilityNotes(ability: Character["Abilities"][number]): string {
  return [
    ability.description,
    ...(ability.specialMechanics ?? []),
  ]
    .join(" ")
    .toLowerCase();
}

function shieldKindFromNotes(notes: string): ShieldKind {
  if (
    notes.includes("magic damage only") ||
    notes.includes("magic shield") ||
    notes.includes("black shield")
  ) {
    return "magic";
  }
  if (notes.includes("physical shield") || notes.includes("physical damage only")) {
    return "physical";
  }
  return "any";
}

function isPercentMaxHpShield(notes: string, raw: number): boolean {
  if (notes.includes("% max hp") || notes.includes("% max health")) return true;
  if (notes.includes("% of max hp") || notes.includes("% of max health")) {
    return true;
  }
  if (
    notes.includes("max hp") &&
    raw > 0 &&
    raw <= 30 &&
    !notes.includes("shield:")
  ) {
    return true;
  }
  return false;
}

function abilityRankForShield(
  champion: Character,
  ability: Character["Abilities"][number],
  level: number,
): number {
  if (ability.abilityType === "passive") return level;
  if (ability.abilityType === "R") return Math.min(3, Math.max(1, level >= 11 ? 3 : level >= 6 ? 2 : 1));
  if (level >= 13) return 5;
  if (level >= 7) return 3;
  return 1;
}

function parseShieldAmount(
  ability: Character["Abilities"][number],
  rank: number,
  maxHP: number,
): { amount: number; kind: ShieldKind } {
  const shieldVal = ability.effects?.shield;
  if (shieldVal == null) return { amount: 0, kind: "any" };
  const notes = abilityNotes(ability);
  const kind = shieldKindFromNotes(notes);
  let raw = ability.getValueAtLevel(shieldVal, rank);
  if (isPercentMaxHpShield(notes, raw)) {
    raw = (maxHP * raw) / 100;
  }
  return { amount: Math.max(0, raw), kind };
}

/** Sustained shield HPS from rotation-weighted ability shields. */
export function computeRotationShieldHPS(
  champion: Character,
  maxHP: number,
  level: number = 18,
  enableRotationProfiles = true,
): { physical: number; magic: number; sources: string[] } {
  const rot = enableRotationProfiles
    ? CHAMPION_ROTATION_PROFILES[championSimKey(champion.Name)]
    : undefined;
  let physical = 0;
  let magic = 0;
  const sources: string[] = [];

  for (const ability of champion.Abilities) {
    if (!ability.effects?.shield) continue;
    if (ability.abilityType === "passive") continue;
    const rank = abilityRankForShield(champion, ability, level);
    const { amount, kind } = parseShieldAmount(ability, rank, maxHP);
    if (amount <= 0) continue;

    const rotW =
      rot?.abilityTypeMultiplier?.[ability.abilityType as "Q" | "W" | "E" | "R"] ??
      1;

    let cd = 8;
    if (ability.cooldown.cooldownType === "static") {
      cd = ability.getValueAtLevel(ability.cooldown.cooldown, rank);
    } else {
      const baseCd = ability.getValueAtLevel(ability.cooldown.cooldown, rank);
      cd = Math.max(baseCd, ability.castInfo?.castTime ?? 0.5);
    }

    const hps = (amount * rotW) / Math.max(cd, 1);
    if (kind === "magic") {
      magic += hps;
      sources.push(`${ability.name}: ${hps.toFixed(0)} magic shield HPS`);
    } else {
      physical += hps;
      sources.push(`${ability.name}: ${hps.toFixed(0)} phys shield HPS`);
    }
  }

  return { physical, magic, sources };
}

/** Passive / static shield pool assumed active at fight start. */
export function estimatePassiveShieldPool(
  champion: Character,
  maxHP: number,
  level: number = 18,
): { physical: number; magic: number } {
  let physical = 0;
  let magic = 0;

  for (const ability of champion.Abilities) {
    if (!ability.effects?.shield) continue;
    const rank = abilityRankForShield(champion, ability, level);
    const { amount, kind } = parseShieldAmount(ability, rank, maxHP);
    if (amount <= 0) continue;

    const isPassive = ability.abilityType === "passive";
    const notes = abilityNotes(ability);
    const staticRecharge =
      ability.cooldown.cooldownType === "static" ||
      notes.includes("recharge") ||
      isPassive;

    if (!staticRecharge && ability.abilityType !== "passive") continue;

    const poolShare = isPassive ? 0.85 : 0.45;
    const pool = amount * poolShare;
    if (kind === "magic") magic += pool;
    else physical += pool;
  }

  return { physical, magic };
}

/** Spell-shield block chance from enemy completed items (Banshee's, Edge of Night). */
export function spellShieldBlockChanceFromItems(
  itemNames: string[],
  isMelee = true,
  fightSeconds = 8,
): number {
  let hasSpellShieldItem = false;
  for (const name of itemNames) {
    const item = resolveItemByDDName(name, isMelee);
    if (!item) continue;
    if (SPELL_SHIELD_ITEM_GROUPS.has(item.getGroupName())) {
      hasSpellShieldItem = true;
      break;
    }
  }
  if (!hasSpellShieldItem) return 0;
  // Annul: blocks next ability; ~1 spell per fight window in 1v1.
  const castsPerWindow = Math.max(3, fightSeconds * 0.75);
  return Math.min(0.35, 1 / castsPerWindow);
}

export function computeChampionCombatTraits(
  champion: Character,
  options?: {
    level?: number;
    maxHP?: number;
    stats?: ReturnType<Character["getTotalStats"]>;
    simulation?: SimulationScenario;
  },
): ChampionCombatTraits {
  const sim = resolveSimulationScenario(options?.simulation);
  const level = options?.level ?? sim.level;
  const base = championBaseStatsAtLevel(champion, level);
  const stats = options?.stats ?? champion.getTotalStats(level);
  const maxHP = options?.maxHP ?? stats.hp;
  const key = championSimKey(champion.Name);
  const overrides = CHAMPION_COMBAT_TRAIT_OVERRIDES[key];

  const passivePool = estimatePassiveShieldPool(champion, maxHP, level);
  const rotShield = computeRotationShieldHPS(
    champion,
    maxHP,
    level,
    sim.enableChampionRotationProfiles,
  );

  let physicalShieldPool =
    passivePool.physical * (overrides?.passiveShieldPoolMultiplier ?? 1) +
    (overrides?.extraPhysicalShieldPool ?? 0);
  let magicShieldPool =
    passivePool.magic * (overrides?.passiveShieldPoolMultiplier ?? 1) +
    (overrides?.extraMagicShieldPool ?? 0);
  let physicalShieldHPS =
    rotShield.physical + (overrides?.extraPhysicalShieldHPS ?? 0);
  let magicShieldHPS =
    rotShield.magic + (overrides?.extraMagicShieldHPS ?? 0);

  const rotationHealHPS =
    computeRotationHealHPS(champion, stats, sim, level) +
    (overrides?.extraHealHPS ?? 0);

  let spellShieldBlockChance = overrides?.spellShieldBlockChance ?? 0;
  let projectileBlockUptime = overrides?.projectileBlockUptime ?? 0;

  const rot = sim.enableChampionRotationProfiles
    ? CHAMPION_ROTATION_PROFILES[championSimKey(champion.Name)]
    : undefined;
  for (const ability of champion.Abilities) {
    const notes = abilityNotes(ability);
    if (
      !notes.includes("blocks projectiles") &&
      !notes.includes("blocks all enemy projectiles")
    ) {
      continue;
    }
    const duration = ability.effects?.duration ?? 3;
    const rank = abilityRankForShield(champion, ability, level);
    let cd = 18;
    if (ability.cooldown.cooldownType === "static") {
      cd = ability.getValueAtLevel(ability.cooldown.cooldown, rank);
    } else {
      cd = Math.max(
        ability.getValueAtLevel(ability.cooldown.cooldown, rank),
        1,
      );
    }
    const rotW =
      rot?.abilityTypeMultiplier?.[ability.abilityType as "Q" | "W" | "E" | "R"] ??
      1;
    const parsedUptime = Math.min(0.28, (duration / cd) * rotW * 0.85);
    projectileBlockUptime = Math.max(projectileBlockUptime, parsedUptime);
  }

  const sources = [
    ...rotShield.sources,
    ...(overrides?.extraPhysicalShieldPool
      ? [`override: +${overrides.extraPhysicalShieldPool} phys shield pool`]
      : []),
    ...(overrides?.extraMagicShieldPool
      ? [`override: +${overrides.extraMagicShieldPool} magic shield pool`]
      : []),
  ];

  // Fight-length-averaged shield pool from reapplication.
  const fightSec = 8;
  physicalShieldPool += physicalShieldHPS * fightSec * 0.35;
  magicShieldPool += magicShieldHPS * fightSec * 0.35;

  const totalShield = physicalShieldPool + magicShieldPool;
  const antiShieldScore = Math.min(
    100,
    physicalShieldPool / 12 +
      physicalShieldHPS * 2.5 +
      magicShieldPool * 0.15,
  );

  return {
    physicalShieldPool,
    magicShieldPool,
    physicalShieldHPS,
    magicShieldHPS,
    rotationHealHPS,
    spellShieldBlockChance,
    antiShieldScore,
    projectileBlockUptime,
    sources,
  };
}

export type AggregatedEnemyCombatTraits = {
  targetPhysicalShieldEHP: number;
  targetMagicShieldEHP: number;
  targetSpellShieldBlockChance: number;
  targetProjectileBlockChance: number;
  avgAntiShieldScore: number;
  avgRotationHealHPS: number;
};

export function aggregateEnemyCombatTraits(
  enemies: Array<{
    champion: string;
    maxHP: number;
    items?: string[];
    isMelee?: boolean;
  }>,
  fightSeconds = 8,
): AggregatedEnemyCombatTraits {
  if (enemies.length === 0) {
    return {
      targetPhysicalShieldEHP: 0,
      targetMagicShieldEHP: 0,
      targetSpellShieldBlockChance: 0,
      targetProjectileBlockChance: 0,
      avgAntiShieldScore: 0,
      avgRotationHealHPS: 0,
    };
  }

  let phys = 0;
  let magic = 0;
  let spell = 0;
  let projectile = 0;
  let anti = 0;
  let heal = 0;

  for (const enemy of enemies) {
    const champ = Characters.find((c) => c.Name === enemy.champion);
    if (!champ) continue;
    const traits = computeChampionCombatTraits(champ, { maxHP: enemy.maxHP });
    phys += traits.physicalShieldPool;
    magic += traits.magicShieldPool;
    heal += traits.rotationHealHPS;
    anti += traits.antiShieldScore;
    projectile += traits.projectileBlockUptime;

    const itemSpell = spellShieldBlockChanceFromItems(
      enemy.items ?? [],
      enemy.isMelee ?? champ.AttackRange <= 250,
      fightSeconds,
    );
    spell += Math.max(traits.spellShieldBlockChance, itemSpell);
  }

  const n = enemies.length;
  return {
    targetPhysicalShieldEHP: Math.round(phys / n),
    targetMagicShieldEHP: Math.round(magic / n),
    targetSpellShieldBlockChance: Math.min(0.45, spell / n),
    targetProjectileBlockChance: Math.min(0.4, projectile / n),
    avgAntiShieldScore: anti / n,
    avgRotationHealHPS: heal / n,
  };
}

/** Champions with high shield scores that lack wiki overrides (audit candidates). */
export function championsNeedingWikiAudit(): Array<{
  name: string;
  antiShieldScore: number;
  physicalShieldPool: number;
  hasOverride: boolean;
  wikiGaps: string[];
}> {
  const out: Array<{
    name: string;
    antiShieldScore: number;
    physicalShieldPool: number;
    hasOverride: boolean;
    wikiGaps: string[];
  }> = [];

  for (const champ of Characters) {
    const traits = computeChampionCombatTraits(champ);
    const key = championSimKey(champ.Name);
    const overrides = CHAMPION_COMBAT_TRAIT_OVERRIDES[key];
    const hasOverride = overrides != null;
    const wikiGaps = overrides?.wikiGaps ?? [];

    if (traits.antiShieldScore >= 25 || traits.spellShieldBlockChance > 0) {
      out.push({
        name: champ.Name,
        antiShieldScore: traits.antiShieldScore,
        physicalShieldPool: traits.physicalShieldPool,
        hasOverride,
        wikiGaps,
      });
    }
  }

  return out.sort((a, b) => b.antiShieldScore - a.antiShieldScore);
}
