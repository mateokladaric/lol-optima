/**
 * 1v1-oriented build recommendations: balances damage and survivability instead of raw DPS-only.
 *
 * Primary search: **simulated annealing** (Metropolis MCMC) over valid 6-item loadouts,
 * seeded from a greedy build — explores non-local item synergies better than greedy alone.
 * This is not exhaustive and does not produce a proof of global optimality; raising
 * `iterationsPerRestart` / `restarts` tightens the high-probability region of the score.
 */

import type {
  Character,
  Item,
  Rune,
  RunePage,
  SimulationScenario,
} from "@/app/actions/sim";
import {
  AllKeystones,
  BLENDED_DPS_COMBO_WEIGHT,
  getChampionComboProfile,
  Characters,
  championApAdScalingScores,
  championIncomingPhysShare,
  championSimKey,
  championUsesApScaling,
  championUsesMana,
  computeChampionCursedWeights,
  computeHealthRegenHPS,
  computeRotationHealHPS,
  formatCursedStatLean,
  type ChampionCursedWeights,
  type CursedStatId,
  isManaScalingItem,
  itemOnHitScaleForChampion,
  Item as ItemModel,
  Items,
  resolveChampionSimulation,
  resolveSimulationScenario,
} from "@/app/actions/sim";
import { goldEfficiencyTieBreak, totalBuildGold } from "@/lib/itemGold";
import { resolveItemByDDName } from "@/lib/itemNameMap";
import {
  aggregateEnemyCombatTraits,
} from "@/lib/championCombatTraits";
import {
  greedyPurchaseOrder,
  opponentAtPurchaseStep,
} from "@/lib/purchaseOrder";
import { extractDefensiveStats } from "@/lib/itemNameMap";
import {
  canAddItemToBuild,
  isValidFullBuild,
} from "@/lib/itemExclusiveGroups";

export type { SimulationScenario };

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

const REALISTIC_PAREN_ALLOWED = new Set(["base", "melee", "ranged"]);

/** On-hit/AS items that stay weak even with itemOnHitScale — omit for spell-heavy champions. */
const ON_HIT_FARM_GROUPS = new Set([
  "Terminus",
  "Guinsoo's Rageblade",
  "Runaan's Hurricane",
  "Navori Flickerblade",
  "Phantom Dancer",
]);

/** AP mythics/actives whose DPS is item magic, not champion AP scaling. */
const AP_CARRY_ITEM_GROUPS = new Set([
  "Stormsurge",
  "Luden's Echo",
  "Hextech Rocketbelt",
  "Hextech Gunblade",
  "Rabadon's Deathcap",
  "Liandry's Torment",
  "Malignance",
  "Blackfire Torch",
  "Riftmaker",
  "Cryptbloom",
  "Morellonomicon",
  "Void Staff",
  "Shadowflame",
  "Lich Bane",
  "Nashor's Tooth",
  "Rylai's Crystal Scepter",
  "Zhonya's Hourglass",
  "Banshee's Veil",
  "Crown of the Shattered Queen",
  "Rod of Ages",
  "Mejai's Soulstealer",
]);

function isApCarryItem(item: Item): boolean {
  if (AP_CARRY_ITEM_GROUPS.has(item.getGroupName())) return true;
  const s = item.stats;
  if (
    (s.abilityDamageMultiplicative ?? 0) > 0 ||
    s.abilityDamagePerManaMultiplicative ||
    s.physicalOnAbilityHitMaxManaPercent ||
    s.physicalOnHitMaxManaPercent ||
    s.adPerMaxManaPercent
  ) {
    return false;
  }
  const lethality = s.lethality ?? 0;
  const ad = s.ad ?? 0;
  const adMult = s.adMultiplicative ?? 0;
  if (lethality >= 8 || ad >= 40 || adMult >= 8) return false;
  const ap = s.ap ?? 0;
  if (ap >= 70) return true;
  return false;
}

function isMeleeChampion(champion: Character): boolean {
  return champion.AttackRange <= 250;
}

function parenToken(name: string): string | null {
  const m = name.match(/\(([^)]+)\)/);
  return m ? m[1].trim().toLowerCase() : null;
}

function isRealisticName(name: string): boolean {
  const token = parenToken(name);
  if (!token) return true;
  if (!REALISTIC_PAREN_ALLOWED.has(token)) return false;
  return true;
}

function candidatePriority(item: Item, melee: boolean): number {
  const token = parenToken(item.name);
  let score = 0;

  if (!token) score += 6;
  // Prefer melee/ranged variants over generic (Base) for melee/ranged champions.
  if (token === "base") score += melee ? 4 : 10;
  if (token === "melee") score += melee ? 10 : -6;
  if (token === "ranged") score += melee ? -6 : 8;

  // Keep stable tie-breaking close to baseline rows.
  if (item.name.includes("(Base)")) score += 2;
  if (item.name.includes("(Melee)")) score += melee ? 2 : -1;
  if (item.name.includes("(Ranged)")) score += melee ? -1 : 2;
  return score;
}

/** Pool uses base item rows; passive math lives in itemMechanics + calculateDPS. */
export function applyRealisticApproximation(item: Item, _melee: boolean): Item {
  return item;
}

/** Per-profile sim tweaks: spell-only scoring assumes no autos / no on-hit cadence. */
function mergeProfileSimulation(
  profile: BuildProfileId,
  champion: Character,
  simulation: SimulationScenario | undefined,
): SimulationScenario {
  const base = resolveChampionSimulation(champion, simulation);
  if (profile === "spell" || profile === "ability_burst") {
    return { ...base, spellOnlyNoAutos: true };
  }
  return base;
}

export function buildRealisticItemPool(champion: Character, itemPool: Item[]): Item[] {
  const melee = isMeleeChampion(champion);
  const grouped = new Map<string, Item[]>();

  const usesMana = championUsesMana(champion);
  const usesAp = championUsesApScaling(champion);

  for (const item of itemPool) {
    if (!isRealisticName(item.name)) continue;
    if (!usesMana && isManaScalingItem(item)) continue;
    if (!usesAp && isApCarryItem(item)) continue;
    const group = item.getGroupName();
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group)?.push(item);
  }

  const selected: Item[] = [];
  for (const [, candidates] of grouped) {
    let best = candidates[0];
    let bestScore =
      candidatePriority(best, melee) * 1000 +
      goldEfficiencyTieBreak(best) * 120;
    for (let i = 1; i < candidates.length; i++) {
      const cand = candidates[i];
      const sc =
        candidatePriority(cand, melee) * 1000 +
        goldEfficiencyTieBreak(cand) * 120;
      if (sc > bestScore) {
        best = cand;
        bestScore = sc;
      }
    }
    selected.push(applyRealisticApproximation(best, melee));
  }

  const onHitScale = itemOnHitScaleForChampion(champion.Name);
  if (onHitScale < 0.5) {
    return selected.filter((item) => !ON_HIT_FARM_GROUPS.has(item.getGroupName()));
  }

  return selected;
}

function itemPoolForProfile(
  _champion: Character,
  realisticPool: Item[],
  _profile: BuildProfileId,
): Item[] {
  return realisticPool;
}

export type ResolvedDuel = {
  /** Opponent max HP — drives %HP ratios and on-hit assumptions in DPS. */
  targetMaxHP: number;
  /** Opponent bonus HP over base — affects effects like % bonus HP damage. */
  targetBonusHP: number;
  /** Share of damage you expect to take as physical (rest magic); weights your effective HP. */
  incomingPhysShare: number;
  /** Opponent armor — physical damage mitigation (lethality / % pen apply). */
  targetArmor: number;
  /** Opponent magic resist — magic damage mitigation. */
  targetMR: number;
  /** Avg physical shield EHP on opponents (Serpent's Fang counter-value). */
  targetPhysicalShieldEHP: number;
  /** Avg magic shield EHP on opponents (not shredded by Serpent's). */
  targetMagicShieldEHP: number;
  /** 0–1: fraction of ability damage blocked by enemy spell shields. */
  targetSpellShieldBlockChance: number;
  /** 0–1: fraction of projectile ability damage blocked (Wind Wall, Samira W). */
  targetProjectileBlockChance: number;
  /** Enemy grievous wounds — reduces attacker in-combat healing (0–100). */
  targetHealReductionPercent: number;
  /**
   * When set, fixes combo/fight window instead of deriving from time-to-kill.
   * Scripts may pass `LOLOPTIMA_COMBO_WINDOW` to force a value.
   */
  comboWindowSeconds?: number;
};

export type DuelAssumptions = Partial<ResolvedDuel>;

const DEFAULT_DUEL: ResolvedDuel = {
  targetMaxHP: 3000,
  targetBonusHP: 1000,
  incomingPhysShare: 0.5,
  targetArmor: 100,
  targetMR: 100,
  targetPhysicalShieldEHP: 0,
  targetMagicShieldEHP: 0,
  targetSpellShieldBlockChance: 0,
  targetProjectileBlockChance: 0,
  targetHealReductionPercent: 0,
};

/** Opponent HP pool for TTK (HP + shields). */
export function effectiveTargetHP(duel: ResolvedDuel): number {
  return (
    duel.targetMaxHP +
    duel.targetPhysicalShieldEHP +
    duel.targetMagicShieldEHP
  );
}

/** Duel assumptions for `npm run compute-meta` / Meta Analysis (squishy carry reference). */
export const META_DUEL_DEFAULTS: ResolvedDuel = {
  targetMaxHP: 3000,
  targetBonusHP: 0,
  incomingPhysShare: 0.5,
  targetArmor: 150,
  targetMR: 150,
  targetPhysicalShieldEHP: 0,
  targetMagicShieldEHP: 0,
  targetSpellShieldBlockChance: 0,
  targetProjectileBlockChance: 0,
  targetHealReductionPercent: 0,
};

/** Lower bound for TTK-derived fight length (seconds). */
export const FIGHT_DURATION_MIN = 1.5;
/** Upper bound for TTK-derived fight length (seconds). */
export const FIGHT_DURATION_MAX = 25;
/** Seed window before the first TTK iteration. */
export const SEED_FIGHT_DURATION = 6;

export function resolveDuel(overrides?: DuelAssumptions): ResolvedDuel {
  return {
    targetMaxHP: clamp(
      overrides?.targetMaxHP ?? DEFAULT_DUEL.targetMaxHP,
      400,
      12000,
    ),
    targetBonusHP: clamp(
      overrides?.targetBonusHP ?? DEFAULT_DUEL.targetBonusHP,
      0,
      8000,
    ),
    incomingPhysShare: clamp(
      overrides?.incomingPhysShare ?? DEFAULT_DUEL.incomingPhysShare,
      0,
      1,
    ),
    targetArmor: clamp(
      overrides?.targetArmor ?? DEFAULT_DUEL.targetArmor,
      0,
      500,
    ),
    targetMR: clamp(overrides?.targetMR ?? DEFAULT_DUEL.targetMR, 0, 500),
    targetPhysicalShieldEHP: clamp(
      overrides?.targetPhysicalShieldEHP ??
        DEFAULT_DUEL.targetPhysicalShieldEHP,
      0,
      4000,
    ),
    targetMagicShieldEHP: clamp(
      overrides?.targetMagicShieldEHP ?? DEFAULT_DUEL.targetMagicShieldEHP,
      0,
      4000,
    ),
    targetSpellShieldBlockChance: clamp(
      overrides?.targetSpellShieldBlockChance ??
        DEFAULT_DUEL.targetSpellShieldBlockChance,
      0,
      0.5,
    ),
    targetProjectileBlockChance: clamp(
      overrides?.targetProjectileBlockChance ??
        DEFAULT_DUEL.targetProjectileBlockChance,
      0,
      0.4,
    ),
    targetHealReductionPercent: clamp(
      overrides?.targetHealReductionPercent ??
        DEFAULT_DUEL.targetHealReductionPercent,
      0,
      100,
    ),
    comboWindowSeconds:
      overrides?.comboWindowSeconds != null
        ? clamp(overrides.comboWindowSeconds, 1, 30)
        : undefined,
  };
}

/** Short all-in window for flat-pen burst profiles (seconds). */
export const FULL_LETHALITY_COMBO_WINDOW_SEC = 3.5;

export function isBurstDamageProfile(profile: BuildProfileId): boolean {
  return (
    profile === "glass" ||
    profile === "ability_burst" ||
    profile === "full_lethality"
  );
}

/** AD physical kits only — AP mages skip the full lethality archetype. */
export function championEligibleForFullLethality(champion: Character): boolean {
  const level = 18;
  const physShare = championIncomingPhysShare(champion, level);
  const { adScore, apScore } = championApAdScalingScores(champion, level);
  if (physShare < 0.48) return false;
  if (apScore > adScore * 1.15) return false;
  return adScore >= 35;
}

export function fightDurationOptionsForProfile(
  profile: BuildProfileId,
  duel: ResolvedDuel,
  defaultIterations = 2,
): FightDurationOptions {
  if (duel.comboWindowSeconds != null) {
    return {
      comboWindowSecondsOverride: duel.comboWindowSeconds,
      iterations: 0,
    };
  }
  if (profile === "full_lethality") {
    return {
      comboWindowSecondsOverride: FULL_LETHALITY_COMBO_WINDOW_SEC,
      iterations: 0,
    };
  }
  return { iterations: defaultIterations };
}

function offensiveDpsRate(
  dps: ReturnType<Character["calculateDPS"]>,
  profile: BuildProfileId,
): number {
  switch (profile) {
    case "glass":
    case "ability_burst":
    case "full_lethality":
      return dps.comboDPS;
    default:
      return dps.totalDPS;
  }
}

/** Fight length (seconds) from opponent time-to-kill at the build's offensive DPS. */
export function deriveFightDurationSeconds(
  dps: ReturnType<Character["calculateDPS"]>,
  targetMaxHP: number,
  profile: BuildProfileId,
  targetShieldEHP = 0,
): number {
  const rate = offensiveDpsRate(dps, profile);
  const enemyTTD = (targetMaxHP + targetShieldEHP) / Math.max(rate, 1);
  return clamp(enemyTTD, FIGHT_DURATION_MIN, FIGHT_DURATION_MAX);
}

export type FightDurationOptions = {
  /** Skips TTK derivation and uses this window. */
  comboWindowSecondsOverride?: number;
  /** TTK refinement passes after the seed window (default 2). */
  iterations?: number;
  seedSeconds?: number;
};

/**
 * Run {@link Character.calculateDPS} with a fight window derived from TTK (Option A).
 * Burst profiles use combo DPS; others use blended total DPS for the TTK estimate.
 */
export function calculateDpsWithFightDuration(
  champion: Character,
  targetMaxHP: number,
  targetBonusHP: number,
  simulation: SimulationScenario | undefined,
  mitigation: ReturnType<typeof dpsMitigationFromDuel>,
  profile: BuildProfileId,
  options?: FightDurationOptions,
): {
  dps: ReturnType<Character["calculateDPS"]>;
  fightDurationSeconds: number;
} {
  const shieldEHP =
    mitigation.targetPhysicalShieldEHP + mitigation.targetMagicShieldEHP;
  if (options?.comboWindowSecondsOverride != null) {
    const window = clamp(options.comboWindowSecondsOverride, 1, 30);
    const dps = champion.calculateDPS(
      targetMaxHP,
      targetBonusHP,
      simulation,
      { ...mitigation, comboWindowSeconds: window },
    );
    return { dps, fightDurationSeconds: window };
  }

  const iterations = options?.iterations ?? 2;
  let window = options?.seedSeconds ?? SEED_FIGHT_DURATION;
  let dps = champion.calculateDPS(
    targetMaxHP,
    targetBonusHP,
    simulation,
    { ...mitigation, comboWindowSeconds: window },
  );

  for (let i = 0; i < iterations; i++) {
    const next = deriveFightDurationSeconds(
      dps,
      targetMaxHP,
      profile,
      shieldEHP,
    );
    if (Math.abs(next - window) < 0.2) {
      window = next;
      break;
    }
    window = next;
    dps = champion.calculateDPS(
      targetMaxHP,
      targetBonusHP,
      simulation,
      { ...mitigation, comboWindowSeconds: window },
    );
  }

  return { dps, fightDurationSeconds: window };
}

/** Arguments for {@link Character.calculateDPS} from duel assumptions. */
export function dpsMitigationFromDuel(
  duel: ResolvedDuel,
  fightDurationSeconds?: number,
) {
  const window =
    fightDurationSeconds ??
    duel.comboWindowSeconds ??
    SEED_FIGHT_DURATION;
  return {
    targetArmor: duel.targetArmor,
    targetMR: duel.targetMR,
    comboWindowSeconds: window,
    targetPhysicalShieldEHP: duel.targetPhysicalShieldEHP,
    targetMagicShieldEHP: duel.targetMagicShieldEHP,
    targetSpellShieldBlockChance: duel.targetSpellShieldBlockChance,
    targetProjectileBlockChance: duel.targetProjectileBlockChance,
  };
}

/** Level-18 baseline resist before item scaling (opponent with no completed items). */
export const PURCHASE_OPPONENT_BASE_ARMOR = 48;
export const PURCHASE_OPPONENT_BASE_MR = 30;

/** Pen items (Serylda, LDR) are weak when enemy armor is still low. */
export function armorPenPurchaseScale(targetArmor: number): number {
  if (targetArmor >= 95) return 1;
  if (targetArmor <= 50) return 0.5;
  return 0.5 + (0.5 * (targetArmor - 50)) / 45;
}

export function isMajorArmorPenItem(item: Item): boolean {
  return (item.stats.armorPen ?? 0) >= 20 || (item.stats.lethality ?? 0) >= 15;
}

/**
 * Mitigation for buy-order steps: opponent has the same number of completed items
 * as you, not a full 6-item duel. Avoids ranking Serylda/Void Staff first while
 * enemy armor/MR are still low.
 */
export function dpsMitigationForPurchaseStep(
  duel: ResolvedDuel,
  buyerCompletedItems: number,
  fullBuildSlots = 6,
  /**
   * Enemy completed items for this comparison. Defaults to buyer count.
   * For buy-order marginals, pass `ordered.length` so the first purchase is
   * scored vs baseline armor (0 items), not vs 1-item enemy armor.
   */
  enemyCompletedItems?: number,
) {
  const step = opponentAtPurchaseStep(
    duel,
    buyerCompletedItems,
    fullBuildSlots,
    enemyCompletedItems,
  );
  return {
    targetArmor: step.targetArmor,
    targetMR: step.targetMR,
  };
}

const cursedWeightsCache = new Map<string, ChampionCursedWeights>();

function getChampionCursedWeights(champion: Character): ChampionCursedWeights {
  const key = championSimKey(champion.Name);
  const hit = cursedWeightsCache.get(key);
  if (hit) return hit;
  const weights = computeChampionCursedWeights(champion);
  cursedWeightsCache.set(key, weights);
  return weights;
}

function scoreCursedStatBundle(
  stats: ReturnType<Character["getTotalStats"]>,
  weights: ChampionCursedWeights,
): number {
  const haste =
    (stats.abilityHaste ?? 0) +
    (stats.basicAbilityHaste ?? 0) * 0.55 +
    (stats.ultAbilityHaste ?? 0) * 0.35;
  const mana = stats.mana ?? 0;
  const moveSpeed =
    (stats.msPercent ?? 0) + Math.max(0, (stats.ms ?? 0) - 325) * 0.35;
  const attackSpeed = stats.attackSpeed ?? 0;
  const crit =
    (stats.critChance ?? 0) + Math.max(0, (stats.critDmg ?? 175) - 175) * 0.12;
  const healShield =
    (stats.shieldValue ?? 0) / 12 +
    (stats.healthRegen ?? 0) * 0.45 +
    (stats.manaRegen ?? 0) * 0.08;
  const omnivamp = (stats.lifeSteal ?? 0) + (stats.omnivamp ?? 0);
  const abilityAmp =
    (stats.abilityDamageMultiplicative ?? 0) +
    (stats.apMultiplicative ?? 0) +
    (stats.adMultiplicative ?? 0) * 0.35;
  const manaScale =
    (stats.adPerMaxManaPercent ?? 0) * (mana / 120) +
    (stats.apPerBonusManaPercent ?? 0) * (mana / 120) +
    (stats.hpPerBonusManaPercent ?? 0) * (mana / 200) +
    (stats.abilityDamagePerManaMultiplicative ?? 0) * (mana / 450) +
    (stats.physicalOnHitMaxManaPercent ?? 0) +
    (stats.physicalOnAbilityHitMaxManaPercent ?? 0) +
    (stats.apPerManaRegenMultiplicative ?? 0) * 0.5;

  const components: Record<CursedStatId, number> = {
    abilityHaste: Math.log1p(haste / 14) * 26,
    mana: Math.log1p(mana / 350) * 20,
    moveSpeed: Math.log1p(moveSpeed / 7) * 22,
    attackSpeed: Math.log1p(attackSpeed / 22) * 24,
    crit: Math.log1p(Math.max(0, crit) / 14) * 21,
    healShield: Math.log1p(Math.max(0, healShield) / 7) * 20,
    omnivamp: Math.log1p(Math.max(0, omnivamp) / 7) * 23,
    abilityAmp: Math.log1p(Math.max(0, abilityAmp) / 9) * 22,
    manaScale: Math.log1p(Math.max(0, manaScale) / 4) * 25,
  };

  let score = 0;
  for (const id of Object.keys(components) as CursedStatId[]) {
    score += weights[id] * components[id];
  }
  return score;
}

function itemCursedStatContribution(item: Item): number {
  const s = item.stats;
  return (
    (s.abilityHaste ?? 0) * 1.4 +
    (s.basicAbilityHaste ?? 0) * 0.9 +
    (s.mana ?? 0) / 55 +
    (s.msPercent ?? 0) * 2.2 +
    (s.ms ?? 0) * 0.08 +
    (s.attackSpeed ?? 0) * 0.85 +
    (s.critChance ?? 0) * 1.6 +
    (s.lifeSteal ?? 0) * 1.8 +
    (s.omnivamp ?? 0) * 1.8 +
    (s.abilityDamageMultiplicative ?? 0) * 4 +
    (s.apMultiplicative ?? 0) * 3.5 +
    (s.adPerMaxManaPercent ?? 0) * 2.5 +
    (s.apPerBonusManaPercent ?? 0) * 2.5 +
    (s.abilityDamagePerManaMultiplicative ?? 0) * 0.15 +
    (s.physicalOnHitMaxManaPercent ?? 0) * 2 +
    (s.physicalOnAbilityHitMaxManaPercent ?? 0) * 2 +
    (s.basicAbilityCooldownReductionOnAttack ?? 0) * 2.5
  );
}

export type BuildProfileId =
  | "balanced"
  | "glass"
  | "full_lethality"
  | "ability_burst"
  | "tank"
  | "ap"
  | "spell"
  | "ad"
  | "bruiser"
  | "cursed";

export interface BuildRecommendation {
  profile: BuildProfileId;
  label: string;
  description: string;
  items: string[];
  /** Sum of estimated gold (`items` order: power/gold first, then cheaper when tied). */
  totalGold: number;
  rune: string;
  score: number;
  totalDPS: number;
  autoAttackDPS: number;
  onHitDPS: number;
  abilityDPS: number;
  dotDPS: number;
  physicalAbilityDPS?: number;
  burstDPS: number;
  sustainedDPS: number;
  comboDPS: number;
  effectiveHP: number;
  /** TTK-derived fight length used for combo sim and durability (seconds). */
  fightDurationSeconds: number;
  breakdown: string[];
  duel: ResolvedDuel;
  simulation: SimulationScenario;
}

type RunePath = NonNullable<Rune["path"]>;

function emptyRune(path: RunePath, slot: Rune["slot"]): Rune {
  return {
    name: "Empty",
    path,
    slot,
    description: "",
    stats: {},
  };
}

function makeRunePage(keystone: Rune): RunePage {
  const p = (keystone.path || "Precision") as RunePath;
  return {
    primaryPath: p,
    keystone,
    primaryRunes: [
      emptyRune(p, "slot1"),
      emptyRune(p, "slot2"),
      emptyRune(p, "slot3"),
    ],
    secondaryPath: "Precision",
    secondaryRunes: [
      emptyRune("Precision", "slot1"),
      emptyRune("Precision", "slot2"),
    ],
    statShards: [
      { name: "Empty", path: null, slot: "statShard1", description: "", stats: {} },
      { name: "Empty", path: null, slot: "statShard2", description: "", stats: {} },
      { name: "Empty", path: null, slot: "statShard3", description: "", stats: {} },
    ],
  };
}

const UTILITY_KEYSTONES = new Set([
  "Fleet Footwork",
  "Phase Rush",
  "Guardian",
  "Glacial Augment",
  "Unsealed Spellbook",
]);

function championComboAutoWeight(champion: Character): number {
  return (
    getChampionComboProfile(champion.Name).comboAutoWeight ??
    0.65
  );
}

/** Low auto-weave kits (assassins, most mages) — Conqueror / PTA are unrealistic. */
function championIsAbilityForward(champion: Character): boolean {
  return championComboAutoWeight(champion) <= 0.35;
}

function championIsBurstAssassin(champion: Character): boolean {
  if (!championIsAbilityForward(champion)) return false;
  const { apScore, adScore } = championApAdScalingScores(champion);
  return adScore >= apScore * 0.85;
}

function championIsBurstMage(champion: Character): boolean {
  const usesAp = championUsesApScaling(champion);
  if (!usesAp) return false;
  if (championIncomingPhysShare(champion, 18) <= 0.45) return true;
  return championIsAbilityForward(champion);
}

/**
 * Realistic keystone pool for a champion + profile.
 * Prevents Conqueror on Zed, PTA on Lux, etc.
 */
export function keystoneCandidatesFor(
  champion: Character,
  profile: BuildProfileId,
): Rune[] {
  const usesAp = championUsesApScaling(champion);
  const physShare = championIncomingPhysShare(champion, 18);
  const adLean = physShare >= 0.55;
  const apLean = usesAp && physShare <= 0.5;
  const burstAssassin = championIsBurstAssassin(champion);
  const burstMage = championIsBurstMage(champion);
  const spellOnly = profile === "spell" || profile === "ability_burst";
  const burst =
    profile === "glass" ||
    profile === "ability_burst" ||
    profile === "full_lethality";
  const tank = profile === "tank";

  if (profile === "full_lethality") {
    return AllKeystones.filter((k) => {
      const n = k.name;
      if (UTILITY_KEYSTONES.has(n)) return false;
      if (n === "Electrocute" || n === "Dark Harvest" || n === "First Strike") {
        return true;
      }
      if (n === "Hail of Blades" && adLean && !burstMage) return true;
      return false;
    });
  }

  return AllKeystones.filter((k) => {
    const n = k.name;

    if (profile === "cursed") return true;

    if (UTILITY_KEYSTONES.has(n)) return false;

    if (n === "Conqueror (AP)") {
      if (burstAssassin || burstMage) return false;
      return (
        usesAp &&
        (profile === "ap" ||
          profile === "bruiser" ||
          profile === "tank" ||
          (profile === "balanced" && apLean))
      );
    }

    if (n === "Conqueror") {
      if (burstAssassin || burstMage) return false;
      if (apLean && !adLean) return false;
      if (profile === "ap" || profile === "spell") return false;
      return (
        profile === "ad" ||
        profile === "bruiser" ||
        profile === "tank" ||
        (profile === "balanced" && adLean && !burstAssassin)
      );
    }

    if (n === "Press the Attack" || n.startsWith("Lethal Tempo")) {
      if (spellOnly || burstMage || burstAssassin) return false;
      if (apLean && !adLean) return false;
      return (
        profile === "ad" ||
        profile === "bruiser" ||
        (profile === "balanced" && adLean) ||
        (profile === "tank" && adLean)
      );
    }

    if (n === "Hail of Blades") {
      if (spellOnly || burstMage || burstAssassin) return false;
      return (
        profile === "ad" ||
        (adLean && (profile === "glass" || profile === "balanced"))
      );
    }

    if (n === "Electrocute" || n === "Dark Harvest") {
      if (tank) return false;
      return (
        burst ||
        burstAssassin ||
        burstMage ||
        profile === "ap" ||
        profile === "spell" ||
        (profile === "balanced" && (apLean || burstAssassin || burstMage))
      );
    }

    if (n === "Arcane Comet" || n === "Summon Aery") {
      if (profile === "ad" && adLean && !usesAp) return false;
      if (burstAssassin) return false;
      return (
        usesAp ||
        profile === "ap" ||
        profile === "spell" ||
        burstMage ||
        (profile === "balanced" && apLean)
      );
    }

    if (n === "Grasp of the Undying" || n === "Aftershock") {
      if (burstAssassin || burstMage) return false;
      return (
        tank ||
        profile === "bruiser" ||
        (profile === "balanced" && !burstAssassin && !burstMage)
      );
    }

    if (n === "First Strike") {
      return (
        burst ||
        burstAssassin ||
        (profile === "balanced" && (burstAssassin || adLean))
      );
    }

    return true;
  });
}

/** Damage-only score for picking a keystone — avoids Conqueror omnivamp inflating EHP. */
function keystonePickScore(
  profile: BuildProfileId,
  dps: ReturnType<Character["calculateDPS"]>,
  stats: ReturnType<Character["getTotalStats"]>,
  champion?: Character,
): number {
  return purchasePowerScore(profile, dps, stats, champion);
}

export function cloneChampionWithLoadout(
  champion: Character,
  itemList: Item[],
  runePage: RunePage | null,
): Character {
  const c = Object.assign(
    Object.create(Object.getPrototypeOf(champion)),
    champion,
  ) as Character;
  c.Items = itemList;
  c.Runes = runePage ?? undefined;
  return c;
}

/** HP + shields weighted by incoming damage mix (no sustain inflation). */
export function baseEffectiveHP(
  stats: ReturnType<Character["getTotalStats"]>,
  incomingPhysShare = 0.5,
): number {
  const hp = stats.hp;
  const vsPhys = (hp * (100 + stats.armor)) / 100;
  const vsMag = (hp * (100 + stats.mr)) / 100;
  const p = clamp(incomingPhysShare, 0, 1);
  const baseEHP = vsPhys * p + vsMag * (1 - p);

  const shieldHP = stats.shieldValue ?? 0;
  const shieldEHP =
    shieldHP > 0
      ? ((shieldHP * (100 + stats.armor)) / 100) * p +
        ((shieldHP * (100 + stats.mr)) / 100) * (1 - p)
      : 0;

  return baseEHP + shieldEHP;
}

export type HealHPSInput = {
  champion: Character;
  stats: ReturnType<Character["getTotalStats"]>;
  dps: ReturnType<Character["calculateDPS"]>;
  simulation?: SimulationScenario;
  /** Grievous wounds from enemy items (0–100). */
  healReductionPercent?: number;
};

const GRIEVOUS_ITEM_NAMES = new Set([
  "Oblivion Orb",
  "Morellonomicon",
  "Chemtech Putrifier",
  "Executioner's Calling",
  "Mortal Reminder",
  "Bramble Vest",
  "Thornmail",
  "Chempunk Chainsword",
]);

/** Max grievous % from enemy completed items (does not stack above 40%). */
export function healReductionFromEnemyItems(
  itemNames: string[],
  isMelee = true,
): number {
  let max = 0;
  for (const name of itemNames) {
    if (GRIEVOUS_ITEM_NAMES.has(name)) {
      max = Math.max(max, 40);
      continue;
    }
    const item = resolveItemByDDName(name, isMelee);
    if (item?.stats.healReductionPercent) {
      max = Math.max(max, item.stats.healReductionPercent);
    }
  }
  return max;
}

/** All in-combat healing sources averaged as HPS. */
export function computeHealHPS(input: HealHPSInput): number {
  const { champion, stats, dps, simulation } = input;
  const sim = resolveSimulationScenario(
    resolveChampionSimulation(champion, simulation),
  );

  const sustainHPS =
    (stats.sustainHealPerSecond ?? 0) +
    (stats.ap * (stats.sustainHealPerSecondAPPercent ?? 0)) / 100;

  const physicalDamageDPS =
    dps.autoAttackDPS +
    dps.onHitDPS +
    (dps.physicalAbilityDPS ?? 0);
  const lifeStealHPS = (physicalDamageDPS * (stats.lifeSteal ?? 0)) / 100;

  const omnivampHPS = (dps.totalDPS * (stats.omnivamp ?? 0) * 0.67) / 100;

  const regenHPS = computeHealthRegenHPS(
    champion.HP5,
    stats.healthRegen ?? champion.HP5,
  );

  const rotationHealHPS = computeRotationHealHPS(
    champion,
    stats,
    sim,
    sim.level,
  );

  let total =
    sustainHPS + lifeStealHPS + omnivampHPS + regenHPS + rotationHealHPS;

  const healAmp = stats.healAmpMultiplicative ?? 0;
  if (healAmp > 0) {
    total *= 1 + healAmp / 100;
  }

  const reduction = input.healReductionPercent ?? 0;
  if (reduction > 0) {
    total *= 1 - Math.min(100, reduction) / 100;
  }

  return total;
}

/** Lifesteal, omnivamp, and ability heals — rewards damage-linked sustain in scoring. */
export function computeOffensiveHealHPS(input: HealHPSInput): number {
  const { champion, stats, dps, simulation } = input;
  const sim = resolveSimulationScenario(
    resolveChampionSimulation(champion, simulation),
  );

  const physicalDamageDPS =
    dps.autoAttackDPS +
    dps.onHitDPS +
    (dps.physicalAbilityDPS ?? 0);
  const lifeStealHPS = (physicalDamageDPS * (stats.lifeSteal ?? 0)) / 100;
  const omnivampHPS = (dps.totalDPS * (stats.omnivamp ?? 0) * 0.67) / 100;
  const rotationHealHPS = computeRotationHealHPS(
    champion,
    stats,
    sim,
    sim.level,
  );

  let total = lifeStealHPS + omnivampHPS + rotationHealHPS;
  const healAmp = stats.healAmpMultiplicative ?? 0;
  if (healAmp > 0) {
    total *= 1 + healAmp / 100;
  }
  return total;
}

export function computeNetIncomingDPS(
  rawIncomingDPS: number,
  healHPS: number,
): number {
  if (rawIncomingDPS <= 0) return 0;
  const net = rawIncomingDPS - healHPS;
  if (net > 0) {
    return Math.max(rawIncomingDPS * 0.1, net);
  }
  // Out-sustaining incoming DPS — approach 5% floor as heal exceeds enemy damage.
  const healShare = Math.min(1, healHPS / rawIncomingDPS);
  return rawIncomingDPS * Math.max(0.05, 1 - healShare);
}

export function computeDurabilityIndex(
  baseHP: number,
  shield: number,
  netIncomingDPS: number,
  referenceDPS: number,
): number {
  const pool = baseHP + shield;
  const ttl = netIncomingDPS > 0 ? pool / netIncomingDPS : 100;
  return ttl * referenceDPS;
}

export type DuelDurabilityResult = {
  healHPS: number;
  estimatedEnemyDPS: number;
  netIncomingDPS: number;
  yourTTL: number;
  enemyTTD: number;
  duelRatio: number;
  durabilityEHP: number;
};

export function computeDuelDurability(
  champion: Character,
  stats: ReturnType<Character["getTotalStats"]>,
  dps: ReturnType<Character["calculateDPS"]>,
  duel: ResolvedDuel,
  simulation?: SimulationScenario,
  fightDurationSeconds?: number,
): DuelDurabilityResult {
  const healInput = { champion, stats, dps, simulation };
  const healHPS = computeHealHPS({
    ...healInput,
    healReductionPercent: duel.targetHealReductionPercent,
  });
  const offensiveHealHPS = computeOffensiveHealHPS(healInput);
  const fightSec =
    fightDurationSeconds ??
    duel.comboWindowSeconds ??
    deriveFightDurationSeconds(
      dps,
      duel.targetMaxHP,
      "balanced",
      duel.targetPhysicalShieldEHP + duel.targetMagicShieldEHP,
    );
  const targetPool = effectiveTargetHP(duel);
  const estimatedEnemyDPS = targetPool / (fightSec * 2.5);
  const netIncomingDPS = computeNetIncomingDPS(
    estimatedEnemyDPS,
    healHPS,
  );
  const yourHP = stats.hp + (stats.shieldValue ?? 0);
  const rawTTL =
    estimatedEnemyDPS > 0 ? yourHP / estimatedEnemyDPS : 100;
  const yourTTL =
    netIncomingDPS > 0 ? yourHP / netIncomingDPS : rawTTL;
  const enemyTTD =
    dps.totalDPS > 0 ? targetPool / dps.totalDPS : 100;
  // In 1v1, durability beyond ~2× kill time has no marginal value.
  const effectiveTTL = Math.min(yourTTL, enemyTTD * 2);
  const duelRatio = effectiveTTL / Math.max(enemyTTD, 0.1);
  const sustainBonus =
    1 + Math.min(1, offensiveHealHPS / estimatedEnemyDPS);
  const durabilityEHP = effectiveTTL * estimatedEnemyDPS * sustainBonus;

  return {
    healHPS,
    estimatedEnemyDPS,
    netIncomingDPS,
    yourTTL,
    enemyTTD,
    duelRatio,
    durabilityEHP,
  };
}

/**
 * Effective HP index for 1v1 durability (net-DPS model).
 * Uses time-to-live against incoming DPS after subtracting healing.
 */
export function mixedEffectiveHP(
  stats: ReturnType<Character["getTotalStats"]>,
  _incomingPhysShare = 0.5,
  ownDPS = 0,
  fightDurationSeconds = 8,
  autoAttackDPS = 0,
  physicalAbilityDPS = 0,
): number {
  const estimatedEnemyDPS = 3000 / (fightDurationSeconds * 2.5);
  const sustainHPS =
    (stats.sustainHealPerSecond ?? 0) +
    (stats.ap * (stats.sustainHealPerSecondAPPercent ?? 0)) / 100;
  const physicalDPS = autoAttackDPS + physicalAbilityDPS;
  const lifeStealHPS = (physicalDPS * (stats.lifeSteal ?? 0)) / 100;
  const omnivampHPS = (ownDPS * (stats.omnivamp ?? 0) * 0.67) / 100;
  const healHPS = sustainHPS + lifeStealHPS + omnivampHPS;
  const netIncomingDPS = computeNetIncomingDPS(estimatedEnemyDPS, healHPS);
  const yourHP = stats.hp + (stats.shieldValue ?? 0);
  const yourTTL = yourHP / netIncomingDPS;
  return yourTTL * estimatedEnemyDPS;
}

/**
 * Simulate a mutual 1v1 duel between two Characters.
 * Each side's DPS is calculated against the other's resistances,
 * and healing (lifesteal/omnivamp) extends effective HP over the fight.
 * Returns a duel score > 1 if attacker wins, < 1 if defender wins.
 */
export function simulateDuel(
  attacker: Character,
  defender: Character,
  simulation?: SimulationScenario,
  comboWindowSeconds = 8,
): { score: number; attackerTTK: number; defenderTTK: number } {
  const attackerBaseStats = attacker.getTotalStats();
  const defenderBaseStats = defender.getTotalStats();

  // Attacker DPS into defender's resistances
  const attackerDps = attacker.calculateDPS(
    defenderBaseStats.hp,
    Math.max(0, defenderBaseStats.hp - defender.HP),
    simulation,
    {
      targetArmor: defenderBaseStats.armor,
      targetMR: defenderBaseStats.mr,
      comboWindowSeconds,
    },
  );

  // Defender DPS into attacker's resistances
  const defenderDps = defender.calculateDPS(
    attackerBaseStats.hp,
    Math.max(0, attackerBaseStats.hp - attacker.HP),
    simulation,
    {
      targetArmor: attackerBaseStats.armor,
      targetMR: attackerBaseStats.mr,
      comboWindowSeconds,
    },
  );

  const attackerRawDPS = attackerDps.totalDPS;
  const defenderRawDPS = defenderDps.totalDPS;
  const attackerStats = attackerDps.combatStats;
  const defenderStats = defenderDps.combatStats;

  const attackerTotalHealHPS = computeHealHPS({
    champion: attacker,
    stats: attackerStats,
    dps: attackerDps,
    simulation,
  });
  const defenderTotalHealHPS = computeHealHPS({
    champion: defender,
    stats: defenderStats,
    dps: defenderDps,
    simulation,
  });

  const attackerShield = attackerStats.shieldValue ?? 0;
  const defenderShield = defenderStats.shieldValue ?? 0;

  // Net DPS each side takes (incoming DPS minus healing, floored at 10% of raw to avoid immortality)
  const netDPSIntoAttacker = computeNetIncomingDPS(
    defenderRawDPS,
    attackerTotalHealHPS,
  );
  const netDPSIntoDefender = computeNetIncomingDPS(
    attackerRawDPS,
    defenderTotalHealHPS,
  );

  // TTK = (HP + shield) / net incoming DPS
  const attackerHP = attackerStats.hp + attackerShield;
  const defenderHP = defenderStats.hp + defenderShield;

  const attackerTTK = netDPSIntoAttacker > 0 ? attackerHP / netDPSIntoAttacker : Infinity;
  const defenderTTK = netDPSIntoDefender > 0 ? defenderHP / netDPSIntoDefender : Infinity;

  // Score > 1 means attacker wins (attacker lives longer than defender)
  const score = attackerTTK > 0 ? defenderTTK > 0 ? attackerTTK / defenderTTK : 0 : Infinity;

  return { score, attackerTTK: defenderTTK, defenderTTK: attackerTTK };
}

function blendedDps(
  dps: ReturnType<Character["calculateDPS"]>,
  comboWeight: number,
): number {
  const sustained = dps.sustainedDPS;
  const combo = dps.comboDPS;
  const w = clamp(comboWeight, 0, 1);
  return sustained * (1 - w) + combo * w;
}

/** Default combo weight — kept in sync with sim `totalDPS` headline metric. */
export const DEFAULT_COMBO_DPS_WEIGHT = BLENDED_DPS_COMBO_WEIGHT;

/**
 * Profile scoring — all profiles use the sim's actual DPS/EHP numbers.
 * The only knob is the DPS-vs-EHP weighting, which is what profiles are for.
 * No artificial stat-type bonuses (lethality, AP thresholds, etc.).
 */
function profileScore(
  profile: BuildProfileId,
  dps: ReturnType<Character["calculateDPS"]>,
  ehp: number,
  _build: Item[],
  duelRatio = 1,
): number {
  const combo = dps.comboDPS;
  const mixed = blendedDps(dps, DEFAULT_COMBO_DPS_WEIGHT);

  const duelFactor = Math.sqrt(Math.max(0.1, duelRatio));

  switch (profile) {
    case "glass":
    case "ability_burst":
      return Math.max(0, combo);

    case "full_lethality":
      return Math.max(0, combo + dps.burstDPS * 0.2);

    case "tank":
      return (
        Math.log1p(ehp / 150) * 1.35 *
        Math.pow(Math.log1p(mixed / 40), 0.65) *
        duelFactor
      );

    case "ap":
      return (
        Math.log1p(mixed) *
        Math.pow(Math.log1p(ehp / 600), 0.25) *
        duelFactor
      );

    case "spell":
      return (
        Math.log1p(dps.abilityDPS + dps.dotDPS + dps.burstDPS) *
        Math.pow(Math.log1p(ehp / 650), 0.2) *
        duelFactor
      );

    case "ad":
      return (
        Math.log1p(mixed) *
        Math.pow(Math.log1p(ehp / 700), 0.3) *
        duelFactor
      );

    case "bruiser":
      return Math.log1p(mixed / 45) * Math.log1p(ehp / 200) * duelFactor;

    case "cursed":
      return Math.log1p(mixed / 55) * duelFactor;

    case "balanced":
    default:
      return Math.log1p(mixed / 50) * Math.log1p(ehp / 400) * duelFactor;
  }
}

function scoreChampion(
  profile: BuildProfileId,
  c: Character,
  build: Item[],
  duel: ResolvedDuel,
  simulation?: SimulationScenario,
  fightDurationIterations = 1,
): number {
  const profileSim = resolveChampionSimulation(c, simulation);
  const { dps, fightDurationSeconds } = calculateDpsWithFightDuration(
    c,
    duel.targetMaxHP,
    duel.targetBonusHP,
    profileSim,
    dpsMitigationFromDuel(duel),
    profile,
    fightDurationOptionsForProfile(profile, duel, fightDurationIterations),
  );
  const { durabilityEHP, duelRatio } = computeDuelDurability(
    c,
    dps.combatStats,
    dps,
    duel,
    profileSim,
    fightDurationSeconds,
  );

  if (profile === "cursed") {
    const weights = getChampionCursedWeights(c);
    const cursed = scoreCursedStatBundle(dps.combatStats, weights);
    const itemMeme = build.reduce(
      (acc, item) => acc + itemCursedStatContribution(item),
      0,
    );
    const mixed = blendedDps(dps, DEFAULT_COMBO_DPS_WEIGHT);
    return (
      Math.pow(cursed + itemMeme * 0.035, 1.08) *
      Math.pow(Math.log1p(mixed / 50), 0.38) *
      Math.sqrt(Math.max(0.1, duelRatio))
    );
  }

  return profileScore(profile, dps, durabilityEHP, build, duelRatio);
}

/**
 * Damage-relevant power for buy-order steps. Intentionally ignores EHP, duel ratio,
 * and meta paths — only "how much does this item spike my damage right now?"
 */
function purchasePowerScore(
  profile: BuildProfileId,
  dps: ReturnType<Character["calculateDPS"]>,
  stats: ReturnType<Character["getTotalStats"]>,
  champion?: Character,
): number {
  switch (profile) {
    case "glass":
    case "ability_burst":
    case "full_lethality":
      return dps.comboDPS;
    case "spell":
      return dps.abilityDPS + dps.dotDPS + dps.burstDPS;
    case "ad":
      return (
        dps.autoAttackDPS + dps.onHitDPS + dps.sustainedDPS * 0.25
      );
    case "ap":
      return dps.abilityDPS + dps.dotDPS + dps.burstDPS;
    case "tank":
      return (
        blendedDps(dps, 0.35) + Math.log1p((stats.hp ?? 0) / 500) * 8
      );
    case "bruiser":
      return (
        blendedDps(dps, 0.45) + Math.log1p((stats.hp ?? 0) / 800) * 6
      );
    case "cursed": {
      if (!champion) return blendedDps(dps, 0.35);
      const weights = getChampionCursedWeights(champion);
      const cursed = scoreCursedStatBundle(stats, weights);
      return cursed * 0.78 + blendedDps(dps, 0.32) * 0.22;
    }
    case "balanced":
    default:
      return blendedDps(dps, DEFAULT_COMBO_DPS_WEIGHT);
  }
}

/**
 * Buy order for a finalized 6-item build: greedy marginal sim spikes per gold,
 * income ramp, component tie-breaks (itemRecipes.json). No meta/statistical paths.
 */
export function greedySimPurchaseOrder(
  champion: Character,
  finalBuild: Item[],
  profile: BuildProfileId,
  duel: ResolvedDuel,
  simulation: SimulationScenario | undefined,
  runePage: RunePage | null,
): Item[] {
  return greedyPurchaseOrder(
    finalBuild,
    (partial, enemyCompletedItems) => {
      const c = cloneChampionWithLoadout(champion, partial, runePage);
      const opponent = opponentAtPurchaseStep(
        duel,
        partial.length,
        finalBuild.length,
        enemyCompletedItems,
      );
      const stepSim: SimulationScenario = {
        ...(simulation ?? {}),
        level: opponent.level,
      };
      const { dps } = calculateDpsWithFightDuration(
        c,
        opponent.targetMaxHP,
        opponent.targetBonusHP,
        stepSim,
        dpsMitigationFromDuel({
          ...duel,
          targetMaxHP: opponent.targetMaxHP,
          targetBonusHP: opponent.targetBonusHP,
          targetArmor: opponent.targetArmor,
          targetMR: opponent.targetMR,
        }),
        profile,
        fightDurationOptionsForProfile(profile, duel, 1),
      );
      return purchasePowerScore(profile, dps, c.getTotalStats(stepSim.level), c);
    },
    duel,
  );
}

type KeystoneCacheEntry = { rune: Rune | null; score: number };
type KeystoneCache = Map<string, KeystoneCacheEntry>;

function keystoneCacheKey(
  championName: string,
  profile: BuildProfileId,
  build: Item[],
  duel: ResolvedDuel,
  simulation?: SimulationScenario,
): string {
  const items = build
    .map((i) => i.name)
    .sort()
    .join("|");
  const simKey = simulation
    ? `${simulation.level ?? ""}:${simulation.spellOnlyNoAutos ?? ""}:${simulation.enableChampionRotationProfiles ?? ""}`
    : "";
  return `${championName}\0${profile}\0${items}\0${duel.targetMaxHP}\0${duel.targetBonusHP}\0${duel.targetArmor}\0${duel.targetMR}\0${duel.comboWindowSeconds ?? "ttk"}\0${simKey}`;
}

function bestKeystoneForBuild(
  champion: Character,
  build: Item[],
  profile: BuildProfileId,
  duel: ResolvedDuel,
  simulation?: SimulationScenario,
): KeystoneCacheEntry {
  const candidates = keystoneCandidatesFor(champion, profile);
  const profileSim = mergeProfileSimulation(profile, champion, simulation);
  let best: Rune | null = null;
  let bestS = -Infinity;

  for (const k of candidates) {
    const c = cloneChampionWithLoadout(champion, build, makeRunePage(k));
    const { dps } = calculateDpsWithFightDuration(
      c,
      duel.targetMaxHP,
      duel.targetBonusHP,
      profileSim,
      dpsMitigationFromDuel(duel),
      profile,
      fightDurationOptionsForProfile(profile, duel, 1),
    );
    const s = keystonePickScore(
      profile,
      dps,
      c.getTotalStats(profileSim.level),
      c,
    );
    if (s > bestS) {
      bestS = s;
      best = k;
    }
  }

  return { rune: best, score: bestS };
}

/** Public wrapper for meta rescoring / audits. */
export function pickBestKeystoneForBuild(
  champion: Character,
  build: Item[],
  profile: BuildProfileId,
  duel: ResolvedDuel,
  simulation?: SimulationScenario,
): Rune | null {
  return bestKeystoneForBuild(
    champion,
    build,
    profile,
    duel,
    simulation,
  ).rune;
}

function getCachedKeystone(
  cache: KeystoneCache,
  champion: Character,
  build: Item[],
  profile: BuildProfileId,
  duel: ResolvedDuel,
  simulation?: SimulationScenario,
): KeystoneCacheEntry {
  const key = keystoneCacheKey(
    champion.Name,
    profile,
    build,
    duel,
    simulation,
  );
  const hit = cache.get(key);
  if (hit) return hit;
  const result = bestKeystoneForBuild(
    champion,
    build,
    profile,
    duel,
    simulation,
  );
  cache.set(key, result);
  return result;
}

function copyBuild(build: Item[]): Item[] {
  return build.slice();
}

type BuildSearchCtx = {
  optimizeKeystones: boolean;
  keystoneCache: KeystoneCache;
};

function scoreBuildFast(
  champion: Character,
  profile: BuildProfileId,
  build: Item[],
  duel: ResolvedDuel,
  simulation: SimulationScenario | undefined,
  search: BuildSearchCtx,
): number {
  if (!search.optimizeKeystones) {
    const c = cloneChampionWithLoadout(champion, build, null);
    return scoreChampion(profile, c, build, duel, simulation);
  }
  return getCachedKeystone(
    search.keystoneCache,
    champion,
    build,
    profile,
    duel,
    simulation,
  ).score;
}

/** One-step neighbor: replace a random slot with any pool item valid for the other 5 slots. */
function randomNeighbor(build: Item[], pool: Item[]): Item[] {
  if (build.length !== 6) return copyBuild(build);
  const slot = Math.floor(Math.random() * 6);
  const others = build.filter((_, i) => i !== slot);
  const candidates = pool.filter((it) => canAddItemToBuild(it, others));
  if (candidates.length === 0) return copyBuild(build);
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  const next = copyBuild(build);
  next[slot] = pick;
  return next;
}

export type MonteCarloParams = {
  /** Simulated annealing proposals per restart. */
  iterationsPerRestart?: number;
  /** Independent runs (new RNG trajectory / random start unless seeded). */
  restarts?: number;
  /** Restart 0 initializes from greedy build when available. */
  seedFirstRestartWithGreedy?: boolean;
  /** Initial temperature for Metropolis acceptance (scale with typical |Δscore|). */
  initialTemperature?: number;
  /** Multiply T after each proposal ( < 1 cools down). */
  coolingFactor?: number;
  /**
   * Random full builds screened for alt recommendations (see also top-level `samples`).
   */
  randomProbeSamples?: number;
};

type ResolvedMonteCarlo = {
  iterationsPerRestart: number;
  restarts: number;
  seedFirstRestartWithGreedy: boolean;
  initialTemperature: number;
  coolingFactor: number;
};

export function resolveMonteCarloParams(
  partial?: MonteCarloParams,
): ResolvedMonteCarlo {
  return {
    iterationsPerRestart: clamp(
      partial?.iterationsPerRestart ?? 900,
      100,
      100_000,
    ),
    restarts: clamp(partial?.restarts ?? 6, 1, 64),
    seedFirstRestartWithGreedy: partial?.seedFirstRestartWithGreedy !== false,
    initialTemperature: clamp(
      partial?.initialTemperature ?? 0.1,
      0.001,
      5,
    ),
    coolingFactor: clamp(partial?.coolingFactor ?? 0.9995, 0.9, 0.99999),
  };
}

/**
 * Simulated annealing on 6-item loadouts (one item per group).
 * Monte Carlo / Metropolis exploration — not guaranteed global optimum, but much
 * stronger than greedy for non-local item synergies.
 */
export function simulatedAnnealingOptimize(
  champion: Character,
  pool: Item[],
  profile: BuildProfileId,
  duel: ResolvedDuel,
  simulation: SimulationScenario | undefined,
  mc: ResolvedMonteCarlo,
  greedySeed: Item[] | null,
  search: BuildSearchCtx,
): Item[] {
  let globalBest: Item[] = [];
  let globalBestScore = -Infinity;

  for (let r = 0; r < mc.restarts; r++) {
    let current: Item[];
    if (
      r === 0 &&
      mc.seedFirstRestartWithGreedy &&
      greedySeed &&
      greedySeed.length === 6
    ) {
      current = copyBuild(greedySeed);
    } else {
      current = sampleFullBuild(pool);
      if (current.length < 6) continue;
    }

    let currentScore = scoreBuildFast(
      champion,
      profile,
      current,
      duel,
      simulation,
      search,
    );
    let restartBest = copyBuild(current);
    let restartBestScore = currentScore;
    let T = mc.initialTemperature;

    for (let i = 0; i < mc.iterationsPerRestart; i++) {
      const neighbor = randomNeighbor(current, pool);
      const ns = scoreBuildFast(
        champion,
        profile,
        neighbor,
        duel,
        simulation,
        search,
      );
      const delta = ns - currentScore;
      if (
        delta > 0 ||
        (T > 1e-9 && Math.random() < Math.exp(delta / T))
      ) {
        current = neighbor;
        currentScore = ns;
        if (currentScore > restartBestScore) {
          restartBestScore = currentScore;
          restartBest = copyBuild(current);
        }
      }
      T *= mc.coolingFactor;
    }

    if (restartBestScore > globalBestScore) {
      globalBestScore = restartBestScore;
      globalBest = copyBuild(restartBest);
    }
  }

  return globalBest;
}

function greedyFill(
  champion: Character,
  pool: Item[],
  profile: BuildProfileId,
  duel: ResolvedDuel,
  simulation: SimulationScenario | undefined,
  search: BuildSearchCtx,
): Item[] {
  const build: Item[] = [];

  for (let slot = 0; slot < 6; slot++) {
    let bestItem: Item | null = null;
    let bestScore = -Infinity;

    for (const item of pool) {
      if (!canAddItemToBuild(item, build)) continue;
      const trial = [...build, item];
      const s = scoreBuildFast(
        champion,
        profile,
        trial,
        duel,
        simulation,
        search,
      );
      if (s > bestScore) {
        bestScore = s;
        bestItem = item;
      }
    }

    if (bestItem) {
      build.push(bestItem);
    } else {
      break;
    }
  }

  return build;
}

function sampleFullBuild(pool: Item[]): Item[] {
  const shuffled = pool.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const out: Item[] = [];
  for (const item of shuffled) {
    if (out.length >= 6) break;
    if (canAddItemToBuild(item, out)) {
      out.push(item);
    }
  }
  return out.length >= 6 ? out : [];
}

function buildSimilarity(a: Item[], b: Item[]): number {
  const sa = new Set(a.map((i) => i.getGroupName()));
  const sb = new Set(b.map((i) => i.getGroupName()));
  let n = 0;
  for (const x of sa) {
    if (sb.has(x)) n++;
  }
  return n / 6;
}

function isDistinct(
  build: Item[],
  existing: Item[][],
  minDiff = 0.34,
): boolean {
  for (const e of existing) {
    if (buildSimilarity(build, e) > 1 - minDiff) return false;
  }
  return true;
}

const PROFILE_META: Record<
  BuildProfileId,
  { label: string; description: string }
> = {
  balanced: {
    label: "Balanced (1v1)",
    description:
      "Best mix of sustained damage and durability for a reference duel.",
  },
  glass: {
    label: "Maximum damage",
    description: "Pure damage focus — lowest survivability tradeoff.",
  },
  full_lethality: {
    label: "Full Lethality",
    description:
      "Flat armor pen all-in — shortest combo window, zero durability weight. Best burst vs squishies.",
  },
  ability_burst: {
    label: "Maximum ability damage",
    description:
      "Same combo burst goal as Maximum damage, but the sim never basic-attacks (no AA/on-hit DPS in the combo window).",
  },
  tank: {
    label: "Tanky",
    description: "Emphasizes effective HP while keeping meaningful threat.",
  },
  ap: {
    label: "AP / spell-heavy",
    description: "Favors ability + DoT output and AP itemization.",
  },
  spell: {
    label: "Spell-only (no autos)",
    description:
      "Optimizes ability + DoT + burst. Sim assumes no attack cadence (no AA/on-hit DPS, no Navori CDR from autos).",
  },
  ad: {
    label: "AD / autos & on-hit",
    description: "Favors auto attacks, on-hit, and physical carry patterns.",
  },
  bruiser: {
    label: "Bruiser",
    description: "Frontline profile: high HP/resists with solid total output.",
  },
  cursed: {
    label: "Cursed",
    description:
      "Chases the weird stat angles your kit naturally wants — haste, mana, move speed, crit memes, and more.",
  },
};

export type RecommendBuildsOptions = {
  /** @deprecated use monteCarloParams.randomProbeSamples; still used as fallback when unset */
  samples?: number;
  duel?: DuelAssumptions;
  /** When true (default), run simulated annealing after greedy seed. Set false for fast greedy-only. */
  monteCarlo?: boolean;
  monteCarloParams?: MonteCarloParams;
  simulation?: SimulationScenario;
  /**
   * When true (default), score every candidate build with all keystones (compute-meta).
   * When false, search uses no keystone; best keystone is chosen once per final build (live UI).
   */
  optimizeKeystones?: boolean;
  /** Optional progress hook (used by compute-meta). */
  onProgress?: (message: string) => void;
};

/** Defaults for the 1v1 build finder — fast search, keystone resolved on final builds only. */
export const INTERACTIVE_RECOMMEND_OPTIONS: Pick<
  RecommendBuildsOptions,
  "optimizeKeystones" | "monteCarloParams"
> = {
  optimizeKeystones: false,
  monteCarloParams: { randomProbeSamples: 180 },
};

export function recommendBuildsForChampion(
  champion: Character,
  itemPool: Item[] = Items,
  options?: RecommendBuildsOptions,
): BuildRecommendation[] {
  const realisticPool = buildRealisticItemPool(champion, itemPool);
  const duel = resolveDuel(options?.duel);
  const useMC = options?.monteCarlo !== false;
  const simulation = options?.simulation;
  const optimizeKeystones = options?.optimizeKeystones !== false;
  const mc = resolveMonteCarloParams(options?.monteCarloParams);
  const defaultProbes = optimizeKeystones ? 400 : 180;
  const nProbes = clamp(
    options?.monteCarloParams?.randomProbeSamples ??
      options?.samples ??
      (useMC ? defaultProbes : 180),
    0,
    50_000,
  );
  const search: BuildSearchCtx = {
    optimizeKeystones,
    keystoneCache: new Map(),
  };
  const profiles: BuildProfileId[] = [
    "balanced",
    "glass",
    "full_lethality",
    "ability_burst",
    "cursed",
    "tank",
    "ap",
    "spell",
    "ad",
    "bruiser",
  ];

  const results: BuildRecommendation[] = [];
  const seenItemSets: Item[][] = [];

  for (let pi = 0; pi < profiles.length; pi++) {
    const profile = profiles[pi];
    if (
      profile === "full_lethality" &&
      !championEligibleForFullLethality(champion)
    ) {
      continue;
    }
    options?.onProgress?.(
      `profile ${profile} (${pi + 1}/${profiles.length})`,
    );
    const profileSim = mergeProfileSimulation(profile, champion, simulation);
    const profilePool = itemPoolForProfile(champion, realisticPool, profile);
    const greedy = greedyFill(
      champion,
      profilePool,
      profile,
      duel,
      profileSim,
      search,
    );
    let primary: Item[] = [];

    if (useMC && greedy.length === 6) {
      options?.onProgress?.(
        `profile ${profile}: simulated annealing (${mc.iterationsPerRestart}×${mc.restarts})`,
      );
      const saBest = simulatedAnnealingOptimize(
        champion,
        profilePool,
        profile,
        duel,
        profileSim,
        mc,
        greedy,
        search,
      );
      const gFast = scoreBuildFast(
        champion,
        profile,
        greedy,
        duel,
        profileSim,
        search,
      );
      const sFast =
        saBest.length === 6
          ? scoreBuildFast(
              champion,
              profile,
              saBest,
              duel,
              profileSim,
              search,
            )
          : -Infinity;
      primary = sFast >= gFast && saBest.length === 6 ? saBest : greedy;
    } else if (greedy.length === 6) {
      primary = greedy;
    } else if (useMC) {
      primary = simulatedAnnealingOptimize(
        champion,
        profilePool,
        profile,
        duel,
        profileSim,
        mc,
        null,
        search,
      );
    }

    if (primary.length === 0 || !isValidFullBuild(primary)) continue;

    const { rune: gRune } = getCachedKeystone(
      search.keystoneCache,
      champion,
      primary,
      profile,
      duel,
      profileSim,
    );
    const gc = cloneChampionWithLoadout(
      champion,
      primary,
      gRune ? makeRunePage(gRune) : null,
    );
    const { dps: gd, fightDurationSeconds } = calculateDpsWithFightDuration(
      gc,
      duel.targetMaxHP,
      duel.targetBonusHP,
      profileSim,
      dpsMitigationFromDuel(duel),
      profile,
      fightDurationOptionsForProfile(profile, duel, 2),
    );
    const gehp = computeDuelDurability(
      gc,
      gd.combatStats,
      gd,
      duel,
      profileSim,
      fightDurationSeconds,
    ).durabilityEHP;
    const gscore = scoreChampion(profile, gc, primary, duel, profileSim);

    seenItemSets.push(primary);
    const purchaseOrder = greedySimPurchaseOrder(
      champion,
      primary,
      profile,
      duel,
      profileSim,
      gRune ? makeRunePage(gRune) : null,
    );
    results.push({
      profile,
      label: PROFILE_META[profile].label,
      description:
        profile === "cursed"
          ? `${PROFILE_META.cursed.description} Lean: ${formatCursedStatLean(getChampionCursedWeights(champion))}.`
          : PROFILE_META[profile].description,
      items: purchaseOrder.map((i) => i.name),
      totalGold: totalBuildGold(purchaseOrder),
      rune: gRune?.name ?? "None",
      score: gscore,
      totalDPS: gd.totalDPS,
      sustainedDPS: gd.sustainedDPS,
      comboDPS: gd.comboDPS,
      autoAttackDPS: gd.autoAttackDPS,
      onHitDPS: gd.onHitDPS,
      abilityDPS: gd.abilityDPS,
      dotDPS: gd.dotDPS,
      physicalAbilityDPS: gd.physicalAbilityDPS,
      burstDPS: gd.burstDPS,
      effectiveHP: gehp,
      fightDurationSeconds,
      breakdown: gd.breakdown,
      duel: { ...duel },
      simulation: { ...profileSim },
    });

    let bestAlt: Item[] | null = null;
    let bestAltScore = -Infinity;
    for (let i = 0; i < nProbes; i++) {
      const b = sampleFullBuild(profilePool);
      if (b.length < 6) continue;
      if (!isValidFullBuild(b)) continue;
      if (!isDistinct(b, [primary])) continue;
      const s0 = scoreBuildFast(
        champion,
        profile,
        b,
        duel,
        profileSim,
        search,
      );
      if (s0 > bestAltScore) {
        bestAltScore = s0;
        bestAlt = b;
      }
    }
    if (bestAlt && isDistinct(bestAlt, seenItemSets)) {
      const { rune: aRune } = getCachedKeystone(
        search.keystoneCache,
        champion,
        bestAlt,
        profile,
        duel,
        profileSim,
      );
      const c = cloneChampionWithLoadout(
        champion,
        bestAlt,
        aRune ? makeRunePage(aRune) : null,
      );
      const { dps: altDps, fightDurationSeconds: altFightSec } =
        calculateDpsWithFightDuration(
          c,
          duel.targetMaxHP,
          duel.targetBonusHP,
          profileSim,
          dpsMitigationFromDuel(duel),
          profile,
          fightDurationOptionsForProfile(profile, duel, 2),
        );
      const altEhp = computeDuelDurability(
        c,
        altDps.combatStats,
        altDps,
        duel,
        profileSim,
        altFightSec,
      ).durabilityEHP;
      const sc = scoreChampion(profile, c, bestAlt, duel, profileSim);
      if (sc > gscore * 0.88) {
        seenItemSets.push(bestAlt);
        const altOrder = greedySimPurchaseOrder(
          champion,
          bestAlt,
          profile,
          duel,
          profileSim,
          aRune ? makeRunePage(aRune) : null,
        );
        results.push({
          profile,
          label: `${PROFILE_META[profile].label} (alt)`,
          description:
            profile === "cursed"
              ? `${PROFILE_META.cursed.description} Lean: ${formatCursedStatLean(getChampionCursedWeights(champion))}.`
              : PROFILE_META[profile].description,
          items: altOrder.map((x) => x.name),
          totalGold: totalBuildGold(altOrder),
          rune: aRune?.name ?? "None",
          score: sc,
          totalDPS: altDps.totalDPS,
          sustainedDPS: altDps.sustainedDPS,
          comboDPS: altDps.comboDPS,
          autoAttackDPS: altDps.autoAttackDPS,
          onHitDPS: altDps.onHitDPS,
          abilityDPS: altDps.abilityDPS,
          dotDPS: altDps.dotDPS,
          physicalAbilityDPS: altDps.physicalAbilityDPS,
          burstDPS: altDps.burstDPS,
          effectiveHP: altEhp,
          fightDurationSeconds: altFightSec,
          breakdown: altDps.breakdown,
          duel: { ...duel },
          simulation: { ...profileSim },
        });
      }
    }
  }

  results.sort((a, b) => {
    if (a.profile !== b.profile) {
      const order: BuildProfileId[] = [
        "balanced",
        "glass",
        "full_lethality",
        "ability_burst",
        "cursed",
        "tank",
        "ap",
        "spell",
        "ad",
        "bruiser",
      ];
      return order.indexOf(a.profile) - order.indexOf(b.profile);
    }
    return b.score - a.score;
  });

  return results;
}

export type SerializedBuildResult = {
  champion: string;
  items: string[];
  totalGold: number;
  rune: string;
  profile?: BuildProfileId;
  totalDPS: number;
  sustainedDPS: number;
  comboDPS: number;
  autoAttackDPS: number;
  onHitDPS: number;
  dotDPS: number;
  abilityDPS: number;
  physicalAbilityDPS?: number;
  burstDPS: number;
  /** TTK-derived fight length used for this row's DPS (seconds). */
  fightDurationSeconds?: number;
  breakdown: string[];
  buildType: string;
};

export type SerializedMeta = {
  championBuilds: { champion: string; builds: SerializedBuildResult[] }[];
  generatedAt: string;
  duel: ResolvedDuel;
  simulation?: SimulationScenario;
};

const BUILD_PROFILE_IDS: BuildProfileId[] = [
  "balanced",
  "glass",
  "full_lethality",
  "ability_burst",
  "cursed",
  "tank",
  "ap",
  "spell",
  "ad",
  "bruiser",
];

/** Duel assumptions for meta display / rescoring — never pins a global combo window. */
export function metaDuelForTtkScoring(duel: ResolvedDuel): ResolvedDuel {
  return resolveDuel({
    targetMaxHP: duel.targetMaxHP,
    targetBonusHP: duel.targetBonusHP,
    incomingPhysShare: duel.incomingPhysShare,
    targetArmor: duel.targetArmor,
    targetMR: duel.targetMR,
  });
}

export function profileFromBuildType(buildType: string): BuildProfileId {
  const raw = buildType.split(" · ")[0]?.trim() ?? "balanced";
  if (BUILD_PROFILE_IDS.includes(raw as BuildProfileId)) {
    return raw as BuildProfileId;
  }
  return "balanced";
}

function serializeBuildRecommendation(
  championName: string,
  r: BuildRecommendation,
  classifiedItems: Item[],
): SerializedBuildResult {
  return {
    champion: championName,
    items: r.items,
    totalGold: r.totalGold,
    rune: r.rune,
    profile: r.profile,
    totalDPS: r.totalDPS,
    sustainedDPS: r.sustainedDPS,
    comboDPS: r.comboDPS,
    autoAttackDPS: r.autoAttackDPS,
    onHitDPS: r.onHitDPS,
    abilityDPS: r.abilityDPS,
    dotDPS: r.dotDPS,
    physicalAbilityDPS: r.physicalAbilityDPS,
    burstDPS: r.burstDPS,
    fightDurationSeconds: r.fightDurationSeconds,
    breakdown: r.breakdown,
    buildType: `${r.profile} · ${classifyBuildFromItems(classifiedItems)}`,
  };
}

/**
 * Re-score one meta row with per-build TTK fight length (ignores legacy fixed windows).
 */
export function rescoreMetaBuildRow(
  row: SerializedBuildResult,
  duel: ResolvedDuel,
  simulation: SimulationScenario | undefined,
  champions: Character[],
  itemPool: Item[],
): SerializedBuildResult {
  const champion = champions.find((c) => c.Name === row.champion);
  if (!champion) return row;

  const profile = row.profile ?? profileFromBuildType(row.buildType);
  const items = row.items
    .map((name) => itemPool.find((i) => i.name === name))
    .filter((x): x is Item => Boolean(x));
  if (items.length === 0) return row;

  const keystone =
    pickBestKeystoneForBuild(champion, items, profile, duel, simulation) ??
    AllKeystones.find((k) => k.name === row.rune) ??
    null;
  const c = cloneChampionWithLoadout(
    champion,
    items,
    keystone ? makeRunePage(keystone) : null,
  );
  const profileSim = mergeProfileSimulation(profile, champion, simulation);
  const { dps, fightDurationSeconds } = calculateDpsWithFightDuration(
    c,
    duel.targetMaxHP,
    duel.targetBonusHP,
    profileSim,
    dpsMitigationFromDuel(duel),
    profile,
    fightDurationOptionsForProfile(profile, duel, 2),
  );

  return {
    ...row,
    profile,
    rune: keystone?.name ?? row.rune,
    totalDPS: dps.totalDPS,
    sustainedDPS: dps.sustainedDPS,
    comboDPS: dps.comboDPS,
    autoAttackDPS: dps.autoAttackDPS,
    onHitDPS: dps.onHitDPS,
    abilityDPS: dps.abilityDPS,
    dotDPS: dps.dotDPS,
    physicalAbilityDPS: dps.physicalAbilityDPS,
    burstDPS: dps.burstDPS,
    fightDurationSeconds,
    breakdown: dps.breakdown,
  };
}

/** Re-score all meta builds with per-row TTK fight windows (fixes legacy 1s JSON). */
export function rescoreMetaDataset(meta: SerializedMeta): SerializedMeta {
  const duel = metaDuelForTtkScoring(meta.duel);
  return {
    ...meta,
    duel,
    championBuilds: meta.championBuilds.map((cb) => ({
      ...cb,
      builds: cb.builds.map((row) =>
        rescoreMetaBuildRow(row, duel, meta.simulation, Characters, Items),
      ),
    })),
  };
}

function classifyBuildFromItems(items: Item[]): string {
  let critScore = 0;
  let onHitScore = 0;
  let apScore = 0;
  let tankScore = 0;
  let lethScore = 0;

  for (const item of items) {
    const stats = item.stats;
    if (stats.critChance) critScore += stats.critChance;
    if (stats.critDmg) critScore += stats.critDmg / 5;
    if (stats.ap) apScore += stats.ap;
    if (stats.attackSpeed) onHitScore += stats.attackSpeed / 5;
    if (stats.hp) tankScore += stats.hp / 50;
    if (stats.armor) tankScore += stats.armor;
    if (stats.mr) tankScore += stats.mr;
    if (stats.lethality) lethScore += stats.lethality * 2;
    if (stats.magicOnHit || stats.physicalOnHit) onHitScore += 30;
    if (stats.magicOnHitAPRatio || stats.physicalOnHitBaseADPercent)
      onHitScore += 20;
    if (
      stats.physicalOnHitMaxHealthPercent ||
      stats.physicalOnHitCurrentHealthPercent
    )
      onHitScore += 25;
  }

  const scores = [
    { type: "Crit", score: critScore },
    { type: "On-Hit", score: onHitScore },
    { type: "AP", score: apScore / 3 },
    { type: "Lethality", score: lethScore },
    { type: "Tank", score: tankScore / 2 },
  ];
  scores.sort((a, b) => b.score - a.score);

  if (scores[0].score > 0 && scores[1].score > scores[0].score * 0.5) {
    return `${scores[0].type}/${scores[1].type}`;
  }
  return scores[0].score > 0 ? scores[0].type : "Standard";
}

export type ComputeMetaOptions = {
  /** Log champion/profile progress (default true unless LOLOPTIMA_QUIET=1). */
  verbose?: boolean;
};

export type ChampionMetaEntry = {
  champion: string;
  builds: SerializedBuildResult[];
};

/** Serializable payload for compute-meta parallel workers (stdio subprocess). */
export type ComputeMetaWorkerJob = {
  championNames: string[];
  duelOverrides: DuelAssumptions;
  monteCarloParams: MonteCarloParams;
  simulation?: SimulationScenario;
};

export type ComputeMetaWorkerResult = {
  championBuilds: ChampionMetaEntry[];
  errors: { champion: string; message: string }[];
};

function isEnvTruthy(key: string): boolean {
  const v = process.env[key];
  if (v === undefined || v === "") return false;
  return ["1", "true", "yes", "on"].includes(v.trim().toLowerCase());
}

/** Optimize one champion for meta JSON (all profiles + alts). */
export function computeMetaForChampion(
  champion: Character,
  itemPool: Item[],
  duel: ResolvedDuel,
  mcParams: MonteCarloParams,
  simulation: SimulationScenario | undefined,
  itemByName: Map<string, Item>,
): ChampionMetaEntry | null {
  const recs = recommendBuildsForChampion(champion, itemPool, {
    duel,
    simulation,
    monteCarloParams: mcParams,
    optimizeKeystones: true,
  });
  const builds: SerializedBuildResult[] = recs.map((r) => {
    const its = r.items
      .map((n) => itemByName.get(n))
      .filter((x): x is Item => Boolean(x));
    return serializeBuildRecommendation(champion.Name, r, its);
  });
  if (builds.length === 0) return null;
  return { champion: champion.Name, builds };
}

/** Used by compute-meta script: all champions, best row per profile + alts. */
export function computeMetaForAllChampions(
  champions: Character[],
  itemPool: Item[] = Items,
  duelOverrides?: DuelAssumptions,
  monteCarloOverrides?: MonteCarloParams,
  simulation?: SimulationScenario,
  metaOptions?: ComputeMetaOptions,
): SerializedMeta {
  const duel = resolveDuel(duelOverrides);
  const championBuilds: SerializedMeta["championBuilds"] = [];
  const itemByName = new Map(itemPool.map((i) => [i.name, i] as const));
  const mcParams: MonteCarloParams = {
    iterationsPerRestart: 1200,
    restarts: 6,
    randomProbeSamples: 320,
    ...monteCarloOverrides,
  };
  const mc = resolveMonteCarloParams(mcParams);
  const verbose = metaOptions?.verbose ?? !isEnvTruthy("LOLOPTIMA_QUIET");
  const total = champions.length;
  const log = (msg: string) => {
    if (verbose) console.log(msg);
  };

  log(
    `[compute-meta] Starting ${total} champions | SA ${mc.iterationsPerRestart} iter × ${mc.restarts} restarts | ${mcParams.randomProbeSamples ?? 320} alt probes per profile`,
  );
  log(
    `[compute-meta] Duel: ${duel.targetMaxHP} HP (+${duel.targetBonusHP} bonus), ${duel.targetArmor}/${duel.targetMR} armor/MR, fight length ${duel.comboWindowSeconds != null ? `${duel.comboWindowSeconds}s fixed` : "TTK-derived"}`,
  );
  const runStarted = Date.now();

  for (let i = 0; i < champions.length; i++) {
    const champion = champions[i];
    const label = `[${i + 1}/${total}]`;
    const champStarted = Date.now();
    log(`[compute-meta] ${label} ${champion.Name} — starting`);

    let entry: ChampionMetaEntry | null;
    if (verbose) {
      const recs = recommendBuildsForChampion(champion, itemPool, {
        duel,
        simulation,
        monteCarloParams: mcParams,
        optimizeKeystones: true,
        onProgress: (step) =>
          log(`[compute-meta] ${label} ${champion.Name} — ${step}`),
      });
      const builds: SerializedBuildResult[] = recs.map((r) => {
        const its = r.items
          .map((n) => itemByName.get(n))
          .filter((x): x is Item => Boolean(x));
        return serializeBuildRecommendation(champion.Name, r, its);
      });
      entry = builds.length > 0 ? { champion: champion.Name, builds } : null;
    } else {
      entry = computeMetaForChampion(
        champion,
        itemPool,
        duel,
        mcParams,
        simulation,
        itemByName,
      );
    }

    const topDps = entry?.builds[0]?.totalDPS ?? 0;
    const elapsedSec = ((Date.now() - champStarted) / 1000).toFixed(1);
    log(
      `[compute-meta] ${label} ${champion.Name} — done in ${elapsedSec}s (${entry?.builds.length ?? 0} builds, top ${topDps.toFixed(0)} DPS)`,
    );

    if (entry) championBuilds.push(entry);
  }

  const runMin = ((Date.now() - runStarted) / 60_000).toFixed(1);
  log(
    `[compute-meta] Finished ${championBuilds.length}/${total} champions with builds in ${runMin} min`,
  );

  championBuilds.sort(
    (a, b) => (b.builds[0]?.totalDPS ?? 0) - (a.builds[0]?.totalDPS ?? 0),
  );

  return {
    championBuilds,
    generatedAt: new Date().toISOString(),
    duel: metaDuelForTtkScoring(duel),
    simulation,
  };
}

// ---------------------------------------------------------------------------
// Enemy team stats from scraped OP.GG builds
// ---------------------------------------------------------------------------

export type EnemyChampionInput = {
  champion: string;
  items: string[];
  baseStatsLv18: { hp: number; armor: number; mr: number };
};

/**
 * Compute total stats for a single enemy champion given their scraped build.
 * Combines level-18 base stats (from Data Dragon) with item stats.
 */
export function computeEnemyStatsFromBuild(enemy: EnemyChampionInput): {
  maxHP: number;
  bonusHP: number;
  armor: number;
  mr: number;
} {
  const itemStats = extractDefensiveStats(enemy.items);
  const maxHP = enemy.baseStatsLv18.hp + itemStats.hp;
  const bonusHP = itemStats.hp;
  const armor = enemy.baseStatsLv18.armor + itemStats.armor;
  const mr = enemy.baseStatsLv18.mr + itemStats.mr;
  return { maxHP, bonusHP, armor, mr };
}

/** Physical vs magic lean from completed items in a scraped build. */
export function buildDamageAffinityFromItems(
  itemNames: string[],
  isMelee = true,
): { physical: number; magic: number } {
  let physical = 0;
  let magic = 0;

  for (const name of itemNames) {
    const item = resolveItemByDDName(name, isMelee);
    if (!item) continue;
    const s = item.stats;

    magic += (s.ap ?? 0) * 1.2;
    magic += (s.percentMagicPen ?? 0) * 2;
    magic += (s.flatMagicPen ?? 0) * 1.5;
    magic += (s.abilityDamageMultiplicative ?? 0) * 40;
    magic += (s.magicOnHit ?? 0) * 0.5;
    magic += (s.magicDotDamage ?? 0) * 0.3;

    physical += (s.ad ?? 0) * 0.85;
    physical += (s.lethality ?? 0) * 3;
    physical += (s.armorPen ?? 0) * 1.5;
    physical += (s.critChance ?? 0) * 0.6;
    physical += (s.attackSpeed ?? 0) * 0.35;
    physical += (s.physicalOnHitCurrentHealthPercent ?? 0) * 4;
    physical += (s.physicalOnHitMaxHealthPercent ?? 0) * 4;
    physical += (s.physicalOnHitBaseADPercent ?? 0) * 0.4;
    physical += (s.adMultiplicative ?? 0) * 2;
  }

  return { physical, magic };
}

/**
 * Incoming physical damage share for one enemy: kit rotation + item build.
 */
export function estimateEnemyIncomingPhysShare(
  enemy: EnemyChampionInput,
  level = 18,
): number {
  const champ = Characters.find((c) => c.Name === enemy.champion);
  const isMelee = champ ? champ.AttackRange <= 250 : true;

  let kitShare = 0.5;
  if (champ) {
    kitShare = championIncomingPhysShare(champ, level);
  }

  const aff = buildDamageAffinityFromItems(enemy.items, isMelee);
  const itemTotal = aff.physical + aff.magic;
  const itemShare =
    itemTotal > 0 ? aff.physical / itemTotal : kitShare;

  return clamp(kitShare * 0.6 + itemShare * 0.4, 0.05, 0.95);
}

export type AverageEnemyTeamStats = {
  targetMaxHP: number;
  targetBonusHP: number;
  targetArmor: number;
  targetMR: number;
  incomingPhysShare: number;
  targetPhysicalShieldEHP: number;
  targetMagicShieldEHP: number;
  targetSpellShieldBlockChance: number;
  targetProjectileBlockChance: number;
  avgAntiShieldScore: number;
  targetHealReductionPercent: number;
};

/**
 * Average the stats of 1-5 enemy champions into DuelAssumptions fields.
 */
export function averageEnemyTeamStats(
  enemies: EnemyChampionInput[],
): AverageEnemyTeamStats {
  if (enemies.length === 0) {
    return {
      targetMaxHP: 3000,
      targetBonusHP: 1000,
      targetArmor: 100,
      targetMR: 100,
      incomingPhysShare: 0.5,
      targetPhysicalShieldEHP: 0,
      targetMagicShieldEHP: 0,
      targetSpellShieldBlockChance: 0,
      targetProjectileBlockChance: 0,
      avgAntiShieldScore: 0,
      targetHealReductionPercent: 0,
    };
  }

  let totalHP = 0;
  let totalBonusHP = 0;
  let totalArmor = 0;
  let totalMR = 0;
  let totalPhysShare = 0;
  let maxGrievous = 0;

  const combatInputs: Array<{
    champion: string;
    maxHP: number;
    items: string[];
    isMelee?: boolean;
  }> = [];

  for (const enemy of enemies) {
    const s = computeEnemyStatsFromBuild(enemy);
    totalHP += s.maxHP;
    totalBonusHP += s.bonusHP;
    totalArmor += s.armor;
    totalMR += s.mr;
    totalPhysShare += estimateEnemyIncomingPhysShare(enemy);
    const champ = Characters.find((c) => c.Name === enemy.champion);
    maxGrievous = Math.max(
      maxGrievous,
      healReductionFromEnemyItems(
        enemy.items,
        champ ? champ.AttackRange <= 250 : true,
      ),
    );
    combatInputs.push({
      champion: enemy.champion,
      maxHP: s.maxHP,
      items: enemy.items,
      isMelee: champ ? champ.AttackRange <= 250 : true,
    });
  }

  const combat = aggregateEnemyCombatTraits(combatInputs);

  const n = enemies.length;
  return {
    targetMaxHP: Math.round(totalHP / n),
    targetBonusHP: Math.round(totalBonusHP / n),
    targetArmor: Math.round(totalArmor / n),
    targetMR: Math.round(totalMR / n),
    incomingPhysShare: totalPhysShare / n,
    targetPhysicalShieldEHP: combat.targetPhysicalShieldEHP,
    targetMagicShieldEHP: combat.targetMagicShieldEHP,
    targetSpellShieldBlockChance: combat.targetSpellShieldBlockChance,
    targetProjectileBlockChance: combat.targetProjectileBlockChance,
    avgAntiShieldScore: combat.avgAntiShieldScore,
    targetHealReductionPercent: maxGrievous,
  };
}
