//import { writeFileSync } from "fs";
//import { join } from "path";

type ScalingValue = number | number[] | ((level: number) => number);

interface DamageScaling {
  baseDamage?: ScalingValue;
  adRatio?: ScalingValue;
  apRatio?: ScalingValue;
  bonusAdRatio?: ScalingValue;
  bonusHPRatio?: ScalingValue; // % of self's bonus HP as damage (e.g., Cho'Gath R)
  bonusMRRatio?: ScalingValue; // % of self's bonus MR as damage (e.g., Galio passive)
  maxHealthRatio?: ScalingValue;
  maxHealthRatioPerAP?: number;
  maxHealthRatioPerAD?: number; // Additional % max HP per 100 total AD
  maxHealthRatioPerBonusAD?: number; // Additional % max HP per 100 bonus AD
  currentHealthRatio?: ScalingValue;
  currentHealthRatioPerAP?: number;
  missingHealthRatio?: ScalingValue; // % of target's missing HP
  missingHealthRatioPerAP?: number; // Additional % missing HP per 100 AP
  maxManaRatio?: ScalingValue; // % of self's max mana as damage (e.g., Blitzcrank R passive)
  damageType: "physical" | "magic" | "true" | "adaptive";
}

interface CooldownInfo {
  cooldown: ScalingValue;
  staticCooldown?: number;
  cooldownType?: "standard" | "static" | "ammo";
}

interface CastInfo {
  castTime?: number;
  range?: number | { min: number; max: number };
  width?: number;
  radius?: number;
  speed?: number;
}

interface EffectInfo {
  duration?: number;
  ccType?: "knockup" | "slow" | "stun" | "root" | "fear" | "pull";
  ccDuration?: number;
  slow?: ScalingValue;
  heal?: ScalingValue;
  shield?: ScalingValue;
  bonusStats?: {
    ad?: ScalingValue;
    ap?: ScalingValue;
    armor?: ScalingValue;
    mr?: ScalingValue;
    ms?: ScalingValue;
    as?: ScalingValue;
  };
}

// Rune System Types and Interfaces
type RunePath =
  | "Precision"
  | "Domination"
  | "Sorcery"
  | "Resolve"
  | "Inspiration";
type RuneSlot =
  | "keystone"
  | "slot1"
  | "slot2"
  | "slot3"
  | "statShard1"
  | "statShard2"
  | "statShard3";
type RuneEffectType = "onHit" | "onAbilityHit" | "statBuff" | "conditional";
type RuneTrigger =
  | "onAttack"
  | "onThirdHit"
  | "on3UniqueHits"
  | "perStack"
  | "conditional"
  | "passive";

interface StackingBehavior {
  maxStacks: number;
  stackDuration?: number;
  statsPerStack?: Partial<ItemStats>;
  damagePerStack?: DamageScaling;
}

interface RuneCondition {
  type: "targetHealthPercent" | "targetHealthDifference";
  threshold?: number;
  operator?: "<" | ">" | "<=" | ">=";
}

interface RuneEffect {
  type: RuneEffectType;
  trigger: RuneTrigger;
  damage?: DamageScaling;
  cooldown?: number;
  stackingBehavior?: StackingBehavior;
  conditions?: RuneCondition[];
  statMultiplier?: number; // For Coup de Grace, First Strike, etc.
}

export interface Rune {
  name: string;
  path: RunePath | null; // null for stat shards
  slot: RuneSlot;
  description: string;
  stats?: Partial<ItemStats>;
  effects?: RuneEffect[];
}

export interface RunePage {
  primaryPath: RunePath;
  keystone: Rune;
  primaryRunes: [Rune, Rune, Rune];
  secondaryPath: RunePath;
  secondaryRunes: [Rune, Rune];
  statShards: [Rune, Rune, Rune];
}

class Ability {
  name: string;
  abilityType: "passive" | "Q" | "W" | "E" | "R";
  description: string;
  cooldown: CooldownInfo;
  castInfo?: CastInfo;
  damage?: DamageScaling;
  burstDamage?: DamageScaling; // One-time burst damage at combat start
  effects?: EffectInfo;
  maxCasts?: number;
  recastWindow?: number;
  specialMechanics?: string[];
  appliesOnHit?: boolean;

  constructor(
    name: string,
    abilityType: "passive" | "Q" | "W" | "E" | "R",
    description: string,
    cooldown: CooldownInfo,
    castInfo?: CastInfo,
    damage?: DamageScaling,
    effects?: EffectInfo,
    maxCasts?: number,
    recastWindow?: number,
    specialMechanics?: string[],
    appliesOnHit?: boolean,
    burstDamage?: DamageScaling,
  ) {
    this.name = name;
    this.abilityType = abilityType;
    this.description = description;
    this.cooldown = cooldown;
    this.castInfo = castInfo;
    this.damage = damage;
    this.effects = effects;
    this.maxCasts = maxCasts;
    this.recastWindow = recastWindow;
    this.specialMechanics = specialMechanics;
    this.appliesOnHit = appliesOnHit;
    this.burstDamage = burstDamage;
  }

  getValueAtLevel(value: ScalingValue, level: number): number {
    if (typeof value === "number") return value;
    if (typeof value === "function") return value(level);
    if (Array.isArray(value))
      return value[Math.min(level - 1, value.length - 1)];
    return 0;
  }

  getDamageAtLevel(
    abilityLevel: number,
    targetAD: number = 0,
    targetAP: number = 0,
  ): number {
    if (!this.damage) return 0;

    let totalDamage = 0;

    if (this.damage.baseDamage) {
      totalDamage += this.getValueAtLevel(this.damage.baseDamage, abilityLevel);
    }
    if (this.damage.adRatio) {
      totalDamage +=
        (this.getValueAtLevel(this.damage.adRatio, abilityLevel) / 100) *
        targetAD;
    }
    if (this.damage.apRatio) {
      totalDamage +=
        (this.getValueAtLevel(this.damage.apRatio, abilityLevel) / 100) *
        targetAP;
    }

    return totalDamage;
  }

  getCooldownAtLevel(abilityLevel: number): number {
    return this.getValueAtLevel(this.cooldown.cooldown, abilityLevel);
  }
}

/** How many damage instances to apply per rotation/combo (fixes mis-tagged durations). */
export function effectiveAbilityCasts(ability: Ability): number {
  const mc = ability.maxCasts ?? 1;
  const notes = ability.specialMechanics?.join(" ").toLowerCase() ?? "";
  if (
    notes.includes("damage already totaled") ||
    notes.includes("already totaled for all")
  ) {
    return 1;
  }
  if (ability.recastWindow != null && mc <= ability.recastWindow) return 1;
  if (notes.includes("recast window") && mc <= 6) return 1;
  if (notes.includes("nearsight:") && ability.abilityType === "R") return 1;
  if (mc > 10) return 1;
  return Math.max(1, mc);
}

/** Sheen-line internal cooldown (~1.5s) limits on-hit proc uptime while attacking. */
export function spellbladeOnHitUptime(attacksPerSecond: number): number {
  if (attacksPerSecond <= 0) return 0;
  const sheenCd = 1.5;
  return (
    (attacksPerSecond * sheenCd) / (1 + attacksPerSecond * sheenCd)
  );
}

// Aatrox's Abilities
const AatroxPassive = new Ability(
  "Deathbringer Stance",
  "passive",
  "Periodically empowers basic attack to deal bonus physical damage based on target's max HP",
  {
    cooldown: (level: number) => 24 - ((level - 1) * 12) / 17,
    staticCooldown: 24,
    cooldownType: "static",
  },
  {
    range: 225,
  },
  {
    baseDamage: 0,
    maxHealthRatio: (level: number) => 4 + ((level - 1) * 8) / 17,
    damageType: "physical",
  },
  {
    heal: 100, // Heals for 100% of post-mitigation damage dealt (25% vs minions)
  },
  undefined,
  undefined,
  [
    "Cooldown reduced by 2s on champion/large monster hit",
    "Reduced by 4s on Q sweetspot hit",
  ],
);

// Q ability - All 3 casts combined for DPS
const AATROX_Q_SWEETSPOT_RATE = 0.65;
const AatroxQ = new Ability(
  "The Darkin Blade",
  "Q",
  "Three-part strike dealing physical damage. Sweetspots deal 70% bonus and knock up.",
  {
    cooldown: [14, 12, 10, 8, 6],
    cooldownType: "standard",
  },
  {
    castTime: 0.6,
    range: 625,
  },
  {
    // Q1: 10-70 + 60-90% AD, Q2: ×1.25, Q3: ×1.5
    // Total base (no sweetspot): 37.5-262.5, Total AD ratio (no sweetspot): 225-337.5%
    // Sweetspot multiplier: ×1.7 per hit; blended = 1 + 0.7 × sweetspot_rate
    // At 65% sweetspot rate: blended = 1.455
    // Total base: [55, 137, 219, 300, 382], Total AD ratio: ~327-491%
    baseDamage: [55, 137, 219, 300, 382],
    adRatio: Math.round(337.5 * (1 + 0.7 * AATROX_Q_SWEETSPOT_RATE)),
    damageType: "physical",
  },
  {
    ccType: "knockup",
    ccDuration: 0.25,
  },
  undefined, // damage already totaled
  1,
  [
    "3 casts, 1s between each",
    "Sweetspot: +70% damage, knockup",
    "Q1: 10/25/40/55/70 (+60-90% AD)",
    "Q2: +25% damage",
    "Q3: +50% damage",
  ],
);

const AatroxW = new Ability(
  "Infernal Chains",
  "W",
  "Sends chain that damages and slows. If target stays in area, pulls them back and damages again.",
  {
    cooldown: [20, 18, 16, 14, 12],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 825,
    width: 160,
    speed: 1800,
  },
  {
    baseDamage: [30, 40, 50, 60, 70],
    adRatio: 40,
    damageType: "physical",
  },
  {
    duration: 1.5,
    ccType: "slow",
    slow: [25, 27.5, 30, 32.5, 35],
    ccDuration: 1.5,
  },
  undefined,
  undefined,
  [
    "Double damage vs minions",
    "If tether not broken: pulls and damages again",
    "Reveals target",
  ],
);

const AatroxE = new Ability(
  "Umbral Dash",
  "E",
  "Dashes in target direction. Passive: heals for damage dealt to champions.",
  {
    cooldown: [9, 8, 7, 6, 5],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 300,
    speed: 1340,
  },
  undefined,
  {
    heal: 16, // 16% base + 1.1% per 100 bonus HP
  },
  undefined,
  undefined,
  [
    "Resets basic attack",
    "Can be cast during other abilities",
    "Passive: heal for 16% damage to champions",
  ],
);

const AatroxR = new Ability(
  "World Ender",
  "R",
  "Unleashes true form, gaining MS, AD, increased healing, and extending duration on takedowns.",
  {
    cooldown: [120, 100, 80],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    radius: 600,
  },
  undefined,
  {
    duration: 10,
    bonusStats: {
      ad: [20, 30, 40],
      ms: [60, 80, 100],
    },
  },
  undefined,
  undefined,
  [
    "Self-buff only, no CC",
    "Extends 5s on takedown",
    "50/75/100% increased self-healing",
    "Ghosted",
  ],
);

// Item system
interface ItemStats {
  // Base stats
  hp?: number;
  mana?: number;
  ad?: number;
  ap?: number;
  armor?: number;
  mr?: number;
  abilityHaste?: number;
  basicAbilityHaste?: number; // Ability haste that only affects basic abilities (Q/W/E), not ultimate
  ultAbilityHaste?: number; // Ability haste that only affects ultimate (R)
  attackSpeed?: number; // Bonus AS percentage
  critChance?: number;
  critDmg?: number;
  lifeSteal?: number;
  omnivamp?: number;
  ms?: number;
  msPercent?: number;
  lethality?: number;
  armorPen?: number;
  armorReduction?: number; // % armor reduction on target
  flatMagicPen?: number; // Flat magic penetration (e.g., Shadowflame 15)
  percentMagicPen?: number; // % magic penetration (e.g., Void Staff 40%)
  magicResistReduction?: number; // % MR reduction on target
  healthRegen?: number;
  manaRegen?: number;
  attackRange?: number;

  // On-hit damage
  magicOnHit?: number; // Flat magic damage on basic attacks
  magicOnHitBaseADPercent?: number; // % base AD as magic damage on-hit (e.g., 100 = 100% base AD)
  magicOnHitAPRatio?: number; // % AP as magic damage on-hit (e.g., 10 = 10% AP)
  physicalOnHit?: number; // Flat physical damage on basic attacks
  physicalOnHitCurrentHealthPercent?: number; // % current health as physical damage on-hit
  physicalOnHitMaxHealthPercent?: number; // % max health as physical damage on-hit (e.g., 6 = 6% max HP)
  physicalOnHitBaseADPercent?: number; // % base AD as physical damage on-hit (Spellblade-type)
  physicalOnHitMaxManaPercent?: number; // % max mana as physical damage on-hit (e.g., 1.2 = 1.2% max mana)
  physicalAoEOnHitADPercent?: number; // % AD as physical AoE damage on-hit (e.g., 40 = 40% AD to nearby enemies on each basic attack)
  physicalAoEOnHitMaxHealthPercent?: number; // % max HP as physical AoE damage on-hit (e.g., 3 = 3% max HP to nearby enemies on each basic attack)
  magicPeriodicOnHit?: number; // Flat magic damage averaged per auto-attack from periodic/energized effects (e.g., 6.25 = 100 damage every 16 autos)

  // On-ability-hit damage (procced by abilities)
  trueOnAbilityHit?: number; // Flat true damage on next ability hit
  trueOnAbilityHitPerLethality?: number; // True damage per lethality on next ability hit
  physicalOnAbilityHitMaxManaPercent?: number; // % max mana as physical damage on ability hit (e.g., 4 = 4% max mana)

  // DoT (Damage over Time) effects - total damage or DPS
  magicDotDamage?: number; // Flat magic damage from DoT
  magicDotDamagePerAPRatio?: number; // % AP as magic damage from DoT (e.g., 6 = 6% AP)
  magicDotDamagePerBonusHPRatio?: number; // % bonus HP as magic damage from DoT (e.g., 1 = 1% bonus HP per second)
  magicDotDamagePerTargetMaxHPRatio?: number; // % target max HP as magic damage from DoT (e.g., 2 = 2% target max HP per second)

  // Burst damage (one-time at combat start)
  physicalBurstDamage?: number; // Flat physical burst damage
  physicalBurstDamagePerADRatio?: number; // % AD as physical burst damage
  physicalBurstDamagePerBonusADRatio?: number; // % bonus AD as physical burst damage
  magicBurstDamage?: number; // Flat magic burst damage
  magicBurstDamagePerAPRatio?: number; // % AP as magic burst damage
  magicBurstDamagePerTargetMaxHPRatio?: number; // % target max HP as magic burst damage
  trueBurstDamage?: number; // Flat true burst damage

  // Cooldown mechanics
  ultCooldownRefundOnTakedown?: number; // % of ultimate cooldown refunded on takedown
  ultCooldownRefundPerLethalityOnTakedown?: number; // % per lethality added to refund
  basicAbilityCooldownReductionOnAttack?: number; // % basic ability cooldown reduction on-attack (e.g., 15 = 15% CDR on-attack)

  // Damage multipliers - naming: [RangeType][DamageType][StatType]Multiplicative
  // RangeType: Melee, Ranged, or omitted for both
  // DamageType: Physical, Magic, True, Ability, or omitted for all
  // Examples: MeleePhysicalDamageMultiplicative, AbilityDamageMultiplicative
  abilityDamageMultiplicative?: number; // % increased ability damage
  physicalDamageMultiplicative?: number; // % increased physical damage
  magicDamageMultiplicative?: number; // % increased magic damage
  adMultiplicative?: number; // % increased AD (e.g., 12 = 12% increased AD)
  apMultiplicative?: number; // % increased AP (e.g., 30 = 30% increased AP)
  bonusHPMultiplicative?: number; // % increased bonus HP (e.g., 12 = 12% increased bonus HP)

  // Debuff damage amplification - applied to target
  damageAmplificationOnTarget?: number; // % increased damage target takes from all sources
  damagePerTargetBonusHPPercent?: number; // % increased damage per 100 target bonus HP (e.g., 1.5 = 1.5% per 100 bonus HP, max 15% at 1000 bonus HP)
  /**
   * Execute champions when post-mitigation damage would leave them at or below this
   * % of **maximum** health (The Collector Death = 5).
   */
  executeMaxHealthThresholdPercent?: number;
  /** Sustain from item passives (heal nova, etc.) — folded into EHP in optimizer. */
  sustainHealPerSecond?: number;
  sustainHealPerSecondAPPercent?: number;

  // Scaling multipliers - for stats that scale with other stats
  abilityDamagePerManaMultiplicative?: number; // % per mana point
  abilityDamagePerAPMultiplicative?: number; // % per AP point
  apPerBurnedTargetMultiplicative?: number; // % AP increase per burned/afflicted target
  apPerManaRegenMultiplicative?: number; // AP increase per 100% base mana regen (e.g., 10 = 10 AP per 100% mana regen)
  adPerMaxManaPercent?: number; // Bonus AD per % max mana (e.g., 2 = 2% of max mana as bonus AD)
  adPerBonusHPPercent?: number; // Bonus AD per % bonus HP (e.g., 2.5 = 2.5% of bonus HP as bonus AD)
  adPerBaseADPercent?: number; // Bonus AD per % base AD (e.g., 45 = 45% of base AD as bonus AD)
  apPerBonusHPPercent?: number; // Bonus AP per % bonus HP (e.g., 2 = 2% of bonus HP as bonus AP)
  apPerBonusManaPercent?: number; // Bonus AP per % bonus mana (e.g., 1 = 1% of bonus mana as bonus AP)
  hpPerBonusManaPercent?: number; // Bonus HP per % bonus mana (e.g., 15 = 15% of bonus mana as bonus HP)
  damageMultiplicative?: number; // % increased damage (all types) (e.g., 8 = 8% increased damage)
}

class Item {
  name: string;
  stats: ItemStats;
  passives: Ability[];
  groupName?: string; // Items with same groupName can't be equipped together

  constructor(
    name: string,
    stats: ItemStats,
    passives: Ability[] = [],
    groupName?: string,
  ) {
    this.name = name;
    this.stats = stats;
    this.passives = passives;
    this.groupName = groupName;
  }

  getTotalStat(statName: keyof ItemStats): number {
    return this.stats[statName] ?? 0;
  }

  // Get effective group name (use item name if no group specified)
  getGroupName(): string {
    return this.groupName || this.name;
  }
}

const AbyssalMask = new Item(
  "Abyssal Mask",
  {
    abilityHaste: 15,
    mr: 45,
    hp: 350,
    magicDamageMultiplicative: 12,
  },
  [],
  "Abyssal Mask",
);

const AbyssalMaskDistanced = new Item(
  "Abyssal Mask (Distanced)",
  {
    abilityHaste: 15,
    mr: 45,
    hp: 350,
  },
  [],
  "Abyssal Mask",
);

const Actualizer = new Item(
  "Actualizer",
  {
    ap: 90,
    abilityHaste: 10,
    mana: 300,
    abilityDamageMultiplicative: 15,
    abilityDamagePerManaMultiplicative: 0.005,
  },
  [],
  "Actualizer",
);

const ArchangelsStaff = new Item(
  "Archangel's Staff",
  {
    ap: 70,
    abilityHaste: 25,
    mana: 600,
    apPerBonusManaPercent: 1,
  },
  [],
  "Lifeline",
);

const ArchangelsStaffMaxStacks = new Item(
  "Archangel's Staff (Max Stacks)",
  {
    ap: 70,
    abilityHaste: 25,
    mana: 960,
    apPerBonusManaPercent: 1,
  },
  [],
  "Lifeline",
);

const SeraphsEmbrace = new Item(
  "Seraph's Embrace",
  {
    ap: 70,
    abilityHaste: 25,
    mana: 1000,
    abilityDamagePerAPMultiplicative: 0.02,
  },
  [],
  "Lifeline",
);

const ArdentCenser = new Item(
  "Ardent Censer",
  {
    ap: 45,
    manaRegen: 125,
    msPercent: 4,
  },
  [],
  "Ardent Censer",
);

const ArdentCenserSanctify = new Item(
  "Ardent Censer (Sanctify)",
  {
    ap: 45,
    manaRegen: 125,
    msPercent: 4,
    attackSpeed: 25,
    magicOnHit: 20,
  },
  [],
  "Ardent Censer",
);

const AxiomArc = new Item(
  "Axiom Arc",
  {
    ad: 55,
    abilityHaste: 20,
    lethality: 18,
    ultCooldownRefundOnTakedown: 15,
    ultCooldownRefundPerLethalityOnTakedown: 0.15,
  },
  [],
  "Axiom Arc",
);

const Bandlepipes = new Item(
  "Bandlepipes",
  {
    abilityHaste: 15,
    armor: 20,
    mr: 20,
    hp: 200,
  },
  [],
  "Bandlepipes",
);

const BandlepipesFanfareMelee = new Item(
  "Bandlepipes (Fanfare Melee)",
  {
    abilityHaste: 15,
    armor: 20,
    mr: 20,
    hp: 200,
    ms: 20,
    attackSpeed: 30,
  },
  [],
  "Bandlepipes",
);

const BandlepipesFanfareRanged = new Item(
  "Bandlepipes (Fanfare Ranged)",
  {
    abilityHaste: 15,
    armor: 20,
    mr: 20,
    hp: 200,
    ms: 20,
    attackSpeed: 20,
  },
  [],
  "Bandlepipes",
);

const BansheesVeil = new Item(
  "Banshee's Veil",
  {
    ap: 105,
    mr: 40,
  },
  [],
  "Annul",
);

const Bastionbreaker = new Item(
  "Bastionbreaker",
  {
    ad: 55,
    abilityHaste: 15,
    lethality: 22,
  },
  [],
  "Bastionbreaker",
);

const BastionbreakerShapedChargeMelee = new Item(
  "Bastionbreaker (Shaped Charge Melee)",
  {
    ad: 55,
    abilityHaste: 15,
    lethality: 22,
    trueOnAbilityHit: 30,
    trueOnAbilityHitPerLethality: 1.5,
  },
  [],
  "Bastionbreaker",
);

const BastionbreakerShapedChargeRanged = new Item(
  "Bastionbreaker (Shaped Charge Ranged)",
  {
    ad: 55,
    abilityHaste: 15,
    lethality: 22,
    trueOnAbilityHit: 15,
    trueOnAbilityHitPerLethality: 0.75,
  },
  [],
  "Bastionbreaker",
);

const BlackCleaver = new Item(
  "Black Cleaver",
  {
    ad: 40,
    abilityHaste: 20,
    hp: 400,
  },
  [],
  "Fatality",
);

const BlackCleaverCarve = new Item(
  "Black Cleaver (Carve 5 stacks)",
  {
    ad: 40,
    abilityHaste: 20,
    hp: 400,
    armorReduction: 30,
  },
  [],
  "Fatality",
);

const BlackCleaverFervor = new Item(
  "Black Cleaver (Fervor)",
  {
    ad: 40,
    abilityHaste: 20,
    hp: 400,
    ms: 20,
  },
  [],
  "Fatality",
);

const BlackCleaverCarveFervor = new Item(
  "Black Cleaver (Carve + Fervor)",
  {
    ad: 40,
    abilityHaste: 20,
    hp: 400,
    armorReduction: 30,
    ms: 20,
  },
  [],
  "Fatality",
);

const BlackfireTorch = new Item(
  "Blackfire Torch",
  {
    ap: 80,
    abilityHaste: 20,
    mana: 600,
    magicDotDamage: 60,
    magicDotDamagePerAPRatio: 6,
  },
  [],
  "Blackfire Torch",
);

const BlackfireTorch1Stack = new Item(
  "Blackfire Torch (1 stack)",
  {
    ap: 80,
    abilityHaste: 20,
    mana: 600,
    magicDotDamage: 60,
    magicDotDamagePerAPRatio: 6,
    apPerBurnedTargetMultiplicative: 4,
  },
  [],
  "Blackfire Torch",
);

const BlackfireTorch3Stacks = new Item(
  "Blackfire Torch (3 stacks)",
  {
    ap: 80,
    abilityHaste: 20,
    mana: 600,
    magicDotDamage: 60,
    magicDotDamagePerAPRatio: 6,
    apPerBurnedTargetMultiplicative: 12,
  },
  [],
  "Blackfire Torch",
);

const BlackfireTorch5Stacks = new Item(
  "Blackfire Torch (5 stacks)",
  {
    ap: 80,
    abilityHaste: 20,
    mana: 600,
    magicDotDamage: 60,
    magicDotDamagePerAPRatio: 6,
    apPerBurnedTargetMultiplicative: 20,
  },
  [],
  "Blackfire Torch",
);

const BladeOfTheRuinedKing = new Item(
  "Blade of the Ruined King",
  {
    ad: 40,
    attackSpeed: 25,
    lifeSteal: 10,
  },
  [],
  "Blade of the Ruined King",
);

const BladeOfTheRuinedKingMelee = new Item(
  "Blade of the Ruined King (Melee)",
  {
    ad: 40,
    attackSpeed: 25,
    lifeSteal: 10,
    physicalOnHitCurrentHealthPercent: 9,
  },
  [],
  "Blade of the Ruined King",
);

const BladeOfTheRuinedKingRanged = new Item(
  "Blade of the Ruined King (Ranged)",
  {
    ad: 40,
    attackSpeed: 25,
    lifeSteal: 10,
    physicalOnHitCurrentHealthPercent: 6,
  },
  [],
  "Blade of the Ruined King",
);

const BloodlettersCurse = new Item(
  "Bloodletter's Curse",
  {
    ap: 65,
    abilityHaste: 15,
    hp: 400,
  },
  [],
  "Blight",
);

const BloodlettersCurse1Stack = new Item(
  "Bloodletter's Curse (1 stack)",
  {
    ap: 65,
    abilityHaste: 15,
    hp: 400,
    magicResistReduction: 7.5,
  },
  [],
  "Blight",
);

const BloodlettersCurse2Stacks = new Item(
  "Bloodletter's Curse (2 stacks)",
  {
    ap: 65,
    abilityHaste: 15,
    hp: 400,
    magicResistReduction: 15,
  },
  [],
  "Blight",
);

const BloodlettersCurse3Stacks = new Item(
  "Bloodletter's Curse (3 stacks)",
  {
    ap: 65,
    abilityHaste: 15,
    hp: 400,
    magicResistReduction: 22.5,
  },
  [],
  "Blight",
);

const BloodlettersCurse4Stacks = new Item(
  "Bloodletter's Curse (4 stacks)",
  {
    ap: 65,
    abilityHaste: 15,
    hp: 400,
    magicResistReduction: 30,
  },
  [],
  "Blight",
);

const BountyOfWorlds = new Item(
  "Bounty of Worlds",
  {
    hp: 200,
    healthRegen: 75,
    manaRegen: 75,
  },
  [],
  "Support / Jungle",
);

const CelestialOpposition = new Item(
  "Celestial Opposition",
  {
    hp: 200,
    healthRegen: 75,
    manaRegen: 75,
  },
  [],
  "Support / Jungle",
);

const DreamMaker = new Item(
  "Dream Maker",
  {
    hp: 200,
    healthRegen: 75,
    manaRegen: 75,
  },
  [],
  "Support / Jungle",
);

const ImperialMandate = new Item(
  "Imperial Mandate",
  {
    ap: 60,
    abilityHaste: 20,
    manaRegen: 125,
  },
  [],
  "Imperial Mandate",
);

const MoonstoneRenewer = new Item(
  "Moonstone Renewer",
  {
    ap: 25,
    abilityHaste: 20,
    hp: 200,
    manaRegen: 125,
  },
  [],
  "Moonstone Renewer",
);

const Bloodsong = new Item(
  "Bloodsong",
  {
    hp: 200,
    healthRegen: 75,
    manaRegen: 75,
  },
  [],
  "Spellblade",
);

const BloodsongSpellblade = new Item(
  "Bloodsong (Spellblade)",
  {
    hp: 200,
    healthRegen: 75,
    manaRegen: 75,
    physicalOnHitBaseADPercent: 100,
  },
  [],
  "Spellblade",
);

const BloodsongExposeWeaknessMelee = new Item(
  "Bloodsong (Expose Weakness Melee)",
  {
    hp: 200,
    healthRegen: 75,
    manaRegen: 75,
    physicalOnHitBaseADPercent: 100,
    damageAmplificationOnTarget: 8,
  },
  [],
  "Spellblade",
);

const BloodsongExposeWeaknessRanged = new Item(
  "Bloodsong (Expose Weakness Ranged)",
  {
    hp: 200,
    healthRegen: 75,
    manaRegen: 75,
    physicalOnHitBaseADPercent: 100,
    damageAmplificationOnTarget: 5,
  },
  [],
  "Spellblade",
);

const Bloodthirster = new Item(
  "Bloodthirster",
  {
    ad: 80,
    lifeSteal: 15,
  },
  [],
  "Bloodthirster",
);

const ChempunkChainsword = new Item(
  "Chempunk Chainsword",
  {
    ad: 45,
    abilityHaste: 15,
    hp: 450,
  },
  [],
  "Chempunk Chainsword",
);

const CosmicDrive = new Item(
  "Cosmic Drive",
  {
    ap: 70,
    abilityHaste: 25,
    hp: 350,
    msPercent: 4,
  },
  [],
  "Cosmic Drive",
);

const CosmicDriveSpelldance = new Item(
  "Cosmic Drive (Spelldance)",
  {
    ap: 70,
    abilityHaste: 25,
    hp: 350,
    msPercent: 4,
    ms: 20,
  },
  [],
  "Cosmic Drive",
);

const Cryptbloom = new Item(
  "Cryptbloom",
  {
    ap: 70,
    abilityHaste: 20,
    percentMagicPen: 30,
    sustainHealPerSecond: 50 / 60,
    sustainHealPerSecondAPPercent: 50 / 60,
  },
  [],
  "Void Pen",
);

const Dawncore = new Item(
  "Dawncore",
  {
    ap: 45,
    manaRegen: 100,
    apPerManaRegenMultiplicative: 10,
  },
  [],
  "Dawncore",
);

const DeadMansPlate = new Item(
  "Dead Man's Plate",
  {
    armor: 55,
    hp: 350,
    msPercent: 4,
  },
  [],
  "Momentum",
);

const DeadMansPlateFullMomentum = new Item(
  "Dead Man's Plate (Full Momentum)",
  {
    armor: 55,
    hp: 350,
    msPercent: 4,
    ms: 20,
    physicalOnHit: 40,
    physicalOnHitBaseADPercent: 100,
  },
  [],
  "Momentum",
);

const DeathsDance = new Item(
  "Death's Dance",
  {
    ad: 60,
    abilityHaste: 15,
    armor: 50,
  },
  [],
  "Death's Dance",
);

const DiademOfSongs = new Item(
  "Diadem of Songs",
  {
    hp: 200,
    mana: 1000,
    manaRegen: 100,
  },
  [],
  "Diadem of Songs",
);

const DuskAndDawn = new Item(
  "Dusk and Dawn",
  {
    ap: 70,
    abilityHaste: 20,
    attackSpeed: 25,
    hp: 300,
  },
  [],
  "Spellblade",
);

const DuskAndDawnSpellblade = new Item(
  "Dusk and Dawn (Spellblade)",
  {
    ap: 70,
    abilityHaste: 20,
    attackSpeed: 25,
    hp: 300,
    magicOnHitBaseADPercent: 100,
    magicOnHitAPRatio: 10,
  },
  [],
  "Spellblade",
);

const EchoesOfHelia = new Item(
  "Echoes of Helia",
  {
    ap: 35,
    abilityHaste: 20,
    hp: 200,
    manaRegen: 125,
  },
  [],
  "Echoes of Helia",
);

const Eclipse = new Item(
  "Eclipse",
  {
    ad: 60,
    abilityHaste: 15,
  },
  [],
  "Eclipse",
);

const EdgeOfNight = new Item(
  "Edge of Night",
  {
    ad: 50,
    lethality: 15,
    hp: 250,
  },
  [],
  "Annul",
);

const EndlessHunger = new Item(
  "Endless Hunger",
  {
    ad: 60,
    omnivamp: 5,
  },
  [],
  "Endless Hunger",
);

const EndlessHungerFeast = new Item(
  "Endless Hunger (Feast)",
  {
    ad: 60,
    omnivamp: 20,
  },
  [],
  "Endless Hunger",
);

const EssenceReaver = new Item(
  "Essence Reaver",
  {
    ad: 50,
    abilityHaste: 20,
    critChance: 25,
  },
  [],
  "Spellblade",
);

const EssenceReaverSpellblade = new Item(
  "Essence Reaver (Spellblade)",
  {
    ad: 50,
    abilityHaste: 20,
    critChance: 25,
    physicalOnHitBaseADPercent: 125,
  },
  [],
  "Spellblade",
);

const ExperimentalHexplate = new Item(
  "Experimental Hexplate",
  {
    ad: 40,
    attackSpeed: 20,
    hp: 450,
  },
  [],
  "Experimental Hexplate",
);

const FiendhunterBolts = new Item(
  "Fiendhunter Bolts",
  {
    attackSpeed: 40,
    critChance: 25,
    msPercent: 4,
  },
  [],
  "Fiendhunter Bolts",
);

const Fimbulwinter = new Item(
  "Fimbulwinter",
  {
    abilityHaste: 15,
    hp: 550,
    mana: 1000,
    hpPerBonusManaPercent: 8,
  },
  [],
  "Manaflow",
);

const ForceOfNature = new Item(
  "Force of Nature",
  {
    mr: 55,
    hp: 400,
    msPercent: 4,
  },
  [],
  "Force of Nature",
);

const ForceOfNatureMaxStacks = new Item(
  "Force of Nature (Max Steadfast)",
  {
    mr: 125,
    hp: 400,
    msPercent: 10,
  },
  [],
  "Force of Nature",
);

const FrozenHeart = new Item(
  "Frozen Heart",
  {
    abilityHaste: 20,
    armor: 75,
    mana: 400,
  },
  [],
  "Frozen Heart",
);

const GuardianAngel = new Item(
  "Guardian Angel",
  {
    ad: 55,
    armor: 45,
  },
  [],
  "Guardian Angel",
);

const GuinsoosRageblade = new Item(
  "Guinsoo's Rageblade",
  {
    ad: 30,
    ap: 30,
    attackSpeed: 25,
    magicOnHit: 30,
  },
  [],
  "Guinsoo's Rageblade",
);

const GuinsoosRagebladeMaxStacks = new Item(
  "Guinsoo's Rageblade (Max Stacks)",
  {
    ad: 30,
    ap: 30,
    attackSpeed: 57,
    magicOnHit: 30,
  },
  [],
  "Guinsoo's Rageblade",
);

const Heartsteel = new Item(
  "Heartsteel",
  {
    hp: 900,
    healthRegen: 100,
  },
  [],
  "Heartsteel",
);

const HeartsteelConsumption = new Item(
  "Heartsteel (Colossal Consumption)",
  {
    hp: 900,
    healthRegen: 100,
    physicalOnHit: 70,
    physicalOnHitMaxHealthPercent: 6,
  },
  [],
  "Heartsteel",
);

const Heartsteel500Stacks = new Item(
  "Heartsteel (500 Stacks)",
  {
    hp: 900 + 500,
    healthRegen: 100,
    physicalOnHit: 70,
    physicalOnHitMaxHealthPercent: 6,
  },
  [],
  "Heartsteel",
);

const HexopticsC44 = new Item(
  "Hexoptics C44",
  {
    ad: 50,
    critChance: 25,
  },
  [],
  "Hexoptics C44",
);

const HexopticsC44ArcaneAim = new Item(
  "Hexoptics C44 (Arcane Aim)",
  {
    ad: 50,
    critChance: 25,
    attackRange: 100,
  },
  [],
  "Hexoptics C44",
);

const HextechGunblade = new Item(
  "Hextech Gunblade",
  {
    ad: 40,
    ap: 80,
    omnivamp: 10,
  },
  [],
  "Hextech Gunblade",
);

const HextechRocketbelt = new Item(
  "Hextech Rocketbelt",
  {
    ap: 70,
    abilityHaste: 20,
    hp: 300,
  },
  [],
  "Hextech Rocketbelt",
);

const HollowRadiance = new Item(
  "Hollow Radiance",
  {
    abilityHaste: 10,
    mr: 40,
    hp: 400,
    healthRegen: 100,
    magicDotDamage: 15,
    magicDotDamagePerBonusHPRatio: 1,
  },
  [],
  "Immolate",
);

const HorizonFocus = new Item(
  "Horizon Focus",
  {
    ap: 75,
    abilityHaste: 25,
  },
  [],
  "Horizon Focus",
);

const HorizonFocusHypershot = new Item(
  "Horizon Focus (Hypershot)",
  {
    ap: 75,
    abilityHaste: 25,
    damageAmplificationOnTarget: 10,
  },
  [],
  "Horizon Focus",
);

const Hubris = new Item(
  "Hubris",
  {
    ad: 60,
    abilityHaste: 10,
    lethality: 18,
  },
  [],
  "Hubris",
);

const Hubris5Stacks = new Item(
  "Hubris (5 stacks)",
  {
    ad: 85,
    abilityHaste: 10,
    lethality: 18,
  },
  [],
  "Hubris",
);

const Hubris10Stacks = new Item(
  "Hubris (10 stacks)",
  {
    ad: 95,
    abilityHaste: 10,
    lethality: 18,
  },
  [],
  "Hubris",
);

const Hubris20Stacks = new Item(
  "Hubris (20 stacks)",
  {
    ad: 115,
    abilityHaste: 10,
    lethality: 18,
  },
  [],
  "Hubris",
);

const Hullbreaker = new Item(
  "Hullbreaker",
  {
    ad: 40,
    hp: 500,
    msPercent: 4,
  },
  [],
  "Hullbreaker",
);

const HullbreakerSkipperMelee = new Item(
  "Hullbreaker (Skipper Melee)",
  {
    ad: 40,
    hp: 500,
    msPercent: 4,
    physicalOnHitBaseADPercent: 120,
    physicalOnHitMaxHealthPercent: 5,
  },
  [],
  "Hullbreaker",
);

const HullbreakerSkipperRanged = new Item(
  "Hullbreaker (Skipper Ranged)",
  {
    ad: 40,
    hp: 500,
    msPercent: 4,
    physicalOnHitBaseADPercent: 84,
    physicalOnHitMaxHealthPercent: 3.5,
  },
  [],
  "Hullbreaker",
);

const IcebornGauntlet = new Item(
  "Iceborn Gauntlet",
  {
    abilityHaste: 15,
    armor: 50,
    hp: 300,
  },
  [],
  "Spellblade",
);

const IcebornGauntletSpellblade = new Item(
  "Iceborn Gauntlet (Spellblade)",
  {
    abilityHaste: 15,
    armor: 50,
    hp: 300,
    physicalOnHitBaseADPercent: 150,
  },
  [],
  "Spellblade",
);

const ImmortalShieldbow = new Item(
  "Immortal Shieldbow",
  {
    ad: 55,
    critChance: 25,
  },
  [],
  "Lifeline",
);

const InfinityEdge = new Item(
  "Infinity Edge",
  {
    ad: 75,
    critChance: 25,
    critDmg: 30,
  },
  [],
  "Infinity Edge",
);

const JakSho = new Item(
  "Jak'Sho, The Protean",
  {
    armor: 45,
    mr: 45,
    hp: 350,
  },
  [],
  "Jak'Sho, The Protean",
);

const KaenicRookern = new Item(
  "Kaenic Rookern",
  {
    mr: 80,
    hp: 400,
    healthRegen: 100,
  },
  [],
  "Kaenic Rookern",
);

const KnightsVow = new Item(
  "Knight's Vow",
  {
    abilityHaste: 10,
    armor: 40,
    hp: 200,
    healthRegen: 100,
  },
  [],
  "Knight's Vow",
);

const KrakenSlayer = new Item(
  "Kraken Slayer (Base)",
  {
    ad: 45,
    attackSpeed: 40,
    msPercent: 4,
  },
  [],
  "Kraken Slayer",
);

const KrakenSlayerMeleeProc = new Item(
  "Kraken Slayer (Melee Proc)",
  {
    ad: 45,
    attackSpeed: 40,
    msPercent: 4,
    physicalOnHit: 175,
  },
  [],
  "Kraken Slayer",
);

const KrakenSlayerRangedProc = new Item(
  "Kraken Slayer (Ranged Proc)",
  {
    ad: 45,
    attackSpeed: 40,
    msPercent: 4,
    physicalOnHit: 140,
  },
  [],
  "Kraken Slayer",
);

const LiandrysTorment = new Item(
  "Liandry's Torment",
  {
    ap: 60,
    hp: 300,
    magicDotDamagePerTargetMaxHPRatio: 2,
  },
  [],
  "Liandry's Torment",
);

const LocketOfTheIronSolari = new Item(
  "Locket of the Iron Solari",
  {
    abilityHaste: 10,
    armor: 25,
    mr: 25,
    hp: 200,
  },
  [],
  "Locket of the Iron Solari",
);

const LichBane = new Item(
  "Lich Bane",
  {
    ap: 100,
    abilityHaste: 10,
    msPercent: 4,
  },
  [],
  "Spellblade",
);

const LichBaneSpellblade = new Item(
  "Lich Bane (Spellblade)",
  {
    ap: 100,
    abilityHaste: 10,
    msPercent: 4,
    magicOnHitBaseADPercent: 75,
    magicOnHitAPRatio: 40,
  },
  [],
  "Spellblade",
);

const LordDominiksRegards = new Item(
  "Lord Dominik's Regards",
  {
    ad: 35,
    armorPen: 35,
    critChance: 25,
    damagePerTargetBonusHPPercent: 1.5,
  },
  [],
  "Fatality",
);

const LudensEcho = new Item(
  "Luden's Echo",
  {
    ap: 100,
    abilityHaste: 10,
    mana: 600,
  },
  [],
  "Luden's Echo",
);

const Malignance = new Item(
  "Malignance",
  {
    ap: 90,
    abilityHaste: 15,
    mana: 600,
    magicDotDamage: 60,
    magicDotDamagePerAPRatio: 5,
    magicResistReduction: 10,
  },
  [],
  "Malignance",
);

const Morellonomicon = new Item(
  "Morellonomicon",
  {
    ap: 80,
    hp: 350,
    flatMagicPen: 15,
  },
  [],
  "Morellonomicon",
);

const MortalReminder = new Item(
  "Mortal Reminder",
  {
    ad: 30,
    armorPen: 35,
    critChance: 25,
  },
  [],
  "Fatality",
);

const MawOfMalmortius = new Item(
  "Maw of Malmortius (Base)",
  {
    ad: 60,
    abilityHaste: 15,
    mr: 40,
  },
  [],
  "Lifeline",
);

const MawOfMalmortiusLifeline = new Item(
  "Maw (Lifeline Active)",
  {
    ad: 60,
    abilityHaste: 15,
    mr: 40,
    omnivamp: 10,
  },
  [],
  "Lifeline",
);

const MejaisSoulstealer = new Item(
  "Mejai's Soulstealer",
  {
    ap: 20,
    hp: 100,
  },
  [],
  "Glory",
);

const MejaisSoulstealer10Stacks = new Item(
  "Mejai's (10 stacks)",
  {
    ap: 70,
    hp: 100,
    msPercent: 10,
  },
  [],
  "Glory",
);

const MejaisSoulstealer25Stacks = new Item(
  "Mejai's (25 stacks)",
  {
    ap: 145,
    hp: 100,
    msPercent: 10,
  },
  [],
  "Glory",
);

const Manamune = new Item(
  "Manamune",
  {
    ad: 35,
    abilityHaste: 15,
    mana: 500,
    adPerMaxManaPercent: 2,
  },
  [],
  "Manaflow",
);

const MuramanaMelee = new Item(
  "Muramana (Melee)",
  {
    ad: 35,
    abilityHaste: 15,
    mana: 860,
    adPerMaxManaPercent: 2,
    physicalOnHitMaxManaPercent: 1.2,
    physicalOnAbilityHitMaxManaPercent: 4,
  },
  [],
  "Manaflow",
);

const MuramanaRanged = new Item(
  "Muramana (Ranged)",
  {
    ad: 35,
    abilityHaste: 15,
    mana: 860,
    adPerMaxManaPercent: 2,
    physicalOnHitMaxManaPercent: 1.2,
    physicalOnAbilityHitMaxManaPercent: 3,
  },
  [],
  "Manaflow",
);

const MercurialScimitar = new Item(
  "Mercurial Scimitar",
  {
    ad: 50,
    mr: 35,
    lifeSteal: 10,
  },
  [],
  "Quicksilver",
);

const MikaelsBlessing = new Item(
  "Mikael's Blessing",
  {
    abilityHaste: 15,
    hp: 250,
    manaRegen: 100,
  },
  [],
  "Mikael's Blessing",
);

const NashorsTooth = new Item(
  "Nashor's Tooth",
  {
    ap: 80,
    abilityHaste: 15,
    attackSpeed: 50,
    magicOnHit: 15,
    magicOnHitAPRatio: 15,
  },
  [],
  "Nashor's Tooth",
);

const NavoriFlickerblade = new Item(
  "Navori Flickerblade",
  {
    attackSpeed: 40,
    critChance: 25,
    msPercent: 4,
    basicAbilityCooldownReductionOnAttack: 15,
  },
  [],
  "Navori Flickerblade",
);

const OverlordsBloodmail = new Item(
  "Overlord's Bloodmail (Full HP)",
  {
    ad: 30,
    hp: 550,
    adPerBonusHPPercent: 2.5,
    adMultiplicative: 0,
  },
  [],
  "Overlord's Bloodmail",
);

const ProtoplasmHarness = new Item(
  "Protoplasm Harness",
  {
    hp: 200,
    healthRegen: 75,
    manaRegen: 75,
  },
  [],
  "Support / Jungle",
);

const OverlordsBloodmail25MissingHP = new Item(
  "Overlord's Bloodmail (25% Missing HP)",
  {
    ad: 30,
    hp: 550,
    adPerBonusHPPercent: 2.5,
    adMultiplicative: 3,
  },
  [],
  "Overlord's Bloodmail",
);

const OverlordsBloodmail50MissingHP = new Item(
  "Overlord's Bloodmail (50% Missing HP)",
  {
    ad: 30,
    hp: 550,
    adPerBonusHPPercent: 2.5,
    adMultiplicative: 6,
  },
  [],
  "Overlord's Bloodmail",
);

const OverlordsBloodmail75MissingHP = new Item(
  "Overlord's Bloodmail (75% Missing HP)",
  {
    ad: 30,
    hp: 550,
    adPerBonusHPPercent: 2.5,
    adMultiplicative: 9,
  },
  [],
  "Overlord's Bloodmail",
);

const OverlordsBloodmail100MissingHP = new Item(
  "Overlord's Bloodmail (100% Missing HP)",
  {
    ad: 30,
    hp: 550,
    adPerBonusHPPercent: 2.5,
    adMultiplicative: 12,
  },
  [],
  "Overlord's Bloodmail",
);

const PhantomDancer = new Item(
  "Phantom Dancer",
  {
    attackSpeed: 65,
    critChance: 25,
    msPercent: 10,
  },
  [],
  "Phantom Dancer",
);

const ProfaneHydraMelee = new Item(
  "Profane Hydra (Melee)",
  {
    ad: 55,
    abilityHaste: 10,
    lethality: 18,
    physicalAoEOnHitADPercent: 40,
  },
  [],
  "Hydra",
);

const ProfaneHydraRanged = new Item(
  "Profane Hydra (Ranged)",
  {
    ad: 55,
    abilityHaste: 10,
    lethality: 18,
    physicalAoEOnHitADPercent: 20,
  },
  [],
  "Hydra",
);

const RabadonsDeathcap = new Item(
  "Rabadon's Deathcap",
  {
    ap: 130,
    apMultiplicative: 30,
  },
  [],
  "Rabadon's Deathcap",
);

const RanduinsOmen = new Item(
  "Randuin's Omen",
  {
    armor: 80,
    hp: 350,
  },
  [],
  "Randuin's Omen",
);

const RapidFirecannon = new Item(
  "Rapid Firecannon",
  {
    attackSpeed: 35,
    critChance: 25,
    msPercent: 4,
  },
  [],
  "Rapid Firecannon",
);

const RavenousHydraMelee = new Item(
  "Ravenous Hydra (Melee)",
  {
    ad: 65,
    abilityHaste: 10,
    lifeSteal: 12,
    physicalAoEOnHitADPercent: 40,
  },
  [],
  "Hydra",
);

const RavenousHydraRanged = new Item(
  "Ravenous Hydra (Ranged)",
  {
    ad: 65,
    abilityHaste: 10,
    lifeSteal: 12,
    physicalAoEOnHitADPercent: 20,
  },
  [],
  "Hydra",
);

const Redemption = new Item(
  "Redemption",
  {
    abilityHaste: 15,
    hp: 250,
    manaRegen: 125,
  },
  [],
  "Redemption",
);

const Riftmaker = new Item(
  "Riftmaker",
  {
    ap: 70,
    abilityHaste: 15,
    hp: 350,
    apPerBonusHPPercent: 2,
  },
  [],
  "Riftmaker",
);

const RiftmakerMaxStacksMelee = new Item(
  "Riftmaker (Max Stacks, Melee)",
  {
    ap: 70,
    abilityHaste: 15,
    hp: 350,
    apPerBonusHPPercent: 2,
    damageMultiplicative: 8,
    omnivamp: 10,
  },
  [],
  "Riftmaker",
);

const RiftmakerMaxStacksRanged = new Item(
  "Riftmaker (Max Stacks, Ranged)",
  {
    ap: 70,
    abilityHaste: 15,
    hp: 350,
    apPerBonusHPPercent: 2,
    damageMultiplicative: 8,
    omnivamp: 6,
  },
  [],
  "Riftmaker",
);

const RodOfAges = new Item(
  "Rod of Ages",
  {
    ap: 45,
    hp: 350,
    mana: 500,
  },
  [],
  "Eternity",
);

const RodOfAgesMaxStacks = new Item(
  "Rod of Ages (Max Stacks)",
  {
    ap: 75,
    hp: 450,
    mana: 800,
  },
  [],
  "Eternity",
);

const RunaansHurricane = new Item(
  "Runaan's Hurricane",
  {
    attackSpeed: 40,
    critChance: 25,
    msPercent: 4,
  },
  [],
  "Runaan's Hurricane",
);

const RylaisCrystalScepter = new Item(
  "Rylai's Crystal Scepter",
  {
    ap: 75,
    hp: 400,
  },
  [],
  "Rylai's Crystal Scepter",
);

const SerpentsFang = new Item(
  "Serpent's Fang",
  {
    ad: 55,
    lethality: 15,
  },
  [],
  "Serpent's Fang",
);

const SeryldasGrudge = new Item(
  "Serylda's Grudge",
  {
    ad: 45,
    abilityHaste: 15,
    armorPen: 35,
  },
  [],
  "Fatality",
);

const Shadowflame = new Item(
  "Shadowflame",
  {
    ap: 110,
    flatMagicPen: 15,
  },
  [],
  "Shadowflame",
);

const ShurelyasBattlesong = new Item(
  "Shurelya's Battlesong",
  {
    ap: 40,
    abilityHaste: 20,
    hp: 200,
    manaRegen: 125,
  },
  [],
  "Shurelya's Battlesong",
);

const SolsticeSleigh = new Item(
  "Solstice Sleigh",
  {
    hp: 200,
    healthRegen: 75,
    manaRegen: 75,
  },
  [],
  "Support / Jungle",
);

const SpearOfShojin = new Item(
  "Spear of Shojin (Base)",
  {
    ad: 45,
    hp: 450,
    basicAbilityHaste: 25,
  },
  [],
  "Spear of Shojin",
);

const SpearOfShojinMaxStacks = new Item(
  "Spear of Shojin (Max Stacks)",
  {
    ad: 45,
    hp: 450,
    basicAbilityHaste: 25,
    damageMultiplicative: 12,
  },
  [],
  "Spear of Shojin",
);

const SpectralCutlass = new Item(
  "Spectral Cutlass",
  {
    ad: 45,
    abilityHaste: 15,
    lethality: 12,
  },
  [],
  "Spectral Cutlass",
);

const SpiritVisage = new Item(
  "Spirit Visage",
  {
    mr: 60,
    hp: 400,
    abilityHaste: 10,
    healthRegen: 100,
  },
  [],
  "Spirit Visage",
);

const StaffOfFlowingWater = new Item(
  "Staff of Flowing Water",
  {
    ap: 50,
    abilityHaste: 15,
    hp: 200,
    manaRegen: 125,
  },
  [],
  "Staff of Flowing Water",
);

const StatikkShiv = new Item(
  "Statikk Shiv",
  {
    ad: 45,
    attackSpeed: 30,
    msPercent: 4,
  },
  [],
  "Statikk Shiv",
);

const SteraksGage = new Item(
  "Sterak's Gage",
  {
    hp: 400,
    adPerBaseADPercent: 45,
  },
  [],
  "Lifeline",
);

const StormrazorMelee = new Item(
  "Stormrazor (Melee)",
  {
    ad: 50,
    attackSpeed: 20,
    critChance: 25,
    magicPeriodicOnHit: 6,
  },
  [],
  "Stormrazor",
);

const StormrazorRanged = new Item(
  "Stormrazor (Ranged)",
  {
    ad: 50,
    attackSpeed: 20,
    critChance: 25,
    magicPeriodicOnHit: 5,
  },
  [],
  "Stormrazor",
);

const Stormsurge = new Item(
  "Stormsurge",
  {
    ap: 90,
    flatMagicPen: 15,
    msPercent: 6,
  },
  [],
  "Stormsurge",
);

const StridebreakerMelee = new Item(
  "Stridebreaker (Melee)",
  {
    ad: 40,
    attackSpeed: 25,
    hp: 450,
    physicalAoEOnHitADPercent: 40,
  },
  [],
  "Hydra",
);

const StridebreakerRanged = new Item(
  "Stridebreaker (Ranged)",
  {
    ad: 40,
    attackSpeed: 25,
    hp: 450,
    physicalAoEOnHitADPercent: 20,
  },
  [],
  "Hydra",
);

const SunderedSky = new Item(
  "Sundered Sky",
  {
    ad: 45,
    abilityHaste: 10,
    hp: 400,
  },
  [],
  "Sundered Sky",
);

const SunfireAegis = new Item(
  "Sunfire Aegis",
  {
    abilityHaste: 10,
    armor: 50,
    hp: 350,
    magicDotDamage: 20,
    magicDotDamagePerBonusHPRatio: 1,
  },
  [],
  "Immolate",
);

const Terminus = new Item(
  "Terminus (Base)",
  {
    ad: 30,
    attackSpeed: 35,
    magicOnHit: 30,
  },
  [],
  "Fatality",
);

const TerminusMaxStacks = new Item(
  "Terminus (Max Stacks)",
  {
    ad: 30,
    attackSpeed: 35,
    magicOnHit: 30,
    armor: 24,
    mr: 24,
    armorPen: 30,
    percentMagicPen: 30,
  },
  [],
  "Fatality",
);

const TheCollector = new Item(
  "The Collector",
  {
    ad: 50,
    lethality: 10,
    critChance: 25,
    executeMaxHealthThresholdPercent: 5,
  },
  [],
  "The Collector",
);

const Thornmail = new Item(
  "Thornmail",
  {
    armor: 75,
    hp: 150,
  },
  [],
  "Thornmail",
);

const TitanicHydra = new Item(
  "Titanic Hydra (Base)",
  {
    ad: 40,
    hp: 600,
    physicalOnHitMaxHealthPercent: 1,
  },
  [],
  "Hydra",
);

const Trailblazer = new Item(
  "Trailblazer",
  {
    armor: 40,
    hp: 250,
    msPercent: 4,
  },
  [],
  "Momentum",
);

const TrinityForce = new Item(
  "Trinity Force (Base)",
  {
    ad: 36,
    abilityHaste: 15,
    attackSpeed: 30,
    hp: 333,
  },
  [],
  "Spellblade",
);

const TrinityForceSpellblade = new Item(
  "Trinity Force (Spellblade)",
  {
    ad: 36,
    abilityHaste: 15,
    attackSpeed: 30,
    hp: 333,
    physicalOnHitBaseADPercent: 200,
  },
  [],
  "Spellblade",
);

const UmbralGlaive = new Item(
  "Umbral Glaive (Base)",
  {
    ad: 60,
    abilityHaste: 15,
    lethality: 18,
  },
  [],
  "Umbral Glaive",
);

const UmbralGlaiveNightstalker = new Item(
  "Umbral Glaive (Nightstalker)",
  {
    ad: 60,
    abilityHaste: 15,
    lethality: 18,
    trueOnAbilityHit: 50,
    trueOnAbilityHitPerLethality: 1.5,
  },
  [],
  "Umbral Glaive",
);

const UnendingDespair = new Item(
  "Unending Despair",
  {
    abilityHaste: 15,
    armor: 50,
    hp: 400,
  },
  [],
  "Unending Despair",
);

const VoidStaff = new Item(
  "Void Staff",
  {
    ap: 95,
    percentMagicPen: 40,
  },
  [],
  "Blight",
);

const VoltaicCyclosword = new Item(
  "Voltaic Cyclosword",
  {
    ad: 55,
    abilityHaste: 10,
    lethality: 18,
  },
  [],
  "Voltaic Cyclosword",
);

const WarmogsArmor = new Item(
  "Warmog's Armor",
  {
    hp: 1000,
    healthRegen: 100,
    bonusHPMultiplicative: 12,
  },
  [],
  "Warmog's Armor",
);

const WhisperingCirclet = new Item(
  "Whispering Circlet",
  {
    hp: 200,
    healthRegen: 75,
    manaRegen: 75,
  },
  [],
  "Support / Jungle",
);

const WintersApproach = new Item(
  "Winter's Approach",
  {
    abilityHaste: 15,
    hp: 550,
    mana: 500,
    hpPerBonusManaPercent: 15,
  },
  [],
  "Manaflow",
);

const WitsEnd = new Item(
  "Wit's End",
  {
    mr: 45,
    attackSpeed: 50,
    magicOnHit: 45,
  },
  [],
  "Wit's End",
);

const YoumuusGhostblade = new Item(
  "Youmuu's Ghostblade",
  {
    ad: 55,
    lethality: 18,
    msPercent: 4,
  },
  [],
  "Youmuu's Ghostblade",
);

const YunTalWildarrows = new Item(
  "Yun Tal Wildarrows",
  {
    ad: 50,
    attackSpeed: 40,
    critChance: 0,
  },
  [],
  "Yun Tal Wildarrows",
);

const YunTalWildarrowsMeleeMax = new Item(
  "Yun Tal (Melee Max)",
  {
    ad: 50,
    attackSpeed: 40,
    critChance: 25,
  },
  [],
  "Yun Tal Wildarrows",
);

const YunTalWildarrowsRangedMax = new Item(
  "Yun Tal (Ranged Max)",
  {
    ad: 50,
    attackSpeed: 40,
    critChance: 25,
  },
  [],
  "Yun Tal Wildarrows",
);

const ZazzaksRealmspike = new Item(
  "Zaz'Zak's Realmspike",
  {
    hp: 200,
    healthRegen: 75,
    manaRegen: 75,
  },
  [],
  "Support / Jungle",
);

const ZekesConvergence = new Item(
  "Zeke's Convergence",
  {
    abilityHaste: 10,
    ultAbilityHaste: 15,
    armor: 25,
    mr: 25,
    hp: 300,
    magicDotDamage: 30,
  },
  [],
  "Zeke's Convergence",
);

const ZhonyasHourglass = new Item(
  "Zhonya's Hourglass",
  {
    ap: 105,
    armor: 50,
  },
  [],
  "Stasis",
);

/**
 * Abilities flagged `appliesOnHit` are often rotation/proc-gated; without full
 * rotation sim we scale their contribution toward a sustained 1v1 average.
 */
const ONHIT_SUSTAINED_FACTOR: Record<string, number> = {
  Headshot: 0.22,
  "Crippling Strike": 0.32,
  "Mystic Shot": 0.42,
  "Skip 'n Slash": 0.33,
  "Blunt Force Trauma": 0.38,
  Tumble: 0.42,
  Determination: 0.34,
  "Three Talon Strike": 0.58,
};

/** Fraction of autos with Lethal Tempo “bonus attack” damage treated as active. */
const LETHAL_TEMPO_BOLT_UPTIME = 0.52;

type AbilityType = "passive" | "Q" | "W" | "E" | "R";

type ChampionRotationProfile = {
  abilityTypeMultiplier?: Partial<
    Record<Exclude<AbilityType, "passive">, number>
  >;
  onHitSustainMultiplier?: number;
};

/** Short-window all-in: cast priority, shadow hits, Death Mark pop, AA weight. */
type ChampionComboProfile = {
  castOrder: Exclude<AbilityType, "passive">[];
  /** Extra effective hits from shadows / duplicates (e.g. Zed W on Q/E). */
  abilityDupMultiplier?: Partial<
    Record<Exclude<AbilityType, "passive">, number>
  >;
  /** Death Mark pop as fraction of pre-mark physical ability damage this window. */
  deathMarkPopRatio?: number[];
  /** 0–1: how much auto damage counts in a short all-in (assassins ≈ low). */
  comboAutoWeight?: number;
};

/** Champions without a mana bar should not receive mana-scaling item recommendations. */
export type ChampionResourceType = "mana" | "energy" | "none";

const ENERGY_CHAMPIONS: readonly string[] = [
  "Akali",
  "Ambessa",
  "Kennen",
  "Lee Sin",
  "Shen",
  "Zed",
];

/** Cooldown-only kits (no mana bar); cannot buy tear / Muramana / etc. */
const MANALESS_CHAMPIONS: readonly string[] = [
  "Aatrox",
  "Briar",
  "Dr. Mundo",
  "Garen",
  "Gnar",
  "Katarina",
  "Kled",
  "Mordekaiser",
  "Rek'Sai",
  "Renekton",
  "Rengar",
  "Riven",
  "Rumble",
  "Sett",
  "Shyvana",
  "Tryndamere",
  "Viego",
  "Vladimir",
  "Yasuo",
  "Yone",
  "Zac",
];

export const CHAMPION_RESOURCE_TYPE: Record<string, ChampionResourceType> = {
  ...Object.fromEntries(ENERGY_CHAMPIONS.map((n) => [n, "energy" as const])),
  ...Object.fromEntries(MANALESS_CHAMPIONS.map((n) => [n, "none" as const])),
};

export function championUsesMana(champion: Character): boolean {
  return (CHAMPION_RESOURCE_TYPE[champion.Name] ?? "mana") === "mana";
}

/** Items whose power assumes a mana bar (tear line, Muramana, Actualizer, etc.). */
export function isManaScalingItem(item: Item): boolean {
  const s = item.stats;
  if (item.getGroupName() === "Manaflow") return true;
  if ((s.mana ?? 0) >= 150) return true;
  if (s.adPerMaxManaPercent) return true;
  if (s.apPerBonusManaPercent) return true;
  if (s.hpPerBonusManaPercent && (s.mana ?? 0) > 0) return true;
  if (s.physicalOnHitMaxManaPercent) return true;
  if (s.physicalOnAbilityHitMaxManaPercent) return true;
  if (s.abilityDamagePerManaMultiplicative) return true;
  return false;
}

export const CHAMPION_COMBO_PROFILES: Record<string, ChampionComboProfile> = {
  Akali: {
    castOrder: ["R", "Q", "E", "W"],
    comboAutoWeight: 0.25,
  },
  KhaZix: {
    castOrder: ["R", "Q", "W", "E"],
    comboAutoWeight: 0.3,
  },
  LeBlanc: {
    castOrder: ["R", "W", "Q", "E"],
    comboAutoWeight: 0.2,
  },
  Talon: {
    castOrder: ["R", "W", "Q", "E"],
    comboAutoWeight: 0.35,
  },
  Zed: {
    castOrder: ["R", "Q", "E", "W"],
    // Q/E: shadow duplicate; Q second shuriken ~60% (averaged into dup mult)
    abilityDupMultiplier: { Q: 1.55, E: 1.85 },
    deathMarkPopRatio: [0.25, 0.4, 0.55],
    comboAutoWeight: 0.3,
  },
  Irelia: {
    castOrder: ["R", "E", "Q", "W"],
    comboAutoWeight: 0.45,
  },
  Smolder: {
    castOrder: ["R", "Q", "E", "W"],
    comboAutoWeight: 0.55,
  },
  Yunara: {
    castOrder: ["R", "Q", "W", "E"],
    comboAutoWeight: 0.7,
  },
};

/**
 * Champion-level rotation weighting for sustained 1v1 sims.
 * Values tune cast cadence realism without implementing full per-frame combat scripting.
 */
export const CHAMPION_ROTATION_PROFILES: Record<
  string,
  ChampionRotationProfile
> = {
  Ahri: { abilityTypeMultiplier: { Q: 1.0, W: 0.9, E: 0.65, R: 0.45 } },
  Aatrox: { abilityTypeMultiplier: { Q: 0.95, W: 0.6, E: 0.8, R: 0.35 } },
  Akali: { abilityTypeMultiplier: { Q: 1.05, W: 0.4, E: 0.8, R: 0.55 } },
  Akshan: { abilityTypeMultiplier: { Q: 0.85, W: 0.35, E: 0.9, R: 0.45 } },
  Annie: { abilityTypeMultiplier: { Q: 1.0, W: 0.8, E: 0.5, R: 0.4 } },
  Ashe: { abilityTypeMultiplier: { Q: 0.95, W: 0.8, E: 0.2, R: 0.35 } },
  Azir: { abilityTypeMultiplier: { Q: 0.85, W: 1.2, E: 0.45, R: 0.3 } },
  BelVeth: { abilityTypeMultiplier: { Q: 1.0, W: 0.55, E: 0.8, R: 0.45 } },
  Briar: { abilityTypeMultiplier: { Q: 0.9, W: 1.15, E: 0.6, R: 0.35 } },
  Caitlyn: { abilityTypeMultiplier: { Q: 0.75, W: 0.55, E: 0.6, R: 0.35 } },
  Camille: { abilityTypeMultiplier: { Q: 1.15, W: 0.75, E: 0.65, R: 0.45 } },
  Cassiopeia: { abilityTypeMultiplier: { Q: 1.0, W: 0.45, E: 1.3, R: 0.3 } },
  Darius: { abilityTypeMultiplier: { Q: 0.9, W: 0.95, E: 0.5, R: 0.45 } },
  Diana: { abilityTypeMultiplier: { Q: 0.95, W: 0.85, E: 0.7, R: 0.55 } },
  Draven: { abilityTypeMultiplier: { Q: 1.25, W: 0.8, E: 0.45, R: 0.25 } },
  Ekko: { abilityTypeMultiplier: { Q: 0.95, W: 0.5, E: 0.95, R: 0.4 } },
  Ezreal: { abilityTypeMultiplier: { Q: 1.15, W: 0.7, E: 0.35, R: 0.15 } },
  Fiora: { abilityTypeMultiplier: { Q: 1.2, W: 0.45, E: 0.9, R: 0.4 } },
  Gangplank: { abilityTypeMultiplier: { Q: 1.2, W: 0.35, E: 0.95, R: 0.25 } },
  Garen: { abilityTypeMultiplier: { Q: 0.8, W: 0.4, E: 1.15, R: 0.5 } },
  Gwen: { abilityTypeMultiplier: { Q: 1.0, W: 0.35, E: 0.9, R: 0.6 } },
  Hwei: { abilityTypeMultiplier: { Q: 1.0, W: 0.55, E: 0.85, R: 0.4 } },
  Jax: { abilityTypeMultiplier: { Q: 0.95, W: 1.05, E: 0.75, R: 0.45 } },
  Jayce: { abilityTypeMultiplier: { Q: 1.05, W: 0.9, E: 0.7, R: 0.35 } },
  Jhin: { abilityTypeMultiplier: { Q: 0.8, W: 0.55, E: 0.45, R: 0.4 } },
  Jinx: { abilityTypeMultiplier: { Q: 0.8, W: 0.45, E: 0.35, R: 0.2 } },
  KaiSa: { abilityTypeMultiplier: { Q: 1.0, W: 0.7, E: 0.65, R: 0.45 } },
  Kalista: { abilityTypeMultiplier: { Q: 0.95, W: 0.25, E: 1.1, R: 0.2 } },
  Kayle: { abilityTypeMultiplier: { Q: 0.8, W: 0.35, E: 1.15, R: 0.3 } },
  KhaZix: { abilityTypeMultiplier: { Q: 1.2, W: 0.65, E: 0.55, R: 0.35 } },
  Kled: { abilityTypeMultiplier: { Q: 0.95, W: 1.05, E: 0.85, R: 0.35 } },
  KogMaw: { abilityTypeMultiplier: { Q: 0.7, W: 1.2, E: 0.6, R: 0.65 } },
  LeBlanc: { abilityTypeMultiplier: { Q: 1.0, W: 0.95, E: 0.7, R: 0.6 } },
  LeeSin: { abilityTypeMultiplier: { Q: 1.0, W: 0.55, E: 0.85, R: 0.45 } },
  Lucian: { abilityTypeMultiplier: { Q: 0.95, W: 0.55, E: 1.0, R: 0.45 } },
  MasterYi: { abilityTypeMultiplier: { Q: 0.85, W: 0.25, E: 1.2, R: 0.55 } },
  MissFortune: { abilityTypeMultiplier: { Q: 0.8, W: 0.75, E: 0.55, R: 0.55 } },
  Naafiri: { abilityTypeMultiplier: { Q: 1.0, W: 0.7, E: 0.85, R: 0.45 } },
  Nasus: { abilityTypeMultiplier: { Q: 1.35, W: 0.3, E: 0.55, R: 0.45 } },
  Nilah: { abilityTypeMultiplier: { Q: 1.1, W: 0.4, E: 0.85, R: 0.5 } },
  Orianna: { abilityTypeMultiplier: { Q: 0.95, W: 0.85, E: 0.75, R: 0.45 } },
  Pantheon: { abilityTypeMultiplier: { Q: 1.05, W: 0.85, E: 0.6, R: 0.25 } },
  Quinn: { abilityTypeMultiplier: { Q: 0.85, W: 0.6, E: 0.65, R: 0.25 } },
  RekSai: { abilityTypeMultiplier: { Q: 1.0, W: 0.6, E: 0.95, R: 0.45 } },
  Katarina: { abilityTypeMultiplier: { Q: 0.9, W: 0.9, E: 1.15, R: 0.55 } },
  Renekton: { abilityTypeMultiplier: { Q: 0.9, W: 0.95, E: 0.8, R: 0.6 } },
  Riven: { abilityTypeMultiplier: { Q: 1.2, W: 0.9, E: 0.75, R: 0.55 } },
  Samira: { abilityTypeMultiplier: { Q: 1.0, W: 0.5, E: 0.85, R: 0.75 } },
  Sivir: { abilityTypeMultiplier: { Q: 0.95, W: 0.8, E: 0.3, R: 0.45 } },
  Tristana: { abilityTypeMultiplier: { Q: 0.95, W: 0.45, E: 1.05, R: 0.35 } },
  Tryndamere: { abilityTypeMultiplier: { Q: 0.4, W: 0.45, E: 0.95, R: 0.4 } },
  Twitch: { abilityTypeMultiplier: { Q: 0.5, W: 0.55, E: 1.1, R: 0.55 } },
  Udyr: { abilityTypeMultiplier: { Q: 1.15, W: 0.7, E: 0.55, R: 1.0 } },
  Varus: { abilityTypeMultiplier: { Q: 0.95, W: 0.7, E: 0.7, R: 0.4 } },
  Vayne: {
    abilityTypeMultiplier: { Q: 1.05, W: 1.0, E: 0.45, R: 0.35 },
    onHitSustainMultiplier: 1.08,
  },
  Vi: { abilityTypeMultiplier: { Q: 0.95, W: 0.95, E: 0.9, R: 0.5 } },
  Viktor: { abilityTypeMultiplier: { Q: 1.0, W: 0.35, E: 0.95, R: 0.55 } },
  Vladimir: { abilityTypeMultiplier: { Q: 1.0, W: 0.4, E: 0.95, R: 0.4 } },
  Warwick: { abilityTypeMultiplier: { Q: 1.05, W: 0.5, E: 0.7, R: 0.55 } },
  Xayah: { abilityTypeMultiplier: { Q: 0.9, W: 1.0, E: 1.05, R: 0.4 } },
  Yasuo: { abilityTypeMultiplier: { Q: 1.2, W: 0.25, E: 1.0, R: 0.6 } },
  Yone: { abilityTypeMultiplier: { Q: 1.15, W: 0.8, E: 0.85, R: 0.55 } },
  Zed: { abilityTypeMultiplier: { Q: 0.95, W: 0.55, E: 0.9, R: 0.45 } },
  Zeri: { abilityTypeMultiplier: { Q: 1.25, W: 0.55, E: 0.7, R: 0.55 } },
};

export type SimulationScenario = {
  level?: number;
  avgCurrentHPRatio?: number;
  conditionalLowHpUptime?: number;
  /** Cut Down vs high bonus-HP targets (default ~0.75 in 1v1 vs bruiser/tank). */
  conditionalHighHpUptime?: number;
  conditionalGeneralUptime?: number;
  onHitPassiveFallbackSustain?: number;
  onHitActiveFallbackSustain?: number;
  abilityHasteCap?: number;
  cooldownFloorBaseRatio?: number;
  enableChampionRotationProfiles?: boolean;
  /**
   * When true: attack speed does not contribute to auto DPS, on-hit DPS, or
   * attack-based basic-ability CDR (e.g. Navori). Used for "spell-only" builds.
   */
  spellOnlyNoAutos?: boolean;
};

type ResolvedSimulationScenario = {
  level: number;
  avgCurrentHPRatio: number;
  conditionalLowHpUptime: number;
  conditionalHighHpUptime: number;
  conditionalGeneralUptime: number;
  onHitPassiveFallbackSustain: number;
  onHitActiveFallbackSustain: number;
  abilityHasteCap: number;
  cooldownFloorBaseRatio: number;
  enableChampionRotationProfiles: boolean;
  spellOnlyNoAutos: boolean;
};

const DEFAULT_SIM_SCENARIO: ResolvedSimulationScenario = {
  level: 18,
  avgCurrentHPRatio: 0.6,
  conditionalLowHpUptime: 0.3,
  conditionalHighHpUptime: 0.75,
  conditionalGeneralUptime: 0.5,
  onHitPassiveFallbackSustain: 0.85,
  onHitActiveFallbackSustain: 0.92,
  abilityHasteCap: 120,
  cooldownFloorBaseRatio: 0.1,
  enableChampionRotationProfiles: true,
  spellOnlyNoAutos: false,
};

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function resolveSimulationScenario(
  scenario?: SimulationScenario,
): ResolvedSimulationScenario {
  return {
    level: Math.max(
      1,
      Math.min(18, Math.round(scenario?.level ?? DEFAULT_SIM_SCENARIO.level)),
    ),
    avgCurrentHPRatio: clamp01(
      scenario?.avgCurrentHPRatio ?? DEFAULT_SIM_SCENARIO.avgCurrentHPRatio,
    ),
    conditionalLowHpUptime: clamp01(
      scenario?.conditionalLowHpUptime ??
        DEFAULT_SIM_SCENARIO.conditionalLowHpUptime,
    ),
    conditionalHighHpUptime: clamp01(
      scenario?.conditionalHighHpUptime ??
        DEFAULT_SIM_SCENARIO.conditionalHighHpUptime,
    ),
    conditionalGeneralUptime: clamp01(
      scenario?.conditionalGeneralUptime ??
        DEFAULT_SIM_SCENARIO.conditionalGeneralUptime,
    ),
    onHitPassiveFallbackSustain: clamp01(
      scenario?.onHitPassiveFallbackSustain ??
        DEFAULT_SIM_SCENARIO.onHitPassiveFallbackSustain,
    ),
    onHitActiveFallbackSustain: clamp01(
      scenario?.onHitActiveFallbackSustain ??
        DEFAULT_SIM_SCENARIO.onHitActiveFallbackSustain,
    ),
    abilityHasteCap: Math.max(
      0,
      scenario?.abilityHasteCap ?? DEFAULT_SIM_SCENARIO.abilityHasteCap,
    ),
    cooldownFloorBaseRatio: clamp01(
      scenario?.cooldownFloorBaseRatio ??
        DEFAULT_SIM_SCENARIO.cooldownFloorBaseRatio,
    ),
    enableChampionRotationProfiles:
      scenario?.enableChampionRotationProfiles ??
      DEFAULT_SIM_SCENARIO.enableChampionRotationProfiles,
    spellOnlyNoAutos: Boolean(scenario?.spellOnlyNoAutos),
  };
}

/** Matches buildOptimizer `blendedDps` combo weight for headline totalDPS. */
export const BLENDED_DPS_COMBO_WEIGHT = 0.55;

const PTA_AMP_DURATION_SECONDS = 5;

/** ICD / cadence-based rune proc DPS (not multiplied by attack speed again). */
export function runeProcSustainedDPS(
  procDamage: number,
  effect: RuneEffect,
  attackRate: number,
): { dps: number; label: string } {
  if (!effect.cooldown || effect.cooldown <= 0 || procDamage <= 0) {
    return { dps: 0, label: "" };
  }
  if (effect.trigger === "onThirdHit") {
    const secondsBetweenProcs = Math.max(
      effect.cooldown,
      3 / Math.max(attackRate, 0.1),
    );
    const dps = procDamage / secondsBetweenProcs;
    return {
      dps,
      label: `Rune (PTA proc): ${dps.toFixed(1)} DPS (${procDamage.toFixed(0)} / ${secondsBetweenProcs.toFixed(2)}s)`,
    };
  }
  const dps = procDamage / effect.cooldown;
  return {
    dps,
    label: `Rune (ICD ${effect.cooldown}s): ${dps.toFixed(1)} DPS`,
  };
}

/** Uptime for conditional rune amps from duel target shape + scenario knobs. */
export function runeConditionUptime(
  conditions: RuneCondition[] | undefined,
  sim: ResolvedSimulationScenario,
  targetBonusHP: number,
): number {
  if (!conditions || conditions.length === 0) {
    return sim.conditionalGeneralUptime;
  }
  let uptime = 1;
  for (const c of conditions) {
    if (c.type === "targetHealthPercent" && c.threshold != null) {
      const op = c.operator ?? "<";
      const threshold = c.threshold / 100;
      if (op === "<" || op === "<=") {
        uptime *=
          sim.avgCurrentHPRatio <= threshold
            ? 1
            : sim.conditionalLowHpUptime;
      } else if (op === ">" || op === ">=") {
        uptime *= sim.avgCurrentHPRatio >= threshold ? 1 : 0.15;
      }
    } else if (c.type === "targetHealthDifference" && c.threshold != null) {
      const op = c.operator ?? ">";
      if (op === ">") {
        uptime *=
          targetBonusHP > c.threshold
            ? sim.conditionalHighHpUptime
            : 0.2;
      }
    }
  }
  return clamp01(uptime);
}

function collectRuneDamageMultipliers(
  runeEffects: RuneEffect[],
  sim: ResolvedSimulationScenario,
  targetBonusHP: number,
  attackRate: number,
): { runeMultiplier: number; ptaAmpMultiplier: number } {
  let runeMultiplier = 1;
  let ptaAmpMultiplier = 1;

  for (const effect of runeEffects) {
    if (effect.type === "statBuff" && effect.statMultiplier) {
      if (effect.trigger === "onThirdHit" && effect.cooldown) {
        const secondsBetween = Math.max(
          effect.cooldown,
          3 / Math.max(attackRate, 0.1),
        );
        const ampUptime = Math.min(1, PTA_AMP_DURATION_SECONDS / secondsBetween);
        ptaAmpMultiplier *= 1 + (effect.statMultiplier / 100) * ampUptime;
      }
      continue;
    }
    if (!effect.statMultiplier || effect.type !== "conditional") continue;
    if (effect.cooldown === 12 && effect.statMultiplier === 7) continue;

    const uptime = effect.conditions
      ? runeConditionUptime(effect.conditions, sim, targetBonusHP)
      : sim.conditionalGeneralUptime;
    runeMultiplier *= 1 + (effect.statMultiplier / 100) * uptime;
  }

  return { runeMultiplier, ptaAmpMultiplier };
}

/**
 * Standard League skill point allocation following a max order.
 * Returns the rank (1-5) of a basic ability at a given champion level.
 *
 * In a typical game, the max-first ability gets points at levels 1,3,5,7,9;
 * second-max gets points at 2,8,10,12,14; third gets 4,13,15,17,18.
 * Ult takes levels 6,11,16.
 */
const SKILL_POINT_TABLE: Record<number, number[]> = {
  // priority 0 (max first): levels at which you get each rank
  0: [1, 3, 5, 7, 9],
  // priority 1 (second max):
  1: [2, 8, 10, 12, 14],
  // priority 2 (third max):
  2: [4, 13, 15, 17, 18],
};

type SkillOrder = ["Q" | "W" | "E", "Q" | "W" | "E", "Q" | "W" | "E"];

const CHAMPION_SKILL_ORDER: Record<string, SkillOrder> = {
  Aatrox: ["Q", "E", "W"],
  Ahri: ["Q", "W", "E"],
  Akali: ["Q", "E", "W"],
  Akshan: ["Q", "E", "W"],
  Alistar: ["E", "Q", "W"],
  Ambessa: ["Q", "E", "W"],
  Amumu: ["E", "Q", "W"],
  Anivia: ["Q", "E", "W"],
  Annie: ["Q", "W", "E"],
  Aphelios: ["Q", "W", "E"],
  Ashe: ["W", "Q", "E"],
  "Aurelion Sol": ["Q", "W", "E"],
  Aurora: ["Q", "E", "W"],
  Azir: ["W", "Q", "E"],
  Bard: ["Q", "W", "E"],
  "Bel'Veth": ["Q", "E", "W"],
  Blitzcrank: ["Q", "W", "E"],
  Brand: ["W", "Q", "E"],
  Braum: ["Q", "E", "W"],
  Briar: ["Q", "W", "E"],
  Caitlyn: ["Q", "W", "E"],
  Camille: ["Q", "E", "W"],
  Cassiopeia: ["E", "Q", "W"],
  "Cho'Gath": ["E", "Q", "W"],
  Corki: ["Q", "E", "W"],
  Darius: ["Q", "E", "W"],
  Diana: ["Q", "W", "E"],
  "Dr. Mundo": ["Q", "E", "W"],
  Draven: ["Q", "W", "E"],
  Ekko: ["Q", "E", "W"],
  Elise: ["Q", "W", "E"],
  Evelynn: ["Q", "E", "W"],
  Ezreal: ["Q", "W", "E"],
  Fiddlesticks: ["W", "E", "Q"],
  Fiora: ["Q", "E", "W"],
  Fizz: ["E", "Q", "W"],
  Galio: ["Q", "W", "E"],
  Gangplank: ["Q", "E", "W"],
  Garen: ["E", "Q", "W"],
  Gnar: ["Q", "W", "E"],
  Gragas: ["Q", "W", "E"],
  Graves: ["Q", "E", "W"],
  Gwen: ["Q", "E", "W"],
  Hecarim: ["Q", "W", "E"],
  Heimerdinger: ["Q", "W", "E"],
  Hwei: ["Q", "W", "E"],
  Illaoi: ["Q", "W", "E"],
  Irelia: ["Q", "E", "W"],
  Ivern: ["E", "W", "Q"],
  Janna: ["W", "E", "Q"],
  "Jarvan IV": ["Q", "E", "W"],
  Jax: ["Q", "W", "E"],
  Jayce: ["Q", "W", "E"],
  Jhin: ["Q", "W", "E"],
  Jinx: ["Q", "W", "E"],
  "K'Sante": ["Q", "W", "E"],
  "Kai'Sa": ["Q", "E", "W"],
  Kalista: ["Q", "E", "W"],
  Karma: ["Q", "E", "W"],
  Karthus: ["Q", "E", "W"],
  Kassadin: ["Q", "E", "W"],
  Katarina: ["Q", "E", "W"],
  Kayle: ["E", "Q", "W"],
  Kayn: ["Q", "W", "E"],
  Kennen: ["Q", "W", "E"],
  "Kha'Zix": ["Q", "W", "E"],
  Kindred: ["Q", "W", "E"],
  Kled: ["Q", "W", "E"],
  "Kog'Maw": ["W", "Q", "E"],
  LeBlanc: ["Q", "W", "E"],
  "Lee Sin": ["Q", "W", "E"],
  Leona: ["W", "E", "Q"],
  Lillia: ["Q", "W", "E"],
  Lissandra: ["Q", "W", "E"],
  Lucian: ["Q", "E", "W"],
  Lulu: ["E", "W", "Q"],
  Lux: ["E", "Q", "W"],
  Malphite: ["Q", "E", "W"],
  Malzahar: ["E", "Q", "W"],
  Maokai: ["Q", "E", "W"],
  "Master Yi": ["Q", "E", "W"],
  Mel: ["Q", "W", "E"],
  Milio: ["W", "E", "Q"],
  "Miss Fortune": ["Q", "W", "E"],
  Mordekaiser: ["Q", "E", "W"],
  Morgana: ["W", "Q", "E"],
  Naafiri: ["Q", "W", "E"],
  Nami: ["W", "E", "Q"],
  Nasus: ["Q", "E", "W"],
  Nautilus: ["E", "W", "Q"],
  Neeko: ["Q", "E", "W"],
  Nidalee: ["Q", "W", "E"],
  Nilah: ["Q", "E", "W"],
  Nocturne: ["Q", "W", "E"],
  "Nunu & Willump": ["Q", "W", "E"],
  Olaf: ["Q", "E", "W"],
  Orianna: ["Q", "W", "E"],
  Ornn: ["Q", "W", "E"],
  Pantheon: ["Q", "E", "W"],
  Poppy: ["Q", "E", "W"],
  Pyke: ["Q", "E", "W"],
  Qiyana: ["Q", "E", "W"],
  Quinn: ["Q", "E", "W"],
  Rakan: ["W", "Q", "E"],
  Rammus: ["W", "Q", "E"],
  "Rek'Sai": ["Q", "E", "W"],
  Rell: ["Q", "W", "E"],
  "Renata Glasc": ["Q", "E", "W"],
  Renekton: ["Q", "E", "W"],
  Rengar: ["Q", "W", "E"],
  Riven: ["Q", "E", "W"],
  Rumble: ["Q", "E", "W"],
  Ryze: ["Q", "E", "W"],
  Samira: ["Q", "E", "W"],
  Sejuani: ["W", "Q", "E"],
  Senna: ["Q", "W", "E"],
  Seraphine: ["Q", "W", "E"],
  Sett: ["Q", "W", "E"],
  Shaco: ["E", "Q", "W"],
  Shen: ["Q", "E", "W"],
  Shyvana: ["W", "E", "Q"],
  Singed: ["Q", "E", "W"],
  Sion: ["Q", "E", "W"],
  Sivir: ["Q", "W", "E"],
  Skarner: ["Q", "E", "W"],
  Smolder: ["Q", "W", "E"],
  Sona: ["Q", "W", "E"],
  Soraka: ["W", "Q", "E"],
  Swain: ["Q", "E", "W"],
  Sylas: ["Q", "W", "E"],
  Syndra: ["Q", "W", "E"],
  "Tahm Kench": ["Q", "W", "E"],
  Taliyah: ["Q", "E", "W"],
  Talon: ["W", "Q", "E"],
  Taric: ["Q", "W", "E"],
  Teemo: ["E", "Q", "W"],
  Thresh: ["E", "Q", "W"],
  Tristana: ["E", "Q", "W"],
  Trundle: ["Q", "W", "E"],
  Tryndamere: ["Q", "E", "W"],
  "Twisted Fate": ["Q", "W", "E"],
  Twitch: ["E", "Q", "W"],
  Udyr: ["Q", "W", "E"],
  Urgot: ["W", "Q", "E"],
  Varus: ["Q", "W", "E"],
  Vayne: ["W", "Q", "E"],
  Veigar: ["Q", "W", "E"],
  "Vel'Koz": ["Q", "W", "E"],
  Vex: ["Q", "W", "E"],
  Vi: ["Q", "E", "W"],
  Viego: ["Q", "E", "W"],
  Viktor: ["Q", "E", "W"],
  Vladimir: ["Q", "E", "W"],
  Volibear: ["Q", "W", "E"],
  Warwick: ["Q", "W", "E"],
  Wukong: ["Q", "E", "W"],
  Xayah: ["Q", "E", "W"],
  Xerath: ["Q", "W", "E"],
  "Xin Zhao": ["Q", "W", "E"],
  Yasuo: ["Q", "E", "W"],
  Yone: ["Q", "E", "W"],
  Yorick: ["Q", "E", "W"],
  Yuumi: ["E", "W", "Q"],
  Zac: ["Q", "W", "E"],
  Zed: ["Q", "W", "E"],
  Zeri: ["Q", "E", "W"],
  Ziggs: ["Q", "E", "W"],
  Zilean: ["Q", "W", "E"],
  Zoe: ["Q", "E", "W"],
  Zyra: ["Q", "W", "E"],
};

function abilityRankAtLevel(
  level: number,
  abilityType: "Q" | "W" | "E",
  championName: string,
): number {
  const order = CHAMPION_SKILL_ORDER[championName];
  const priority = order ? order.indexOf(abilityType) : 0;
  // Fallback: if ability not found in order (shouldn't happen), treat as first-max
  const levels = SKILL_POINT_TABLE[priority >= 0 ? priority : 0];
  let rank = 0;
  for (const lvl of levels) {
    if (level >= lvl) rank++;
  }
  return Math.max(1, rank);
}

function ultRankAtLevel(level: number): number {
  if (level >= 16) return 3;
  if (level >= 11) return 2;
  if (level >= 6) return 1;
  return 0;
}

export type DpsMitigationOptions = {
  targetArmor?: number;
  targetMR?: number;
  comboWindowSeconds?: number;
};

const DEFAULT_DPS_MITIGATION: Required<DpsMitigationOptions> = {
  targetArmor: 100,
  targetMR: 100,
  comboWindowSeconds: 8,
};

function resolveDpsMitigation(opts?: DpsMitigationOptions) {
  return {
    targetArmor: Math.max(
      0,
      opts?.targetArmor ?? DEFAULT_DPS_MITIGATION.targetArmor,
    ),
    targetMR: Math.max(0, opts?.targetMR ?? DEFAULT_DPS_MITIGATION.targetMR),
    comboWindowSeconds: Math.max(
      1,
      opts?.comboWindowSeconds ?? DEFAULT_DPS_MITIGATION.comboWindowSeconds,
    ),
  };
}

/** Flat armor pen from lethality (full value since patch 14.1). */
export function lethalityToFlatArmorPen(
  lethality: number,
  _level: number,
): number {
  return lethality;
}

type PenStats = Pick<
  ItemStats,
  | "lethality"
  | "armorPen"
  | "armorReduction"
  | "flatMagicPen"
  | "percentMagicPen"
  | "magicResistReduction"
>;

export function physicalMitigationMultiplier(
  targetArmor: number,
  stats: PenStats,
  level: number,
): number {
  let armor = targetArmor;
  if (stats.armorReduction) armor *= 1 - stats.armorReduction / 100;
  if (stats.armorPen) armor *= 1 - stats.armorPen / 100;
  if (stats.lethality) {
    armor -= lethalityToFlatArmorPen(stats.lethality, level);
  }
  armor = Math.max(0, armor);
  return 100 / (100 + armor);
}

export function magicMitigationMultiplier(
  targetMR: number,
  stats: PenStats,
): number {
  let mr = targetMR;
  // Order: flat MR reduction (none in current items) -> % MR reduction -> % magic pen -> flat magic pen
  if (stats.magicResistReduction) mr *= 1 - stats.magicResistReduction / 100;
  if (stats.percentMagicPen) mr *= 1 - stats.percentMagicPen / 100;
  if (stats.flatMagicPen) mr -= stats.flatMagicPen;
  mr = Math.max(0, mr);
  return 100 / (100 + mr);
}

/**
 * The Collector Death: if post-mitigation combo damage would leave the target at or
 * below `executeThresholdPercent` of their **max** HP, they are executed. Returns
 * the effective bonus damage credited to the combo (HP skipped on the kill).
 */
export function collectorExecuteBonusDamage(
  mitigatedComboDamage: number,
  targetTotalHP: number,
  targetMaxHP: number,
  executeThresholdPercent: number,
): number {
  if (executeThresholdPercent <= 0 || targetMaxHP <= 0) return 0;
  const threshold = targetMaxHP * (executeThresholdPercent / 100);
  const hpAfter = targetTotalHP - mitigatedComboDamage;
  if (hpAfter <= 0) return 0;
  if (hpAfter > threshold) return 0;
  return hpAfter;
}

type ComboCastSpec = {
  abilityType: Exclude<AbilityType, "passive">;
  singleCastDamage: number;
  damageType: DamageScaling["damageType"];
  actualCooldown: number;
  castTime: number;
  maxCasts: number;
};

const DEFAULT_COMBO_CAST_ORDER: Exclude<AbilityType, "passive">[] = [
  "R",
  "W",
  "E",
  "Q",
];

function mitigatedAbilityHit(
  damage: number,
  damageType: DamageScaling["damageType"],
  stats: PenStats & { ad: number; ap: number },
  abilityBaseMult: number,
  abilityPhysMult: number,
  abilityMagicMult: number,
  physMit: number,
  magicMit: number,
): number {
  const t = damageType ?? "physical";
  if (t === "true") return damage * abilityBaseMult;
  if (t === "magic") return damage * abilityMagicMult * magicMit;
  if (t === "adaptive") {
    return (
      damage *
      (stats.ad >= stats.ap ? abilityPhysMult * physMit : abilityMagicMult * magicMit)
    );
  }
  return damage * abilityPhysMult * physMit;
}

function simulateComboWindowDamage(
  window: number,
  casts: ComboCastSpec[],
  castOrder: Exclude<AbilityType, "passive">[],
  comboProfile: ChampionComboProfile | undefined,
  stats: PenStats & { ad: number; ap: number },
  level: number,
  abilityBaseMult: number,
  abilityPhysMult: number,
  abilityMagicMult: number,
  physMit: number,
  magicMit: number,
  burstAfterMit: number,
  autoHitAfterMit: number,
  onHitPerAutoMit: number,
  attackRate: number,
): { total: number; preMarkPhys: number } {
  const readyAt = new Map<Exclude<AbilityType, "passive">, number>();
  const castCount = new Map<Exclude<AbilityType, "passive">, number>();
  let t = 0;
  let total = burstAfterMit;
  let preMarkPhys = 0;
  const autoWeight = comboProfile?.comboAutoWeight ?? 0.65;

  while (t < window - 1e-6) {
    let casted = false;
    for (const type of castOrder) {
      const spec = casts.find((c) => c.abilityType === type);
      if (!spec) continue;
      const used = castCount.get(type) ?? 0;
      if (used >= spec.maxCasts) continue;
      const ready = readyAt.get(type) ?? 0;
      if (ready > t + 1e-6) continue;
      const castTime = spec.castTime;
      if (t + castTime > window + 1e-6) continue;

      let hit = spec.singleCastDamage;
      const dup = comboProfile?.abilityDupMultiplier?.[type];
      if (dup) hit *= dup;

      const mitigated = mitigatedAbilityHit(
        hit,
        spec.damageType,
        stats,
        abilityBaseMult,
        abilityPhysMult,
        abilityMagicMult,
        physMit,
        magicMit,
      );
      total += mitigated;
      if (
        type !== "R" &&
        (spec.damageType === "physical" ||
          spec.damageType === "adaptive" ||
          !spec.damageType)
      ) {
        preMarkPhys += mitigated;
      }

      castCount.set(type, used + 1);
      readyAt.set(type, t + castTime + spec.actualCooldown);
      t += castTime;
      casted = true;
      break;
    }

    if (!casted) {
      if (attackRate > 0 && autoWeight > 0) {
        const gap = Math.min(1 / attackRate, window - t);
        t += gap;
        const autosInGap = gap * attackRate;
        total +=
          (autoHitAfterMit + onHitPerAutoMit) * autoWeight * autosInGap;
      } else {
        break;
      }
    }
  }

  const popRatios = comboProfile?.deathMarkPopRatio;
  if (popRatios && preMarkPhys > 0) {
    const rRank = ultRankAtLevel(level);
    const idx = Math.max(0, Math.min(popRatios.length - 1, rRank - 1));
    total += preMarkPhys * popRatios[idx];
  }

  return { total, preMarkPhys };
}

class Character {
  Name: string;
  HP: number;
  HP5: number;
  AR: number;
  MR: number;
  AD: number;
  CritDMG: number;
  MS: number;
  AttackRange: number;
  AS: number;
  BaseMana: number;
  Abilities: Ability[];
  Items: Item[];
  Runes?: RunePage;

  constructor(
    name: string,
    hp: number,
    regenPer5: number,
    armor: number,
    magicResist: number,
    attackDamage: number,
    critDamage: number,
    movementSpeed: number,
    attackRange: number,
    attackSpeed: number,
    abilities: Ability[] = [],
    items: Item[] = [],
    runes?: RunePage,
    baseMana: number = 0,
  ) {
    this.Name = name;
    this.HP = hp;
    this.HP5 = regenPer5;
    this.AR = armor;
    this.MR = magicResist;
    this.AD = attackDamage;
    this.CritDMG = critDamage;
    this.MS = movementSpeed;
    this.AttackRange = attackRange;
    this.AS = attackSpeed;
    this.BaseMana = baseMana;
    this.Abilities = abilities;
    this.Items = items;
    this.Runes = runes;
  }

  // Get all abilities including item passives
  getAllAbilities(): Ability[] {
    const itemPassives = this.Items.flatMap((item) => item.passives);
    return [...this.Abilities, ...itemPassives];
  }

  // Get all rune effects
  getAllRuneEffects(): RuneEffect[] {
    if (!this.Runes) return [];

    const allRunes = [
      this.Runes.keystone,
      ...this.Runes.primaryRunes,
      ...this.Runes.secondaryRunes,
    ];

    return allRunes.flatMap((rune) => rune.effects || []);
  }

  // Calculate rune damage
  calculateRuneDamage(
    damage: DamageScaling,
    stats: ReturnType<Character["getTotalStats"]>,
    level: number,
    targetMaxHP: number,
  ): number {
    if (!damage) return 0;

    let totalDamage = 0;

    // Base damage
    if (damage.baseDamage) {
      totalDamage +=
        typeof damage.baseDamage === "function"
          ? damage.baseDamage(level)
          : typeof damage.baseDamage === "number"
            ? damage.baseDamage
            : damage.baseDamage[
                Math.min(level - 1, damage.baseDamage.length - 1)
              ];
    }

    // AD/AP ratios
    if (damage.adRatio) {
      const adRatio =
        typeof damage.adRatio === "number"
          ? damage.adRatio
          : typeof damage.adRatio === "function"
            ? damage.adRatio(level)
            : damage.adRatio[Math.min(level - 1, damage.adRatio.length - 1)];
      totalDamage += (stats.ad * adRatio) / 100;
    }
    if (damage.apRatio) {
      const apRatio =
        typeof damage.apRatio === "number"
          ? damage.apRatio
          : typeof damage.apRatio === "function"
            ? damage.apRatio(level)
            : damage.apRatio[Math.min(level - 1, damage.apRatio.length - 1)];
      totalDamage += (stats.ap * apRatio) / 100;
    }
    if (damage.bonusAdRatio) {
      const bonusAD = stats.ad - this.AD;
      const bonusAdRatio =
        typeof damage.bonusAdRatio === "number"
          ? damage.bonusAdRatio
          : typeof damage.bonusAdRatio === "function"
            ? damage.bonusAdRatio(level)
            : damage.bonusAdRatio[
                Math.min(level - 1, damage.bonusAdRatio.length - 1)
              ];
      totalDamage += (bonusAD * bonusAdRatio) / 100;
    }

    // HP ratios
    if (damage.maxHealthRatio) {
      const maxHealthRatio =
        typeof damage.maxHealthRatio === "number"
          ? damage.maxHealthRatio
          : typeof damage.maxHealthRatio === "function"
            ? damage.maxHealthRatio(level)
            : damage.maxHealthRatio[
                Math.min(level - 1, damage.maxHealthRatio.length - 1)
              ];
      totalDamage += (targetMaxHP * maxHealthRatio) / 100;
    }
    if (damage.bonusHPRatio) {
      const bonusHP = stats.hp - this.HP;
      const bonusHPRatio =
        typeof damage.bonusHPRatio === "number"
          ? damage.bonusHPRatio
          : typeof damage.bonusHPRatio === "function"
            ? damage.bonusHPRatio(level)
            : damage.bonusHPRatio[
                Math.min(level - 1, damage.bonusHPRatio.length - 1)
              ];
      totalDamage += (bonusHP * bonusHPRatio) / 100;
    }

    return totalDamage;
  }

  // Calculate total stats with items
  getTotalStats() {
    const baseStats = {
      hp: this.HP,
      mana: 0,
      armor: this.AR,
      mr: this.MR,
      ad: this.AD,
      ap: 0,
      abilityHaste: 0,
      basicAbilityHaste: 0,
      ultAbilityHaste: 0,
      attackSpeed: 0, // Bonus AS percentage
      critChance: 0,
      critDmg: this.CritDMG,
      lifeSteal: 0,
      omnivamp: 0,
      ms: this.MS,
      msPercent: 0,
      lethality: 0,
      armorPen: 0,
      armorReduction: 0,
      flatMagicPen: 0,
      percentMagicPen: 0,
      magicResistReduction: 0,
      healthRegen: this.HP5,
      manaRegen: 0,
      attackRange: this.AttackRange,
      baseAS: Number(this.AS),
      magicOnHit: 0,
      magicOnHitBaseADPercent: 0,
      magicOnHitAPRatio: 0,
      physicalOnHit: 0,
      physicalOnHitCurrentHealthPercent: 0,
      physicalOnHitMaxHealthPercent: 0,
      physicalOnHitBaseADPercent: 0,
      physicalOnHitMaxManaPercent: 0,
      physicalAoEOnHitADPercent: 0,
      physicalAoEOnHitMaxHealthPercent: 0,
      magicPeriodicOnHit: 0,
      trueOnAbilityHit: 0,
      trueOnAbilityHitPerLethality: 0,
      physicalOnAbilityHitMaxManaPercent: 0,
      magicDotDamage: 0,
      magicDotDamagePerAPRatio: 0,
      magicDotDamagePerBonusHPRatio: 0,
      magicDotDamagePerTargetMaxHPRatio: 0,
      physicalBurstDamage: 0,
      physicalBurstDamagePerADRatio: 0,
      physicalBurstDamagePerBonusADRatio: 0,
      magicBurstDamage: 0,
      magicBurstDamagePerAPRatio: 0,
      magicBurstDamagePerTargetMaxHPRatio: 0,
      trueBurstDamage: 0,
      ultCooldownRefundOnTakedown: 0,
      ultCooldownRefundPerLethalityOnTakedown: 0,
      basicAbilityCooldownReductionOnAttack: 0,
      adMultiplicative: 0,
      apMultiplicative: 0,
      bonusHPMultiplicative: 0,
      abilityDamageMultiplicative: 0,
      damageAmplificationOnTarget: 0,
      damagePerTargetBonusHPPercent: 0,
      apPerBurnedTargetMultiplicative: 0,
      apPerManaRegenMultiplicative: 0,
      adPerMaxManaPercent: 0,
      adPerBonusHPPercent: 0,
      adPerBaseADPercent: 0,
      apPerBonusHPPercent: 0,
      apPerBonusManaPercent: 0,
      hpPerBonusManaPercent: 0,
      abilityDamagePerManaMultiplicative: 0,
      abilityDamagePerAPMultiplicative: 0,
      physicalDamageMultiplicative: 0,
      magicDamageMultiplicative: 0,
      damageMultiplicative: 0,
      sustainHealPerSecond: 0,
      sustainHealPerSecondAPPercent: 0,
    };

    // Add item stats - iterate through all keys
    this.Items.forEach((item) => {
      (Object.keys(item.stats) as Array<keyof ItemStats>).forEach((key) => {
        const value = item.stats[key];
        if (value !== undefined && (baseStats as any)[key] !== undefined) {
          (baseStats as any)[key] += value;
        }
      });
    });

    // Add rune stats
    if (this.Runes) {
      const allRunes = [
        this.Runes.keystone,
        ...this.Runes.primaryRunes,
        ...this.Runes.secondaryRunes,
        ...this.Runes.statShards,
      ];

      allRunes.forEach((rune) => {
        if (rune.stats) {
          (Object.keys(rune.stats) as Array<keyof ItemStats>).forEach((key) => {
            const value = (rune.stats as any)[key];
            if (value !== undefined && (baseStats as any)[key] !== undefined) {
              (baseStats as any)[key] += value;
            }
          });
        }
      });
    }

    // Energy / manaless: item mana does not grant AD, AP, on-hit, or ability amp from mana.
    if (!championUsesMana(this)) {
      baseStats.mana = 0;
      baseStats.manaRegen = 0;
    }

    // Calculate final AS with bonus attack speed percentage, capped at 2.5
    const finalAS = Math.min(2.5, baseStats.baseAS * (1 + baseStats.attackSpeed / 100));

    // Calculate final MS with bonus movement speed percentage
    const finalMS = baseStats.ms * (1 + baseStats.msPercent / 100);

    // Calculate bonus HP from bonus mana (e.g., Winter's Approach/Fimbulwinter Awe: 15% bonus mana as HP)
    // Total mana pool = base mana + item mana. Bonus mana = item mana only.
    const totalMana = this.BaseMana + baseStats.mana;
    const bonusMana = baseStats.mana;
    const bonusHPFromMana = (bonusMana * baseStats.hpPerBonusManaPercent) / 100;

    // Apply bonus HP multiplier (e.g., Warmog's Vitality: 12% increased bonus HP)
    const rawBonusHP = baseStats.hp - this.HP + bonusHPFromMana; // Total HP from items + HP from mana
    const bonusHPMultiplier = 1 + (baseStats.bonusHPMultiplicative || 0) / 100;
    const bonusHP = rawBonusHP * bonusHPMultiplier;
    const finalHP = this.HP + bonusHP;

    // Calculate bonus AD from max mana (e.g., Manamune/Muramana Awe passive)
    const bonusADFromMana =
      (totalMana * baseStats.adPerMaxManaPercent) / 100;

    // Calculate bonus AD from bonus HP (e.g., Overlord's Bloodmail Tyranny passive)
    const bonusADFromHP = (bonusHP * baseStats.adPerBonusHPPercent) / 100;

    // Calculate bonus AD from base AD (e.g., Sterak's Gage The Claws that Catch passive)
    const bonusADFromBaseAD = (this.AD * baseStats.adPerBaseADPercent) / 100;

    // Calculate base total AD (before multipliers)
    const baseTotalAD =
      baseStats.ad + bonusADFromMana + bonusADFromHP + bonusADFromBaseAD;

    // Apply AD multiplier (e.g., Overlord's Bloodmail Retribution passive)
    const adMultiplier = 1 + (baseStats.adMultiplicative || 0) / 100;
    const finalAD = baseTotalAD * adMultiplier;

    // Calculate bonus AP from bonus HP (e.g., Riftmaker Void Infusion passive)
    const bonusAPFromHP = (bonusHP * baseStats.apPerBonusHPPercent) / 100;

    // Calculate bonus AP from bonus mana (e.g., Archangel's Staff/Seraph's Embrace Awe passive)
    const bonusAPFromMana =
      (bonusMana * (baseStats.apPerBonusManaPercent || 0)) / 100;

    // Calculate bonus AP from mana regen (e.g., certain support items)
    // apPerManaRegenMultiplicative: AP per 100% base mana regen
    const bonusAPFromManaRegen =
      (baseStats.manaRegen / 100) *
      (baseStats.apPerManaRegenMultiplicative || 0);

    // Calculate bonus AP from burned targets (e.g., Blackfire Torch)
    // Assume 1 target is burned/afflicted for single-target DPS
    const burnedTargets = 1;
    const bonusAPFromBurnedTargets =
      burnedTargets * (baseStats.apPerBurnedTargetMultiplicative || 0);

    // Calculate base total AP (before multipliers)
    const baseTotalAP =
      baseStats.ap +
      bonusAPFromHP +
      bonusAPFromMana +
      bonusAPFromManaRegen +
      bonusAPFromBurnedTargets;

    // Apply AP multiplier (e.g., Rabadon's Deathcap Magical Opus passive)
    const apMultiplier = 1 + (baseStats.apMultiplicative || 0) / 100;
    const finalAP = baseTotalAP * apMultiplier;

    // Calculate ability damage multiplier from mana (e.g., Actualizer passive: 0.005% per mana)
    const abilityDamageFromMana =
      totalMana * (baseStats.abilityDamagePerManaMultiplicative || 0);
    const finalAbilityDamageMultiplicative =
      (baseStats.abilityDamageMultiplicative || 0) + abilityDamageFromMana;

    return {
      ...baseStats,
      hp: finalHP,
      mana: totalMana,
      as: finalAS,
      ms: finalMS,
      ad: finalAD,
      ap: finalAP,
      abilityDamageMultiplicative: finalAbilityDamageMultiplicative,
    };
  }

  calculateDPS(
    targetMaxHP: number = 3000,
    targetBonusHP: number = 1000,
    scenario?: SimulationScenario,
    mitigation?: DpsMitigationOptions,
  ): {
    autoAttackDPS: number;
    onHitDPS: number;
    dotDPS: number;
    abilityDPS: number;
    burstDPS: number; // One-time burst damage at combat start
    sustainedDPS: number;
    comboDPS: number;
    totalDPS: number;
    breakdown: string[];
  } {
    const sim = resolveSimulationScenario(scenario);
    const mit = resolveDpsMitigation(mitigation);
    const stats = this.getTotalStats();
    const physMit = physicalMitigationMultiplier(
      mit.targetArmor,
      stats,
      sim.level,
    );
    const magicMit = magicMitigationMultiplier(mit.targetMR, stats);
    /** For spell-only scenarios: no AAs, no on-hit DPS, no Navori-style CDR from attacks. */
    const attackRate = sim.spellOnlyNoAutos ? 0 : stats.as;
    const breakdown: string[] = [];
    breakdown.push(
      `Target resistances: ${mit.targetArmor} armor (${(physMit * 100).toFixed(1)}% phys dmg), ${mit.targetMR} MR (${(magicMit * 100).toFixed(1)}% magic dmg)`,
    );
    const rotationProfile = sim.enableChampionRotationProfiles
      ? CHAMPION_ROTATION_PROFILES[this.Name]
      : undefined;

    // Calculate effective ability haste for cooldown reduction
    const totalAbilityHaste = stats.abilityHaste + stats.basicAbilityHaste;
    const abilityCDR = totalAbilityHaste / (100 + totalAbilityHaste);

    // 1. Base Auto Attack DPS
    const baseAutoAttackDamage = stats.ad;
    const effectiveCritChance = Math.min(100, stats.critChance);
    const critMultiplier =
      1 + (effectiveCritChance / 100) * ((stats.critDmg - 100) / 100);
    const autoAttackDamagePerHit = baseAutoAttackDamage * critMultiplier;
    const autoAttackDPS = autoAttackDamagePerHit * attackRate;
    breakdown.push(
      `Base AA: ${autoAttackDPS.toFixed(1)} DPS (${stats.ad.toFixed(
        1,
      )} AD * ${critMultiplier.toFixed(2)} crit * ${stats.as.toFixed(2)} AS)`,
    );

    // 2. On-Hit Damage (per attack, multiplied by AS)
    let onHitDamagePerAttack = 0;
    let onHitPhysPerAttack = 0;
    let onHitMagicPerAttack = 0;
    let onHitTruePerAttack = 0;

    const addOnHitPhys = (dmg: number, label: string) => {
      onHitDamagePerAttack += dmg;
      onHitPhysPerAttack += dmg;
      breakdown.push(label);
    };
    const addOnHitMagic = (dmg: number, label: string) => {
      onHitDamagePerAttack += dmg;
      onHitMagicPerAttack += dmg;
      breakdown.push(label);
    };
    const addOnHitTyped = (
      dmg: number,
      label: string,
      damageType: DamageScaling["damageType"] | undefined,
    ) => {
      onHitDamagePerAttack += dmg;
      const t = damageType ?? "physical";
      if (t === "magic") onHitMagicPerAttack += dmg;
      else if (t === "true") onHitTruePerAttack += dmg;
      else if (t === "adaptive") {
        if (stats.ad >= stats.ap) onHitPhysPerAttack += dmg;
        else onHitMagicPerAttack += dmg;
      } else onHitPhysPerAttack += dmg;
      breakdown.push(label);
    };

    // Physical on-hit
    if (stats.physicalOnHit) {
      addOnHitPhys(
        stats.physicalOnHit,
        `Physical on-hit: +${stats.physicalOnHit}`,
      );
    }
    if (stats.physicalOnHitBaseADPercent) {
      const hasSpellbladeItem = this.Items.some(
        (i) => i.getGroupName() === "Spellblade",
      );
      const rawDmg = (this.AD * stats.physicalOnHitBaseADPercent) / 100;
      if (hasSpellbladeItem && attackRate > 0) {
        // Spellblade has a 1.5s ICD — scale damage by proc uptime
        const uptime = spellbladeOnHitUptime(attackRate);
        const dmg = rawDmg * uptime;
        addOnHitPhys(dmg, `Spellblade on-hit (${(uptime * 100).toFixed(0)}% uptime): +${dmg.toFixed(1)}`);
      } else {
        addOnHitPhys(rawDmg, `Physical on-hit (base AD): +${rawDmg.toFixed(1)}`);
      }
    }
    if (stats.physicalOnHitCurrentHealthPercent) {
      const avgCurrentHP = targetMaxHP * sim.avgCurrentHPRatio;
      const dmg =
        (avgCurrentHP * stats.physicalOnHitCurrentHealthPercent) / 100;
      addOnHitPhys(dmg, `Physical on-hit (current HP): +${dmg.toFixed(1)}`);
    }
    if (stats.physicalOnHitMaxHealthPercent) {
      const dmg = (targetMaxHP * stats.physicalOnHitMaxHealthPercent) / 100;
      addOnHitPhys(dmg, `Physical on-hit (target max HP): +${dmg.toFixed(1)}`);
    }
    if (stats.physicalOnHitMaxManaPercent) {
      const maxMana = this.BaseMana + stats.mana;
      const dmg = (maxMana * stats.physicalOnHitMaxManaPercent) / 100;
      addOnHitPhys(dmg, `Physical on-hit (max mana): +${dmg.toFixed(1)}`);
    }

    // Magic on-hit
    if (stats.magicOnHit) {
      addOnHitMagic(stats.magicOnHit, `Magic on-hit: +${stats.magicOnHit}`);
    }
    if (stats.magicOnHitBaseADPercent) {
      const hasSpellbladeItemMagic = this.Items.some(
        (i) => i.getGroupName() === "Spellblade",
      );
      const rawDmg = (this.AD * stats.magicOnHitBaseADPercent) / 100;
      if (hasSpellbladeItemMagic && attackRate > 0) {
        const uptime = spellbladeOnHitUptime(attackRate);
        const dmg = rawDmg * uptime;
        addOnHitMagic(dmg, `Spellblade magic on-hit (${(uptime * 100).toFixed(0)}% uptime): +${dmg.toFixed(1)}`);
      } else {
        addOnHitMagic(rawDmg, `Magic on-hit (base AD): +${rawDmg.toFixed(1)}`);
      }
    }
    if (stats.magicOnHitAPRatio) {
      const dmg = (stats.ap * stats.magicOnHitAPRatio) / 100;
      addOnHitMagic(dmg, `Magic on-hit (AP): +${dmg.toFixed(1)}`);
    }

    // Periodic on-hit (already averaged per attack)
    if (stats.magicPeriodicOnHit) {
      addOnHitMagic(
        stats.magicPeriodicOnHit,
        `Periodic magic on-hit: +${stats.magicPeriodicOnHit}`,
      );
    }

    // AoE on-hit damage
    if (stats.physicalAoEOnHitADPercent) {
      const dmg = (stats.ad * stats.physicalAoEOnHitADPercent) / 100;
      addOnHitPhys(dmg, `AoE physical on-hit: +${dmg.toFixed(1)}`);
    }
    if (stats.physicalAoEOnHitMaxHealthPercent) {
      const dmg = (targetMaxHP * stats.physicalAoEOnHitMaxHealthPercent) / 100;
      addOnHitPhys(dmg, `AoE physical on-hit (max HP): +${dmg.toFixed(1)}`);
    }

    // Process on-hit abilities (passives like Gwen's A Thousand Cuts, or buffs like Gwen E)
    const abilities = this.getAllAbilities();
    for (const ability of abilities) {
      if (!ability.appliesOnHit || !ability.damage) continue;

      let onHitDamage = 0;
      const level =
        ability.abilityType === "passive"
          ? sim.level
          : ability.abilityType === "R"
            ? Math.max(1, ultRankAtLevel(sim.level))
            : abilityRankAtLevel(sim.level, ability.abilityType as "Q" | "W" | "E", this.Name);

      if (ability.damage.baseDamage) {
        onHitDamage += ability.getValueAtLevel(
          ability.damage.baseDamage,
          level,
        );
      }
      if (
        ability.damage.maxHealthRatio ||
        ability.damage.maxHealthRatioPerAP ||
        ability.damage.maxHealthRatioPerAD ||
        ability.damage.maxHealthRatioPerBonusAD
      ) {
        let effectivePercent = ability.damage.maxHealthRatio
          ? ability.getValueAtLevel(ability.damage.maxHealthRatio, level)
          : 0;
        if (ability.damage.maxHealthRatioPerAP) {
          effectivePercent +=
            (ability.damage.maxHealthRatioPerAP * stats.ap) / 100;
        }
        if (ability.damage.maxHealthRatioPerAD) {
          effectivePercent +=
            (ability.damage.maxHealthRatioPerAD * stats.ad) / 100;
        }
        if (ability.damage.maxHealthRatioPerBonusAD) {
          const bonusAD = stats.ad - this.AD;
          effectivePercent +=
            (ability.damage.maxHealthRatioPerBonusAD * bonusAD) / 100;
        }
        onHitDamage += (targetMaxHP * effectivePercent) / 100;
      }
      if (
        ability.damage.currentHealthRatio ||
        ability.damage.currentHealthRatioPerAP
      ) {
        const avgCurrentHP = targetMaxHP * sim.avgCurrentHPRatio;
        let effectivePercent = ability.damage.currentHealthRatio
          ? ability.getValueAtLevel(ability.damage.currentHealthRatio, level)
          : 0;
        if (ability.damage.currentHealthRatioPerAP) {
          effectivePercent +=
            (ability.damage.currentHealthRatioPerAP * stats.ap) / 100;
        }
        onHitDamage += (avgCurrentHP * effectivePercent) / 100;
      }
      if (
        ability.damage.missingHealthRatio ||
        ability.damage.missingHealthRatioPerAP
      ) {
        const avgMissingHP = targetMaxHP * (1 - sim.avgCurrentHPRatio);
        let effectivePercent = ability.damage.missingHealthRatio
          ? ability.getValueAtLevel(ability.damage.missingHealthRatio, level)
          : 0;
        if (ability.damage.missingHealthRatioPerAP) {
          effectivePercent +=
            (ability.damage.missingHealthRatioPerAP * stats.ap) / 100;
        }
        onHitDamage += (avgMissingHP * effectivePercent) / 100;
      }
      if (ability.damage.apRatio) {
        onHitDamage +=
          (stats.ap * ability.getValueAtLevel(ability.damage.apRatio, level)) /
          100;
      }
      if (ability.damage.adRatio) {
        onHitDamage +=
          (stats.ad * ability.getValueAtLevel(ability.damage.adRatio, level)) /
          100;
      }
      if (ability.damage.bonusAdRatio) {
        const bonusAD = stats.ad - this.AD;
        onHitDamage +=
          (bonusAD *
            ability.getValueAtLevel(ability.damage.bonusAdRatio, level)) /
          100;
      }
      if (ability.damage.bonusHPRatio) {
        const bonusHP = stats.hp - this.HP;
        onHitDamage +=
          (bonusHP *
            ability.getValueAtLevel(ability.damage.bonusHPRatio, level)) /
          100;
      }
      if (ability.damage.maxManaRatio) {
        const maxMana = this.BaseMana + stats.mana;
        onHitDamage +=
          (maxMana *
            ability.getValueAtLevel(ability.damage.maxManaRatio, level)) /
          100;
      }
      if (ability.damage.bonusMRRatio) {
        const bonusMR = stats.mr - this.MR;
        onHitDamage +=
          (bonusMR *
            ability.getValueAtLevel(ability.damage.bonusMRRatio, level)) /
          100;
      }

      const sustain =
        ONHIT_SUSTAINED_FACTOR[ability.name] ??
        (ability.abilityType === "passive"
          ? sim.onHitPassiveFallbackSustain
          : sim.onHitActiveFallbackSustain);
      const rotationOnHitMultiplier =
        rotationProfile?.onHitSustainMultiplier ?? 1;
      const sustainedOnHit = onHitDamage * sustain * rotationOnHitMultiplier;
      addOnHitTyped(
        sustainedOnHit,
        sustain < 0.999
          ? `${ability.name}: +${sustainedOnHit.toFixed(1)} on-hit (×${sustain.toFixed(2)} sustained)`
          : `${ability.name}: +${sustainedOnHit.toFixed(1)} on-hit`,
        ability.damage?.damageType,
      );
    }

    // Process on-hit rune effects (Press the Attack, Grasp, etc.)
    const runeEffects = this.getAllRuneEffects();
    let runeTimedPhysDPS = 0;
    let runeTimedMagicDPS = 0;
    let runeTimedTrueDPS = 0;
    const addRuneTimedDPS = (
      dps: number,
      dtype: DamageScaling["damageType"] | undefined,
      label: string,
    ) => {
      if (dps <= 0) return;
      const t = dtype ?? "physical";
      if (t === "magic") runeTimedMagicDPS += dps;
      else if (t === "true") runeTimedTrueDPS += dps;
      else if (t === "adaptive") {
        if (stats.ad >= stats.ap) runeTimedPhysDPS += dps;
        else runeTimedMagicDPS += dps;
      } else runeTimedPhysDPS += dps;
      breakdown.push(label);
    };

    for (const effect of runeEffects) {
      if (effect.type !== "onHit" || !effect.damage) continue;

      const damage = this.calculateRuneDamage(
        effect.damage,
        stats,
        sim.level,
        targetMaxHP,
      );

      if (effect.trigger === "perStack") {
        const avgPerHit = damage * LETHAL_TEMPO_BOLT_UPTIME;
        addOnHitTyped(
          avgPerHit,
          `Rune (Lethal Tempo bolt, sustained): +${avgPerHit.toFixed(1)} per hit`,
          effect.damage?.damageType ?? "magic",
        );
        continue;
      }

      if (effect.cooldown) {
        const { dps, label } = runeProcSustainedDPS(
          damage,
          effect,
          attackRate,
        );
        addRuneTimedDPS(dps, effect.damage?.damageType, label);
      }
    }

    // (Spellblade ICD uptime already applied above at the add-site)

    const onHitDPS = onHitDamagePerAttack * attackRate;
    if (onHitDamagePerAttack > 0) {
      breakdown.push(
        `On-hit total: ${onHitDPS.toFixed(
          1,
        )} DPS (${onHitDamagePerAttack.toFixed(1)} * ${attackRate.toFixed(
          2,
        )} AS)`,
      );
    }

    // 3. DoT Damage (per second, not multiplied by AS)
    let dotDPS = 0;

    if (stats.magicDotDamage) {
      dotDPS += stats.magicDotDamage;
      breakdown.push(`Magic DoT: +${stats.magicDotDamage} DPS`);
    }
    if (stats.magicDotDamagePerAPRatio) {
      const dmg = (stats.ap * stats.magicDotDamagePerAPRatio) / 100;
      dotDPS += dmg;
      breakdown.push(`Magic DoT (AP): +${dmg.toFixed(1)} DPS`);
    }
    if (stats.magicDotDamagePerBonusHPRatio) {
      const bonusHP = stats.hp - this.HP;
      const dmg = (bonusHP * stats.magicDotDamagePerBonusHPRatio) / 100;
      dotDPS += dmg;
      breakdown.push(`Magic DoT (bonus HP): +${dmg.toFixed(1)} DPS`);
    }
    if (stats.magicDotDamagePerTargetMaxHPRatio) {
      const dmg = (targetMaxHP * stats.magicDotDamagePerTargetMaxHPRatio) / 100;
      dotDPS += dmg;
      breakdown.push(`Magic DoT (target max HP): +${dmg.toFixed(1)} DPS`);
    }

    // 4. Ability DPS (raw, before offensive multipliers and resistances)
    let abilityPhysDPS = 0;
    let abilityMagicDPS = 0;
    let abilityTrueDPS = 0;
    const abilityCasts: ComboCastSpec[] = [];

    for (const ability of abilities) {
      // Skip passives and on-hit abilities (already counted in on-hit DPS)
      if (
        !ability.damage ||
        ability.abilityType === "passive" ||
        ability.appliesOnHit
      )
        continue;

      const abilityRank =
        ability.abilityType === "R"
          ? ultRankAtLevel(sim.level)
          : abilityRankAtLevel(sim.level, ability.abilityType as "Q" | "W" | "E", this.Name);
      if (abilityRank <= 0) continue;
      const baseCooldown = ability.getCooldownAtLevel(abilityRank);
      if (baseCooldown === 0) continue;

      // Check if this ability has a static or ammo cooldown (not reduced by ability haste/Navori)
      const isStaticCooldown =
        ability.cooldown.cooldownType === "static" ||
        ability.cooldown.cooldownType === "ammo";

      let actualCooldown = baseCooldown;

      // Only apply ability haste if not a static cooldown
      if (!isStaticCooldown) {
        const effectiveAH =
          ability.abilityType === "R"
            ? Math.min(
                stats.abilityHaste + stats.ultAbilityHaste,
                sim.abilityHasteCap,
              )
            : Math.min(totalAbilityHaste, sim.abilityHasteCap);
        const effectiveCDR = effectiveAH / (100 + effectiveAH);
        actualCooldown = baseCooldown * (1 - effectiveCDR);

        // Apply on-attack CDR for basic abilities (e.g., Navori Flickerblade)
        // If we have X% CDR per attack and Y attacks per second, we reduce CD by X*Y% per second
        // This effectively reduces cooldown by: CD * (1 - X/100)^(attacks during CD)
        // Simplified: reduced CD = CD / (1 + X/100 * AS * CD) for sustained DPS
        if (
          ability.abilityType !== "R" &&
          stats.basicAbilityCooldownReductionOnAttack
        ) {
          const cdrPerAttack =
            stats.basicAbilityCooldownReductionOnAttack / 100;
          const attacksDuringCooldown = attackRate * actualCooldown;
          // Each attack reduces remaining CD by cdrPerAttack fraction
          // Effective CD reduction factor
          const cdrFromAttacks =
            1 - (1 - cdrPerAttack) ** attacksDuringCooldown;
          actualCooldown = actualCooldown * (1 - cdrFromAttacks);
        }

        // Floor cooldown using cast time and a fraction of base CD so sustained DPS does not
        // explode when AH + Navori drive effective CD toward zero (degenerate vs live League).
        const castFloor = ability.castInfo?.castTime ?? 0.5;
        const rotationFloor = baseCooldown * sim.cooldownFloorBaseRatio;
        actualCooldown = Math.max(actualCooldown, castFloor, rotationFloor);
      }

      const isAmmo = ability.cooldown.cooldownType === "ammo";
      let ammoChargeDamage = 1;

      // Calculate ability damage at scenario rank
      let abilityDamage = 0;
      if (ability.damage.baseDamage) {
        abilityDamage += ability.getValueAtLevel(
          ability.damage.baseDamage,
          abilityRank,
        );
      }
      if (ability.damage.adRatio) {
        abilityDamage +=
          (stats.ad *
            ability.getValueAtLevel(ability.damage.adRatio, abilityRank)) /
          100;
      }
      if (ability.damage.apRatio) {
        abilityDamage +=
          (stats.ap *
            ability.getValueAtLevel(ability.damage.apRatio, abilityRank)) /
          100;
      }
      if (ability.damage.bonusAdRatio) {
        const bonusAD = stats.ad - this.AD;
        abilityDamage +=
          (bonusAD *
            ability.getValueAtLevel(ability.damage.bonusAdRatio, abilityRank)) /
          100;
      }
      if (
        ability.damage.maxHealthRatio ||
        ability.damage.maxHealthRatioPerAP ||
        ability.damage.maxHealthRatioPerAD ||
        ability.damage.maxHealthRatioPerBonusAD
      ) {
        let effectiveMaxHPPercent = ability.damage.maxHealthRatio
          ? ability.getValueAtLevel(ability.damage.maxHealthRatio, abilityRank)
          : 0;
        if (ability.damage.maxHealthRatioPerAP) {
          effectiveMaxHPPercent +=
            (ability.damage.maxHealthRatioPerAP * stats.ap) / 100;
        }
        if (ability.damage.maxHealthRatioPerAD) {
          effectiveMaxHPPercent +=
            (ability.damage.maxHealthRatioPerAD * stats.ad) / 100;
        }
        if (ability.damage.maxHealthRatioPerBonusAD) {
          const bonusAD = stats.ad - this.AD;
          effectiveMaxHPPercent +=
            (ability.damage.maxHealthRatioPerBonusAD * bonusAD) / 100;
        }
        abilityDamage += (targetMaxHP * effectiveMaxHPPercent) / 100;
      }
      if (
        ability.damage.currentHealthRatio ||
        ability.damage.currentHealthRatioPerAP
      ) {
        const avgCurrentHP = targetMaxHP * sim.avgCurrentHPRatio;
        let effectivePercent = ability.damage.currentHealthRatio
          ? ability.getValueAtLevel(
              ability.damage.currentHealthRatio,
              abilityRank,
            )
          : 0;
        if (ability.damage.currentHealthRatioPerAP) {
          effectivePercent +=
            (ability.damage.currentHealthRatioPerAP * stats.ap) / 100;
        }
        abilityDamage += (avgCurrentHP * effectivePercent) / 100;
      }
      if (
        ability.damage.missingHealthRatio ||
        ability.damage.missingHealthRatioPerAP
      ) {
        const avgMissingHP = targetMaxHP * (1 - sim.avgCurrentHPRatio);
        let effectivePercent = ability.damage.missingHealthRatio
          ? ability.getValueAtLevel(
              ability.damage.missingHealthRatio,
              abilityRank,
            )
          : 0;
        if (ability.damage.missingHealthRatioPerAP) {
          effectivePercent +=
            (ability.damage.missingHealthRatioPerAP * stats.ap) / 100;
        }
        abilityDamage += (avgMissingHP * effectivePercent) / 100;
      }
      if (ability.damage.bonusHPRatio) {
        const bonusHP = stats.hp - this.HP;
        abilityDamage +=
          (bonusHP *
            ability.getValueAtLevel(ability.damage.bonusHPRatio, abilityRank)) /
          100;
      }
      if (ability.damage.maxManaRatio) {
        const maxMana = this.BaseMana + stats.mana;
        abilityDamage +=
          (maxMana *
            ability.getValueAtLevel(ability.damage.maxManaRatio, abilityRank)) /
          100;
      }
      if (ability.damage.bonusMRRatio) {
        const bonusMR = stats.mr - this.MR;
        abilityDamage +=
          (bonusMR *
            ability.getValueAtLevel(ability.damage.bonusMRRatio, abilityRank)) /
          100;
      }

      // Add on-ability-hit damage from items (e.g., Muramana Shock)
      let onAbilityHitTrue = 0;
      let onAbilityHitPhys = 0;
      if (stats.trueOnAbilityHit) {
        onAbilityHitTrue += stats.trueOnAbilityHit;
      }
      if (stats.trueOnAbilityHitPerLethality) {
        onAbilityHitTrue +=
          stats.lethality * stats.trueOnAbilityHitPerLethality;
      }
      if (stats.physicalOnAbilityHitMaxManaPercent) {
        const maxMana = this.BaseMana + stats.mana;
        onAbilityHitPhys +=
          (maxMana * stats.physicalOnAbilityHitMaxManaPercent) / 100;
      }

      let castsPerWindow = effectiveAbilityCasts(ability);
      if (isAmmo) {
        const charges = Math.max(1, castsPerWindow);
        const recharge = baseCooldown;
        const castTime = ability.castInfo?.castTime ?? 0.25;
        const dumpSeconds = castTime + recharge * Math.max(0, charges - 1);
        actualCooldown = Math.max(dumpSeconds / charges, castTime);
        ammoChargeDamage = charges;
        castsPerWindow = 1;
      }
      const coreDamage = abilityDamage * castsPerWindow * ammoChargeDamage;
      const trueDamage = onAbilityHitTrue * castsPerWindow;
      const physBonusDamage = onAbilityHitPhys * castsPerWindow;
      const totalDamage = coreDamage + trueDamage + physBonusDamage;

      // DPS = damage / cooldown
      const rotationMultiplier =
        rotationProfile?.abilityTypeMultiplier?.[ability.abilityType] ?? 1;
      const scale = rotationMultiplier / actualCooldown;
      const dmgType = ability.damage?.damageType ?? "physical";
      const coreDps = coreDamage * scale;
      if (dmgType === "magic") abilityMagicDPS += coreDps;
      else if (dmgType === "true") abilityTrueDPS += coreDps;
      else if (dmgType === "adaptive") {
        if (stats.ad >= stats.ap) abilityPhysDPS += coreDps;
        else abilityMagicDPS += coreDps;
      } else abilityPhysDPS += coreDps;
      abilityTrueDPS += trueDamage * scale;
      abilityPhysDPS += physBonusDamage * scale;
      const adjustedDps = totalDamage * scale;

      if (
        ability.abilityType === "Q" ||
        ability.abilityType === "W" ||
        ability.abilityType === "E" ||
        ability.abilityType === "R"
      ) {
        const singleCastDamage =
          (abilityDamage + onAbilityHitTrue + onAbilityHitPhys) *
          rotationMultiplier;
        abilityCasts.push({
          abilityType: ability.abilityType,
          singleCastDamage,
          damageType: dmgType,
          actualCooldown,
          castTime: ability.castInfo?.castTime ?? 0.25,
          maxCasts: castsPerWindow,
        });
      }

      breakdown.push(
        `${ability.name}: ${adjustedDps.toFixed(1)} DPS (${totalDamage.toFixed(
          0,
        )} dmg / ${actualCooldown.toFixed(1)}s CD)`,
      );
      if (Math.abs(rotationMultiplier - 1) > 0.001) {
        breakdown.push(
          `${ability.name}: rotation weight ×${rotationMultiplier.toFixed(2)} (${this.Name})`,
        );
      }
    }

    abilityPhysDPS += runeTimedPhysDPS;
    abilityMagicDPS += runeTimedMagicDPS;
    abilityTrueDPS += runeTimedTrueDPS;

    // Process ability-triggered rune effects (Electrocute, Arcane Comet, etc.)
    for (const effect of runeEffects) {
      if (effect.type === "onAbilityHit" && effect.damage && effect.cooldown) {
        const damage = this.calculateRuneDamage(
          effect.damage,
          stats,
          sim.level,
          targetMaxHP,
        );
        const effectiveCooldown = effect.cooldown * (1 - abilityCDR);
        const condUptime = effect.conditions
          ? runeConditionUptime(
              effect.conditions,
              sim,
              targetBonusHP,
            )
          : 1;
        const runeDPS = (damage / effectiveCooldown) * condUptime;
        const runeType = effect.damage?.damageType ?? "magic";
        if (runeType === "magic") abilityMagicDPS += runeDPS;
        else if (runeType === "true") abilityTrueDPS += runeDPS;
        else if (runeType === "adaptive") {
          if (stats.ad >= stats.ap) abilityPhysDPS += runeDPS;
          else abilityMagicDPS += runeDPS;
        } else abilityPhysDPS += runeDPS;
        breakdown.push(
          `Rune (ability): ${runeDPS.toFixed(
            1,
          )} DPS (${damage.toFixed(0)} / ${effectiveCooldown.toFixed(1)}s)`,
        );
      }
    }

  const { runeMultiplier, ptaAmpMultiplier } = collectRuneDamageMultipliers(
      runeEffects,
      sim,
      targetBonusHP,
      attackRate,
    );

    // 5. Apply damage multipliers
    const damageMultiplier = 1 + (stats.damageMultiplicative || 0) / 100;
    const physicalDamageMultiplier =
      1 + (stats.physicalDamageMultiplicative || 0) / 100;
    const magicDamageMultiplier =
      1 + (stats.magicDamageMultiplicative || 0) / 100;
    const targetDamageAmp = 1 + (stats.damageAmplificationOnTarget || 0) / 100;
    const giantSlayerMultiplier =
      1 +
      Math.min(
        15,
        (targetBonusHP / 100) * (stats.damagePerTargetBonusHPPercent || 0),
      ) /
        100;
    // Base multiplier (applies to all damage)
    const baseMultiplier =
      damageMultiplier *
      targetDamageAmp *
      giantSlayerMultiplier *
      runeMultiplier *
      ptaAmpMultiplier;

    // Physical multiplier (for auto attacks and physical on-hit)
    const totalPhysicalMultiplier =
      baseMultiplier * physicalDamageMultiplier;

    // Magic multiplier (for magic on-hit and magic DoT)
    const totalMagicMultiplier = baseMultiplier * magicDamageMultiplier;

    // Combined multiplier for mixed damage (weighted average, assuming ~70% physical for AA builds)
    const totalMultiplier = baseMultiplier;

    if (totalMultiplier > 1) {
      breakdown.push(
        `Damage multipliers: ${(totalMultiplier * 100).toFixed(
          1,
        )}% (${damageMultiplier.toFixed(2)} * ${targetDamageAmp.toFixed(
          2,
        )} * ${giantSlayerMultiplier.toFixed(2)})`,
      );
    }

    // Ability amps: base + ability-specific; physical/magic amps apply by damage type
    const abilityDamageFromAP =
      stats.ap * (stats.abilityDamagePerAPMultiplicative || 0);
    const abilityBaseMult =
      damageMultiplier *
      targetDamageAmp *
      giantSlayerMultiplier *
      runeMultiplier *
      ptaAmpMultiplier *
      (1 +
        ((stats.abilityDamageMultiplicative || 0) + abilityDamageFromAP) / 100);
    const abilityPhysMult =
      abilityBaseMult * physicalDamageMultiplier;
    const abilityMagicMult = abilityBaseMult * magicDamageMultiplier;
    // 6. Calculate Burst Damage (one-time damage at combat start)
    let burstPhys = 0;
    let burstMagic = 0;
    let burstTrue = 0;

    // Item burst damage
    if (stats.physicalBurstDamage) {
      burstPhys += stats.physicalBurstDamage;
    }
    if (stats.physicalBurstDamagePerADRatio) {
      burstPhys += (stats.ad * stats.physicalBurstDamagePerADRatio) / 100;
    }
    if (stats.physicalBurstDamagePerBonusADRatio) {
      const bonusAD = stats.ad - this.AD;
      burstPhys += (bonusAD * stats.physicalBurstDamagePerBonusADRatio) / 100;
    }
    if (stats.magicBurstDamage) {
      burstMagic += stats.magicBurstDamage;
    }
    if (stats.magicBurstDamagePerAPRatio) {
      burstMagic += (stats.ap * stats.magicBurstDamagePerAPRatio) / 100;
    }
    if (stats.magicBurstDamagePerTargetMaxHPRatio) {
      burstMagic +=
        (targetMaxHP * stats.magicBurstDamagePerTargetMaxHPRatio) / 100;
    }
    if (stats.trueBurstDamage) {
      burstTrue += stats.trueBurstDamage;
    }

    // Ability burst damage (abilities with burstDamage field)
    for (const ability of this.Abilities) {
      if (ability.burstDamage) {
        const abilityLevel =
          ability.abilityType === "passive"
            ? sim.level
            : ability.abilityType === "R"
              ? Math.max(1, ultRankAtLevel(sim.level))
              : abilityRankAtLevel(sim.level, ability.abilityType as "Q" | "W" | "E", this.Name);

        // Calculate burst damage from burstDamage field
        let abilityBurstDmg = 0;
        const burst = ability.burstDamage;

        if (burst.baseDamage) {
          abilityBurstDmg +=
            typeof burst.baseDamage === "function"
              ? burst.baseDamage(abilityLevel)
              : typeof burst.baseDamage === "number"
                ? burst.baseDamage
                : burst.baseDamage[
                    Math.min(abilityLevel - 1, burst.baseDamage.length - 1)
                  ];
        }
        if (burst.adRatio) {
          const ratio =
            typeof burst.adRatio === "function"
              ? burst.adRatio(abilityLevel)
              : typeof burst.adRatio === "number"
                ? burst.adRatio
                : burst.adRatio[
                    Math.min(abilityLevel - 1, burst.adRatio.length - 1)
                  ];
          abilityBurstDmg += (stats.ad * ratio) / 100;
        }
        if (burst.apRatio) {
          const ratio =
            typeof burst.apRatio === "function"
              ? burst.apRatio(abilityLevel)
              : typeof burst.apRatio === "number"
                ? burst.apRatio
                : burst.apRatio[
                    Math.min(abilityLevel - 1, burst.apRatio.length - 1)
                  ];
          abilityBurstDmg += (stats.ap * ratio) / 100;
        }
        if (burst.bonusAdRatio) {
          const bonusAD = stats.ad - this.AD;
          const ratio =
            typeof burst.bonusAdRatio === "function"
              ? burst.bonusAdRatio(abilityLevel)
              : typeof burst.bonusAdRatio === "number"
                ? burst.bonusAdRatio
                : burst.bonusAdRatio[
                    Math.min(abilityLevel - 1, burst.bonusAdRatio.length - 1)
                  ];
          abilityBurstDmg += (bonusAD * ratio) / 100;
        }
        if (burst.maxHealthRatio) {
          const ratio =
            typeof burst.maxHealthRatio === "function"
              ? burst.maxHealthRatio(abilityLevel)
              : typeof burst.maxHealthRatio === "number"
                ? burst.maxHealthRatio
                : burst.maxHealthRatio[
                    Math.min(abilityLevel - 1, burst.maxHealthRatio.length - 1)
                  ];
          abilityBurstDmg += (targetMaxHP * ratio) / 100;
        }

        const burstType =
          burst.damageType ?? ability.damage?.damageType ?? "physical";
        if (burstType === "magic") burstMagic += abilityBurstDmg;
        else if (burstType === "true") burstTrue += abilityBurstDmg;
        else if (burstType === "adaptive") {
          if (stats.ad >= stats.ap) burstPhys += abilityBurstDmg;
          else burstMagic += abilityBurstDmg;
        } else burstPhys += abilityBurstDmg;
        breakdown.push(`${ability.name} burst: ${abilityBurstDmg.toFixed(1)}`);
      }
    }

    const finalAbilityDPS =
      abilityPhysMult * abilityPhysDPS * physMit +
      abilityMagicMult * abilityMagicDPS * magicMit +
      abilityBaseMult * abilityTrueDPS;

    const onHitPhysDPS = onHitPhysPerAttack * attackRate;
    const onHitMagicDPS = onHitMagicPerAttack * attackRate;
    const onHitTrueDPS = onHitTruePerAttack * attackRate;
    const finalOnHitDPS =
      onHitPhysDPS * totalPhysicalMultiplier * physMit +
      onHitMagicDPS * totalMagicMultiplier * magicMit +
      onHitTrueDPS * totalMultiplier;

    const finalAutoAttackDPS =
      autoAttackDPS * totalPhysicalMultiplier * physMit;
    const finalDotDPS = dotDPS * totalMagicMultiplier * magicMit;

    const burstAfterMit =
      abilityPhysMult * burstPhys * physMit +
      abilityMagicMult * burstMagic * magicMit +
      abilityBaseMult * burstTrue;

    const autoHitAfterMit =
      autoAttackDamagePerHit * totalPhysicalMultiplier * physMit;
    const onHitPerAutoMit =
      onHitPhysPerAttack * totalPhysicalMultiplier * physMit +
      onHitMagicPerAttack * totalMagicMultiplier * magicMit +
      onHitTruePerAttack * totalMultiplier;
    const comboProfile = CHAMPION_COMBO_PROFILES[this.Name];
    const castOrder = comboProfile?.castOrder ?? DEFAULT_COMBO_CAST_ORDER;
    const comboResult = simulateComboWindowDamage(
      mit.comboWindowSeconds,
      abilityCasts,
      castOrder,
      comboProfile,
      stats,
      sim.level,
      abilityBaseMult,
      abilityPhysMult,
      abilityMagicMult,
      physMit,
      magicMit,
      burstAfterMit,
      autoHitAfterMit,
      onHitPerAutoMit,
      attackRate,
    );

    let executeThresholdPercent = 0;
    for (const item of this.Items) {
      const t = item.stats.executeMaxHealthThresholdPercent;
      if (t != null && t > executeThresholdPercent) {
        executeThresholdPercent = t;
      }
    }

    // targetMaxHP already represents the target's full max HP (base + bonus)
    const executeBonus = collectorExecuteBonusDamage(
      comboResult.total,
      targetMaxHP,
      targetMaxHP,
      executeThresholdPercent,
    );
    const comboTotalWithExecute = comboResult.total + executeBonus;

    let sustainedDPS =
      finalAutoAttackDPS + finalOnHitDPS + finalDotDPS + finalAbilityDPS;
    let comboDPS = comboTotalWithExecute / mit.comboWindowSeconds;

    const hasFirstStrike = runeEffects.some(
      (e) =>
        e.type === "conditional" &&
        e.statMultiplier === 7 &&
        e.cooldown === 12,
    );
    if (hasFirstStrike) {
      const fsUptime = sim.conditionalGeneralUptime * (5 / 12);
      const fsSustainedBonus = sustainedDPS * 0.07 * fsUptime;
      const fsComboBonus = comboDPS * 0.07 * fsUptime;
      sustainedDPS += fsSustainedBonus;
      comboDPS += fsComboBonus;
      breakdown.push(
        `First Strike (bonus true, ~${(fsUptime * 100).toFixed(0)}% uptime): +${(fsSustainedBonus + fsComboBonus).toFixed(1)} DPS`,
      );
    }

    const burstSustainDPS = burstAfterMit / mit.comboWindowSeconds;

    breakdown.push(`Sustained (rotation): ${sustainedDPS.toFixed(1)} DPS`);
    breakdown.push(
      `Combo (${mit.comboWindowSeconds}s window): ${comboResult.total.toFixed(0)} total → ${(comboResult.total / mit.comboWindowSeconds).toFixed(1)} DPS`,
    );
    if (executeBonus > 0) {
      breakdown.push(
        `Collector execute (Death): +${executeBonus.toFixed(0)} vs ${targetMaxHP.toFixed(0)} HP (≤${executeThresholdPercent}% max HP)`,
      );
    }
    if (burstAfterMit > 0) {
      breakdown.push(
        `Item burst in combo: ${burstAfterMit.toFixed(0)} (${burstSustainDPS.toFixed(1)} DPS if spread)`,
      );
    }

    const totalDPS =
      sustainedDPS * (1 - BLENDED_DPS_COMBO_WEIGHT) +
      comboDPS * BLENDED_DPS_COMBO_WEIGHT;

    return {
      autoAttackDPS: finalAutoAttackDPS,
      onHitDPS: finalOnHitDPS,
      dotDPS: finalDotDPS,
      abilityDPS: finalAbilityDPS,
      burstDPS: burstSustainDPS,
      sustainedDPS,
      comboDPS,
      totalDPS,
      breakdown,
    };
  }
}

const Aatrox = new Character(
  "Aatrox",
  650, // HP
  3, // HP5
  38, // AR
  32, // MR
  60, // AD
  200, // Crit DMG (%)
  345, // MS
  175, // Attack range
  0.651, // Base AS
  [AatroxPassive, AatroxQ, AatroxW, AatroxE, AatroxR],
  [], // Items (can be added later)
);

const AhriPassive = new Ability(
  "Essence Theft",
  "passive",
  "Heals when killing minions/monsters at 9 stacks, or when scoring champion takedowns",
  {
    cooldown: 0,
    cooldownType: "static",
  },
  undefined,
  undefined,
  {
    heal: (level: number) => 35 + ((level - 1) * 60) / 17, // 35-95 based on level
  },
  undefined,
  undefined,
  [
    "Champion takedown heal: 75-165 (+ 30% AP)",
    "Minion/monster heal: 35-95 (+ 20% AP) at 9 stacks",
  ],
);

const AhriQ = new Ability(
  "Orb of Deception",
  "Q",
  "Sends orb outward dealing magic damage",
  {
    cooldown: 7,
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 900,
    width: 200,
    speed: 1550,
  },
  {
    baseDamage: [40, 65, 90, 115, 140],
    apRatio: 45,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Outward pass: 40/65/90/115/140 (+45% AP) magic damage",
  ],
);

const AhriQReturn = new Ability(
  "Orb of Deception (Return)",
  "Q",
  "Return pass of orb dealing true damage",
  {
    cooldown: 7,
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 900,
    width: 200,
    speed: 1550,
  },
  {
    baseDamage: [40, 65, 90, 115, 140],
    apRatio: 45,
    damageType: "true",
  },
  undefined,
  undefined,
  undefined,
  [
    "Return pass: 40/65/90/115/140 (+45% AP) true damage",
  ],
);

const AhriW = new Ability(
  "Fox-Fire",
  "W",
  "Gains movement speed and conjures flames that target nearby enemies",
  {
    cooldown: [10, 9, 8, 7, 6],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    radius: 550,
    speed: 1400,
  },
  {
    // Per flame: 50-130 + 30% AP
    // 3 flames, subsequent at 30%: 50-130 + 30%AP + 2*(0.3*(50-130 + 30%AP))
    // = 50-130 + 30%AP + 0.6*(50-130 + 30%AP) = 1.6*(50-130 + 30%AP)
    // Total: 80-208 + 48% AP
    baseDamage: [80, 112, 144, 176, 208],
    apRatio: 48,
    damageType: "magic",
  },
  {
    duration: 2.5,
    bonusStats: {
      ms: 40, // 40% MS that decays over 2s
    },
  },
  undefined,
  undefined,
  [
    "3 flames, subsequent at 30% damage",
    "Per flame: 50/65/80/95/130 (+30% AP)",
    "Total (1 + 0.3 + 0.3): 80/104/128/152/208 (+48% AP)",
  ],
);

const AhriE = new Ability(
  "Charm",
  "E",
  "Blows a kiss that charms and slows the first enemy hit",
  {
    cooldown: 12,
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 1000,
    width: 120,
    speed: 1550,
  },
  {
    // 80-240 + 60% AP
    baseDamage: [80, 120, 160, 200, 240],
    apRatio: 60,
    damageType: "magic",
  },
  {
    ccType: "slow",
    ccDuration: 1.4, // 1.2-2s based on rank
    slow: 65,
  },
  undefined,
  undefined,
  ["Charms for 1.2/1.4/1.6/1.8/2s"],
);

const AhriR = new Ability(
  "Spirit Rush",
  "R",
  "Dashes and fires essence bolts to nearby enemies, can recast up to 3 times",
  {
    cooldown: [140, 120, 100],
    staticCooldown: 1,
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 500,
    radius: 600,
    speed: 1200,
  },
  {
    // Per cast: 60-180 + 35% AP
    // 3 casts total: 180-540 + 105% AP
    baseDamage: [180, 360, 540],
    apRatio: 105,
    damageType: "magic",
  },
  undefined,
  undefined, // damage already totaled for 3 casts
  1,
  [
    "Per cast: 60/120/180 (+35% AP)",
    "3 casts = 180/360/540 (+105% AP) total",
    "Champion takedown extends duration and grants recast",
  ],
);

const Ahri = new Character(
  "Ahri",
  590, // HP
  2.5, // HP5
  21, // AR
  30, // MR
  53, // AD
  200, // Crit DMG (%)
  330, // MS
  550, // Attack range
  0.668, // Base AS
  [AhriPassive, AhriQ, AhriQReturn, AhriW, AhriE, AhriR],
  [], // Items (can be added later)
);

// Akali
const AkaliPassive = new Ability(
  "Assassin's Mark",
  "passive",
  "Damaging champions creates a ring. Exiting the ring empowers next attack",
  {
    cooldown: 0,
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 500,
  },
  {
    // 35-182 (based on level) + 60% bonus AD + 55% AP
    baseDamage: (level: number) => 35 + ((level - 1) * 147) / 17,
    bonusAdRatio: 60,
    apRatio: 55,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Empowered attack has doubled range",
    "Gain bonus MS moving away from ring",
    "Requires exiting ring to proc (modeled as on-hit for DPS)",
  ],
  true, // Empowered basic attack - overestimates but better than ignoring
);

const AkaliQ = new Ability(
  "Five Point Strike",
  "Q",
  "Unleashes kunai in a cone, dealing magic damage and slowing distant targets",
  {
    cooldown: 1.5,
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 500,
    width: 350,
  },
  {
    baseDamage: [45, 70, 95, 120, 145],
    adRatio: 65,
    apRatio: 60,
    damageType: "magic",
  },
  {
    ccType: "slow",
    ccDuration: 0.5,
    slow: 50,
  },
  undefined,
  undefined,
  ["Targets beyond 120 range are slowed"],
);

const AkaliW = new Ability(
  "Twilight Shroud",
  "W",
  "Creates smoke shroud that grants invisibility and restores energy",
  {
    cooldown: [20, 19, 18, 17, 16],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 250,
    radius: 350,
  },
  undefined,
  undefined,
  undefined,
  undefined,
  [
    "Restores 100 energy",
    "Duration: 5/5.5/6/6.5/7 seconds",
    "Grants invisibility while inside",
    "Max energy increased by 100 while active",
  ],
);

const AkaliE = new Ability(
  "Shuriken Flip",
  "E",
  "Flips backward and throws shuriken. Can recast to dash to marked target",
  {
    cooldown: [16, 14.5, 13, 11.5, 10],
    cooldownType: "standard",
  },
  {
    castTime: 0.4,
    range: 825,
    width: 120,
    speed: 1800,
  },
  {
    // First: 21-105 + 30% AD + 33% AP
    // Recast: 49-245 + 70% AD + 77% AP
    // Total: 70-350 + 100% AD + 110% AP
    baseDamage: [70, 140, 210, 280, 350],
    adRatio: 100,
    apRatio: 110,
    damageType: "magic",
  },
  undefined,
  undefined, // damage already totaled
  undefined,
  [
    "First cast: 21/42/63/84/105 (+30% AD)(+33% AP)",
    "Recast: 49/98/147/196/245 (+70% AD)(+77% AP)",
  ],
);

const AkaliR = new Ability(
  "Perfect Execution",
  "R",
  "Dashes through target dealing damage, can recast for execute damage",
  {
    cooldown: [120, 90, 60],
    staticCooldown: 2.5,
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 675,
    speed: 1500,
  },
  {
    // First cast: 110/220/330 + 50% bonus AD + 30% AP
    // Recast (avg ~100% execute bonus): 140/280/420 + 60% AP
    // Total: 250/500/750 + 50% bonus AD + 90% AP
    baseDamage: [250, 500, 750],
    bonusAdRatio: 50,
    apRatio: 90,
    damageType: "magic",
  },
  undefined,
  undefined, // damage already totaled
  undefined,
  [
    "First cast: 110/220/330 (+50% bonus AD)(+30% AP)",
    "Recast: 70/140/210 (+30% AP), +0-200% based on missing HP",
    "DPS uses avg execute (~100% bonus = 140/280/420 + 60% AP)",
  ],
);

const Akali = new Character(
  "Akali",
  600, // HP
  9, // HP5
  23, // AR
  37, // MR
  62, // AD
  200, // Crit DMG (%)
  345, // MS
  125, // Attack range (Melee)
  0.625, // Base AS
  [AkaliPassive, AkaliQ, AkaliW, AkaliE, AkaliR],
  [], // Items
);

// Akshan
const AkshanPassive = new Ability(
  "Dirty Fighting",
  "passive",
  "Double-shot basic attacks. Every 3rd hit deals bonus magic damage and grants shield",
  {
    cooldown: 0,
    staticCooldown: 16,
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 500,
  },
  {
    baseDamage: [15, 150],
    apRatio: 60,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Second shot deals 50% AD (100% to minions)",
    "Shield: 40-280 (+35% bonus AD)",
  ],
);

const AkshanQ = new Ability(
  "Avengerang",
  "Q",
  "Throws boomerang that deals damage going out and returning",
  {
    cooldown: [9, 8, 7, 6, 5],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 850,
    width: 120,
    speed: 1500,
  },
  {
    // Per pass: 45-165 + 70% bonus AD
    // Total (both passes): 90-330 + 140% bonus AD
    baseDamage: [90, 150, 210, 270, 330],
    bonusAdRatio: 140,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined, // damage already totaled
  ["Total damage (both passes): 90/150/210/270/330 (+140% bonus AD)"],
);

const AkshanW = new Ability(
  "Going Rogue",
  "W",
  "Enter camouflage and mark enemy killers as Scoundrels",
  {
    cooldown: [18, 14, 10, 6, 2],
    cooldownType: "standard",
  },
  {
    castTime: 0.5,
    range: 800,
  },
  undefined,
  undefined,
  undefined,
  undefined,
  [
    "Passive: Mark champion killers as Scoundrels",
    "Killing Scoundrels resurrects allies",
  ],
);

const AkshanE = new Ability(
  "Heroic Swing",
  "E",
  "Fires hook and swings around terrain while firing shots",
  {
    cooldown: [18, 16.5, 15, 13.5, 12],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 800,
    width: 80,
    speed: 2500,
  },
  {
    baseDamage: [8, 16, 24, 32, 40],
    adRatio: 25,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  ["Fires shots every 0.231s", "Scales with bonus AS"],
);

const AkshanR = new Ability(
  "Comeuppance",
  "R",
  "Channels to lock onto target and fire multiple bullets with execute damage",
  {
    cooldown: [100, 85, 70],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 2500,
    width: 120,
    speed: 3200,
  },
  {
    // Per bullet: 25/35/45 + 15% AD
    // Bullets: 5/6/7
    // Total: 125/210/315 + 75/90/105% AD
    // With avg execute (100% bonus): 250/420/630 + 150/180/210% AD
    baseDamage: [250, 420, 630],
    adRatio: 210,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "5/6/7 bullets, each 25/35/45 (+15% AD)",
    "Execute: 0-200% based on missing HP (using avg 100%)",
  ],
);

const Akshan = new Character(
  "Akshan",
  610, // HP
  3.75, // HP5
  26, // AR
  30, // MR
  52, // AD
  200, // Crit DMG (%)
  330, // MS
  500, // Attack range
  0.638, // Base AS
  [AkshanPassive, AkshanQ, AkshanW, AkshanE, AkshanR],
  [],
);

// Alistar
const AlistarPassive = new Ability(
  "Triumphant Roar",
  "passive",
  "Generates stacks from stuns/displacements and minion deaths. At 7 stacks, heals self and nearby allies",
  {
    cooldown: 0,
    staticCooldown: 3,
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 1000,
  },
  undefined,
  undefined,
  undefined,
  undefined,
  [
    "Self heal: 5% max HP",
    "Ally heal: 7% of Alistar's max HP",
    "Triggers at 7 stacks",
  ],
);

const AlistarQ = new Ability(
  "Pulverize",
  "Q",
  "Smashes ground, dealing damage and knocking up enemies",
  {
    cooldown: [14, 13, 12, 11, 10],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    radius: 375,
  },
  {
    baseDamage: [60, 100, 140, 180, 220],
    apRatio: 80,
    damageType: "magic",
  },
  {
    ccType: "knockup",
    ccDuration: 1,
  },
  undefined,
  undefined,
  ["Stuns and knocks up simultaneously"],
);

const AlistarW = new Ability(
  "Headbutt",
  "W",
  "Dashes to target and knocks them back",
  {
    cooldown: [14, 13, 12, 11, 10],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 650,
    speed: 1200,
  },
  {
    baseDamage: [55, 110, 165, 220, 275],
    apRatio: 100,
    damageType: "magic",
  },
  {
    ccType: "knockup",
    ccDuration: 0.75,
  },
  undefined,
  undefined,
  ["Knocks back 700 units over 0.5s", "Stuns for 0.75s"],
);

const AlistarE = new Ability(
  "Trample",
  "E",
  "Tramples ground dealing damage over time. At 5 stacks, next attack stuns",
  {
    cooldown: [12, 11.5, 11, 10.5, 10],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    radius: 350,
  },
  {
    baseDamage: [8, 11, 14, 17, 20],
    apRatio: 7,
    damageType: "magic",
  },
  {
    ccType: "stun",
    ccDuration: 1,
  },
  undefined,
  undefined,
  [
    "Damage per 0.5s over 5s duration",
    "At 5 stacks: next attack deals 20-275 bonus damage and stuns",
  ],
);

const AlistarR = new Ability(
  "Unbreakable Will",
  "R",
  "Cleanses CC and reduces incoming damage",
  {
    cooldown: [120, 100, 80],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
  },
  undefined,
  undefined,
  undefined,
  undefined,
  ["Cleanses all CC", "55/65/75% damage reduction for 7s"],
);

const Alistar = new Character(
  "Alistar",
  685, // HP
  8.5, // HP5
  40, // AR
  32, // MR
  62, // AD
  200, // Crit DMG (%)
  330, // MS
  125, // Attack range
  0.625, // Base AS
  [AlistarPassive, AlistarQ, AlistarW, AlistarE, AlistarR],
  [],
);

// Ambessa
const AmbessaPassive = new Ability(
  "Drakehound's Step",
  "passive",
  "Dash after ability lockouts. Generate stacks that empower attacks",
  {
    cooldown: 0,
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 350,
    speed: 770,
  },
  {
    baseDamage: [5, 30],
    bonusAdRatio: 25,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  ["Empowered attacks gain 75 range, 50% AS, and restore 40/55/70 energy"],
);

const AmbessaQ = new Ability(
  "Cunning Sweep",
  "Q",
  "Slash in cone dealing damage, doubled at outer edge",
  {
    cooldown: [14, 13, 12, 11, 10],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 275,
    width: 275,
  },
  {
    baseDamage: [20, 30, 40, 50, 60],
    bonusAdRatio: 30,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  ["Outer edge deals double damage", "Enables Sundering Slam for 4s"],
);

const AmbessaW = new Ability(
  "Sundering Slam",
  "W",
  "Slam in line dealing damage, doubled to first enemy hit",
  {
    cooldown: 0,
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 650,
    width: 40,
  },
  {
    baseDamage: [25, 37.5, 50, 62.5, 75],
    bonusAdRatio: 45,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  ["First enemy hit takes double damage"],
);

const AmbessaE = new Ability(
  "Repudiation",
  "E",
  "Brace for shield then smash ground for damage",
  {
    cooldown: [18, 17, 16, 15, 14],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    radius: 325,
  },
  {
    baseDamage: [50, 75, 100, 125, 150],
    bonusAdRatio: 50,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  ["Shield: 50-320 (+150% bonus AD)", "If shield absorbs damage: +50% damage"],
);

const AmbessaR = new Ability(
  "Lacerate",
  "R",
  "Spin drakehounds dealing damage and slowing",
  {
    cooldown: [13, 12, 11, 10, 9],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    radius: 325,
  },
  {
    baseDamage: [40, 60, 80, 100, 120],
    bonusAdRatio: 50,
    damageType: "physical",
  },
  {
    ccType: "slow",
    ccDuration: 1,
    slow: 99,
  },
  undefined,
  2,
  ["Spins twice if dashing", "Total: 80/120/160/200/240 (+100% bonus AD)"],
);

const AmbessaUlt = new Ability(
  "Public Execution",
  "R",
  "Blink behind and suppress target, then slam for damage",
  {
    cooldown: [130, 115, 100],
    cooldownType: "standard",
  },
  {
    castTime: 0.55,
    range: 1250,
    width: 65,
  },
  {
    baseDamage: [150, 250, 350],
    bonusAdRatio: 80,
    damageType: "physical",
  },
  {
    ccType: "stun",
    ccDuration: 0.75,
  },
  undefined,
  undefined,
  [
    "Passive: 10/20/30% armor pen",
    "Passive: Heal 10/12.5/15% (+50% lifesteal) of ability damage",
    "Stuns for 0.4s after suppress",
  ],
);

const Ambessa = new Character(
  "Ambessa",
  630, // HP
  8.5, // HP5
  35, // AR
  32, // MR
  63, // AD
  200, // Crit DMG (%)
  335, // MS
  125, // Attack range
  0.625, // Base AS
  [AmbessaPassive, AmbessaQ, AmbessaW, AmbessaE, AmbessaR, AmbessaUlt],
  [],
);

// Aurora - The Witch Between Worlds
const AuroraPassive = new Ability(
  "Spirit Abjuration",
  "passive",
  "3rd hit deals %max HP damage and spawns Spirit that heals",
  { cooldown: 0, cooldownType: "standard" },
  { castTime: 0, range: 0 },
  {
    baseDamage: [0],
    maxHealthRatio: 1, // 1% max HP base
    maxHealthRatioPerAP: 2.7, // +2.7% max HP per 100 AP
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "3 stacks: 1% (+2.7% per 100 AP) max HP magic damage",
    "Spirit heals 3-20 (+2% AP)/sec",
    "Max 4 Spirits",
  ],
  true,
);

const AuroraQ = new Ability(
  "Twofold Hex",
  "Q",
  "Fire bolt that marks, then recall bolts dealing damage based on missing HP",
  {
    cooldown: [9, 8.5, 8, 7.5, 7],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 900,
    width: 210,
  },
  {
    baseDamage: [45, 70, 95, 120, 145],
    apRatio: 40,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Auto-recast after 3.5s",
    "Return bolts: +0-50% based on missing HP",
    "Multi-bolt: 20% dmg",
  ],
);

const AuroraW = new Ability(
  "Across the Veil",
  "W",
  "Dash then become invisible and gain movement speed",
  {
    cooldown: [22, 21, 20, 19, 18],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 300,
  },
  undefined,
  undefined,
  undefined,
  undefined,
  ["Invis: 1-1.6s", "MS: 20-40% for 4s", "Takedown resets cooldown"],
);

const AuroraE = new Ability(
  "The Weirding",
  "E",
  "Blast in line dealing damage and slowing, recoil backwards",
  {
    cooldown: [15, 14, 13, 12, 11],
    cooldownType: "standard",
  },
  {
    castTime: 0.35,
    range: 825,
    width: 175,
  },
  {
    baseDamage: [70, 110, 150, 190, 230],
    apRatio: 70,
    damageType: "magic",
  },
  {
    ccType: "slow",
    ccDuration: 1,
    slow: 80,
  },
  undefined,
  undefined,
  ["Recoil 250 units backwards", "80% slow decaying after 0.15s"],
);

const AuroraR = new Ability(
  "Between Worlds",
  "R",
  "Leap and create spirit rift dealing damage and slowing",
  {
    cooldown: [140, 120, 100],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 450,
    radius: 700,
  },
  {
    baseDamage: [175, 275, 375],
    apRatio: 70,
    damageType: "magic",
  },
  {
    ccType: "slow",
    ccDuration: 2,
    slow: 30,
  },
  undefined,
  undefined,
  ["Rift lasts 1.75-3.25s", "Borders slow enemies 50%", "Can dash across rift"],
);

const Aurora = new Character(
  "Aurora",
  607, // HP
  6, // HP5
  23, // AR
  32, // MR
  53, // AD
  200, // Crit DMG (%)
  335, // MS
  550, // Attack range
  0.668, // Base AS
  [AuroraPassive, AuroraQ, AuroraW, AuroraE, AuroraR],
  [],
);

// Azir - The Emperor of the Sands
const AzirPassive = new Ability(
  "Shurima's Legacy",
  "passive",
  "Can rebuild destroyed turrets as Sun Discs",
  { cooldown: 90, cooldownType: "static" },
  { castTime: 0.5, range: 700 },
  {
    baseDamage: [0],
    apRatio: 40, // Sun Disc gains 40% AP as bonus damage
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  ["Sun Disc decays over 45s", "Loses armor/MR when Azir away"],
);

const AzirQ = new Ability(
  "Conquering Sands",
  "Q",
  "Send soldiers dashing forward, dealing damage and slowing",
  {
    cooldown: [14, 12, 10, 8, 6],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 740,
    radius: 150,
  },
  {
    baseDamage: [60, 80, 100, 120, 140],
    apRatio: 35,
    damageType: "magic",
  },
  {
    ccType: "slow",
    ccDuration: 1,
    slow: 25,
  },
  undefined,
  undefined,
  ["Additional soldiers: +25% slow each", "Requires Sand Soldier"],
);

const AzirW = new Ability(
  "Arise!",
  "W",
  "Summon Sand Soldier that attacks for Azir",
  {
    cooldown: 1.5,
    cooldownType: "ammo",
  },
  {
    castTime: 0.25,
    range: 525,
  },
  {
    baseDamage: [50, 65, 80, 95, 110],
    apRatio: 62.5, // Max rank: 62.5% AP
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Recharge: 12-6s",
    "Soldiers last 10s",
    "Multi-soldier: 25% damage",
    "50% on-hit effectiveness",
  ],
);

const AzirE = new Ability(
  "Shifting Sands",
  "E",
  "Shield self and dash to soldier, dealing damage",
  {
    cooldown: [22, 20.5, 19, 17.5, 16],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 1100,
  },
  {
    baseDamage: [70, 110, 150, 190, 230],
    apRatio: 60,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  ["Shield: 70-230 (+60% AP)", "Hit champion: Refund W charge"],
);

const AzirR = new Ability(
  "Emperor's Divide",
  "R",
  "Summon wall of soldiers that knock back and block enemies",
  {
    cooldown: [120, 105, 90],
    cooldownType: "standard",
  },
  {
    castTime: 0.5,
    range: 400,
    width: 650,
  },
  {
    baseDamage: [200, 400, 600],
    apRatio: 75,
    damageType: "magic",
  },
  {
    ccType: "knockup",
    ccDuration: 1,
  },
  undefined,
  undefined,
  ["Wall lasts 5s", "Impassible terrain for enemies", "6/7/8 soldiers wide"],
);

const Azir = new Character(
  "Azir",
  575, // HP
  7, // HP5
  25, // AR
  30, // MR
  56, // AD
  200, // Crit DMG (%)
  330, // MS
  525, // Attack range
  0.625, // Base AS
  [AzirPassive, AzirQ, AzirW, AzirE, AzirR],
  [],
);

// Bard - The Wandering Caretaker
const BardPassive = new Ability(
  "Traveler's Call",
  "passive",
  "Collect Chimes for mana, XP, MS. Meeps empower basic attacks",
  { cooldown: 0, cooldownType: "standard" },
  { castTime: 0, range: 500 },
  {
    // At ~25 Chimes: 35 base + 50 (5×10 bonus) = 85 + 40% AP
    baseDamage: [85],
    apRatio: 40,
    damageType: "magic",
  },
  {
    ccType: "slow",
    ccDuration: 1,
    slow: 50, // 25-75% based on Chimes, using mid value
  },
  undefined,
  undefined,
  [
    "Chimes: +12% max mana, +XP, +24% MS out of combat",
    "Meeps: AOE at 15 Chimes",
    "Max 1-9 Meeps",
    "Damage modeled at ~25 Chimes",
  ],
  true, // Meeps apply on basic attacks
);

const BardQ = new Ability(
  "Cosmic Binding",
  "Q",
  "Fire bolt that slows first target, stuns if hits second target or wall",
  {
    cooldown: [11, 10, 9, 8, 7],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 850,
    width: 120,
  },
  {
    baseDamage: [80, 120, 160, 200, 240],
    apRatio: 80,
    damageType: "magic",
  },
  {
    ccType: "stun",
    ccDuration: 1.8, // Max rank duration
    slow: 60,
  },
  undefined,
  undefined,
  ["Slow: 60% if only one target", "Stun: 1-1.8s if binds two targets or wall"],
);

const BardW = new Ability(
  "Caretaker's Shrine",
  "W",
  "Place healing shrine that heals allies and grants movement speed",
  {
    cooldown: 18,
    cooldownType: "ammo",
  },
  {
    castTime: 0.25,
    range: 800,
  },
  undefined,
  undefined,
  undefined,
  undefined,
  [
    "Heal: 25-125 (+40% AP)",
    "MS: 20-30% (+6% per 100 AP)",
    "Max 3 shrines, 2 charges",
  ],
);

const BardE = new Ability(
  "Magical Journey",
  "E",
  "Create portal through terrain for allies and enemies",
  {
    cooldown: [22, 20.5, 19, 17.5, 16],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 900,
  },
  undefined,
  undefined,
  undefined,
  undefined,
  [
    "Portal lasts 10s",
    "Bard/allies travel 33% faster",
    "Grants vision during travel",
  ],
);

const BardR = new Ability(
  "Tempered Fate",
  "R",
  "Put all units in area into stasis for 2.5s",
  {
    cooldown: [110, 95, 80],
    cooldownType: "standard",
  },
  {
    castTime: 0.5,
    range: 3400,
    radius: 350,
  },
  undefined,
  {
    ccType: "stun",
    ccDuration: 2.5,
  },
  undefined,
  undefined,
  [
    "Affects allies, enemies, turrets, monsters",
    "Stasis: untargetable, invulnerable",
  ],
);

const Bard = new Character(
  "Bard",
  630, // HP
  5.5, // HP5
  34, // AR
  30, // MR
  52, // AD
  200, // Crit DMG (%)
  335, // MS
  500, // Attack range
  0.658, // Base AS
  [BardPassive, BardQ, BardW, BardE, BardR],
  [],
);

// Bel'Veth - The Empress of the Void
const BelVethPassive = new Ability(
  "Death in Lavender",
  "passive",
  "Attack 36% faster, reduced damage. Abilities grant AS stacks. Takedowns grant permanent AS",
  { cooldown: 0, cooldownType: "standard" },
  { castTime: 0, range: 150 },
  undefined,
  undefined,
  undefined,
  undefined,
  [
    "Attacks deal 75% damage",
    "Abilities: 2 stacks (20-40% bonus AS)",
    "Takedowns: 0.28-1.1% bonus AS per stack",
    "No AS per level",
  ],
);

const BelVethQ = new Ability(
  "Void Surge",
  "Q",
  "Dash in cardinal direction, dealing damage and applying on-hit",
  {
    cooldown: [16, 15, 14, 13, 12],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 400,
  },
  {
    baseDamage: [0, 5, 10, 15, 20],
    adRatio: 100,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Per-direction CD: 16-12s",
    "Can crit on first target",
    "Applies on-hit (75%)",
    "Resets AA timer",
  ],
);

const BelVethW = new Ability(
  "Above and Below",
  "W",
  "Slam tail dealing damage, knocking up and slowing",
  {
    cooldown: [12, 11, 10, 9, 8],
    cooldownType: "standard",
  },
  {
    castTime: 0.5,
    range: 660,
    width: 200,
  },
  {
    baseDamage: [70, 110, 150, 190, 230],
    bonusAdRatio: 100,
    apRatio: 125,
    damageType: "magic",
  },
  {
    ccType: "knockup",
    ccDuration: 0.75,
    slow: 50,
  },
  undefined,
  undefined,
  ["Slow: 1.25-2.25s", "Hit champion: Reset Q cooldown for that direction"],
);

const BelVethE = new Ability(
  "Royal Maelstrom",
  "E",
  "Channel rapid slashes with damage reduction and lifesteal",
  {
    cooldown: [20, 19, 18, 17, 16],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    radius: 500,
  },
  {
    baseDamage: [6, 7, 8, 9, 10],
    adRatio: 8,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Duration: 1.5s",
    "Slashes: 6+ (1 per 33.3% bonus AS)",
    "Damage reduction: 35-55%",
    "Lifesteal: 20% (+100% lifesteal)",
    "Damage: +0-300% based on missing HP",
  ],
);

const BelVethR = new Ability(
  "Endless Banquet",
  "R",
  "Every 2nd hit deals true damage. Transform at Void Corals",
  {
    cooldown: 1,
    cooldownType: "standard",
  },
  {
    castTime: 1,
    range: 450,
    radius: 500,
  },
  {
    baseDamage: [6, 8, 10],
    bonusAdRatio: 12,
    damageType: "true",
  },
  undefined,
  undefined,
  undefined,
  [
    "Passive: Every 2nd hit on marked target",
    "Stacks infinitely (max 5 vs epic monsters)",
    "Active: Consume Void Coral for True Form",
    "True Form: 60s/180s, +100-200 HP, +10-80 MS, +75 range, +10-20% AS",
  ],
);

const BelVeth = new Character(
  "Bel'Veth",
  610, // HP
  6, // HP5
  32, // AR
  32, // MR
  60, // AD
  200, // Crit DMG (%)
  340, // MS
  150, // Attack range
  0.85, // Base AS
  [BelVethPassive, BelVethQ, BelVethW, BelVethE, BelVethR],
  [],
);

// Blitzcrank - The Great Steam Golem
const BlitzcrankPassive = new Ability(
  "Mana Barrier",
  "passive",
  "When damaged to 30% HP, gain shield equal to 35% max mana",
  { cooldown: 90, cooldownType: "static" },
  { castTime: 0, range: 0 },
  undefined,
  undefined,
  undefined,
  undefined,
  ["Shield: 35% max mana", "Duration: 10s", "90s CD"],
);

const BlitzcrankQ = new Ability(
  "Rocket Grab",
  "Q",
  "Fire hook that pulls first enemy hit, dealing damage and stunning",
  {
    cooldown: [20, 19, 18, 17, 16],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 1115,
    width: 140,
  },
  {
    baseDamage: [110, 160, 210, 260, 310],
    apRatio: 120,
    damageType: "magic",
  },
  {
    ccType: "stun",
    ccDuration: 0.65,
  },
  undefined,
  undefined,
  ["Pulls enemy to Blitzcrank", "Cannot move/attack during flight"],
);

const BlitzcrankW = new Ability(
  "Overdrive",
  "W",
  "Gain bonus AS and decaying MS, slowed when effect ends",
  {
    cooldown: 15,
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 0,
  },
  undefined,
  undefined,
  undefined,
  undefined,
  [
    "AS: 30-70%",
    "MS: 60-80% decaying to 10%",
    "Duration: 5s",
    "Slow after: 30% for 1.5s",
  ],
);

const BlitzcrankE = new Ability(
  "Power Fist",
  "E",
  "Empower next basic attack to knock up and deal bonus damage",
  {
    cooldown: [7, 6.5, 6, 5.5, 5],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 125,
  },
  {
    baseDamage: [0],
    adRatio: 100,
    apRatio: 25,
    damageType: "physical",
  },
  {
    ccType: "knockup",
    ccDuration: 1,
  },
  undefined,
  undefined,
  [
    "100% AD (+25% AP) bonus physical damage",
    "Can crit",
    "Resets AA timer",
    "Lasts 5s",
  ],
);

const BlitzcrankR = new Ability(
  "Static Field",
  "R",
  "Passive: Lightning on-hit. Active: AOE damage and silence, destroys shields",
  {
    cooldown: [60, 40, 20],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    radius: 600,
  },
  {
    baseDamage: [275, 400, 525],
    apRatio: 100,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Passive: 50-150 (+30-50% AP)(+2% max mana) per second",
    "Active: Destroys shields then damages/silences",
  ],
);

const Blitzcrank = new Character(
  "Blitzcrank",
  600, // HP
  7.5, // HP5
  37, // AR
  32, // MR
  62, // AD
  200, // Crit DMG (%)
  325, // MS
  125, // Attack range
  0.625, // Base AS
  [BlitzcrankPassive, BlitzcrankQ, BlitzcrankW, BlitzcrankE, BlitzcrankR],
  [],
);

// Brand - The Burning Vengeance
const BrandPassive = new Ability(
  "Blaze",
  "passive",
  "Abilities apply Ablaze stacks. 3 stacks explode for % max HP damage",
  { cooldown: 0, cooldownType: "standard" },
  { castTime: 0, range: 0, radius: 475 },
  {
    // 3 stacks explosion: 8-12% (+2% per 100 AP) max HP
    baseDamage: [0],
    maxHealthRatio: 10, // 8-12% based on level, using avg 10%
    maxHealthRatioPerAP: 2, // +2% max HP per 100 AP
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Ablaze: 2% max HP over 4s per stack",
    "3 stacks: 8-12% (+2% per 100 AP) max HP explosion",
    "Kills refund 20-40 mana",
  ],
);

const BrandQ = new Ability(
  "Sear",
  "Q",
  "Launch fireball dealing damage. Stuns if target has Ablaze",
  {
    cooldown: [8, 7.5, 7, 6.5, 6],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 1100,
    width: 120,
  },
  {
    baseDamage: [70, 100, 130, 160, 190],
    apRatio: 65,
    damageType: "magic",
  },
  {
    ccType: "stun",
    ccDuration: 1.75,
  },
  undefined,
  undefined,
  ["Stuns for 1.75s if target has Ablaze"],
);

const BrandW = new Ability(
  "Pillar of Flame",
  "W",
  "Delayed AOE dealing damage. 25% bonus damage if target has Ablaze",
  {
    cooldown: [10, 9.5, 9, 8.5, 8],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 900,
    radius: 260,
  },
  {
    baseDamage: [75, 120, 165, 210, 255],
    apRatio: 70,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Delay: 0.627s",
    "Ablaze bonus: 25% increased damage (93.75-318.75 + 87.5% AP)",
  ],
);

const BrandE = new Ability(
  "Conflagration",
  "E",
  "Set target aflame, spreading to nearby enemies. Doubled range if Ablaze",
  {
    cooldown: [13, 12, 11, 10, 9],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 675,
    radius: 300,
  },
  {
    baseDamage: [55, 80, 105, 130, 155],
    apRatio: 60,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Spreads from target to nearby enemies",
    "Ablaze: Spread range doubled to 600",
  ],
);

const BrandR = new Ability(
  "Pyroclasm",
  "R",
  "Fireball bounces between enemies up to 4 times. Slows if Ablaze",
  {
    cooldown: [100, 90, 80],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 750,
    radius: 600,
  },
  {
    baseDamage: [100, 175, 250],
    apRatio: 30,
    damageType: "magic",
  },
  {
    ccType: "slow",
    ccDuration: 0.25,
    slow: [30, 45, 60],
  },
  undefined,
  undefined,
  [
    "Bounces 4 times",
    "Prioritizes Ablaze champions",
    "Ablaze: Slows 30-60% per bounce",
  ],
);

const Brand = new Character(
  "Brand",
  570, // HP
  5.5, // HP5
  27, // AR
  30, // MR
  57, // AD
  200, // Crit DMG (%)
  340, // MS
  550, // Attack range
  0.681, // Base AS
  [BrandPassive, BrandQ, BrandW, BrandE, BrandR],
  [],
);

// Braum
const BraumPassive = new Ability(
  "Concussive Blows",
  "passive",
  "Basic attacks apply stacks; at 4 stacks, target is stunned and takes magic damage.",
  { cooldown: 0, cooldownType: "standard" },
  { castTime: 0, range: 125 },
  {
    baseDamage: [70, 240],
    maxHealthRatio: 4,
    damageType: "magic",
  },
  {
    ccType: "stun",
    ccDuration: 1.5,
  },
  undefined,
  undefined,
  ["4 stacks from Braum or allies", "Stun: 1.25-1.5s"],
  true,
);

const BraumQ = new Ability(
  "Winter's Bite",
  "Q",
  "Throws shield, slowing and dealing magic damage. Stuns if target has Concussive Blows.",
  { cooldown: [10, 9, 8, 7, 6], cooldownType: "standard" },
  { castTime: 0.25, range: 1000 },
  {
    baseDamage: [75, 125, 175, 225, 275],
    apRatio: 25,
    damageType: "magic",
  },
  {
    ccType: "slow",
    ccDuration: 2,
    slow: 70,
  },
);

const BraumW = new Ability(
  "Stand Behind Me!",
  "W",
  "Dashes to ally and grants both a shield.",
  { cooldown: [12, 11, 10, 9, 8], cooldownType: "standard" },
  { castTime: 0, range: 650 },
  undefined,
  { shield: [40, 70, 100, 130, 160] },
);

const BraumE = new Ability(
  "Unbreakable",
  "E",
  "Raises shield, blocking projectiles and reducing damage from that direction.",
  { cooldown: [14, 13, 12, 11, 10], cooldownType: "standard" },
  { castTime: 0, range: 250 },
  undefined,
  { duration: 4 },
  undefined,
  undefined,
  ["Damage reduction: 30-40%", "Blocks first projectile completely"],
);

const BraumR = new Ability(
  "Glacial Fissure",
  "R",
  "Slams ground, knocking up enemies and leaving a slowing zone.",
  { cooldown: [130, 105, 80], cooldownType: "standard" },
  { castTime: 0.5, range: 1250, width: 200 },
  {
    baseDamage: [150, 250, 350],
    apRatio: 60,
    damageType: "magic",
  },
  {
    ccType: "knockup",
    ccDuration: 1,
    slow: 60,
    duration: 4,
  },
);

const Braum = new Character(
  "Braum",
  610, // HP
  8.5, // HP5
  35, // AR
  32, // MR
  55, // AD
  200, // Crit DMG (%)
  335, // MS
  125, // Attack range
  0.644, // Base AS
  [BraumPassive, BraumQ, BraumW, BraumE, BraumR],
  [],
);

// Briar - The Restrained Hunger
const BriarPassive = new Ability(
  "Crimson Curse",
  "passive",
  "Attacks/abilities inflict bleed. Heal from bleed damage. No base HP regen",
  { cooldown: 0, cooldownType: "standard" },
  { castTime: 0, range: 125 },
  {
    baseDamage: [30], // Mid-level average (10-50)
    bonusAdRatio: 50,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Bleed: 10-50 (+50% bonus AD) over 5s",
    "Stacks up to 5x (25% damage after 1st)",
    "Heal: 25% of bleed damage",
    "0 base HP regen",
    "Healing: +0-40% based on missing HP",
  ],
);

const BriarQ = new Ability(
  "Head Rush",
  "Q",
  "Leap to target, dealing damage and reducing resistances",
  {
    cooldown: [13, 12, 11, 10, 9],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 475,
  },
  {
    baseDamage: [60, 85, 110, 135, 160],
    bonusAdRatio: 80,
    apRatio: 60,
    damageType: "physical",
  },
  {
    ccType: "stun",
    ccDuration: 0.85,
  },
  undefined,
  undefined,
  [
    "Cost: 6% current HP",
    "Reduces armor/MR by 10-20%",
    "Applies on-hit",
    "Resets AA timer",
  ],
);

const BriarW = new Ability(
  "Blood Frenzy",
  "W",
  "Dash and enter frenzy, forced to attack nearest enemy with bonus AS/MS",
  {
    cooldown: [14, 13, 12, 11, 10],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 650,
  },
  {
    baseDamage: [0],
    adRatio: 80, // 60-100% AD AOE damage around target
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 6% current HP",
    "Bonus AS: 55-95%",
    "Bonus MS: 24-60%",
    "AOE: 60-100% AD",
    "Duration: 5s",
    "Can cast Snack Attack during frenzy",
  ],
);

const BriarE = new Ability(
  "Chilling Scream",
  "E",
  "Channel scream dealing damage and slowing. Full charge knocks back",
  {
    cooldown: 16,
    cooldownType: "standard",
  },
  {
    castTime: 0.15,
    range: 600,
    width: 380,
  },
  {
    baseDamage: [80, 115, 150, 185, 220],
    bonusAdRatio: 100,
    apRatio: 100,
    damageType: "magic",
  },
  {
    ccType: "slow",
    ccDuration: 0.5,
    slow: 80,
  },
  undefined,
  undefined,
  [
    "Cost: 6% current HP",
    "Channel up to 1s",
    "Heal: 2.5-4% max HP per 0.25s",
    "35% damage reduction while channeling",
    "Full charge: Knockback + stun 1.5s if hit wall (220-660 + 340% bonus AD + 340% AP)",
  ],
);

const BriarR = new Ability(
  "Certain Death",
  "R",
  "Kick hemolith marking champion, then dash to them for Hematomania",
  {
    cooldown: [120, 100, 80],
    cooldownType: "standard",
  },
  {
    castTime: 1,
    range: 12000,
    radius: 1500,
  },
  {
    baseDamage: [150, 250, 350],
    apRatio: 130,
    damageType: "magic",
  },
  {
    ccType: "fear",
    ccDuration: 1.5,
    slow: 35,
  },
  undefined,
  undefined,
  [
    "Cost: 6% current HP",
    "Marks first champion hit",
    "Dash to marked target",
    "Hematomania: Blood Frenzy + 20% AD as armor/MR + 10-20% lifesteal + 10-30% extra MS",
    "Lasts until mark dispelled",
  ],
);

const Briar = new Character(
  "Briar",
  625, // HP
  0, // HP5 (no base regen)
  30, // AR
  32, // MR
  60, // AD
  200, // Crit DMG (%)
  340, // MS
  125, // Attack range
  0.644, // Base AS
  [BriarPassive, BriarQ, BriarW, BriarE, BriarR],
  [],
);

// Caitlyn - The Sheriff of Piltover
const CaitlynPassive = new Ability(
  "Headshot",
  "passive",
  "Every 5 attacks (4 in brush) empower next attack for bonus damage",
  { cooldown: 0, cooldownType: "standard" },
  { castTime: 0, range: 650 },
  {
    baseDamage: [0],
    adRatio: 100, // 60-100% based on level, 110% vs non-champions
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Bonus: 60-100% AD (+0-100% based on crit)",
    "110% AD vs non-champions",
    "Trap/Net: Grant extra Headshot at 1300 range",
    "Stacks: 2x in brush",
  ],
  true, // appliesOnHit
);

const CaitlynQ = new Ability(
  "Piltover Peacemaker",
  "Q",
  "Fire piercing shot dealing damage, reduced after first target",
  {
    cooldown: [10, 9, 8, 7, 6],
    cooldownType: "standard",
  },
  {
    castTime: 0.625,
    range: 1300,
    width: 120,
  },
  {
    baseDamage: [50, 90, 130, 170, 210],
    adRatio: 205,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  ["60% damage after first target", "Trapped targets: Always take full damage"],
);

const CaitlynW = new Ability(
  "Yordle Snap Trap",
  "W",
  "Place trap that roots and reveals enemies",
  {
    cooldown: 0.5,
    cooldownType: "ammo",
  },
  {
    castTime: 0.25,
    range: 800,
  },
  undefined,
  {
    ccType: "root",
    ccDuration: 1.5,
  },
  undefined,
  undefined,
  [
    "Recharge: 26-10s",
    "Max traps: 3-5",
    "Duration: 30-50s",
    "Grants Headshot dealing +35-215 (+30% bonus AD)",
    "Reveals for 3s",
  ],
);

const CaitlynE = new Ability(
  "90 Caliber Net",
  "E",
  "Fire net dealing damage and slowing, recoil backwards",
  {
    cooldown: [16, 14, 12, 10, 8],
    cooldownType: "standard",
  },
  {
    castTime: 0.15,
    range: 800,
    radius: 140,
  },
  {
    baseDamage: [80, 130, 180, 230, 280],
    apRatio: 80,
    damageType: "magic",
  },
  {
    ccType: "slow",
    ccDuration: 1,
    slow: 50,
  },
  undefined,
  undefined,
  [
    "Recoil 390 units backwards",
    "Grants Headshot on hit",
    "Can cast abilities during dash",
  ],
);

const CaitlynR = new Ability(
  "Ace in the Hole",
  "R",
  "Channel 1s then fire homing bullet for massive damage",
  {
    cooldown: 90,
    cooldownType: "standard",
  },
  {
    castTime: 0.375,
    range: 3500,
  },
  {
    baseDamage: [300, 475, 650],
    bonusAdRatio: 100,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Channel: 1s (reveals both)",
    "Damage: +0-30% based on crit",
    "Hits first champion",
    "5s CD if canceled",
  ],
);

const Caitlyn = new Character(
  "Caitlyn",
  580, // HP
  3.5, // HP5
  27, // AR
  30, // MR
  62, // AD
  200, // Crit DMG (%)
  325, // MS
  650, // Attack range
  0.681, // Base AS
  [CaitlynPassive, CaitlynQ, CaitlynW, CaitlynE, CaitlynR],
  [],
);

// Camille - The Steel Shadow
const CamillePassive = new Ability(
  "Adaptive Defenses",
  "passive",
  "Basic attack vs champion grants shield for physical or magic damage",
  { cooldown: [18, 14, 10], cooldownType: "static" },
  { castTime: 0, range: 125 },
  undefined,
  undefined,
  undefined,
  undefined,
  [
    "Shield: 20% max HP",
    "Duration: 2s",
    "Adapts to enemy's primary damage type",
    "CD: 18/14/10 (based on level)",
  ],
);

const CamilleQ = new Ability(
  "Precision Protocol",
  "Q",
  "Empower next 2 attacks for bonus damage. 2nd deals true damage if delayed",
  {
    cooldown: [9, 8, 7, 6, 5],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 175,
  },
  {
    baseDamage: [0],
    adRatio: 40, // 20-40% first cast, 40-80% second cast
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "1st: 20-40% AD bonus physical",
    "2nd: 40-80% AD (40-100% as true damage if delayed 1.5s)",
    "+50 range",
    "MS: 25-45% for 1s",
    "Resets AA timer",
  ],
);

const CamilleW = new Ability(
  "Tactical Sweep",
  "W",
  "Sweep dealing damage. Outer cone deals % max HP, heals, and slows",
  {
    cooldown: [15, 14, 13, 12, 11],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 650,
    radius: 325,
  },
  {
    baseDamage: [60, 85, 110, 135, 160],
    bonusAdRatio: 60,
    maxHealthRatio: [6, 6.5, 7, 7.5, 8],
    maxHealthRatioPerBonusAD: 2.5, // +2.5% max HP per 100 bonus AD
    damageType: "physical",
  },
  {
    ccType: "slow",
    ccDuration: 2,
    slow: 80,
  },
  undefined,
  undefined,
  [
    "Outer cone: 6/6.5/7/7.5/8% (+2.5% per 100 bonus AD) max HP",
    "Heal: 100% of outer damage vs champions",
    "Cast time: 1.1s",
    "Ghosted during cast",
  ],
);

const CamilleE = new Ability(
  "Hookshot / Wall Dive",
  "E",
  "Grapple to wall then dive dealing damage and stunning",
  {
    cooldown: [16, 15, 14, 13, 12],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 800,
  },
  {
    baseDamage: [60, 90, 120, 150, 180],
    bonusAdRatio: 75,
    damageType: "physical",
  },
  {
    ccType: "stun",
    ccDuration: 0.75,
  },
  undefined,
  undefined,
  [
    "Grapple to terrain",
    "Dive: 400 range (800 toward champions)",
    "Stun on champion collision",
    "Bonus AS: 40-60% for 5s",
    "Knockback nearby enemies",
  ],
);

const CamilleR = new Ability(
  "The Hextech Ultimatum",
  "R",
  "Leap to champion creating zone that traps them",
  {
    cooldown: [140, 115, 90],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 475,
    radius: 425,
  },
  {
    baseDamage: [0],
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Duration: 2.5-4s",
    "Target cannot escape",
    "Knockback other enemies",
    "Bonus damage: 4-8% current HP per attack vs target",
    "Untargetable during leap",
  ],
);

const Camille = new Character(
  "Camille",
  650, // HP
  8.5, // HP5
  35, // AR
  32, // MR
  68, // AD
  200, // Crit DMG (%)
  340, // MS
  125, // Attack range
  0.644, // Base AS
  [CamillePassive, CamilleQ, CamilleW, CamilleE, CamilleR],
  [],
);

// Cassiopeia - The Serpent's Embrace
const CassiopeiaPassive = new Ability(
  "Serpentine Grace",
  "passive",
  "Increase effectiveness of all MS bonuses. Cannot buy boots",
  { cooldown: 0, cooldownType: "standard" },
  { castTime: 0, range: 0 },
  undefined,
  undefined,
  undefined,
  undefined,
  ["MS bonus effectiveness: 6-40% (based on level)", "Cannot purchase boots"],
);

const CassiopeiaQ = new Ability(
  "Noxious Blast",
  "Q",
  "Delayed AOE poison dealing damage over time. Grants MS if hits champion",
  {
    cooldown: 3.5,
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 850,
    radius: 200,
  },
  {
    baseDamage: [75, 110, 145, 180, 215],
    apRatio: 65,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Delay: 0.4s",
    "Poison duration: 3s",
    "Hit champion: 30-50% MS decaying over 3s",
  ],
);

const CassiopeiaW = new Ability(
  "Miasma",
  "W",
  "Create toxic cloud that grounds, slows, and poisons",
  {
    cooldown: [24, 22, 20, 18, 16],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 700,
    radius: 200,
  },
  {
    baseDamage: [100, 125, 150, 175, 200], // 20-40 per second * 5s
    apRatio: 50, // 10% AP per second * 5s
    damageType: "magic",
  },
  {
    ccType: "slow",
    ccDuration: 5,
    slow: [40, 50, 60, 70, 80],
  },
  undefined,
  undefined,
  [
    "Duration: 5s",
    "Grounds enemies (no dashes)",
    "Damage: 20-40 (+10% AP) per second",
  ],
);

const CassiopeiaE = new Ability(
  "Twin Fang",
  "E",
  "Launch fangs dealing damage. Bonus damage and heal vs poisoned",
  {
    cooldown: 0.75,
    cooldownType: "standard",
  },
  {
    castTime: 0.125,
    range: 700,
  },
  {
    baseDamage: [86], // 52-120 base (using lvl 10 avg) + 20 bonus base
    apRatio: 65, // 10% base + 55% vs poisoned
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Base: 52-120 (+10% AP)",
    "Poisoned: +20-112 (+55% AP)",
    "Heal: 10-16% AP (25% vs small targets)",
    "Refunds mana on kill",
  ],
);

const CassiopeiaR = new Ability(
  "Petrifying Gaze",
  "R",
  "Cone dealing damage and slowing. Stuns if facing",
  {
    cooldown: [120, 100, 80],
    cooldownType: "standard",
  },
  {
    castTime: 0.5,
    range: 850,
    radius: 850,
  },
  {
    baseDamage: [150, 250, 350],
    apRatio: 50,
    damageType: "magic",
  },
  {
    ccType: "stun",
    ccDuration: 2,
    slow: 40,
  },
  undefined,
  undefined,
  [
    "Cone: 80° angle",
    "Slow: 40% for 2s if not facing",
    "Stun: 2s if facing Cassiopeia",
  ],
);

const Cassiopeia = new Character(
  "Cassiopeia",
  630, // HP
  5.5, // HP5
  18, // AR
  32, // MR
  53, // AD
  200, // Crit DMG (%)
  335, // MS
  550, // Attack range
  0.647, // Base AS
  [CassiopeiaPassive, CassiopeiaQ, CassiopeiaW, CassiopeiaE, CassiopeiaR],
  [],
);

// Amumu - The Sad Mummy
const AmumuPassive = new Ability(
  "Cursed Touch",
  "passive",
  "Basic attacks curse enemies, causing them to take increased true damage from magic damage",
  { cooldown: 0, cooldownType: "standard" },
  { castTime: 0, range: 125 },
  undefined,
  undefined,
  undefined,
  undefined,
  ["Cursed enemies take 10% bonus true damage from magic damage"],
);

const AmumuQ = new Ability(
  "Bandage Toss",
  "Q",
  "Throws bandage, stunning and pulling to first enemy hit",
  { cooldown: [14, 12.5, 11, 9.5, 8], cooldownType: "standard" },
  { castTime: 0.25, range: 1050, width: 80 },
  { baseDamage: [80, 130, 180, 230, 280], apRatio: 100, damageType: "magic" },
  { ccType: "stun", ccDuration: 1 },
  undefined,
  undefined,
  ["Pulls Amumu to target", "Reduces cooldown by 75% if used again within 3s"],
);

const AmumuW = new Ability(
  "Despair",
  "W",
  "Toggle: Drains mana to deal damage per second to nearby enemies",
  { cooldown: 0, cooldownType: "standard" },
  { castTime: 0, radius: 300 },
  {
    // Base: 8-20 + 10% AP per second
    // Bonus: 1% max HP per 100 AP per second
    baseDamage: [8, 11, 14, 17, 20],
    apRatio: 10,
    maxHealthRatioPerAP: 1, // 1% max HP per 100 AP per second
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Costs 8 mana per second",
    "Damage per second values",
    "Deals bonus 1% max HP per 100 AP per second",
  ],
);

const AmumuE = new Ability(
  "Tantrum",
  "E",
  "Passive reduces physical damage taken. Active damages nearby enemies",
  { cooldown: [8, 7.5, 7, 6.5, 6], cooldownType: "standard" },
  { castTime: 0, radius: 350 },
  { baseDamage: [75, 100, 125, 150, 175], apRatio: 70, damageType: "magic" },
  undefined,
  undefined,
  undefined,
  [
    "Passive: Reduces physical damage by 2/4/6/8/10",
    "Cooldown reduced by 0.5s per basic attack received",
  ],
);

const AmumuR = new Ability(
  "Curse of the Sad Mummy",
  "R",
  "Entangles enemies, stunning and dealing damage",
  { cooldown: [130, 110, 90], cooldownType: "standard" },
  { castTime: 0.25, radius: 550 },
  { baseDamage: [125, 225, 325], apRatio: 100, damageType: "magic" },
  { ccType: "stun", ccDuration: 2 },
  undefined,
  undefined,
  ["Also roots enemies for 2s (cannot move but can attack)"],
);

const Amumu = new Character(
  "Amumu",
  685, // HP
  9, // HP5
  33, // AR
  32, // MR
  57, // AD
  200, // Crit DMG (%)
  335, // MS
  125, // Attack range
  0.736, // Base AS
  [AmumuPassive, AmumuQ, AmumuW, AmumuE, AmumuR],
  [],
);

// Anivia - The Cryophoenix
const AniviaPassive = new Ability(
  "Rebirth",
  "passive",
  "Upon dying, becomes an egg and revives if it survives 6 seconds",
  { cooldown: 0, staticCooldown: 240, cooldownType: "standard" },
  { castTime: 0, range: 0 },
  undefined,
  undefined,
  undefined,
  undefined,
  ["Egg has 25% max HP + AP", "120s cooldown"],
);

const AniviaQ = new Ability(
  "Flash Frost",
  "Q",
  "Flies forward, can recast to detonate for stun",
  { cooldown: [10, 9.5, 9, 8.5, 8], cooldownType: "standard" },
  { castTime: 0.25, range: 1100, width: 110 },
  { baseDamage: [60, 90, 120, 150, 180], apRatio: 60, damageType: "magic" },
  { ccType: "stun", ccDuration: 1 },
  undefined,
  undefined,
  ["Slow: 20% while passing", "Detonation stuns for 1s"],
);

const AniviaW = new Ability(
  "Crystallize",
  "W",
  "Creates impassible wall of ice",
  { cooldown: [17, 16, 15, 14, 13], cooldownType: "standard" },
  { castTime: 0.25, range: 1000, width: 400 },
  undefined,
  undefined,
  undefined,
  undefined,
  ["Wall lasts 5 seconds", "Blocks pathing"],
);

const AniviaE = new Ability(
  "Frostbite",
  "E",
  "Deals damage, doubled against chilled targets",
  { cooldown: [4, 3.5, 3, 2.5, 2], cooldownType: "standard" },
  { castTime: 0.25, range: 625 },
  { baseDamage: [50, 75, 100, 125, 150], apRatio: 60, damageType: "magic" },
  undefined,
  undefined,
  undefined,
  ["Doubled damage if chilled: 100/150/200/250/300 (+120% AP)"],
);

const AniviaR = new Ability(
  "Glacial Storm",
  "R",
  "Toggle: Creates expanding blizzard that slows and damages",
  { cooldown: [3, 2, 1], cooldownType: "standard" },
  { castTime: 0, range: 675, radius: 400 },
  { baseDamage: [30, 45, 60], apRatio: 25, damageType: "magic" },
  { ccType: "slow", ccDuration: 0.5, slow: 20 },
  undefined,
  undefined,
  [
    "Expands over 3s",
    "Full size: 60% slow",
    "Costs 60/90/120 mana/s",
    "Damage per second",
  ],
);

const Anivia = new Character(
  "Anivia",
  550, // HP
  5.5, // HP5
  19, // AR
  30, // MR
  51, // AD
  200, // Crit DMG (%)
  325, // MS
  600, // Attack range
  0.658, // Base AS
  [AniviaPassive, AniviaQ, AniviaW, AniviaE, AniviaR],
  [],
);

// Annie - The Dark Child
const AnniePassive = new Ability(
  "Pyromania",
  "passive",
  "Every 4 spell casts, next spell stuns",
  { cooldown: 0, cooldownType: "standard" },
  { castTime: 0, range: 0 },
  undefined,
  { ccType: "stun", ccDuration: 1.25 },
  undefined,
  undefined,
  ["Visual indicator at 4 stacks"],
);

const AnnieQ = new Ability(
  "Disintegrate",
  "Q",
  "Deals damage, refunds mana if it kills",
  { cooldown: [4, 3.75, 3.5, 3.25, 3], cooldownType: "standard" },
  { castTime: 0.25, range: 625 },
  { baseDamage: [80, 115, 150, 185, 220], apRatio: 80, damageType: "magic" },
  undefined,
  undefined,
  undefined,
  ["Refunds full mana cost if kills target"],
);

const AnnieW = new Ability(
  "Incinerate",
  "W",
  "Cone of fire damaging enemies",
  { cooldown: [8, 7.5, 7, 6.5, 6], cooldownType: "standard" },
  { castTime: 0.25, range: 600, width: 50 },
  { baseDamage: [70, 115, 160, 205, 250], apRatio: 85, damageType: "magic" },
  undefined,
  undefined,
  undefined,
  ["Cone angle: 50 degrees"],
);

const AnnieE = new Ability(
  "Molten Shield",
  "E",
  "Grants damage reduction and reflects damage",
  { cooldown: [12, 11.5, 11, 10.5, 10], cooldownType: "standard" },
  { castTime: 0, range: 0 },
  { baseDamage: [15, 20, 25, 30, 35], apRatio: 20, damageType: "magic" },
  undefined,
  undefined,
  undefined,
  [
    "Damage reduction: 16/22/28/34/40%",
    "Reflects magic damage when hit",
    "Lasts 3s",
  ],
);

const AnnieR = new Ability(
  "Summon: Tibbers",
  "R",
  "Summons Tibbers, dealing AoE damage",
  { cooldown: [130, 115, 100], cooldownType: "standard" },
  { castTime: 0.25, range: 600, radius: 290 },
  { baseDamage: [150, 275, 400], apRatio: 75, damageType: "magic" },
  undefined,
  undefined,
  undefined,
  [
    "Tibbers has 1200/2100/3000 HP",
    "Tibbers deals 50/75/100 (+15% AP) DPS in 175 range",
  ],
);

const Annie = new Character(
  "Annie",
  560, // HP
  5.5, // HP5
  23, // AR
  30, // MR
  50, // AD
  200, // Crit DMG (%)
  335, // MS
  625, // Attack range
  0.61, // Base AS
  [AnniePassive, AnnieQ, AnnieW, AnnieE, AnnieR],
  [],
);

// Aphelios - The Weapon of the Faithful
const ApheliosPassive = new Ability(
  "The Hitman and the Seer",
  "passive",
  "Wields 2 of 5 weapons. No items, gains stats per level instead",
  { cooldown: 0, cooldownType: "standard" },
  { castTime: 0, range: 0 },
  undefined,
  undefined,
  undefined,
  undefined,
  [
    "Gains bonus AD, AS, and Lethality per level",
    "50 ammo per weapon",
    "Cycles through 5 weapons",
  ],
);

const ApheliosQ = new Ability(
  "Weapon Abilities",
  "Q",
  "Different per weapon: Calibrum, Severum, Gravitum, Infernum, Crescendum",
  { cooldown: [9, 8, 7, 6, 5], cooldownType: "standard" },
  { castTime: 0.25, range: 650 },
  {
    baseDamage: [60, 90, 120, 150, 180],
    apRatio: 60,
    bonusAdRatio: 90,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Calibrum: Mark and root",
    "Severum: AOE slash and heal",
    "Gravitum: Slow and root all marked",
    "Infernum: AOE cone",
    "Crescendum: Place turret",
  ],
);

const ApheliosW = new Ability(
  "Phase",
  "W",
  "Swaps main and off-hand weapons",
  { cooldown: [0.2], cooldownType: "standard" },
  { castTime: 0, range: 0 },
  undefined,
  undefined,
  undefined,
  undefined,
  ["Instant swap"],
);

const ApheliosE = new Ability(
  "Weapon Queue System",
  "E",
  "Passive: Cycles weapons as they run out of ammo",
  { cooldown: 0, cooldownType: "standard" },
  { castTime: 0, range: 0 },
  undefined,
  undefined,
  undefined,
  undefined,
  ["Order: Calibrum, Severum, Gravitum, Infernum, Crescendum"],
);

const ApheliosR = new Ability(
  "Moonlight Vigil",
  "R",
  "Fires blast of moonlight, applying offhand weapon effect",
  { cooldown: [120, 110, 100], cooldownType: "standard" },
  { castTime: 0.5, range: 1300, radius: 500 },
  {
    baseDamage: [125, 175, 225],
    apRatio: 35,
    bonusAdRatio: 100,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  ["Applies offhand weapon's special effect to all enemies hit"],
);

const Aphelios = new Character(
  "Aphelios",
  600, // HP
  3.25, // HP5
  26, // AR
  30, // MR
  55, // AD
  200, // Crit DMG (%)
  325, // MS
  550, // Attack range
  0.665, // Base AS
  [ApheliosPassive, ApheliosQ, ApheliosW, ApheliosE, ApheliosR],
  [],
);

// Ashe - The Frost Archer
const AshePassive = new Ability(
  "Frost Shot",
  "passive",
  "Attacks and abilities slow enemies. Critical strikes deal bonus damage instead",
  { cooldown: 0, cooldownType: "standard" },
  { castTime: 0, range: 0 },
  undefined,
  { ccType: "slow", ccDuration: 2, slow: 15 },
  undefined,
  undefined,
  [
    "Slows scale with crit chance",
    "Crits deal 110-160% damage based on crit chance",
    "Bonus slow: 15-30% based on crit chance",
  ],
);

const AsheQ = new Ability(
  "Ranger's Focus",
  "Q",
  "Toggle: Empowers attacks to fire 5 arrows",
  { cooldown: 0, cooldownType: "standard" },
  { castTime: 0, range: 600 },
  { baseDamage: [20, 25, 30, 35, 40], damageType: "physical" },
  undefined,
  undefined,
  undefined,
  [
    "Requires 4 Focus stacks",
    "Focus gained per attack",
    "Each arrow deals 25/28.75/32.5/36.25/40% AD",
  ],
);

const AsheW = new Ability(
  "Volley",
  "W",
  "Fires 9 arrows in cone",
  { cooldown: [14, 11.5, 9, 6.5, 4], cooldownType: "standard" },
  { castTime: 0.25, range: 1200, width: 20 },
  { baseDamage: [20, 35, 50, 65, 80], adRatio: 115, damageType: "physical" },
  { ccType: "slow", ccDuration: 2, slow: 20 },
  undefined,
  undefined,
  ["Slows by 20-40% for 2s", "Applies Frost Shot"],
);

const AsheE = new Ability(
  "Hawkshot",
  "E",
  "Sends hawk to scout area",
  { cooldown: [5], cooldownType: "standard" },
  { castTime: 0.25, range: 25000 },
  undefined,
  undefined,
  undefined,
  undefined,
  ["Grants vision for 5 seconds", "Stores 2 charges, 90s recharge"],
);

const AsheR = new Ability(
  "Enchanted Crystal Arrow",
  "R",
  "Global arrow that stuns",
  { cooldown: [100, 90, 80], cooldownType: "standard" },
  { castTime: 0.25, range: 25000, width: 130 },
  { baseDamage: [200, 400, 600], apRatio: 100, damageType: "magic" },
  { ccType: "stun", ccDuration: 3.5 },
  undefined,
  undefined,
  ["Stun: 1-3.5s based on distance", "Slows nearby enemies by 50% for 3s"],
);

const Ashe = new Character(
  "Ashe",
  610,
  3.5,
  26,
  30,
  59,
  200,
  325,
  600,
  0.658,
  [AshePassive, AsheQ, AsheW, AsheE, AsheR],
  [],
);

// Evelynn - Agony's Embrace
const EvelynnPassive = new Ability(
  "Demon Shade",
  "passive",
  "After not breaking stealth for 4s, gains camouflage (from level 6) and healing when low HP",
  { cooldown: 0, staticCooldown: 4, cooldownType: "standard" },
  { castTime: 0, range: 0 },
  undefined,
  undefined,
  undefined,
  undefined,
  [
    "Heals 15-150 per second when below 250-590 (+250% AP) HP",
    "Grants camouflage from level 6",
  ],
);

const EvelynnQ = new Ability(
  "Hate Spike",
  "Q",
  "Launches dart that marks target. Can recast 3 times to send spikes at nearest enemy",
  { cooldown: [4], cooldownType: "standard" },
  { castTime: 0.3, range: 800, width: 120 },
  { baseDamage: [25, 30, 35, 40, 45], apRatio: 25, damageType: "magic" },
  undefined,
  undefined,
  undefined,
  [
    "Mark lasts 4s",
    "Next 3 attacks/abilities deal 15/25/35/45/55 (+25% AP) bonus damage",
    "Recast 3 times for 25/30/35/40/45 (+25% AP) per spike",
  ],
);

const EvelynnW = new Ability(
  "Allure",
  "W",
  "Curses enemy. After 2.5s, next attack/ability charms them",
  { cooldown: [15, 14, 13, 12, 11], cooldownType: "standard" },
  { castTime: 0.25, range: 1200 },
  { baseDamage: [250, 300, 350, 400, 450], apRatio: 60, damageType: "magic" },
  { ccType: "slow", ccDuration: 0.75, slow: 45 },
  undefined,
  undefined,
  [
    "Fully charged: Charms for 1.25/1.5/1.75/2/2.25s",
    "Champions: -35/37.5/40/42.5/45% MR for 4s",
    "Monsters: +250/300/350/400/450 (+60% AP) bonus damage",
  ],
);

const EvelynnE = new Ability(
  "Whiplash",
  "E",
  "Whips target for damage. Empowered version dashes to target",
  { cooldown: [8], cooldownType: "standard" },
  { castTime: 0.25, range: 210 },
  {
    baseDamage: [60, 90, 120, 150, 180],
    maxHealthRatio: 3,
    maxHealthRatioPerAP: 1.5,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Base: 60/90/120/150/180 (+3% +1.5% per 100 AP of max HP)",
    "Empowered: 80/120/160/200/240 (+4% +2.5% per 100 AP of max HP)",
    "Grants 30/35/40/45/50% MS for 2s",
    "Demon Shade resets CD and empowers next cast",
  ],
);

const EvelynnR = new Ability(
  "Last Caress",
  "R",
  "Reveals true form, dealing damage in cone and blinking backwards",
  { cooldown: [120, 100, 80], cooldownType: "standard" },
  { castTime: 0.35, range: 500, width: 180 },
  { baseDamage: [125, 250, 375], apRatio: 75, damageType: "magic" },
  undefined,
  undefined,
  undefined,
  [
    "Deals 240% damage to enemies below 30% HP: 300/600/900 (+180% AP)",
    "Blinks 700 units backwards",
    "Becomes untargetable during cast",
  ],
);

const Evelynn = new Character(
  "Evelynn",
  642,
  8.5,
  37,
  32,
  61,
  200,
  335,
  125,
  0.667,
  [EvelynnPassive, EvelynnQ, EvelynnW, EvelynnE, EvelynnR],
  [],
);

// Aurelion Sol - The Star Forger
const AurelionSolPassive = new Ability(
  "Cosmic Creator",
  "passive",
  "Damaging abilities generate permanent Stardust stacks that augment all abilities",
  { cooldown: 0, cooldownType: "standard" },
  { castTime: 0, range: 0 },
  undefined,
  undefined,
  undefined,
  undefined,
  [
    "Breath of Light: Bursts deal bonus max HP damage",
    "Astral Flight: Range +7.5 per Stardust",
    "Singularity: Radius +15% Stardust, execution threshold increased",
    "Falling Star: Impact radius +15% Stardust",
  ],
);

const AurelionSolQ = new Ability(
  "Breath of Light",
  "Q",
  "Channels beam of starfire that burns enemies, dealing damage over time",
  { cooldown: [3], cooldownType: "standard" },
  { castTime: 0, range: 750 },
  {
    baseDamage: [5.625, 7.5, 9.375, 11.25, 13.125],
    apRatio: 6.875,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Damage per 0.125s tick",
    "Secondary targets: 50% damage",
    "Burst damage per second: 60/70/80/90/100 (+30% AP) (+3.1% Stardust of max HP)",
    "Channel up to 3.25s (160s at rank 5)",
    "Costs 8.75/10/11.25/12.5/13.75 mana per 0.25s",
  ],
);

const AurelionSolW = new Ability(
  "Astral Flight",
  "W",
  "Dashes forward, resets Q cooldown, can cast Q unlimited during flight",
  { cooldown: [22, 20.5, 19, 17.5, 16], cooldownType: "standard" },
  { castTime: 0.4, range: 1500 },
  undefined,
  undefined,
  undefined,
  undefined,
  [
    "Resets Breath of Light cooldown",
    "During flight: Q has no cooldown/max duration",
    "Q damage: 108/109/110/111/112%",
    "Dash speed reduced 50% during Q channel",
    "Takedown within 3s: -90% current cooldown",
  ],
);

const AurelionSolE = new Ability(
  "Singularity",
  "E",
  "Creates black hole that drags enemies inward and executes low HP targets",
  { cooldown: [12], cooldownType: "standard" },
  { castTime: 0.2, range: 750, radius: 275 },
  { baseDamage: [2.5, 3.75, 5, 6.25, 7.5], apRatio: 3, damageType: "magic" },
  undefined,
  undefined,
  undefined,
  [
    "Damage per 0.25s tick",
    "0.5s delay",
    "Lasts 5s",
    "Executes below 5% (+2.6% Stardust) max HP",
    "Generates 1 Stardust per second champions are inside",
    "Champions/epic monsters killed: 2 Stardust",
    "Large minions/monsters killed: 2 Stardust",
  ],
);

const AurelionSolR = new Ability(
  "Falling Star",
  "R",
  "Calls down star that stuns enemies. Empowered version knocks up and sends shockwave",
  { cooldown: [120, 110, 100], cooldownType: "standard" },
  { castTime: 0, range: 1250, radius: 275 },
  { baseDamage: [150, 250, 350], apRatio: 75, damageType: "magic" },
  { ccType: "stun", ccDuration: 1 },
  undefined,
  undefined,
  [
    "1.25s delay",
    "Generates 5 Stardust per champion hit",
    "Empowered (75 Stardust): 187.5/312.5/437.5 (+93.75% AP)",
    "Empowered: Knocks up for 1s",
    "Empowered: Shockwave deals 135/225/315 (+67.5% AP), slows 50% for 1s",
  ],
);

const AurelionSol = new Character(
  "Aurelion Sol",
  600,
  5.5,
  22,
  30,
  58,
  200,
  340,
  550,
  0.625,
  [AurelionSolPassive, AurelionSolQ, AurelionSolW, AurelionSolE, AurelionSolR],
  [],
);

// Cho'Gath - The Terror of the Void
const ChoGathPassive = new Ability(
  "Carnivore",
  "passive",
  "Killing an enemy heals HP and restores mana",
  { cooldown: 0, cooldownType: "standard" },
  { castTime: 0, range: 0 },
  undefined,
  {
    heal: [18, 52],
  },
  undefined,
  undefined,
  ["Heal: 18-52 (based on level)", "Mana restore: 4.72-9.48 (based on level)"],
);

const ChoGathQ = new Ability(
  "Rupture",
  "Q",
  "Delayed AOE dealing damage, knocking up, then slowing",
  {
    cooldown: 6,
    cooldownType: "standard",
  },
  {
    castTime: 0.5,
    range: 950,
    radius: 250,
  },
  {
    baseDamage: [80, 135, 190, 245, 300],
    apRatio: 100,
    damageType: "magic",
  },
  {
    ccType: "knockup",
    ccDuration: 1,
    slow: 60,
  },
  undefined,
  undefined,
  [
    "Delay: 0.627s",
    "After knockup: 60% slow for 1.5s",
    "Grants vision of area",
  ],
);

const ChoGathW = new Ability(
  "Feral Scream",
  "W",
  "Cone roar dealing damage and silencing champions",
  {
    cooldown: [11, 10.5, 10, 9.5, 9],
    cooldownType: "standard",
  },
  {
    castTime: 0.5,
    range: 650,
    radius: 650,
  },
  {
    baseDamage: [80, 130, 180, 230, 280],
    apRatio: 70,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cone: 60° angle",
    "Silence duration: 1.6/1.7/1.8/1.9/2s",
    "Cost: 70/75/80/85/90 mana",
    "Silences champions and Rift Scuttler",
  ],
);

const ChoGathE = new Ability(
  "Vorpal Spikes",
  "E",
  "Empowers next 3 attacks to launch spikes dealing % max HP damage",
  {
    cooldown: [8, 7, 6, 5, 4],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 650,
    radius: 340,
  },
  {
    baseDamage: [20, 40, 60, 80, 100],
    apRatio: 30,
    maxHealthRatio: [2.5, 2.85, 3.2, 3.55, 3.9],
    damageType: "magic",
  },
  {
    slow: [30, 35, 40, 45, 50],
  },
  undefined,
  undefined,
  [
    "Next 3 attacks within 6s",
    "+50 bonus range per attack",
    "% max HP: 2.5-3.9% (+0.5% per Feast stack)",
    "Slow decays over 1.5s",
    "Monster damage: 100/150/200/250/300 (+30% AP)",
    "Width scales with size",
    "Resets basic attack timer",
  ],
);

const ChoGathR = new Ability(
  "Feast",
  "R",
  "Attempt to eat target dealing true damage. Gains stacks on kill",
  {
    cooldown: [80, 70, 60],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 175,
  },
  {
    baseDamage: [300, 475, 650],
    apRatio: 50,
    bonusHPRatio: 10, // +10% of Cho'Gath's bonus HP as damage
    damageType: "true",
  },
  undefined,
  undefined,
  undefined,
  [
    "Champion damage: 300/475/650 (+50% AP)(+10% Cho'Gath's bonus HP)",
    "Non-champion: 1200 (+50% AP)(+10% bonus HP)",
    "On kill: Gains Feast stack",
    "Max 6 stacks from minions/non-epic monsters",
    "Per stack: 80/120/160 HP, 4.7/6.2/7.7 range, 6/8/10% size",
    "Range per stack: +2.5 (max +25 at 10 stacks)",
    "Max bonuses: +75 range, 100% size increase",
  ],
);

const ChoGath = new Character(
  "Cho'Gath",
  644,
  9,
  38,
  32,
  69,
  200,
  345,
  125,
  0.658,
  [ChoGathPassive, ChoGathQ, ChoGathW, ChoGathE, ChoGathR],
  [],
);

// Corki - The Daring Bombardier
const CorkiPassive = new Ability(
  "Hextech Munitions",
  "passive",
  "Basic attacks deal 20% AD as bonus true damage",
  { cooldown: 0, cooldownType: "standard" },
  { castTime: 0, range: 0 },
  {
    baseDamage: [0],
    adRatio: 20,
    damageType: "true",
  },
  undefined,
  undefined,
  undefined,
  ["True damage: 20% AD", "Affected by critical strike modifiers"],
  true, // Applies on basic attacks
);

const CorkiQ = new Ability(
  "Phosphorus Bomb",
  "Q",
  "Launch bomb dealing magic damage and granting vision",
  {
    cooldown: [9, 8.5, 8, 7.5, 7],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 825,
    radius: 275,
  },
  {
    baseDamage: [60, 105, 150, 195, 240],
    bonusAdRatio: 125,
    apRatio: 100,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 60/65/70/75/80 mana",
    "Grants vision of area for 6s",
    "Reveals hit champions for 6s",
    "Vision radius: 500",
  ],
);

const CorkiW = new Ability(
  "Valkyrie",
  "W",
  "Dash dropping bombs that deal magic damage over time",
  {
    cooldown: [20, 18, 16, 14, 12],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 600,
    radius: 200,
  },
  {
    baseDamage: [30, 45, 60, 75, 90],
    bonusAdRatio: 40,
    apRatio: 30,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 80/85/90/95/100 mana",
    "Damage per 0.5s tick",
    "Up to 3 patches based on distance",
    "Patches last 2.5s",
    "Damage lingers 1s after leaving",
    "Can cast Gatling Gun during dash",
  ],
);

const CorkiE = new Ability(
  "Gatling Gun",
  "E",
  "Spray bullets in cone reducing armor and MR per stack",
  {
    cooldown: 12,
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 690,
    radius: 690,
  },
  {
    baseDamage: [5, 8.125, 11.25, 14.375, 17.5],
    bonusAdRatio: 15,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 50/55/60/65/70 mana",
    "Duration: 4s",
    "Damage per 0.25s tick",
    "Cone: 35° angle",
    "Armor/MR reduction per stack: 3/3.5/4/4.5/5",
    "Max 4 stacks",
    "Stack duration: 2s (refreshes)",
  ],
);

const CorkiR = new Ability(
  "Missile Barrage",
  "R",
  "Fire missile dealing physical damage. Every 3rd is empowered",
  {
    cooldown: 2,
    cooldownType: "ammo",
  },
  {
    castTime: 0.175,
    range: 1300,
    radius: 150,
  },
  {
    baseDamage: [90, 170, 250],
    bonusAdRatio: 85,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 35 mana + 1 ammo",
    "Max 4 charges",
    "Recharge: 20s",
    "Gains 2 charges on learn",
    "Max charges on respawn",
    "Basic attacks vs champions reduce recharge: 2-4s (based on crit chance)",
    "Big One (every 3rd): 180/340/500 (+170% bonus AD)",
    "Big One: +200 range (1500), +150 radius (300), 100% increased damage",
  ],
);

const Corki = new Character(
  "Corki",
  610,
  5.5,
  27,
  30,
  52,
  200,
  325,
  550,
  0.644,
  [CorkiPassive, CorkiQ, CorkiW, CorkiE, CorkiR],
  [],
);

// Darius - The Hand of Noxus
const DariusPassive = new Ability(
  "Hemorrhage",
  "passive",
  "Attacks apply bleed stacks. 5 stacks grant Noxian Might",
  { cooldown: 0, cooldownType: "standard" },
  { castTime: 0, range: 0 },
  {
    baseDamage: [13, 30],
    bonusAdRatio: 30,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Per stack: 13-30 (+30% bonus AD) total over 5s",
    "Max 5 stacks: 65-150 (+150% bonus AD) total",
    "200% damage vs monsters",
    "5 stacks or R kill: Noxian Might for 5s",
    "Noxian Might: 30-230 bonus AD (based on level)",
    "Noxian Might: Instantly applies 5 stacks",
  ],
);

const DariusQ = new Ability(
  "Decimate",
  "Q",
  "Swing axe dealing physical damage. Blade hits heal",
  {
    cooldown: [9, 8, 7, 6, 5],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 460,
    radius: 460,
  },
  {
    baseDamage: [50, 80, 110, 140, 170],
    adRatio: 140,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 25/30/35/40/45 mana",
    "Windup: 0.75s",
    "Inner radius (35% damage): 240",
    "Blade heal: 17-51% missing HP (based on targets hit)",
    "Only champions/large monsters heal",
    "Inner hits don't apply/refresh Hemorrhage",
    "Ghosted for 1s",
  ],
);

const DariusW = new Ability(
  "Crippling Strike",
  "W",
  "Empowered attack dealing bonus damage and 90% slow",
  {
    cooldown: 5,
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 175,
  },
  {
    baseDamage: [0],
    adRatio: 60,
    damageType: "physical",
  },
  {
    ccType: "slow",
    ccDuration: 1,
    slow: 90,
  },
  undefined,
  undefined,
  [
    "Cost: 40 mana",
    "+25 bonus range",
    "Affected by crit modifiers",
    "On kill: 50% CDR refund and mana refund",
    "Resets basic attack timer",
    "Uncancellable windup",
  ],
  true, // appliesOnHit
);

const DariusE = new Ability(
  "Apprehend",
  "E",
  "Pull enemies in cone. Passive armor penetration",
  {
    cooldown: [26, 23.5, 21, 18.5, 16],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 535,
    radius: 535,
  },
  undefined,
  {
    ccType: "pull",
    ccDuration: 1,
    slow: 40,
  },
  undefined,
  undefined,
  [
    "Cost: 70/60/50/40/30 mana",
    "Cone: 50° angle",
    "Passive: 20/25/30/35/40% armor penetration",
    "Pulls then rebounds 150 units",
    "40% slow for 1s after pull",
    "Grants vision for 1s",
    "0.4s lockout after cast",
  ],
);

const DariusR = new Ability(
  "Noxian Guillotine",
  "R",
  "Execute dealing true damage based on Hemorrhage stacks",
  {
    cooldown: [120, 100, 80],
    cooldownType: "standard",
  },
  {
    castTime: 0.3667,
    range: 475,
  },
  {
    baseDamage: [125, 250, 375],
    bonusAdRatio: 75,
    damageType: "true",
  },
  {
    ccType: "fear",
    ccDuration: 3,
  },
  undefined,
  undefined,
  [
    "Cost: 100/100/0 mana",
    "Damage increase: 0-100% based on Hemorrhage stacks",
    "On kill: Recast within 20s at no cost",
    "On kill: Fear nearby minions/monsters for 3s (slow up to 99%)",
    "Rank 3: No mana cost, no recast timer",
    "Grants vision for 2.5s",
    "0.25s lockout after cast",
  ],
);

const Darius = new Character(
  "Darius",
  652,
  10,
  37,
  32,
  64,
  200,
  340,
  175,
  0.625,
  [DariusPassive, DariusQ, DariusW, DariusE, DariusR],
  [],
);

// Diana - Scorn of the Moon
const DianaPassive = new Ability(
  "Moonsilver Blade",
  "passive",
  "Gain bonus AS. 3rd attack cleaves dealing magic damage",
  { cooldown: 0, cooldownType: "standard" },
  { castTime: 0, range: 0, radius: 175 },
  {
    // Every 3rd attack, so averaged: (20-220 + 50% AP) / 3 = ~6.67-73.3 + 16.67% AP per attack
    baseDamage: [7, 73],
    apRatio: 17, // 50%/3 ≈ 16.67%, rounded to 17%
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Bonus AS: 15-35% (based on level)",
    "After ability cast: Triple AS bonus (45-105%) for 5s",
    "Every 3rd attack: 20-220 (+50% AP) magic damage",
    "DPS uses averaged damage: ~7-73 (+17% AP) per attack",
    "Cleave radius: 175",
    "280% damage vs monsters",
  ],
  true, // On-hit passive (averaged for DPS)
);

const DianaQ = new Ability(
  "Crescent Strike",
  "Q",
  "Arc bolt dealing magic damage and applying Moonlight",
  {
    cooldown: [8, 7.5, 7, 6.5, 6],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 900,
  },
  {
    baseDamage: [70, 105, 140, 175, 210],
    apRatio: 70,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 50 mana",
    "Counter-clockwise arc",
    "Applies Moonlight for 3s (reveals)",
    "Grants vision for 0.5s",
  ],
);

const DianaW = new Ability(
  "Pale Cascade",
  "W",
  "Shield and 3 orbiting spheres that detonate on contact",
  {
    cooldown: [15, 13.5, 12, 10.5, 9],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 0,
    radius: 200,
  },
  {
    // 3 orbs × (20-68 + 18% AP) = 60-204 + 54% AP
    baseDamage: [60, 96, 132, 168, 204],
    apRatio: 54,
    damageType: "magic",
  },
  {
    shield: [45, 60, 75, 90, 105],
  },
  undefined,
  undefined,
  [
    "Per orb: 20/32/44/56/68 (+18% AP)",
    "Total (3 orbs): 60/96/132/168/204 (+54% AP)",
    "All 3 orbs: Refreshes shield",
  ],
);

const DianaE = new Ability(
  "Lunar Rush",
  "E",
  "Dash to enemy dealing magic damage. Resets on Moonlight",
  {
    cooldown: [22, 20, 18, 16, 14],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 825,
  },
  {
    baseDamage: [50, 70, 90, 110, 130],
    apRatio: 60,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 40/45/50/55/60 mana",
    "Consumes Moonlight from all enemies",
    "Moonlight consumed: CD reduced to 0.25s",
    "If target within 400 range: Dash through their location",
    "Can cast abilities during dash",
  ],
);

const DianaR = new Ability(
  "Moonfall",
  "R",
  "Pull all nearby enemies then deal magic damage per champion",
  {
    cooldown: [100, 90, 80],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 475,
    radius: 475,
  },
  {
    baseDamage: [200, 300, 400],
    apRatio: 60,
    damageType: "magic",
  },
  {
    ccType: "slow",
    ccDuration: 2,
    slow: [40, 50, 60],
  },
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "Pull radius: 475",
    "Damage radius: 225",
    "1s delay before damage",
    "Bonus per champion beyond first: 35/60/85 (+15% AP)",
    "Reveals pulled enemies",
  ],
);

const Diana = new Character(
  "Diana",
  640,
  6.5,
  31,
  32,
  57,
  200,
  345,
  150,
  0.625,
  [DianaPassive, DianaQ, DianaW, DianaE, DianaR],
  [],
);

// Dr. Mundo - The Madman of Zaun
const DrMundoPassive = new Ability(
  "Goes Where He Pleases",
  "passive",
  "Bonus HP regen. Resists immobilize, drops canister that heals",
  { cooldown: 60, staticCooldown: 15, cooldownType: "static" },
  { castTime: 0, range: 0 },
  undefined,
  {
    heal: [0.4, 2.3],
  },
  undefined,
  undefined,
  [
    "Bonus HP regen: 0.4-2.3% max HP per 5s",
    "Resists immobilize: Costs 4% current HP",
    "Canister heals: 4% max HP and reduces CD by 15s",
    "Canister lasts 7s at 525 units",
    "CD resets on respawn",
  ],
);

const DrMundoQ = new Ability(
  "Infected Bonesaw",
  "Q",
  "Throw bonesaw dealing % current HP magic damage and slowing",
  {
    cooldown: 4,
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 1050,
  },
  {
    baseDamage: [80, 130, 180, 230, 280],
    currentHealthRatio: [20, 22.5, 25, 27.5, 30], // % of target's current HP
    damageType: "magic",
  },
  {
    ccType: "slow",
    ccDuration: 2,
    slow: 40,
  },
  undefined,
  undefined,
  [
    "Cost: 50/60/70/80/90 HP",
    "Damage: 20/22.5/25/27.5/30% target's current HP",
    "Minimum damage: 80/130/180/230/280 (included in base)",
    "Monster cap: 300/375/450/525/600",
    "Heal: 50% cost (100% vs champions/monsters)",
  ],
);

const DrMundoW = new Ability(
  "Heart Zapper",
  "W",
  "Charge defibrillator storing damage as grey health, then heal",
  {
    cooldown: [17, 16.5, 16, 15.5, 15],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 0,
    radius: 325,
  },
  {
    baseDamage: [20, 35, 50, 65, 80],
    bonusHPRatio: 7, // +7% of Mundo's bonus HP as damage
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 8% current HP",
    "Duration: Up to 3s",
    "Damage per 0.25s tick: 5/8.75/12.5/16.25/20",
    "Stores 80-95% damage taken as grey health",
    "After 0.75s: Stores only 25%",
    "Recast: Deals 20/35/50/65/80 (+7% bonus HP)",
    "Heal: 50% grey health (100% if hit champion/large monster)",
    "Can recast after 0.5s",
  ],
);

const DrMundoE = new Ability(
  "Blunt Force Trauma",
  "E",
  "Passive bonus AD. Empowered attack with missing HP scaling",
  {
    cooldown: [9, 8.25, 7.5, 6.75, 6],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 650,
    radius: 155,
  },
  {
    baseDamage: [5, 15, 25, 35, 45],
    bonusHPRatio: 5, // +5% of Mundo's bonus HP as damage
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 10/25/40/55/70 HP",
    "Passive: 2/2.3/2.6/2.9/3.2% max HP as bonus AD",
    "+50 bonus range",
    "Bonus damage: 5/15/25/35/45 (+5% bonus HP)",
    "Increases 0-40% based on missing HP",
    "On kill/small monster: Sends flying, enemies hit take 100% AD + min bonus damage",
    "140% damage vs minions, 200% vs monsters",
    "Resets basic attack timer",
    "Uncancellable windup",
  ],
  true, // appliesOnHit
);

const DrMundoR = new Ability(
  "Maximum Dosage",
  "R",
  "Inject chemicals gaining bonus HP, MS, and massive regen",
  {
    cooldown: 120,
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 0,
  },
  undefined,
  undefined,
  undefined,
  undefined,
  [
    "Duration: 10s",
    "Instant HP: 15/20/25% missing HP",
    "Bonus MS: 15/25/35%",
    "HP regen: 10/20/30% max HP per second",
    "Total regen: 20/40/60% max HP over duration",
  ],
);

const DrMundo = new Character(
  "Dr. Mundo",
  640,
  7,
  32,
  29,
  61,
  200,
  345,
  125,
  0.67,
  [DrMundoPassive, DrMundoQ, DrMundoW, DrMundoE, DrMundoR],
  [],
);

// Draven - The Glorious Executioner
const DravenPassive = new Ability(
  "League of Draven",
  "passive",
  "Gain Adoration stacks. Cash out on champion kill for bonus gold",
  { cooldown: 0, cooldownType: "standard" },
  { castTime: 0, range: 0 },
  undefined,
  undefined,
  undefined,
  undefined,
  [
    "Gain stacks: Catch Spinning Axe, kill non-champion, destroy turret",
    "On champion kill: 25 + (2 × stacks) bonus gold",
    "Lose 50% stacks on death",
  ],
);

const DravenQ = new Ability(
  "Spinning Axe",
  "Q",
  "Empower next attack with bonus damage. Axe ricochets to catch",
  {
    cooldown: [12, 11, 10, 9, 8],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 0,
  },
  {
    baseDamage: [40, 45, 50, 55, 60],
    bonusAdRatio: 115,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 45 mana",
    "Duration: 5.8s",
    "Axe lands after 2s based on movement",
    "Catch to regain empowered attack",
    "Max 2 Spinning Axes held",
  ],
);

const DravenW = new Ability(
  "Blood Rush",
  "W",
  "Gain bonus AS and decaying MS. Resets on Spinning Axe catch",
  {
    cooldown: 12,
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 0,
  },
  undefined,
  undefined,
  undefined,
  undefined,
  [
    "Cost: 40/35/30/25/20 mana",
    "Bonus AS: 20/25/30/35/40% for 3s",
    "Bonus MS: 50/55/60/65/70% (decays over 1.5s)",
    "Ghosted for 1.5s",
    "Resets on Spinning Axe catch",
  ],
);

const DravenE = new Ability(
  "Stand Aside",
  "E",
  "Fan of axes knocking aside and slowing",
  {
    cooldown: [18, 17, 16, 15, 14],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 1100,
  },
  {
    baseDamage: [75, 110, 145, 180, 215],
    bonusAdRatio: 50,
    damageType: "physical",
  },
  {
    ccType: "slow",
    ccDuration: 2,
    slow: [20, 25, 30, 35, 40],
  },
  undefined,
  undefined,
  ["Cost: 70 mana", "Width: 260", "Knocks aside (not through terrain)"],
);

const DravenR = new Ability(
  "Whirling Death",
  "R",
  "Global axes dealing damage. Executes low HP champions",
  {
    cooldown: [100, 90, 80],
    cooldownType: "standard",
  },
  {
    castTime: 0.5,
    range: 25000,
  },
  {
    baseDamage: [200, 300, 400],
    bonusAdRatio: 150,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "Width: 320",
    "Execute threshold: Based on Adoration stacks",
    "Recast: Reverse direction",
    "Damage: 100-40% based on enemies hit (resets on reverse)",
    "Min damage: 80/120/160 (+44/52/60% bonus AD)",
    "Grants vision",
  ],
);

const Draven = new Character(
  "Draven",
  675,
  3.75,
  29,
  30,
  62,
  200,
  330,
  550,
  0.679,
  [DravenPassive, DravenQ, DravenW, DravenE, DravenR],
  [],
);

// Ekko - The Boy Who Shattered Time
const EkkoPassive = new Ability(
  "Z-Drive Resonance",
  "passive",
  "3rd hit deals bonus magic damage and grants MS vs champions",
  { cooldown: 5, cooldownType: "standard" },
  { castTime: 0, range: 0 },
  {
    baseDamage: [30, 140],
    apRatio: 90,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Every 3rd hit: 30-140 (+90% AP) magic damage",
    "300% damage vs monsters",
    "Target immunity: 5s",
    "On proc vs champion: 50/60/70/80% MS for 2/2.5/3s",
  ],
);

const EkkoQ = new Ability(
  "Timewinder",
  "Q",
  "Throw grenade that slows then returns dealing damage twice",
  {
    cooldown: [9, 8.5, 8, 7.5, 7],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 1100,
  },
  {
    // First hit: 80-140 + 30% AP
    // Second hit: 40-140 + 60% AP
    // Total: 120-280 + 90% AP
    baseDamage: [120, 160, 200, 240, 280],
    apRatio: 90,
    damageType: "magic",
  },
  {
    ccType: "slow",
    ccDuration: 1.75,
    slow: [40, 45, 50, 55, 60],
  },
  undefined,
  undefined,
  [
    "First hit: 80/95/110/125/140 (+30% AP)",
    "Return hit: 40/65/90/115/140 (+60% AP)",
    "Total: 120/160/200/240/280 (+90% AP)",
  ],
);

const EkkoW = new Ability(
  "Parallel Convergence",
  "W",
  "Passive execute damage. Active zone stuns if Ekko enters",
  {
    cooldown: [22, 20, 18, 16, 14],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 1600,
    radius: 375,
  },
  {
    baseDamage: [15],
    apRatio: 3,
    damageType: "magic",
  },
  {
    ccType: "stun",
    ccDuration: 2.25,
    slow: 40,
    shield: [100, 120, 140, 160, 180],
  },
  undefined,
  undefined,
  [
    "Cost: 30/35/40/45/50 mana",
    "Passive: 3% (+3% per 100 AP) missing HP below 30% HP",
    "Passive min: 15, cap vs minions/monsters: 150",
    "Afterimage delay: 2s",
    "Travel time: 1.25s",
    "Sphere duration: 1.5s",
    "Slow: 40%",
    "Shield: 100/120/140/160/180 (+150% AP) for 2s",
    "Visible to enemies after 2s",
  ],
);

const EkkoE = new Ability(
  "Phase Dive",
  "E",
  "Dash then empowered blink attack dealing bonus damage",
  {
    cooldown: [9, 8.5, 8, 7.5, 7],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 550,
  },
  {
    baseDamage: [50, 75, 100, 125, 150],
    apRatio: 40,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 40/45/50/55/60 mana",
    "+300 bonus range on empowered attack",
    "Blinks within 125 range",
    "Empowered attack duration: 3s",
    "Cast time: 0.25s",
    "Resets basic attack timer",
    "Can cast abilities during dash",
  ],
);

const EkkoR = new Ability(
  "Chronobreak",
  "R",
  "Dash to afterimage location dealing damage and healing",
  {
    cooldown: [110, 80, 50],
    cooldownType: "standard",
  },
  {
    castTime: 0.5,
    range: 0,
    radius: 375,
  },
  {
    baseDamage: [200, 350, 500],
    apRatio: 175,
    damageType: "magic",
  },
  {
    heal: [100, 150, 200],
  },
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "Afterimage: 4 seconds ago",
    "Heal: 100/150/200 (+60% AP)(+3% per 1% HP lost in past 4s)",
    "Stasis during cast",
    "Dash duration: 0.5s",
  ],
);

const Ekko = new Character(
  "Ekko",
  655,
  9,
  32,
  32,
  58,
  200,
  340,
  125,
  0.688,
  [EkkoPassive, EkkoQ, EkkoW, EkkoE, EkkoR],
  [],
);

// Elise - The Spider Queen
const ElisePassive = new Ability(
  "Spider Queen",
  "passive",
  "Human: Store spiderlings. Spider: Bonus damage and heal on-hit",
  { cooldown: 0, cooldownType: "standard" },
  { castTime: 0, range: 0 },
  {
    // Spider form on-hit damage (based on R rank 1-4)
    baseDamage: [12, 22, 32, 42],
    apRatio: 15,
    damageType: "magic",
  },
  {
    heal: [6, 8, 10, 12],
  },
  undefined,
  undefined,
  [
    "Human: Store 2/3/4/5 spiderlings (based on R rank)",
    "Gain spiderling per ability hit (once per cast)",
    "Spider: 12/22/32/42 (+15% AP) bonus magic damage on-hit",
    "Spider: Heal 6/8/10/12 (+8% AP) on-hit",
    "Starts with max spiderlings",
  ],
  true, // Spider form on-hit damage
);

const EliseQ = new Ability(
  "Neurotoxin",
  "Q",
  "Fire toxin dealing % current HP magic damage",
  {
    cooldown: 6,
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 575,
  },
  {
    baseDamage: [40, 70, 100, 130, 160],
    currentHealthRatio: 4,
    currentHealthRatioPerAP: 3, // +3% per 100 AP
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 80/85/90/95/100 mana",
    "Damage: 40/70/100/130/160 + 4% (+3% per 100 AP) target's current HP",
    "Monster cap: 65/85/105/125/145 (+90% AP)",
  ],
);

const EliseW = new Ability(
  "Volatile Spiderling",
  "W",
  "Summon spider that explodes on contact dealing magic damage",
  {
    cooldown: 12,
    cooldownType: "standard",
  },
  {
    castTime: 0.125,
    range: 950,
    radius: 275,
  },
  {
    baseDamage: [60, 100, 140, 180, 220],
    apRatio: 75,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 60/70/80/90/100 mana",
    "Duration: 3s",
    "Untargetable spider",
    "Delay before seeking: 0.75s",
    "Seeking radius: 550",
    "Explosion radius: 275",
    "Prioritizes champions after reaching location",
  ],
);

const EliseE = new Ability(
  "Cocoon",
  "E",
  "Skillshot that stuns and reveals first enemy hit",
  {
    cooldown: [12, 11.5, 11, 10.5, 10],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 1100,
  },
  undefined,
  {
    ccType: "stun",
    ccDuration: 2.4,
  },
  undefined,
  undefined,
  [
    "Cost: 50 mana",
    "Width: 110",
    "Stun: 1.6/1.8/2/2.2/2.4s",
    "Reveals target during stun",
  ],
);

const EliseR = new Ability(
  "Spider Form / Human Form",
  "R",
  "Transform between Human and Spider forms",
  {
    cooldown: 3,
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 0,
  },
  undefined,
  undefined,
  undefined,
  undefined,
  [
    "Spider Form: +25 MS, melee (125 range), summon all spiderlings",
    "Spider Form: Access to spider abilities (Q/W/E variants)",
    "Human Form: Ranged (550 range), store spiderlings",
    "Human Form: Access to human abilities",
    "Ranks at: 1, 6, 11, 16",
    "Heals spiderlings to full on summon",
  ],
);

const Elise = new Character(
  "Elise",
  620,
  5.5,
  30,
  30,
  55,
  200,
  330,
  550,
  0.625,
  [ElisePassive, EliseQ, EliseW, EliseE, EliseR],
  [],
);

// Ezreal - The Prodigal Explorer
const EzrealPassive = new Ability(
  "Rising Spell Force",
  "passive",
  "Hitting enemies with abilities grants stacking bonus AS",
  { cooldown: 0, cooldownType: "standard" },
  { castTime: 0, range: 0 },
  undefined,
  undefined,
  undefined,
  undefined,
  [
    "Per stack: 10% bonus AS",
    "Max 5 stacks: 50% bonus AS",
    "Duration: 6s (refreshes)",
    "Gain stack per enemy hit by ability",
  ],
);

const EzrealQ = new Ability(
  "Mystic Shot",
  "Q",
  "Skillshot dealing physical damage. Applies on-hit. Reduces CDs on hit",
  {
    cooldown: [5.5, 5.25, 5, 4.75, 4.5],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 1200,
  },
  {
    baseDamage: [20, 45, 70, 95, 120],
    adRatio: 130,
    apRatio: 15,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 28/31/34/37/40 mana",
    "Width: 120",
    "On hit: Reduce all ability CDs by 1.5s",
    "Applies on-hit and on-attack effects",
  ],
  true, // appliesOnHit
);

const EzrealW = new Ability(
  "Essence Flux",
  "W",
  "Mark enemy. Detonating mark deals bonus magic damage",
  {
    cooldown: 8,
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 1200,
  },
  {
    baseDamage: [80, 135, 190, 245, 300],
    bonusAdRatio: 100,
    apRatio: 90,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 50 mana",
    "Width: 160",
    "Mark duration: 4s",
    "Targets: Champions, epic monsters, structures",
    "Detonate with basic attack or ability",
    "Ability detonate: Restore 60 mana + ability mana cost",
  ],
);

const EzrealE = new Ability(
  "Arcane Shift",
  "E",
  "Blink then fire homing bolt at nearest enemy",
  {
    cooldown: [26, 23, 20, 17, 14],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 475,
    radius: 750,
  },
  {
    baseDamage: [80, 130, 180, 230, 280],
    bonusAdRatio: 50,
    apRatio: 75,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 70 mana",
    "Blink range: 475",
    "Detection radius: 750",
    "Reveals target for 1s",
    "Prioritizes Essence Flux marked targets",
    "Does not require vision of target",
  ],
);

const EzrealR = new Ability(
  "Trueshot Barrage",
  "R",
  "Global skillshot dealing magic damage",
  {
    cooldown: [120, 105, 90],
    cooldownType: "standard",
  },
  {
    castTime: 1,
    range: 25000,
  },
  {
    baseDamage: [350, 550, 750],
    bonusAdRatio: 100,
    apRatio: 90,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "Width: 320",
    "Minions/non-epic monsters: 50% reduced damage (175/275/375 +50% bonus AD +45% AP)",
    "Grants vision along path",
  ],
);

const Ezreal = new Character(
  "Ezreal",
  600,
  4,
  24,
  30,
  60,
  200,
  325,
  550,
  0.625,
  [EzrealPassive, EzrealQ, EzrealW, EzrealE, EzrealR],
  [],
);

// Fiddlesticks - The Ancient Fear
const FiddlesticksPassive = new Ability(
  "A Harmless Scarecrow",
  "passive",
  "Can pretend to be effigy. Effigies spawn sweeper at level 6+",
  { cooldown: 0, cooldownType: "standard" },
  { castTime: 0, range: 0, radius: 900 },
  undefined,
  undefined,
  undefined,
  undefined,
  [
    "Stand still for 2s to become effigy",
    "Level 6+: Placing effigy spawns sweeper drone for 6s",
    "Sweeper radius: 900",
    "Exclusive trinket: Scarecrow Effigy",
  ],
);

const FiddlesticksQ = new Ability(
  "Terrify",
  "Q",
  "Launch crow dealing % current HP damage and fearing",
  {
    cooldown: [15, 14.5, 14, 13.5, 13],
    cooldownType: "standard",
  },
  {
    castTime: 0.35,
    range: 575,
  },
  {
    // Main damage is % current HP, base damage is minimum
    baseDamage: [40, 60, 80, 100, 120],
    currentHealthRatio: [4, 4.5, 5, 5.5, 6],
    currentHealthRatioPerAP: 3, // +3% per 100 AP
    damageType: "magic",
  },
  {
    ccType: "fear",
    ccDuration: 2,
    slow: 90,
  },
  undefined,
  undefined,
  [
    "Cost: 65 mana",
    "Damage: 4/4.5/5/5.5/6% (+3% per 100 AP) current HP",
    "Min damage: 40/60/80/100/120 (included in base)",
    "Monster cap: 400",
    "Passive: Out of combat 2.5s or as effigy: Next ability fears",
    "Target immunity: Equal to CD",
    "Against immune: Double damage (8-12% +6% per 100 AP, min 80-240)",
    "90% slow during fear",
  ],
);

const FiddlesticksW = new Ability(
  "Bountiful Harvest",
  "W",
  "Channel to tether and drain enemies dealing damage and healing",
  {
    cooldown: [10, 9.5, 9, 8.5, 8],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 0,
    radius: 650,
  },
  {
    baseDamage: [60, 90, 120, 150, 180],
    apRatio: 45,
    damageType: "magic",
  },
  {
    heal: [15, 22.5, 30, 37.5, 45],
  },
  undefined,
  undefined,
  [
    "Cost: 60/65/70/75/80 mana",
    "Channel: Up to 2s",
    "Damage per 0.25s tick: 60/90/120/150/180 (+45% AP)",
    "Last tick: 15/22.5/30/37.5/45 (+11.25% AP)(+12-22% missing HP)",
    "Last tick monster cap: 400",
    "Heal: 25/32.5/40/47.5/55% pre-mitigation damage",
    "Monster heal: 45%, Minion heal: 15%",
    "135% damage vs monsters, 50% vs minions",
    "Tether range: 725",
    "Full channel: 60% CDR refund",
    "Reveals targets",
  ],
);

const FiddlesticksE = new Ability(
  "Reap",
  "E",
  "Scythe slash dealing damage and slowing. Center silences",
  {
    cooldown: [10, 9, 8, 7, 6],
    cooldownType: "standard",
  },
  {
    castTime: 0.4,
    range: 850,
  },
  {
    baseDamage: [70, 105, 140, 175, 210],
    apRatio: 50,
    damageType: "magic",
  },
  {
    ccType: "slow",
    ccDuration: 1.25,
    slow: [30, 35, 40, 45, 50],
  },
  undefined,
  undefined,
  [
    "Cost: 40/45/50/55/60 mana",
    "Center: Silences for 1.25s",
    "Slow: 30/35/40/45/50% for 1.25s",
  ],
);

const FiddlesticksR = new Ability(
  "Crowstorm",
  "R",
  "Channel then blink dealing AOE damage over time",
  {
    cooldown: [140, 110, 80],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 800,
    radius: 600,
  },
  {
    baseDamage: [37.5, 62.5, 87.5],
    apRatio: 12.5,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "Channel: 1.5s",
    "Duration: 5s",
    "Damage per 0.25s tick: 37.5/62.5/87.5 (+12.5% AP)",
    "Total damage: 750/1250/1750 (+250% AP) over 5s",
  ],
);

const Fiddlesticks = new Character(
  "Fiddlesticks",
  650,
  5.5,
  34,
  30,
  55,
  200,
  335,
  480,
  0.625,
  [
    FiddlesticksPassive,
    FiddlesticksQ,
    FiddlesticksW,
    FiddlesticksE,
    FiddlesticksR,
  ],
  [],
);

// Fiora - The Grand Duelist
const FioraPassive = new Ability(
  "Duelist's Dance",
  "passive",
  "Mark enemy Vitals. Hitting deals true damage and heals",
  { cooldown: 0, cooldownType: "standard" },
  { castTime: 0, range: 0 },
  {
    baseDamage: [0],
    maxHealthRatio: 3, // 3% max HP
    maxHealthRatioPerBonusAD: 4, // +4% per 100 bonus AD
    damageType: "true",
  },
  undefined,
  undefined,
  undefined,
  [
    "Damage: 3% (+4% per 100 bonus AD) max HP true damage",
    "Heal: 35-100 (based on level)",
    "MS: 20/30/40/50% (based on R rank) for 1.85s",
    "Vital lasts 13.25s",
    "Vital becomes targetable after 1.75s",
    "Vitals: N/E/S/W directions",
  ],
  true, // On-hit damage from vital procs
);

const FioraQ = new Ability(
  "Lunge",
  "Q",
  "Dash then stab dealing physical damage and applying on-hit",
  {
    cooldown: [13, 11.25, 9.5, 7.75, 6],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 400,
  },
  {
    baseDamage: [70, 80, 90, 100, 110],
    bonusAdRatio: [90, 95, 100, 105, 110],
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 20 mana",
    "On hit: 50% CD refund",
    "Applies on-hit effects",
    "Can hit structures and wards",
    "Can cast abilities during dash",
    "Does not require vision",
  ],
);

const FioraW = new Ability(
  "Riposte",
  "W",
  "Parry all non-turret damage. Stab dealing magic damage",
  {
    cooldown: [24, 22, 20, 18, 16],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 900,
  },
  {
    baseDamage: [110, 150, 190, 230, 270],
    apRatio: 100,
    damageType: "magic",
  },
  {
    ccType: "slow",
    ccDuration: 2,
    slow: 25,
  },
  undefined,
  undefined,
  [
    "Cost: 50 mana",
    "Duration: 0.75s",
    "Width: 140",
    "Debuff immunity",
    "Slow + cripple: 25% for 2s",
    "If parried immobilize: Stun for same duration instead",
  ],
);

const FioraE = new Ability(
  "Bladework",
  "E",
  "Empower next 2 attacks with bonus range and AS. Second crits",
  {
    cooldown: [11, 10, 9, 8, 7],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 0,
  },
  undefined,
  undefined,
  undefined,
  undefined,
  [
    "Cost: 40 mana",
    "Duration: 4s",
    "+25 bonus range",
    "Bonus AS: 50/60/70/80/90%",
    "First: 30% slow for 1s, cannot crit",
    "Second: 160/170/180/190/200% crit damage",
    "Can crit structures",
    "Resets basic attack timer",
  ],
);

const FioraR = new Ability(
  "Grand Challenge",
  "R",
  "Mark all 4 Vitals. Trigger 1 or all 4 for healing zone",
  {
    cooldown: [110, 90, 70],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 500,
    radius: 550,
  },
  undefined,
  undefined,
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "Duration: 8s",
    "Passive: +10/20/30% MS from Duelist's Dance",
    "Near target: Gain Duelist's Dance MS",
    "Victory Zone: Heals 18.75/25/31.25 (+15% bonus AD) per 0.25s for 5s",
    "Trigger 1+ Vital before death or all 4: Create zone",
  ],
);

const Fiora = new Character(
  "Fiora",
  620,
  8.5,
  33,
  32,
  66,
  200,
  345,
  150,
  0.69,
  [FioraPassive, FioraQ, FioraW, FioraE, FioraR],
  [],
);

// Fizz - The Tidal Trickster
const FizzPassive = new Ability(
  "Nimble Fighter",
  "passive",
  "Ghosted. Reduce incoming damage by flat amount",
  { cooldown: 0, cooldownType: "standard" },
  { castTime: 0, range: 0 },
  undefined,
  undefined,
  undefined,
  undefined,
  [
    "Permanently ghosted",
    "Damage reduction: 4 (+1% AP) per instance",
    "Max reduction: 50%",
    "vs Monsters: 14 (+1% AP)",
  ],
);

const FizzQ = new Ability(
  "Urchin Strike",
  "Q",
  "Dash dealing magic and physical damage plus on-hit",
  {
    cooldown: [8, 7.5, 7, 6.5, 6],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 550,
  },
  {
    baseDamage: [10, 25, 40, 55, 70],
    adRatio: 100,
    apRatio: 55,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 50 mana",
    "Magic: 10/25/40/55/70 (+55% AP)",
    "Physical: 100% AD",
    "Applies on-hit effects",
    "Can cast W and R during dash",
  ],
);

const FizzW = new Ability(
  "Seastone Trident",
  "W",
  "Passive bleed on-hit. Active empowered attack with on-hit buff",
  {
    cooldown: [7, 6, 5, 4, 3],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 0,
  },
  {
    baseDamage: [50, 75, 100, 125, 150],
    apRatio: 45,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 30/40/50/60/70 mana",
    "Passive: 30/45/60/75/90 (+25% AP) magic damage over 3s",
    "Active: 50/75/100/125/150 (+45% AP) magic damage",
    "+50 bonus range",
    "Duration: 4s",
    "On kill: 1s CD and mana refund",
    "After active: 20/25/30/35/40 (+30% AP) bonus on-hit for 5s",
    "vs Structures: 50% effectiveness",
    "vs Monsters: +60 bonus damage",
    "Resets basic attack timer",
  ],
);

const FizzE = new Ability(
  "Playful / Trickster",
  "E",
  "Become untargetable on trident. Hop dealing damage and slowing",
  {
    cooldown: [16, 14, 12, 10, 8],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 400,
    radius: 375,
  },
  {
    baseDamage: [80, 130, 180, 230, 280],
    apRatio: 95,
    damageType: "magic",
  },
  {
    ccType: "slow",
    ccDuration: 2,
    slow: [40, 45, 50, 55, 60],
  },
  undefined,
  undefined,
  [
    "Cost: 75/80/85/90/95 mana",
    "Untargetable: 0.75s",
    "Can recast after 0.15s",
    "Playful: Full radius (375), applies slow",
    "Trickster: Small radius (225), no slow",
    "Hop duration: 0.5s",
  ],
);

const FizzR = new Ability(
  "Chum the Waters",
  "R",
  "Throw lure attracting shark. Damage scales with distance",
  {
    cooldown: [120, 100, 80],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 1300,
  },
  {
    baseDamage: [180, 300, 420],
    apRatio: 60,
    damageType: "magic",
  },
  {
    ccType: "knockup",
    ccDuration: 1,
    slow: [40, 60, 80],
  },
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "Delay: 2s",
    "Guppy (<455): 180/300/420 (+60% AP), 40% slow, 200 radius",
    "Chomper (455-910): 225/375/525 (+75% AP), 60% slow, 325 radius",
    "Gigalodon (>910): 270/450/630 (+90% AP), 80% slow, 450 radius",
    "Lure holder: Slowed, revealed, knocked up 1s",
    "Others: Knocked back",
    "Can be intercepted",
  ],
);

const Fizz = new Character(
  "Fizz",
  640,
  8,
  26,
  32,
  58,
  200,
  335,
  175,
  0.658,
  [FizzPassive, FizzQ, FizzW, FizzE, FizzR],
  [],
);

// Galio - The Colossus
const GalioPassive = new Ability(
  "Colossal Smash",
  "passive",
  "Empowered attack dealing AOE magic damage scaling with MR",
  { cooldown: 5, cooldownType: "static" },
  { castTime: 0, range: 0, radius: 250 },
  {
    baseDamage: [15, 115],
    adRatio: 100,
    apRatio: 40,
    bonusMRRatio: 60, // +60% bonus MR as damage
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Damage: 15-115 (+100% AD)(+40% AP)(+60% bonus MR)",
    "+40% bonus AS",
    "Hitting champion/epic monster: Reduce CD by 3s (once per cast)",
    "AD portion can crit for 200% (+30% with Infinity Edge)",
    "Uncancellable windup",
  ],
);

const GalioQ = new Ability(
  "Winds of War",
  "Q",
  "Converging windblasts creating tornado dealing % max HP damage",
  {
    cooldown: [11, 10, 9, 8, 7],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 825,
    radius: 150,
  },
  {
    // Initial: 70-210 + 70% AP
    // Tornado: 2% (+1% per 100 AP) max HP per 0.5s × 4 ticks = 8% (+4% per 100 AP) max HP
    baseDamage: [70, 105, 140, 175, 210],
    apRatio: 70,
    maxHealthRatio: 8, // 2% per 0.5s × 4 ticks (2s duration)
    maxHealthRatioPerAP: 4, // 1% per 100 AP per 0.5s × 4 ticks
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 70/75/80/85/90 mana",
    "Initial damage: 70/105/140/175/210 (+70% AP)",
    "Tornado: 2% (+1% per 100 AP) max HP per 0.5s × 4 ticks",
    "Total tornado: 8% (+4% per 100 AP) max HP",
    "Duration: 2s",
    "Monster cap: 150 per tick",
    "Width: 120",
    "Windblasts start 250 units apart",
  ],
);

const GalioW = new Ability(
  "Shield of Durand",
  "W",
  "Passive magic shield. Channel gaining DR then taunt",
  {
    cooldown: [18, 17, 16, 15, 14],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 0,
    radius: 350,
  },
  {
    baseDamage: [20, 30, 40, 50, 60],
    apRatio: 30,
    damageType: "magic",
  },
  {
    ccType: "slow",
    ccDuration: 0.5,
    slow: 15,
    shield: [7.5, 9, 10.5, 12, 13.5],
  },
  undefined,
  undefined,
  [
    "Cost: 50 mana",
    "Passive shield: 7.5/9/10.5/12/13.5% max HP (magic damage only)",
    "Shield recharge: 12/10/8s without damage",
    "Channel: Up to 2s",
    "Self slow: 15%",
    "Physical DR: 12.5-22.5% (+1.5% per 100 AP)(+4% per 100 bonus MR)(+0.5% per 100 bonus HP)",
    "Magic DR: 25-45% (+4% per 100 AP)(+8% per 100 bonus MR)(+1% per 100 bonus HP)",
    "Damage: 20-60 (+30% AP), scales 0-200% with charge",
    "Taunt: 0.5-1.5s",
    "Set MS to 60 after taunt",
    "Radius: 175-350 (based on charge)",
    "0.4s lockout after",
  ],
);

const GalioE = new Ability(
  "Justice Punch",
  "E",
  "Dash dealing damage and knocking up",
  {
    cooldown: [11, 10, 9, 8, 7],
    cooldownType: "standard",
  },
  {
    castTime: 0.4,
    range: 650,
  },
  {
    baseDamage: [90, 130, 170, 210, 250],
    apRatio: 90,
    damageType: "magic",
  },
  {
    ccType: "knockup",
    ccDuration: 0.75,
  },
  undefined,
  undefined,
  [
    "Cost: 50 mana",
    "Steps back then dashes",
    "80% damage vs non-champions",
    "Reveals for 0.75s",
    "Width: 400",
    "Stops on champion or terrain",
  ],
);

const GalioR = new Ability(
  "Hero's Entrance",
  "R",
  "Channel then leap to ally dealing AOE damage and knockback",
  {
    cooldown: [180, 160, 140],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 5500,
    radius: 650,
  },
  {
    baseDamage: [150, 250, 350],
    apRatio: 70,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "Channel: 2.75s",
    "At 1.25s: CC immune, untargetable",
    "Leap: 0.8s airborne, 0.2s dash",
    "Grants Shield of Durand passive to allies in area for 5s",
    "Knockback: 100 units over 0.75s",
    "Immobile for 0.5s after landing",
  ],
);

const Galio = new Character(
  "Galio",
  600,
  8,
  24,
  32,
  59,
  200,
  340,
  150,
  0.625,
  [GalioPassive, GalioQ, GalioW, GalioE, GalioR],
  [],
);

// Gangplank - The Saltwater Scourge
const GangplankPassive = new Ability(
  "Trial by Fire",
  "passive",
  "Empowered attack dealing true damage DOT. Grants MS",
  { cooldown: 15, cooldownType: "static" },
  { castTime: 0, range: 0 },
  {
    baseDamage: [50, 250],
    bonusAdRatio: 100,
    damageType: "true",
  },
  undefined,
  undefined,
  undefined,
  [
    "Damage: 50-250 (+100% bonus AD) true over 2.5s",
    "MS: 15-30% (based on level) for 2s",
    "Keg explosion resets CD and grants MS",
    "50% damage vs turrets",
    "Cannot apply with Q or kegs",
  ],
);

const GangplankQ = new Ability(
  "Parrrley",
  "Q",
  "Shoot dealing physical damage. Applies on-hit. Plunders on kill",
  {
    cooldown: 4.5,
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 625,
  },
  {
    baseDamage: [10, 40, 70, 100, 130],
    adRatio: 100,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 50/45/40/35/30 mana",
    "Applies on-hit as ranged attack",
    "Can crit for 200% (+30% with IE)",
    "On kill: 3/4/5/6/7 gold + 4/5/6/7/8 Silver Serpents",
    "Keg kills also plunder",
  ],
);

const GangplankW = new Ability(
  "Remove Scurvy",
  "W",
  "Cleanse all CC and heal",
  {
    cooldown: [22, 20, 18, 16, 14],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 0,
  },
  undefined,
  {
    heal: [45, 70, 95, 120, 145],
  },
  undefined,
  undefined,
  [
    "Cost: 60/70/80/90/100 mana",
    "Heal: 45/70/95/120/145 (+90% AP)(+13% missing HP)",
    "Cleanses all CC",
  ],
);

const GangplankE = new Ability(
  "Powder Keg",
  "E",
  "Place keg that explodes dealing damage and slowing. Ignores 40% armor",
  {
    cooldown: 0.5,
    cooldownType: "static",
  },
  {
    castTime: 0.25,
    range: 1000,
    radius: 360,
  },
  {
    baseDamage: [75, 95, 115, 135, 155],
    damageType: "physical",
  },
  {
    ccType: "slow",
    ccDuration: 2,
    slow: [40, 50, 60, 70, 80],
  },
  undefined,
  undefined,
  [
    "Cost: 1 charge",
    "Recharge: 17/16/15/14/13s",
    "Max charges: 3/3/4/4/5",
    "Duration: 25s",
    "Bonus champion damage: 75/95/115/135/155",
    "Ignores 40% armor",
    "Can chain to nearby kegs",
    "Keg health: 3 (loses 1 every 2/1/0.5s based on level)",
    "Triggering attack can crit",
    "Grants vision for 2s",
  ],
);

const GangplankR = new Ability(
  "Cannon Barrage",
  "R",
  "Global AOE firing 12 waves dealing magic damage and slowing",
  {
    cooldown: [160, 140, 120],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 25000,
    radius: 580,
  },
  {
    baseDamage: [40, 70, 100],
    apRatio: 10,
    damageType: "magic",
  },
  {
    ccType: "slow",
    ccDuration: 0.5,
    slow: 30,
  },
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "Duration: 8s",
    "12 waves (3 cannonballs per wave every 2s)",
    "Per wave: 40/70/100 (+10% AP)",
    "Total: 480/840/1200 (+120% AP)",
    "Slow: 30% for 0.5s",
    "Upgrades (500 Silver Serpents each):",
    "Death's Daughter: Center true damage 120/210/300 (+30% AP), 75% slow 1s",
    "Fire at Will: 18 waves (every 1.33s), total 720/1260/1800 (+180% AP)",
    "Raise Morale: 40% MS to allies",
    "Grants vision",
  ],
);

const Gangplank = new Character(
  "Gangplank",
  630,
  6,
  31,
  32,
  64,
  200,
  345,
  125,
  0.658,
  [GangplankPassive, GangplankQ, GangplankW, GangplankE, GangplankR],
  [],
);

// Garen
const GarenPassive = new Ability(
  "Perseverance",
  "passive",
  "Regenerates 1.5%-10.1% max health every 5s. Lost for 8s when damaged",
  {
    cooldown: 0,
    cooldownType: "static",
  },
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  [
    "Regen: 1.5%-10.1% max HP per 5s (based on level)",
    "Lost for 8s when damaged by champions, epic monsters, turrets, or enemy abilities",
  ],
);

const GarenQ = new Ability(
  "Decisive Strike",
  "Q",
  "Cleanse slows, gain movement speed, empower next attack for bonus damage and silence",
  {
    cooldown: 8,
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 0,
  },
  {
    baseDamage: [30, 60, 90, 120, 150],
    adRatio: 50,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cleanses all slows",
    "MS boost: 35% for 1/1.65/2.3/2.95/3.6s",
    "Empowered attack has uncancellable windup and lunges",
    "Resets basic attack timer",
  ],
);

const GarenW = new Ability(
  "Courage",
  "W",
  "Passive: Kill units to gain armor/MR. Active: Damage reduction, shield and tenacity for 0.75s",
  {
    cooldown: [22, 19.5, 17, 14.5, 12],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 0,
  },
  undefined,
  undefined,
  undefined,
  undefined,
  [
    "Passive: +0.2 armor/MR per kill, max 150 stacks (30 armor/MR)",
    "Active duration: 4s",
    "Damage reduction: 25/29/33/37/41%",
    "Shield: 65/85/105/125/145 (+18% bonus HP)",
    "60% tenacity for first 0.75s",
  ],
);

const GarenE = new Ability(
  "Judgment",
  "E",
  "Spin rapidly dealing physical damage 7+ times over 3s. 25% more damage to nearest enemy",
  {
    cooldown: [9, 8.25, 7.5, 6.75, 6],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 0,
    radius: 325,
  },
  {
    baseDamage: [4, 7, 10, 13, 16],
    adRatio: 38,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Spins: 7 + 1 per 25% bonus AS",
    "AD ratio: 38/41/44/47/50%",
    "6 hits inflict 25% armor reduction for 6s",
    "25% increased damage vs nearest enemy",
    "Can crit for 130% (+9% with IE) damage",
  ],
);

const GarenR = new Ability(
  "Demacian Justice",
  "R",
  "Deal true damage based on missing health",
  {
    cooldown: [120, 100, 80],
    cooldownType: "standard",
  },
  {
    castTime: 0.435,
    range: 400,
  },
  {
    baseDamage: [150, 250, 350],
    missingHealthRatio: [25, 30, 35], // % of target's missing HP
    damageType: "true",
  },
  undefined,
  undefined,
  undefined,
  [
    "Additional damage: 25/30/35% of target's missing health",
    "Reveals target for 1s",
  ],
);

const Garen = new Character(
  "Garen",
  690, // HP
  8, // HP5
  38, // AR
  32, // MR
  69, // AD
  200, // Crit DMG (%)
  340, // MS
  175, // Attack range
  0.625, // Base AS
  [GarenPassive, GarenQ, GarenW, GarenE, GarenR],
  [],
);

// Gnar (Mini form base stats)
const GnarPassive = new Ability(
  "Rage Gene",
  "passive",
  "Generate Rage to transform between Mini and Mega forms",
  {
    cooldown: 0,
    cooldownType: "static",
  },
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  [
    "Rage gen: 4/7/11 per 2s when in combat",
    "Mini AA vs champs: 2/3.5/5.5 Rage",
    "At 100 Rage: can transform for 4s",
    "Mega form lasts 15s",
    "15s cooldown after transforming back",
    "Mini: +0-20 MS, +225-325 range, +AS",
    "Mega: Different stats and abilities",
  ],
);

const GnarQ1 = new Ability(
  "Boomerang Throw",
  "Q",
  "Throw boomerang dealing damage and slowing. Catching it refunds 40% cooldown",
  {
    cooldown: [16, 14.5, 13, 11.5, 10],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 1125,
    radius: 110,
  },
  {
    // Initial: 5-165 + 125% AD
    // Return: 50% of initial
    // Total: 7.5-247.5 + 187.5% AD (1.5x)
    baseDamage: [8, 68, 128, 188, 248],
    adRatio: 188,
    damageType: "physical",
  },
  {
    ccType: "slow",
    ccDuration: 2,
    slow: [15, 20, 25, 30, 35],
  },
  undefined,
  undefined,
  [
    "Initial: 5/45/85/125/165 (+125% AD)",
    "Return: 50% damage",
    "Total: 7.5/67.5/127.5/187.5/247.5 (+187.5% AD)",
  ],
);

const GnarW1 = new Ability(
  "Hyper",
  "W",
  "Every 3rd attack/ability hit deals % max HP magic damage and grants movement speed",
  {
    cooldown: 0,
    cooldownType: "static",
  },
  undefined,
  {
    baseDamage: [0, 10, 20, 30, 40],
    maxHealthRatio: [6, 8, 10, 12, 14],
    apRatio: 100,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "3 stacks on same target triggers effect",
    "Stack duration: 3.5s",
    "MS boost: 20/40/60/80% (based on R rank) for 3s",
    "Cap vs monsters: 300 damage",
  ],
);

const GnarE1 = new Ability(
  "Hop",
  "E",
  "Leap gaining AS. Bounce further if land on unit, dealing damage and slowing",
  {
    cooldown: [22, 19.5, 17, 14.5, 12],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 475,
    radius: 150,
  },
  {
    baseDamage: [50, 85, 120, 155, 190],
    maxHealthRatio: 6,
    damageType: "physical",
  },
  {
    ccType: "slow",
    ccDuration: 0.5,
    slow: 80,
  },
  undefined,
  undefined,
  [
    "AS bonus: 40/45/50/55/60% for 6s",
    "Bounce distance: 500 units",
    "If used to transform: no AS, but uses Mega E effect",
  ],
);

const GnarR = new Ability(
  "GNAR!",
  "R",
  "Mini: Hyper MS bonus increased. Mega: Thrust enemies away, stun if hit terrain",
  {
    cooldown: [90, 60, 30],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 0,
    radius: 475,
  },
  {
    baseDamage: [200, 300, 400],
    bonusAdRatio: 50,
    apRatio: 100,
    damageType: "physical",
  },
  {
    ccType: "stun",
    ccDuration: 1.75,
  },
  undefined,
  undefined,
  [
    "Mini passive: Hyper MS 40/60/80%",
    "Mega: Knock away 590 units",
    "45% slow for duration if no wall",
    "Wall collision: +50% damage, stun instead of slow",
  ],
);

const Gnar = new Character(
  "Gnar",
  540, // HP
  4.5, // HP5
  32, // AR
  30, // MR
  60, // AD
  200, // Crit DMG (%)
  335, // MS
  175, // Attack range
  0.625, // Base AS
  [GnarPassive, GnarQ1, GnarW1, GnarE1, GnarR],
  [],
);

// Gragas
const GragasPassive = new Ability(
  "Happy Hour",
  "passive",
  "After casting ability, heal for 5.5% max health",
  {
    cooldown: [12, 10, 8, 6],
    cooldownType: "static",
  },
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  ["Heal: 5.5% max HP", "Cooldown: 12/10/8/6s (based on level)"],
);

const GragasQ = new Ability(
  "Barrel Roll",
  "Q",
  "Roll cask that ferments over 2s, dealing magic damage and slowing when detonated",
  {
    cooldown: [10, 9, 8, 7, 6],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 850,
    radius: 250,
  },
  {
    baseDamage: [80, 120, 160, 200, 240],
    apRatio: 80,
    damageType: "magic",
  },
  {
    ccType: "slow",
    ccDuration: 2,
    slow: [40, 45, 50, 55, 60],
  },
  undefined,
  undefined,
  [
    "Cost: 80 mana",
    "Duration: 4s",
    "Ferments over 2s: up to 150% damage and slow",
    "Max damage: 120/180/240/300/360 (+120% AP)",
    "Max slow: 60/67.5/75/82.5/90%",
    "30% reduced damage vs minions",
    "Grants vision",
  ],
);

const GragasW = new Ability(
  "Drunken Rage",
  "W",
  "Channel 0.75s for damage reduction. Empower next attack for AOE % max HP magic damage",
  {
    cooldown: 5,
    cooldownType: "standard",
  },
  {
    castTime: 0.75,
    range: 0,
    radius: 250,
  },
  {
    baseDamage: [20, 50, 80, 110, 140],
    maxHealthRatio: 7,
    maxHealthRatioPerAP: 0.5, // +0.5% max HP per 100 AP
    apRatio: 70,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 30 mana",
    "Damage: 20-140 (+70% AP) + 7% (+0.5% per 100 AP) max HP",
    "Damage reduction: 10/12/14/16/18% (+4% per 100 AP) for 2.5s",
    "Empowered attack: +50 range, uncancellable windup, lasts 5s",
    "50% damage vs structures",
    "Cap vs monsters: 300 damage",
  ],
);

const GragasE = new Ability(
  "Body Slam",
  "E",
  "Charge forward dealing magic damage, knocking back and stunning",
  {
    cooldown: [14, 13.5, 13, 12.5, 12],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 600,
    radius: 180,
  },
  {
    baseDamage: [80, 125, 170, 215, 260],
    apRatio: 60,
    damageType: "magic",
  },
  {
    ccType: "stun",
    ccDuration: 1,
  },
  undefined,
  undefined,
  [
    "Cost: 50 mana",
    "40% CDR refund if hits enemy",
    "Can cast Q and R during dash",
  ],
);

const GragasR = new Ability(
  "Explosive Cask",
  "R",
  "Hurl cask dealing magic damage and knocking enemies away from epicenter",
  {
    cooldown: [100, 85, 70],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 1000,
    radius: 400,
  },
  {
    baseDamage: [200, 300, 400],
    apRatio: 80,
    damageType: "magic",
  },
  {
    ccType: "knockup",
    ccDuration: 1,
  },
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "Travel time: 0.5s",
    "Knock distance: 900 units",
    "Grants vision for 1s",
  ],
);

const Gragas = new Character(
  "Gragas",
  640, // HP
  5.5, // HP5
  38, // AR
  32, // MR
  64, // AD
  200, // Crit DMG (%)
  330, // MS
  125, // Attack range
  0.675, // Base AS
  [GragasPassive, GragasQ, GragasW, GragasE, GragasR],
  [],
);

// Graves
const GravesPassive = new Ability(
  "New Destiny",
  "passive",
  "Uses 2-shell ammo system. Shotgun fires 4 pellets (6 on crit) in cone",
  {
    cooldown: 0,
    cooldownType: "static",
  },
  undefined,
  {
    baseDamage: [0],
    adRatio: 70,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Ammo: 2 shells, reload after expending all",
    "Pellets: 4 (6 on crit)",
    "Single target: 70-100% AD base + 23.3-33.3% per extra pellet",
    "Max single target: 139.93-199.92% AD",
    "Crit: 6 pellets, 150% (+15% IE) damage each",
    "Crit total: 199.976% (+19.998% IE)",
    "Knockback non-champions hit by 2+ pellets",
    "25% reduced damage vs structures",
  ],
);

const GravesQ = new Ability(
  "End of the Line",
  "Q",
  "Fire round dealing damage, then detonates for damage in perpendicular area and reverse wave",
  {
    cooldown: [13, 11.25, 9.5, 7.75, 6],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 800,
    radius: 250,
  },
  {
    baseDamage: [50, 75, 100, 125, 150],
    bonusAdRatio: 65,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 80 mana",
    "Initial damage: 50/75/100/125/150 (+65% bonus AD)",
    "Detonation damage: 80/125/170/215/260 (+55/70/85/100/115% bonus AD)",
    "Detonates after 2s or 0.231s on terrain hit",
    "Each enemy hit once per pass",
  ],
);

const GravesW = new Ability(
  "Smoke Screen",
  "W",
  "Fire smoke canister dealing magic damage, slowing and applying nearsight for 4s",
  {
    cooldown: [26, 24, 22, 20, 18],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 950,
    radius: 200,
  },
  {
    baseDamage: [60, 110, 160, 210, 260],
    apRatio: 60,
    damageType: "magic",
  },
  {
    ccType: "slow",
    ccDuration: 0.5,
    slow: 50,
  },
  undefined,
  undefined,
  [
    "Cost: 70/75/80/85/90 mana",
    "Nearsight duration: 4s",
    "Vision reduction: 250 radius",
  ],
);

const GravesE = new Ability(
  "Quickdraw",
  "E",
  "Dash reloading 1 shell and gain True Grit stack (armor/MR). 8 stacks max",
  {
    cooldown: [16, 15, 14, 13, 12],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 275,
  },
  undefined,
  undefined,
  undefined,
  undefined,
  [
    "Cost: 40 mana",
    "Reload: 1 shell",
    "True Grit: 4/7/10/13/16 armor per stack (50% as MR)",
    "Max 8 stacks for 4s",
    "2 stacks if dash towards enemy champ",
    "0.5s CDR per pellet hit",
    "Resets basic attack timer",
  ],
);

const GravesR = new Ability(
  "Collateral Damage",
  "R",
  "Fire explosive shell dealing damage, then explodes in cone for reduced damage",
  {
    cooldown: [100, 80, 60],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 1100,
    radius: 400,
  },
  {
    baseDamage: [275, 425, 575],
    bonusAdRatio: 150,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "Recoil: 400 units opposite direction",
    "Explosion damage: 200/320/440 (+120% bonus AD)",
    "Explosion cone: 60° angle, 740 radius",
  ],
);

const Graves = new Character(
  "Graves",
  625, // HP
  8, // HP5
  33, // AR
  30, // MR
  66, // AD
  200, // Crit DMG (%)
  340, // MS
  425, // Attack range
  0.475, // Base AS
  [GravesPassive, GravesQ, GravesW, GravesE, GravesR],
  [],
);

// Gwen
const GwenPassive = new Ability(
  "A Thousand Cuts",
  "passive",
  "Attacks, center of Q, and R deal 1% (+0.6% per 100 AP) max HP magic damage",
  {
    cooldown: 0,
    cooldownType: "static",
  },
  undefined,
  {
    baseDamage: [0],
    maxHealthRatio: 1,
    maxHealthRatioPerAP: 0.6,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Heals 50% of post-mitigation damage vs champs",
    "Heal cap: 10-25 (+6.5% AP) per instance",
    "Bonus vs low HP minions: 8-30",
    "Cap vs monsters: 5 (+10% AP)",
  ],
  true,
);

const GwenQ = new Ability(
  "Snip Snip!",
  "Q",
  "Snip 2-6 times (based on Snippy stacks) dealing magic damage, final snip deals more. Center is true damage",
  {
    cooldown: [6.5, 5.75, 5, 4.25, 3.5],
    cooldownType: "standard",
  },
  {
    castTime: 0.5,
    range: 465,
    radius: 360,
  },
  {
    // Max damage (6 snips): 5 regular + 1 final = 5*(10-30 + 5%AP) + (60-160 + 35%AP)
    // = 110/160/210/260/310 (+60% AP)
    // Center also applies passive per snip: 6 * (1% + 0.6% per 100 AP) max HP
    baseDamage: [110, 160, 210, 260, 310],
    apRatio: 60,
    maxHealthRatio: 6, // 6 snips * 1% max HP from passive
    maxHealthRatioPerAP: 3.6, // 6 snips * 0.6% per 100 AP
    damageType: "magic",
  },
  undefined,
  undefined, // damage already totaled for all 6 snips
  undefined,
  [
    "Cost: 40 mana",
    "Passive: AA generates Snippy stack (max 4, lasts 6s)",
    "Final snip: 60/85/110/135/160 (+35% AP)",
    "Min damage (2 snips): 70/100/130/160/190 (+40% AP)",
    "Max damage (6 snips): 110/160/210/260/310 (+60% AP)",
    "Center: 50% true damage (not modeled)",
    "75% damage vs minions, execute below 20% HP",
  ],
);

const GwenW = new Ability(
  "Hallowed Mist",
  "W",
  "Summon mist for 4s granting resistances and untargetability from outside",
  {
    cooldown: [22, 21, 20, 19, 18],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 0,
    radius: 480,
  },
  undefined,
  undefined,
  undefined,
  undefined,
  [
    "Cost: 60 mana",
    "Duration: 4s",
    "Bonus resistances: 22/24/26/28/30 (+7% AP)",
    "Untargetable from outside (except turrets/monsters)",
    "Can recast to move mist to current location",
    "Ghosted while inside",
  ],
);

const GwenE = new Ability(
  "Skip 'n Slash",
  "E",
  "Dash gaining bonus AS, on-hit magic damage, and range for 4s",
  {
    cooldown: [13, 12.5, 12, 11.5, 11],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 350,
  },
  // E itself does no direct damage - it grants an on-hit buff
  // The on-hit (15 + 20% AP) is modeled via appliesOnHit below
  {
    baseDamage: [15],
    apRatio: 20,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 35 mana",
    "AS bonus: 20/35/50/65/80% for 4s",
    "On-hit: 15 (+20% AP)",
    "Bonus range: +75",
    "First AA refunds: 25/35/45/55/65% CDR",
    "Resets basic attack timer",
    "Can cast during other abilities",
  ],
  true, // E grants on-hit damage for 4s - model as permanent on-hit for DPS
);

const GwenR = new Ability(
  "Needlework",
  "R",
  "Launch 1/3/5 needles dealing magic damage and slowing. 3 casts within 8s",
  {
    cooldown: [120, 100, 80],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 1350,
    radius: 240,
  },
  {
    // Total: 9 needles (1+3+5) × (35/65/95 + 10% AP) = 315/585/855 (+90% AP)
    // Plus passive per needle: 9 × (1% + 0.6% per 100 AP) max HP
    baseDamage: [315, 585, 855],
    apRatio: 90,
    maxHealthRatio: 9, // 9 needles × 1% max HP
    maxHealthRatioPerAP: 5.4, // 9 needles × 0.6% per 100 AP
    damageType: "magic",
  },
  {
    ccType: "slow",
    ccDuration: 1.5,
    slow: [30, 45, 60],
  },
  undefined, // damage already totaled for all 9 needles
  undefined,
  [
    "Cost: 100 mana",
    "3 casts (1s between), 9 needles total (1+3+5)",
    "Per needle: 35/65/95 (+10% AP) + passive",
    "Total: 315/585/855 (+90% AP) + 9% (+5.4% per 100 AP) max HP",
    "Slow: 30/45/60% (1st hit), 15/20/25% (additional hits per target)",
    "Includes passive damage: +3% (+1.8% per 100 AP) max HP",
  ],
);

const Gwen = new Character(
  "Gwen",
  620, // HP
  9, // HP5
  39, // AR
  32, // MR
  63, // AD
  200, // Crit DMG (%)
  340, // MS
  150, // Attack range
  0.69, // Base AS
  [GwenPassive, GwenQ, GwenW, GwenE, GwenR],
  [],
);

// Hecarim
const HecarimPassive = new Ability(
  "Warpath",
  "passive",
  "Gain bonus AD equal to 12%-24% of bonus movement speed",
  {
    cooldown: 0,
    cooldownType: "static",
  },
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  ["Bonus AD: 12-24% of bonus MS (based on level)"],
);

const HecarimQ = new Ability(
  "Rampage",
  "Q",
  "Cleave dealing physical damage. Stacks up to 3 times for increased damage and reduced CD",
  {
    cooldown: [4, 3.25, 2.5, 1.75],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 0,
    radius: 375,
  },
  {
    baseDamage: [60, 85, 110, 135, 160],
    bonusAdRatio: 90,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 28/26/24/22/20 mana",
    "Each stack: +3% (+4% per 100 bonus AD) damage, -0.75s CD",
    "Max 3 stacks for 8s",
    "Max bonus: +9% (+12% per 100 bonus AD), -2.25s CD",
    "60% damage vs minions",
  ],
);

const HecarimW = new Ability(
  "Spirit of Dread",
  "W",
  "Aura for 4s dealing magic damage per second. Heal for damage dealt in area",
  {
    cooldown: 14,
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 0,
    radius: 525,
  },
  {
    baseDamage: [20, 30, 40, 50, 60],
    apRatio: 20,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 50/55/60/65/70 mana",
    "Duration: 4s",
    "Bonus resistances: 5/10/15/20/25",
    "Heal: 25% of damage dealt (12.5% from allies)",
    "Heal cap vs minions/monsters: 120/150/180/210/240",
  ],
);

const HecarimE = new Ability(
  "Devastating Charge",
  "E",
  "Gain ramping MS for 4s. Next attack dashes, deals bonus damage and knocks back based on distance",
  {
    cooldown: [20, 19, 18, 17, 16],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 0,
  },
  {
    baseDamage: [30, 45, 60, 75, 90],
    bonusAdRatio: 50,
    damageType: "physical",
  },
  {
    ccType: "stun",
    ccDuration: 0.25,
  },
  undefined,
  undefined,
  [
    "Cost: 60 mana",
    "MS bonus: 25-65% over 4s",
    "Bonus damage: 0-100% based on distance",
    "Knockback: 150-350 units",
    "Bonus range: 50-250",
    "Can crit for 100% (+30% IE) bonus AD",
    "Resets basic attack timer",
    "Can cast abilities during dash",
  ],
);

const HecarimR = new Ability(
  "Onslaught of Shadows",
  "R",
  "Dash with 5 spectral riders dealing magic damage and fearing enemies",
  {
    cooldown: [140, 120, 100],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 1000,
    radius: 315,
  },
  {
    baseDamage: [150, 250, 350],
    apRatio: 100,
    damageType: "magic",
  },
  {
    ccType: "fear",
    ccDuration: 0.75,
  },
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "Fear duration: 0.75-1.5s (based on distance)",
    "Slow: 0-99% (based on distance from Hecarim)",
    "Displacement immune during dash",
    "Reveals for 2.5s",
  ],
);

const Hecarim = new Character(
  "Hecarim",
  625, // HP
  7, // HP5
  32, // AR
  32, // MR
  66, // AD
  200, // Crit DMG (%)
  345, // MS
  175, // Attack range
  0.67, // Base AS
  [HecarimPassive, HecarimQ, HecarimW, HecarimE, HecarimR],
  [],
);

// Heimerdinger
const HeimerdingerPassive = new Ability(
  "Hextech Affinity",
  "passive",
  "Gain 20% MS near allied turret or own deployed turrets",
  {
    cooldown: 0,
    cooldownType: "static",
  },
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  ["20% MS within 300 units of turrets"],
);

const HeimerdingerQ = new Ability(
  "H-28G Evolution Turret",
  "Q",
  "Deploy turret that lasts until destroyed. Max 3 turrets, stores 3 charges",
  {
    cooldown: 1,
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 350,
  },
  undefined,
  undefined,
  undefined,
  undefined,
  [
    "Cost: 20 mana + 1 kit",
    "Recharge: 20s",
    "Max 3 turrets",
    "Max 3 charges",
    "Deploying beyond max destroys oldest",
    "Turret stats scale with level/AP",
    "Can be upgraded with R",
  ],
);

const HeimerdingerW = new Ability(
  "Hextech Micro-Rockets",
  "W",
  "Launch 5 rockets dealing magic damage. Grants turrets beam charge if hits champions",
  {
    cooldown: [11, 10, 9, 8, 7],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 1150,
  },
  {
    baseDamage: [40, 65, 90, 115, 140],
    apRatio: 55,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 50/60/70/80/90 mana",
    "5 rockets converge on location",
    "First hit: 40/65/90/115/140 (+55% AP)",
    "Additional hits: 10/15/20/25/30 (+12% AP)",
    "Each rocket on champion: 20% beam charge to turrets",
    "Max 100% charge (5 rockets)",
  ],
);

const HeimerdingerE = new Ability(
  "CH-2 Electron Storm Grenade",
  "E",
  "Hurl grenade dealing magic damage and slowing. Center stuns. Grants turrets beam charge",
  {
    cooldown: 11,
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 925,
    radius: 250,
  },
  {
    baseDamage: [60, 100, 140, 180, 220],
    apRatio: 60,
    damageType: "magic",
  },
  {
    ccType: "slow",
    ccDuration: 2,
    slow: 35,
  },
  undefined,
  undefined,
  [
    "Cost: 85 mana",
    "Outer radius: 250",
    "Center stun: 1.5s (100 radius)",
    "Hit champion: turrets gain 100% beam charge",
  ],
);

const HeimerdingerR = new Ability(
  "UPGRADE!!!",
  "R",
  "Empower next basic ability. Q: Apex turret. W: 4 waves of 5 rockets. E: Bouncing grenade",
  {
    cooldown: [100, 85, 70],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 0,
  },
  undefined,
  undefined,
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "Empowers next Q/W/E",
    "No mana cost for empowered ability",
    "R-Q: Apex turret 8s duration",
    "R-W: 4 waves (20 rockets), first 135/180/225 (+45% AP), next 4: 32/45/58 (+12% AP)",
    "R-E: Bounces 3 times, 100/200/300 (+60% AP) per bounce, champions hit once",
  ],
);

const Heimerdinger = new Character(
  "Heimerdinger",
  558, // HP
  7, // HP5
  19, // AR
  30, // MR
  56, // AD
  200, // Crit DMG (%)
  340, // MS
  550, // Attack range
  0.658, // Base AS
  [
    HeimerdingerPassive,
    HeimerdingerQ,
    HeimerdingerW,
    HeimerdingerE,
    HeimerdingerR,
  ],
  [],
);

// Hwei
const HweiPassive = new Ability(
  "Signature of the Visionary",
  "passive",
  "Damaging abilities mark enemies. Second damaging ability triggers explosion dealing 35-230 (+35% AP) magic damage",
  {
    cooldown: 0,
    cooldownType: "static",
  },
  undefined,
  {
    baseDamage: [35],
    apRatio: 35,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Mark duration: 4s",
    "Explosion damage: 35-230 (+35% AP) based on level",
    "Explosion radius: 285",
    "Delay: 0.85s",
  ],
);

const HweiQ = new Ability(
  "Subject: Disaster",
  "Q",
  "QQ: Fireball dealing magic + % max HP. QW: Lightning bolt. QE: Volcanic fissure path",
  {
    cooldown: [10, 9, 8, 7, 6],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 800,
    radius: 175,
  },
  {
    baseDamage: [50, 80, 110, 140, 170],
    apRatio: 70,
    maxHealthRatio: [3, 4, 5, 6, 7],
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 80/90/100/110/120 mana",
    "QQ: Fireball 50/80/110/140/170 (+70% AP)(+3/4/5/6/7% max HP)",
    "QW: Lightning 60/85/110/135/160 (+25% AP), +200/237.5/275/312.5/350% on single/immobilized by missing HP",
    "QE: 7 explosions 20/35/50/65/80 (+30% AP), lava ticks 5/8.75/12.5/16.25/20 (+6% AP), 30% slow",
  ],
);

const HweiW = new Ability(
  "Subject: Serenity",
  "W",
  "WQ: MS path. WW: Shield pool. WE: Empowered attacks/abilities for damage + mana",
  {
    cooldown: [18, 17.5, 17, 16.5, 16],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 1200,
  },
  {
    baseDamage: [20, 30, 40, 50, 60],
    apRatio: 15,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 90/95/100/105/110 mana",
    "WQ: MS path 30/32.5/35/37.5/40% (+3% per 100 AP) for 4/4.5/5/5.5/6s",
    "WW: Shield 50/62.5/75/87.5/100 (+30% AP) +8.33/10.42/12.5/14.58/16.67 (+5% AP) per tick",
    "WE: 3 charges, 20/30/40/50/60 (+15% AP) + 45/50/55/60/65 mana",
  ],
);

const HweiE = new Ability(
  "Subject: Torment",
  "E",
  "EQ: Fear projectile. EW: Seeking eye root. EE: Pulling jaw",
  {
    cooldown: [13, 12.5, 12, 11.5, 11],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 1100,
    radius: 350,
  },
  {
    baseDamage: [70, 110, 150, 190, 230],
    apRatio: 65,
    damageType: "magic",
  },
  {
    ccType: "fear",
    ccDuration: 1.5,
  },
  undefined,
  undefined,
  [
    "Cost: 50/55/60/65/70 mana",
    "EQ: Fear 1/1.125/1.25/1.375/1.5s + 60% slow",
    "EW: Root 1.2/1.4/1.6/1.8/2s + reveal 2.5s",
    "EE: Pull to center, 40/47.5/55/62.5/70% slow decay 1.25s",
    "All deal 70/110/150/190/230 (+65% AP)",
  ],
);

const HweiR = new Ability(
  "Spiraling Despair",
  "R",
  "Launch despair afflicting target with growing aura. Damage per tick and 10% slow per stack (max 12). Explodes after 3s",
  {
    cooldown: [140, 115, 80],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 1340,
    radius: 500,
  },
  {
    baseDamage: [200, 325, 450],
    apRatio: 80,
    damageType: "magic",
  },
  {
    ccType: "slow",
    ccDuration: 3,
    slow: 120,
  },
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "Duration: 3s",
    "Tick damage: 2.5/5/7.5 (+1.25% AP) every 0.25s",
    "10% slow per stack (max 12 = 120%)",
    "Final explosion: 200/325/450 (+80% AP)",
    "Can only cast when not in mood",
  ],
);

const Hwei = new Character(
  "Hwei",
  580, // HP
  5.5, // HP5
  21, // AR
  30, // MR
  54, // AD
  200, // Crit DMG (%)
  330, // MS
  550, // Attack range
  0.69, // Base AS
  [HweiPassive, HweiQ, HweiW, HweiE, HweiR],
  [],
);

// Illaoi
const IllaoiPassive = new Ability(
  "Prophet of an Elder God",
  "passive",
  "Periodically spawn tentacles on terrain. Tentacles attack dealing physical damage and healing",
  {
    cooldown: [18],
    cooldownType: "static",
  },
  undefined,
  {
    baseDamage: [9],
    adRatio: 110,
    apRatio: 40,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Spawn cooldown: 18-7s (based on level)",
    "Tentacle damage: 9-162 (+110% AD)(+40% AP)",
    "Increased by 0-30% based on Q rank",
    "Each slam on same target in 0.66s: 50% reduced (max 75%)",
    "Heal: 5% missing HP if hits champion",
  ],
);

const IllaoiQ = new Ability(
  "Tentacle Smash",
  "Q",
  "Passive: Increase tentacle damage. Active: Slam tentacle in direction",
  {
    cooldown: [10, 9, 8, 7, 6],
    cooldownType: "standard",
  },
  {
    castTime: 0.75,
    range: 802,
    radius: 200,
  },
  undefined,
  undefined,
  undefined,
  undefined,
  ["Cost: 40/45/50/55/60 mana", "Passive: +10/15/20/25/30% tentacle damage"],
);

const IllaoiW = new Ability(
  "Harsh Lesson",
  "W",
  "Empower next attack for % max HP damage and command tentacles to attack target",
  {
    cooldown: 4,
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 0,
  },
  {
    baseDamage: [20, 30, 40, 50, 60],
    maxHealthRatio: [3, 3.5, 4, 4.5, 5],
    maxHealthRatioPerAD: 3.5, // +3.5% max HP per 100 AD
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 30 mana",
    "Bonus range: +225",
    "% HP damage: 3/3.5/4/4.5/5% (+3.5% per 100 AD)",
    "Min damage: 20/30/40/50/60 (included in base)",
    "Cap vs non-champions: 300",
    "Resets basic attack timer",
  ],
);

const IllaoiE = new Ability(
  "Test of Spirit",
  "E",
  "Pull champion's spirit. Damage to spirit transfers to champion. Killing/breaking tether makes Vessel",
  {
    cooldown: [16, 15, 14, 13, 12],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 950,
  },
  undefined,
  {
    ccType: "slow",
    ccDuration: 1.5,
    slow: 80,
  },
  undefined,
  undefined,
  [
    "Cost: 35/40/45/50/55 mana",
    "Tether duration: 7s",
    "Tether range: 1500",
    "Damage transfer: 25/30/35/40/45% (+8% per 100 AD)",
    "Vessel duration: 4s",
    "Vessel: Tentacles attack every 4.5/4/3.5s (based on level)",
    "Vessel spawns tentacles nearby",
  ],
);

const IllaoiR = new Ability(
  "Leap of Faith",
  "R",
  "Slam idol dealing damage. Summon tentacle for each champion hit. W cooldown halved, tentacles untargetable",
  {
    cooldown: [120, 95, 70],
    cooldownType: "standard",
  },
  {
    castTime: 0.5,
    range: 0,
    radius: 500,
  },
  {
    baseDamage: [150, 250, 350],
    bonusAdRatio: 50,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "Max 6 tentacles",
    "Duration: 8s",
    "W cooldown: 50% reduced",
    "Tentacles: Untargetable, no hitboxes, attack in 0.5s with 0.5s lockout",
  ],
);

const Illaoi = new Character(
  "Illaoi",
  656, // HP
  9.5, // HP5
  35, // AR
  32, // MR
  65, // AD
  200, // Crit DMG (%)
  350, // MS
  125, // Attack range
  0.625, // Base AS
  [IllaoiPassive, IllaoiQ, IllaoiW, IllaoiE, IllaoiR],
  [],
);

// Irelia
const IreliaPassive = new Ability(
  "Ionian Fervor",
  "passive",
  "Abilities and attacks grant stacks; at max stacks, attacks deal bonus on-hit magic damage.",
  { cooldown: 0, cooldownType: "standard" },
  { castTime: 0, range: 200 },
  {
    baseDamage: [7, 67],
    apRatio: 20,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  undefined,
  true,
);

const IreliaQ = new Ability(
  "Bladesurge",
  "Q",
  "Dashes to target, dealing physical damage. Resets cooldown on kill.",
  { cooldown: [10, 9, 8, 7, 6], cooldownType: "standard" },
  { castTime: 0, range: 600 },
  {
    baseDamage: [20, 100],
    adRatio: 70,
    apRatio: 50,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  ["Resets on kill", "Heals 17-27 (+12% bonus AD)"],
);

const IreliaW = new Ability(
  "Defiant Dance",
  "W",
  "Charges then slashes, dealing magic damage. Reduces physical damage while charging.",
  { cooldown: [20, 18, 16, 14, 12], cooldownType: "standard" },
  { castTime: 0.75, range: 825 },
  {
    baseDamage: [30, 170],
    apRatio: 80,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  ["40-80% physical damage reduction while charging"],
);

const IreliaE = new Ability(
  "Flawless Duet",
  "E",
  "Places two blades; if they cross, roots and deals magic damage.",
  { cooldown: [16, 15, 14, 13, 12], cooldownType: "standard" },
  { castTime: 0.25, range: 850 },
  {
    baseDamage: [80, 280],
    apRatio: 80,
    damageType: "magic",
  },
  {
    ccType: "root",
    ccDuration: 1,
  },
  2,
  undefined,
  ["2 casts to place blades"],
);

const IreliaR = new Ability(
  "Vanguard's Edge",
  "R",
  "Throws blades in a line, marking champions and dealing magic damage.",
  { cooldown: [125, 105, 85], cooldownType: "standard" },
  { castTime: 0.4, range: 1000, width: 160 },
  {
    baseDamage: [125, 225, 325],
    apRatio: 70,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  ["Disarming wall after impact", "Mark: + magic damage on Q"],
);

const Irelia = new Character(
  "Irelia",
  630, // HP
  3.5, // HP5
  36, // AR
  30, // MR
  65, // AD
  200, // Crit DMG (%)
  335, // MS
  200, // Attack range
  0.656, // Base AS
  [IreliaPassive, IreliaQ, IreliaW, IreliaE, IreliaR],
  [],
);

// Ivern
const IvernPassive = new Ability(
  "Friend of the Forest",
  "passive",
  "Cannot attack non-epic monsters; gains bonus gold and marks camps for allies.",
  { cooldown: 0, cooldownType: "standard" },
  undefined,
  undefined,
  undefined,
);

const IvernQ = new Ability(
  "Rootcaller",
  "Q",
  "Fires a root that deals magic damage and roots.",
  { cooldown: [14, 13, 12, 11, 10], cooldownType: "standard" },
  { castTime: 0.25, range: 1125 },
  {
    baseDamage: [80, 180],
    apRatio: 70,
    damageType: "magic",
  },
  {
    ccType: "root",
    ccDuration: 1.5,
  },
);

const IvernW = new Ability(
  "Brushmaker",
  "W",
  "Creates brush and grants bonus attack range to Ivern and allies inside.",
  { cooldown: [0.5], cooldownType: "standard" },
  { castTime: 0, range: 1150 },
  undefined,
  undefined,
  undefined,
  undefined,
  ["Creates brush; +50-150 attack range in brush"],
);

const IvernE = new Ability(
  "Triggerseed",
  "E",
  "Shields an ally; detonates after delay to slow and deal magic damage.",
  { cooldown: [11, 10, 9, 8, 7], cooldownType: "standard" },
  { castTime: 0.25, range: 750 },
  {
    baseDamage: [80, 180],
    apRatio: 70,
    damageType: "magic",
  },
  {
    shield: [80, 230],
    ccType: "slow",
    slow: 40,
    duration: 2,
  },
);

const IvernR = new Ability(
  "Daisy!",
  "R",
  "Summons Daisy to attack and knock up enemies.",
  { cooldown: [140, 130, 120], cooldownType: "standard" },
  { castTime: 0.5, range: 600 },
  {
    baseDamage: [150, 250, 350],
    apRatio: 50,
    damageType: "magic",
  },
  {
    ccType: "knockup",
    ccDuration: 1,
  },
  undefined,
  undefined,
  ["Daisy AA: 50-150 (+30% AP) magic per hit"],
);

const Ivern = new Character(
  "Ivern",
  630, // HP
  7, // HP5
  27, // AR
  30, // MR
  50, // AD
  200, // Crit DMG (%)
  330, // MS
  475, // Attack range
  0.644, // Base AS
  [IvernPassive, IvernQ, IvernW, IvernE, IvernR],
  [],
);

// Janna
const JannaPassive = new Ability(
  "Tailwind",
  "passive",
  "Grants bonus movement speed to nearby allies. Basic attacks and W deal bonus magic damage based on bonus movement speed",
  {
    cooldown: [0],
    cooldownType: "static",
  },
  undefined,
  {
    baseDamage: [0],
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Bonus MS: 6/7/8/9/10% (+2% per 100 AP)",
    "Bonus damage: 30% bonus MS (scaling with level)",
    "Affects basic attacks and Zephyr",
  ],
);

const JannaQ = new Ability(
  "Howling Gale",
  "Q",
  "Summons a tornado that charges, increasing range and damage. Knocks up enemies",
  {
    cooldown: [16, 15, 14, 13, 12],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 1760,
    radius: 120,
  },
  {
    baseDamage: [55, 90, 125, 160, 195],
    apRatio: 50,
    damageType: "magic",
  },
  {
    ccType: "knockup",
    ccDuration: 1.25,
  },
  undefined,
  undefined,
  [
    "Cost: 70/75/80/85/90 mana",
    "Charge time: up to 3s",
    "Min damage: 55-195 (+50% AP)",
    "Max damage: 85-285 (+80% AP)",
    "+10/15/20/25/30 (+10% AP) per second charged",
    "Knockup: 0.5-1.25s based on charge",
  ],
);

const JannaW = new Ability(
  "Zephyr",
  "W",
  "Passive: Grants movement speed and ghosting. Active: Deals magic damage and slows",
  {
    cooldown: [8, 7.5, 7, 6.5, 6],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 550,
  },
  {
    baseDamage: [55, 85, 115, 145, 175],
    apRatio: 50,
    damageType: "magic",
  },
  {
    ccType: "slow",
    ccDuration: 2,
    slow: [20, 24, 28, 32, 36],
  },
  undefined,
  undefined,
  [
    "Cost: 50/55/60/65/70 mana",
    "Passive MS: 6/7/8/9/10% (+2% per 100 AP)",
    "Also applies passive bonus damage (30% bonus MS)",
    "Slow: 20/24/28/32/36% (+6% per 100 AP)",
  ],
);

const JannaE = new Ability(
  "Eye of the Storm",
  "E",
  "Shields an ally, granting bonus AD while shield holds",
  {
    cooldown: [16, 15, 14, 13, 12],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 800,
  },
  undefined,
  {
    shield: [80, 120, 160, 200, 240],
    bonusStats: {
      ad: [10, 15, 20, 25, 30],
    },
  },
  undefined,
  undefined,
  [
    "Cost: 70/80/90/100/110 mana",
    "Shield: 80/120/160/200/240 (+55% AP)",
    "Bonus AD: 10/15/20/25/30 (+10% AP)",
    "Duration: 4s",
    "CD refund: 20% when CC'ing enemy champions",
  ],
);

const JannaR = new Ability(
  "Monsoon",
  "R",
  "Knocks back nearby enemies and channels to heal allies",
  {
    cooldown: [130, 115, 100],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 0,
    radius: 725,
  },
  undefined,
  {
    ccType: "knockup", // knockback not in type, using knockup as closest
    ccDuration: 0.5,
    heal: [300, 450, 600],
  },
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "Channel: up to 3s",
    "Heal per tick: 22.5/36.25/50 (+11.25% AP) per 0.25s",
    "Total heal: 300/450/600 (+150% AP)",
    "Knockback on cast",
  ],
);

const Janna = new Character(
  "Janna",
  570, // HP
  5.5, // HP5
  28, // AR
  30, // MR
  47, // AD
  200, // Crit DMG (%)
  325, // MS
  550, // Attack range
  0.625, // Base AS
  [JannaPassive, JannaQ, JannaW, JannaE, JannaR],
  [],
);

// Jarvan IV
const JarvanIVPassive = new Ability(
  "Martial Cadence",
  "passive",
  "Basic attacks deal bonus physical damage equal to target's current health %",
  {
    cooldown: [6],
    cooldownType: "static",
  },
  undefined,
  {
    baseDamage: [20],
    currentHealthRatio: 8,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Damage: 8% target current HP",
    "Min damage: 20",
    "Max vs non-champions: 400",
    "Per-target cooldown: 6/5/4/3s (based on level)",
  ],
);

const JarvanIVQ = new Ability(
  "Dragon Strike",
  "Q",
  "Extends lance dealing damage and reducing armor. Combos with E for knockup dash",
  {
    cooldown: [10, 9, 8, 7, 6],
    cooldownType: "standard",
  },
  {
    castTime: 0.4,
    range: 770,
    radius: 70,
  },
  {
    baseDamage: [90, 130, 170, 210, 250],
    bonusAdRatio: 145,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 45/50/55/60/65 mana",
    "Armor shred: 10/14/18/22/26% for 3s",
    "E-Q combo: Dash to flag, knockup 0.75s",
  ],
);

const JarvanIVW = new Ability(
  "Golden Aegis",
  "W",
  "Gains a shield and slows nearby enemies. Shield scales with enemies hit",
  {
    cooldown: [9],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 0,
    radius: 625,
  },
  undefined,
  {
    ccType: "slow",
    ccDuration: 2,
    slow: [15, 20, 25, 30, 35],
    shield: [60, 80, 100, 120, 140],
  },
  undefined,
  undefined,
  [
    "Cost: 30 mana",
    "Shield: 60/80/100/120/140 (+70% bonus AD)",
    "+1.3% max HP per champion hit",
    "Duration: 4s",
  ],
);

const JarvanIVE = new Ability(
  "Demacian Standard",
  "E",
  "Plants a flag dealing magic damage and providing attack speed aura",
  {
    cooldown: [12, 11.5, 11, 10.5, 10],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 860,
    radius: 175,
  },
  {
    baseDamage: [80, 120, 160, 200, 240],
    apRatio: 80,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 55 mana",
    "Passive AS bonus: 20/22.5/25/27.5/30%",
    "Flag duration: 8s",
    "Provides vision",
  ],
);

const JarvanIVR = new Ability(
  "Cataclysm",
  "R",
  "Leaps to enemy champion, dealing damage and creating impassable terrain",
  {
    cooldown: [120, 105, 90],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 650,
    radius: 325,
  },
  {
    baseDamage: [200, 325, 450],
    bonusAdRatio: 180,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "Terrain duration: 3.5s",
    "Can recast after 0.75s to destroy terrain",
    "Displacement immunity during dash",
  ],
);

const JarvanIV = new Character(
  "Jarvan IV",
  640, // HP
  8, // HP5
  36, // AR
  32, // MR
  64, // AD
  200, // Crit DMG (%)
  340, // MS
  175, // Attack range
  0.658, // Base AS
  [JarvanIVPassive, JarvanIVQ, JarvanIVW, JarvanIVE, JarvanIVR],
  [],
);

// Jax
const JaxPassive = new Ability(
  "Relentless Assault",
  "passive",
  "Basic attacks generate attack speed stacks, up to 8 stacks",
  {
    cooldown: [0],
    cooldownType: "static",
  },
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  [
    "Stack duration: 2.5s",
    "AS per stack: 5-14% (based on level)",
    "Max AS bonus: 40-112% (at 8 stacks)",
    "River fishing: 1% chance for 1 gold/AP, 5% for rare fish (10 gold/AP)",
  ],
);

const JaxQ = new Ability(
  "Leap Strike",
  "Q",
  "Leaps to target unit. If enemy and in range, deals physical damage",
  {
    cooldown: [8, 7.5, 7, 6.5, 6],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 700,
  },
  {
    baseDamage: [65, 105, 145, 185, 225],
    bonusAdRatio: 100,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  ["Cost: 65 mana", "Can target allies/wards", "Applies W if active"],
);

const JaxW = new Ability(
  "Empower",
  "W",
  "Empowers next basic attack or Leap Strike to deal bonus magic damage",
  {
    cooldown: [7, 6, 5, 4, 3],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 0,
  },
  {
    baseDamage: [50, 85, 120, 155, 190],
    apRatio: 60,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 30 mana",
    "Reduced to 50% vs structures",
    "Grants +50 bonus range on basic attacks",
    "Resets auto attack timer",
  ],
);

const JaxE = new Ability(
  "Counter Strike",
  "E",
  "Dodges attacks and takes reduced AoE damage. Recast to stun and deal damage",
  {
    cooldown: [17, 15, 13, 11, 9],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 0,
    radius: 300,
  },
  {
    baseDamage: [40, 70, 100, 130, 160],
    apRatio: 70,
    maxHealthRatio: 3.5,
    damageType: "magic",
  },
  {
    ccType: "stun",
    ccDuration: 1,
  },
  undefined,
  undefined,
  [
    "Cost: 50/60/70/80/90 mana",
    "Evasion duration: 2s",
    "AoE damage reduction: 25%",
    "Min damage: 40-160 (+70% AP)(+3.5% max HP)",
    "Max damage: 80-320 (+140% AP)(+7% max HP)",
    "+20% damage per attack dodged (max 100%)",
  ],
);

const JaxR = new Ability(
  "Grandmaster-at-Arms",
  "R",
  "Passive: Every 2nd attack deals bonus magic damage. Active: Gain armor and MR",
  {
    cooldown: [110, 100, 90],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 0,
    radius: 300,
  },
  {
    baseDamage: [100, 175, 250],
    apRatio: 100,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "Passive on-hit: 75/130/185 (+60% AP) every 2nd hit",
    "Active swing damage: 100/175/250 (+100% AP)",
    "Bonus Armor: 45/60/75 (+40% bonus AD) +20/25/30 per nearby champion",
    "Bonus MR: 60% of armor gained",
    "Duration: 8s",
  ],
);

const Jax = new Character(
  "Jax",
  650, // HP
  8.5, // HP5
  36, // AR
  32, // MR
  68, // AD
  200, // Crit DMG (%)
  350, // MS
  125, // Attack range
  0.638, // Base AS
  [JaxPassive, JaxQ, JaxW, JaxE, JaxR],
  [],
);

// Jayce
const JaycePassive = new Ability(
  "Hextech Capacitor",
  "passive",
  "Switching between stances grants bonus movement speed and ghosting",
  {
    cooldown: [0],
    cooldownType: "static",
  },
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  ["Bonus MS: 40 for 0.75s", "Grants ghosting"],
);

const JayceQ = new Ability(
  "To the Skies! / Shock Blast",
  "Q",
  "Hammer: Leap and slow. Cannon: Fire accelerated shock blast for increased damage",
  {
    cooldown: [16, 14, 12, 10, 8, 6],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 1050,
    radius: 250,
  },
  {
    // Using Cannon Q accelerated damage (most common use)
    baseDamage: [112, 176, 241, 305, 370, 434],
    bonusAdRatio: 196,
    damageType: "physical",
  },
  {
    ccType: "slow",
    ccDuration: 2,
    slow: [35, 40, 45, 50, 55, 60],
  },
  undefined,
  undefined,
  [
    "Hammer Q: 60/105/150/195/240/285 (+135% bonus AD)",
    "Slow: 35-60% for 2s",
    "Cannon Q: 80/126/172/218/264/310 (+140% bonus AD)",
    "Accelerated: 40% bonus damage (shown in base)",
    "+50 bonus damage to monsters",
  ],
);

const JayceW = new Ability(
  "Lightning Field / Hyper Charge",
  "W",
  "Hammer: AoE magic damage. Cannon: Triple empowered attacks",
  {
    cooldown: [13, 11.4, 9.8, 8.2, 6.6, 5],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 0,
    radius: 285,
  },
  {
    // Lightning Field total damage
    baseDamage: [140, 200, 260, 320, 380, 440],
    apRatio: 100,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 40 mana",
    "Hammer W: 35/50/65/80/95/110 (+25% AP) per tick",
    "Total: 140/200/260/320/380/440 (+100% AP)",
    "Passive: Restores 15-25 mana on attack",
    "Cannon W: 3 empowered attacks at 360% AS",
    "Damage per attack: 70/78/86/94/102/110% AD",
  ],
);

const JayceE = new Ability(
  "Thundering Blow / Acceleration Gate",
  "E",
  "Hammer: Knock back and % max HP damage. Cannon: Gate for MS and Q acceleration",
  {
    cooldown: [20, 18, 16, 14, 12, 10],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 240,
  },
  {
    baseDamage: [0],
    bonusAdRatio: 100,
    maxHealthRatio: [8, 10.8, 13.6, 16.4, 19.2, 22],
    damageType: "magic",
  },
  {
    ccType: "knockup", // knockback not in type, using knockup as closest
    ccDuration: 0.5,
  },
  undefined,
  undefined,
  [
    "Cost: 55/50 mana",
    "Hammer E: 8/10.8/13.6/16.4/19.2/22% max HP (+100% bonus AD)",
    "Knockback: 600 units",
    "Monster cap: 200/300/400/500/600/700",
    "Cannon E: Gate grants 35-60% MS for 3s",
    "Accelerates Shock Blast",
  ],
);

const JayceR = new Ability(
  "Mercury Cannon / Mercury Hammer",
  "R",
  "Transform between ranged and melee forms with empowered next attack",
  {
    cooldown: [6],
    cooldownType: "static",
  },
  {
    castTime: 0,
    range: 0,
  },
  {
    // Hammer form empowered attack
    baseDamage: [25, 60, 95, 130],
    bonusAdRatio: 30,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "No cost",
    "Hammer: Melee 125 range",
    "Bonus armor/MR: 5/15/25/35 (+7.5% bonus AD)",
    "Empowered attack: 25/60/95/130 (+30% bonus AD) magic",
    "Cannon: Ranged 500 range",
    "Empowered attack: 10/15/20/25% armor/MR shred for 5s",
  ],
);

const Jayce = new Character(
  "Jayce",
  590, // HP
  6, // HP5
  22, // AR
  30, // MR
  59, // AD
  200, // Crit DMG (%)
  335, // MS
  125, // Attack range
  0.658, // Base AS
  [JaycePassive, JayceQ, JayceW, JayceE, JayceR],
  [],
);

// Jhin
const JhinPassive = new Ability(
  "Whisper",
  "passive",
  "Fixed attack speed, 4 shots per reload. 4th shot crits and deals missing HP damage. AS/Crit convert to AD",
  {
    cooldown: [0],
    cooldownType: "static",
  },
  undefined,
  {
    baseDamage: [0],
    missingHealthRatio: [15, 20, 25],
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "4th shot always crits",
    "4th shot bonus: 15/20/25% target missing HP",
    "Capped at 800 vs monsters",
    "Bonus AD: 4-44% (+0.35% per 1% crit)(+0.3% per 1% bonus AS)",
    "Crit MS: 14% (+0.44% per 1% bonus AS) for 2s",
    "Reduced crit damage: 75%",
    "Reload time: 2.5s",
  ],
);

const JhinQ = new Ability(
  "Dancing Grenade",
  "Q",
  "Throws a grenade that bounces to nearby targets, gaining damage per kill",
  {
    cooldown: [7, 6.5, 6, 5.5, 5],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 550,
  },
  {
    baseDamage: [44, 69, 94, 119, 144],
    adRatio: 74,
    apRatio: 60,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 40/45/50/55/60 mana",
    "Bounces: up to 4 targets",
    "+35% damage per kill",
    "Max damage: 165-323% per bounce",
  ],
);

const JhinW = new Ability(
  "Deadly Flourish",
  "W",
  "Fire a shot that damages and roots marked champions",
  {
    cooldown: [12],
    cooldownType: "standard",
  },
  {
    castTime: 0.75,
    range: 2550,
  },
  {
    baseDamage: [70, 105, 140, 175, 210],
    adRatio: 50,
    damageType: "physical",
  },
  {
    ccType: "root",
    ccDuration: 1.75, // average of 1.25-2.25
  },
  undefined,
  undefined,
  [
    "Cost: 50/55/60/65/70 mana",
    "Marks: Champions damaged by Jhin/allies",
    "Root duration: 1.25/1.5/1.75/2/2.25s",
  ],
);

const JhinE = new Ability(
  "Captive Audience",
  "E",
  "Places an invisible trap that slows then detonates for magic damage",
  {
    cooldown: [24, 21.5, 19, 16.5, 14],
    cooldownType: "ammo",
  },
  {
    castTime: 0.25,
    range: 750,
    radius: 260,
  },
  {
    baseDamage: [20, 80, 140, 200, 260],
    adRatio: 120,
    apRatio: 100,
    damageType: "magic",
  },
  {
    ccType: "slow",
    ccDuration: 2,
    slow: 35,
  },
  undefined,
  2,
  [
    "Cost: 30 mana + 1 charge",
    "Charges: 2",
    "Recharge: 24/21.5/19/16.5/14s",
    "Slow: 35% for 2s before detonation",
    "Reduced damage: 65% to subsequent targets",
  ],
);

const JhinR = new Ability(
  "Curtain Call",
  "R",
  "Channel to fire 4 shots at long range. 4th shot crits. Damage scales with missing HP",
  {
    cooldown: [120, 105, 90],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 3500,
  },
  {
    baseDamage: [256, 512, 768],
    adRatio: 100,
    damageType: "physical",
  },
  {
    ccType: "slow",
    ccDuration: 0.5,
    slow: 80,
  },
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "Channel: up to 10s",
    "4 shots, 1s each",
    "Min damage: 64/128/192 (+25% AD)",
    "Max damage: 256/512/768 (+100% AD)",
    "Damage scales 0-300% with target missing HP",
    "4th shot crits for 200% damage",
    "Reveals and slows 80% for 0.5s",
  ],
);

const Jhin = new Character(
  "Jhin",
  655, // HP
  3.75, // HP5
  24, // AR
  30, // MR
  61, // AD
  200, // Crit DMG (%)
  330, // MS
  550, // Attack range
  0.625, // Base AS
  [JhinPassive, JhinQ, JhinW, JhinE, JhinR],
  [],
);

// Jinx
const JinxPassive = new Ability(
  "Get Excited!",
  "passive",
  "Takedowns grant massive attack speed and movement speed that decays",
  {
    cooldown: [0],
    cooldownType: "static",
  },
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  [
    "Trigger: Champion/epic monster/turret/inhibitor takedown",
    "Bonus MS: 175% decaying over 6s",
    "Can exceed AS cap",
    "Stacks up to 5 times (champion kills only)",
    "AS per stack: 25%, max 125%",
  ],
);

const JinxQ = new Ability(
  "Switcheroo!",
  "Q",
  "Toggle between minigun (AS stacks) and rocket launcher (AoE, bonus range, mana cost)",
  {
    cooldown: [0.9],
    cooldownType: "static",
  },
  {
    castTime: 0,
    range: 0,
  },
  {
    baseDamage: [0],
    adRatio: 110,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Minigun (Pow-Pow):",
    "AS per stack: 15/27.5/40/52.5/65% first, 7.5/13.75/20/26.25/32.5% additional",
    "Max AS: 30/55/80/105/130% at 3 stacks",
    "Rockets (Fishbones):",
    "Cost: 20 mana per attack",
    "Damage: 110% AD (AoE)",
    "Bonus range: 100/125/150/175/200",
    "-10% AS while equipped",
  ],
);

const JinxW = new Ability(
  "Zap!",
  "W",
  "Fire a shock blast that deals damage, reveals, and slows the first enemy hit",
  {
    cooldown: [8, 7, 6, 5, 4],
    cooldownType: "standard",
  },
  {
    castTime: 0.6,
    range: 1500,
  },
  {
    baseDamage: [10, 60, 110, 160, 210],
    adRatio: 140,
    damageType: "physical",
  },
  {
    ccType: "slow",
    ccDuration: 2,
    slow: [40, 50, 60, 70, 80],
  },
  undefined,
  undefined,
  ["Cost: 40/45/50/55/60 mana", "Reveals target for 2s"],
);

const JinxE = new Ability(
  "Flame Chompers!",
  "E",
  "Deploys 3 chompers that root and damage enemies who trigger them",
  {
    cooldown: [24, 20.5, 17, 13.5, 10],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 925,
    radius: 50,
  },
  {
    baseDamage: [90, 140, 190, 240, 290],
    apRatio: 100,
    damageType: "magic",
  },
  {
    ccType: "root",
    ccDuration: 1.5,
  },
  undefined,
  undefined,
  [
    "Cost: 90 mana",
    "3 chompers",
    "Arm time: 0.5s",
    "Duration: 5s",
    "Root: 1.5s",
  ],
);

const JinxR = new Ability(
  "Super Mega Death Rocket!",
  "R",
  "Fire a global rocket that deals damage based on travel distance and missing HP",
  {
    cooldown: [85, 65, 45],
    cooldownType: "standard",
  },
  {
    castTime: 0.6,
    range: 99999,
    radius: 225,
  },
  {
    baseDamage: [200, 350, 500],
    bonusAdRatio: 120,
    missingHealthRatio: [25, 30, 35],
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "Damage scales 10-100% with distance",
    "Min damage: 20/35/50 (+12% bonus AD)",
    "Max damage: 200/350/500 (+120% bonus AD)",
    "+25/30/35% target missing HP",
    "AoE damage: 80%",
    "Missing HP cap vs monsters: 1200",
  ],
);

const Jinx = new Character(
  "Jinx",
  630, // HP
  3.75, // HP5
  26, // AR
  30, // MR
  59, // AD
  200, // Crit DMG (%)
  325, // MS
  525, // Attack range
  0.625, // Base AS
  [JinxPassive, JinxQ, JinxW, JinxE, JinxR],
  [],
);

// K'Sante
const KSantePassive = new Ability(
  "Dauntless Instinct",
  "passive",
  "Abilities mark enemies. Basic attacks on marked targets deal bonus max HP damage",
  {
    cooldown: [0],
    cooldownType: "static",
  },
  undefined,
  {
    baseDamage: [12],
    maxHealthRatio: 2,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Mark duration: 4s",
    "Damage: 12 + (1-2% max HP based on level)",
    "All Out bonus: +1% (+1% per 100 bonus AR/MR) max HP",
  ],
);

const KSanteQ = new Ability(
  "Ntofo Strikes",
  "Q",
  "Slash dealing damage based on resistances. At 2 stacks, fires shockwave with stun",
  {
    cooldown: [3.5, 3.2, 2.9, 2.6, 2.3],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 465,
  },
  {
    baseDamage: [70, 100, 130, 160, 190],
    damageType: "physical",
  },
  {
    ccType: "stun",
    ccDuration: 0.8,
    slow: 80,
  },
  undefined,
  undefined,
  [
    "Cost: 20 mana",
    "Scales: +40% bonus armor/MR",
    "Slow: 80% for 0.5s",
    "Empowered: Pull + 0.8s stun",
    "CD reduces with bonus resistances",
  ],
);

const KSanteW = new Ability(
  "Path Maker",
  "W",
  "Charge then dash, reducing damage taken. Deals % max HP damage and stuns",
  {
    cooldown: [14, 13, 12, 11, 10],
    cooldownType: "standard",
  },
  {
    castTime: 1,
    range: 450,
  },
  {
    baseDamage: [45, 75, 105, 135, 165],
    maxHealthRatio: 8,
    damageType: "physical",
  },
  {
    ccType: "stun",
    ccDuration: 1.75,
  },
  undefined,
  undefined,
  [
    "Cost: 40/45/50/55/60 mana",
    "Charge: 0.4-1s, 30% damage reduction",
    "% HP: 8% (+2% per 100 bonus AR/MR)",
    "Stun: 0.5-1.75s based on charge",
    "Monster cap: 180/260/340/420/500",
  ],
);

const KSanteE = new Ability(
  "Footwork",
  "E",
  "Dash to location or ally. Grants shield scaling with bonus HP",
  {
    cooldown: [10, 9.5, 9, 8.5, 8],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 550,
  },
  undefined,
  {
    shield: [80, 120, 160, 200, 240],
  },
  undefined,
  undefined,
  [
    "Cost: 45/50/55/60/65 mana",
    "Shield: 80/120/160/200/240 (+15% bonus HP)",
    "Shield duration: 2s",
    "Ally dash: 550 range, can pass terrain",
    "Location dash: 250 range",
  ],
);

const KSanteR = new Ability(
  "All Out",
  "R",
  "Dash to enemy, dealing damage. Enter All Out form: lose resistances, gain AS and omnivamp",
  {
    cooldown: [120, 100, 80],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 450,
  },
  {
    baseDamage: [80, 115, 150],
    damageType: "physical",
  },
  {
    ccType: "root",
    ccDuration: 0.5,
  },
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "+5% bonus HP damage if through terrain",
    "All Out (15s):",
    "HP capped at 65%, -85% bonus AR/MR",
    "+40/60/80% AS, +50% armor pen",
    "+20% omnivamp, abilities free",
  ],
);

const KSante = new Character(
  "K'Sante",
  625, // HP
  9.5, // HP5
  36, // AR
  30, // MR
  64, // AD
  200, // Crit DMG (%)
  330, // MS
  150, // Attack range
  0.688, // Base AS
  [KSantePassive, KSanteQ, KSanteW, KSanteE, KSanteR],
  [],
);

// Kai'Sa
const KaiSaPassive = new Ability(
  "Second Skin",
  "passive",
  "Plasma stacks deal bonus damage. 5 stacks consume to deal missing HP damage. Abilities evolve with stats",
  {
    cooldown: [0],
    cooldownType: "static",
  },
  undefined,
  {
    baseDamage: [4],
    apRatio: 12,
    missingHealthRatio: 15,
    missingHealthRatioPerAP: 6,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "On-hit: 4-24 (+12% AP) based on level",
    "Per stack: 1-6 (+3% AP)",
    "5th stack: 15% (+6% per 100 AP) missing HP",
    "Evolve: Q at 100 AD, W at 100 AP, E at 100% AS",
  ],
);

const KaiSaQ = new Ability(
  "Icathian Rain",
  "Q",
  "Fire 6 missiles at nearby enemies. Evolved: 12 missiles",
  {
    cooldown: [10, 9, 8, 7, 6],
    cooldownType: "standard",
  },
  {
    castTime: 0.4,
    range: 600,
  },
  {
    baseDamage: [90, 124, 158, 191, 225],
    bonusAdRatio: 124,
    apRatio: 45,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 55 mana",
    "6 missiles total",
    "Per missile: 40/55/70/85/100 (+55% bonus AD)(+20% AP)",
    "Subsequent: 25% damage",
    "Evolved: 12 missiles",
  ],
);

const KaiSaW = new Ability(
  "Void Seeker",
  "W",
  "Fire a void bolt that reveals and applies Plasma stacks",
  {
    cooldown: [22, 20, 18, 16, 14],
    cooldownType: "standard",
  },
  {
    castTime: 0.4,
    range: 3000,
  },
  {
    baseDamage: [30, 55, 80, 105, 130],
    adRatio: 130,
    apRatio: 45,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 55/60/65/70/75 mana",
    "Applies 2 Plasma stacks",
    "Reveals for 4s",
    "Evolved: 3 stacks, 75% CD refund on champion hit",
  ],
);

const KaiSaE = new Ability(
  "Supercharge",
  "E",
  "Charge to gain movement speed and attack speed. Evolved: Grants invisibility",
  {
    cooldown: [16, 14.5, 13, 11.5, 10],
    cooldownType: "standard",
  },
  {
    castTime: 0.6,
    range: 0,
  },
  undefined,
  {
    bonusStats: {
      as: [40, 50, 60, 70, 80],
      ms: [55, 60, 65, 70, 75],
    },
  },
  undefined,
  undefined,
  [
    "Cost: 30 mana",
    "MS: 55/60/65/70/75% to 110/120/130/140/150%",
    "AS: 40/50/60/70/80% for 4s",
    "CD reduced 0.5s per attack",
    "Evolved: 0.5s invisibility at start",
  ],
);

const KaiSaR = new Ability(
  "Killer Instinct",
  "R",
  "Dash to an enemy with Plasma, gaining a large shield",
  {
    cooldown: [130, 100, 70],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 3000,
  },
  undefined,
  {
    shield: [70, 90, 110],
  },
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "Range: 2000/2500/3000",
    "Shield: 70/90/110 (+90/135/180% AD)(+120% AP)",
    "Duration: 2s",
    "Resets basic attack",
  ],
);

const KaiSa = new Character(
  "Kai'Sa",
  640, // HP
  4, // HP5
  25, // AR
  30, // MR
  59, // AD
  200, // Crit DMG (%)
  335, // MS
  525, // Attack range
  0.644, // Base AS
  [KaiSaPassive, KaiSaQ, KaiSaW, KaiSaE, KaiSaR],
  [],
);

// Kalista
const KalistaPassive = new Ability(
  "Martial Poise",
  "passive",
  "Can dash during basic attack windups. Basic attacks deal 90% AD. Begins with Black Spear to bind Oathsworn.",
  {
    cooldown: [0],
    cooldownType: "static",
  },
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  [
    "IMPORTANT: Basic attacks deal only 90% AD",
    "AS scaling reduced: only 0.75% per 1% bonus AS",
    "Dash range: 140-300 based on boots and angle",
    "Dash speed: 1025-1160 based on boots tier",
  ],
);

const KalistaQ = new Ability(
  "Pierce",
  "Q",
  "Throw a spear that passes through killed targets, carrying Rend stacks",
  {
    cooldown: [9, 9, 9, 9, 9],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 1200,
  },
  {
    baseDamage: [10, 75, 140, 205, 270],
    adRatio: 105,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  ["Cost: 60/65/70/75/80 mana", "Transfers Rend stacks on kill"],
);

const KalistaW = new Ability(
  "Sentinel",
  "W",
  "Passive: Soul-Marked with Oathsworn deals % max HP. Active: Summon patrolling sentinel",
  {
    cooldown: [90, 80, 70, 60, 50], // Recharge time for sentinel charges
    cooldownType: "ammo",
  },
  {
    castTime: 0.5,
    range: 5000,
  },
  {
    // Soul-Marked passive damage (requires Oathsworn coordination)
    baseDamage: [0, 0, 0, 0, 0],
    maxHealthRatio: [10, 12, 14, 16, 18],
    damageType: "magic",
  },
  undefined,
  undefined,
  2,
  [
    "Sentinel recharge: 90/80/70/60/50s",
    "Soul-Marked: 10-18% max HP magic (10s per-target CD)",
    "Cap vs non-champions: 100/125/150/175/200",
    "Requires both Kalista and Oathsworn to hit same target",
  ],
);

const KalistaE = new Ability(
  "Rend",
  "E",
  "Basic attacks and Q apply stacks. Active: Rip spears for damage and slow. Resets on kill.",
  {
    // Use static cooldown - Rend's effective CD is gated by needing to stack spears first
    // Optimal play: ~5-8 autos then Rend, so effective CD ≈ stacking time
    // At 2.5 AS that's ~2-3s between Rends, use 3s as reasonable floor
    cooldown: [3, 3, 3, 3, 3],
    cooldownType: "static",
  },
  {
    castTime: 0.25,
    range: 1100,
  },
  {
    // Rend damage with ~7 stacks (realistic for 3s static CD at ~2.5 AS)
    // First spear: 5-45 (+70% AD)(+65% AP)
    // Per additional (6 spears): 6 × [7-35 (+20-40% AD)(+50% AP)]
    // Total: first + 6×additional = [47, 99, 151, 203, 255] base
    // AD ratio: 70 + 6×40 = 310%  |  AP ratio: 65 + 6×50 = 365%
    baseDamage: [47, 99, 151, 203, 255],
    adRatio: 310,
    apRatio: 365,
    damageType: "physical",
  },
  {
    ccType: "slow",
    ccDuration: 2,
    slow: [10, 18, 26, 34, 42],
  },
  undefined,
  undefined,
  [
    "Cost: 30 mana",
    "First spear: 5-45 (+70% AD)(+65% AP)",
    "Per additional: 7-35 (+20-40% AD)(+50% AP)",
    "Max 254 stacks",
    "Resets CD and refunds 10-30 mana on kill",
    "Slow: 10-42% (+5% per 100 AP)",
  ],
);

const KalistaR = new Ability(
  "Fate's Call",
  "R",
  "Pull Oathsworn to safety. They can dash out to knock up enemies.",
  {
    cooldown: [160, 140, 120],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 1200,
  },
  undefined, // No direct damage
  {
    ccType: "knockup",
    ccDuration: 1.5, // 1/1.5/2s based on rank
  },
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "Hold duration: 4s",
    "Cleanses CC from Oathsworn",
    "Oathsworn invulnerable/untargetable while held",
    "Knockup: 1/1.5/2s on collision",
  ],
);

const Kalista = new Character(
  "Kalista",
  560, // HP
  4, // HP5
  24, // AR
  30, // MR
  57, // AD
  200, // Crit DMG (%)
  330, // MS
  525, // Attack range
  0.694, // Base AS
  [KalistaPassive, KalistaQ, KalistaW, KalistaE, KalistaR],
  [],
);

// Karma
const KarmaPassive = new Ability(
  "Gathering Fire",
  "passive",
  "Damaging enemy champions reduces Mantra cooldown",
  {
    cooldown: [0],
    cooldownType: "static",
  },
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  [
    "CD reduction: 4s per champion hit",
    "Max 40s from 5 champions",
    "W: 8s total (on cast + completion)",
  ],
);

const KarmaQ = new Ability(
  "Inner Flame",
  "Q",
  "Fire bolt that explodes on hit, dealing damage and slowing. Mantra: Soulflare with bonus damage",
  {
    cooldown: [9, 8, 7, 6, 5],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 950,
    radius: 280,
  },
  {
    baseDamage: [60, 110, 160, 210, 260],
    apRatio: 70,
    damageType: "magic",
  },
  {
    ccType: "slow",
    ccDuration: 1.5,
    slow: 40,
  },
  undefined,
  undefined,
  [
    "Cost: 40/50/60/70/80 mana",
    "Mantra (Soulflare):",
    "Bonus: 40/100/160/220 (+30% AP)",
    "Field rupture: 40/130/220/310 (+50% AP)",
  ],
);

const KarmaW = new Ability(
  "Focused Resolve",
  "W",
  "Tether to enemy, dealing damage and rooting if held. Mantra: Heals",
  {
    cooldown: [12],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 675,
  },
  {
    baseDamage: [80, 130, 180, 230, 280],
    apRatio: 90,
    damageType: "magic",
  },
  {
    ccType: "root",
    ccDuration: 2,
    heal: [0], // Mantra heals missing HP - documented in notes
  },
  undefined,
  undefined,
  [
    "Cost: 50/55/60/65/70 mana",
    "Tether duration: 2s",
    "Root: 1.6/1.7/1.8/1.9/2s",
    "Mantra (Renewal):",
    "Heals 17% (+1% per 100 AP) missing HP twice",
  ],
);

const KarmaE = new Ability(
  "Inspire",
  "E",
  "Shield ally and grant movement speed. Mantra: Defiance spreads to nearby allies",
  {
    cooldown: [10, 9.5, 9, 8.5, 8],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 800,
  },
  undefined,
  {
    shield: [80, 130, 180, 230, 280],
    bonusStats: {
      ms: [40, 40, 40, 40, 40],
    },
  },
  undefined,
  undefined,
  [
    "Cost: 50/55/60/65/70 mana",
    "Shield: 80/130/180/230/280 (+60% AP)",
    "MS: 40% for 2s",
    "Duration: 2.5s",
    "Mantra bonus: +50/100/150/200 (+45% AP)",
    "Spreads to allies at 700 range",
  ],
);

const KarmaR = new Ability(
  "Mantra",
  "R",
  "Empower next basic ability for bonus effects",
  {
    cooldown: [40, 38, 36, 34],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 0,
  },
  undefined,
  undefined,
  undefined,
  undefined,
  ["No cost", "Available at level 1", "Can cast while silenced", "Window: 8s"],
);

const Karma = new Character(
  "Karma",
  630, // HP
  5.5, // HP5
  28, // AR
  30, // MR
  49, // AD
  200, // Crit DMG (%)
  335, // MS
  525, // Attack range
  0.625, // Base AS
  [KarmaPassive, KarmaQ, KarmaW, KarmaE, KarmaR],
  [],
);

// Karthus
const KarthusPassive = new Ability(
  "Death Defied",
  "passive",
  "Upon death, become a zombie for 7s. Can cast abilities at no cost",
  {
    cooldown: [0],
    cooldownType: "static",
  },
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  [
    "Duration: 7s (5s in ARAM)",
    "Cannot move",
    "Untargetable and CC immune",
    "R disabled after 4s",
  ],
);

const KarthusQ = new Ability(
  "Lay Waste",
  "Q",
  "Detonate area dealing magic damage. Double damage to isolated targets",
  {
    cooldown: [1],
    cooldownType: "static",
  },
  {
    castTime: 0.25,
    range: 875,
    radius: 160,
  },
  {
    baseDamage: [80, 118, 156, 194, 232],
    apRatio: 70,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 20/25/30/35/40 mana",
    "AoE damage: 40/59/78/97/116 (+35% AP)",
    "Single target: 80/118/156/194/232 (+70% AP)",
  ],
);

const KarthusW = new Ability(
  "Wall of Pain",
  "W",
  "Create wall that slows and reduces MR of enemies passing through",
  {
    cooldown: [15, 15, 15, 15, 15],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 1000,
  },
  undefined,
  {
    ccType: "slow",
    ccDuration: 5,
    slow: [40, 50, 60, 70, 80],
  },
  undefined,
  undefined,
  [
    "Cost: 70 mana",
    "Wall length: 800/900/1000/1100/1200",
    "Duration: 5s",
    "MR reduction: 25%",
    "Slow decays to 20/25/30/35/40%",
  ],
);

const KarthusE = new Ability(
  "Defile",
  "E",
  "Toggle: Deal magic damage per second. Passive: Restore mana on kills",
  {
    cooldown: [0.5],
    cooldownType: "static",
  },
  {
    castTime: 0,
    range: 0,
    radius: 550,
  },
  {
    baseDamage: [30, 50, 70, 90, 110],
    apRatio: 20,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 30/42/54/66/78 mana per second",
    "Damage per tick: 7.5/12.5/17.5/22.5/27.5 (+5% AP)",
    "Tick rate: 0.25s",
    "Passive: Restore 10/20/30/40/50 mana on kill",
  ],
);

const KarthusR = new Ability(
  "Requiem",
  "R",
  "Channel to damage all enemy champions globally",
  {
    cooldown: [200, 180, 160],
    cooldownType: "standard",
  },
  {
    castTime: 3,
    range: 99999,
  },
  {
    baseDamage: [200, 350, 500],
    apRatio: 70,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "Channel: 3s",
    "Hits all targetable enemy champions",
    "Can be blocked by spell shields",
  ],
);

const Karthus = new Character(
  "Karthus",
  620, // HP
  6.5, // HP5
  21, // AR
  30, // MR
  46, // AD
  200, // Crit DMG (%)
  335, // MS
  450, // Attack range
  0.625, // Base AS
  [KarthusPassive, KarthusQ, KarthusW, KarthusE, KarthusR],
  [],
);

// Kassadin
const KassadinPassive = new Ability(
  "Void Stone",
  "passive",
  "Permanently ghosted and takes 10% reduced magic damage",
  {
    cooldown: [0],
    cooldownType: "static",
  },
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  ["10% magic damage reduction", "Permanently ghosted"],
);

const KassadinQ = new Ability(
  "Null Sphere",
  "Q",
  "Fire orb that damages, interrupts channels, and grants magic shield",
  {
    cooldown: [10, 9.5, 9, 8.5, 8],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 650,
  },
  {
    baseDamage: [65, 95, 125, 155, 185],
    apRatio: 70,
    damageType: "magic",
  },
  {
    shield: [80, 110, 140, 170, 200],
  },
  undefined,
  undefined,
  [
    "Cost: 60/65/70/75/80 mana",
    "Shield: 80/110/140/170/200 (+30% AP) magic only",
    "Shield duration: 1.5s",
    "Interrupts channels",
  ],
);

const KassadinW = new Ability(
  "Nether Blade",
  "W",
  "Passive: On-hit magic damage. Active: Empower next attack with bonus damage and mana restore",
  {
    cooldown: [7],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 0,
  },
  {
    baseDamage: [50, 75, 100, 125, 150],
    apRatio: 80,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 1 mana",
    "Passive on-hit: 20 (+10% AP)",
    "Active: 50/75/100/125/150 (+80% AP)",
    "Mana restore: 4/4.5/5/5.5/6% missing",
    "vs Champions: 20/22.5/25/27.5/30% missing",
    "Auto reset, +50 range",
  ],
);

const KassadinE = new Ability(
  "Force Pulse",
  "E",
  "Cone damage and slow. Cooldown reduces per nearby ability cast",
  {
    cooldown: [21, 20, 19, 18, 17],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 0,
    radius: 600,
  },
  {
    baseDamage: [70, 100, 130, 160, 190],
    apRatio: 70,
    damageType: "magic",
  },
  {
    ccType: "slow",
    ccDuration: 1,
    slow: [50, 60, 70, 80, 90],
  },
  undefined,
  undefined,
  ["Cost: 60/65/70/75/80 mana", "CD reduced 0.75s per nearby ability cast"],
);

const KassadinR = new Ability(
  "Riftwalk",
  "R",
  "Blink dealing damage. Stacks increase damage and mana cost",
  {
    cooldown: [5, 3.5, 2],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 500,
    radius: 250,
  },
  {
    baseDamage: [70, 90, 110],
    apRatio: 50,
    maxManaRatio: 2,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 40/80/160/320/640 mana (stacking)",
    "Per stack: +35/45/55 (+7% AP)(+1% max mana)",
    "Max (4 stacks): 210/270/330 (+78% AP)(+6% max mana)",
    "Stack duration: 15s",
  ],
);

const Kassadin = new Character(
  "Kassadin",
  646, // HP
  6, // HP5
  21, // AR
  30, // MR
  59, // AD
  200, // Crit DMG (%)
  335, // MS
  150, // Attack range
  0.64, // Base AS
  [KassadinPassive, KassadinQ, KassadinW, KassadinE, KassadinR],
  [],
);

// Katarina
const KatarinaPassive = new Ability(
  "Voracity",
  "passive",
  "Takedowns reduce CDs by 15s. Picking up daggers deals AoE damage",
  {
    cooldown: [0],
    cooldownType: "static",
  },
  undefined,
  {
    baseDamage: (level: number) => 68 + (172 * (level - 1)) / 17,
    bonusAdRatio: 60,
    apRatio: 100,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Dagger damage: 68-240 (+60% bonus AD)(+70-100% AP)",
    "Shunpo CD reduction: 78/84/90/96% on dagger pickup",
    "Applies on-hit to champions",
  ],
);

const KatarinaQ = new Ability(
  "Bouncing Blade",
  "Q",
  "Throw dagger that bounces to 2 additional enemies, then lands near first target",
  {
    cooldown: [11, 10, 9, 8, 7],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 625,
  },
  {
    baseDamage: [80, 115, 150, 185, 220],
    apRatio: 40,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  ["No cost", "Bounces to 2 enemies", "Dagger lands near initial target"],
);

const KatarinaW = new Ability(
  "Preparation",
  "W",
  "Gain movement speed and toss dagger overhead",
  {
    cooldown: [15, 14, 13, 12, 11],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 0,
  },
  undefined,
  {
    bonusStats: {
      ms: [50, 60, 70, 80, 90],
    },
  },
  undefined,
  undefined,
  ["No cost", "MS: 50/60/70/80/90% decaying", "Duration: 1.25s", "Ghosted"],
);

const KatarinaE = new Ability(
  "Shunpo",
  "E",
  "Blink near target unit or dagger, dealing damage to nearest enemy",
  {
    cooldown: [12, 11, 10, 9, 8],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 725,
  },
  {
    baseDamage: [20, 30, 40, 50, 60],
    adRatio: 40,
    apRatio: 25,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  ["No cost", "Resets basic attack", "CD reduced on dagger pickup"],
);

const KatarinaR = new Ability(
  "Death Lotus",
  "R",
  "Channel to throw daggers at nearby enemies. Applies on-hit and grievous wounds",
  {
    cooldown: [75, 60, 45],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 0,
    radius: 550,
  },
  {
    baseDamage: [375, 563, 750],
    bonusAdRatio: 240,
    apRatio: 285,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "No cost",
    "Channel: up to 2.5s",
    "15 daggers per target",
    "Physical per dagger: 16% bonus AD (+50% per 100% bonus AS)",
    "Magic per dagger: 25/37.5/50 (+19% AP)",
    "Applies on-hit at 25/30/35%",
    "Grievous wounds",
  ],
);

const Katarina = new Character(
  "Katarina",
  672, // HP
  7.5, // HP5
  32, // AR
  32, // MR
  58, // AD
  200, // Crit DMG (%)
  335, // MS
  125, // Attack range
  0.658, // Base AS
  [KatarinaPassive, KatarinaQ, KatarinaW, KatarinaE, KatarinaR],
  [],
);

// Kayle
const KaylePassive = new Ability(
  "Divine Ascent",
  "passive",
  "Transform at levels 6, 11, 16. Gain range, fire waves at max stacks",
  {
    cooldown: [0],
    cooldownType: "static",
  },
  undefined,
  {
    baseDamage: [20],
    bonusAdRatio: 10,
    apRatio: 25,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Zealous: 6% AS per stack (max 5)",
    "10% MS at max stacks",
    "Lvl 6: Ranged (525 range)",
    "Lvl 11: Fire waves at max stacks",
    "Wave: 20-41 (+10% bonus AD)(+25% AP)",
    "Lvl 16: Permanent exalted, 625 range",
  ],
);

const KayleQ = new Ability(
  "Radiant Blast",
  "Q",
  "Fire sword that slows and shreds resistances",
  {
    cooldown: [12, 11, 10, 9, 8],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 900,
  },
  {
    baseDamage: [60, 100, 140, 180, 220],
    bonusAdRatio: 60,
    apRatio: 50,
    damageType: "magic",
  },
  {
    ccType: "slow",
    ccDuration: 2,
    slow: [25, 30, 35, 40, 45],
  },
  undefined,
  undefined,
  ["Cost: 60/70/80/90/100 mana", "Armor/MR shred: 15% for 4s"],
);

const KayleW = new Ability(
  "Celestial Blessing",
  "W",
  "Heal self and ally, granting movement speed",
  {
    cooldown: [15],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 900,
  },
  undefined,
  {
    heal: [55, 80, 105, 130, 155],
    bonusStats: {
      ms: [24, 28, 32, 36, 40],
    },
  },
  undefined,
  undefined,
  [
    "Cost: 70/80/90/100/110 mana",
    "Heal: 55/80/105/130/155 (+25% AP)",
    "MS: 24/28/32/36/40% (+8% per 100 AP) for 2s",
  ],
);

const KayleE = new Ability(
  "Starfire Spellblade",
  "E",
  "Passive: On-hit damage. Active: Empower attack with missing HP damage",
  {
    cooldown: [8, 7.5, 7, 6.5, 6],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 0,
  },
  {
    baseDamage: [15, 20, 25, 30, 35],
    bonusAdRatio: 10,
    apRatio: 20,
    missingHealthRatio: [8, 8.5, 9, 9.5, 10],
    missingHealthRatioPerAP: 1.5,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "No cost",
    "Passive: 15/20/25/30/35 (+10% bonus AD)(+20% AP)",
    "Active: 8/8.5/9/9.5/10% (+1.5% per 100 AP) missing HP",
    "Monster cap: 400",
  ],
);

const KayleR = new Ability(
  "Divine Judgment",
  "R",
  "Grant invulnerability to self or ally, then rain swords for damage",
  {
    cooldown: [160, 120, 80],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 900,
    radius: 675,
  },
  {
    baseDamage: [200, 300, 400],
    bonusAdRatio: 100,
    apRatio: 70,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  ["Cost: 100/50/0 mana", "Invulnerability: 2.5s", "Sword rain at end"],
);

const Kayle = new Character(
  "Kayle",
  670, // HP
  5, // HP5
  26, // AR
  22, // MR
  50, // AD
  200, // Crit DMG (%)
  335, // MS
  175, // Attack range
  0.625, // Base AS
  [KaylePassive, KayleQ, KayleW, KayleE, KayleR],
  [],
);

// Kayn
const KaynPassive = new Ability(
  "The Darkin Scythe",
  "passive",
  "Collect orbs from combat. Transform into Shadow Assassin or Rhaast",
  {
    cooldown: [0],
    cooldownType: "static",
  },
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  [
    "500 points to transform",
    "Melee = red orbs (Rhaast)",
    "Ranged = blue orbs (Shadow Assassin)",
    "Shadow: 20-40% bonus magic damage",
    "Rhaast: 25% (+0.5% per 100 bonus HP) spell vamp",
  ],
);

const KaynQ = new Ability(
  "Reaping Slash",
  "Q",
  "Dash then slash. Rhaast: % max HP damage",
  {
    cooldown: [7, 6.5, 6, 5.5, 5],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 350,
    radius: 350,
  },
  {
    baseDamage: [150, 200, 250, 300, 350],
    bonusAdRatio: 170,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 40 mana",
    "Base: 75-175 (+85% bonus AD) per hit",
    "Total: 150-350 (+170% bonus AD)",
    "Rhaast: 65% AD + 6% (+3.5% per 100 bonus AD) max HP per hit",
    "Monster cap: 200-400 per hit",
  ],
);

const KaynW = new Ability(
  "Blade's Reach",
  "W",
  "Swing scythe dealing damage. Shadow: Cast from shadow. Rhaast: Knockup",
  {
    cooldown: [13, 12, 11, 10, 9],
    cooldownType: "standard",
  },
  {
    castTime: 0.55,
    range: 700,
  },
  {
    baseDamage: [85, 130, 175, 220, 265],
    bonusAdRatio: 110,
    damageType: "physical",
  },
  {
    ccType: "slow",
    ccDuration: 1.5,
    slow: 90,
  },
  undefined,
  undefined,
  [
    "Cost: 40/45/50/55/60 mana",
    "Slow: 90% for 1.5s",
    "Shadow Assassin: No cast time, +200 range",
    "Rhaast: 1s knockup instead of slow",
  ],
);

const KaynE = new Ability(
  "Shadow Step",
  "E",
  "Move through terrain with bonus MS and heal",
  {
    cooldown: [21, 19, 17, 15, 13],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 0,
  },
  undefined,
  {
    heal: [90, 100, 110, 120, 130],
    bonusStats: {
      ms: [40, 40, 40, 40, 40],
    },
  },
  undefined,
  undefined,
  [
    "Cost: 90 mana",
    "Duration: 7/7.5/8/8.5/9s (1.5s if in combat)",
    "MS: 40%",
    "Heal on terrain entry: 90-130 (+45% bonus AD)",
    "Shadow Assassin: 10s CD, 70% MS in terrain",
  ],
);

const KaynR = new Ability(
  "Umbral Trespass",
  "R",
  "Enter enemy, then burst out dealing damage. Rhaast: % max HP and heal",
  {
    cooldown: [120, 100, 80],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 550,
  },
  {
    baseDamage: [150, 250, 350],
    bonusAdRatio: 150,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "Channel: 2s inside target",
    "Base: 150/250/350 (+150% bonus AD)",
    "Shadow Assassin: +200 range, resets Q",
    "Rhaast: 15% (+10% per 100 bonus AD) max HP",
    "Rhaast heal: 11.25% (+7.5% per 100 bonus AD) max HP",
  ],
);

const Kayn = new Character(
  "Kayn",
  655, // HP
  8, // HP5
  38, // AR
  32, // MR
  68, // AD
  200, // Crit DMG (%)
  340, // MS
  175, // Attack range
  0.669, // Base AS
  [KaynPassive, KaynQ, KaynW, KaynE, KaynR],
  [],
);

// Kennen
const KennenPassive = new Ability(
  "Mark of the Storm",
  "passive",
  "Abilities apply marks. 3 marks stun and restore energy",
  {
    cooldown: [0],
    cooldownType: "static",
  },
  undefined,
  undefined,
  {
    ccType: "stun",
    ccDuration: 1.25,
  },
  undefined,
  undefined,
  [
    "Mark duration: 6s",
    "3rd mark: Stun 1.25s, restore 25 energy",
    "Subsequent stuns within 6s: 0.5s",
  ],
);

const KennenQ = new Ability(
  "Thundering Shuriken",
  "Q",
  "Throw shuriken dealing damage and applying mark",
  {
    cooldown: [7, 6.25, 5.5, 4.75, 4],
    cooldownType: "standard",
  },
  {
    castTime: 0.175,
    range: 1050,
  },
  {
    baseDamage: [75, 125, 175, 225, 275],
    apRatio: 75,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  ["Cost: 60/55/50/45/40 energy"],
);

const KennenW = new Ability(
  "Electrical Surge",
  "W",
  "Passive: 4th attack empowered. Active: Damage marked enemies",
  {
    cooldown: [13, 11.25, 9.5, 7.75, 6],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 0,
    radius: 750,
  },
  {
    baseDamage: [70, 95, 120, 145, 170],
    apRatio: 80,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 40 energy",
    "Passive (4th attack): 35/45/55/65/75 (+80-120% bonus AD)(+35% AP)",
    "Active: 70/95/120/145/170 (+80% AP)",
    "Hits marked enemies or those in R",
  ],
);

const KennenE = new Ability(
  "Lightning Rush",
  "E",
  "Transform into lightning ball, gaining speed and dealing damage",
  {
    cooldown: [10, 9, 8, 7, 6],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 0,
  },
  {
    baseDamage: [80, 120, 160, 200, 240],
    apRatio: 80,
    damageType: "magic",
  },
  {
    bonusStats: {
      ms: [100, 100, 100, 100, 100],
    },
  },
  undefined,
  undefined,
  [
    "Cost: 80 energy",
    "vs Champions: 80/120/160/200/240 (+80% AP)",
    "vs Non-champions: 52/78/104/130/156 (+52% AP)",
    "Duration: 2s",
    "Recast: Gain 40/50/60/70/80% AS",
  ],
);

const KennenR = new Ability(
  "Slicing Maelstrom",
  "R",
  "Summon storm around self dealing damage to nearby enemies",
  {
    cooldown: [120, 100, 80],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 0,
    radius: 550,
  },
  {
    baseDamage: [300, 563, 825],
    apRatio: 169,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "No cost",
    "Duration: 3s",
    "Per bolt: 40/75/110 (+22.5% AP)",
    "Max single target: 300/562.5/825 (+168.75% AP)",
    "Bonus AR/MR: 20/40/60",
    "Damage increases per successive hit (up to 150%)",
  ],
);

const Kennen = new Character(
  "Kennen",
  580, // HP
  5.5, // HP5
  29, // AR
  30, // MR
  48, // AD
  200, // Crit DMG (%)
  335, // MS
  550, // Attack range
  0.625, // Base AS
  [KennenPassive, KennenQ, KennenW, KennenE, KennenR],
  [],
);

// Kha'Zix
const KhaZixPassive = new Ability(
  "Unseen Threat",
  "passive",
  "Leaving enemy vision empowers next attack with bonus damage and slow",
  {
    cooldown: [0],
    cooldownType: "static",
  },
  undefined,
  {
    baseDamage: (level: number) => 17 + (119 * (level - 1)) / 17,
    bonusAdRatio: 50,
    damageType: "magic",
  },
  {
    ccType: "slow",
    ccDuration: 2,
    slow: 25,
  },
  undefined,
  undefined,
  [
    "Damage: 17-136 (+50% bonus AD) based on level",
    "Slow: 25% for 2s",
    "Triggers on stealth or leaving vision",
  ],
);

const KhaZixQ = new Ability(
  "Taste Their Fear",
  "Q",
  "Slash target. Deals bonus damage to isolated enemies",
  {
    cooldown: [4],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 325,
  },
  {
    baseDamage: [80, 105, 130, 155, 180],
    bonusAdRatio: 110,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 20 mana",
    "Isolated: +110% damage (231% bonus AD)",
    "Isolated total: 168/220.5/273/325.5/378",
    "Evolved: +50 range, -45% CD on isolated targets",
  ],
);

const KhaZixW = new Ability(
  "Void Spike",
  "W",
  "Fire spike that explodes dealing damage. Heal if in explosion",
  {
    cooldown: [9],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 1025,
    radius: 300,
  },
  {
    baseDamage: [75, 105, 135, 165, 195],
    bonusAdRatio: 100,
    damageType: "physical",
  },
  {
    heal: [55, 75, 95, 115, 135],
  },
  undefined,
  undefined,
  [
    "Cost: 55/60/65/70/75 mana",
    "Heal: 55/75/95/115/135 (+50% AP)",
    "Evolved: 3 spikes in cone, 40/60% slow, reveals champions",
  ],
);

const KhaZixE = new Ability(
  "Leap",
  "E",
  "Leap to location dealing damage on arrival",
  {
    cooldown: [20, 18, 16, 14, 12],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 700,
    radius: 300,
  },
  {
    baseDamage: [65, 100, 135, 170, 205],
    bonusAdRatio: 40,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  ["Cost: 50 mana", "Evolved: +200 range, resets on champion takedown"],
);

const KhaZixR = new Ability(
  "Void Assault",
  "R",
  "Become invisible with bonus movement speed. Can recast",
  {
    cooldown: [100, 85, 70],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 0,
  },
  undefined,
  {
    bonusStats: {
      ms: [40, 40, 40],
    },
  },
  undefined,
  2,
  [
    "Cost: 100 mana",
    "Invisibility: 1.25s",
    "MS: 40%",
    "Recast window: 12s",
    "Evolved: 2s invisibility, 2 recasts",
    "Passive: Evolution point per rank",
  ],
);

const KhaZix = new Character(
  "Kha'Zix",
  643, // HP
  7.5, // HP5
  32, // AR
  32, // MR
  60, // AD
  200, // Crit DMG (%)
  345, // MS
  125, // Attack range
  0.668, // Base AS
  [KhaZixPassive, KhaZixQ, KhaZixW, KhaZixE, KhaZixR],
  [],
);

// Kindred
const KindredPassive = new Ability(
  "Mark of the Kindred",
  "passive",
  "Mark targets to hunt. Takedowns grant permanent stacks with scaling bonuses",
  {
    cooldown: [0],
    cooldownType: "static",
  },
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  [
    "Range bonus: 75-250 based on marks",
    "Abilities scale with marks",
    "Wolf marks jungle camps",
    "Lamb marks champions",
  ],
);

const KindredQ = new Ability(
  "Dance of Arrows",
  "Q",
  "Dash and fire arrows at nearby enemies. CD reduced in W",
  {
    cooldown: [9],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 340,
  },
  {
    baseDamage: [40, 65, 90, 115, 140],
    bonusAdRatio: 75,
    damageType: "physical",
  },
  {
    bonusStats: {
      as: [35, 35, 35, 35, 35],
    },
  },
  undefined,
  undefined,
  [
    "Cost: 35 mana",
    "Fires at up to 3 enemies",
    "AS: 35% (+5% per mark) for 4s",
    "CD in W: 4/3.5/3/2.5/2s",
    "Resets basic attack",
  ],
);

const KindredW = new Ability(
  "Wolf's Frenzy",
  "W",
  "Wolf attacks enemies in zone dealing current HP damage",
  {
    cooldown: [18, 17, 16, 15, 14],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 500,
    radius: 800,
  },
  {
    baseDamage: [25, 30, 35, 40, 45],
    bonusAdRatio: 20,
    apRatio: 20,
    currentHealthRatio: 1.5,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 40 mana",
    "Duration: 8.5s",
    "Wolf damage: 25/30/35/40/45 (+20% bonus AD)(+20% AP)",
    "+1.5% (+1% per mark) current HP",
    "Passive: Heal at full stacks (100)",
  ],
);

const KindredE = new Ability(
  "Mounting Dread",
  "E",
  "Mark target. 3rd attack triggers Wolf pounce for missing HP damage",
  {
    cooldown: [14, 12.5, 11, 9.5, 8],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 500,
  },
  {
    baseDamage: [80, 110, 140, 170, 200],
    bonusAdRatio: 100,
    missingHealthRatio: 5,
    damageType: "physical",
  },
  {
    ccType: "slow",
    ccDuration: 1,
    slow: 30,
  },
  undefined,
  undefined,
  [
    "Cost: 50 mana",
    "Range: 500-750 based on marks",
    "3rd hit: 80/110/140/170/200 (+100% bonus AD)",
    "+5% (+0.5% per mark) missing HP",
    "Crit chance increases damage 0-50%",
    "Monster cap: 200",
  ],
);

const KindredR = new Ability(
  "Lamb's Respite",
  "R",
  "Create zone preventing units from dying. Heals all at end",
  {
    cooldown: [160, 140, 120],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 0,
    radius: 500,
  },
  undefined,
  {
    heal: [225, 300, 375],
  },
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "Duration: 4s",
    "Minimum HP: 10% max HP",
    "Heal at end: 225/300/375",
    "Affects all units including enemies",
  ],
);

const Kindred = new Character(
  "Kindred",
  595, // HP
  7, // HP5
  29, // AR
  30, // MR
  65, // AD
  200, // Crit DMG (%)
  325, // MS
  500, // Attack range
  0.625, // Base AS
  [KindredPassive, KindredQ, KindredW, KindredE, KindredR],
  [],
);

// Kled
const KledPassive = new Ability(
  "Skaarl, the Cowardly Lizard",
  "passive",
  "Kled rides Skaarl. When Skaarl's HP depletes, Kled dismounts. Remount by building courage",
  {
    cooldown: [0],
    cooldownType: "static",
  },
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  [
    "Skaarl HP: 400-1400 based on level",
    "Dismounted: 410 + 84/level HP",
    "Dismounted: +250 range, 85-100% AD",
    "Courage from attacking/abilities",
  ],
);

const KledQ = new Ability(
  "Bear Trap on a Rope",
  "Q",
  "Throw trap that tethers and pulls champions",
  {
    cooldown: [11, 10, 9, 8, 7],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 800,
  },
  {
    baseDamage: [90, 165, 240, 315, 390],
    bonusAdRatio: 180,
    damageType: "physical",
  },
  {
    ccType: "slow",
    ccDuration: 2.5,
    slow: [30, 35, 40, 45, 50],
  },
  undefined,
  undefined,
  [
    "Cost: 30 mana",
    "Initial: 30/55/80/105/130 (+60% bonus AD)",
    "Pull: 60/110/160/210/260 (+120% bonus AD)",
    "Reveals for 2.5s",
    "Dismounted: Pocket Pistol instead",
  ],
);

const KledW = new Ability(
  "Violent Tendencies",
  "W",
  "Passive: Gain AS for 4 attacks. 4th attack deals % max HP damage",
  {
    cooldown: [13, 12, 11, 10, 9],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 0,
  },
  {
    baseDamage: [20, 30, 40, 50, 60],
    maxHealthRatio: [4.5, 5, 5.5, 6, 6.5],
    maxHealthRatioPerBonusAD: 2,
    damageType: "physical",
  },
  {
    bonusStats: {
      as: [150, 150, 150, 150, 150],
    },
  },
  undefined,
  undefined,
  [
    "No cost",
    "AS: 150%",
    "4th attack: 20/30/40/50/60",
    "+4.5/5/5.5/6/6.5% (+2% per 100 bonus AD)(+0.4% per 100 bonus HP) max HP",
    "Monster cap: 200",
    "Mounted only",
  ],
);

const KledE = new Ability(
  "Jousting",
  "E",
  "Dash through enemies. Recast to dash through marked target",
  {
    cooldown: [13, 12, 11, 10, 9],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 550,
  },
  {
    baseDamage: [70, 120, 170, 220, 270],
    bonusAdRatio: 110,
    damageType: "physical",
  },
  undefined,
  undefined,
  2,
  [
    "Cost: 50 mana",
    "Per dash: 35/60/85/110/135 (+55% bonus AD)",
    "Marks champions/large monsters for 3s",
    "Grants 50% MS for 1s",
    "Mounted only",
  ],
);

const KledR = new Ability(
  "Chaaaaaaaarge!!!",
  "R",
  "Charge toward location, gaining shield. Dash to first visible enemy champion",
  {
    cooldown: [140, 125, 110],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 3500,
  },
  {
    baseDamage: [0],
    maxHealthRatio: [12, 18, 24],
    damageType: "magic",
  },
  {
    ccType: "knockup",
    ccDuration: 0.5,
    shield: [200, 300, 400],
  },
  undefined,
  undefined,
  [
    "No cost",
    "Min damage: 4/6/8% (+3% per 100 bonus AD) max HP",
    "Max damage: 12/18/24% (+9% per 100 bonus AD) max HP",
    "Shield: 20-400 (+30-300% bonus AD) based on charge",
    "Trail: 40% MS for allies",
    "Ghosted and CC immune during charge",
  ],
);

const Kled = new Character(
  "Kled",
  410, // HP
  6, // HP5
  35, // AR
  28, // MR
  65, // AD
  200, // Crit DMG (%)
  345, // MS
  125, // Attack range
  0.625, // Base AS
  [KledPassive, KledQ, KledW, KledE, KledR],
  [],
);

// Kog'Maw
const KogMawPassive = new Ability(
  "Icathian Surprise",
  "passive",
  "Upon death, become a zombie then explode for true damage",
  {
    cooldown: [0],
    cooldownType: "static",
  },
  undefined,
  {
    baseDamage: (level: number) => 140 + (510 * (level - 1)) / 17,
    damageType: "true",
  },
  undefined,
  undefined,
  undefined,
  [
    "Zombie duration: 4s",
    "Damage: 140-650 based on level",
    "Untargetable and ghosted",
    "MS: 10% to 50% over duration",
  ],
);

const KogMawQ = new Ability(
  "Caustic Spittle",
  "Q",
  "Fire corrosive projectile that damages and shreds resistances. Passive: Bonus AS",
  {
    cooldown: [7],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 1200,
  },
  {
    baseDamage: [80, 125, 170, 215, 260],
    apRatio: 90,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 40 mana",
    "Passive AS: 5/10/15/20/25%",
    "Armor/MR shred: 16/20/24/28/32% for 4s",
  ],
);

const KogMawW = new Ability(
  "Bio-Arcane Barrage",
  "W",
  "Gain bonus range and attacks deal % max HP magic damage",
  {
    cooldown: [17],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 0,
  },
  {
    baseDamage: [0],
    maxHealthRatio: [3, 3.75, 4.5, 5.25, 6],
    maxHealthRatioPerAP: 1.5,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 40 mana",
    "Duration: 8s",
    "Bonus range: 130/150/170/190/210",
    "% Max HP: 3/3.75/4.5/5.25/6% (+1.5% per 100 AP)",
    "Cap vs minions/monsters: 100",
  ],
);

const KogMawE = new Ability(
  "Void Ooze",
  "E",
  "Fire ooze that damages and leaves slowing trail",
  {
    cooldown: [12],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 1360,
    radius: 120,
  },
  {
    baseDamage: [70, 110, 150, 190, 230],
    apRatio: 65,
    damageType: "magic",
  },
  {
    ccType: "slow",
    ccDuration: 3,
    slow: [40, 45, 50, 55, 60],
  },
  undefined,
  undefined,
  ["Cost: 40/55/70/85/100 mana", "Trail duration: 1s"],
);

const KogMawR = new Ability(
  "Living Artillery",
  "R",
  "Fire artillery at location dealing damage scaling with missing HP",
  {
    cooldown: [2, 1.5, 1],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 1800,
    radius: 240,
  },
  {
    baseDamage: [100, 140, 180],
    bonusAdRatio: 75,
    apRatio: 45,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 40 mana (stacking)",
    "Range: 1300/1550/1800",
    "Min: 100/140/180 (+75% bonus AD)(+35/40/45% AP)",
    "Max: 200/280/360 (+150% bonus AD)(+70/80/90% AP)",
    "Damage scales 0-100% with missing HP",
    "100% bonus at 40% HP or below",
  ],
);

const KogMaw = new Character(
  "Kog'Maw",
  635, // HP
  3.75, // HP5
  24, // AR
  30, // MR
  61, // AD
  200, // Crit DMG (%)
  330, // MS
  500, // Attack range
  0.665, // Base AS
  [KogMawPassive, KogMawQ, KogMawW, KogMawE, KogMawR],
  [],
);

// LeBlanc
const LeBlancPassive = new Ability(
  "Mirror Image",
  "passive",
  "When LeBlanc drops below 40% health, she becomes invisible and creates a controllable clone",
  {
    cooldown: [60],
    cooldownType: "static",
  },
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  [
    "Cooldown: 60s",
    "Invisibility: 1s",
    "Clone duration: 8s",
    "Clone deals no damage",
  ],
);

const LeBlancQ = new Ability(
  "Sigil of Malice",
  "Q",
  "Projects a sigil dealing magic damage and marking target. Damaging marked target detonates for bonus damage",
  {
    cooldown: [11, 10, 9, 8, 7],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 700,
  },
  {
    baseDamage: [70, 140, 210, 280, 350],
    apRatio: 40,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 50/55/60/65/70 mana",
    "Mark duration: 3.5s",
    "Detonation: Same damage again",
    "Kill refunds 100% mana and 30% cooldown",
    "Bonus minion damage: 10-146",
  ],
);

const LeBlancW = new Ability(
  "Distortion",
  "W",
  "Dashes to target location dealing AoE magic damage. Can recast to return to starting position",
  {
    cooldown: [15, 13.75, 12.5, 11.25, 10],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 600,
    radius: 250,
  },
  {
    baseDamage: [75, 115, 155, 195, 235],
    apRatio: 80,
    damageType: "magic",
  },
  undefined,
  undefined,
  1,
  [
    "Cost: 60/70/80/90/100 mana",
    "Recast window: 4s",
    "Can return to starting position",
  ],
);

const LeBlancE = new Ability(
  "Ethereal Chains",
  "E",
  "Launches a chain that shackles first enemy hit. If they remain tethered, roots and deals bonus damage",
  {
    cooldown: [12, 11, 10, 9, 8],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 925,
  },
  {
    baseDamage: [50, 70, 90, 110, 130],
    apRatio: 35,
    damageType: "magic",
  },
  {
    ccType: "root",
    ccDuration: 1.5,
  },
  undefined,
  undefined,
  [
    "Cost: 50 mana",
    "Initial damage: 50-130 (+35% AP)",
    "Root damage: 80-240 (+85% AP)",
    "Tether duration: 1.5s before root",
    "Root duration: 1.5s",
  ],
);

const LeBlancR = new Ability(
  "Mimic",
  "R",
  "Casts a mimicked version of most recently used ability with increased damage",
  {
    cooldown: [45, 35, 25],
    cooldownType: "standard",
  },
  undefined,
  {
    baseDamage: [150, 300, 450],
    apRatio: 75,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "No cost",
    "Mimic Q: 70-210 (+40% AP) initial, 140-420 (+80% AP) root",
    "Mimic W: 150-450 (+75% AP)",
    "Mimic E: Same as Q pattern",
  ],
);

const LeBlanc = new Character(
  "LeBlanc",
  598, // HP
  7.5, // HP5
  22, // AR
  30, // MR
  55, // AD
  200, // Crit DMG (%)
  340, // MS
  525, // Attack range
  0.658, // Base AS
  [LeBlancPassive, LeBlancQ, LeBlancW, LeBlancE, LeBlancR],
  [],
);

// Lee Sin
const LeeSinPassive = new Ability(
  "Flurry",
  "passive",
  "After using an ability, Lee Sin's next 2 basic attacks gain attack speed and restore energy",
  {
    cooldown: [0],
    cooldownType: "static",
  },
  undefined,
  undefined,
  {
    bonusStats: {
      as: 50,
    },
  },
  undefined,
  undefined,
  ["Attack speed: +50%", "Energy restored: 10 per hit", "Lasts for 2 attacks"],
);

const LeeSinQ = new Ability(
  "Sonic Wave / Resonating Strike",
  "Q",
  "Projects a wave dealing physical damage. Recast to dash to target dealing bonus damage based on missing health",
  {
    cooldown: [11, 10, 9, 8, 7],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 1200,
  },
  {
    baseDamage: [50, 80, 110, 140, 170],
    bonusAdRatio: 115,
    missingHealthRatio: 10,
    damageType: "physical",
  },
  undefined,
  undefined,
  3,
  [
    "Cost: 50 energy",
    "Sonic Wave: 50-170 (+115% bonus AD)",
    "Resonating Strike: Same + 10% target missing HP",
    "Max total: 100-300 (+200% bonus AD)",
    "Recast window: 3s",
  ],
);

const LeeSinW = new Ability(
  "Safeguard / Iron Will",
  "W",
  "Dashes to ally, shielding both. Recast grants lifesteal and spell vamp",
  {
    cooldown: [12],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 700,
  },
  undefined,
  {
    shield: [70, 115, 160, 205, 250],
    duration: 2,
  },
  undefined,
  3,
  [
    "Cost: 50 energy",
    "Shield: 70-250 (+80% AP)",
    "Iron Will: 10-26% lifesteal/spell vamp for 4s",
    "50% reduced cooldown if on champion",
  ],
);

const LeeSinE = new Ability(
  "Tempest / Cripple",
  "E",
  "Smashes ground dealing magic damage and revealing enemies. Recast slows revealed enemies",
  {
    cooldown: [8],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    radius: 350,
  },
  {
    baseDamage: [35, 60, 85, 110, 135],
    bonusAdRatio: 100,
    damageType: "magic",
  },
  {
    ccType: "slow",
    ccDuration: 4,
    slow: [35, 45, 55, 65, 75],
  },
  undefined,
  3,
  [
    "Cost: 50 energy",
    "Tempest: 35-135 (+100% bonus AD) magic",
    "Reveals for 4s",
    "Cripple slow: 35-75% decaying",
  ],
);

const LeeSinR = new Ability(
  "Dragon's Rage",
  "R",
  "Roundhouse kick knocking back target and dealing physical damage. Knocked back enemy damages and knocks up enemies hit",
  {
    cooldown: [12],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 375,
  },
  {
    baseDamage: [175, 400, 625],
    bonusAdRatio: 190,
    damageType: "physical",
  },
  {
    ccType: "knockup",
    ccDuration: 1,
  },
  undefined,
  undefined,
  [
    "No cost",
    "Damage: 175-625 (+190% bonus AD)",
    "Collision damage: Same to enemies hit",
  ],
);

const LeeSin = new Character(
  "Lee Sin",
  645, // HP
  7.5, // HP5
  36, // AR
  32, // MR
  66, // AD
  200, // Crit DMG (%)
  345, // MS
  125, // Attack range
  0.651, // Base AS
  [LeeSinPassive, LeeSinQ, LeeSinW, LeeSinE, LeeSinR],
  [],
);

// Leona
const LeonaPassive = new Ability(
  "Sunlight",
  "passive",
  "Abilities mark enemies with Sunlight. Allied champions consume marks to deal bonus magic damage",
  {
    cooldown: [0],
    cooldownType: "static",
  },
  undefined,
  {
    baseDamage: [
      32, 40, 48, 56, 64, 72, 80, 88, 96, 104, 112, 120, 128, 136, 144, 152,
      160, 168,
    ],
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Damage: 32-168 based on level",
    "Leona cannot trigger her own marks",
    "Duration: 1.5s",
  ],
);

const LeonaQ = new Ability(
  "Shield of Daybreak",
  "Q",
  "Empowers next basic attack to deal bonus magic damage and stun",
  {
    cooldown: [9, 8, 7, 6, 5],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 125,
  },
  {
    baseDamage: [10, 35, 60, 85, 110],
    apRatio: 30,
    damageType: "magic",
  },
  {
    ccType: "stun",
    ccDuration: 1,
  },
  undefined,
  undefined,
  [
    "Cost: 35/40/45/50/55 mana",
    "Damage: 10-110 (+30% AP)",
    "Stun: 1s",
    "Resets auto attack timer",
  ],
);

const LeonaW = new Ability(
  "Eclipse",
  "W",
  "Gains bonus armor and magic resistance. After duration, deals magic damage to nearby enemies",
  {
    cooldown: [12, 10.5, 9, 7.5, 6],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    radius: 275,
  },
  {
    baseDamage: [45, 80, 115, 150, 185],
    apRatio: 40,
    damageType: "magic",
  },
  {
    bonusStats: {
      armor: [20, 25, 30, 35, 40],
      mr: [20, 25, 30, 35, 40],
    },
    duration: 3,
  },
  undefined,
  undefined,
  [
    "Cost: 60 mana",
    "Bonus resistances: 20-40",
    "Flat damage reduction: 8-24 (max 50%)",
    "Duration extended 3s if detonation hits",
  ],
);

const LeonaE = new Ability(
  "Zenith Blade",
  "E",
  "Projects solar image, dealing magic damage. Dashes to last enemy champion hit and briefly roots them",
  {
    cooldown: [14, 13, 12, 11, 10],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 875,
  },
  {
    baseDamage: [60, 100, 140, 180, 220],
    apRatio: 40,
    damageType: "magic",
  },
  {
    ccType: "root",
    ccDuration: 0.5,
  },
  undefined,
  undefined,
  [
    "Cost: 60 mana",
    "Damage: 60-220 (+40% AP)",
    "Root: 0.5s",
    "Dashes to last champion hit",
  ],
);

const LeonaR = new Ability(
  "Solar Flare",
  "R",
  "Calls down solar energy dealing magic damage. Center stuns, outer area slows",
  {
    cooldown: [90, 75, 60],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 1200,
    radius: 300,
  },
  {
    baseDamage: [100, 175, 250],
    apRatio: 100,
    damageType: "magic",
  },
  {
    ccType: "stun",
    ccDuration: 1.75,
    slow: 80,
  },
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "Damage: 100-250 (+100% AP)",
    "Center: Stun 1.75s",
    "Outer: Slow 80% for 1.75s",
  ],
);

const Leona = new Character(
  "Leona",
  646, // HP
  8.5, // HP5
  43, // AR
  32, // MR
  60, // AD
  200, // Crit DMG (%)
  335, // MS
  125, // Attack range
  0.625, // Base AS
  [LeonaPassive, LeonaQ, LeonaW, LeonaE, LeonaR],
  [],
);

// Lillia
const LilliaPassive = new Ability(
  "Dream-Laden Bough",
  "passive",
  "Abilities apply Dream Dust dealing max HP% magic damage over time and healing Lillia",
  {
    cooldown: [0],
    cooldownType: "static",
  },
  undefined,
  {
    baseDamage: [0],
    maxHealthRatio: 5,
    maxHealthRatioPerAP: 1.25,
    damageType: "magic",
  },
  {
    heal: [6, 90],
    duration: 3,
  },
  undefined,
  undefined,
  [
    "Damage: 5% (+1.25% per 100 AP) max HP over 3s",
    "Capped at 40-100 vs monsters",
    "Heal: 6-90 (+30% AP) vs champions",
    "Reduced to 15% for targets beyond first",
  ],
);

const LilliaQ = new Ability(
  "Blooming Blows",
  "Q",
  "Swings censer dealing magic damage. Outer edge deals bonus true damage. Grants movement speed stacks",
  {
    cooldown: [4],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    radius: 485,
  },
  {
    baseDamage: [30, 45, 60, 75, 90],
    apRatio: 40,
    damageType: "magic",
  },
  {
    bonusStats: {
      ms: [7, 8, 9, 10, 11],
    },
    duration: 5,
  },
  undefined,
  undefined,
  [
    "Cost: 45 mana",
    "Inner: 30-90 (+40% AP) magic",
    "Outer: Same as bonus true damage",
    "Prance stacks: Up to 5, +7-11% MS each",
    "+1% MS per 100 AP per stack",
  ],
);

const LilliaW = new Ability(
  "Watch Out! Eep!",
  "W",
  "Rushes and crashes down dealing magic damage. Center deals increased damage",
  {
    cooldown: [14, 13, 12, 11, 10],
    cooldownType: "standard",
  },
  {
    castTime: 0.75,
    range: 500,
    radius: 250,
  },
  {
    baseDamage: [70, 85, 100, 115, 130],
    apRatio: 30,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 50 mana",
    "Outer: 70-130 (+30% AP)",
    "Center: 200% damage (140-260 +60% AP)",
    "50% damage to minions",
  ],
);

const LilliaE = new Ability(
  "Swirlseed",
  "E",
  "Lobs a seed dealing magic damage and slowing. Rolls until hitting an enemy or terrain",
  {
    cooldown: [12],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 750,
    radius: 150,
  },
  {
    baseDamage: [60, 85, 110, 135, 160],
    apRatio: 50,
    damageType: "magic",
  },
  {
    ccType: "slow",
    ccDuration: 3,
    slow: 40,
  },
  undefined,
  undefined,
  [
    "Cost: 70 mana",
    "Damage: 60-160 (+50% AP)",
    "Slow: 40% for 3s",
    "Reveals enemies hit",
  ],
);

const LilliaR = new Ability(
  "Lilting Lullaby",
  "R",
  "Causes all Dream Dusted enemies to become drowsy then fall asleep. Damage wakes and deals bonus damage",
  {
    cooldown: [140, 120, 100],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 99999,
  },
  {
    baseDamage: [150, 200, 250],
    apRatio: 45,
    damageType: "magic",
  },
  {
    ccType: "stun",
    ccDuration: 2,
  },
  undefined,
  undefined,
  [
    "Cost: 50 mana",
    "Global range - affects Dream Dusted enemies",
    "Drowsy: 1.5s",
    "Sleep: 2s",
    "Wake damage: 150-250 (+45% AP)",
  ],
);

const Lillia = new Character(
  "Lillia",
  605, // HP
  2.5, // HP5
  22, // AR
  32, // MR
  61, // AD
  200, // Crit DMG (%)
  330, // MS
  325, // Attack range
  0.625, // Base AS
  [LilliaPassive, LilliaQ, LilliaW, LilliaE, LilliaR],
  [],
);

// Lissandra
const LissandraPassive = new Ability(
  "Iceborn Subjugation",
  "passive",
  "When enemy champions die near Lissandra, they become Frozen Thralls that chase enemies and explode",
  {
    cooldown: [0],
    cooldownType: "static",
  },
  undefined,
  {
    baseDamage: [
      120, 130, 140, 150, 160, 170, 180, 200, 220, 240, 260, 280, 320, 360, 400,
      440, 480, 520,
    ],
    apRatio: 30,
    damageType: "magic",
  },
  {
    ccType: "slow",
    slow: 25,
  },
  undefined,
  undefined,
  [
    "Damage: 120-520 based on level (+30% AP)",
    "Thrall duration: 4s",
    "Slow: 25%",
  ],
);

const LissandraQ = new Ability(
  "Ice Shard",
  "Q",
  "Throws a spear of ice that shatters on first enemy hit, dealing damage and slowing in a line",
  {
    cooldown: [10, 8.5, 7, 5.5, 4],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 825,
  },
  {
    baseDamage: [80, 115, 150, 185, 220],
    apRatio: 75,
    damageType: "magic",
  },
  {
    ccType: "slow",
    ccDuration: 1.5,
    slow: [20, 24, 28, 32, 36],
  },
  undefined,
  undefined,
  [
    "Cost: 60/65/70/75/80 mana",
    "Damage: 80-220 (+75% AP)",
    "Slow: 20-36% for 1.5s",
  ],
);

const LissandraW = new Ability(
  "Ring of Frost",
  "W",
  "Creates an ice field rooting and damaging nearby enemies",
  {
    cooldown: [10, 9.5, 9, 8.5, 8],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    radius: 450,
  },
  {
    baseDamage: [70, 105, 140, 175, 210],
    apRatio: 70,
    damageType: "magic",
  },
  {
    ccType: "root",
    ccDuration: 1.25,
  },
  undefined,
  undefined,
  [
    "Cost: 40 mana",
    "Damage: 70-210 (+70% AP)",
    "Root: 1.25-1.65s based on rank",
  ],
);

const LissandraE = new Ability(
  "Glacial Path",
  "E",
  "Casts an ice claw dealing damage. Can recast to teleport to claw's location",
  {
    cooldown: [12, 11, 10, 9, 8],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 1050,
  },
  {
    baseDamage: [70, 105, 140, 175, 210],
    apRatio: 60,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 80/85/90/95/100 mana",
    "Damage: 70-210 (+60% AP)",
    "Claw travel time: ~1.5s",
  ],
);

const LissandraR = new Ability(
  "Frozen Tomb",
  "R",
  "Can self-cast for stasis and heal, or target enemy for stun. Both create damaging ice zone",
  {
    cooldown: [120, 100, 80],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 550,
    radius: 550,
  },
  {
    baseDamage: [150, 250, 350],
    apRatio: 75,
    damageType: "magic",
  },
  {
    ccType: "stun",
    ccDuration: 1.5,
    slow: [45, 60, 75],
    heal: [100, 150, 200],
  },
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "Damage: 150-350 (+75% AP)",
    "Self: Stasis 2.5s, heal 100-200 (+55% AP)",
    "Heal increased by 0-100% based on missing HP",
    "Enemy: Stun 1.5s",
    "Ice zone slows 45-75% for 3s",
  ],
);

const Lissandra = new Character(
  "Lissandra",
  620, // HP
  7, // HP5
  22, // AR
  30, // MR
  55, // AD
  200, // Crit DMG (%)
  325, // MS
  550, // Attack range
  0.656, // Base AS
  [LissandraPassive, LissandraQ, LissandraW, LissandraE, LissandraR],
  [],
);

// Lucian
const LucianPassive = new Ability(
  "Lightslinger",
  "passive",
  "After using an ability, Lucian's next basic attack fires two shots. Second shot deals reduced damage",
  {
    cooldown: [0],
    cooldownType: "static",
  },
  undefined,
  {
    baseDamage: [0],
    adRatio: 50,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Second shot: 50/55/60% AD at levels 1/7/13",
    "Reduced vs champions: 30/40/50%",
    "Second shot can crit",
    "Duration: 3s after ability",
  ],
);

const LucianVigilance = new Ability(
  "Vigilance",
  "passive",
  "Ally buffs and nearby enemy immobilization empower Lucian's next attacks to deal bonus magic damage",
  {
    cooldown: [0],
    cooldownType: "static",
  },
  undefined,
  {
    baseDamage: [14],
    adRatio: 20,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Bonus damage: 14 (+20% AD) magic on-hit",
    "Stacks up to 4 attacks",
    "Triggers on ally buffs or nearby CC",
  ],
);

const LucianQ = new Ability(
  "Piercing Light",
  "Q",
  "Fires a laser through target dealing physical damage to all enemies in a line",
  {
    cooldown: [9, 8, 7, 6, 5],
    cooldownType: "standard",
  },
  {
    castTime: 0.4,
    range: 500,
  },
  {
    baseDamage: [80, 115, 150, 185, 220],
    bonusAdRatio: 100,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 48/56/64/72/80 mana",
    "Damage: 80-220 (+100% bonus AD)",
    "Line range: 1000",
  ],
);

const LucianW = new Ability(
  "Ardent Blaze",
  "W",
  "Fires a shot that explodes in a cross pattern. Hitting marked enemies grants Lucian movement speed",
  {
    cooldown: [14, 13, 12, 11, 10],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 900,
    radius: 100,
  },
  {
    baseDamage: [85, 115, 145, 175, 205],
    apRatio: 90,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 50 mana",
    "Damage: 85-205 (+90% AP)",
    "Mark duration: 6s",
    "Move speed: 60-80 for 1s",
  ],
);

const LucianE = new Ability(
  "Relentless Pursuit",
  "E",
  "Dashes a short distance. Lightslinger hits reduce cooldown",
  {
    cooldown: [19, 17.75, 16.5, 15.25, 14],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 425,
  },
  undefined,
  undefined,
  undefined,
  undefined,
  [
    "Cost: 40/30/20/10/0 mana",
    "Cooldown reduced 1s per Lightslinger hit",
    "2s reduction on champion hits",
    "Resets auto attack timer",
  ],
);

const LucianR = new Ability(
  "The Culling",
  "R",
  "Fires rapidly in a direction for 3 seconds. Shots increase with critical strike chance",
  {
    cooldown: [110, 100, 90],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 1200,
  },
  {
    baseDamage: [15, 30, 45],
    adRatio: 25,
    apRatio: 15,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "Shots: 22/28 (+1 per 4% crit)",
    "Damage per shot: 15-45 (+25% AD)(+15% AP)",
    "Total: 330-1260 (+550% AD)(+330% AP)",
    "Duration: 3s, can move while firing",
  ],
);

const Lucian = new Character(
  "Lucian",
  641, // HP
  3.75, // HP5
  28, // AR
  30, // MR
  60, // AD
  200, // Crit DMG (%)
  335, // MS
  500, // Attack range
  0.638, // Base AS
  [LucianPassive, LucianVigilance, LucianQ, LucianW, LucianE, LucianR],
  [],
);

// Lulu
const LuluPassive = new Ability(
  "Pix, Faerie Companion",
  "passive",
  "Pix fires bolts at Lulu's attack target, dealing bonus magic damage",
  {
    cooldown: [0],
    cooldownType: "static",
  },
  undefined,
  {
    baseDamage: [
      15, 21, 27, 33, 39, 45, 51, 57, 63, 69, 75, 81, 87, 93, 99, 105, 111, 117,
    ],
    apRatio: 15,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "3 bolts: 5-39 each based on level",
    "Total: 15-117 (+15% AP)",
    "Can be blocked by minions",
  ],
  true,
);

const LuluQ = new Ability(
  "Glitterlance",
  "Q",
  "Lulu and Pix each fire a bolt dealing magic damage and slowing enemies",
  {
    cooldown: [7, 6.5, 6, 5.5, 5],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 925,
  },
  {
    baseDamage: [70, 105, 140, 175, 210],
    apRatio: 40,
    damageType: "magic",
  },
  {
    ccType: "slow",
    ccDuration: 2,
    slow: 80,
  },
  undefined,
  undefined,
  [
    "Cost: 50/55/60/65/70 mana",
    "Lulu bolt: 70-210 (+40% AP)",
    "Pix bolt: 49-147 (+28% AP)",
    "Second hit: 25% damage",
    "Slow: 80% decaying over 2s",
  ],
);

const LuluW = new Ability(
  "Whimsy",
  "W",
  "On ally: Grants attack speed and movement speed. On enemy: Polymorphs them",
  {
    cooldown: [17, 16, 15, 14, 13],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 650,
  },
  undefined,
  {
    ccType: "stun",
    ccDuration: 1.2,
    bonusStats: {
      as: [20, 22.5, 25, 27.5, 30],
      ms: 20,
    },
    duration: 3,
  },
  undefined,
  undefined,
  [
    "Cost: 65 mana",
    "Ally: 20-30% AS, 20% (+5% per 100 AP) MS",
    "Duration: 3-4s based on rank",
    "Enemy: Polymorph 1.2-2s",
  ],
);

const LuluE = new Ability(
  "Help, Pix!",
  "E",
  "On ally: Shields and attaches Pix. On enemy: Deals damage and grants vision",
  {
    cooldown: [16, 15, 14, 13, 12],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 650,
  },
  {
    baseDamage: [80, 125, 170, 215, 260],
    apRatio: 40,
    damageType: "magic",
  },
  {
    shield: [80, 125, 170, 215, 260],
    duration: 4,
  },
  undefined,
  undefined,
  [
    "Cost: 60/65/70/75/80 mana",
    "Shield: 80-260 (+60% AP)",
    "Damage: 80-260 (+40% AP)",
    "Pix follows target for 4s",
  ],
);

const LuluR = new Ability(
  "Wild Growth",
  "R",
  "Enlarges ally, knocking up nearby enemies and granting bonus health. Aura slows enemies",
  {
    cooldown: [120, 100, 80],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 900,
    radius: 300,
  },
  undefined,
  {
    ccType: "knockup",
    ccDuration: 1,
    slow: [30, 45, 60],
    duration: 7,
  },
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "Bonus HP: 275/525/575 (+55% AP)",
    "Knockup: 1s on nearby enemies",
    "Aura slow: 30-60% while in range",
    "Duration: 7s",
  ],
);

const Lulu = new Character(
  "Lulu",
  565, // HP
  6, // HP5
  26, // AR
  30, // MR
  47, // AD
  200, // Crit DMG (%)
  330, // MS
  550, // Attack range
  0.625, // Base AS
  [LuluPassive, LuluQ, LuluW, LuluE, LuluR],
  [],
);

// Lux
const LuxPassive = new Ability(
  "Illumination",
  "passive",
  "Abilities mark enemies. Lux's basic attacks or R consume marks to deal bonus magic damage",
  {
    cooldown: [0],
    cooldownType: "static",
  },
  undefined,
  {
    baseDamage: [
      30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180,
      190, 200,
    ],
    apRatio: 25,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Damage: 30-200 based on level (+25% AP)",
    "Mark duration: 6s",
    "R refreshes marks and can detonate them",
  ],
);

const LuxQ = new Ability(
  "Light Binding",
  "Q",
  "Fires a ball of light rooting up to two enemies",
  {
    cooldown: [11, 10.5, 10, 9.5, 9],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 1240,
  },
  {
    baseDamage: [65, 115, 165, 215, 265],
    apRatio: 80,
    damageType: "magic",
  },
  {
    ccType: "root",
    ccDuration: 2,
  },
  undefined,
  undefined,
  [
    "Cost: 50 mana",
    "Damage: 65-265 (+80% AP)",
    "Root: 2s",
    "Binds up to 2 targets",
  ],
);

const LuxW = new Ability(
  "Prismatic Barrier",
  "W",
  "Throws wand outward and back, shielding Lux and allies hit. Can stack twice",
  {
    cooldown: [11],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 1175,
  },
  undefined,
  {
    shield: [40, 55, 70, 85, 100],
    duration: 2.5,
  },
  undefined,
  undefined,
  [
    "Cost: 60/65/70/75/80 mana",
    "Shield per hit: 40-100 (+35% AP)",
    "Stacks: Can shield twice",
    "Max shield: 80-200 (+70% AP)",
  ],
);

const LuxE = new Ability(
  "Lucent Singularity",
  "E",
  "Creates a light zone slowing enemies. Can detonate early to deal magic damage",
  {
    cooldown: [11],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 1100,
    radius: 300,
  },
  {
    baseDamage: [80, 120, 160, 200, 240],
    apRatio: 80,
    damageType: "magic",
  },
  {
    ccType: "slow",
    ccDuration: 1,
    slow: [25, 30, 35, 40, 45],
  },
  undefined,
  undefined,
  [
    "Cost: 70/80/90/100/110 mana",
    "Damage: 80-240 (+80% AP)",
    "Slow: 25-45%",
    "Zone duration: 5s",
    "Slow lingers 1s after leaving",
  ],
);

const LuxR = new Ability(
  "Final Spark",
  "R",
  "Fires a beam of light dealing massive magic damage and revealing enemies",
  {
    cooldown: [60, 50, 40],
    cooldownType: "standard",
  },
  {
    castTime: 1,
    range: 3400,
    radius: 100,
  },
  {
    baseDamage: [300, 400, 500],
    apRatio: 120,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "Damage: 300-500 (+120% AP)",
    "Detonates Illumination marks",
    "Reveals and applies new mark",
  ],
);

const Lux = new Character(
  "Lux",
  580, // HP
  5.5, // HP5
  21, // AR
  30, // MR
  54, // AD
  200, // Crit DMG (%)
  330, // MS
  550, // Attack range
  0.669, // Base AS
  [LuxPassive, LuxQ, LuxW, LuxE, LuxR],
  [],
);

// Malphite
const MalphitePassive = new Ability(
  "Granite Shield",
  "passive",
  "Malphite is shielded by rock absorbing damage up to 10% of his max health. Recharges after not taking damage",
  {
    cooldown: [8, 7, 6],
    cooldownType: "static",
  },
  undefined,
  undefined,
  {
    shield: 10,
  },
  undefined,
  undefined,
  [
    "Shield: 10% max HP",
    "Recharge: 8/7/6s (levels 1/7/13)",
    "Recharges if no damage taken",
  ],
);

const MalphiteQ = new Ability(
  "Seismic Shard",
  "Q",
  "Deals magic damage and steals movement speed from target",
  {
    cooldown: [8],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 625,
  },
  {
    baseDamage: [80, 120, 160, 200, 240],
    apRatio: 60,
    damageType: "magic",
  },
  {
    ccType: "slow",
    ccDuration: 3,
    slow: [20, 25, 30, 35, 40],
  },
  undefined,
  undefined,
  [
    "Cost: 70/75/80/85/90 mana",
    "Damage: 80-240 (+60% AP)",
    "Steals 20-40% MS for 3s",
  ],
);

const MalphiteW = new Ability(
  "Thunderclap",
  "W",
  "Passive grants bonus armor (tripled with shield). Active empowers attacks to deal AoE damage",
  {
    cooldown: [10, 9.5, 9, 8.5, 8],
    cooldownType: "standard",
  },
  {
    castTime: 0,
  },
  {
    baseDamage: [30, 40, 50, 60, 70],
    apRatio: 20,
    damageType: "physical",
  },
  {
    bonusStats: {
      armor: [10, 15, 20, 25, 30],
    },
    duration: 6,
  },
  undefined,
  undefined,
  [
    "Cost: 25 mana",
    "Passive: 10-30% bonus armor",
    "With shield: 30-90% bonus armor",
    "Active: 30-70 (+20% AP)(+20% armor) cleave",
  ],
);

const MalphiteE = new Ability(
  "Ground Slam",
  "E",
  "Slams ground dealing magic damage and reducing attack speed of nearby enemies",
  {
    cooldown: [7],
    cooldownType: "standard",
  },
  {
    castTime: 0.2419,
    radius: 400,
  },
  {
    baseDamage: [70, 110, 150, 190, 230],
    apRatio: 20,
    damageType: "magic",
  },
  {
    ccType: "slow",
    ccDuration: 3,
  },
  undefined,
  undefined,
  [
    "Cost: 50/55/60/65/70 mana",
    "Damage: 70-230 (+20% AP)(+40% armor)",
    "AS slow: 30-50% for 3s",
  ],
);

const MalphiteR = new Ability(
  "Unstoppable Force",
  "R",
  "Dashes to location, knocking up and dealing magic damage to enemies in the area",
  {
    cooldown: [130, 105, 80],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 1000,
    radius: 325,
  },
  {
    baseDamage: [200, 300, 400],
    apRatio: 90,
    damageType: "magic",
  },
  {
    ccType: "knockup",
    ccDuration: 1.5,
  },
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "Damage: 200-400 (+90% AP)",
    "Knockup: 1.5s",
    "Unstoppable during dash",
  ],
);

const Malphite = new Character(
  "Malphite",
  665, // HP
  7, // HP5
  40, // AR
  28, // MR
  62, // AD
  200, // Crit DMG (%)
  335, // MS
  125, // Attack range
  0.736, // Base AS
  [MalphitePassive, MalphiteQ, MalphiteW, MalphiteE, MalphiteR],
  [],
);

// Malzahar
const MalzaharPassive = new Ability(
  "Void Shift",
  "passive",
  "After avoiding damage, Malzahar gains a shield that blocks CC and damage",
  {
    cooldown: [30, 24, 18, 12],
    cooldownType: "static",
  },
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  [
    "Cooldown: 30/24/18/12s (levels 1/6/11/16)",
    "Blocks next CC and 90% of damage",
    "Lingers 0.25s after taking damage",
  ],
);

const MalzaharQ = new Ability(
  "Call of the Void",
  "Q",
  "Opens two portals that fire projectiles, dealing damage and silencing enemies hit by both",
  {
    cooldown: [6],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 900,
    radius: 400,
  },
  {
    baseDamage: [70, 105, 140, 175, 210],
    apRatio: 80,
    damageType: "magic",
  },
  {
    ccType: "stun",
    ccDuration: 1,
  },
  undefined,
  undefined,
  [
    "Cost: 80/85/90/95/100 mana",
    "Damage: 70-210 (+80% AP)",
    "Silence: 1-2s (if hit by both)",
  ],
);

const MalzaharW = new Ability(
  "Void Swarm",
  "W",
  "Summons Voidlings that attack nearby enemies. Gains stacks from other abilities",
  {
    cooldown: [8],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 150,
  },
  {
    baseDamage: [30, 35, 40, 45, 50],
    apRatio: 20,
    bonusAdRatio: 40,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 40/45/50/55/60 mana",
    "Voidling damage: 30-50 (+40% bonus AD)(+20% AP)",
    "200% damage vs Malefic Visions targets",
    "Up to 3 Voidlings per cast with stacks",
  ],
);

const MalzaharE = new Ability(
  "Malefic Visions",
  "E",
  "Infects target with visions dealing damage over time. Spreads on kill and refreshes with Q or R",
  {
    cooldown: [11, 10, 9, 8, 7],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 650,
  },
  {
    baseDamage: [80, 115, 150, 185, 220],
    apRatio: 80,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 60/70/80/90/100 mana",
    "Damage: 80-220 (+80% AP) over 4s",
    "Spreads on kill, refunds 2% max mana",
    "Executes minions below 10-30 HP",
  ],
);

const MalzaharR = new Ability(
  "Nether Grasp",
  "R",
  "Suppresses target champion dealing damage and creating a damage zone beneath them",
  {
    cooldown: [140, 110, 80],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 700,
    radius: 250,
  },
  {
    baseDamage: [125, 200, 275],
    apRatio: 80,
    maxHealthRatio: 10,
    maxHealthRatioPerAP: 2.5,
    damageType: "magic",
  },
  {
    ccType: "stun",
    ccDuration: 2.5,
  },
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "Beam: 125-275 (+80% AP)",
    "Null Zone: 10/15/20% (+2.5% per 100 AP) max HP",
    "Suppress: 2.5s",
  ],
);

const Malzahar = new Character(
  "Malzahar",
  580, // HP
  6, // HP5
  18, // AR
  30, // MR
  55, // AD
  200, // Crit DMG (%)
  335, // MS
  500, // Attack range
  0.625, // Base AS
  [MalzaharPassive, MalzaharQ, MalzaharW, MalzaharE, MalzaharR],
  [],
);

// Maokai
const MaokaiPassive = new Ability(
  "Sap Magic",
  "passive",
  "Periodically heals on next basic attack. Cooldown reduced by spells cast and received",
  {
    cooldown: [30, 25, 20],
    cooldownType: "static",
  },
  undefined,
  undefined,
  {
    heal: [10, 130],
  },
  undefined,
  undefined,
  [
    "Heal: 10-130 (+4.5-10.5% max HP)",
    "Cooldown: 30/25/20s (levels 1/7/13)",
    "-4s per spell cast or received",
    "Won't trigger above 95% HP",
  ],
);

const MaokaiQ = new Ability(
  "Bramble Smash",
  "Q",
  "Smashes ground dealing damage, slowing, and knocking back nearby enemies",
  {
    cooldown: [8, 7.5, 7, 6.5, 6],
    cooldownType: "standard",
  },
  {
    castTime: 0.35,
    range: 600,
    radius: 150,
  },
  {
    baseDamage: [65, 110, 155, 200, 245],
    apRatio: 40,
    maxHealthRatio: 2,
    damageType: "magic",
  },
  {
    ccType: "knockup",
    ccDuration: 0.5,
    slow: 99,
  },
  undefined,
  undefined,
  [
    "Cost: 60 mana",
    "Damage: 65-245 (+40% AP)(+2-4% target max HP)",
    "Knockback nearby, slow far enemies",
  ],
);

const MaokaiW = new Ability(
  "Twisted Advance",
  "W",
  "Dashes to target enemy, becoming untargetable. Roots on arrival and deals damage",
  {
    cooldown: [15, 14, 13, 12, 11],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 525,
  },
  {
    baseDamage: [60, 85, 110, 135, 160],
    apRatio: 40,
    damageType: "magic",
  },
  {
    ccType: "root",
    ccDuration: 1,
  },
  undefined,
  undefined,
  [
    "Cost: 60/65/70/75/80 mana",
    "Damage: 60-160 (+40% AP)",
    "Root: 1-1.4s based on rank",
    "Untargetable during dash",
  ],
);

const MaokaiE = new Ability(
  "Sapling Toss",
  "E",
  "Throws a sapling that chases enemies. Deals more damage and lasts longer in brush",
  {
    cooldown: [16, 15, 14, 13, 12],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 1100,
    radius: 350,
  },
  {
    baseDamage: [50, 75, 100, 125, 150],
    apRatio: 25,
    bonusHPRatio: 5,
    damageType: "magic",
  },
  {
    ccType: "slow",
    ccDuration: 2,
    slow: 45,
  },
  undefined,
  undefined,
  [
    "Cost: 60/65/70/75/80 mana",
    "Damage: 50-150 (+25% AP)(+5% bonus HP)",
    "Brush: Double damage, 3 ticks over time",
    "Duration: 30s (longer in brush)",
  ],
);

const MaokaiR = new Ability(
  "Nature's Grasp",
  "R",
  "Summons a wall of brambles that advances, rooting enemies hit. Root duration scales with distance",
  {
    cooldown: [120, 100, 80],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 3000,
    radius: 600,
  },
  {
    baseDamage: [150, 225, 300],
    apRatio: 75,
    damageType: "magic",
  },
  {
    ccType: "root",
    ccDuration: 2.6,
  },
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "Damage: 150-300 (+75% AP)",
    "Root: 0.8-2.6s based on distance",
    "Grants MS when hitting champion",
  ],
);

const Maokai = new Character(
  "Maokai",
  665, // HP
  5, // HP5
  35, // AR
  32, // MR
  64, // AD
  200, // Crit DMG (%)
  335, // MS
  125, // Attack range
  0.8, // Base AS
  [MaokaiPassive, MaokaiQ, MaokaiW, MaokaiE, MaokaiR],
  [],
);

// Master Yi
const MasterYiPassive = new Ability(
  "Double Strike",
  "passive",
  "Every few attacks, Master Yi strikes twice",
  {
    cooldown: [0],
    cooldownType: "static",
  },
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  ["Every 4th attack strikes twice", "Second strike: 50% AD"],
);

const MasterYiQ = new Ability(
  "Alpha Strike",
  "Q",
  "Becomes untargetable and strikes up to 4 enemies. Basic attacks reduce cooldown",
  {
    cooldown: [20, 19.5, 19, 18.5, 18],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 600,
  },
  {
    baseDamage: [20, 45, 70, 95, 120],
    adRatio: 40,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 50/55/60/65/70 mana",
    "Damage: 20-120 (+40% AD) per mark",
    "Applies on-hit effects",
    "-1s cooldown per basic attack",
    "Bonus monster damage: 65-165",
  ],
);

const MasterYiW = new Ability(
  "Meditate",
  "W",
  "Channels to heal and reduce damage taken. Grants Double Strike stacks",
  {
    cooldown: [28],
    cooldownType: "standard",
  },
  {
    castTime: 0,
  },
  undefined,
  {
    heal: [40, 70, 100, 130, 160],
    duration: 4,
  },
  undefined,
  undefined,
  [
    "Cost: 50 mana",
    "Heal: 40-160 (+25% AP) per 0.5s",
    "Heal scales with missing HP",
    "Damage reduction: 70% first 0.5s, then 45-55%",
    "Pauses Wuju Style and Highlander",
  ],
);

const MasterYiE = new Ability(
  "Wuju Style",
  "E",
  "Empowers attacks to deal bonus true damage for 5 seconds",
  {
    cooldown: [18],
    cooldownType: "standard",
  },
  {
    castTime: 0,
  },
  {
    baseDamage: [15, 20, 25, 30, 35],
    bonusAdRatio: 20,
    damageType: "true",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 30 mana",
    "Bonus true damage: 15-35 (+20% bonus AD)",
    "Duration: 5s",
    "Does not interact with crits",
  ],
  true,
);

const MasterYiR = new Ability(
  "Highlander",
  "R",
  "Gains attack speed, movement speed, and slow immunity. Extended on takedowns",
  {
    cooldown: [100, 90, 80],
    cooldownType: "standard",
  },
  {
    castTime: 0,
  },
  undefined,
  {
    bonusStats: {
      as: [25, 45, 65],
      ms: [25, 35, 45],
    },
    duration: 7,
  },
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "Attack speed: +25-65%",
    "Move speed: +25-45%",
    "Slow immune, ghosted",
    "Extended 7s on takedown",
    "Takedowns reduce basic ability CD by 70%",
  ],
);

const MasterYi = new Character(
  "Master Yi",
  640, // HP
  7.5, // HP5
  33, // AR
  32, // MR
  65, // AD
  200, // Crit DMG (%)
  355, // MS
  175, // Attack range
  0.679, // Base AS
  [MasterYiPassive, MasterYiQ, MasterYiW, MasterYiE, MasterYiR],
  [],
);

// Mel
const MelPassive = new Ability(
  "Overwhelm",
  "passive",
  "Attacks and abilities apply Overwhelm stacks. Execute threshold triggers stored damage. Generates bolts from abilities",
  {
    cooldown: [0],
    cooldownType: "static",
  },
  undefined,
  {
    baseDamage: [8, 50],
    apRatio: 5,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Bolt damage: 8-50 (+5% AP) per bolt",
    "Ability casts generate 3/6/9 bolts",
    "Execute stores: 50-125 (+25% AP) + stacks",
  ],
  true,
);

const MelQ = new Ability(
  "Radiant Volley",
  "Q",
  "Launches multiple luminous bolts that explode at target location",
  {
    cooldown: [10, 9.5, 9, 8.5, 8],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 1000,
    radius: 250,
  },
  {
    baseDamage: [80, 140, 200, 260, 320],
    apRatio: 120,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 70/75/80/85/90 mana",
    "Projectiles: 6/7/8/9/10",
    "Total: 80-320 (+120% AP)",
    "25% damage to minions",
  ],
);

const MelW = new Ability(
  "Rebuttal",
  "W",
  "Becomes invulnerable briefly, reflecting enemy projectiles back as magic damage",
  {
    cooldown: [24, 22, 20, 18, 16],
    cooldownType: "standard",
  },
  {
    castTime: 0,
  },
  undefined,
  {
    duration: 0.75,
  },
  undefined,
  undefined,
  [
    "Cost: 80/60/40/20/0 mana",
    "Invulnerable: 0.75s",
    "Reflects projectiles at 40-60% (+5% per 100 AP) damage",
    "Decaying move speed bonus",
  ],
);

const MelE = new Ability(
  "Solar Snare",
  "E",
  "Fires an orb that roots enemies hit. Orb radiates damage and slows while in flight",
  {
    cooldown: [14, 13, 12, 11, 10],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 1100,
    radius: 200,
  },
  {
    baseDamage: [60, 100, 140, 180, 220],
    apRatio: 50,
    damageType: "magic",
  },
  {
    ccType: "root",
    ccDuration: 1.2,
    slow: 30,
  },
  undefined,
  undefined,
  [
    "Cost: 50/60/70/80/90 mana",
    "Impact: 60-220 (+50% AP)",
    "Radiant ticks: 2-8 (+~3.5% AP) per tick",
    "Root: 1.2-1.6s based on rank",
    "50% damage to minions",
  ],
);

const MelR = new Ability(
  "Golden Eclipse",
  "R",
  "Detonates all Overwhelm stacks on enemies globally, dealing bonus damage per stack",
  {
    cooldown: [100, 90, 80],
    cooldownType: "standard",
  },
  {
    castTime: 0.75,
    range: 99999,
  },
  {
    baseDamage: [125, 175, 225],
    apRatio: 40,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "Base: 125-225 (+40% AP)",
    "Per stack: 4-10 (+2.5% AP)",
    "Global range, requires Overwhelm target",
  ],
);

const Mel = new Character(
  "Mel",
  630, // HP
  6, // HP5
  21, // AR
  30, // MR
  54, // AD
  200, // Crit DMG (%)
  330, // MS
  550, // Attack range
  0.625, // Base AS
  [MelPassive, MelQ, MelW, MelE, MelR],
  [],
);

// Milio
const MilioPassive = new Ability(
  "Fired Up!",
  "passive",
  "Abilities enchant allies, causing their next attack to deal bonus damage and apply a burn",
  {
    cooldown: [0],
    cooldownType: "static",
  },
  undefined,
  {
    baseDamage: [10, 50],
    apRatio: 20,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Bonus damage: 7/11/15% ally AD",
    "Burn: 10-50 (+20% AP) over 1.5s",
    "Enchant duration: 4s",
  ],
);

const MilioQ = new Ability(
  "Ultra Mega Fire Kick",
  "Q",
  "Kicks a fireball that knocks back, then bounces and explodes dealing damage and slowing",
  {
    cooldown: [10],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 1200,
    radius: 250,
  },
  {
    baseDamage: [80, 140, 200, 260, 320],
    apRatio: 120,
    damageType: "magic",
  },
  {
    ccType: "knockup",
    ccDuration: 1,
    slow: [40, 45, 50, 55, 60],
  },
  undefined,
  undefined,
  [
    "Cost: 50/55/60/65/70 mana",
    "Damage: 80-320 (+120% AP)",
    "Stun on contact: 1s",
    "AoE slow: 40-60% (+5% per 100 AP)",
    "Refunds 50% mana if hits champion",
  ],
);

const MilioW = new Ability(
  "Cozy Campfire",
  "W",
  "Summons a healing zone that follows allies and grants attack range",
  {
    cooldown: [18, 17, 16, 15, 14],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 800,
    radius: 400,
  },
  undefined,
  {
    heal: [70, 90, 110, 130, 150],
    duration: 6,
  },
  undefined,
  undefined,
  [
    "Cost: 90/95/100/105/110 mana",
    "Total heal: 70-150 (+30% AP) over 6s",
    "Bonus attack range: 10-20%",
    "Follows nearest ally",
  ],
);

const MilioE = new Ability(
  "Warm Hugs",
  "E",
  "Shields an ally and grants movement speed. Stores charges",
  {
    cooldown: [17, 16, 15, 14, 13],
    cooldownType: "ammo",
  },
  {
    castTime: 0.25,
    range: 650,
  },
  undefined,
  {
    shield: [45, 75, 105, 135, 165],
    duration: 2.5,
  },
  2,
  undefined,
  [
    "Cost: 50/55/60/65/70 mana",
    "Shield: 45-165 (+45% AP)",
    "Move speed: 12-20% for 2.5s",
    "Max 2 charges, stackable",
  ],
);

const MilioR = new Ability(
  "Breath of Life",
  "R",
  "Cleanses and heals nearby allies while granting tenacity",
  {
    cooldown: [140, 120, 100],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    radius: 700,
  },
  undefined,
  {
    heal: [150, 250, 350],
    duration: 3,
  },
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "Heal: 150-350 (+50% AP)",
    "Cleanses CC and disables",
    "Tenacity: 65% for 3s",
  ],
);

const Milio = new Character(
  "Milio",
  560, // HP
  5, // HP5
  26, // AR
  30, // MR
  48, // AD
  200, // Crit DMG (%)
  330, // MS
  525, // Attack range
  0.625, // Base AS
  [MilioPassive, MilioQ, MilioW, MilioE, MilioR],
  [],
);

// Miss Fortune
const MissFortunePassive = new Ability(
  "Love Tap",
  "passive",
  "Basic attacks deal bonus damage when switching targets",
  {
    cooldown: [0],
    cooldownType: "static",
  },
  undefined,
  {
    baseDamage: [0],
    adRatio: 50,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Bonus damage: 50-100% total AD",
    "Only when attacking new target",
    "Halved against minions",
  ],
  true,
);

const MissFortuneQ = new Ability(
  "Double Up",
  "Q",
  "Fires a bullet that bounces to a second target. Second target takes increased damage",
  {
    cooldown: [8],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 650,
  },
  {
    baseDamage: [20, 35, 50, 65, 80],
    adRatio: 85,
    apRatio: 35,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 43/46/49/52/55 mana",
    "First target: 20-80 (+85% AD)(+35% AP)",
    "Bounce: 40-160 (+100% AD)(+50% AP)",
    "Bounce crits if first target dies",
  ],
);

const MissFortuneW = new Ability(
  "Strut",
  "W",
  "Passive: Gains movement speed after not taking damage. Active: Instantly gains full bonus and attack speed",
  {
    cooldown: [12],
    cooldownType: "standard",
  },
  {
    castTime: 0,
  },
  undefined,
  {
    bonusStats: {
      as: [40, 55, 70, 85, 100],
      ms: [60, 70, 80, 90, 100],
    },
    duration: 4,
  },
  undefined,
  undefined,
  [
    "Cost: 45 mana",
    "Passive MS: 30-50, ramps to 60-100",
    "Active AS: +40-100% for 4s",
    "Love Tap reduces CD by 2s",
  ],
);

const MissFortuneE = new Ability(
  "Make It Rain",
  "E",
  "Rains bullets in an area dealing damage over time and slowing enemies",
  {
    cooldown: [18, 17, 16, 15, 14],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 1000,
    radius: 400,
  },
  {
    baseDamage: [70, 100, 130, 160, 190],
    apRatio: 100,
    damageType: "magic",
  },
  {
    ccType: "slow",
    ccDuration: 2,
    slow: 50,
  },
  undefined,
  undefined,
  [
    "Cost: 80 mana",
    "Damage: 70-190 (+100% AP) over 2s",
    "Slow: 50% (+4% per 100 AP)",
  ],
);

const MissFortuneR = new Ability(
  "Bullet Time",
  "R",
  "Channels for 3 seconds firing waves of bullets in a cone. Each wave can crit",
  {
    cooldown: [120, 110, 100],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 1450,
  },
  {
    baseDamage: [20, 30, 40],
    adRatio: 60,
    apRatio: 25,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "Waves: 12/14/16",
    "Per wave: 20-40 (+60% AD)(+25% AP)",
    "Total: Up to 640-920% AD + 400% AP",
    "Can crit for 20% bonus damage per wave",
  ],
);

const MissFortune = new Character(
  "Miss Fortune",
  625, // HP
  3.75, // HP5
  25, // AR
  30, // MR
  55, // AD
  200, // Crit DMG (%)
  325, // MS
  550, // Attack range
  0.656, // Base AS
  [MissFortunePassive, MissFortuneQ, MissFortuneW, MissFortuneE, MissFortuneR],
  [],
);

// Mordekaiser
const MordekaiserPassive = new Ability(
  "Darkness Rise",
  "passive",
  "After 3 hits, deals AoE magic damage per second and gains movement speed",
  {
    cooldown: [0],
    cooldownType: "static",
  },
  undefined,
  {
    baseDamage: [5, 20],
    apRatio: 30,
    damageType: "magic",
  },
  {
    bonusStats: {
      ms: 3,
    },
    duration: 4,
  },
  undefined,
  undefined,
  [
    "On-hit: 40% AP bonus magic damage",
    "Darkness Rise: 5-20 (+30% AP) magic DPS",
    "+3% MS while active",
    "Requires 3 stacks on champions/monsters",
  ],
  true,
);

const MordekaiserQ = new Ability(
  "Obliterate",
  "Q",
  "Slams mace dealing magic damage. Isolated targets take increased damage",
  {
    cooldown: [8, 7, 6, 5, 4],
    cooldownType: "standard",
  },
  {
    castTime: 0.5,
    range: 675,
    radius: 200,
  },
  {
    baseDamage: [80, 115, 150, 185, 220],
    apRatio: 70,
    bonusAdRatio: 120,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 25/30/35/40/45 mana",
    "Damage: 80-220 (+70% AP)(+120% bonus AD)",
    "Isolated: +30-50% damage",
  ],
);

const MordekaiserW = new Ability(
  "Indestructible",
  "W",
  "Stores damage dealt/taken as potential shield. Activate for shield, recast to heal",
  {
    cooldown: [12, 11, 10, 9, 8],
    cooldownType: "standard",
  },
  {
    castTime: 0,
  },
  undefined,
  {
    shield: [30],
    heal: [40, 42.5, 45, 47.5, 50],
    duration: 4,
  },
  undefined,
  4,
  [
    "No cost",
    "Stores 35% damage dealt, 15% taken",
    "Shield: Up to 30% max HP",
    "Recast heals 40-50% of remaining shield",
  ],
);

const MordekaiserE = new Ability(
  "Death's Grasp",
  "E",
  "Passive: Magic penetration. Active: Pulls enemies toward Mordekaiser",
  {
    cooldown: [6, 5.75, 5.5, 5.25, 5],
    cooldownType: "standard",
  },
  {
    castTime: 0.5,
    range: 675,
    radius: 300,
  },
  {
    baseDamage: [70, 85, 100, 115, 130],
    apRatio: 40,
    damageType: "magic",
  },
  {
    ccType: "pull",
  },
  undefined,
  undefined,
  [
    "Cost: 50/55/60/65/70 mana",
    "Passive: 5-15% magic pen",
    "Damage: 70-130 (+40% AP)",
    "Generates 15% max shield per champion hit",
  ],
);

const MordekaiserR = new Ability(
  "Realm of Death",
  "R",
  "Banishes enemy champion to Death Realm. Steals their stats for the duration",
  {
    cooldown: [140, 120, 100],
    cooldownType: "standard",
  },
  {
    castTime: 0.5,
    range: 650,
  },
  undefined,
  {
    ccType: "slow",
    slow: 75,
    duration: 7,
  },
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "Duration: 7s in Death Realm",
    "Steals 10% of target's core stats",
    "Stats kept until target respawns if killed",
  ],
);

const Mordekaiser = new Character(
  "Mordekaiser",
  645, // HP
  5, // HP5
  37, // AR
  32, // MR
  61, // AD
  200, // Crit DMG (%)
  335, // MS
  175, // Attack range
  0.625, // Base AS
  [MordekaiserPassive, MordekaiserQ, MordekaiserW, MordekaiserE, MordekaiserR],
  [],
);

// Morgana
const MorganaPassive = new Ability(
  "Soul Siphon",
  "passive",
  "Heals from ability damage dealt to champions, large minions, and monsters",
  {
    cooldown: [0],
    cooldownType: "static",
  },
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  [
    "Heal: 15-40% of damage dealt",
    "Scales with level",
    "Only from ability damage",
  ],
);

const MorganaQ = new Ability(
  "Dark Binding",
  "Q",
  "Fires a bolt that roots the first enemy hit and deals magic damage",
  {
    cooldown: [10],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 1300,
  },
  {
    baseDamage: [80, 135, 190, 245, 300],
    apRatio: 90,
    damageType: "magic",
  },
  {
    ccType: "root",
    ccDuration: 2,
  },
  undefined,
  undefined,
  [
    "Cost: 50/55/60/65/70 mana",
    "Damage: 80-300 (+90% AP)",
    "Root: 2/2.25/2.5/2.75/3s",
  ],
);

const MorganaW = new Ability(
  "Tormented Shadow",
  "W",
  "Creates a damaging zone. Damage increases based on target's missing health. CD reduced by Soul Siphon",
  {
    cooldown: [12],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 900,
    radius: 275,
  },
  {
    baseDamage: [18, 31, 44, 57, 70],
    apRatio: 20,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 70/85/100/115/130 mana",
    "DPS: 18-70 (+20% AP) per second",
    "Duration: 5s",
    "Damage increased 0-100% by missing HP",
    "170% damage to monsters",
  ],
);

const MorganaE = new Ability(
  "Black Shield",
  "E",
  "Shields ally absorbing magic damage and preventing CC while active",
  {
    cooldown: [26, 24, 22, 20, 18],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 800,
  },
  undefined,
  {
    shield: [100, 155, 210, 265, 320],
    duration: 5,
  },
  undefined,
  undefined,
  [
    "Cost: 80 mana",
    "Shield: 100-320 (+70% AP)",
    "Blocks CC while shield holds",
    "Duration: 5s",
  ],
);

const MorganaR = new Ability(
  "Soul Shackles",
  "R",
  "Chains to nearby enemies, dealing damage and slowing. After 3s, stuns and deals more damage",
  {
    cooldown: [120, 100, 80],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    radius: 625,
  },
  {
    baseDamage: [175, 250, 325],
    apRatio: 80,
    damageType: "magic",
  },
  {
    ccType: "stun",
    ccDuration: 1.5,
    slow: 20,
  },
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "Initial: 175-325 (+80% AP), 20% slow",
    "After 3s: Same damage again + stun",
    "Stun: 1.5-2s based on rank",
    "Grants MS: 10/35/60%",
    "Total: 350-650 (+160% AP)",
  ],
);

const Morgana = new Character(
  "Morgana",
  630, // HP
  5.5, // HP5
  25, // AR
  30, // MR
  56, // AD
  200, // Crit DMG (%)
  335, // MS
  450, // Attack range
  0.625, // Base AS
  [MorganaPassive, MorganaQ, MorganaW, MorganaE, MorganaR],
  [],
);

// Naafiri
const NaafiriPassive = new Ability(
  "We Are More",
  "passive",
  "Spawns Packmates that attack targets. Hitting champions reduces cooldown",
  {
    cooldown: [3],
    cooldownType: "static",
  },
  undefined,
  {
    baseDamage: [10, 20],
    bonusAdRatio: 4,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Packmate damage: 10-20 (+4% bonus AD)",
    "Max dogs: 2/3/4/5 at levels 1/9/12/15",
    "-4s CD on champion/monster hit",
    "165% damage to monsters",
  ],
);

const NaafiriQ = new Ability(
  "Darkin Daggers",
  "Q",
  "Hurls blades dealing damage and applying bleed. Recast detonates bleed for execute damage and heals",
  {
    cooldown: [9, 8.5, 8, 7.5, 7],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 900,
  },
  {
    baseDamage: [35, 45, 55, 65, 75],
    bonusAdRatio: 20,
    missingHealthRatio: 8,
    damageType: "physical",
  },
  undefined,
  undefined,
  3,
  [
    "Cost: 55/60/65/70/75 mana",
    "Initial: 35-75 (+20% bonus AD)",
    "Bleed: 3-15 (+8% bonus AD) over 5s",
    "Recast: 30-90 (+40% bonus AD) to 60-180 (+70% bonus AD)",
    "Heal: 45-105 (+40% bonus AD) vs champions",
  ],
);

const NaafiriW = new Ability(
  "The Call of the Pack",
  "W",
  "Becomes untargetable, spawns 2 Packmates, gains bonus AD and movement speed",
  {
    cooldown: [20, 19, 18, 17, 16],
    cooldownType: "standard",
  },
  {
    castTime: 0,
  },
  undefined,
  {
    bonusStats: {
      ad: 20,
      ms: [20, 22.5, 25, 27.5, 30],
    },
    duration: 5,
  },
  undefined,
  undefined,
  [
    "Cost: 60 mana",
    "Untargetable: 1s",
    "Spawns 2 additional Packmates",
    "+20% AD, +20-30% MS for 5s",
  ],
);

const NaafiriE = new Ability(
  "Eviscerate",
  "E",
  "Dashes forward dealing damage, then explodes dealing more damage. Recalls and heals Packmates",
  {
    cooldown: [9, 8.5, 8, 7.5, 7],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 450,
    radius: 300,
  },
  {
    baseDamage: [75, 115, 155, 195, 235],
    bonusAdRatio: 120,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 35/40/45/50/55 mana",
    "Dash: 15-55 (+40% bonus AD)",
    "Explosion: 60-180 (+80% bonus AD)",
    "Total: 75-235 (+120% bonus AD)",
    "Packmates restored to 100% HP",
  ],
);

const NaafiriR = new Ability(
  "Hounds' Pursuit",
  "R",
  "Dashes to enemy champion dealing damage. Takedown allows recast for shield and reveals enemies",
  {
    cooldown: [110, 95, 80],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 900,
  },
  {
    baseDamage: [150, 250, 350],
    bonusAdRatio: 120,
    damageType: "physical",
  },
  {
    ccType: "slow",
    ccDuration: 0.5,
    shield: [100, 150, 200],
  },
  undefined,
  1,
  [
    "Cost: 100 mana",
    "Damage: 150-350 (+120% bonus AD)",
    "Packmate damage: 15-35 (+12% bonus AD) each",
    "Recast shield: 100-200 (+150% bonus AD)",
    "Takedown reveals enemies for 4s",
  ],
);

const Naafiri = new Character(
  "Naafiri",
  610, // HP
  6.25, // HP5
  28, // AR
  32, // MR
  55, // AD
  200, // Crit DMG (%)
  340, // MS
  125, // Attack range
  0.663, // Base AS
  [NaafiriPassive, NaafiriQ, NaafiriW, NaafiriE, NaafiriR],
  [],
);

// Nami
const NamiPassive = new Ability(
  "Surging Tides",
  "passive",
  "Abilities grant movement speed to allied champions hit",
  {
    cooldown: [0],
    cooldownType: "static",
  },
  undefined,
  undefined,
  {
    bonusStats: {
      ms: [45, 60, 75, 90],
    },
    duration: 1.5,
  },
  undefined,
  undefined,
  [
    "Move speed: 45/60/75/90 (+20% AP)",
    "At levels 1/6/11/16",
    "Duration: 1.5s",
    "Doubled by Tidal Wave",
  ],
);

const NamiQ = new Ability(
  "Aqua Prison",
  "Q",
  "Sends a bubble dealing magic damage and stunning enemies in the area",
  {
    cooldown: [11, 10, 9, 8, 7],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 875,
    radius: 180,
  },
  {
    baseDamage: [75, 130, 185, 240, 295],
    apRatio: 65,
    damageType: "magic",
  },
  {
    ccType: "stun",
    ccDuration: 1.5,
  },
  undefined,
  undefined,
  ["Cost: 60 mana", "Damage: 75-295 (+65% AP)", "Stun: 1.5s"],
);

const NamiW = new Ability(
  "Ebb and Flow",
  "W",
  "Unleashes a stream of water that bounces between allies and enemies, healing allies and damaging enemies",
  {
    cooldown: [10],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 725,
  },
  {
    baseDamage: [60, 90, 120, 150, 180],
    apRatio: 55,
    damageType: "magic",
  },
  {
    heal: [55, 80, 105, 130, 155],
  },
  undefined,
  undefined,
  [
    "Cost: 70/80/90/100/110 mana",
    "Damage: 60-180 (+55% AP)",
    "Heal: 55-155 (+35% AP)",
    "Bounces up to 3 times",
    "Each bounce: -15% effectiveness +7.5% per 100 AP",
  ],
);

const NamiE = new Ability(
  "Tidecaller's Blessing",
  "E",
  "Empowers ally's attacks to deal bonus magic damage and slow enemies",
  {
    cooldown: [11, 10, 9, 8, 7],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 800,
  },
  {
    baseDamage: [20, 35, 50, 65, 80],
    apRatio: 20,
    damageType: "magic",
  },
  {
    ccType: "slow",
    ccDuration: 1,
    slow: [15, 20, 25, 30, 35],
    duration: 6,
  },
  undefined,
  undefined,
  [
    "Cost: 55/60/65/70/75 mana",
    "Bonus damage: 20-80 (+20% AP) per hit",
    "Slow: 15-35% (+5% per 100 AP)",
    "3 empowered attacks",
  ],
  true,
);

const NamiR = new Ability(
  "Tidal Wave",
  "R",
  "Summons a massive wave that knocks up and slows enemies",
  {
    cooldown: [120, 110, 100],
    cooldownType: "standard",
  },
  {
    castTime: 0.5,
    range: 2750,
    radius: 500,
  },
  {
    baseDamage: [150, 250, 350],
    apRatio: 60,
    damageType: "magic",
  },
  {
    ccType: "knockup",
    ccDuration: 0.5,
    slow: [50, 60, 70],
  },
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "Damage: 150-350 (+60% AP)",
    "Knockup: 0.5s",
    "Slow: 50-70% for 2-4s based on distance",
    "Doubles Surging Tides bonus",
  ],
);

const Nami = new Character(
  "Nami",
  560, // HP
  5.5, // HP5
  29, // AR
  30, // MR
  54, // AD
  200, // Crit DMG (%)
  335, // MS
  550, // Attack range
  0.644, // Base AS
  [NamiPassive, NamiQ, NamiW, NamiE, NamiR],
  [],
);

// Nasus
const NasusPassive = new Ability(
  "Soul Eater",
  "passive",
  "Nasus has built-in lifesteal",
  {
    cooldown: [0],
    cooldownType: "static",
  },
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  ["Lifesteal: 9/14/19%", "At levels 1/7/13"],
);

const NasusQ = new Ability(
  "Siphoning Strike",
  "Q",
  "Empowers next attack to deal bonus damage. Killing units grants permanent stacks",
  {
    cooldown: [7.5, 6.5, 5.5, 4.5, 3.5],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 175,
  },
  {
    baseDamage: [30, 50, 70, 90, 110],
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 20 mana",
    "Base damage: 30-110 + Stacks",
    "+3 stacks per kill",
    "+12 stacks for champions/large units",
    "Can crit (base damage only)",
  ],
);

const NasusW = new Ability(
  "Wither",
  "W",
  "Slows enemy and reduces their attack speed, increasing over time",
  {
    cooldown: [12],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 700,
  },
  undefined,
  {
    ccType: "slow",
    ccDuration: 5,
    slow: [35, 99],
  },
  undefined,
  undefined,
  [
    "Cost: 80 mana",
    "Initial slow: 35%",
    "Max slow: 47-75% over 5s",
    "AS reduction: Half of slow amount",
  ],
);

const NasusE = new Ability(
  "Spirit Fire",
  "E",
  "Creates a zone dealing initial magic damage and DoT, also reducing enemy armor",
  {
    cooldown: [12],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 650,
    radius: 400,
  },
  {
    baseDamage: [55, 95, 135, 175, 215],
    apRatio: 60,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 70/85/100/115/130 mana",
    "Initial: 55-215 (+60% AP)",
    "DoT: 11-43 (+12% AP) per second",
    "Duration: 5s",
    "Armor reduction: 30-50%",
  ],
);

const NasusR = new Ability(
  "Fury of the Sands",
  "R",
  "Gains bonus health, size, and deals magic damage per second. Halves Q cooldown",
  {
    cooldown: [120],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    radius: 350,
  },
  {
    baseDamage: [3, 4, 5],
    apRatio: 1,
    damageType: "magic",
  },
  {
    bonusStats: {
      armor: [40, 55, 70],
      mr: [40, 55, 70],
    },
    duration: 15,
  },
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "Bonus HP: 300/450/600",
    "DPS: 3-5% (+1% per 100 AP) max HP",
    "Max: 240 DPS",
    "Duration: 15s",
    "Q cooldown halved",
    "+40-70 armor/MR",
  ],
);

const Nasus = new Character(
  "Nasus",
  650, // HP
  9, // HP5
  34, // AR
  32, // MR
  67, // AD
  200, // Crit DMG (%)
  350, // MS
  125, // Attack range
  0.638, // Base AS
  [NasusPassive, NasusQ, NasusW, NasusE, NasusR],
  [],
);

// Nautilus
const NautilusPassive = new Ability(
  "Staggering Blow",
  "passive",
  "Basic attacks root enemies and deal bonus physical damage. Cannot affect the same target frequently",
  {
    cooldown: [6],
    cooldownType: "static",
  },
  undefined,
  {
    baseDamage: [14, 68],
    damageType: "physical",
  },
  {
    ccType: "root",
    ccDuration: 1,
  },
  undefined,
  undefined,
  [
    "Bonus damage: 14-68 based on level",
    "Root: 0.75-1.5s based on level",
    "Per-target CD: 6s",
  ],
  true,
);

const NautilusQ = new Ability(
  "Dredge Line",
  "Q",
  "Throws anchor, pulling Nautilus to terrain or pulling enemy to him and stunning",
  {
    cooldown: [14, 13, 12, 11, 10],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 1100,
  },
  {
    baseDamage: [70, 115, 160, 205, 250],
    apRatio: 90,
    damageType: "magic",
  },
  {
    ccType: "stun",
    ccDuration: 0.1,
  },
  undefined,
  undefined,
  [
    "Cost: 60 mana",
    "Damage: 70-250 (+90% AP)",
    "50% CD if hits terrain",
    "Pulls enemy and Nautilus together",
  ],
);

const NautilusW = new Ability(
  "Titan's Wrath",
  "W",
  "Gains a shield and empowers attacks to deal bonus damage over time",
  {
    cooldown: [12],
    cooldownType: "standard",
  },
  {
    castTime: 0,
  },
  {
    baseDamage: [30, 40, 50, 60, 70],
    apRatio: 40,
    damageType: "magic",
  },
  {
    shield: [50, 60, 70, 80, 90],
    duration: 6,
  },
  undefined,
  undefined,
  [
    "Cost: 80 mana",
    "Shield: 50-90 (+9/10/11/12/13% max HP)",
    "Bonus damage: 30-70 (+40% AP) over 2s",
    "Duration: 6s",
  ],
);

const NautilusE = new Ability(
  "Riptide",
  "E",
  "Creates waves dealing magic damage and slowing enemies. Multiple hits deal reduced damage",
  {
    cooldown: [7, 6.5, 6, 5.5, 5],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    radius: 600,
  },
  {
    baseDamage: [55, 85, 115, 145, 175],
    apRatio: 30,
    damageType: "magic",
  },
  {
    ccType: "slow",
    ccDuration: 1.5,
    slow: [30, 35, 40, 45, 50],
  },
  undefined,
  undefined,
  [
    "Cost: 50/60/70/80/90 mana",
    "Damage: 55-175 (+30% AP)",
    "3 waves expanding outward",
    "50% damage on subsequent hits",
    "Slow: 30-50% for 1.5s",
  ],
);

const NautilusR = new Ability(
  "Depth Charge",
  "R",
  "Sends a shockwave that knocks up enemies in its path and stuns the target",
  {
    cooldown: [120, 100, 80],
    cooldownType: "standard",
  },
  {
    castTime: 0.5,
    range: 825,
    radius: 250,
  },
  {
    baseDamage: [150, 275, 400],
    apRatio: 80,
    damageType: "magic",
  },
  {
    ccType: "stun",
    ccDuration: 1.5,
  },
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "Damage: 150-400 (+80% AP)",
    "Target stun: 1-1.5s based on rank",
    "Enemies in path: Knockup",
    "125-250 (+40% AP) to enemies in path",
  ],
);

const Nautilus = new Character(
  "Nautilus",
  646, // HP
  8.5, // HP5
  39, // AR
  32, // MR
  61, // AD
  200, // Crit DMG (%)
  325, // MS
  175, // Attack range
  0.706, // Base AS
  [NautilusPassive, NautilusQ, NautilusW, NautilusE, NautilusR],
  [],
);

// Neeko
const NeekoPassive = new Ability(
  "Inherent Glamour",
  "passive",
  "Can disguise as an ally champion. Taking damage or using abilities breaks disguise",
  {
    cooldown: [25, 22, 19, 16],
    cooldownType: "static",
  },
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  [
    "Cooldown: 25/22/19/16s (levels 1/6/11/16)",
    "Breaks on damage or ability use",
    "Copies ally's appearance and base MS",
  ],
);

const NeekoQ = new Ability(
  "Blooming Burst",
  "Q",
  "Throws a seed that blooms multiple times, dealing magic damage with each bloom",
  {
    cooldown: [9, 8.5, 8, 7.5, 7],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 800,
    radius: 225,
  },
  {
    baseDamage: [70, 115, 160, 205, 250],
    apRatio: 50,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 50/60/70/80/90 mana",
    "Initial: 70-250 (+50% AP)",
    "Secondary: 35-105 (+25% AP)",
    "Blooms up to 2 more times",
    "Blooms on champion/large monster hit",
  ],
);

const NeekoW = new Ability(
  "Shapesplitter",
  "W",
  "Passive: Every 3rd attack deals bonus magic damage. Active: Becomes invisible and sends a clone",
  {
    cooldown: [16, 14.5, 13, 11.5, 10],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 900,
  },
  {
    baseDamage: [50, 70, 90, 110, 130],
    apRatio: 60,
    damageType: "magic",
  },
  {
    duration: 0.5,
  },
  undefined,
  undefined,
  [
    "Cost: 75 mana",
    "Passive: 50-130 (+60% AP) every 3rd hit",
    "+10-30% MS on proc",
    "Active: 0.5s invis, clone lasts 3s",
  ],
  true,
);

const NeekoE = new Ability(
  "Tangle-Barbs",
  "E",
  "Throws a tangle that roots enemies hit, growing in size and duration through champions",
  {
    cooldown: [12, 11.5, 11, 10.5, 10],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 1000,
  },
  {
    baseDamage: [80, 120, 160, 200, 240],
    apRatio: 55,
    damageType: "magic",
  },
  {
    ccType: "root",
    ccDuration: 1.5,
  },
  undefined,
  undefined,
  [
    "Cost: 60/65/70/75/80 mana",
    "Damage: 80-240 (+55% AP)",
    "Root: 0.7-1.1s (up to 1.8-3s empowered)",
    "Grows through champions hit",
  ],
);

const NeekoR = new Ability(
  "Pop Blossom",
  "R",
  "Channels then leaps, dealing massive damage and stunning enemies in area",
  {
    cooldown: [90],
    cooldownType: "standard",
  },
  {
    castTime: 1.25,
    radius: 650,
  },
  {
    baseDamage: [150, 325, 500],
    apRatio: 100,
    damageType: "magic",
  },
  {
    ccType: "stun",
    ccDuration: 1.25,
    shield: [75, 100, 125],
  },
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "Damage: 150-500 (+100% AP)",
    "Shield: 75-125 (+75% AP)",
    "Stun: 1.25s",
  ],
);

const Neeko = new Character(
  "Neeko",
  610, // HP
  7.5, // HP5
  21, // AR
  30, // MR
  48, // AD
  200, // Crit DMG (%)
  340, // MS
  550, // Attack range
  0.625, // Base AS
  [NeekoPassive, NeekoQ, NeekoW, NeekoE, NeekoR],
  [],
);

// Nidalee
const NidaleePassive = new Ability(
  "Prowl",
  "passive",
  "Moving through brush grants movement speed and ignores unit collision. Hunted enemies take bonus damage from Cougar abilities",
  {
    cooldown: [0],
    cooldownType: "static",
  },
  undefined,
  undefined,
  {
    bonusStats: {
      ms: 10,
    },
    duration: 2,
  },
  undefined,
  undefined,
  [
    "+10% MS in brush, decays over 2s",
    "Hunted: Marked by Q/W traps",
    "Cougar leap range doubled vs Hunted",
  ],
);

const NidaleeQ = new Ability(
  "Javelin Toss / Takedown",
  "Q",
  "Human: Throws javelin dealing more damage based on distance. Cougar: Enhanced attack dealing execute damage",
  {
    cooldown: [6],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 1500,
  },
  {
    baseDamage: [70, 90, 110, 130, 150],
    apRatio: 50,
    missingHealthRatio: 1,
    missingHealthRatioPerAP: 0.75,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Human cost: 50/55/60/65/70 mana",
    "Javelin: 70-150 (+50% AP)",
    "Max (at range): 210-450 (+150% AP)",
    "Cougar Takedown: 5-30 (+75% AP)",
    "Missing HP bonus: 1% (+0.75% per 100 AP)",
    "+40% vs Hunted",
  ],
);

const NidaleeW = new Ability(
  "Bushwhack / Pounce",
  "W",
  "Human: Places a trap that damages and marks enemies. Cougar: Leaps forward dealing damage",
  {
    cooldown: [13, 12, 11, 10, 9],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 750,
    radius: 200,
  },
  {
    baseDamage: [40, 80, 120, 160, 200],
    apRatio: 20,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Trap cost: 40/45/50/55/60 mana",
    "Trap: 40-200 (+20% AP) + 10% max HP",
    "Marks Hunted for 4s",
    "Pounce: 60-140 (+30% AP)",
    "CD reset on Hunted kill",
  ],
);

const NidaleeE = new Ability(
  "Primal Surge / Swipe",
  "E",
  "Human: Heals ally and grants attack speed. Cougar: Swipes dealing AoE damage",
  {
    cooldown: [12],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 600,
    radius: 300,
  },
  {
    baseDamage: [70, 130, 190, 250, 310],
    apRatio: 45,
    damageType: "magic",
  },
  {
    heal: [35, 55, 75, 95, 115],
    bonusStats: {
      as: [20, 30, 40, 50, 60],
    },
    duration: 7,
  },
  undefined,
  undefined,
  [
    "Heal cost: 50/55/60/65/70 mana",
    "Heal: 35-115 (+35% AP)",
    "AS bonus: 20-60% for 7s",
    "Swipe: 70-310 (+45% AP)",
  ],
);

const NidaleeR = new Ability(
  "Aspect of the Cougar",
  "R",
  "Transforms between Human and Cougar form. Cougar abilities gain ranks with R",
  {
    cooldown: [3],
    cooldownType: "static",
  },
  {
    castTime: 0,
  },
  undefined,
  undefined,
  undefined,
  undefined,
  [
    "No cost",
    "Cougar: Melee, 425 MS",
    "Available at level 1",
    "Cougar abilities scale with R rank",
  ],
);

const Nidalee = new Character(
  "Nidalee",
  610, // HP
  6, // HP5
  32, // AR
  30, // MR
  58, // AD
  200, // Crit DMG (%)
  335, // MS
  525, // Attack range
  0.638, // Base AS
  [NidaleePassive, NidaleeQ, NidaleeW, NidaleeE, NidaleeR],
  [],
);

// Nilah
const NilahPassive = new Ability(
  "Joy Unending",
  "passive",
  "Gains increased experience from last-hitting. Nearby allies share healing and shielding",
  {
    cooldown: [0],
    cooldownType: "static",
  },
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  [
    "Gains 50% of XP normally lost from sharing",
    "When healed/shielded, nearby ally gets same",
    "Ally bonus: 60% effectiveness",
  ],
);

const NilahQ = new Ability(
  "Formless Blade",
  "Q",
  "Passive: Gains 0-30% armor pen based on crit. Active: Slashes dealing damage, empowers autos for 4s.",
  {
    cooldown: [4, 4, 4, 4, 4],
    cooldownType: "standard",
  },
  {
    castTime: 0.3,
    range: 600,
  },
  {
    baseDamage: [0, 10, 20, 30, 40],
    adRatio: 100,
    damageType: "physical",
  },
  {
    bonusStats: { as: [10, 10, 10, 10, 10] }, // 10-60% based on level, using base
  },
  undefined,
  undefined,
  [
    "Cost: 30 Mana",
    "Passive: 0-30% armor pen (crit scaling)",
    "Damage: 0-40 (+100% AD), increased by 0-70% based on crit",
    "On hit: +125 range, bonus AS, cone attacks",
  ],
  true,
);

const NilahW = new Ability(
  "Jubilant Veil",
  "W",
  "Creates a mist around Nilah granting bonus movement speed, 25% magic damage reduction, and auto-attack dodge.",
  {
    cooldown: [26, 25, 24, 23, 22],
    cooldownType: "standard",
  },
  {
    castTime: 0,
  },
  undefined,
  {
    bonusStats: {
      ms: [15, 17.5, 20, 22.5, 25],
    },
    duration: 2.25,
  },
  undefined,
  undefined,
  [
    "Cost: 60/45/30/15/0 Mana",
    "Dodges all non-turret basic attacks",
    "25% magic damage reduction",
    "MS: +15-25%",
    "Duration: 2.25s (1.5s for touched allies)",
  ],
);

const NilahE = new Ability(
  "Slipstream",
  "E",
  "Dashes a fixed distance toward target unit, dealing damage to enemies passed through.",
  {
    cooldown: [26, 22.5, 19, 15.5, 12], // Recharge time
    cooldownType: "ammo",
  },
  {
    castTime: 0,
    range: 550,
  },
  {
    baseDamage: [60, 70, 80, 90, 100],
    bonusAdRatio: 20,
    damageType: "physical",
  },
  undefined,
  2,
  undefined,
  [
    "Cost: 30 Mana + 1 charge",
    "Damage: 60-100 (+20% bonus AD)",
    "2 charges, recharge: 26-12s",
    "Resets basic attack timer",
  ],
);

const NilahR = new Ability(
  "Apotheosis",
  "R",
  "Whirls blade over 1s dealing damage every 0.25s, then bursts pulling enemies 250 units. Heals based on damage dealt.",
  {
    cooldown: [110, 95, 80],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    radius: 450,
  },
  {
    // Total damage: 185/325/465 (+140% bonus AD)
    // Per tick: 15/25/35 (+10% bonus AD) x4 = 60/100/140 (+40% bonus AD)
    // Burst: 125/225/325 (+100% bonus AD)
    baseDamage: [185, 325, 465],
    bonusAdRatio: 140,
    damageType: "physical",
  },
  {
    ccType: "pull",
    slow: 10,
  },
  undefined,
  undefined,
  [
    "Cost: 100 Mana",
    "Per tick: 15-35 (+10% bonus AD) x4",
    "Burst: 125-325 (+100% bonus AD)",
    "Total: 185-465 (+140% bonus AD)",
    "Heals: 20-50% of damage (crit scaling)",
  ],
);

const Nilah = new Character(
  "Nilah",
  570, // HP
  6, // HP5
  27, // AR
  32, // MR
  58, // AD
  200, // Crit DMG (%)
  340, // MS
  225, // Attack range
  0.697, // Base AS
  [NilahPassive, NilahQ, NilahW, NilahE, NilahR],
  [],
);

// Nocturne
const NocturnePassive = new Ability(
  "Umbra Blades",
  "passive",
  "Periodically, basic attacks deal AoE damage and heal Nocturne. Cooldown reduced by attacks",
  {
    cooldown: [10],
    cooldownType: "static",
  },
  undefined,
  {
    baseDamage: [0],
    adRatio: 65,
    damageType: "physical",
  },
  {
    heal: [15, 38],
  },
  undefined,
  undefined,
  [
    "Damage: 65% AD to nearby enemies",
    "Heal: 15-38 per enemy hit",
    "CD reduced by 1s per attack",
    "2s vs champions",
  ],
  true,
);

const NocturneQ = new Ability(
  "Duskbringer",
  "Q",
  "Sends a shadow blade leaving a Dusk Trail. Nocturne gains AD and MS on the trail",
  {
    cooldown: [10],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 1200,
  },
  {
    baseDamage: [65, 110, 155, 200, 245],
    bonusAdRatio: 85,
    damageType: "physical",
  },
  {
    bonusStats: {
      ad: [20, 30, 40, 50, 60],
      ms: 15,
    },
    duration: 5,
  },
  undefined,
  undefined,
  [
    "Cost: 60/65/70/75/80 mana",
    "Damage: 65-245 (+85% bonus AD)",
    "Trail: +20-60 AD, +15% MS",
    "Duration: 5s",
  ],
);

const NocturneW = new Ability(
  "Shroud of Darkness",
  "W",
  "Passive: Gains attack speed. Active: Blocks next ability and doubles passive if successful",
  {
    cooldown: [20, 18, 16, 14, 12],
    cooldownType: "standard",
  },
  {
    castTime: 0,
  },
  undefined,
  {
    bonusStats: {
      as: [30, 35, 40, 45, 50],
    },
    duration: 1.5,
  },
  undefined,
  undefined,
  [
    "Cost: 50 mana",
    "Passive: +30-50% AS",
    "Active: Spell shield for 1.5s",
    "If blocks: Double AS for 5s",
  ],
);

const NocturneE = new Ability(
  "Unspeakable Horror",
  "E",
  "Tethers to enemy, fearing them if tether isn't broken",
  {
    cooldown: [15, 14, 13, 12, 11],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 425,
  },
  {
    baseDamage: [80, 125, 170, 215, 260],
    apRatio: 100,
    damageType: "magic",
  },
  {
    ccType: "fear",
    ccDuration: 1.25,
  },
  undefined,
  undefined,
  [
    "Cost: 60/65/70/75/80 mana",
    "Damage: 80-260 (+100% AP)",
    "Tether duration: 2s",
    "Fear: 1.25-2s based on rank",
  ],
);

const NocturneR = new Ability(
  "Paranoia",
  "R",
  "Reduces enemy vision and can dash to enemy champion",
  {
    cooldown: [140, 115, 90],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 2500,
  },
  {
    baseDamage: [150, 275, 400],
    bonusAdRatio: 120,
    damageType: "physical",
  },
  undefined,
  undefined,
  1,
  [
    "Cost: 100 mana",
    "Damage: 150-400 (+120% bonus AD)",
    "Nearsight: 6s",
    "Dash range: 2500/3250/4000",
  ],
);

const Nocturne = new Character(
  "Nocturne",
  655, // HP
  7, // HP5
  38, // AR
  32, // MR
  62, // AD
  200, // Crit DMG (%)
  345, // MS
  125, // Attack range
  0.721, // Base AS
  [NocturnePassive, NocturneQ, NocturneW, NocturneE, NocturneR],
  [],
);

// Nunu & Willump
const NunuPassive = new Ability(
  "Call of the Freljord",
  "passive",
  "Periodically roots the nearest enemy and grants attack speed to Willump and nearby ally",
  {
    cooldown: [10],
    cooldownType: "static",
  },
  undefined,
  {
    baseDamage: [5, 45],
    apRatio: 5,
    damageType: "magic",
  },
  {
    ccType: "root",
    ccDuration: 0.5,
    bonusStats: {
      as: 20,
    },
  },
  undefined,
  undefined,
  [
    "Frost: 5-45 (+5% AP) magic damage",
    "Root: 0.5s on marked enemy",
    "+20% AS for Willump and ally",
    "Duration: 4s",
  ],
);

const NunuQ = new Ability(
  "Consume",
  "Q",
  "Bites enemy dealing true damage. Heals Nunu. Bonus damage and heal vs monsters",
  {
    cooldown: [12, 11, 10, 9, 8],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 125,
  },
  {
    baseDamage: [60, 100, 140, 180, 220],
    apRatio: 60,
    damageType: "true",
  },
  {
    heal: [80, 110, 140, 170, 200],
  },
  undefined,
  undefined,
  [
    "Cost: 60 mana",
    "Damage: 60-220 (+60% AP)(+5% bonus HP)",
    "Heal: 80-200 (+70% AP)(+10% bonus HP)",
    "Monster: 340-1100 damage, heals 90% max HP",
  ],
);

const NunuW = new Ability(
  "Biggest Snowball Ever!",
  "W",
  "Rolls a snowball that grows, knocking up and damaging enemies",
  {
    cooldown: [14],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 7500,
    radius: 200,
  },
  {
    baseDamage: [36, 54, 72, 90, 108],
    apRatio: 30,
    damageType: "magic",
  },
  {
    ccType: "knockup",
    ccDuration: 0.5,
  },
  undefined,
  undefined,
  [
    "Cost: 50/55/60/65/70 mana",
    "Min damage: 36-108 (+30% AP)",
    "Max damage: 180-540 (+150% AP)",
    "Knockup: 0.5-1s based on size",
    "Max size at 5s",
  ],
);

const NunuE = new Ability(
  "Snowball Barrage",
  "E",
  "Throws snowballs that damage and slow. After 3 volleys, creates a field that roots",
  {
    cooldown: [14],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 425,
    radius: 550,
  },
  {
    baseDamage: [16, 24, 32, 40, 48],
    apRatio: 6,
    damageType: "magic",
  },
  {
    ccType: "root",
    ccDuration: 0.5,
    slow: [30, 35, 40, 45, 50],
  },
  undefined,
  undefined,
  [
    "Cost: 50/55/60/65/70 mana",
    "Per snowball: 16-48 (+6% AP)",
    "9 snowballs total over 3 casts",
    "Total: 144-432 (+54% AP)",
    "Final root: 0.5-1.5s based on stacks",
  ],
);

const NunuR = new Ability(
  "Absolute Zero",
  "R",
  "Channels a blizzard dealing massive damage and slowing enemies. Can be interrupted",
  {
    cooldown: [110, 100, 90],
    cooldownType: "standard",
  },
  {
    castTime: 3,
    radius: 650,
  },
  {
    baseDamage: [625, 950, 1275],
    apRatio: 250,
    damageType: "magic",
  },
  {
    ccType: "slow",
    slow: 50,
    shield: [65, 75, 85],
  },
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "Max damage: 625-1275 (+250% AP)",
    "Shield: 65-85% AP",
    "Channel: 3s",
    "Slow: 50%, increasing to 95%",
  ],
);

const Nunu = new Character(
  "Nunu & Willump",
  610, // HP
  5, // HP5
  29, // AR
  32, // MR
  61, // AD
  200, // Crit DMG (%)
  345, // MS
  125, // Attack range
  0.625, // Base AS
  [NunuPassive, NunuQ, NunuW, NunuE, NunuR],
  [],
);

// Olaf
const OlafPassive = new Ability(
  "Berserker Rage",
  "passive",
  "Gains attack speed based on missing health",
  {
    cooldown: [0],
    cooldownType: "static",
  },
  undefined,
  undefined,
  {
    bonusStats: {
      as: [60, 100],
    },
  },
  undefined,
  undefined,
  ["AS: +60-100% at 0% HP", "Scales linearly with missing HP"],
);

const OlafQ = new Ability(
  "Undertow",
  "Q",
  "Throws axe dealing damage and slowing. Picking up axe reduces cooldown",
  {
    cooldown: [7],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 1000,
  },
  {
    baseDamage: [60, 110, 160, 210, 260],
    bonusAdRatio: 100,
    damageType: "physical",
  },
  {
    ccType: "slow",
    ccDuration: 2,
    slow: [25, 30, 35, 40, 45],
  },
  undefined,
  undefined,
  [
    "Cost: 40/45/50/55/60 mana",
    "Damage: 60-260 (+100% bonus AD)",
    "Slow: 25-45% for 2s",
    "Pick up: -4.5s CD",
  ],
);

const OlafW = new Ability(
  "Tough It Out",
  "W",
  "Gains attack speed and a shield. Shield and lifesteal scale with missing health",
  {
    cooldown: [16, 15, 14, 13, 12],
    cooldownType: "standard",
  },
  {
    castTime: 0,
  },
  undefined,
  {
    shield: [10, 50],
    bonusStats: {
      as: [40, 50, 60, 70, 80],
    },
    duration: 4,
  },
  undefined,
  undefined,
  [
    "Cost: 30 mana",
    "Shield: 10-50 (+12.5% missing HP)",
    "AS: +40-80% for 4s",
    "Lifesteal: 10-30% based on missing HP",
  ],
);

const OlafE = new Ability(
  "Reckless Swing",
  "E",
  "Deals true damage to target and self. Cooldown reduced on basic attacks",
  {
    cooldown: [11, 10, 9, 8, 7],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 325,
  },
  {
    baseDamage: [70, 115, 160, 205, 250],
    adRatio: 50,
    damageType: "true",
  },
  undefined,
  undefined,
  undefined,
  [
    "No cost (deals self damage)",
    "Damage: 70-250 (+50% AD)",
    "Self damage: 18% of damage dealt",
    "-1s CD per basic attack",
  ],
);

const OlafR = new Ability(
  "Ragnarok",
  "R",
  "Becomes immune to CC for duration. Gains bonus AD and MS toward enemies",
  {
    cooldown: [100, 90, 80],
    cooldownType: "standard",
  },
  {
    castTime: 0,
  },
  undefined,
  {
    bonusStats: {
      ad: [20, 40, 60],
      ms: 20,
    },
    duration: 3,
  },
  undefined,
  undefined,
  [
    "No cost",
    "CC immune for duration",
    "AD: +20-60",
    "MS: +20% toward enemies",
    "Duration: 3s (+2.5s per takedown)",
  ],
);

const Olaf = new Character(
  "Olaf",
  645, // HP
  6.5, // HP5
  35, // AR
  32, // MR
  68, // AD
  200, // Crit DMG (%)
  350, // MS
  125, // Attack range
  0.72, // Base AS
  [OlafPassive, OlafQ, OlafW, OlafE, OlafR],
  [],
);

// Orianna
const OriannaPassive = new Ability(
  "Clockwork Windup",
  "passive",
  "Basic attacks deal bonus magic damage, stacking on same target",
  {
    cooldown: [0],
    cooldownType: "static",
  },
  undefined,
  {
    baseDamage: [10, 50],
    apRatio: 15,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Bonus: 10-50 (+15% AP)",
    "Stacks up to 2 times on same target",
    "+20% per stack",
  ],
  true,
);

const OriannaQ = new Ability(
  "Command: Attack",
  "Q",
  "Commands the ball to fly to target location, dealing damage to enemies in path",
  {
    cooldown: [6, 5.5, 5, 4.5, 4],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 825,
    radius: 175,
  },
  {
    baseDamage: [60, 90, 120, 150, 180],
    apRatio: 50,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 30/35/40/45/50 mana",
    "Damage: 60-180 (+50% AP)",
    "Damage reduced by 10% per unit hit (min 40%)",
  ],
);

const OriannaW = new Ability(
  "Command: Dissonance",
  "W",
  "Ball emits electric field dealing damage and creating a zone. Allies speed up, enemies slow",
  {
    cooldown: [7],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    radius: 250,
  },
  {
    baseDamage: [60, 105, 150, 195, 240],
    apRatio: 70,
    damageType: "magic",
  },
  {
    ccType: "slow",
    ccDuration: 2,
    slow: [20, 25, 30, 35, 40],
    bonusStats: {
      ms: [20, 25, 30, 35, 40],
    },
  },
  undefined,
  undefined,
  [
    "Cost: 70/80/90/100/110 mana",
    "Damage: 60-240 (+70% AP)",
    "Zone MS: ±20-40% (+5% per 100 AP)",
    "Duration: 2s",
  ],
);

const OriannaE = new Ability(
  "Command: Protect",
  "E",
  "Ball flies to ally, shielding them and dealing damage in path. Ally gains resistances",
  {
    cooldown: [9],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 1100,
    radius: 175,
  },
  {
    baseDamage: [60, 90, 120, 150, 180],
    apRatio: 30,
    damageType: "magic",
  },
  {
    shield: [55, 90, 125, 160, 195],
    bonusStats: {
      armor: [6, 12, 18, 24, 30],
      mr: [6, 12, 18, 24, 30],
    },
    duration: 2.5,
  },
  undefined,
  undefined,
  [
    "Cost: 60 mana",
    "Shield: 55-195 (+50% AP)",
    "Damage in path: 60-180 (+30% AP)",
    "Bonus resistances: 6-30",
  ],
);

const OriannaR = new Ability(
  "Command: Shockwave",
  "R",
  "Ball unleashes a shockwave pulling nearby enemies toward it and dealing damage",
  {
    cooldown: [110, 95, 80],
    cooldownType: "standard",
  },
  {
    castTime: 0.5,
    radius: 410,
  },
  {
    baseDamage: [250, 350, 450],
    apRatio: 90,
    damageType: "magic",
  },
  {
    ccType: "pull",
  },
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "Damage: 250-450 (+90% AP)",
    "Pulls enemies toward ball center",
  ],
);

const Orianna = new Character(
  "Orianna",
  585, // HP
  7, // HP5
  20, // AR
  26, // MR
  44, // AD
  200, // Crit DMG (%)
  325, // MS
  525, // Attack range
  0.658, // Base AS
  [OriannaPassive, OriannaQ, OriannaW, OriannaE, OriannaR],
  [],
);

// Ornn
const OrnnPassive = new Ability(
  "Living Forge",
  "passive",
  "Can craft items anywhere. Upgrades allies' items at levels 14+. Gains bonus armor/MR from all sources",
  {
    cooldown: [0],
    cooldownType: "static",
  },
  undefined,
  undefined,
  {
    bonusStats: {
      armor: 10,
      mr: 10,
    },
  },
  undefined,
  undefined,
  [
    "+10% bonus armor and MR",
    "Can craft non-consumables anywhere",
    "Upgrades ally items at 14/15/16/17",
    "Masterwork items are stronger",
  ],
);

const OrnnQ = new Ability(
  "Volcanic Rupture",
  "Q",
  "Slams ground creating a fissure that slows and ends in a pillar",
  {
    cooldown: [9, 8.5, 8, 7.5, 7],
    cooldownType: "standard",
  },
  {
    castTime: 0.35,
    range: 800,
  },
  {
    baseDamage: [20, 50, 80, 110, 140],
    adRatio: 110,
    damageType: "physical",
  },
  {
    ccType: "slow",
    ccDuration: 2,
    slow: 40,
  },
  undefined,
  undefined,
  [
    "Cost: 45 mana",
    "Damage: 20-140 (+110% AD)",
    "Slow: 40% for 2s",
    "Pillar lasts 4s, knockups E",
  ],
);

const OrnnW = new Ability(
  "Bellows Breath",
  "W",
  "Breathes fire dealing max HP damage and applying Brittle. Becomes unstoppable",
  {
    cooldown: [13, 12.5, 12, 11.5, 11],
    cooldownType: "standard",
  },
  {
    castTime: 0.75,
    range: 500,
  },
  {
    baseDamage: [12, 13, 14, 15, 16],
    maxHealthRatio: 12,
    maxHealthRatioPerAP: 1,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 45/50/55/60/65 mana",
    "Damage: 12-16% (+1% per 100 AP) max HP",
    "Final breath: Applies Brittle",
    "Brittle: Next CC extended, deals 10-18% max HP",
    "Unstoppable during cast",
  ],
);

const OrnnE = new Ability(
  "Searing Charge",
  "E",
  "Charges forward dealing damage. Knocks up enemies if collides with terrain or pillar",
  {
    cooldown: [16, 15, 14, 13, 12],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 800,
  },
  {
    baseDamage: [80, 125, 170, 215, 260],
    bonusAdRatio: 40,
    damageType: "physical",
  },
  {
    ccType: "knockup",
    ccDuration: 1,
  },
  undefined,
  undefined,
  [
    "Cost: 50 mana",
    "Damage: 80-260 (+40% bonus AD)(+40% armor)(+40% MR)",
    "Collision knockup: 1s",
    "Destroys terrain made by Q",
  ],
);

const OrnnR = new Ability(
  "Call of the Forge God",
  "R",
  "Summons a ram that charges. Recast sends it back, knocking up and applying Brittle",
  {
    cooldown: [140, 120, 100],
    cooldownType: "standard",
  },
  {
    castTime: 0.5,
    range: 2500,
    radius: 400,
  },
  {
    baseDamage: [125, 175, 225],
    apRatio: 20,
    damageType: "magic",
  },
  {
    ccType: "knockup",
    ccDuration: 1.5,
    slow: 40,
  },
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "First cast: Slows 40%",
    "Second cast: 125-225 (+20% AP) + knockup",
    "Applies Brittle",
  ],
);

const Ornn = new Character(
  "Ornn",
  660, // HP
  9, // HP5
  33, // AR
  32, // MR
  69, // AD
  200, // Crit DMG (%)
  335, // MS
  175, // Attack range
  0.625, // Base AS
  [OrnnPassive, OrnnQ, OrnnW, OrnnE, OrnnR],
  [],
);

// Pantheon
const PantheonPassive = new Ability(
  "Mortal Will",
  "passive",
  "After 5 ability casts or attacks, next ability is empowered",
  {
    cooldown: [0],
    cooldownType: "static",
  },
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  [
    "Stacks from abilities and attacks",
    "At 5 stacks: Empowered ability",
    "Q: 40% more damage",
    "W: 3 extra strikes",
    "E: Duration extended",
  ],
);

const PantheonQ = new Ability(
  "Comet Spear",
  "Q",
  "Tap to thrust, hold to throw a spear. Empowered deals bonus damage and slows",
  {
    cooldown: [10, 9.5, 9, 8.5, 8],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 1200,
  },
  {
    baseDamage: [70, 100, 130, 160, 190],
    bonusAdRatio: 115,
    damageType: "physical",
  },
  {
    ccType: "slow",
    ccDuration: 1,
    slow: 30,
  },
  undefined,
  undefined,
  [
    "Cost: 40 mana",
    "Tap: Thrust 70-190 (+115% bonus AD)",
    "Hold: Throw 70-190 (+115% bonus AD)",
    "Empowered: +40% damage, slow",
    "Execute: 105-285 vs low HP",
  ],
);

const PantheonW = new Ability(
  "Shield Vault",
  "W",
  "Leaps to enemy, stunning them and striking. Empowered strikes 3 more times",
  {
    cooldown: [13, 12, 11, 10, 9],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 600,
  },
  {
    baseDamage: [60, 80, 100, 120, 140],
    apRatio: 100,
    damageType: "magic",
  },
  {
    ccType: "stun",
    ccDuration: 1,
  },
  undefined,
  undefined,
  [
    "Cost: 55 mana",
    "Damage: 60-140 (+100% AP)",
    "Stun: 1s",
    "Empowered: 3 extra auto attacks",
  ],
);

const PantheonE = new Ability(
  "Aegis Assault",
  "E",
  "Braces shield blocking damage from a direction while striking. Empowered extends duration",
  {
    cooldown: [22, 20.5, 19, 17.5, 16],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 400,
  },
  {
    baseDamage: [55, 105, 155, 205, 255],
    bonusAdRatio: 150,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 80 mana",
    "Damage: 55-255 (+150% bonus AD)",
    "Blocks all damage from direction",
    "Duration: 1.5s (2.5s empowered)",
  ],
);

const PantheonR = new Ability(
  "Grand Starfall",
  "R",
  "Channels then leaps to target location, dealing damage in a line on landing",
  {
    cooldown: [180, 165, 150],
    cooldownType: "standard",
  },
  {
    castTime: 2,
    range: 5500,
    radius: 350,
  },
  {
    baseDamage: [300, 500, 700],
    apRatio: 100,
    damageType: "magic",
  },
  {
    ccType: "slow",
    slow: 50,
  },
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "Landing: 300-700 (+100% AP)",
    "Slow: 50% in landing zone",
    "Grants full Mortal Will on landing",
  ],
);

const Pantheon = new Character(
  "Pantheon",
  650, // HP
  6, // HP5
  40, // AR
  28, // MR
  64, // AD
  200, // Crit DMG (%)
  345, // MS
  175, // Attack range
  0.658, // Base AS
  [PantheonPassive, PantheonQ, PantheonW, PantheonE, PantheonR],
  [],
);

// Poppy
const PoppyPassive = new Ability(
  "Iron Ambassador",
  "passive",
  "Periodically throws buckler dealing bonus damage and gaining a shield",
  {
    cooldown: [13, 10, 7],
    cooldownType: "static",
  },
  undefined,
  {
    baseDamage: [20, 120],
    damageType: "physical",
  },
  {
    shield: [15, 255],
    duration: 3,
  },
  undefined,
  undefined,
  [
    "Bonus: 20-120 based on level",
    "Shield: 15-255 based on level",
    "Pick up buckler for shield",
    "CD: 13/10/7s (levels 1/7/13)",
  ],
  true,
);

const PoppyQ = new Ability(
  "Hammer Shock",
  "Q",
  "Slams ground dealing damage. After delay, area erupts dealing more damage",
  {
    cooldown: [8, 7, 6, 5, 4],
    cooldownType: "standard",
  },
  {
    castTime: 0.3,
    range: 430,
    radius: 100,
  },
  {
    baseDamage: [40, 60, 80, 100, 120],
    bonusAdRatio: 90,
    maxHealthRatio: 8,
    damageType: "physical",
  },
  {
    ccType: "slow",
    ccDuration: 1,
    slow: [20, 25, 30, 35, 40],
  },
  undefined,
  undefined,
  [
    "Cost: 35/40/45/50/55 mana",
    "First hit: 40-120 (+90% bonus AD)(+8% max HP)",
    "Second hit: Same damage",
    "Slow: 20-40%",
  ],
);

const PoppyW = new Ability(
  "Steadfast Presence",
  "W",
  "Passive: Gains armor/MR. Active: Creates zone blocking enemy dashes and grounding",
  {
    cooldown: [24, 22, 20, 18, 16],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    radius: 400,
  },
  {
    baseDamage: [70, 110, 150, 190, 230],
    apRatio: 70,
    damageType: "magic",
  },
  {
    ccType: "knockup",
    ccDuration: 0.5,
    bonusStats: {
      armor: [10],
      mr: [10],
    },
    duration: 2,
  },
  undefined,
  undefined,
  [
    "Cost: 50 mana",
    "Passive: +10% armor/MR (doubled low HP)",
    "Active: Blocks dashes for 2s",
    "Knockup/damage if blocked",
    "MS: +40%",
  ],
);

const PoppyE = new Ability(
  "Heroic Charge",
  "E",
  "Charges to enemy, pushing them. If they hit terrain, stuns and deals bonus damage",
  {
    cooldown: [14, 13, 12, 11, 10],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 475,
  },
  {
    baseDamage: [60, 80, 100, 120, 140],
    bonusAdRatio: 50,
    damageType: "physical",
  },
  {
    ccType: "stun",
    ccDuration: 1.6,
  },
  undefined,
  undefined,
  [
    "Cost: 70 mana",
    "Damage: 60-140 (+50% bonus AD)",
    "Wall stun: +60-140 (+50% bonus AD)",
    "Stun duration: 1.6s",
  ],
);

const PoppyR = new Ability(
  "Keeper's Verdict",
  "R",
  "Tap to knock up enemies. Charge to knock enemies toward their fountain",
  {
    cooldown: [140, 120, 100],
    cooldownType: "standard",
  },
  {
    castTime: 0.35,
    range: 500,
    radius: 180,
  },
  {
    baseDamage: [100, 150, 200],
    bonusAdRatio: 90,
    damageType: "physical",
  },
  {
    ccType: "knockup",
    ccDuration: 0.75,
  },
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "Tap: Knockup 0.75s, 100-200 (+90% bonus AD)",
    "Charge: Sends enemies flying toward fountain",
    "Charged: 200-300 (+90% bonus AD)",
  ],
);

const Poppy = new Character(
  "Poppy",
  610, // HP
  8, // HP5
  35, // AR
  32, // MR
  60, // AD
  200, // Crit DMG (%)
  345, // MS
  125, // Attack range
  0.658, // Base AS
  [PoppyPassive, PoppyQ, PoppyW, PoppyE, PoppyR],
  [],
);

// Pyke
const PykePassive = new Ability(
  "Gift of the Drowned Ones",
  "passive",
  "Stores damage taken as grey health. Heals when unseen. Bonus HP converts to AD",
  {
    cooldown: [0],
    cooldownType: "static",
  },
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  [
    "Grey health: 30-81% damage taken",
    "Heals grey health when unseen",
    "Cannot gain bonus HP",
    "Bonus HP converts to AD (1:1.4)",
  ],
);

const PykeQ = new Ability(
  "Bone Skewer",
  "Q",
  "Tap to stab nearby enemy. Hold to throw harpoon, pulling and slowing",
  {
    cooldown: [10, 9.5, 9, 8.5, 8],
    cooldownType: "standard",
  },
  {
    castTime: 0.25,
    range: 1100,
  },
  {
    baseDamage: [100, 150, 200, 250, 300],
    bonusAdRatio: 60,
    damageType: "physical",
  },
  {
    ccType: "pull",
    slow: 90,
  },
  undefined,
  undefined,
  [
    "Cost: 55/60/65/70/75 mana",
    "Damage: 100-300 (+60% bonus AD)",
    "Tap: Stab in front",
    "Hold: Throw, pull and slow 90%",
  ],
);

const PykeW = new Ability(
  "Ghostwater Dive",
  "W",
  "Camouflages and gains movement speed. Leaves behind a false body briefly",
  {
    cooldown: [12, 11.5, 11, 10.5, 10],
    cooldownType: "standard",
  },
  {
    castTime: 0,
  },
  undefined,
  {
    bonusStats: {
      ms: [40, 45, 50, 55, 60],
    },
    duration: 5,
  },
  undefined,
  undefined,
  [
    "Cost: 50 mana",
    "Camouflage: Up to 5s",
    "MS: +40-60% (decaying)",
    "Enemies see ripples when near",
  ],
);

const PykeE = new Ability(
  "Phantom Undertow",
  "E",
  "Dashes leaving a phantom. After delay, phantom returns stunning enemies",
  {
    cooldown: [15],
    cooldownType: "standard",
  },
  {
    castTime: 0,
    range: 550,
  },
  {
    baseDamage: [105, 135, 165, 195, 225],
    bonusAdRatio: 100,
    damageType: "physical",
  },
  {
    ccType: "stun",
    ccDuration: 1.25,
  },
  undefined,
  undefined,
  [
    "Cost: 40 mana",
    "Damage: 105-225 (+100% bonus AD)",
    "Stun: 1.25s",
    "Phantom returns after 1s",
  ],
);

const PykeR = new Ability(
  "Death from Below",
  "R",
  "Executes enemies below threshold. Successful kills let Pyke recast and share gold",
  {
    cooldown: [120, 100, 80],
    cooldownType: "standard",
  },
  {
    castTime: 0.5,
    range: 750,
    radius: 200,
  },
  {
    baseDamage: [
      250, 290, 330, 370, 400, 430, 450, 470, 490, 510, 530, 540, 550,
    ],
    bonusAdRatio: 80,
    damageType: "true",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "Execute threshold: 250-550 (+80% bonus AD)",
    "Kill: Reset and share gold with assister",
    "X marks execute zone",
  ],
);

const Pyke = new Character(
  "Pyke",
  670, // HP
  7, // HP5
  37, // AR
  32, // MR
  62, // AD
  200, // Crit DMG (%)
  330, // MS
  150, // Attack range
  0.667, // Base AS
  [PykePassive, PykeQ, PykeW, PykeE, PykeR],
  [],
);

// Qiyana
const QiyanaPassive = new Ability(
  "Royal Privilege",
  "passive",
  "Qiyana's first attack or ability against an enemy champion deals bonus physical damage. This effect has a per-target cooldown.",
  { cooldown: [25], cooldownType: "static" },
  undefined,
  {
    baseDamage: [15, 83],
    bonusAdRatio: 25,
    apRatio: 30,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  ["Cannot occur on the same target more than once every 25 seconds"],
);

const QiyanaQ = new Ability(
  "Edge of Ixtal",
  "Q",
  "Qiyana slashes dealing physical damage. With an element, gains extra range and effects: Brush grants invisibility and MS, River roots then slows, Terrain deals bonus damage to low HP targets.",
  { cooldown: [7, 7, 7, 7, 7], cooldownType: "standard" },
  { castTime: 0.25, range: 525 },
  {
    baseDamage: [70, 100, 130, 160, 190],
    bonusAdRatio: 85,
    damageType: "physical",
  },
  {
    ccType: "root",
    ccDuration: 0.5,
    slow: 20,
    duration: 1,
  },
  undefined,
  undefined,
  [
    "Terrain element deals 60% bonus damage to targets below 50% HP",
    "155% damage against monsters",
  ],
);

const QiyanaW = new Ability(
  "Terrashape",
  "W",
  "Qiyana dashes to and enchants her weapon with an element. While enchanted, gains out-of-combat MS, attack speed, and bonus magic damage on attacks/abilities.",
  { cooldown: [7, 7, 7, 7, 7], cooldownType: "standard" },
  { castTime: 0, range: 350 },
  {
    baseDamage: [8, 16, 24, 32, 40],
    apRatio: 45,
    bonusAdRatio: 20,
    damageType: "magic",
  },
  {
    bonusStats: { as: [15, 20, 25, 30, 35], ms: [3, 5, 7, 9, 11] },
  },
  undefined,
  undefined,
  ["Movement speed bonus only while out of combat"],
);

const QiyanaE = new Ability(
  "Audacity",
  "E",
  "Qiyana dashes through an enemy, dealing physical damage.",
  { cooldown: [12, 11, 10, 9, 8], cooldownType: "standard" },
  { castTime: 0, range: 675 },
  {
    baseDamage: [50, 90, 130, 170, 210],
    bonusAdRatio: 50,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  ["Only damages targets within 250 range upon dash completion"],
);

const QiyanaR = new Ability(
  "Supreme Display of Talent",
  "R",
  "Qiyana creates a shockwave, knocking back enemies. River, Brush, or Wall hit explodes dealing physical damage plus % max HP and stunning enemies.",
  { cooldown: [120, 100, 80], cooldownType: "standard" },
  { castTime: 0.25, range: 950 },
  {
    baseDamage: [100, 200, 300],
    bonusAdRatio: 125,
    maxHealthRatio: 10,
    damageType: "physical",
  },
  {
    ccType: "stun",
    ccDuration: 1,
  },
  undefined,
  undefined,
  ["Stun duration 0.5-1 second based on proximity"],
);

const Qiyana = new Character(
  "Qiyana",
  590, // HP
  8, // HP5
  31, // AR
  32, // MR
  64, // AD
  200, // Crit DMG (%)
  335, // MS
  150, // Attack range
  0.688, // Base AS
  [QiyanaPassive, QiyanaQ, QiyanaW, QiyanaE, QiyanaR],
  [],
);

// Quinn
const QuinnPassive = new Ability(
  "Harrier",
  "passive",
  "Valor periodically marks enemies as Vulnerable. Quinn's attacks and damaging abilities against Vulnerable targets deal bonus physical damage.",
  { cooldown: [8], cooldownType: "static" },
  undefined,
  {
    baseDamage: [15, 120],
    bonusAdRatio: 40,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  ["Cooldown reduced when attacking Vulnerable targets"],
);

const QuinnQ = new Ability(
  "Blinding Assault",
  "Q",
  "Quinn sends Valor to mark and damage enemies, nearsighting champions or disarming non-champions.",
  { cooldown: [11, 10.5, 10, 9.5, 9], cooldownType: "standard" },
  { castTime: 0.25, range: 1025 },
  {
    baseDamage: [65, 100, 135, 170, 205],
    bonusAdRatio: 100,
    apRatio: 50,
    damageType: "physical",
  },
  {
    duration: 1.75,
  },
  undefined,
  undefined,
  ["Nearsights champions, disarms non-champions"],
);

const QuinnW = new Ability(
  "Heightened Senses",
  "W",
  "Passive: Attacking a Vulnerable target grants Quinn bonus movement speed and attack speed. Active: Valor reveals the surrounding area.",
  { cooldown: [50, 45, 40, 35, 30], cooldownType: "standard" },
  { castTime: 0, range: 2100 },
  undefined,
  {
    bonusStats: { ms: [20, 25, 30, 35, 40], as: [28, 41, 54, 67, 80] },
    duration: 2,
  },
  undefined,
  undefined,
  ["Vision lasts 2 seconds"],
);

const QuinnE = new Ability(
  "Vault",
  "E",
  "Quinn dashes to an enemy, dealing damage and slowing them, then leaps back.",
  { cooldown: [12, 11, 10, 9, 8], cooldownType: "standard" },
  { castTime: 0, range: 675 },
  {
    baseDamage: [40, 65, 90, 115, 140],
    bonusAdRatio: 20,
    damageType: "physical",
  },
  {
    slow: 50,
    duration: 1.5,
  },
  undefined,
  undefined,
  ["Slow decays over duration", "Marks target as Vulnerable"],
);

const QuinnR = new Ability(
  "Behind Enemy Lines",
  "R",
  "Quinn channels to pair with Valor, gaining massive movement speed. Attacking or using abilities triggers Skystrike, dealing damage and marking champions Vulnerable.",
  { cooldown: [3, 3, 3], cooldownType: "standard" },
  { castTime: 2 },
  {
    baseDamage: [60, 90, 120],
    bonusAdRatio: 35,
    damageType: "physical",
  },
  {
    bonusStats: { ms: [70, 100, 130] },
  },
  undefined,
  undefined,
  ["2 second channel to activate", "Skystrike deals damage in an area"],
);

const Quinn = new Character(
  "Quinn",
  565, // HP
  5.5, // HP5
  28, // AR
  30, // MR
  59, // AD
  200, // Crit DMG (%)
  330, // MS
  525, // Attack range
  0.668, // Base AS
  [QuinnPassive, QuinnQ, QuinnW, QuinnE, QuinnR],
  [],
);

// Rakan
const RakanPassive = new Ability(
  "Fey Feathers",
  "passive",
  "Rakan periodically gains a shield. Basic attacks and abilities reduce the cooldown.",
  { cooldown: [40, 16], cooldownType: "static" },
  undefined,
  undefined,
  {
    shield: [30, 225],
  },
  undefined,
  undefined,
  ["1 second cooldown reduction per champion hit"],
);

const RakanQ = new Ability(
  "Gleaming Quill",
  "Q",
  "Rakan flings a feather dealing magic damage. If it hits a champion or epic monster, Rakan can heal himself and nearby allies.",
  { cooldown: [11, 10, 9, 8, 7], cooldownType: "standard" },
  { castTime: 0.25, range: 900 },
  {
    baseDamage: [70, 115, 160, 205, 250],
    apRatio: 70,
    damageType: "magic",
  },
  {
    heal: [40, 210],
  },
  undefined,
  undefined,
  [
    "Heals after 3 seconds or when touching an allied champion",
    "Heal scales with 55% AP",
  ],
);

const RakanW = new Ability(
  "Grand Entrance",
  "W",
  "Rakan dashes to a location, then spirals into the air, knocking up and damaging enemies.",
  { cooldown: [18, 16.5, 15, 13.5, 12], cooldownType: "standard" },
  { castTime: 0, range: 600 },
  {
    baseDamage: [70, 120, 170, 220, 270],
    apRatio: 80,
    damageType: "magic",
  },
  {
    ccType: "knockup",
    ccDuration: 1,
  },
  undefined,
  undefined,
  ["Can be interrupted during dash"],
);

const RakanE = new Ability(
  "Battle Dance",
  "E",
  "Rakan dashes to an allied champion, granting them a shield. Can be recast once within 5 seconds.",
  { cooldown: [20, 18, 16, 14, 12], cooldownType: "standard" },
  { castTime: 0, range: 700 },
  undefined,
  {
    shield: [40, 65, 90, 115, 140],
  },
  2,
  5,
  ["Extended range when dashing to Xayah", "Shield scales with 80% AP"],
);

const RakanR = new Ability(
  "The Quickness",
  "R",
  "Rakan gains bonus movement speed and charms enemies he touches, dealing magic damage.",
  { cooldown: [130, 110, 90], cooldownType: "standard" },
  { castTime: 0 },
  {
    baseDamage: [100, 200, 300],
    apRatio: 50,
    damageType: "magic",
  },
  {
    ccType: "stun",
    ccDuration: 1.25,
    bonusStats: { ms: [75, 75, 75] },
    duration: 4,
  },
  undefined,
  undefined,
  ["Charms enemies (1/1.25/1.5s)", "Can only charm each enemy once per cast"],
);

const Rakan = new Character(
  "Rakan",
  610, // HP
  5, // HP5
  30, // AR
  32, // MR
  62, // AD
  200, // Crit DMG (%)
  335, // MS
  300, // Attack range
  0.635, // Base AS
  [RakanPassive, RakanQ, RakanW, RakanE, RakanR],
  [],
);

// Rammus
const RammusPassive = new Ability(
  "Spiked Shell",
  "passive",
  "Rammus gains bonus attack damage equal to 15% of his bonus armor and 15% of his bonus magic resistance.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  ["AD = 15% bonus armor + 15% bonus MR"],
);

const RammusQ = new Ability(
  "Powerball",
  "Q",
  "Rammus curls into a ball, gaining accelerating movement speed. Colliding with an enemy deals magic damage, knocks back, and slows nearby enemies.",
  { cooldown: [16, 13.5, 11, 8.5, 6], cooldownType: "standard" },
  { castTime: 0 },
  {
    baseDamage: [80, 120, 160, 200, 240],
    apRatio: 100,
    damageType: "magic",
  },
  {
    slow: [40, 50, 60, 70, 80],
    duration: 1,
  },
  undefined,
  undefined,
  ["Movement speed accelerates over 6 seconds up to 150-235%"],
);

const RammusW = new Ability(
  "Defensive Ball Curl",
  "W",
  "Rammus enters defensive formation, gaining armor and magic resistance. Enemies that attack him take magic damage.",
  { cooldown: [6, 6, 6, 6, 6], cooldownType: "standard" },
  { castTime: 0 },
  {
    baseDamage: [15, 15, 15, 15, 15],
    damageType: "magic",
  },
  {
    bonusStats: { armor: [27, 32, 37, 42, 47], mr: [27, 32, 37, 42, 47] },
    duration: 7,
  },
  undefined,
  undefined,
  [
    "Reflects damage = 15 + 10% armor + 10% MR",
    "Bonus resistances scale with total armor/MR",
  ],
);

const RammusE = new Ability(
  "Frenzying Taunt",
  "E",
  "Rammus taunts an enemy champion or monster. Monsters take bonus magic damage.",
  { cooldown: [12, 12, 12, 12, 12], cooldownType: "standard" },
  { castTime: 0, range: 325 },
  {
    baseDamage: [80, 100, 120, 140, 160],
    apRatio: 70,
    damageType: "magic",
  },
  {
    ccType: "stun",
    ccDuration: 1.6,
  },
  undefined,
  undefined,
  ["Taunts enemy (1.2/1.4/1.6/1.8/2s)", "Monster damage only"],
);

const RammusR = new Ability(
  "Soaring Slam",
  "R",
  "Rammus hops into the air and slams down, dealing magic damage and slowing enemies. Creates aftershocks that deal additional damage.",
  { cooldown: [90, 80, 70], cooldownType: "standard" },
  { castTime: 0, range: 600 },
  {
    baseDamage: [100, 175, 250],
    apRatio: 60,
    damageType: "magic",
  },
  {
    slow: 15,
    duration: 1.5,
  },
  undefined,
  undefined,
  [
    "Aftershocks deal 20/30/40 (+10% AP) damage each",
    "Knocks up if cast during Powerball",
    "Damage doubled against structures",
  ],
);

const Rammus = new Character(
  "Rammus",
  645, // HP
  8, // HP5
  35, // AR
  32, // MR
  65, // AD
  200, // Crit DMG (%)
  335, // MS
  125, // Attack range
  0.7, // Base AS
  [RammusPassive, RammusQ, RammusW, RammusE, RammusR],
  [],
);

// Rek'Sai
const RekSaiPassive = new Ability(
  "Fury of the Xer'Sai",
  "passive",
  "Rek'Sai generates Fury when attacking or using abilities. While burrowed, she consumes Fury to restore health.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  undefined,
  {
    heal: [9, 20],
  },
  undefined,
  undefined,
  [
    "Heals 9-20% max HP per 3 seconds while burrowed",
    "Loses 20 Fury per second after 5 seconds of not generating",
  ],
);

const RekSaiQ = new Ability(
  "Queen's Wrath",
  "Q",
  "Rek'Sai gains 35% bonus attack speed for 3s. Next 3 attacks deal bonus physical damage to target and surrounding enemies.",
  { cooldown: [4, 3.5, 3, 2.5, 2], cooldownType: "standard" },
  { castTime: 0, range: 325 },
  {
    baseDamage: [0, 0, 0, 0, 0],
    adRatio: [30, 35, 40, 45, 50],
    damageType: "physical",
  },
  {
    bonusStats: { as: [35, 35, 35, 35, 35] },
  },
  3,
  3,
  [
    "Damage: 30-50% AD per hit",
    "Can critically strike",
    "Resets auto attack timer",
  ],
);

const RekSaiW = new Ability(
  "Burrow / Unburrow",
  "W",
  "Burrow: Gains movement speed and tremor sense. Unburrow: Knocks up closest enemy and deals magic damage.",
  { cooldown: [4, 4, 4, 4, 4], cooldownType: "standard" },
  { castTime: 0 },
  {
    baseDamage: [50, 75, 100, 125, 150],
    apRatio: 100,
    damageType: "magic",
  },
  {
    ccType: "knockup",
    ccDuration: 1,
    bonusStats: { ms: [5, 10, 15, 20, 25] },
  },
  undefined,
  undefined,
  ["Enemies can only be knocked up once per 10/9/8/7/6 seconds"],
);

const RekSaiE = new Ability(
  "Furious Bite",
  "E",
  "Rek'Sai bites target dealing physical damage. At max Fury, deals 125% damage as true damage.",
  { cooldown: [6, 6, 6, 6, 6], cooldownType: "standard" },
  { castTime: 0.25, range: 225 },
  {
    baseDamage: [80, 108, 136, 164, 192],
    bonusAdRatio: 64,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  ["At max Fury: 100/135/170/205/240 (+80% bonus AD) true damage"],
);

const RekSaiR = new Ability(
  "Void Rush",
  "R",
  "Rek'Sai marks targets by damaging them. Activating makes her untargetable and lunges at marked target dealing heavy damage.",
  { cooldown: [120, 100, 80], cooldownType: "standard" },
  { castTime: 0.25, range: 1500 },
  {
    baseDamage: [150, 250, 350],
    bonusAdRatio: 100,
    maxHealthRatio: [15, 20, 25],
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  ["Becomes untargetable during dash", "Damage: +15/20/25% target max HP"],
);

const RekSai = new Character(
  "Rek'Sai",
  600, // HP
  2.5, // HP5
  35, // AR
  32, // MR
  62, // AD
  200, // Crit DMG (%)
  340, // MS
  175, // Attack range
  0.667, // Base AS
  [RekSaiPassive, RekSaiQ, RekSaiW, RekSaiE, RekSaiR],
  [],
);

// Rell
const RellPassive = new Ability(
  "Break the Mold",
  "passive",
  "Rell's basic attacks deal bonus magic damage and steal armor and magic resistance from enemies, stacking up to 5 times.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  {
    baseDamage: [0],
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Bonus damage = 5% total armor + 5% total MR",
    "Steals 3% armor/MR per stack, max 15%",
  ],
);

const RellQ = new Ability(
  "Shattering Strike",
  "Q",
  "Rell thrusts her lance, destroying shields and dealing magic damage while stunning enemies.",
  { cooldown: [11, 10.5, 10, 9.5, 9], cooldownType: "standard" },
  { castTime: 0.35, range: 685 },
  {
    baseDamage: [70, 100, 130, 160, 190],
    apRatio: 50,
    damageType: "magic",
  },
  {
    ccType: "stun",
    ccDuration: 0.75,
  },
  undefined,
  undefined,
  [
    "Destroys damage-mitigating shields (excluding monsters)",
    "250% damage against monsters",
  ],
);

const RellW = new Ability(
  "Ferromancy: Crash Down / Mount Up",
  "W",
  "Crash Down: Leaps off mount stunning and knocking up enemies, gaining shield. Mount Up: Gains resistances and empowers next attack to stun.",
  { cooldown: [13, 12, 11, 10, 9], cooldownType: "standard" },
  { castTime: 0, range: 400 },
  {
    baseDamage: [60, 90, 120, 150, 180],
    apRatio: 60,
    damageType: "magic",
  },
  {
    ccType: "knockup",
    ccDuration: 0.4,
    shield: [20, 40, 60, 80, 100],
  },
  undefined,
  undefined,
  [
    "Crash Down stun: 0.8s, knockup: 0.4s",
    "Mount Up: +15% armor/MR, +20% AS, +75 range",
    "Mount Up stun: 0.6s, knockup: 0.4s",
  ],
);

const RellE = new Ability(
  "Full Tilt",
  "E",
  "Rell and an ally charge gaining movement speed. Rell's next attack or Q explodes dealing % max HP magic damage.",
  { cooldown: [13, 13, 13, 13, 13], cooldownType: "standard" },
  { castTime: 0, range: 1000 },
  {
    baseDamage: [0],
    maxHealthRatio: [5, 5.5, 6, 6.5, 7],
    maxHealthRatioPerAP: 3,
    damageType: "magic",
  },
  {
    bonusStats: { ms: [10, 10, 10, 10, 10] },
    duration: 3,
  },
  undefined,
  undefined,
  [
    "Movement speed increased to 25% when facing champions or each other",
    "Damage capped at 150 against monsters",
  ],
);

const RellR = new Ability(
  "Magnet Storm",
  "R",
  "Rell explodes in magnetic fury, pulling enemies toward herself and dealing magic damage over 2 seconds.",
  { cooldown: [120, 100, 80], cooldownType: "standard" },
  { castTime: 0 },
  {
    baseDamage: [120, 200, 280],
    apRatio: 110,
    damageType: "magic",
  },
  {
    ccType: "pull",
    duration: 2,
  },
  undefined,
  undefined,
  ["Continuously drags enemies toward Rell"],
);

const Rell = new Character(
  "Rell",
  620, // HP
  7.5, // HP5
  30, // AR
  28, // MR
  55, // AD
  200, // Crit DMG (%)
  315, // MS
  175, // Attack range
  0.625, // Base AS
  [RellPassive, RellQ, RellW, RellE, RellR],
  [],
);

// Renata Glasc
const RenataPassive = new Ability(
  "Leverage",
  "passive",
  "Renata's basic attacks mark enemies. Marked enemies take bonus magic damage from Renata or allies based on their max HP.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  {
    baseDamage: [0],
    maxHealthRatio: [1, 5.25],
    maxHealthRatioPerAP: 1,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Allies consume the mark for the same damage",
    "Capped at 150 against monsters",
  ],
);

const RenataQ = new Ability(
  "Handshake",
  "Q",
  "Renata fires a hook, dealing damage and rooting the first enemy. Can recast to throw the enemy, damaging and stunning others.",
  { cooldown: [16, 16, 16, 16, 16], cooldownType: "standard" },
  { castTime: 0.25, range: 900 },
  {
    baseDamage: [80, 125, 170, 215, 260],
    apRatio: 80,
    damageType: "magic",
  },
  {
    ccType: "root",
    ccDuration: 1,
  },
  2,
  undefined,
  ["Recast: Throw enemy, stuns for 0.5s if thrown enemy is a champion"],
);

const RenataW = new Ability(
  "Bailout",
  "W",
  "Renata infuses an ally, granting attack speed and movement speed. If the ally would die, they instead gain full HP that decays. Getting a takedown saves them.",
  { cooldown: [28, 26, 24, 22, 20], cooldownType: "standard" },
  { castTime: 0.25, range: 800 },
  undefined,
  {
    bonusStats: { as: [10, 15, 20, 25, 30], ms: [10, 12.5, 15, 17.5, 20] },
    duration: 5,
  },
  undefined,
  undefined,
  [
    "Buffs ramp up to double over 5 seconds",
    "Takedown sets HP to 35% and stops decay",
  ],
);

const RenataE = new Ability(
  "Loyalty Program",
  "E",
  "Renata sends chemtech missiles dealing magic damage and slowing enemies. Allies hit gain a shield.",
  { cooldown: [14, 13, 12, 11, 10], cooldownType: "standard" },
  { castTime: 0.25, range: 800 },
  {
    baseDamage: [65, 95, 125, 155, 185],
    apRatio: 55,
    damageType: "magic",
  },
  {
    slow: 30,
    duration: 2,
    shield: [50, 70, 90, 110, 130],
  },
  undefined,
  undefined,
  ["Shield lasts 3 seconds", "Shield scales with 60% AP"],
);

const RenataR = new Ability(
  "Hostile Takeover",
  "R",
  "Renata sends a wave of chemicals, causing enemies to go Berserk, attacking the nearest unit with 100% bonus attack speed.",
  { cooldown: [100, 90, 80], cooldownType: "standard" },
  { castTime: 0.75, range: 2000 },
  undefined,
  {
    ccType: "fear",
    ccDuration: 1.75,
  },
  undefined,
  undefined,
  [
    "Berserk (1.25/1.75/2.25s)",
    "Berserk enemies prioritize allies > neutrals > Renata's team > Renata",
  ],
);

const Renata = new Character(
  "Renata Glasc",
  545, // HP
  5.5, // HP5
  27, // AR
  30, // MR
  49, // AD
  200, // Crit DMG (%)
  330, // MS
  550, // Attack range
  0.625, // Base AS
  [RenataPassive, RenataQ, RenataW, RenataE, RenataR],
  [],
);

// Renekton
const RenektonPassive = new Ability(
  "Reign of Anger",
  "passive",
  "Renekton's attacks generate Fury. When below 50% HP, Fury generation is increased by 50%. Fury empowers abilities.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  ["50% increased Fury generation below 50% HP"],
);

const RenektonQ = new Ability(
  "Cull the Meek",
  "Q",
  "Renekton swings his blade dealing physical damage and healing per target hit. Empowered: Increased damage and healing.",
  { cooldown: [8, 8, 8, 8, 8], cooldownType: "standard" },
  { castTime: 0.25, range: 325 },
  {
    baseDamage: [60, 90, 120, 150, 180],
    bonusAdRatio: 100,
    damageType: "physical",
  },
  {
    heal: [12, 20, 28, 36, 44],
  },
  undefined,
  undefined,
  [
    "Heal: 17% bonus AD ratio vs champions",
    "Fury: 90-270 (+140% bonus AD) damage",
    "Fury: 36-132 (+51% bonus AD) heal vs champions",
  ],
);

const RenektonW = new Ability(
  "Ruthless Predator",
  "W",
  "Renekton's next attack strikes twice, stunning and dealing bonus damage. Empowered: Strikes 3 times, destroys shields, longer stun.",
  { cooldown: [13, 12, 11, 10, 9], cooldownType: "standard" },
  { castTime: 0 },
  {
    baseDamage: [10, 40, 70, 100, 130],
    adRatio: 150,
    damageType: "physical",
  },
  {
    ccType: "stun",
    ccDuration: 0.75,
  },
  undefined,
  undefined,
  [
    "Fury: 15-195 (+225% AD) damage, 1.5s stun",
    "Fury version destroys shields",
  ],
);

const RenektonE = new Ability(
  "Slice and Dice",
  "E",
  "Renekton dashes dealing physical damage. Hitting an enemy allows a second dash. Empowered: Second dash deals more damage and shreds armor.",
  { cooldown: [16, 14.5, 13, 11.5, 10], cooldownType: "standard" },
  { castTime: 0, range: 450 },
  {
    baseDamage: [40, 70, 100, 130, 160],
    bonusAdRatio: 90,
    damageType: "physical",
  },
  undefined,
  2,
  4,
  [
    "Fury: 70-250 (+135% bonus AD) on second dash",
    "Fury: Shreds 25-35% armor for 4 seconds",
  ],
);

const RenektonR = new Ability(
  "Dominus",
  "R",
  "Renekton transforms for 15 seconds, gaining bonus max HP, Fury, and dealing magic damage per second to nearby enemies.",
  { cooldown: [120, 120, 120], cooldownType: "standard" },
  { castTime: 0 },
  {
    baseDamage: [30, 75, 120],
    apRatio: 5,
    bonusAdRatio: 5,
    damageType: "magic",
  },
  {
    duration: 15,
  },
  undefined,
  undefined,
  ["Gains 300/500/700 max HP", "Gains 20 Fury immediately, 75 over duration"],
);

const Renekton = new Character(
  "Renekton",
  660, // HP
  8, // HP5
  35, // AR
  28, // MR
  69, // AD
  200, // Crit DMG (%)
  345, // MS
  125, // Attack range
  0.665, // Base AS
  [RenektonPassive, RenektonQ, RenektonW, RenektonE, RenektonR],
  [],
);

// Rengar
const RengarPassive = new Ability(
  "Unseen Predator",
  "passive",
  "Rengar leaps from brush. At 4 Ferocity, next ability is empowered. Killing unique champions permanently increases AD.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  undefined,
  {
    bonusStats: { ms: [30, 40, 50] },
    duration: 1.5,
  },
  undefined,
  undefined,
  [
    "Trophy bonuses: 1%/4%/9%/16%/25% bonus AD",
    "Empowered ability grants 30/40/50% MS at levels 1/7/13",
  ],
);

const RengarQ = new Ability(
  "Savagery",
  "Q",
  "Rengar's next 2 attacks gain attack speed. The first deals bonus physical damage. Empowered: More damage and massive attack speed.",
  { cooldown: [6, 5.5, 5, 4.5, 4], cooldownType: "standard" },
  { castTime: 0 },
  {
    baseDamage: [30, 60, 90, 120, 150],
    adRatio: 25,
    damageType: "physical",
  },
  {
    bonusStats: { as: [40, 40, 40, 40, 40] },
  },
  undefined,
  undefined,
  [
    "Empowered: 30-235 (+40% AD) damage",
    "Empowered: 50-101% attack speed for 5 seconds",
  ],
);

const RengarW = new Ability(
  "Battle Roar",
  "W",
  "Rengar roars dealing magic damage and restoring HP based on recent damage taken. Empowered: Also cleanses crowd control.",
  { cooldown: [16, 14.5, 13, 11.5, 10], cooldownType: "standard" },
  { castTime: 0, range: 450 },
  {
    baseDamage: [60, 100, 140, 180, 220],
    apRatio: 95,
    damageType: "magic",
  },
  {
    heal: [0],
  },
  undefined,
  undefined,
  [
    "Heals 60% of damage taken in last 1.5 seconds",
    "Empowered: 50-220 (+80% AP), cleanses CC",
  ],
);

const RengarE = new Ability(
  "Bola Strike",
  "E",
  "Rengar throws a bola dealing physical damage and slowing. Empowered: Deals more damage and roots instead.",
  { cooldown: [10, 10, 10, 10, 10], cooldownType: "standard" },
  { castTime: 0.25, range: 1000 },
  {
    baseDamage: [55, 100, 145, 190, 235],
    bonusAdRatio: 80,
    damageType: "physical",
  },
  {
    slow: [30, 45, 60, 75, 90],
    duration: 1.75,
  },
  undefined,
  undefined,
  ["Empowered: 50-305 (+80% bonus AD), roots for 1.75s"],
);

const RengarR = new Ability(
  "Thrill of the Hunt",
  "R",
  "Rengar becomes camouflaged, gains movement speed, and reveals the nearest enemy champion. Can leap without brush, shredding armor.",
  { cooldown: [110, 90, 70], cooldownType: "standard" },
  { castTime: 0 },
  {
    baseDamage: [0],
    adRatio: 100,
    damageType: "physical",
  },
  {
    bonusStats: { ms: [40, 50, 60] },
    duration: 16,
  },
  undefined,
  undefined,
  [
    "Duration: 12/16/20s",
    "2 second delay before camouflage",
    "Reveals nearest enemy within 2500/3000/3500 range",
    "Shreds 12/18/24 armor for 4 seconds",
  ],
);

const Rengar = new Character(
  "Rengar",
  590, // HP
  6, // HP5
  34, // AR
  32, // MR
  68, // AD
  200, // Crit DMG (%)
  345, // MS
  125, // Attack range
  0.667, // Base AS
  [RengarPassive, RengarQ, RengarW, RengarE, RengarR],
  [],
);

// Riven
const RivenPassive = new Ability(
  "Runic Blade",
  "passive",
  "Riven's abilities generate Charge stacks. Basic attacks consume a stack to deal bonus physical damage.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  {
    baseDamage: [0],
    adRatio: 50,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Bonus damage: 30-50% AD based on level",
    "Reduced to 15-25% AD vs structures",
    "+50 bonus damage vs monsters",
    "Can crit, applies lifesteal",
  ],
);

const RivenQ = new Ability(
  "Broken Wings",
  "Q",
  "Riven slashes forward dealing physical damage. Can be cast 3 times. Third cast knocks up enemies.",
  { cooldown: [13, 13, 13, 13, 13], cooldownType: "standard" },
  { castTime: 0, range: 275 },
  {
    baseDamage: [45, 75, 105, 135, 165],
    bonusAdRatio: 85,
    damageType: "physical",
  },
  {
    ccType: "knockup",
    ccDuration: 0.5,
  },
  3,
  4,
  ["Third cast knocks up enemies"],
);

const RivenW = new Ability(
  "Ki Burst",
  "W",
  "Riven stuns nearby enemies and deals physical damage.",
  { cooldown: [11, 10, 9, 8, 7], cooldownType: "standard" },
  { castTime: 0, range: 125 },
  {
    baseDamage: [65, 95, 125, 155, 185],
    bonusAdRatio: 100,
    damageType: "physical",
  },
  {
    ccType: "stun",
    ccDuration: 0.75,
  },
  undefined,
  undefined,
  [],
);

const RivenE = new Ability(
  "Valor",
  "E",
  "Riven dashes forward and gains a shield.",
  { cooldown: [10, 9, 8, 7, 6], cooldownType: "standard" },
  { castTime: 0, range: 250 },
  undefined,
  {
    shield: [70, 95, 120, 145, 170],
    duration: 1.5,
  },
  undefined,
  undefined,
  ["Shield scales with 110% bonus AD"],
);

const RivenR = new Ability(
  "Blade of the Exile",
  "R",
  "Riven's sword reforms, gaining 25% bonus AD and extended range for 15 seconds. Grants Wind Slash: fires a ranged attack dealing damage based on missing HP.",
  { cooldown: [120, 90, 60], cooldownType: "standard" },
  { castTime: 0, range: 900 },
  {
    baseDamage: [100, 150, 200],
    bonusAdRatio: 60,
    missingHealthRatio: [0],
    damageType: "physical",
  },
  {
    bonusStats: { ad: [25, 25, 25] },
    duration: 15,
  },
  undefined,
  undefined,
  [
    "Wind Slash: 100-300 (+60-180% bonus AD) based on missing HP",
    "Max damage at 75% missing HP",
  ],
);

const Riven = new Character(
  "Riven",
  630, // HP
  8.5, // HP5
  33, // AR
  32, // MR
  64, // AD
  200, // Crit DMG (%)
  340, // MS
  125, // Attack range
  0.625, // Base AS
  [RivenPassive, RivenQ, RivenW, RivenE, RivenR],
  [],
);

// Rumble
const RumblePassive = new Ability(
  "Junkyard Titan",
  "passive",
  "Rumble's abilities generate Heat. Above 50 Heat, abilities gain bonus effects. At 150 Heat, he overheats: silenced but gains attack speed and empowered basic attacks.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  {
    baseDamage: [5, 40],
    apRatio: 25,
    maxHealthRatio: 4,
    damageType: "magic",
  },
  {
    bonusStats: { as: [50, 130] },
    duration: 4,
  },
  undefined,
  undefined,
  [
    "Danger Zone (50+ Heat): +50% ability effects",
    "Overheated attacks: 5-40 (+25% AP)(+4% max HP) magic damage",
  ],
);

const RumbleQ = new Ability(
  "Flamespitter",
  "Q",
  "Rumble torches enemies with his flamethrower, dealing magic damage over 3 seconds. Danger Zone: 50% increased damage.",
  { cooldown: [6, 5.5, 5, 4.5, 4], cooldownType: "standard" },
  { castTime: 0, range: 600 },
  {
    baseDamage: [60, 85, 110, 135, 160],
    apRatio: 100,
    maxHealthRatio: [6, 6.5, 7, 7.5, 8],
    damageType: "magic",
  },
  {
    duration: 3,
  },
  undefined,
  undefined,
  [
    "Deals 70% damage to minions",
    "Danger Zone: 90-240 (+150% AP)(+9-12% max HP)",
  ],
);

const RumbleW = new Ability(
  "Scrap Shield",
  "W",
  "Rumble creates a shield and gains movement speed. Danger Zone: 50% increased effects.",
  { cooldown: [6, 6, 6, 6, 6], cooldownType: "standard" },
  { castTime: 0 },
  undefined,
  {
    shield: [80, 110, 140, 170, 200],
    bonusStats: { ms: [10, 15, 20, 25, 30] },
    duration: 1.5,
  },
  undefined,
  undefined,
  [
    "Shield scales with 30% AP",
    "Danger Zone: 120-300 (+45% AP) shield, 15-45% MS",
  ],
);

const RumbleE = new Ability(
  "Electro Harpoon",
  "E",
  "Rumble fires a harpoon dealing magic damage, slowing, and reducing magic resist. Can store 2 charges. Danger Zone: 50% increased effects.",
  { cooldown: [6, 6, 6, 6, 6], cooldownType: "ammo" },
  { castTime: 0.25, range: 850 },
  {
    baseDamage: [55, 80, 105, 130, 155],
    apRatio: 50,
    damageType: "magic",
  },
  {
    slow: [10, 15, 20, 25, 30],
    duration: 2,
  },
  2,
  undefined,
  [
    "Second hit: 15-45% slow, 18-30% MR shred",
    "Danger Zone: 82.5-232.5 (+75% AP), enhanced slow/shred",
  ],
);

const RumbleR = new Ability(
  "The Equalizer",
  "R",
  "Rumble launches rockets creating a burning trail that slows enemies and deals magic damage per second for 5 seconds.",
  { cooldown: [100, 85, 70], cooldownType: "standard" },
  { castTime: 0.25, range: 1700 },
  {
    baseDamage: [700, 1050, 1400],
    apRatio: 175,
    damageType: "magic",
  },
  {
    slow: 35,
    duration: 5,
  },
  undefined,
  undefined,
  [
    "140/210/280 (+35% AP) damage per second",
    "Total: 700/1050/1400 (+175% AP)",
  ],
);

const Rumble = new Character(
  "Rumble",
  640, // HP
  7, // HP5
  36, // AR
  28, // MR
  64, // AD
  200, // Crit DMG (%)
  345, // MS
  125, // Attack range
  0.644, // Base AS
  [RumblePassive, RumbleQ, RumbleW, RumbleE, RumbleR],
  [],
);

// Ryze
const RyzePassive = new Ability(
  "Arcane Mastery",
  "passive",
  "Ryze's spells deal extra damage based on his bonus mana. His maximum mana is increased by 10% per 100 ability power.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  ["Damage scales with bonus mana", "Max mana: +10% per 100 AP"],
);

const RyzeQ = new Ability(
  "Overload",
  "Q",
  "Ryze fires a blast dealing magic damage. If target has Flux, damage is increased and bounces to nearby Flux targets. Discharging 2 runes grants movement speed.",
  { cooldown: [6, 6, 6, 6, 6], cooldownType: "standard" },
  { castTime: 0.25, range: 1000 },
  {
    baseDamage: [75, 95, 115, 135, 155],
    apRatio: 55,
    maxManaRatio: 2,
    damageType: "magic",
  },
  {
    bonusStats: { ms: [10, 40, 70, 100] },
    duration: 2,
  },
  undefined,
  undefined,
  [
    "W and E refresh Q cooldown and charge runes",
    "2 runes: grants MS for 2 seconds",
  ],
);

const RyzeW = new Ability(
  "Rune Prison",
  "W",
  "Ryze deals magic damage and slows the target. If target has Flux, roots instead of slowing.",
  { cooldown: [5, 5, 5, 5, 5], cooldownType: "standard" },
  { castTime: 0.25, range: 615 },
  {
    baseDamage: [60, 90, 120, 150, 180],
    apRatio: 70,
    maxManaRatio: 4,
    damageType: "magic",
  },
  {
    slow: 50,
    ccType: "root",
    ccDuration: 1.5,
  },
  undefined,
  undefined,
  ["Flux: Roots instead of slowing"],
);

const RyzeE = new Ability(
  "Spell Flux",
  "E",
  "Ryze fires an orb dealing magic damage and applying Flux to the target and nearby enemies for 3 seconds.",
  { cooldown: [3.25, 3.25, 3.25, 3.25, 3.25], cooldownType: "standard" },
  { castTime: 0.25, range: 615 },
  {
    baseDamage: [60, 90, 120, 150, 180],
    apRatio: 45,
    maxManaRatio: 2,
    damageType: "magic",
  },
  {
    duration: 3,
  },
  undefined,
  undefined,
  ["Spreads Flux to nearby enemies"],
);

const RyzeR = new Ability(
  "Realm Warp",
  "R",
  "Passive: Increases Overload damage vs Flux targets. Active: Opens a portal, warping all allied units in the area to the target location after 2 seconds.",
  { cooldown: [210, 180, 150], cooldownType: "standard" },
  { castTime: 0.25, range: 3000 },
  undefined,
  undefined,
  undefined,
  undefined,
  [
    "Passive: +60/80/100% Q damage vs Flux targets",
    "Cancelled if Ryze can't cast or move",
  ],
);

const Ryze = new Character(
  "Ryze",
  645, // HP
  8, // HP5
  22, // AR
  32, // MR
  58, // AD
  200, // Crit DMG (%)
  340, // MS
  550, // Attack range
  0.658, // Base AS
  [RyzePassive, RyzeQ, RyzeW, RyzeE, RyzeR],
  [],
);

// Samira
const SamiraPassive = new Ability(
  "Daredevil Impulse",
  "passive",
  "Samira builds Style Grade through different abilities. Each rank grants movement speed. Melee attacks deal bonus magic damage scaling with missing HP.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  {
    baseDamage: [2, 19],
    adRatio: 10.5,
    damageType: "magic",
  },
  {
    bonusStats: { ms: [2, 3.5] },
  },
  undefined,
  undefined,
  [
    "Blade attacks: 0-100% bonus damage based on missing HP",
    "Style: 2-3.5% MS per rank",
  ],
);

const SamiraQ = new Ability(
  "Flair",
  "Q",
  "Samira fires a shot dealing physical damage to the first enemy, or slashes in melee range hitting all enemies in a cone.",
  { cooldown: [6, 5.5, 5, 4.5, 4], cooldownType: "standard" },
  { castTime: 0.25, range: 950 },
  {
    baseDamage: [0, 20],
    adRatio: 110,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  ["Ranged and melee forms"],
);

const SamiraW = new Ability(
  "Blade Whirl",
  "W",
  "Samira slashes around her twice, destroying enemy projectiles and dealing physical damage.",
  { cooldown: [30, 27, 24, 21, 18], cooldownType: "standard" },
  { castTime: 0 },
  {
    baseDamage: [20, 35, 50, 65, 80],
    bonusAdRatio: 80,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  ["Destroys incoming projectiles"],
);

const SamiraE = new Ability(
  "Wild Rush",
  "E",
  "Samira dashes through enemies or allies, slashing enemies she passes through and gaining attack speed.",
  { cooldown: [15, 13, 11, 9, 7], cooldownType: "standard" },
  { castTime: 0, range: 650 },
  {
    baseDamage: [50, 60, 70, 80, 90],
    adRatio: 7.5,
    damageType: "physical",
  },
  {
    bonusStats: { as: [30, 40, 50, 60, 70] },
    duration: 3,
  },
  undefined,
  undefined,
  ["Cooldown resets on takedown"],
);

const SamiraR = new Ability(
  "Inferno Trigger",
  "R",
  "Samira unleashes a torrent of shots, firing rapidly and dealing physical damage to all nearby enemies. Can only be cast at max Style (S rank).",
  { cooldown: [8, 8, 8], cooldownType: "standard" },
  { castTime: 0 },
  {
    baseDamage: [200, 400, 600],
    adRatio: 300,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  ["Per shot: 20/40/60 (+30% AD)", "10 shots total", "Requires S rank Style"],
);

const Samira = new Character(
  "Samira",
  630, // HP
  3.25, // HP5
  26, // AR
  30, // MR
  57, // AD
  200, // Crit DMG (%)
  335, // MS
  500, // Attack range
  0.658, // Base AS
  [SamiraPassive, SamiraQ, SamiraW, SamiraE, SamiraR],
  [],
);

// Sejuani
const SejuaniPassive = new Ability(
  "Fury of the North",
  "passive",
  "After 10 seconds out of combat, Sejuani gains Frost Armor. Nearby allied melee champions gain Permafrost stacks on enemies. At 4 stacks, Sejuani can stun and deal % max HP damage.",
  { cooldown: [10], cooldownType: "static" },
  undefined,
  {
    baseDamage: [0],
    maxHealthRatio: 10,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  ["Damage capped at 250 vs epic monsters", "Frost Armor: 100 armor, 100 MR"],
);

const SejuaniQ = new Ability(
  "Arctic Assault",
  "Q",
  "Sejuani charges forward, knocking up and damaging enemies.",
  { cooldown: [18, 16.5, 15, 13.5, 12], cooldownType: "standard" },
  { castTime: 0, range: 650 },
  {
    baseDamage: [110, 170, 230, 290, 350],
    apRatio: 110,
    damageType: "magic",
  },
  {
    ccType: "knockup",
    ccDuration: 0.5,
  },
  undefined,
  undefined,
  [],
);

const SejuaniW = new Ability(
  "Winter's Wrath",
  "W",
  "Sejuani swings her flail twice, dealing physical damage and applying Frost. The second hit knocks back minions and monsters.",
  { cooldown: [9, 8, 7, 6, 5], cooldownType: "standard" },
  { castTime: 0.25, range: 600 },
  {
    baseDamage: [60, 110, 160, 210, 260],
    bonusAdRatio: 20,
    apRatio: 60,
    maxHealthRatio: 3,
    damageType: "physical",
  },
  {
    slow: 75,
    duration: 0.25,
  },
  undefined,
  undefined,
  ["First swing + second lash damage"],
);

const SejuaniE = new Ability(
  "Permafrost",
  "E",
  "Passively applies Frost to enemies damaged by Sejuani. Active: Freezes and stuns enemies with max Frost stacks.",
  { cooldown: [1.5, 1.5, 1.5, 1.5, 1.5], cooldownType: "standard" },
  { castTime: 0, range: 1000 },
  {
    baseDamage: [55, 105, 155, 205, 255],
    apRatio: 100,
    damageType: "magic",
  },
  {
    ccType: "stun",
    ccDuration: 1,
  },
  undefined,
  undefined,
  ["Requires 4 Frost stacks"],
);

const SejuaniR = new Ability(
  "Glacial Prison",
  "R",
  "Sejuani throws her True Ice bola, stunning the first champion hit and creating a storm that slows and damages nearby enemies.",
  { cooldown: [120, 100, 80], cooldownType: "standard" },
  { castTime: 0.25, range: 1300 },
  {
    baseDamage: [150, 250, 350],
    apRatio: 100,
    damageType: "magic",
  },
  {
    ccType: "stun",
    ccDuration: 1.5,
    slow: 30,
  },
  undefined,
  undefined,
  ["First hit: 1.5s stun if long range, 1s if short", "Storm: 30% slow for 2s"],
);

const Sejuani = new Character(
  "Sejuani",
  630, // HP
  8.5, // HP5
  34, // AR
  32, // MR
  66, // AD
  200, // Crit DMG (%)
  340, // MS
  150, // Attack range
  0.688, // Base AS
  [SejuaniPassive, SejuaniQ, SejuaniW, SejuaniE, SejuaniR],
  [],
);

// Senna
const SennaPassive = new Ability(
  "Absolution",
  "passive",
  "Senna's attacks deal bonus damage based on target's current HP. Gains soul stacks from minion deaths and champions, granting AD, range, and crit. Basic attacks apply mist dealing bonus physical damage.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  {
    baseDamage: [0],
    currentHealthRatio: [1, 10],
    adRatio: 20,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  ["Soul: +0.75 AD, +20 range per 20 souls", "Mist: 20% AD bonus damage"],
);

const SennaQ = new Ability(
  "Piercing Darkness",
  "Q",
  "Senna fires a bolt dealing physical damage to enemies and healing allies hit.",
  { cooldown: [11, 9.5, 8, 6.5, 5], cooldownType: "standard" },
  { castTime: 0.5, range: 1300 },
  {
    baseDamage: [40, 70, 100, 130, 160],
    adRatio: 40,
    damageType: "physical",
  },
  {
    heal: [40, 60, 80, 100, 120],
  },
  undefined,
  undefined,
  ["Heal: 40% AD ratio"],
);

const SennaW = new Ability(
  "Last Embrace",
  "W",
  "Senna sends forth a projectile that roots the first two enemies hit after a delay.",
  { cooldown: [11, 11, 11, 11, 11], cooldownType: "standard" },
  { castTime: 0.25, range: 1300 },
  {
    baseDamage: [70, 115, 160, 205, 250],
    apRatio: 70,
    damageType: "physical",
  },
  {
    ccType: "root",
    ccDuration: 1.25,
  },
  undefined,
  undefined,
  ["1 second delay before root"],
);

const SennaE = new Ability(
  "Curse of the Black Mist",
  "E",
  "Senna dissolves into mist, becoming a wraith. Allies who enter the mist also become wraiths, gaining movement speed and camouflage.",
  { cooldown: [26, 24.5, 23, 21.5, 20], cooldownType: "standard" },
  { castTime: 0 },
  undefined,
  {
    bonusStats: { ms: [18, 19, 20, 21, 22] },
    duration: 7,
  },
  undefined,
  undefined,
  ["Duration: 6/6.5/7/7.5/8s", "Camouflage for Senna and allies"],
);

const SennaR = new Ability(
  "Dawning Shadow",
  "R",
  "Senna fires a global beam that shields allies and deals damage to enemies in the center.",
  { cooldown: [140, 120, 100], cooldownType: "standard" },
  { castTime: 1, range: 25000 },
  {
    baseDamage: [200, 300, 400],
    bonusAdRatio: 70,
    apRatio: 100,
    damageType: "physical",
  },
  {
    shield: [120, 160, 200],
  },
  undefined,
  undefined,
  ["Global range", "Shield: +40% AP ratio"],
);

const Senna = new Character(
  "Senna",
  530, // HP
  3.5, // HP5
  25, // AR
  30, // MR
  50, // AD
  200, // Crit DMG (%)
  330, // MS
  600, // Attack range
  0.625, // Base AS
  [SennaPassive, SennaQ, SennaW, SennaE, SennaR],
  [],
);

// Seraphine
const SeraphinePassive = new Ability(
  "Stage Presence",
  "passive",
  "Every third ability echo-casts. Nearby allies grant Notes that deal magic damage on-hit.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  {
    baseDamage: [4, 25],
    apRatio: 4,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  ["Every 3rd spell casts twice", "Notes: 75% reduced damage from allies"],
);

const SeraphineQ = new Ability(
  "High Note",
  "Q",
  "Seraphine projects a Note dealing magic damage, increased by target's missing HP.",
  { cooldown: [9, 7.5, 6, 4.5, 3], cooldownType: "standard" },
  { castTime: 0.25, range: 900 },
  {
    baseDamage: [55, 70, 85, 100, 115],
    apRatio: 45,
    missingHealthRatio: 8,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  ["Max damage: 110-230 (+90% AP) at 100% missing HP"],
);

const SeraphineW = new Ability(
  "Surround Sound",
  "W",
  "Seraphine creates a song shielding herself and nearby allies. If already shielded, heals instead.",
  { cooldown: [26, 24, 22, 20, 18], cooldownType: "standard" },
  { castTime: 0.25, range: 800 },
  undefined,
  {
    shield: [60, 80, 100, 120, 140],
    heal: [50, 75, 100, 125, 150],
    bonusStats: { ms: [20, 20, 20, 20, 20] },
    duration: 2.5,
  },
  undefined,
  undefined,
  ["Shield: +30% AP", "Heal: +40% AP", "MS: +2% per 100 AP"],
);

const SeraphineE = new Ability(
  "Beat Drop",
  "E",
  "Seraphine unleashes a heavy soundwave dealing magic damage and slowing. Already slowed or immobilized enemies are rooted.",
  { cooldown: [13, 12, 11, 10, 9], cooldownType: "standard" },
  { castTime: 0.25, range: 1300 },
  {
    baseDamage: [60, 85, 110, 135, 160],
    apRatio: 45,
    damageType: "magic",
  },
  {
    slow: [99, 99, 99, 99, 99],
    ccType: "root",
    ccDuration: 1.25,
  },
  undefined,
  undefined,
  ["Slow: 99% for 0.5s", "Root: 1.25s on slowed/immobilized targets"],
);

const SeraphineR = new Ability(
  "Encore",
  "R",
  "Seraphine projects a captivating force that charms enemies, dealing magic damage. Extends range when hitting champions.",
  { cooldown: [160, 140, 120], cooldownType: "standard" },
  { castTime: 0.5, range: 1200 },
  {
    baseDamage: [150, 200, 250],
    apRatio: 60,
    damageType: "magic",
  },
  {
    ccType: "stun",
    ccDuration: 1.25,
    slow: 40,
  },
  undefined,
  undefined,
  ["Charms enemies for 1.25-2.5s", "Extends by 800 range per champion hit"],
);

const Seraphine = new Character(
  "Seraphine",
  570, // HP
  6.5, // HP5
  26, // AR
  30, // MR
  50, // AD
  200, // Crit DMG (%)
  330, // MS
  525, // Attack range
  0.669, // Base AS
  [SeraphinePassive, SeraphineQ, SeraphineW, SeraphineE, SeraphineR],
  [],
);

// Sett
const SettPassive = new Ability(
  "Pit Grit",
  "passive",
  "Sett's right punch deals bonus physical damage and gains health regen based on missing HP.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  {
    baseDamage: [5, 90],
    bonusAdRatio: 55,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Right punch: 5-90 (+55% bonus AD)",
    "HP regen: 0.25-2 HP5 per 5% missing HP",
  ],
);

const SettQ = new Ability(
  "Knuckle Down",
  "Q",
  "Sett gains movement speed and his next two attacks deal bonus damage, with the second dealing extra damage.",
  { cooldown: [9, 8, 7, 6, 5], cooldownType: "standard" },
  { castTime: 0 },
  {
    baseDamage: [10, 20, 30, 40, 50],
    adRatio: 3,
    damageType: "physical",
  },
  {
    bonusStats: { ms: [30, 30, 30, 30, 30] },
    duration: 1.5,
  },
  undefined,
  undefined,
  ["Both punches: +1-3% per 100 AD", "Second punch: +50% damage"],
);

const SettW = new Ability(
  "Haymaker",
  "W",
  "Sett gains a shield based on stored Grit. After a brief delay, punches forward dealing true damage in the center, physical outside. Damage scales with Grit.",
  { cooldown: [16, 14, 12, 10, 8], cooldownType: "standard" },
  { castTime: 0.75, range: 790 },
  {
    baseDamage: [90, 120, 150, 180, 210],
    damageType: "physical",
  },
  {
    shield: [100, 100, 100, 100, 100],
  },
  undefined,
  undefined,
  [
    "Damage: 90-210 + 20% Grit + 25% bonus AD per 100",
    "Center: true damage",
    "Shield: 100% Grit",
  ],
);

const SettE = new Ability(
  "Facebreaker",
  "E",
  "Sett pulls in enemies on each side, dealing damage and slowing. If enemies collide, they're stunned.",
  { cooldown: [16, 14.5, 13, 11.5, 10], cooldownType: "standard" },
  { castTime: 0, range: 490 },
  {
    baseDamage: [50, 80, 110, 140, 170],
    bonusAdRatio: 70,
    damageType: "physical",
  },
  {
    slow: 50,
    ccType: "stun",
    ccDuration: 1,
  },
  undefined,
  undefined,
  [
    "Slow: 50% for 0.5s",
    "Stun: 1s if enemies collide",
    "Bonus AD ratio: 50-70% + 25% per 100 bonus AD",
  ],
);

const SettR = new Ability(
  "The Show Stopper",
  "R",
  "Sett grabs an enemy champion, suppressing them and carrying them forward before slamming them down, dealing damage based on their bonus HP.",
  { cooldown: [120, 100, 80], cooldownType: "standard" },
  { castTime: 0, range: 400 },
  {
    baseDamage: [200, 300, 400],
    bonusAdRatio: 100,
    bonusHPRatio: [40, 50, 60],
    damageType: "physical",
  },
  {
    ccType: "stun",
    ccDuration: 1.5,
  },
  undefined,
  undefined,
  ["Suppresses target during carry", "Slows hit enemies by 99% for 1.5s"],
);

const Sett = new Character(
  "Sett",
  670, // HP
  7, // HP5
  33, // AR
  28, // MR
  60, // AD
  200, // Crit DMG (%)
  340, // MS
  125, // Attack range
  0.625, // Base AS
  [SettPassive, SettQ, SettW, SettE, SettR],
  [],
);

// Shaco
const ShacoPassive = new Ability(
  "Backstab",
  "passive",
  "Shaco's basic attacks from behind deal bonus physical damage.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  {
    baseDamage: [20, 35],
    bonusAdRatio: 20,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  ["Attacks from behind only"],
);

const ShacoQ = new Ability(
  "Deceive",
  "Q",
  "Shaco becomes invisible and blinks. His next attack deals bonus damage and critically strikes.",
  { cooldown: [12, 11.5, 11, 10.5, 10], cooldownType: "standard" },
  { castTime: 0, range: 400 },
  {
    baseDamage: [25, 35, 45, 55, 65],
    adRatio: 40,
    damageType: "physical",
  },
  {
    duration: 2.5,
  },
  undefined,
  undefined,
  ["Invisibility lasts 2.5-4s", "Guaranteed crit on next attack"],
);

const ShacoW = new Ability(
  "Jack In The Box",
  "W",
  "Shaco creates a box that becomes invisible and fears nearby enemies when triggered.",
  { cooldown: [16, 16, 16, 16, 16], cooldownType: "standard" },
  { castTime: 0, range: 425 },
  {
    baseDamage: [35, 50, 65, 80, 95],
    apRatio: 20,
    damageType: "magic",
  },
  {
    ccType: "fear",
    ccDuration: 1,
  },
  undefined,
  undefined,
  [
    "Fear: 0.5/0.75/1/1.25/1.5s",
    "Box lasts 40 (+10% AP) seconds",
    "Activates when enemy approaches",
  ],
);

const ShacoE = new Ability(
  "Two-Shiv Poison",
  "E",
  "Shaco throws a shiv dealing magic damage, increased if target is below 30% HP. From behind deals bonus damage.",
  { cooldown: [8, 8, 8, 8, 8], cooldownType: "standard" },
  { castTime: 0.25, range: 625 },
  {
    baseDamage: [70, 95, 120, 145, 170],
    apRatio: 75,
    bonusAdRatio: 85,
    damageType: "magic",
  },
  {
    slow: 20,
    duration: 2,
  },
  undefined,
  undefined,
  ["50% bonus damage vs low HP", "Backstab: +15-50 (+10% AP) damage"],
);

const ShacoR = new Ability(
  "Hallucinate",
  "R",
  "Shaco vanishes briefly and creates a clone that can attack and explode on death, dealing damage.",
  { cooldown: [100, 90, 80], cooldownType: "standard" },
  { castTime: 0 },
  {
    baseDamage: [200, 300, 400],
    apRatio: 100,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  ["Clone deals 75% damage", "Explosion: 200-400 (+100% AP)"],
);

const Shaco = new Character(
  "Shaco",
  630, // HP
  8.5, // HP5
  30, // AR
  32, // MR
  63, // AD
  200, // Crit DMG (%)
  345, // MS
  125, // Attack range
  0.694, // Base AS
  [ShacoPassive, ShacoQ, ShacoW, ShacoE, ShacoR],
  [],
);

// Shen
const ShenPassive = new Ability(
  "Ki Barrier",
  "passive",
  "After using an ability, Shen shields himself.",
  { cooldown: [10], cooldownType: "static" },
  undefined,
  undefined,
  {
    shield: [50, 95],
  },
  undefined,
  undefined,
  ["Shield: 50-95 + 11% bonus HP"],
);

const ShenQ = new Ability(
  "Twilight Assault",
  "Q",
  "Shen recalls his spirit blade, empowering his next 3 attacks to deal bonus damage based on target's max HP.",
  { cooldown: [8, 7.25, 6.5, 5.75, 5], cooldownType: "standard" },
  { castTime: 0, range: 400 },
  {
    baseDamage: [10, 40],
    maxHealthRatio: [5, 7],
    maxHealthRatioPerAP: 1.5,
    damageType: "magic",
  },
  {
    bonusStats: { as: [50, 50, 50, 50, 50] },
    duration: 4,
  },
  undefined,
  undefined,
  ["3 empowered attacks", "Per hit: 10-40 + 5-7% (+1.5% per 100 AP) max HP"],
);

const ShenW = new Ability(
  "Spirit's Refuge",
  "W",
  "Shen creates a zone that blocks enemy attacks for allies inside.",
  { cooldown: [18, 16.5, 15, 13.5, 12], cooldownType: "standard" },
  { castTime: 0, range: 0 },
  undefined,
  {
    duration: 1.75,
  },
  undefined,
  undefined,
  ["Blocks all auto attacks from outside the zone"],
);

const ShenE = new Ability(
  "Shadow Dash",
  "E",
  "Shen dashes, dealing damage and taunting enemies hit.",
  { cooldown: [18, 16, 14, 12, 10], cooldownType: "standard" },
  { castTime: 0, range: 600 },
  {
    baseDamage: [60, 85, 110, 135, 160],
    bonusHPRatio: 15,
    damageType: "physical",
  },
  {
    ccType: "stun",
    ccDuration: 1.5,
  },
  undefined,
  undefined,
  ["Taunts enemies for 1.5s", "15% bonus HP ratio"],
);

const ShenR = new Ability(
  "Stand United",
  "R",
  "Shen shields a target ally globally. After channeling, teleports to them.",
  { cooldown: [200, 180, 160], cooldownType: "standard" },
  { castTime: 3, range: 25000 },
  undefined,
  {
    shield: [175, 350, 525],
  },
  undefined,
  undefined,
  [
    "Shield: 175-525 (+130% AP)",
    "Scales up based on ally's missing HP",
    "Max: 280-840 (+130% AP)",
  ],
);

const Shen = new Character(
  "Shen",
  610, // HP
  8.5, // HP5
  34, // AR
  32, // MR
  64, // AD
  200, // Crit DMG (%)
  340, // MS
  125, // Attack range
  0.751, // Base AS
  [ShenPassive, ShenQ, ShenW, ShenE, ShenR],
  [],
);

// Shyvana
const ShyvanaPassive = new Ability(
  "Fury of the Dragonborn",
  "passive",
  "Shyvana gains bonus armor and MR, increased per elemental drake. Deals bonus damage to dragons.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  undefined,
  {
    bonusStats: { armor: [5, 5], mr: [5, 5] },
  },
  undefined,
  undefined,
  ["5 armor/MR, +5 per drake", "20% bonus damage to dragons"],
);

const ShyvanaQ = new Ability(
  "Twin Bite",
  "Q",
  "Shyvana's next attack strikes twice. Dragon Form: Cleaves all enemies in front.",
  { cooldown: [7, 6, 5, 4, 3], cooldownType: "standard" },
  { castTime: 0 },
  {
    baseDamage: [0],
    adRatio: 100,
    apRatio: 50,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  ["Second hit: 100% AD (+50% AP)", "Applies on-hit effects twice"],
);

const ShyvanaW = new Ability(
  "Burnout",
  "W",
  "Shyvana surrounds herself in fire, dealing magic damage per second and gaining movement speed.",
  { cooldown: [12, 12, 12, 12, 12], cooldownType: "standard" },
  { castTime: 0 },
  {
    baseDamage: [100, 135, 170, 205, 240],
    apRatio: 100,
    bonusAdRatio: 40,
    damageType: "magic",
  },
  {
    bonusStats: { ms: [30, 35, 40, 45, 50] },
    duration: 7,
  },
  undefined,
  undefined,
  [
    "20/27/34/41/48 (+20% AP)(+10% bonus AD) per second",
    "On-hit: 5-13 (+5% bonus AD)",
  ],
);

const ShyvanaE = new Ability(
  "Flame Breath",
  "E",
  "Shyvana fires a fireball dealing magic damage. Dragon Form: Explodes on impact.",
  { cooldown: [12, 11, 10, 9, 8], cooldownType: "standard" },
  { castTime: 0.25, range: 925 },
  {
    baseDamage: [80, 135, 190, 245, 300],
    apRatio: 70,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Marks enemies for 5s",
    "Attacks vs marked: 2.5% (+1% per 100 AP) max HP",
    "Dragon Form: 90% AP ratio, explodes",
  ],
);

const ShyvanaR = new Ability(
  "Dragon's Descent",
  "R",
  "Shyvana transforms into a dragon, gaining HP, range, and new ability effects. Deals damage along her path.",
  { cooldown: [100, 100, 100], cooldownType: "standard" },
  { castTime: 0, range: 850 },
  {
    baseDamage: [150, 250, 350],
    apRatio: 100,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  ["Gains 150-350 HP in dragon form", "Duration based on Fury"],
);

const Shyvana = new Character(
  "Shyvana",
  625, // HP
  7, // HP5
  35, // AR
  32, // MR
  62, // AD
  200, // Crit DMG (%)
  350, // MS
  150, // Attack range
  0.638, // Base AS
  [ShyvanaPassive, ShyvanaQ, ShyvanaW, ShyvanaE, ShyvanaR],
  [],
);

// Singed
const SingedPassive = new Ability(
  "Noxious Slipstream",
  "passive",
  "Singed gains movement speed when near champions.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  undefined,
  {
    bonusStats: { ms: [20, 20] },
  },
  undefined,
  undefined,
  ["20% MS when near champions"],
);

const SingedQ = new Ability(
  "Poison Trail",
  "Q",
  "Singed leaves a poison trail dealing magic damage per second to enemies in it.",
  { cooldown: [0, 0, 0, 0, 0], cooldownType: "static" },
  { castTime: 0 },
  {
    baseDamage: [22, 34, 46, 58, 70],
    apRatio: 60,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  ["Toggle ability", "22-70 (+60% AP) total damage per second"],
);

const SingedW = new Ability(
  "Mega Adhesive",
  "W",
  "Singed throws down adhesive, slowing and grounding enemies.",
  { cooldown: [17, 16, 15, 14, 13], cooldownType: "standard" },
  { castTime: 0.25, range: 1000 },
  undefined,
  {
    slow: 60,
    duration: 3,
  },
  undefined,
  undefined,
  ["Grounds enemies (cannot dash/blink)"],
);

const SingedE = new Ability(
  "Fling",
  "E",
  "Singed flings an enemy over his shoulder, dealing damage based on their max HP.",
  { cooldown: [10, 9.5, 9, 8.5, 8], cooldownType: "standard" },
  { castTime: 0, range: 125 },
  {
    baseDamage: [50, 65, 80, 95, 110],
    apRatio: 75,
    maxHealthRatio: [6, 6.5, 7, 7.5, 8],
    damageType: "magic",
  },
  {
    slow: 60,
    duration: 1,
  },
  undefined,
  undefined,
  ["Max HP damage capped at 300 vs minions/monsters"],
);

const SingedR = new Ability(
  "Insanity Potion",
  "R",
  "Singed drinks a potion, gaining combat stats for 25 seconds.",
  { cooldown: [120, 110, 100], cooldownType: "standard" },
  { castTime: 0 },
  undefined,
  {
    bonusStats: {
      ap: [30, 55, 80],
      armor: [30, 55, 80],
      mr: [30, 55, 80],
      ms: [20, 30, 40],
      as: [30, 60, 90],
    },
    duration: 25,
  },
  undefined,
  undefined,
  ["Mana regen: 50/75/100"],
);

const Singed = new Character(
  "Singed",
  650, // HP
  9.5, // HP5
  34, // AR
  32, // MR
  63, // AD
  200, // Crit DMG (%)
  345, // MS
  125, // Attack range
  0.7, // Base AS
  [SingedPassive, SingedQ, SingedW, SingedE, SingedR],
  [],
);

// Sion
const SionPassive = new Ability(
  "Glory in Death",
  "passive",
  "On death, Sion reanimates with decaying HP, gaining lifesteal and attack speed.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  undefined,
  {
    bonusStats: { as: [100, 100] },
  },
  undefined,
  undefined,
  ["100% lifesteal", "100% attack speed", "Lasts up to 10 seconds after death"],
);

const SionQ = new Ability(
  "Decimating Smash",
  "Q",
  "Sion charges up and slams, dealing damage and slowing. Fully charged knocks up and deals bonus damage.",
  { cooldown: [10, 9, 8, 7, 6], cooldownType: "standard" },
  { castTime: 2, range: 600 },
  {
    baseDamage: [80, 135, 190, 245, 300],
    apRatio: 80,
    bonusAdRatio: 130,
    damageType: "physical",
  },
  {
    ccType: "knockup",
    ccDuration: 1.25,
    slow: [55, 60, 65, 70, 75],
  },
  undefined,
  undefined,
  [
    "Minimum: 50% damage, 0.5s slow",
    "Full charge: Knockup 1.25-2.25s, 40% armor reduction",
  ],
);

const SionW = new Ability(
  "Soul Furnace",
  "W",
  "Passive: Gains max HP from kills. Active: Shields himself, then detonates for magic damage.",
  { cooldown: [15, 14, 13, 12, 11], cooldownType: "standard" },
  { castTime: 0 },
  {
    baseDamage: [40, 65, 90, 115, 140],
    apRatio: 40,
    maxHealthRatio: 11,
    damageType: "magic",
  },
  {
    shield: [50, 75, 100, 125, 150],
    duration: 6,
  },
  undefined,
  undefined,
  ["Passive: +4 max HP per unit kill", "Shield: 50-150 + 8-12% max HP"],
);

const SionE = new Ability(
  "Roar of the Slayer",
  "E",
  "Sion roars, damaging and slowing enemies or knocking back minions/monsters.",
  { cooldown: [12, 11, 10, 9, 8], cooldownType: "standard" },
  { castTime: 0.25, range: 800 },
  {
    baseDamage: [70, 105, 140, 175, 210],
    apRatio: 55,
    damageType: "magic",
  },
  {
    slow: 40,
    duration: 2.5,
  },
  undefined,
  undefined,
  ["Armor reduction: 20% for 4s"],
);

const SionR = new Ability(
  "Unstoppable Onslaught",
  "R",
  "Sion charges in a direction, gaining speed. Colliding with enemies deals damage and knocks them up.",
  { cooldown: [140, 100, 60], cooldownType: "standard" },
  { castTime: 0 },
  {
    baseDamage: [400, 800, 1200],
    bonusAdRatio: 80,
    maxHealthRatio: 12,
    damageType: "physical",
  },
  {
    ccType: "knockup",
    ccDuration: 1.75,
    slow: 40,
  },
  undefined,
  undefined,
  ["Minimum damage: 150-450 (+30% bonus AD)(+4% max HP)", "Max at full speed"],
);

const Sion = new Character(
  "Sion",
  655, // HP
  9, // HP5
  36, // AR
  32, // MR
  68, // AD
  200, // Crit DMG (%)
  345, // MS
  175, // Attack range
  0.679, // Base AS
  [SionPassive, SionQ, SionW, SionE, SionR],
  [],
);

// Sivir
const SivirPassive = new Ability(
  "Fleet of Foot",
  "passive",
  "For 2 seconds after using an ability, Sivir gains movement speed.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  undefined,
  {
    bonusStats: { ms: [30, 50] },
    duration: 2,
  },
  undefined,
  undefined,
  ["30-50% MS for 2s after casting"],
);

const SivirQ = new Ability(
  "Boomerang Blade",
  "Q",
  "Sivir throws her blade dealing physical damage on the way out and back.",
  { cooldown: [9, 9, 9, 9, 9], cooldownType: "standard" },
  { castTime: 0.25, range: 1250 },
  {
    baseDamage: [70, 125, 180, 235, 290],
    adRatio: 80,
    apRatio: 50,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  ["Hits twice (out and back)", "60% damage on return"],
);

const SivirW = new Ability(
  "Ricochet",
  "W",
  "For 4 seconds, Sivir's attacks bounce to nearby enemies.",
  { cooldown: [12, 10.5, 9, 7.5, 6], cooldownType: "standard" },
  { castTime: 0 },
  {
    baseDamage: [0],
    adRatio: 50,
    damageType: "physical",
  },
  {
    bonusStats: { as: [20, 25, 30, 35, 40] },
    duration: 4,
  },
  undefined,
  undefined,
  ["Bounces: 40-50% AD per bounce", "Bounces to 2-6 targets"],
);

const SivirE = new Ability(
  "Spell Shield",
  "E",
  "Sivir blocks the next enemy ability. If successful, restores health.",
  { cooldown: [22, 20, 18, 16, 14], cooldownType: "standard" },
  { castTime: 0 },
  undefined,
  {
    heal: [0],
    duration: 1.5,
  },
  undefined,
  undefined,
  ["Heal: 60-80% AD + 50% AP"],
);

const SivirR = new Ability(
  "On The Hunt",
  "R",
  "Sivir rallies her allies, granting them movement speed for 8 seconds.",
  { cooldown: [120, 100, 80], cooldownType: "standard" },
  { castTime: 0 },
  undefined,
  {
    bonusStats: { ms: [20, 25, 30] },
    duration: 8,
  },
  undefined,
  undefined,
  ["Allies gain 20-30% MS", "Passive: 20-40% bonus attack speed"],
);

const Sivir = new Character(
  "Sivir",
  600, // HP
  3.25, // HP5
  30, // AR
  30, // MR
  60, // AD
  200, // Crit DMG (%)
  335, // MS
  500, // Attack range
  0.625, // Base AS
  [SivirPassive, SivirQ, SivirW, SivirE, SivirR],
  [],
);

// Skarner
const SkarnerPassive = new Ability(
  "Quaking",
  "passive",
  "Skarner's attacks and abilities apply Quaking stacks. At 3 stacks, consumes them to deal % max HP magic damage.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  {
    baseDamage: [0],
    maxHealthRatio: [5, 9],
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  ["Damage: 5-9% max HP over duration", "Capped at 100-300 vs monsters"],
);

const SkarnerQ = new Ability(
  "Shattered Earth",
  "Q",
  "Skarner empowers his next 3 attacks, dealing physical damage. Final attack deals % max HP damage.",
  { cooldown: [8, 6.75, 5.5, 4.25, 3], cooldownType: "standard" },
  { castTime: 0 },
  {
    baseDamage: [10, 20, 30, 40, 50],
    bonusAdRatio: 90,
    bonusHPRatio: 3,
    maxHealthRatio: 9,
    damageType: "physical",
  },
  {
    bonusStats: { as: [20, 25, 30, 35, 40] },
  },
  3,
  undefined,
  [
    "Per hit: 10-50 (+90% bonus AD)(+3% bonus HP)",
    "Final hit: +9% target max HP",
  ],
);

const SkarnerW = new Ability(
  "Seismic Bastion",
  "W",
  "Skarner shields himself and gains movement speed.",
  { cooldown: [13, 12, 11, 10, 9], cooldownType: "standard" },
  { castTime: 0 },
  undefined,
  {
    shield: [50, 75, 100, 125, 150],
    bonusStats: { ms: [16, 20, 24, 28, 32] },
    duration: 5,
  },
  undefined,
  undefined,
  ["Shield: 50-150 + 12% max HP"],
);

const SkarnerE = new Ability(
  "Ixtal's Impact",
  "E",
  "Skarner charges forward, dealing damage and stunning the first enemy hit.",
  { cooldown: [12, 11.5, 11, 10.5, 10], cooldownType: "standard" },
  { castTime: 0, range: 750 },
  {
    baseDamage: [70, 120, 170, 220, 270],
    bonusAdRatio: 20,
    apRatio: 40,
    damageType: "magic",
  },
  {
    ccType: "stun",
    ccDuration: 1.2,
    slow: 60,
  },
  undefined,
  undefined,
  ["Stun: 1/1.1/1.2/1.3/1.4s", "Slows for 2s after stun"],
);

const SkarnerR = new Ability(
  "Impale",
  "R",
  "Skarner suppresses an enemy, dealing damage and dragging them. Can recast to throw them.",
  { cooldown: [110, 100, 90], cooldownType: "standard" },
  { castTime: 0, range: 350 },
  {
    baseDamage: [75, 150, 225],
    apRatio: 60,
    damageType: "magic",
  },
  {
    ccType: "stun",
    ccDuration: 1.75,
  },
  2,
  undefined,
  [
    "Suppresses for 1.75s",
    "Recast: Throws dealing 100/200/300 (+80% AP) damage",
  ],
);

const Skarner = new Character(
  "Skarner",
  630, // HP
  7.5, // HP5
  33, // AR
  32, // MR
  63, // AD
  200, // Crit DMG (%)
  335, // MS
  150, // Attack range
  0.625, // Base AS
  [SkarnerPassive, SkarnerQ, SkarnerW, SkarnerE, SkarnerR],
  [],
);

// Smolder
const SmolderPassive = new Ability(
  "Dragon Practice",
  "passive",
  "Abilities and attacks grant stacks; at 25 stacks, abilities evolve.",
  { cooldown: 0, cooldownType: "standard" },
  undefined,
  {
    baseDamage: [0],
    adRatio: 15,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  undefined,
  true,
);

const SmolderQ = new Ability(
  "Super Scorcher Breath",
  "Q",
  "Breathes fire dealing physical damage; bonus damage vs burning targets.",
  { cooldown: [5.5, 5, 4.5, 4, 3.5], cooldownType: "standard" },
  { castTime: 0.25, range: 550 },
  {
    baseDamage: [20, 90],
    adRatio: 100,
    apRatio: 30,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  ["Burn: 2% max HP over 3s", "Evolved: explosion on hit"],
  true,
);

const SmolderW = new Ability(
  "Achooo!",
  "W",
  "Sends wave dealing magic damage and slowing.",
  { cooldown: [14, 13, 12, 11, 10], cooldownType: "standard" },
  { castTime: 0.25, range: 1500, width: 200 },
  {
    baseDamage: [60, 180],
    adRatio: 60,
    apRatio: 60,
    damageType: "magic",
  },
  {
    ccType: "slow",
    ccDuration: 2,
    slow: 30,
  },
);

const SmolderE = new Ability(
  "Flap, Flap, Flap",
  "E",
  "Flies over terrain, gaining vision and bombing enemies below.",
  { cooldown: [24, 22, 20, 18, 16], cooldownType: "standard" },
  { castTime: 0, range: 700 },
  {
    baseDamage: [50, 150],
    adRatio: 50,
    apRatio: 50,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  ["3-5 bombs while flying"],
);

const SmolderR = new Ability(
  "MOOOOM!",
  "R",
  "Mother dragon breaths fire in a line, dealing physical damage and slowing.",
  { cooldown: [120, 100, 80], cooldownType: "standard" },
  { castTime: 0.35, range: 4200, width: 400 },
  {
    baseDamage: [150, 300, 450],
    adRatio: 100,
    apRatio: 100,
    damageType: "physical",
  },
  {
    ccType: "slow",
    ccDuration: 2,
    slow: 30,
  },
  undefined,
  undefined,
  ["Center: true damage", "Burns for 6s"],
);

const Smolder = new Character(
  "Smolder",
  575, // HP
  3.75, // HP5
  24, // AR
  30, // MR
  60, // AD
  200, // Crit DMG (%)
  330, // MS
  550, // Attack range
  0.638, // Base AS
  [SmolderPassive, SmolderQ, SmolderW, SmolderE, SmolderR],
  [],
);

// Sona
const SonaPassive = new Ability(
  "Power Chord",
  "passive",
  "Every 3 spell casts, Sona's next attack deals bonus magic damage with additional effects based on her last activated song.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  {
    baseDamage: [20, 240],
    apRatio: 20,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  ["Q: Bonus damage", "W: Reduces damage", "E: Slows"],
);

const SonaQ = new Ability(
  "Hymn of Valor",
  "Q",
  "Sona sends out bolts of sound dealing magic damage. Melody: Nearby allies gain bonus magic damage on next attack.",
  { cooldown: [8, 8, 8, 8, 8], cooldownType: "standard" },
  { castTime: 0.25, range: 825 },
  {
    baseDamage: [50, 85, 120, 155, 190],
    apRatio: 40,
    damageType: "magic",
  },
  {
    bonusStats: { ad: [10, 15, 20, 25, 30] },
    duration: 3,
  },
  undefined,
  undefined,
  [
    "Targets nearest 2 enemies",
    "Aura grants 10-30 (+10% AP) magic damage on-hit",
  ],
);

const SonaW = new Ability(
  "Aria of Perseverance",
  "W",
  "Sona heals herself and a nearby ally. Melody: Nearby allies gain a shield.",
  { cooldown: [10, 10, 10, 10, 10], cooldownType: "standard" },
  { castTime: 0.25, range: 1000 },
  undefined,
  {
    heal: [30, 45, 60, 75, 90],
    shield: [25, 50, 75, 100, 125],
    duration: 1.5,
  },
  undefined,
  undefined,
  ["Heal: 30-90 (+30% AP)", "Shield: 25-125 (+30% AP)"],
);

const SonaE = new Ability(
  "Song of Celerity",
  "E",
  "Sona gains movement speed. Melody: Nearby allies also gain movement speed.",
  { cooldown: [12, 12, 12, 12, 12], cooldownType: "standard" },
  { castTime: 0 },
  undefined,
  {
    bonusStats: { ms: [20, 21, 22, 23, 24] },
    duration: 3,
  },
  undefined,
  undefined,
  ["Self: 20-24% (+3.5% per 100 AP) MS", "Allies: 10-14% (+2% per 100 AP) MS"],
);

const SonaR = new Ability(
  "Crescendo",
  "R",
  "Sona plays an irresistible chord, stunning enemies and dealing magic damage.",
  { cooldown: [140, 120, 100], cooldownType: "standard" },
  { castTime: 0.25, range: 1000 },
  {
    baseDamage: [150, 250, 350],
    apRatio: 50,
    damageType: "magic",
  },
  {
    ccType: "stun",
    ccDuration: 1.5,
  },
  undefined,
  undefined,
  [],
);

const Sona = new Character(
  "Sona",
  550, // HP
  5.5, // HP5
  26, // AR
  30, // MR
  49, // AD
  200, // Crit DMG (%)
  325, // MS
  550, // Attack range
  0.644, // Base AS
  [SonaPassive, SonaQ, SonaW, SonaE, SonaR],
  [],
);

// Soraka
const SorakaPassive = new Ability(
  "Salvation",
  "passive",
  "Soraka gains movement speed when moving towards nearby low-health allies.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  undefined,
  {
    bonusStats: { ms: [70, 70] },
  },
  undefined,
  undefined,
  ["70% MS towards allies below 40% HP"],
);

const SorakaQ = new Ability(
  "Starcall",
  "Q",
  "Soraka calls down a star dealing magic damage and slowing enemies. Hitting champions grants Soraka health and movement speed.",
  { cooldown: [5, 5, 5, 5, 5], cooldownType: "standard" },
  { castTime: 0.25, range: 800 },
  {
    baseDamage: [85, 120, 155, 190, 225],
    apRatio: 35,
    damageType: "magic",
  },
  {
    slow: 30,
    duration: 2,
    heal: [60, 70, 80, 90, 100],
    bonusStats: { ms: [15, 17.5, 20, 22.5, 25] },
  },
  undefined,
  undefined,
  [
    "Hitting champion: heals Soraka 60-100 (+40% AP)",
    "Grants 15-25% MS for 2s",
  ],
);

const SorakaW = new Ability(
  "Astral Infusion",
  "W",
  "Soraka heals an ally at the cost of her own HP.",
  { cooldown: [2, 2, 2, 2, 2], cooldownType: "standard" },
  { castTime: 0.25, range: 550 },
  undefined,
  {
    heal: [90, 120, 150, 180, 210],
  },
  undefined,
  undefined,
  ["Heal: 90-210 (+70% AP)", "Costs 10% max HP", "Cannot cast below 5% HP"],
);

const SorakaE = new Ability(
  "Equinox",
  "E",
  "Soraka creates a zone that silences enemies, then roots them if still inside after 1.5 seconds.",
  { cooldown: [20, 19, 18, 17, 16], cooldownType: "standard" },
  { castTime: 0.25, range: 925 },
  {
    baseDamage: [70, 95, 120, 145, 170],
    apRatio: 40,
    damageType: "magic",
  },
  {
    ccType: "root",
    ccDuration: 1.5,
    duration: 1.5,
  },
  undefined,
  undefined,
  [
    "Silences immediately",
    "Roots after 1.5s: 1/1.25/1.5/1.75/2s",
    "Deals damage twice",
  ],
);

const SorakaR = new Ability(
  "Wish",
  "R",
  "Soraka calls upon divine power to heal all allied champions globally.",
  { cooldown: [160, 145, 130], cooldownType: "standard" },
  { castTime: 0 },
  undefined,
  {
    heal: [150, 250, 350],
  },
  undefined,
  undefined,
  [
    "Heal: 150-350 (+55% AP)",
    "Heals all allies globally",
    "Increased by 50% on allies below 40% HP",
  ],
);

const Soraka = new Character(
  "Soraka",
  605, // HP
  2.5, // HP5
  32, // AR
  30, // MR
  50, // AD
  200, // Crit DMG (%)
  325, // MS
  550, // Attack range
  0.625, // Base AS
  [SorakaPassive, SorakaQ, SorakaW, SorakaE, SorakaR],
  [],
);

// Swain
const SwainPassive = new Ability(
  "Ravenous Flock",
  "passive",
  "Swain can pull immobilized enemies, dealing damage and healing. Collects Soul Fragments for max mana.",
  { cooldown: [10], cooldownType: "static" },
  undefined,
  {
    baseDamage: [20, 105],
    apRatio: 30,
    damageType: "magic",
  },
  {
    heal: [4, 12],
  },
  undefined,
  undefined,
  ["Heal: 4-12 (+3% per 100 AP) per Soul Fragment", "Max mana: +5 per Soul"],
);

const SwainQ = new Ability(
  "Death's Hand",
  "Q",
  "Swain unleashes 5 bolts of eldritch power dealing magic damage. Enemies can be hit by multiple bolts.",
  { cooldown: [7, 6, 5, 4, 3], cooldownType: "standard" },
  { castTime: 0.25, range: 725 },
  {
    baseDamage: [65, 85, 105, 125, 145],
    apRatio: 40,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Per bolt: 65-145 (+40% AP)",
    "Max damage vs one target: 195-435 (+120% AP)",
  ],
);

const SwainW = new Ability(
  "Vision of Empire",
  "W",
  "Swain opens a demon eye at a location, dealing magic damage and slowing enemies. Grants vision.",
  { cooldown: [22, 20, 18, 16, 14], cooldownType: "standard" },
  { castTime: 1.5, range: 3500 },
  {
    baseDamage: [80, 115, 150, 185, 220],
    apRatio: 70,
    damageType: "magic",
  },
  {
    slow: [25, 30, 35, 40, 45],
    duration: 2.5,
  },
  undefined,
  undefined,
  ["Grants vision for 2s", "Delay before detonation"],
);

const SwainE = new Ability(
  "Nevermove",
  "E",
  "Swain launches a demonic wave that damages and roots enemies on return.",
  { cooldown: [10, 10, 10, 10, 10], cooldownType: "standard" },
  { castTime: 0.25, range: 850 },
  {
    baseDamage: [35, 70, 105, 140, 175],
    apRatio: 25,
    damageType: "magic",
  },
  {
    ccType: "root",
    ccDuration: 1.5,
  },
  undefined,
  undefined,
  ["Roots on return pass for 1.5s", "Damage dealt twice (out and back)"],
);

const SwainR = new Ability(
  "Demonic Ascension",
  "R",
  "Swain transforms into a demon for 12 seconds, draining nearby enemies and healing. Can recast to release Demonflare.",
  { cooldown: [120, 100, 80], cooldownType: "standard" },
  { castTime: 0 },
  {
    baseDamage: [20, 40, 60],
    apRatio: 10,
    damageType: "magic",
  },
  {
    duration: 12,
  },
  2,
  undefined,
  [
    "Drain: 20-60 (+10% AP) per second",
    "Recast: 150-300 (+60% AP) + stored health",
    "Max health storage: 300 from draining",
  ],
);

const Swain = new Character(
  "Swain",
  595, // HP
  3, // HP5
  25, // AR
  31, // MR
  58, // AD
  200, // Crit DMG (%)
  330, // MS
  525, // Attack range
  0.625, // Base AS
  [SwainPassive, SwainQ, SwainW, SwainE, SwainR],
  [],
);

// Sylas
const SylasPassive = new Ability(
  "Petricite Burst",
  "passive",
  "After casting a spell, Sylas' next 2 attacks whirl his chains dealing bonus magic damage.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  {
    baseDamage: [15, 100],
    apRatio: 25,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  ["Per attack: 15-100 (+25% AP) + 100% AD"],
);

const SylasQ = new Ability(
  "Chain Lash",
  "Q",
  "Sylas lashes his chains, dealing magic damage. After a delay, an explosion deals additional damage and slows.",
  { cooldown: [10, 9.5, 9, 8.5, 8], cooldownType: "standard" },
  { castTime: 0.25, range: 775 },
  {
    baseDamage: [110, 170, 230, 290, 350],
    apRatio: 120,
    damageType: "magic",
  },
  {
    slow: [90, 90, 90, 90, 90],
    duration: 1.5,
  },
  undefined,
  undefined,
  ["Initial: 40-100 (+60% AP)", "Explosion: 70-250 (+60% AP)", "Slow decays"],
);

const SylasW = new Ability(
  "Kingslayer",
  "W",
  "Sylas lunges at an enemy, dealing damage and healing himself. Healing increased against low-health targets.",
  { cooldown: [14, 12.5, 11, 9.5, 8], cooldownType: "standard" },
  { castTime: 0, range: 400 },
  {
    baseDamage: [75, 105, 135, 165, 195],
    apRatio: 65,
    damageType: "magic",
  },
  {
    heal: [25, 40, 55, 70, 85],
  },
  undefined,
  undefined,
  ["Heal: 25-85 (+20-40% AP)", "Double heal vs targets below 40% HP"],
);

const SylasE = new Ability(
  "Abscond / Abduct",
  "E",
  "First cast: Sylas dashes. Second cast: Throws chains stunning the first enemy hit.",
  { cooldown: [11, 10, 9, 8, 7], cooldownType: "standard" },
  { castTime: 0, range: 400 },
  {
    baseDamage: [80, 130, 180, 230, 280],
    apRatio: 100,
    damageType: "magic",
  },
  {
    ccType: "stun",
    ccDuration: 0.5,
  },
  2,
  undefined,
  ["Dash range: 400", "Chain range: 800", "Stuns and pulls to Sylas"],
);

const SylasR = new Ability(
  "Hijack",
  "R",
  "Sylas steals an enemy's ultimate and can cast it. AD ratios convert to AP.",
  { cooldown: [100, 80, 60], cooldownType: "standard" },
  { castTime: 0, range: 950 },
  undefined,
  undefined,
  undefined,
  undefined,
  [
    "Steals enemy ultimate",
    "AD converts: 0.6% AP per 1% total AD",
    "Bonus AD converts: 0.4% AP per 1% bonus AD",
    "Per-target cooldown: 200% of stolen ult CD",
  ],
);

const Sylas = new Character(
  "Sylas",
  600, // HP
  9, // HP5
  29, // AR
  32, // MR
  61, // AD
  200, // Crit DMG (%)
  340, // MS
  175, // Attack range
  0.645, // Base AS
  [SylasPassive, SylasQ, SylasW, SylasE, SylasR],
  [],
);

// Syndra
const SyndraPassive = new Ability(
  "Transcendent",
  "passive",
  "At 120 Splinters, Syndra gains Transcendence: 15% increased AP.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  undefined,
  {
    bonusStats: { ap: [15, 15] },
  },
  undefined,
  undefined,
  ["Requires 120 Splinters from abilities"],
);

const SyndraQ = new Ability(
  "Dark Sphere",
  "Q",
  "Syndra conjures a Dark Sphere dealing magic damage. Spheres remain for 6.5 seconds.",
  { cooldown: [4, 4, 4, 4, 4], cooldownType: "standard" },
  { castTime: 0.625, range: 800 },
  {
    baseDamage: [80, 115, 150, 185, 220],
    apRatio: 65,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  ["Spheres last 6.5s", "Used by other abilities"],
);

const SyndraW = new Ability(
  "Force of Will",
  "W",
  "First cast: Grabs a sphere or minion. Second cast: Throws it dealing damage and slowing.",
  { cooldown: [12, 11, 10, 9, 8], cooldownType: "standard" },
  { castTime: 0.25, range: 925 },
  {
    baseDamage: [60, 95, 130, 165, 200],
    apRatio: 65,
    damageType: "magic",
  },
  {
    slow: [25, 30, 35, 40, 45],
    duration: 1.5,
  },
  2,
  undefined,
  ["Can throw Dark Spheres or minions/monsters"],
);

const SyndraE = new Ability(
  "Scatter the Weak",
  "E",
  "Syndra knocks back enemies and Dark Spheres. Enemies hit by spheres are stunned.",
  { cooldown: [18, 16.5, 15, 13.5, 12], cooldownType: "standard" },
  { castTime: 0.25, range: 700 },
  {
    baseDamage: [85, 130, 175, 220, 265],
    apRatio: 55,
    damageType: "magic",
  },
  {
    ccType: "stun",
    ccDuration: 1.5,
  },
  undefined,
  undefined,
  ["Knocks back enemies", "Enemies hit by sphere: stunned for 1.5s"],
);

const SyndraR = new Ability(
  "Unleashed Power",
  "R",
  "Syndra bombards an enemy with all of her Dark Spheres.",
  { cooldown: [120, 100, 80], cooldownType: "standard" },
  { castTime: 0.5, range: 675 },
  {
    baseDamage: [450, 630, 810],
    apRatio: 195,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Per sphere: 100-180 (+65% AP)",
    "Minimum 3 spheres",
    "Uses existing spheres + creates 3",
  ],
);

const Syndra = new Character(
  "Syndra",
  563, // HP
  6.5, // HP5
  25, // AR
  30, // MR
  54, // AD
  200, // Crit DMG (%)
  330, // MS
  550, // Attack range
  0.658, // Base AS
  [SyndraPassive, SyndraQ, SyndraW, SyndraE, SyndraR],
  [],
);

// Tahm Kench
const TahmKenchPassive = new Ability(
  "An Acquired Taste",
  "passive",
  "Tahm Kench's attacks and Q apply stacks. Basic attacks deal bonus magic damage scaling with bonus HP and AP.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  {
    baseDamage: [6, 48],
    apRatio: 1.5,
    bonusHPRatio: 4.5,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  ["Per attack: 6-48 (+1.5% AP per 100 bonus HP)(+4.5% bonus HP)"],
);

const TahmKenchQ = new Ability(
  "Tongue Lash",
  "Q",
  "Tahm Kench lashes out with his tongue, dealing magic damage and slowing the first enemy hit.",
  { cooldown: [8, 7, 6, 5, 4], cooldownType: "standard" },
  { castTime: 0.25, range: 900 },
  {
    baseDamage: [75, 120, 165, 210, 255],
    apRatio: 100,
    damageType: "magic",
  },
  {
    slow: 50,
    duration: 2,
  },
  undefined,
  undefined,
  ["Applies passive stack"],
);

const TahmKenchW = new Ability(
  "Abyssal Dive",
  "W",
  "Tahm Kench dives and re-emerges at a location, dealing magic damage and knocking up enemies.",
  { cooldown: [21, 19, 17, 15, 13], cooldownType: "standard" },
  { castTime: 0, range: 950 },
  {
    baseDamage: [100, 135, 170, 205, 240],
    apRatio: 100,
    damageType: "magic",
  },
  {
    ccType: "knockup",
    ccDuration: 1,
  },
  undefined,
  undefined,
  ["Can carry an ally"],
);

const TahmKenchE = new Ability(
  "Thick Skin",
  "E",
  "Passive: Converts damage taken to grey health. Active: Converts grey health to a shield.",
  { cooldown: [6, 6, 6, 6, 6], cooldownType: "standard" },
  { castTime: 0 },
  undefined,
  {
    shield: [100, 100, 100, 100, 100],
    duration: 3,
  },
  undefined,
  undefined,
  [
    "Shield: 70-100% of grey health",
    "Passive: Stores 80% damage as grey health",
  ],
);

const TahmKenchR = new Ability(
  "Devour",
  "R",
  "Tahm Kench devours an enemy champion, dealing damage based on their max HP and suppressing them.",
  { cooldown: [120, 105, 90], cooldownType: "standard" },
  { castTime: 0, range: 250 },
  {
    baseDamage: [100, 250, 400],
    maxHealthRatio: 15,
    maxHealthRatioPerAP: 7,
    damageType: "magic",
  },
  {
    ccType: "stun",
    ccDuration: 3,
  },
  undefined,
  undefined,
  ["Suppresses for up to 3s", "15% (+7% per 100 AP) max HP"],
);

const TahmKench = new Character(
  "Tahm Kench",
  640, // HP
  6.5, // HP5
  39, // AR
  32, // MR
  56, // AD
  200, // Crit DMG (%)
  335, // MS
  175, // Attack range
  0.658, // Base AS
  [TahmKenchPassive, TahmKenchQ, TahmKenchW, TahmKenchE, TahmKenchR],
  [],
);

// Taliyah
const TaliyahPassive = new Ability(
  "Rock Surfing",
  "passive",
  "Taliyah gains massive movement speed when near walls.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  undefined,
  {
    bonusStats: { ms: [20, 45] },
  },
  undefined,
  undefined,
  ["20-45% MS near walls"],
);

const TaliyahQ = new Ability(
  "Threaded Volley",
  "Q",
  "Taliyah throws 5 rocks dealing magic damage. Worked Ground: Throws one large boulder dealing more damage.",
  { cooldown: [7, 6, 5, 4, 3], cooldownType: "standard" },
  { castTime: 0.25, range: 1000 },
  {
    baseDamage: [55, 72.5, 90, 107.5, 125],
    apRatio: 50,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "5 rocks total: 275-625 (+250% AP)",
    "Worked Ground: 100.8-234 (+90% AP) single boulder",
  ],
);

const TaliyahW = new Ability(
  "Seismic Shove",
  "W",
  "Taliyah marks a location, then after a delay pushes enemies away dealing magic damage.",
  { cooldown: [12, 11, 10, 9, 8], cooldownType: "standard" },
  { castTime: 0.6, range: 900 },
  {
    baseDamage: [70, 100, 130, 160, 190],
    apRatio: 60,
    damageType: "magic",
  },
  {
    ccType: "knockup",
    ccDuration: 1,
  },
  undefined,
  undefined,
  ["0.6s delay", "Knocks enemies in chosen direction"],
);

const TaliyahE = new Ability(
  "Unraveled Earth",
  "E",
  "Taliyah scatters boulders that deal damage. Enemies dashing through take additional damage.",
  { cooldown: [16, 15, 14, 13, 12], cooldownType: "standard" },
  { castTime: 0.25, range: 800 },
  {
    baseDamage: [60, 105, 150, 195, 240],
    apRatio: 60,
    damageType: "magic",
  },
  {
    slow: 20,
    duration: 4,
  },
  undefined,
  undefined,
  ["Mines last 4s", "Detonated by dashing: 100% bonus damage"],
);

const TaliyahR = new Ability(
  "Weaver's Wall",
  "R",
  "Taliyah creates a massive wall and can ride it. Wall blocks enemy movement.",
  { cooldown: [180, 150, 120], cooldownType: "standard" },
  { castTime: 1, range: 6000 },
  undefined,
  {
    duration: 6.5,
  },
  undefined,
  undefined,
  [
    "Wall lasts 6-7s (scales with rank)",
    "Can be destroyed by champions",
    "Taliyah can ride the wall",
  ],
);

const Taliyah = new Character(
  "Taliyah",
  550, // HP
  6.5, // HP5
  18, // AR
  28, // MR
  58, // AD
  200, // Crit DMG (%)
  330, // MS
  525, // Attack range
  0.658, // Base AS
  [TaliyahPassive, TaliyahQ, TaliyahW, TaliyahE, TaliyahR],
  [],
);

// Talon
const TalonPassive = new Ability(
  "Blade's End",
  "passive",
  "Talon's abilities wound champions, causing them to bleed for physical damage over 2 seconds.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  {
    baseDamage: [80, 280],
    bonusAdRatio: 210,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  ["Bleed: 80-280 (+210% bonus AD) over 2s"],
);

const TalonQ = new Ability(
  "Noxian Diplomacy",
  "Q",
  "Talon leaps to an enemy and stabs them, dealing physical damage. Critical strike at melee range.",
  { cooldown: [8, 7.5, 7, 6.5, 6], cooldownType: "standard" },
  { castTime: 0, range: 575 },
  {
    baseDamage: [65, 85, 105, 125, 145],
    bonusAdRatio: 100,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  ["Melee: Guaranteed crit, 150% damage", "Refunds 50% CD on kill"],
);

const TalonW = new Ability(
  "Rake",
  "W",
  "Talon throws blades dealing physical damage on the way out and back.",
  { cooldown: [9, 9, 9, 9, 9], cooldownType: "standard" },
  { castTime: 0.25, range: 650 },
  {
    baseDamage: [110, 150, 190, 230, 270],
    bonusAdRatio: 130,
    damageType: "physical",
  },
  {
    slow: [40, 45, 50, 55, 60],
    duration: 1,
  },
  undefined,
  undefined,
  [
    "Out: 50-90 (+40% bonus AD)",
    "Return: 60-180 (+90% bonus AD)",
    "Total: 110-270 (+130% bonus AD)",
  ],
);

const TalonE = new Ability(
  "Assassin's Path",
  "E",
  "Talon vaults over terrain or structures. Cannot use same section twice for 160s.",
  { cooldown: [2, 2, 2, 2, 2], cooldownType: "standard" },
  { castTime: 0, range: 800 },
  undefined,
  undefined,
  undefined,
  undefined,
  ["Per-wall cooldown: 160s", "Grants 75% MS for 1s after"],
);

const TalonR = new Ability(
  "Shadow Assault",
  "R",
  "Talon becomes invisible and sends out blades, dealing damage on the way out and when they return.",
  { cooldown: [80, 70, 60], cooldownType: "standard" },
  { castTime: 0 },
  {
    baseDamage: [160, 240, 320],
    bonusAdRatio: 200,
    damageType: "physical",
  },
  {
    duration: 1.5,
  },
  undefined,
  undefined,
  [
    "Each blade: 80-160 (+100% bonus AD)",
    "Total: 160-320 (+200% bonus AD)",
    "Invisibility lasts 1.5s",
    "Gains 40% MS",
  ],
);

const Talon = new Character(
  "Talon",
  658, // HP
  8.5, // HP5
  30, // AR
  36, // MR
  68, // AD
  200, // Crit DMG (%)
  335, // MS
  125, // Attack range
  0.625, // Base AS
  [TalonPassive, TalonQ, TalonW, TalonE, TalonR],
  [],
);

// Taric
const TaricPassive = new Ability(
  "Bravado",
  "passive",
  "After casting a spell, Taric's next 2 attacks deal bonus magic damage and reduce his cooldowns.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  {
    baseDamage: [12.5, 46.5],
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Per attack: 12.5-46.5 (+15% bonus armor)",
    "Reduces CDs by 1s each",
    "Armor scaling not modeled",
  ],
);

const TaricQ = new Ability(
  "Starlight's Touch",
  "Q",
  "Taric heals himself and nearby allies. Can store up to 2 charges.",
  { cooldown: [1, 1, 1, 1, 1], cooldownType: "ammo" },
  { castTime: 0 },
  undefined,
  {
    heal: [30, 55, 80, 105, 130],
  },
  2,
  undefined,
  ["Heal: 30-130 (+15% AP)(+1% max HP)", "18s charge generation"],
);

const TaricW = new Ability(
  "Bastion",
  "W",
  "Passive: Taric and his ally gain bonus armor. Active: Shields an ally and bonds to them, mirroring abilities.",
  { cooldown: [16, 15, 14, 13, 12], cooldownType: "standard" },
  { castTime: 0, range: 800 },
  undefined,
  {
    shield: [8, 9.5, 11, 12.5, 14],
  },
  undefined,
  undefined,
  ["Shield: 8-14% max HP", "Passive: 10-18% armor to both"],
);

const TaricE = new Ability(
  "Dazzle",
  "E",
  "After a delay, Taric and his ally fire light, dealing magic damage and stunning enemies.",
  { cooldown: [16, 15, 14, 13, 12], cooldownType: "standard" },
  { castTime: 1, range: 610 },
  {
    baseDamage: [90, 130, 170, 210, 250],
    apRatio: 50,
    damageType: "magic",
  },
  {
    ccType: "stun",
    ccDuration: 1.25,
  },
  undefined,
  undefined,
  ["1s delay before firing", "Also scales with 50% bonus armor (not modeled)"],
);

const TaricR = new Ability(
  "Cosmic Radiance",
  "R",
  "After a delay, Taric and nearby allies become invulnerable for 2.5 seconds.",
  { cooldown: [180, 150, 120], cooldownType: "standard" },
  { castTime: 2.5 },
  undefined,
  {
    duration: 2.5,
  },
  undefined,
  undefined,
  ["2.5s channel", "Invulnerability lasts 2.5s", "Affects nearby allies"],
);

const Taric = new Character(
  "Taric",
  645, // HP
  6, // HP5
  40, // AR
  28, // MR
  55, // AD
  200, // Crit DMG (%)
  340, // MS
  150, // Attack range
  0.625, // Base AS
  [TaricPassive, TaricQ, TaricW, TaricE, TaricR],
  [],
);

// Teemo
const TeemoPassive = new Ability(
  "Guerrilla Warfare",
  "passive",
  "After standing still, Teemo becomes invisible and gains attack speed when he moves.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  undefined,
  {
    bonusStats: { as: [20, 40] },
    duration: 3,
  },
  undefined,
  undefined,
  ["Invisible after 1.5s standing still", "20-40% AS for 3s after moving"],
);

const TeemoQ = new Ability(
  "Blinding Dart",
  "Q",
  "Teemo shoots a dart dealing magic damage and blinding the target.",
  { cooldown: [8, 8, 8, 8, 8], cooldownType: "standard" },
  { castTime: 0.25, range: 680 },
  {
    baseDamage: [80, 125, 170, 215, 260],
    apRatio: 80,
    damageType: "magic",
  },
  {
    duration: 2,
  },
  undefined,
  undefined,
  ["Blinds for 1.5-2.5s (scales with rank)", "Blinded attacks miss"],
);

const TeemoW = new Ability(
  "Move Quick",
  "W",
  "Passive: Teemo gains movement speed. Active: Teemo gains bonus movement speed for 3 seconds.",
  { cooldown: [17, 17, 17, 17, 17], cooldownType: "standard" },
  { castTime: 0 },
  undefined,
  {
    bonusStats: { ms: [10, 14, 18, 22, 26] },
    duration: 3,
  },
  undefined,
  undefined,
  [
    "Passive: 10-26% MS",
    "Active: Doubles MS bonus for 3s",
    "Lost if taking damage",
  ],
);

const TeemoE = new Ability(
  "Toxic Shot",
  "E",
  "Passive: Teemo's attacks poison enemies, dealing magic damage on-hit and over time.",
  { cooldown: [0, 0, 0, 0, 0], cooldownType: "static" },
  undefined,
  {
    baseDamage: [9, 23, 37, 51, 65],
    apRatio: 30,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  ["On-hit: 9-65 (+30% AP)", "Poison: 6-30 (+10% AP) per second for 4s"],
);

const TeemoR = new Ability(
  "Noxious Trap",
  "R",
  "Teemo tosses a mushroom trap that explodes when stepped on, dealing magic damage and slowing.",
  { cooldown: [1, 1, 1], cooldownType: "ammo" },
  { castTime: 0.25, range: 900 },
  {
    baseDamage: [200, 325, 450],
    apRatio: 55,
    damageType: "magic",
  },
  {
    slow: 30,
    duration: 4,
  },
  undefined,
  undefined,
  [
    "Stores 3 charges",
    "Charge cooldown: 30/25/20s",
    "Mushrooms last 5 minutes",
    "Poison lasts 4s",
  ],
);

const Teemo = new Character(
  "Teemo",
  615, // HP
  5.5, // HP5
  24, // AR
  30, // MR
  54, // AD
  200, // Crit DMG (%)
  330, // MS
  500, // Attack range
  0.69, // Base AS
  [TeemoPassive, TeemoQ, TeemoW, TeemoE, TeemoR],
  [],
);

// Thresh
const ThreshPassive = new Ability(
  "Damnation",
  "passive",
  "Thresh collects souls from dead enemies. Each soul grants armor and ability power.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  undefined,
  {
    bonusStats: { armor: [1, 1], ap: [1, 1] },
  },
  undefined,
  undefined,
  ["1 armor and 1 AP per soul"],
);

const ThreshQ = new Ability(
  "Death Sentence",
  "Q",
  "Thresh throws his scythe, dealing magic damage and stunning. Can recast to pull himself to the target.",
  { cooldown: [20, 18, 16, 14, 12], cooldownType: "standard" },
  { castTime: 0.5, range: 1100 },
  {
    baseDamage: [100, 150, 200, 250, 300],
    apRatio: 90,
    damageType: "magic",
  },
  {
    ccType: "stun",
    ccDuration: 1.5,
  },
  2,
  undefined,
  ["Stuns for 1.5s", "Recast: Pulls Thresh to target"],
);

const ThreshW = new Ability(
  "Dark Passage",
  "W",
  "Thresh throws a lantern that shields nearby ally and allows them to click to dash to him.",
  { cooldown: [22, 20, 18, 16, 14], cooldownType: "standard" },
  { castTime: 0, range: 950 },
  undefined,
  {
    shield: [60, 95, 130, 165, 200],
    duration: 4,
  },
  undefined,
  undefined,
  ["Shield: 60-200 + 1 per soul", "Lantern lasts 6s"],
);

const ThreshE = new Ability(
  "Flay",
  "E",
  "Passive: Thresh's attacks deal bonus damage based on souls. Active: Sweeps his chain, knocking enemies.",
  { cooldown: [9, 9, 9, 9, 9], cooldownType: "standard" },
  { castTime: 0, range: 490 },
  {
    baseDamage: [65, 100, 135, 170, 205],
    apRatio: 40,
    damageType: "magic",
  },
  {
    ccType: "knockup",
    ccDuration: 1,
    slow: 20,
  },
  undefined,
  undefined,
  ["Passive: 1.7 AD per soul + 90-210% AD damage", "Knocks back then slows"],
);

const ThreshR = new Ability(
  "The Box",
  "R",
  "Thresh creates a prison of walls. Enemies breaking a wall take damage and are slowed.",
  { cooldown: [140, 120, 100], cooldownType: "standard" },
  { castTime: 0 },
  {
    baseDamage: [250, 400, 550],
    apRatio: 100,
    damageType: "magic",
  },
  {
    slow: 99,
    duration: 2,
  },
  undefined,
  undefined,
  ["5 walls", "First break: Full damage + 99% slow for 2s", "Walls last 5s"],
);

const Thresh = new Character(
  "Thresh",
  620, // HP
  7, // HP5
  33, // AR
  30, // MR
  56, // AD
  200, // Crit DMG (%)
  330, // MS
  450, // Attack range
  0.625, // Base AS
  [ThreshPassive, ThreshQ, ThreshW, ThreshE, ThreshR],
  [],
);

// Tristana
const TristanaPassive = new Ability(
  "Draw a Bead",
  "passive",
  "Tristana's attack range increases with level.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  ["Range: 550-700 based on level"],
);

const TristanaQ = new Ability(
  "Rapid Fire",
  "Q",
  "Tristana gains massive attack speed for 7 seconds.",
  { cooldown: [20, 19, 18, 17, 16], cooldownType: "standard" },
  { castTime: 0 },
  undefined,
  {
    bonusStats: { as: [60, 70, 80, 90, 100] },
    duration: 7,
  },
  undefined,
  undefined,
  [],
);

const TristanaW = new Ability(
  "Rocket Jump",
  "W",
  "Tristana jumps to a location, dealing magic damage and slowing enemies. Resets on takedown or max E stacks.",
  { cooldown: [22, 20, 18, 16, 14], cooldownType: "standard" },
  { castTime: 0, range: 900 },
  {
    baseDamage: [95, 145, 195, 245, 295],
    apRatio: 80,
    damageType: "magic",
  },
  {
    slow: 60,
    duration: 1,
  },
  undefined,
  undefined,
  ["Resets on takedown or E detonation"],
);

const TristanaE = new Ability(
  "Explosive Charge",
  "E",
  "Tristana places a charge on target that explodes after 4s or when fully stacked, dealing physical damage.",
  { cooldown: [16, 15.5, 15, 14.5, 14], cooldownType: "standard" },
  { castTime: 0, range: 625 },
  {
    baseDamage: [70, 80, 90, 100, 110],
    bonusAdRatio: 130,
    apRatio: 50,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Stacks 4 times from attacks",
    "Each stack: +25% damage",
    "Max: 175-275 (+125-325% bonus AD)(+125% AP)",
  ],
);

const TristanaR = new Ability(
  "Buster Shot",
  "R",
  "Tristana fires a massive cannonball, dealing magic damage and knocking back the target.",
  { cooldown: [120, 110, 100], cooldownType: "standard" },
  { castTime: 0.25, range: 700 },
  {
    baseDamage: [300, 400, 500],
    apRatio: 100,
    damageType: "magic",
  },
  {
    ccType: "knockup",
    ccDuration: 0.75,
  },
  undefined,
  undefined,
  ["Knocks back target and nearby enemies"],
);

const Tristana = new Character(
  "Tristana",
  640, // HP
  4, // HP5
  30, // AR
  28, // MR
  60, // AD
  200, // Crit DMG (%)
  325, // MS
  550, // Attack range
  0.656, // Base AS
  [TristanaPassive, TristanaQ, TristanaW, TristanaE, TristanaR],
  [],
);

// Trundle
const TrundlePassive = new Ability(
  "King's Tribute",
  "passive",
  "When enemies die near Trundle, he heals based on their max HP.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  undefined,
  {
    heal: [0],
  },
  undefined,
  undefined,
  ["Heal: 1.8-5.5% target max HP"],
);

const TrundleQ = new Ability(
  "Chomp",
  "Q",
  "Trundle's next attack deals bonus physical damage and steals attack damage for 4 seconds.",
  { cooldown: [4, 4, 4, 4, 4], cooldownType: "standard" },
  { castTime: 0 },
  {
    baseDamage: [20, 40, 60, 80, 100],
    adRatio: 145,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  ["Steals 10-30 AD for 4s"],
);

const TrundleW = new Ability(
  "Frozen Domain",
  "W",
  "Trundle creates a zone granting him attack speed, movement speed, and healing.",
  { cooldown: [15, 15, 15, 15, 15], cooldownType: "standard" },
  { castTime: 0, range: 900 },
  undefined,
  {
    bonusStats: { as: [30, 47.5, 65, 82.5, 100], ms: [30, 35, 40, 45, 50] },
    duration: 8,
  },
  undefined,
  undefined,
  ["Zone lasts 8s", "Passive healing: 20% increased while in zone"],
);

const TrundleE = new Ability(
  "Pillar of Ice",
  "E",
  "Trundle creates an ice pillar, slowing and blocking enemy movement.",
  { cooldown: [22, 20, 18, 16, 14], cooldownType: "standard" },
  { castTime: 0, range: 1000 },
  undefined,
  {
    slow: [20, 30, 40, 50, 60],
    duration: 6,
  },
  undefined,
  undefined,
  ["Pillar lasts 6s", "Blocks pathing"],
);

const TrundleR = new Ability(
  "Subjugate",
  "R",
  "Trundle drains an enemy's max HP, armor, and magic resistance over 4 seconds.",
  { cooldown: [110, 95, 80], cooldownType: "standard" },
  { castTime: 0, range: 650 },
  {
    baseDamage: [0],
    maxHealthRatio: [20, 25, 30],
    maxHealthRatioPerAP: 2,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  ["Drains 20-30% (+2% per 100 AP) max HP", "Steals 40% armor and MR over 4s"],
);

const Trundle = new Character(
  "Trundle",
  650, // HP
  6, // HP5
  37, // AR
  32, // MR
  68, // AD
  200, // Crit DMG (%)
  350, // MS
  175, // Attack range
  0.67, // Base AS
  [TrundlePassive, TrundleQ, TrundleW, TrundleE, TrundleR],
  [],
);

// Tryndamere
const TryndamerePassive = new Ability(
  "Battle Fury",
  "passive",
  "Tryndamere gains Fury from attacks and crits. Grants critical strike chance based on Fury.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  ["0-50% crit based on Fury (0-100)", "Crit chance scaling not modeled"],
);

const TryndamereQ = new Ability(
  "Bloodlust",
  "Q",
  "Passive: Grants AD based on missing HP. Active: Consumes Fury to heal.",
  { cooldown: [12, 12, 12, 12, 12], cooldownType: "standard" },
  { castTime: 0 },
  undefined,
  {
    heal: [60, 80, 100, 120, 140],
  },
  undefined,
  undefined,
  [
    "Heal: 60-140 (+50% AP) + (1-4 + 2% AP) per Fury",
    "Passive: 10-30 AD based on missing HP",
  ],
);

const TryndamereW = new Ability(
  "Mocking Shout",
  "W",
  "Tryndamere reduces enemy attack damage and slows enemies facing away from him.",
  { cooldown: [14, 14, 14, 14, 14], cooldownType: "standard" },
  { castTime: 0, range: 850 },
  undefined,
  {
    slow: [50, 57.5, 65, 72.5, 80],
    duration: 4,
  },
  undefined,
  undefined,
  ["AD reduction: 30-120", "Enemies facing away: Slowed"],
);

const TryndamereE = new Ability(
  "Spinning Slash",
  "E",
  "Tryndamere dashes dealing physical damage and generating Fury. Crits reduce cooldown.",
  { cooldown: [13, 12, 11, 10, 9], cooldownType: "standard" },
  { castTime: 0, range: 660 },
  {
    baseDamage: [80, 110, 140, 170, 200],
    bonusAdRatio: 80,
    apRatio: 100,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Crits reduce CD by 0.75s (1.5s vs champions)",
    "Generates 2 Fury per hit (5 vs champions)",
  ],
);

const TryndamereR = new Ability(
  "Undying Rage",
  "R",
  "Tryndamere becomes immune to death for 5 seconds, unable to drop below 30 HP.",
  { cooldown: [110, 100, 90], cooldownType: "standard" },
  { castTime: 0 },
  undefined,
  {
    duration: 5,
  },
  undefined,
  undefined,
  ["Cannot die for 5s", "Minimum 30 HP"],
);

const Tryndamere = new Character(
  "Tryndamere",
  696, // HP
  8.5, // HP5
  33, // AR
  32, // MR
  66, // AD
  200, // Crit DMG (%)
  345, // MS
  175, // Attack range
  0.67, // Base AS
  [TryndamerePassive, TryndamereQ, TryndamereW, TryndamereE, TryndamereR],
  [],
);

// Twisted Fate
const TwistedFatePassive = new Ability(
  "Loaded Dice",
  "passive",
  "Twisted Fate and nearby allies gain bonus gold on kills.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  ["1-6 bonus gold on kill"],
);

const TwistedFateQ = new Ability(
  "Wild Cards",
  "Q",
  "Twisted Fate throws three cards dealing magic damage to all enemies hit.",
  { cooldown: [6, 6, 6, 6, 6], cooldownType: "standard" },
  { castTime: 0.25, range: 1450 },
  {
    baseDamage: [60, 105, 150, 195, 240],
    apRatio: 85,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  ["3 cards in a spread"],
);

const TwistedFateW = new Ability(
  "Pick a Card",
  "W",
  "Twisted Fate cycles through three cards. Blue restores mana, Red deals AoE and slows, Gold stuns.",
  { cooldown: [6, 6, 6, 6, 6], cooldownType: "standard" },
  { castTime: 0 },
  {
    baseDamage: [40, 60, 80, 100, 120],
    apRatio: 63.33, // Average of Blue/Red (70%) and Gold (50%): (70+70+50)/3 = 63.33
    adRatio: 100,
    damageType: "magic",
  },
  {
    ccType: "stun",
    ccDuration: 1.5,
    slow: 40,
  },
  undefined,
  undefined,
  [
    "Blue: 40-120 (+100% AP)(+100% AD), restores 50-150 mana",
    "Red: 30-90 (+70% AP)(+100% AD), 30-50% slow",
    "Gold: 15-45 (+50% AP)(+100% AD), 1-2s stun (scales with rank)",
  ],
);

const TwistedFateE = new Ability(
  "Stacked Deck",
  "E",
  "Passive: Grants attack speed. Every 4th attack deals bonus magic damage.",
  { cooldown: [0, 0, 0, 0, 0], cooldownType: "static" },
  undefined,
  {
    baseDamage: [65, 90, 115, 140, 165],
    apRatio: 40,
    bonusAdRatio: 20,
    damageType: "magic",
  },
  {
    bonusStats: { as: [15, 25, 35, 45, 55] },
  },
  undefined,
  undefined,
  ["Passive AS: 15-55%", "Every 4th attack: 65-165 (+40% AP)(+20% bonus AD)"],
);

const TwistedFateR = new Ability(
  "Destiny",
  "R",
  "Twisted Fate reveals all enemy champions and can teleport to a location.",
  { cooldown: [180, 150, 120], cooldownType: "standard" },
  { castTime: 1.5, range: 5500 },
  undefined,
  {
    duration: 8,
  },
  undefined,
  undefined,
  [
    "Reveals all enemies for 6-10s (scales with rank)",
    "Can teleport globally after 1.5s channel",
  ],
);

const TwistedFate = new Character(
  "Twisted Fate",
  604, // HP
  5.5, // HP5
  24, // AR
  30, // MR
  52, // AD
  200, // Crit DMG (%)
  330, // MS
  525, // Attack range
  0.625, // Base AS
  [TwistedFatePassive, TwistedFateQ, TwistedFateW, TwistedFateE, TwistedFateR],
  [],
);

// Twitch
const TwitchPassive = new Ability(
  "Deadly Venom",
  "passive",
  "Twitch's attacks apply stacks of venom, dealing true damage per second.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  {
    baseDamage: [1, 5],
    apRatio: 3,
    damageType: "true",
  },
  undefined,
  undefined,
  undefined,
  [
    "Per stack: 1-5 (+3% AP) true damage per second",
    "Max 6 stacks",
    "Lasts 6s",
  ],
);

const TwitchQ = new Ability(
  "Ambush",
  "Q",
  "Twitch becomes camouflaged and gains attack speed when he exits.",
  { cooldown: [16, 16, 16, 16, 16], cooldownType: "standard" },
  { castTime: 0 },
  undefined,
  {
    bonusStats: { as: [30, 40, 50, 60, 70] },
    duration: 5,
  },
  undefined,
  undefined,
  ["Camouflage lasts 10-16s", "AS bonus lasts 5s after exiting"],
);

const TwitchW = new Ability(
  "Venom Cask",
  "W",
  "Twitch throws a cask dealing physical damage, slowing, and applying venom stacks.",
  { cooldown: [13, 12, 11, 10, 9], cooldownType: "standard" },
  { castTime: 0.25, range: 950 },
  {
    baseDamage: [75, 100, 125, 150, 175],
    apRatio: 70,
    damageType: "physical",
  },
  {
    slow: [30, 35, 40, 45, 50],
    duration: 3,
  },
  undefined,
  undefined,
  ["Slow: 30-50% (+6% per 100 AP)", "Applies 1 venom stack per second"],
);

const TwitchE = new Ability(
  "Contaminate",
  "E",
  "Twitch detonates all venom stacks, dealing physical and magic damage based on stacks.",
  { cooldown: [12, 11, 10, 9, 8], cooldownType: "standard" },
  { castTime: 0, range: 1200 },
  {
    baseDamage: [20, 30, 40, 50, 60],
    bonusAdRatio: 35,
    apRatio: 35,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Base: 20-60 physical",
    "Per stack: 15-35 (+35% bonus AD) physical + 35% AP magic",
  ],
);

const TwitchR = new Ability(
  "Spray and Pray",
  "R",
  "For 6 seconds, Twitch gains AD, range, and his attacks pierce through enemies.",
  { cooldown: [120, 110, 100], cooldownType: "standard" },
  { castTime: 0 },
  {
    baseDamage: [30, 45, 60],
    damageType: "physical",
  },
  {
    bonusStats: { ad: [30, 45, 60] },
    duration: 6,
  },
  undefined,
  undefined,
  ["+300 range", "Attacks pierce all enemies"],
);

const Twitch = new Character(
  "Twitch",
  630, // HP
  3.75, // HP5
  27, // AR
  30, // MR
  59, // AD
  200, // Crit DMG (%)
  330, // MS
  550, // Attack range
  0.679, // Base AS
  [TwitchPassive, TwitchQ, TwitchW, TwitchE, TwitchR],
  [],
);

// Udyr
const UdyrPassive = new Ability(
  "Bridge Between",
  "passive",
  "Udyr's abilities Awaken when first cast and provide bonus effects. Reactivating the same ability within 4s extends the duration.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  ["Awakened abilities gain enhanced effects", "Extends by 2s on recast"],
);

const UdyrQ = new Ability(
  "Wilding Claw",
  "Q",
  "Udyr gains attack speed and deals bonus physical damage on-hit. Next two attacks deal bonus max HP damage. Awaken: Lightning strikes isolated targets.",
  { cooldown: [6, 6, 6, 6, 6], cooldownType: "standard" },
  { castTime: 0 },
  {
    baseDamage: [5, 11, 17, 23, 29, 35],
    bonusAdRatio: 25,
    damageType: "physical",
  },
  {
    bonusStats: { as: [20, 32, 44, 56, 68, 80] },
    duration: 4,
  },
  undefined,
  undefined,
  [
    "On-hit: 5-35 (+25% bonus AD)",
    "Next 2 attacks: 3-8% max HP (+4% per 100 bonus AD)",
    "Awaken: 1.5-3% max HP (+0.8% per 100 AP) magic damage",
  ],
);

const UdyrW = new Ability(
  "Iron Mantle",
  "W",
  "Udyr gains a shield and his next two attacks grant life steal and restore health.",
  { cooldown: [6, 6, 6, 6, 6], cooldownType: "standard" },
  { castTime: 0 },
  undefined,
  {
    shield: [45, 60, 75, 90, 105, 120],
    duration: 4,
  },
  undefined,
  undefined,
  [
    "Shield: 45-120 (+40% AP)(+2-3.5% max HP)",
    "Next 2 attacks: 15-20% lifesteal, restore 1.2% max HP (+8% AP)",
  ],
);

const UdyrE = new Ability(
  "Blazing Stampede",
  "E",
  "Udyr gains movement speed and his next attack stuns.",
  { cooldown: [6, 6, 6, 6, 6], cooldownType: "standard" },
  { castTime: 0 },
  undefined,
  {
    bonusStats: { ms: [30, 35, 40, 45, 50, 55] },
    ccType: "stun",
    ccDuration: 0.75,
    duration: 4,
  },
  undefined,
  undefined,
  ["MS: 30-55%", "Next attack stuns 0.75-1.25s (scales with rank)"],
);

const UdyrR = new Ability(
  "Wingborne Storm",
  "R",
  "Udyr surrounds himself in a glacial storm, dealing magic damage and slowing enemies. Awaken: Storm follows last attacked enemy.",
  { cooldown: [6, 6, 6, 6, 6], cooldownType: "standard" },
  { castTime: 0 },
  {
    baseDamage: [80, 144, 208, 272, 336, 400],
    apRatio: 140,
    damageType: "magic",
  },
  {
    slow: [20, 23, 26, 29, 32, 35],
    duration: 4,
  },
  undefined,
  undefined,
  [
    "80-400 (+140% AP) over 4s",
    "Next 2 attacks: 10-40 (+35% AP)",
    "Awaken: +1-1.75% max HP (+0.4375% per 100 AP) per tick",
  ],
);

const Udyr = new Character(
  "Udyr",
  664, // HP
  6, // HP5
  31, // AR
  32, // MR
  62, // AD
  200, // Crit DMG (%)
  350, // MS
  125, // Attack range
  0.65, // Base AS
  [UdyrPassive, UdyrQ, UdyrW, UdyrE, UdyrR],
  [],
);

// Urgot
const UrgotPassive = new Ability(
  "Echoing Flames",
  "passive",
  "Urgot's basic attacks and Purge trigger shotgun knees, each dealing physical damage. 30s cooldown per leg.",
  { cooldown: [30], cooldownType: "static" },
  undefined,
  {
    baseDamage: [40, 100],
    adRatio: 100,
    maxHealthRatio: 2,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  ["40-100% total AD (+2-6% max HP)", "6 legs on cooldown independently"],
);

const UrgotQ = new Ability(
  "Corrosive Charge",
  "Q",
  "Urgot fires an explosive charge, dealing physical damage and slowing.",
  { cooldown: [10, 9.5, 9, 8.5, 8], cooldownType: "standard" },
  { castTime: 0.6, range: 800 },
  {
    baseDamage: [25, 70, 115, 160, 205],
    adRatio: 70,
    damageType: "physical",
  },
  {
    slow: [45, 50, 55, 60, 65],
    duration: 1.25,
  },
  undefined,
  undefined,
  [],
);

const UrgotW = new Ability(
  "Purge",
  "W",
  "Urgot shoots at nearby enemies repeatedly. Toggle: Can be toggled on/off.",
  { cooldown: [12, 9, 6, 3, 0], cooldownType: "standard" },
  { castTime: 0 },
  {
    baseDamage: [12],
    adRatio: 34,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  ["12 (+20-34% total AD) per shot", "Attacks 3 times per second"],
);

const UrgotE = new Ability(
  "Disdain",
  "E",
  "Urgot charges forward, gaining a shield and dealing physical damage. Throws enemies behind him.",
  { cooldown: [16, 15.5, 15, 14.5, 14], cooldownType: "standard" },
  { castTime: 0.45, range: 475 },
  {
    baseDamage: [90, 120, 150, 180, 210],
    bonusAdRatio: 100,
    damageType: "physical",
  },
  {
    shield: [60, 80, 100, 120, 140],
    ccType: "stun",
    ccDuration: 0.75,
    duration: 4,
  },
  undefined,
  undefined,
  ["Shield: 60-140 (+1.5 bonus AD)(+15% bonus HP)"],
);

const UrgotR = new Ability(
  "Fear Beyond Death",
  "R",
  "Urgot fires a chem-drill that impales and slows champions. Recast to suppress and execute low HP enemies.",
  { cooldown: [100, 85, 70], cooldownType: "standard" },
  { castTime: 0.5, range: 1600 },
  {
    baseDamage: [100, 225, 350],
    bonusAdRatio: 50,
    damageType: "physical",
  },
  {
    slow: 75,
    duration: 4,
  },
  undefined,
  undefined,
  ["Slow: 1% per 1% missing HP (max 75%)", "Execute below 25% max HP"],
);

const Urgot = new Character(
  "Urgot",
  655, // HP
  7.5, // HP5
  36, // AR
  32, // MR
  63, // AD
  200, // Crit DMG (%)
  330, // MS
  350, // Attack range
  0.625, // Base AS
  [UrgotPassive, UrgotQ, UrgotW, UrgotE, UrgotR],
  [],
);

// Varus
const VarusPassive = new Ability(
  "Living Vengeance",
  "passive",
  "On kill or assist, Varus gains attack speed, bonus AD, and AP based on attack speed.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  undefined,
  {
    bonusStats: { as: [10, 15, 20] },
    duration: 5,
  },
  undefined,
  undefined,
  [
    "Kill: 10-20% AS for 5-11s",
    "Takedown: 50% AS",
    "Bonus AD/AP = 10-25% of AS",
  ],
);

const VarusQ = new Ability(
  "Piercing Arrow",
  "Q",
  "Varus charges and fires an arrow, dealing physical damage. Damage increases with charge time.",
  { cooldown: [16, 15, 14, 13, 12], cooldownType: "standard" },
  { castTime: 0, range: 925 },
  {
    baseDamage: [53.33, 100, 146.67, 193.33, 240],
    bonusAdRatio: 113.33,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  ["Min: 53-240 (+87-113% bonus AD)", "Max: 80-360 (+130-170% bonus AD)"],
);

const VarusW = new Ability(
  "Blighted Quiver",
  "W",
  "Passive: Attacks apply Blight stacks. Other abilities detonate Blight, dealing bonus magic damage per stack.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  {
    baseDamage: [6, 14, 22, 30, 38],
    apRatio: 35,
    maxHealthRatio: [3, 3.5, 4, 4.5, 5],
    maxHealthRatioPerAP: 1.5,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "On-hit: 6-38 (+35% AP)",
    "Blight detonation: 3-5% max HP (+1.5% per 100 AP) per stack",
  ],
);

const VarusE = new Ability(
  "Hail of Arrows",
  "E",
  "Varus fires a hail of arrows that deal physical damage and slow, creating desecrated ground.",
  { cooldown: [18, 16, 14, 12, 10], cooldownType: "standard" },
  { castTime: 0.25, range: 925 },
  {
    baseDamage: [60, 90, 120, 150, 180],
    bonusAdRatio: 90,
    damageType: "physical",
  },
  {
    slow: [30, 35, 40, 45, 50],
    duration: 4,
  },
  undefined,
  undefined,
  ["Also applies Grievous Wounds"],
);

const VarusR = new Ability(
  "Chain of Corruption",
  "R",
  "Varus fires a tendril that roots the first enemy hit, then spreads to nearby enemies.",
  { cooldown: [120, 100, 80], cooldownType: "standard" },
  { castTime: 0.25, range: 1075 },
  {
    baseDamage: [150, 250, 350],
    apRatio: 100,
    damageType: "magic",
  },
  {
    ccType: "root",
    ccDuration: 2,
  },
  undefined,
  undefined,
  ["Root: 2-3s (scales with rank)", "Spreads to nearby enemies"],
);

const Varus = new Character(
  "Varus",
  600, // HP
  3.5, // HP5
  24, // AR
  30, // MR
  59, // AD
  200, // Crit DMG (%)
  330, // MS
  575, // Attack range
  0.658, // Base AS
  [VarusPassive, VarusQ, VarusW, VarusE, VarusR],
  [],
);

// Vayne
const VaynePassive = new Ability(
  "Night Hunter",
  "passive",
  "Vayne gains movement speed when moving toward enemy champions.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  undefined,
  {
    bonusStats: { ms: [30] },
  },
  undefined,
  undefined,
  ["30 MS when moving toward enemies", "90 MS during Final Hour"],
);

const VayneQ = new Ability(
  "Tumble",
  "Q",
  "Vayne tumbles and her next attack deals bonus physical damage.",
  { cooldown: [6, 5, 4, 3, 2], cooldownType: "standard" },
  { castTime: 0 },
  {
    baseDamage: [0],
    adRatio: 70,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  ["50-70% total AD bonus damage", "CD reduced to 1.5s during Final Hour"],
  true, // appliesOnHit
);

const VayneW = new Ability(
  "Silver Bolts",
  "W",
  "Every 3rd attack or ability on the same target deals true damage based on max HP.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  {
    baseDamage: [50, 65, 80, 95, 110],
    maxHealthRatio: [6, 7, 8, 9, 10],
    damageType: "true",
  },
  undefined,
  undefined,
  undefined,
  ["6-10% max HP true damage (min 50-110)", "Max vs monsters: 140-200"],
);

const VayneE = new Ability(
  "Condemn",
  "E",
  "Vayne fires a bolt that knocks back and deals physical damage. Impales against terrain for bonus damage and stun.",
  { cooldown: [20, 18, 16, 14, 12], cooldownType: "standard" },
  { castTime: 0.25, range: 550 },
  {
    baseDamage: [50, 85, 120, 155, 190],
    bonusAdRatio: 50,
    damageType: "physical",
  },
  {
    ccType: "stun",
    ccDuration: 1.5,
  },
  undefined,
  undefined,
  ["Impale: 150% damage and 1.5s stun"],
);

const VayneR = new Ability(
  "Final Hour",
  "R",
  "Vayne gains attack damage and Night Hunter grants 90 movement speed. Takedowns extend duration by 4s.",
  { cooldown: [100, 85, 70], cooldownType: "standard" },
  { castTime: 0 },
  undefined,
  {
    bonusStats: { ad: [35, 50, 65] },
    duration: 8,
  },
  undefined,
  undefined,
  [
    "Duration: 8-12s (scales with rank)",
    "Extends 4s on takedown",
    "Tumble grants invisibility for 1s",
  ],
);

const Vayne = new Character(
  "Vayne",
  550, // HP
  3.5, // HP5
  23, // AR
  30, // MR
  60, // AD
  200, // Crit DMG (%)
  330, // MS
  550, // Attack range
  0.658, // Base AS
  [VaynePassive, VayneQ, VayneW, VayneE, VayneR],
  [],
);

// Veigar
const VeigarPassive = new Ability(
  "Phenomenal Evil",
  "passive",
  "Veigar gains permanent AP from hitting enemies with abilities and takedowns.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  ["1 AP per ability hit on champion", "5 AP per takedown"],
);

const VeigarQ = new Ability(
  "Baleful Strike",
  "Q",
  "Veigar unleashes a bolt of dark energy, dealing magic damage to the first two enemies hit.",
  { cooldown: [7, 6.5, 6, 5.5, 5], cooldownType: "standard" },
  { castTime: 0.25, range: 950 },
  {
    baseDamage: [80, 120, 160, 200, 240],
    apRatio: 60,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [],
);

const VeigarW = new Ability(
  "Dark Matter",
  "W",
  "Veigar calls a meteor after a delay, dealing magic damage.",
  { cooldown: [8, 8, 8, 8, 8], cooldownType: "standard" },
  { castTime: 1.221, range: 900 },
  {
    baseDamage: [100, 150, 200, 250, 300],
    apRatio: 65,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  ["1.221s delay"],
);

const VeigarE = new Ability(
  "Event Horizon",
  "E",
  "Veigar creates a cage that stuns enemies who pass through the edge.",
  { cooldown: [18, 16.5, 15, 13.5, 12], cooldownType: "standard" },
  { castTime: 0.5, range: 700 },
  undefined,
  {
    ccType: "stun",
    ccDuration: 2.5,
    duration: 3,
  },
  undefined,
  undefined,
  ["Cage lasts 3s", "Stuns for 2.5-3s (scales with rank)"],
);

const VeigarR = new Ability(
  "Primordial Burst",
  "R",
  "Veigar blasts an enemy champion, dealing magic damage increased by target's missing health.",
  { cooldown: [120, 100, 80], cooldownType: "standard" },
  { castTime: 0.25, range: 650 },
  {
    baseDamage: [175, 250, 325],
    apRatio: 75,
    missingHealthRatio: [0, 100],
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  ["0-100% increased damage based on missing HP"],
);

const Veigar = new Character(
  "Veigar",
  580, // HP
  6.5, // HP5
  18, // AR
  32, // MR
  52, // AD
  200, // Crit DMG (%)
  340, // MS
  550, // Attack range
  0.625, // Base AS
  [VeigarPassive, VeigarQ, VeigarW, VeigarE, VeigarR],
  [],
);

// Vel'Koz
const VelKozPassive = new Ability(
  "Organic Deconstruction",
  "passive",
  "Damaging spells apply stacks. After 3 stacks, deals true damage.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  {
    baseDamage: [35, 180],
    apRatio: 60,
    damageType: "true",
  },
  undefined,
  undefined,
  undefined,
  ["35-180 (+60% AP) true damage per proc"],
);

const VelKozQ = new Ability(
  "Plasma Fission",
  "Q",
  "Vel'Koz shoots a bolt that splits at 90 degrees, dealing magic damage and slowing.",
  { cooldown: [7, 7, 7, 7, 7], cooldownType: "standard" },
  { castTime: 0.251, range: 1050 },
  {
    baseDamage: [80, 120, 160, 200, 240],
    apRatio: 80,
    damageType: "magic",
  },
  {
    slow: 70,
    duration: 1,
  },
  undefined,
  undefined,
  [],
);

const VelKozW = new Ability(
  "Void Rift",
  "W",
  "Vel'Koz opens a rift that deals magic damage twice.",
  { cooldown: [7, 7, 7, 7, 7], cooldownType: "standard" },
  { castTime: 0.25, range: 1050 },
  {
    baseDamage: [75, 125, 175, 225, 275],
    apRatio: 40,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  ["Initial: 30-110 (+15% AP)", "Explosion: 45-165 (+25% AP)"],
);

const VelKozE = new Ability(
  "Tectonic Disruption",
  "E",
  "Vel'Koz causes the ground to erupt, dealing magic damage and knocking up enemies.",
  { cooldown: [16, 15, 14, 13, 12], cooldownType: "standard" },
  { castTime: 0.25, range: 850 },
  {
    baseDamage: [70, 100, 130, 160, 190],
    apRatio: 30,
    damageType: "magic",
  },
  {
    ccType: "knockup",
    ccDuration: 0.75,
    slow: 70,
    duration: 2,
  },
  undefined,
  undefined,
  ["0.5s delay before knockup"],
);

const VelKozR = new Ability(
  "Life Form Disintegration Ray",
  "R",
  "Vel'Koz channels a ray that deals magic damage per 0.25s. Researched enemies take true damage.",
  { cooldown: [120, 110, 100], cooldownType: "standard" },
  { castTime: 0, range: 1575 },
  {
    baseDamage: [45, 62.5, 80],
    apRatio: 12.5,
    damageType: "magic",
  },
  {
    duration: 2.5,
  },
  undefined,
  undefined,
  [
    "45-80 (+12.5% AP) per tick (10 ticks)",
    "True damage to researched targets",
  ],
);

const VelKoz = new Character(
  "Vel'Koz",
  590, // HP
  5.5, // HP5
  22, // AR
  30, // MR
  55, // AD
  200, // Crit DMG (%)
  340, // MS
  525, // Attack range
  0.643, // Base AS
  [VelKozPassive, VelKozQ, VelKozW, VelKozE, VelKozR],
  [],
);

// Vex
const VexPassive = new Ability(
  "Doom 'n Gloom",
  "passive",
  "Periodically, Vex becomes Doomed. Her next ability fears and deals bonus damage to enemy dashers.",
  { cooldown: [25, 16], cooldownType: "static" },
  undefined,
  {
    baseDamage: [40, 170],
    apRatio: 25,
    damageType: "magic",
  },
  {
    ccType: "fear",
    ccDuration: 1.125,
  },
  undefined,
  undefined,
  [
    "Gloom: 40-170 (+25% AP)",
    "Fear: 0.75-1.5s (scales with level)",
    "CD: 25-16s (scales with level)",
  ],
);

const VexQ = new Ability(
  "Mistral Bolt",
  "Q",
  "Vex launches a wave forward that accelerates, dealing magic damage.",
  { cooldown: [8, 7.5, 7, 6.5, 6], cooldownType: "standard" },
  { castTime: 0.25, range: 750 },
  {
    baseDamage: [70, 115, 160, 205, 250],
    apRatio: 70,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [],
);

const VexW = new Ability(
  "Personal Space",
  "W",
  "Vex gains a shield and emits a shockwave that deals magic damage.",
  { cooldown: [20, 18.5, 17, 15.5, 14], cooldownType: "standard" },
  { castTime: 0 },
  {
    baseDamage: [80, 120, 160, 200, 240],
    apRatio: 30,
    damageType: "magic",
  },
  {
    shield: [50, 75, 100, 125, 150],
    duration: 2.5,
  },
  undefined,
  undefined,
  ["Shield: 50-150 (+75% AP)"],
);

const VexE = new Ability(
  "Looming Darkness",
  "E",
  "Vex commands Shadow to a location, dealing magic damage and slowing.",
  { cooldown: [14, 13, 12, 11, 10], cooldownType: "standard" },
  { castTime: 0.25, range: 800 },
  {
    baseDamage: [50, 70, 90, 110, 130],
    apRatio: 60,
    damageType: "magic",
  },
  {
    slow: [30, 35, 40, 45, 50],
    duration: 2,
  },
  undefined,
  undefined,
  [],
);

const VexR = new Ability(
  "Shadow Surge",
  "R",
  "Shadow surges forward, marking the first champion hit. Recast to dash to marked target.",
  { cooldown: [140, 120, 100], cooldownType: "standard" },
  { castTime: 0, range: 3000 },
  {
    baseDamage: [75, 125, 175],
    apRatio: 20,
    damageType: "magic",
  },
  {
    duration: 4,
  },
  undefined,
  undefined,
  [
    "Mark: 75-175 (+20% AP)",
    "Recast dash: 150-350 (+50% AP)",
    "Resets on takedown within 6s",
  ],
);

const Vex = new Character(
  "Vex",
  590, // HP
  6.5, // HP5
  23, // AR
  28, // MR
  54, // AD
  200, // Crit DMG (%)
  335, // MS
  550, // Attack range
  0.669, // Base AS
  [VexPassive, VexQ, VexW, VexE, VexR],
  [],
);

// Vi
const ViPassive = new Ability(
  "Blast Shield",
  "passive",
  "When Vi hits an enemy with an ability, she gains a shield equal to 12% of her max health.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  undefined,
  {
    shield: [0],
    duration: 3,
  },
  undefined,
  undefined,
  ["Shield: 12% max HP for 3s"],
);

const ViQ = new Ability(
  "Vault Breaker",
  "Q",
  "Vi charges up and dashes forward, dealing physical damage based on charge time.",
  { cooldown: [12, 10.5, 9, 7.5, 6], cooldownType: "standard" },
  { castTime: 0, range: 725 },
  {
    baseDamage: [40, 60, 80, 100, 120],
    adRatio: 60,
    damageType: "physical",
  },
  {
    ccType: "knockup",
    ccDuration: 0.75,
  },
  undefined,
  undefined,
  ["Min: 40-120 (+60% AD)", "Max: 100-300 (+150% AD)", "Charge time: 4s max"],
);

const ViW = new Ability(
  "Denting Blows",
  "W",
  "Every 3rd attack on the same target deals bonus max HP damage, reduces armor, and grants attack speed.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  {
    baseDamage: [0],
    maxHealthRatio: [4, 5, 6, 7, 8],
    damageType: "physical",
  },
  {
    bonusStats: { as: [30, 35, 40, 45, 50] },
    duration: 4,
  },
  undefined,
  undefined,
  [
    "4-8% max HP (+3.5% per 100 bonus AD)",
    "Reduces armor by 20%",
    "Grants 30-50% AS",
  ],
);

const ViE = new Ability(
  "Relentless Force",
  "E",
  "Vi's next attack deals bonus physical damage and hits enemies behind the target.",
  { cooldown: [12, 11, 10, 9, 8], cooldownType: "ammo" }, // Recharge time per charge
  { castTime: 0, range: 600 },
  {
    baseDamage: [10, 30, 50, 70, 90],
    apRatio: 100,
    adRatio: 110,
    damageType: "physical",
  },
  undefined,
  2,
  undefined,
  ["Stores 2 charges", "Recharge: 12-8s"],
);

const ViR = new Ability(
  "Cease and Desist",
  "R",
  "Vi targets an enemy champion and chases it down, knocking it up and dealing physical damage.",
  { cooldown: [140, 110, 80], cooldownType: "standard" },
  { castTime: 0, range: 800 },
  {
    baseDamage: [150, 250, 350],
    bonusAdRatio: 90,
    damageType: "physical",
  },
  {
    ccType: "knockup",
    ccDuration: 1.3,
  },
  undefined,
  undefined,
  ["Unstoppable during chase", "Knocks aside enemies in path"],
);

const Vi = new Character(
  "Vi",
  655, // HP
  10, // HP5
  30, // AR
  32, // MR
  63, // AD
  200, // Crit DMG (%)
  340, // MS
  125, // Attack range
  0.644, // Base AS
  [ViPassive, ViQ, ViW, ViE, ViR],
  [],
);

// Viego
const ViegoPassive = new Ability(
  "Sovereign's Domination",
  "passive",
  "Viego deals bonus current HP damage with attacks. First attack after damaging with ability hits twice.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  {
    baseDamage: [0],
    currentHealthRatio: [2, 3, 4, 5, 6],
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  ["2-6% current HP", "First attack after ability: +0.2 AD +15% AP"],
);

const ViegoQ = new Ability(
  "Blade of the Ruined King",
  "Q",
  "Viego stabs forward twice, dealing physical damage.",
  { cooldown: [6, 6, 6, 6, 6], cooldownType: "standard" },
  { castTime: 0, range: 600 },
  {
    baseDamage: [25, 40, 55, 70, 85],
    adRatio: 70,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  ["Hits twice"],
);

const ViegoW = new Ability(
  "Spectral Maw",
  "W",
  "Viego charges up and dashes forward, dealing magic damage and stunning.",
  { cooldown: [8, 7.5, 7, 6.5, 6], cooldownType: "standard" },
  { castTime: 0, range: 800 },
  {
    baseDamage: [80, 135, 190, 245, 300],
    apRatio: 100,
    damageType: "magic",
  },
  {
    ccType: "stun",
    ccDuration: 1,
  },
  undefined,
  undefined,
  ["Charge time: 0.75-2s", "Stun: 1-1.5s based on charge"],
);

const ViegoE = new Ability(
  "Harrowed Path",
  "E",
  "Viego spreads mist and gains camouflage and movement speed while in it.",
  { cooldown: [14, 13, 12, 11, 10], cooldownType: "standard" },
  { castTime: 0 },
  undefined,
  {
    bonusStats: { ms: [25, 27.5, 30, 32.5, 35] },
    duration: 8,
  },
  undefined,
  undefined,
  ["MS: 25-35% (+4% per 100 AP) in mist"],
);

const ViegoR = new Ability(
  "Heartbreaker",
  "R",
  "Viego teleports to a location and attacks, dealing physical damage based on missing health.",
  { cooldown: [120, 100, 80], cooldownType: "standard" },
  { castTime: 0.5, range: 500 },
  {
    baseDamage: [120, 180, 240],
    bonusAdRatio: 120,
    missingHealthRatio: 15,
    damageType: "physical",
  },
  {
    ccType: "knockup",
    ccDuration: 0.25,
  },
  undefined,
  undefined,
  ["Bonus damage: 15% missing HP"],
);

const Viego = new Character(
  "Viego",
  630, // HP
  7, // HP5
  34, // AR
  32, // MR
  57, // AD
  200, // Crit DMG (%)
  345, // MS
  200, // Attack range
  0.658, // Base AS
  [ViegoPassive, ViegoQ, ViegoW, ViegoE, ViegoR],
  [],
);

// Viktor
const ViktorPassive = new Ability(
  "Glorious Evolution",
  "passive",
  "Viktor upgrades his abilities with Hex Core stacks gained from damaging enemies with abilities.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  ["100 stacks upgrades an ability", "Max 300 stacks"],
);

const ViktorQ = new Ability(
  "Siphon Power",
  "Q",
  "Viktor blasts an enemy, dealing magic damage and granting a shield. Next attack deals bonus magic damage.",
  { cooldown: [8, 7, 6, 5, 4], cooldownType: "standard" },
  { castTime: 0, range: 600 },
  {
    baseDamage: [60, 75, 90, 105, 120],
    apRatio: 40,
    damageType: "magic",
  },
  {
    shield: [25, 30, 35, 40, 45],
    duration: 2.5,
  },
  undefined,
  undefined,
  ["Shield: 25-45 (+15% AP)", "Enhanced attack: 20-120 (+50% AP)(+100% AD)"],
);

const ViktorW = new Ability(
  "Gravity Field",
  "W",
  "Viktor creates a gravity field that slows and stuns enemies who stay inside.",
  { cooldown: [17, 16, 15, 14, 13], cooldownType: "standard" },
  { castTime: 0.25, range: 700 },
  undefined,
  {
    slow: [33, 36, 39, 42, 45],
    ccType: "stun",
    ccDuration: 1.5,
    duration: 4,
  },
  undefined,
  undefined,
  ["Field lasts 4s", "Stuns after 1.5s inside"],
);

const ViktorE = new Ability(
  "Death Ray",
  "E",
  "Viktor fires a laser that deals magic damage.",
  { cooldown: [12, 11, 10, 9, 8], cooldownType: "standard" },
  { castTime: 0, range: 700 },
  {
    baseDamage: [70, 110, 150, 190, 230],
    apRatio: 50,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [],
);

const ViktorR = new Ability(
  "Chaos Storm",
  "R",
  "Viktor summons a chaos storm that deals initial magic damage, then deals damage per second while following enemies.",
  { cooldown: [120, 110, 100], cooldownType: "standard" },
  { castTime: 0.25, range: 700 },
  {
    baseDamage: [100, 175, 250],
    apRatio: 50,
    damageType: "magic",
  },
  {
    duration: 7,
  },
  undefined,
  undefined,
  ["Initial: 100-250 (+50% AP)", "Per second: 65-145 (+35% AP)"],
);

const Viktor = new Character(
  "Viktor",
  600, // HP
  8, // HP5
  23, // AR
  30, // MR
  53, // AD
  200, // Crit DMG (%)
  335, // MS
  525, // Attack range
  0.658, // Base AS
  [ViktorPassive, ViktorQ, ViktorW, ViktorE, ViktorR],
  [],
);

// Vladimir
const VladimirPassive = new Ability(
  "Crimson Pact",
  "passive",
  "Every 30 bonus HP gives 1 AP. Every 1 AP gives 1.6 bonus HP.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  ["30 HP = 1 AP", "1 AP = 1.6 HP"],
);

const VladimirQ = new Ability(
  "Transfusion",
  "Q",
  "Vladimir drains the life of his target, dealing magic damage and healing. Every 3rd cast is empowered.",
  { cooldown: [9, 7.5, 6, 4.5, 3], cooldownType: "standard" },
  { castTime: 0.25, range: 600 },
  {
    baseDamage: [80, 100, 120, 140, 160],
    apRatio: 60,
    damageType: "magic",
  },
  {
    heal: [20, 25, 30, 35, 40],
  },
  undefined,
  undefined,
  [
    "Heal: 20-40 (+35% AP)",
    "Empowered: 148-296 (+111% AP) damage, +30-200 (+4% per 100 AP)(+5% missing HP) heal",
  ],
);

const VladimirW = new Ability(
  "Sanguine Pool",
  "W",
  "Vladimir sinks into a pool of blood, becoming untargetable and dealing magic damage.",
  { cooldown: [28, 25, 22, 19, 16], cooldownType: "standard" },
  { castTime: 0 },
  {
    baseDamage: [20, 33.75, 47.5, 61.25, 75],
    damageType: "magic",
  },
  {
    duration: 2,
  },
  undefined,
  undefined,
  ["20-75 (+2.5% bonus HP) per tick", "Slows by 40%"],
);

const VladimirE = new Ability(
  "Tides of Blood",
  "E",
  "Vladimir charges blood, dealing magic damage in an area. Damage increases with charge time.",
  { cooldown: [13, 11, 9, 7, 5], cooldownType: "standard" },
  { castTime: 0, range: 610 },
  {
    baseDamage: [30, 45, 60, 75, 90],
    apRatio: 100,
    damageType: "magic",
  },
  {
    slow: 40,
    duration: 0.5,
  },
  undefined,
  undefined,
  [
    "Min: 30-90 (+100% AP)(+2.5% bonus HP)",
    "Max: 60-180 (+200% AP)(+6% bonus HP)",
  ],
);

const VladimirR = new Ability(
  "Hemoplague",
  "R",
  "Vladimir infects enemies, increasing damage taken. After 4s, deals magic damage and heals Vladimir.",
  { cooldown: [120, 100, 80], cooldownType: "standard" },
  { castTime: 0.25, range: 700 },
  {
    baseDamage: [150, 250, 350],
    apRatio: 70,
    damageType: "magic",
  },
  {
    duration: 4,
  },
  undefined,
  undefined,
  [
    "Increases damage taken by 10%",
    "Heal: 150-350 (+70% AP) per champion, +60-140 (+28% AP) per additional",
  ],
);

const Vladimir = new Character(
  "Vladimir",
  600, // HP
  7, // HP5
  24, // AR
  30, // MR
  55, // AD
  200, // Crit DMG (%)
  330, // MS
  450, // Attack range
  0.658, // Base AS
  [VladimirPassive, VladimirQ, VladimirW, VladimirE, VladimirR],
  [],
);

// Volibear
const VolibearPassive = new Ability(
  "The Relentless Storm",
  "passive",
  "Volibear gains attack speed with stacking attacks. His attacks deal bonus lightning damage to nearby enemies.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  {
    baseDamage: [11, 60],
    apRatio: 40,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  ["11-60 (+40% AP) to nearby enemies", "Stacks grant AS"],
);

const VolibearQ = new Ability(
  "Thundering Smash",
  "Q",
  "Volibear gains movement speed and his next attack stuns and deals bonus physical damage.",
  { cooldown: [14, 13, 12, 11, 10], cooldownType: "standard" },
  { castTime: 0 },
  {
    baseDamage: [10, 30, 50, 70, 90],
    bonusAdRatio: 120,
    damageType: "physical",
  },
  {
    bonusStats: { ms: [15, 17.5, 20, 22.5, 25] },
    ccType: "stun",
    ccDuration: 1,
    duration: 4,
  },
  undefined,
  undefined,
  [],
);

const VolibearW = new Ability(
  "Frenzied Maul",
  "W",
  "Volibear bites an enemy, dealing physical damage. If the enemy is Wounded, deals bonus damage and heals.",
  { cooldown: [5, 5, 5, 5, 5], cooldownType: "standard" },
  { castTime: 0, range: 350 },
  {
    baseDamage: [5, 30, 55, 80, 105],
    adRatio: 100,
    damageType: "physical",
  },
  {
    heal: [20, 35, 50, 65, 80],
  },
  undefined,
  undefined,
  [
    "5-105 (+100% AD)(+6% bonus HP)",
    "Wounded: +50% damage (+15% bonus AD), heals 20-80 (+8-20% missing HP)",
  ],
);

const VolibearE = new Ability(
  "Sky Splitter",
  "E",
  "Volibear summons a lightning bolt that deals magic damage and grants a shield.",
  { cooldown: [15, 14, 13, 12, 11], cooldownType: "standard" },
  { castTime: 0, range: 1200 },
  {
    baseDamage: [80, 110, 140, 170, 200],
    apRatio: 70,
    maxHealthRatio: [11, 12, 13, 14, 15],
    damageType: "magic",
  },
  {
    shield: [0],
    duration: 3,
  },
  undefined,
  undefined,
  ["80-200 (+70% AP)(+11-15% max HP)", "Shield: (+75% AP)(+14% max HP)"],
);

const VolibearR = new Ability(
  "Stormbringer",
  "R",
  "Volibear leaps to a location, gaining health and attack range. Deals physical damage and disables towers.",
  { cooldown: [160, 140, 120], cooldownType: "standard" },
  { castTime: 0, range: 700 },
  {
    baseDamage: [300, 500, 700],
    bonusAdRatio: 250,
    apRatio: 125,
    damageType: "physical",
  },
  {
    bonusStats: { ad: [0] },
    duration: 12,
  },
  undefined,
  undefined,
  ["Gains 200-600 HP and 50 range for 12s", "Disables towers for 3-5s"],
);

const Volibear = new Character(
  "Volibear",
  650, // HP
  9, // HP5
  35, // AR
  32, // MR
  65, // AD
  200, // Crit DMG (%)
  340, // MS
  150, // Attack range
  0.625, // Base AS
  [VolibearPassive, VolibearQ, VolibearW, VolibearE, VolibearR],
  [],
);

// Warwick
const WarwickPassive = new Ability(
  "Eternal Hunger",
  "passive",
  "Warwick's attacks deal bonus magic damage. If below 50% HP, he heals for the damage dealt. Below 25% HP, healing triples.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  {
    baseDamage: [6, 46],
    bonusAdRatio: 15,
    apRatio: 10,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  ["6-46 (+15% bonus AD)(+10% AP)", "Heals 100% at <50% HP, 250% at <25% HP"],
);

const WarwickQ = new Ability(
  "Jaws of the Beast",
  "Q",
  "Warwick lunges forward and bites, dealing magic damage based on max HP and healing.",
  { cooldown: [6, 6, 6, 6, 6], cooldownType: "standard" },
  { castTime: 0, range: 350 },
  {
    baseDamage: [0],
    adRatio: 120,
    apRatio: 90,
    maxHealthRatio: [6, 7, 8, 9, 10],
    damageType: "magic",
  },
  {
    heal: [30, 45, 60, 75, 90],
  },
  undefined,
  undefined,
  ["120% AD (+90% AP)(+6-10% max HP)", "Heals for 30-90% of damage dealt"],
);

const WarwickW = new Ability(
  "Blood Hunt",
  "W",
  "Warwick senses low-health enemies, gaining movement speed and attack speed against them.",
  { cooldown: [120, 120, 120, 120, 120], cooldownType: "static" },
  undefined,
  undefined,
  {
    bonusStats: { ms: [35, 40, 45, 50, 55], as: [70, 80, 90, 100, 110] },
  },
  undefined,
  undefined,
  ["MS: 35-55% towards low HP enemies", "AS: 70-110% against them"],
);

const WarwickE = new Ability(
  "Primal Howl",
  "E",
  "Warwick reduces incoming damage, then howls causing enemies to flee.",
  { cooldown: [15, 14, 13, 12, 11], cooldownType: "standard" },
  { castTime: 0 },
  undefined,
  {
    ccType: "fear",
    ccDuration: 1,
    duration: 2.5,
  },
  undefined,
  undefined,
  ["Reduces damage by 35-55% for up to 2.5s"],
);

const WarwickR = new Ability(
  "Infinite Duress",
  "R",
  "Warwick leaps and suppresses a target, attacking them 3 times and healing for all damage dealt.",
  { cooldown: [110, 90, 70], cooldownType: "standard" },
  { castTime: 0, range: 700 },
  {
    baseDamage: [175, 350, 525],
    bonusAdRatio: 167.5,
    damageType: "magic",
  },
  {
    ccType: "stun",
    ccDuration: 1.5,
  },
  undefined,
  undefined,
  ["Suppresses for 1.5s", "Heals for 100% of damage dealt"],
);

const Warwick = new Character(
  "Warwick",
  620, // HP
  4, // HP5
  33, // AR
  32, // MR
  65, // AD
  200, // Crit DMG (%)
  335, // MS
  125, // Attack range
  0.638, // Base AS
  [WarwickPassive, WarwickQ, WarwickW, WarwickE, WarwickR],
  [],
);

// Wukong
const WukongPassive = new Ability(
  "Stone Skin",
  "passive",
  "Wukong gains bonus armor and magic resist for each nearby enemy champion.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  undefined,
  {
    bonusStats: { armor: [4, 8], mr: [4, 8] },
  },
  undefined,
  undefined,
  ["4-8 armor and MR per nearby enemy champion"],
);

const WukongQ = new Ability(
  "Crushing Blow",
  "Q",
  "Wukong's next attack gains range and deals bonus physical damage, reducing armor.",
  { cooldown: [9, 8.5, 8, 7.5, 7], cooldownType: "standard" },
  { castTime: 0 },
  {
    baseDamage: [20, 45, 70, 95, 120],
    bonusAdRatio: 50,
    damageType: "physical",
  },
  {
    duration: 3,
  },
  undefined,
  undefined,
  ["Range: +135-175 (scales with rank)", "Reduces armor by 10-30% for 3s"],
);

const WukongW = new Ability(
  "Warrior Trickster",
  "W",
  "Wukong dashes and becomes invisible, leaving behind a clone.",
  { cooldown: [20, 19, 18, 17, 16], cooldownType: "standard" },
  { castTime: 0 },
  undefined,
  {
    duration: 1,
  },
  undefined,
  undefined,
  ["Clone lasts 3.25s", "Clone deals 30-50% reduced damage (scales with rank)"],
);

const WukongE = new Ability(
  "Nimbus Strike",
  "E",
  "Wukong dashes to an enemy, sending out clones to nearby enemies and dealing magic damage.",
  { cooldown: [8, 8, 8, 8, 8], cooldownType: "standard" },
  { castTime: 0, range: 625 },
  {
    baseDamage: [80, 120, 160, 200, 240],
    apRatio: 100,
    damageType: "magic",
  },
  {
    bonusStats: { as: [40, 45, 50, 55, 60] },
    duration: 4,
  },
  undefined,
  undefined,
  ["Hits up to 3 enemies", "Grants 40-60% AS for 4s"],
);

const WukongR = new Ability(
  "Cyclone",
  "R",
  "Wukong spins his staff, knocking up enemies and dealing physical damage based on max HP.",
  { cooldown: [110, 95, 80], cooldownType: "standard" },
  { castTime: 0 },
  {
    baseDamage: [0],
    adRatio: 275,
    maxHealthRatio: [8, 12, 16],
    damageType: "physical",
  },
  {
    bonusStats: { ms: [20] },
    ccType: "knockup",
    ccDuration: 0.6,
    duration: 2,
  },
  undefined,
  undefined,
  ["Total: 8-16% max HP (+2.75 AD) over 2s", "Can recast within 8s"],
);

const Wukong = new Character(
  "Wukong",
  610, // HP
  3.5, // HP5
  31, // AR
  28, // MR
  66, // AD
  200, // Crit DMG (%)
  340, // MS
  175, // Attack range
  0.69, // Base AS
  [WukongPassive, WukongQ, WukongW, WukongE, WukongR],
  [],
);

// Xayah
const XayahPassive = new Ability(
  "Clean Cuts",
  "passive",
  "After using an ability, Xayah's next attacks deal bonus damage and leave Feathers.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  {
    baseDamage: [0],
    adRatio: 55,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  ["35-55% AD to targets past the first", "Leaves Feathers for 6s"],
);

const XayahQ = new Ability(
  "Double Daggers",
  "Q",
  "Xayah throws two daggers, dealing physical damage and leaving Feathers.",
  { cooldown: [10, 9, 8, 7, 6], cooldownType: "standard" },
  { castTime: 0.25, range: 1100 },
  {
    baseDamage: [50, 70, 90, 110, 130],
    bonusAdRatio: 60,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [],
);

const XayahW = new Ability(
  "Deadly Plumage",
  "W",
  "Xayah creates a storm of blades, gaining attack speed. Attacks fire secondary blades.",
  { cooldown: [20, 19, 18, 17, 16], cooldownType: "standard" },
  { castTime: 0 },
  undefined,
  {
    bonusStats: { as: [35, 40, 45, 50, 55] },
    duration: 4,
  },
  undefined,
  undefined,
  ["Secondary blades deal 25% damage"],
);

const XayahE = new Ability(
  "Bladecaller",
  "E",
  "Xayah calls all Feathers back, dealing physical damage. 3+ Feathers root enemies.",
  { cooldown: [12, 11, 10, 9, 8], cooldownType: "standard" },
  { castTime: 0 },
  {
    baseDamage: [50, 65, 80, 95, 110],
    bonusAdRatio: 40,
    damageType: "physical",
  },
  {
    ccType: "root",
    ccDuration: 1.25,
  },
  undefined,
  undefined,
  ["Damage per Feather", "3+ Feathers root for 1.25s"],
);

const XayahR = new Ability(
  "Featherstorm",
  "R",
  "Xayah leaps into the air becoming untargetable, then rains daggers dealing physical damage.",
  { cooldown: [160, 145, 130], cooldownType: "standard" },
  { castTime: 0, range: 1100 },
  {
    baseDamage: [200, 300, 400],
    bonusAdRatio: 100,
    damageType: "physical",
  },
  {
    duration: 1.5,
  },
  undefined,
  undefined,
  ["Untargetable for 1.5s", "Leaves 5 Feathers"],
);

const Xayah = new Character(
  "Xayah",
  630, // HP
  3.25, // HP5
  25, // AR
  30, // MR
  60, // AD
  200, // Crit DMG (%)
  330, // MS
  525, // Attack range
  0.658, // Base AS
  [XayahPassive, XayahQ, XayahW, XayahE, XayahR],
  [],
);

// Xerath
const XerathPassive = new Ability(
  "Mana Surge",
  "passive",
  "Xerath's attacks restore mana.",
  { cooldown: [12], cooldownType: "static" },
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  ["Restores 30-195 mana (scales with level)"],
);

const XerathQ = new Ability(
  "Arcanopulse",
  "Q",
  "Xerath charges and fires a beam dealing magic damage.",
  { cooldown: [9, 8, 7, 6, 5], cooldownType: "standard" },
  { castTime: 0, range: 1400 },
  {
    baseDamage: [75, 115, 155, 195, 235],
    apRatio: 90,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  ["Charge time: 3s", "Min range: 750"],
);

const XerathW = new Ability(
  "Eye of Destruction",
  "W",
  "Xerath calls down a blast, dealing magic damage and slowing. Center deals bonus damage.",
  { cooldown: [14, 13, 12, 11, 10], cooldownType: "standard" },
  { castTime: 0.5, range: 1100 },
  {
    baseDamage: [50, 85, 120, 155, 190],
    apRatio: 65,
    damageType: "magic",
  },
  {
    slow: 25,
    duration: 2.5,
  },
  undefined,
  undefined,
  ["Center: 100-333 (+100% AP)", "Edge: 50-190 (+65% AP)", "Slow: 25%"],
);

const XerathE = new Ability(
  "Shocking Orb",
  "E",
  "Xerath fires an orb that stuns the first enemy hit. Stun duration increases with distance.",
  { cooldown: [13, 12.5, 12, 11.5, 11], cooldownType: "standard" },
  { castTime: 0.25, range: 1050 },
  {
    baseDamage: [70, 100, 130, 160, 190],
    apRatio: 45,
    damageType: "magic",
  },
  {
    ccType: "stun",
    ccDuration: 1.5,
  },
  undefined,
  undefined,
  ["Stun: 0.75-2.25s based on distance"],
);

const XerathR = new Ability(
  "Rite of the Arcane",
  "R",
  "Xerath roots himself and fires up to 3-5 artillery blasts.",
  { cooldown: [140, 130, 120], cooldownType: "standard" },
  { castTime: 0.5, range: 5000 },
  {
    baseDamage: [170, 220, 270],
    apRatio: 45,
    damageType: "magic",
  },
  {
    duration: 10,
  },
  undefined,
  5,
  ["Fires 3-5 blasts (scales with rank)", "Per champion hit: +20-30 (+5% AP)"],
);

const Xerath = new Character(
  "Xerath",
  596, // HP
  5.5, // HP5
  22, // AR
  30, // MR
  55, // AD
  200, // Crit DMG (%)
  340, // MS
  525, // Attack range
  0.658, // Base AS
  [XerathPassive, XerathQ, XerathW, XerathE, XerathR],
  [],
);

// Xin Zhao
const XinZhaoPassive = new Ability(
  "Determination",
  "passive",
  "Every 3rd attack deals bonus damage and heals Xin Zhao.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  {
    baseDamage: [0],
    adRatio: 60,
    damageType: "physical",
  },
  {
    heal: [0],
  },
  undefined,
  undefined,
  ["15-60% AD", "Heals 3-4% max HP (+65% AP) (scales with level)"],
  true, // appliesOnHit
);

const XinZhaoQ = new Ability(
  "Three Talon Strike",
  "Q",
  "Xin Zhao's next 3 attacks deal bonus physical damage. Third attack knocks up.",
  { cooldown: [7, 6.5, 6, 5.5, 5], cooldownType: "standard" },
  { castTime: 0 },
  {
    baseDamage: [15, 30, 45, 60, 75],
    adRatio: 40,
    damageType: "physical",
  },
  {
    ccType: "knockup",
    ccDuration: 0.75,
  },
  undefined,
  undefined,
  ["Per attack: 15-75 (+40% AD)"],
  true, // appliesOnHit
);

const XinZhaoW = new Ability(
  "Wind Becomes Lightning",
  "W",
  "Xin Zhao slashes and thrusts forward, dealing physical damage.",
  { cooldown: [10, 9.5, 9, 8.5, 8], cooldownType: "standard" },
  { castTime: 0.5, range: 900 },
  {
    baseDamage: [30, 40, 50, 60, 70],
    adRatio: 30,
    damageType: "physical",
  },
  {
    slow: 50,
    duration: 1.5,
  },
  undefined,
  undefined,
  ["Slash: 30-70 (+30% AD)", "Thrust: same damage and slows 50%"],
);

const XinZhaoE = new Ability(
  "Audacious Charge",
  "E",
  "Xin Zhao dashes to an enemy, dealing magic damage and gaining attack speed.",
  { cooldown: [12, 12, 12, 12, 12], cooldownType: "standard" },
  { castTime: 0, range: 650 },
  {
    baseDamage: [50, 75, 100, 125, 150],
    apRatio: 60,
    damageType: "magic",
  },
  {
    bonusStats: { as: [40, 45, 50, 55, 60] },
    slow: 50,
    duration: 5,
  },
  undefined,
  undefined,
  ["Slows by 50% for 0.5s"],
);

const XinZhaoR = new Ability(
  "Crescent Guard",
  "R",
  "Xin Zhao sweeps around him, dealing physical damage and becoming immune to damage from outside the circle.",
  { cooldown: [120, 110, 100], cooldownType: "standard" },
  { castTime: 0.35 },
  {
    baseDamage: [75, 175, 275],
    bonusAdRatio: 100,
    apRatio: 110,
    currentHealthRatio: 15,
    damageType: "physical",
  },
  {
    duration: 5,
  },
  undefined,
  undefined,
  [
    "75-275 (+100% bonus AD)(+110% AP)(+15% current HP)",
    "Immune from outside for 5s",
  ],
);

const XinZhao = new Character(
  "Xin Zhao",
  620, // HP
  8, // HP5
  35, // AR
  32, // MR
  63, // AD
  200, // Crit DMG (%)
  345, // MS
  175, // Attack range
  0.645, // Base AS
  [XinZhaoPassive, XinZhaoQ, XinZhaoW, XinZhaoE, XinZhaoR],
  [],
);

// Yasuo
const YasuoPassive = new Ability(
  "Way of the Wanderer",
  "passive",
  "Yasuo's critical strike chance is increased by 150%. Crits deal reduced damage. Gains a shield at max Flow.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  undefined,
  {
    shield: [125, 600],
  },
  undefined,
  undefined,
  [
    "+150% crit chance",
    "Crits deal 90% damage",
    "0.5 bonus AD per 1% crit over 100%",
    "Shield: 125-600",
  ],
);

const YasuoQ = new Ability(
  "Steel Tempest",
  "Q",
  "Yasuo thrusts forward, dealing physical damage. Every 3rd cast is a tornado that knocks up.",
  { cooldown: [4, 4, 4, 4, 4], cooldownType: "standard" },
  { castTime: 0.4, range: 475 },
  {
    baseDamage: [20, 45, 70, 95, 120],
    adRatio: 105,
    damageType: "physical",
  },
  {
    ccType: "knockup",
    ccDuration: 0.75,
  },
  undefined,
  undefined,
  ["CD scales with AS", "3rd cast: tornado knocks up for 0.75s"],
);

const YasuoW = new Ability(
  "Wind Wall",
  "W",
  "Yasuo creates a wall that blocks all enemy projectiles.",
  { cooldown: [30, 27, 24, 21, 18], cooldownType: "standard" },
  { castTime: 0.25 },
  undefined,
  {
    duration: 4,
  },
  undefined,
  undefined,
  ["Blocks projectiles for 4s"],
);

const YasuoE = new Ability(
  "Sweeping Blade",
  "E",
  "Yasuo dashes through an enemy, dealing magic damage. Damage increases with consecutive dashes.",
  { cooldown: [4, 4, 4, 4, 4], cooldownType: "standard" }, // Per-target cooldown
  { castTime: 0, range: 475 },
  {
    baseDamage: [70, 85, 100, 115, 130],
    apRatio: 60,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  ["Stacks: +25% damage per stack (max 2)", "Per-target cooldown: 4s"],
);

const YasuoR = new Ability(
  "Last Breath",
  "R",
  "Yasuo blinks to an airborne enemy champion, dealing physical damage. Crits ignore armor afterwards.",
  { cooldown: [80, 65, 50], cooldownType: "standard" },
  { castTime: 0, range: 1400 },
  {
    baseDamage: [200, 350, 500],
    adRatio: 150,
    damageType: "physical",
  },
  {
    duration: 1,
  },
  undefined,
  undefined,
  ["Crits ignore 60% armor for 15s"],
);

const Yasuo = new Character(
  "Yasuo",
  590, // HP
  6.5, // HP5
  32, // AR
  32, // MR
  60, // AD
  200, // Crit DMG (%)
  345, // MS
  175, // Attack range
  0.697, // Base AS
  [YasuoPassive, YasuoQ, YasuoW, YasuoE, YasuoR],
  [],
);

// Yone
const YonePassive = new Ability(
  "Way of the Hunter",
  "passive",
  "Yone uses two blades. Every second attack deals bonus magic damage.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  {
    baseDamage: [0],
    adRatio: 50,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Every 2nd attack: 50% AD as magic damage",
    "+150% crit chance, crits deal 90% damage",
  ],
);

const YoneQ = new Ability(
  "Mortal Steel",
  "Q",
  "Yone thrusts forward, dealing physical damage. Every 3rd cast is a tornado that knocks up.",
  { cooldown: [4, 4, 4, 4, 4], cooldownType: "standard" },
  { castTime: 0.4, range: 450 },
  {
    baseDamage: [25, 50, 75, 100, 125],
    adRatio: 105,
    damageType: "physical",
  },
  {
    ccType: "knockup",
    ccDuration: 0.75,
  },
  undefined,
  undefined,
  ["CD scales with AS", "3rd cast: tornado knocks up"],
);

const YoneW = new Ability(
  "Spirit Cleave",
  "W",
  "Yone cleaves forward, dealing damage based on max HP and gaining a shield.",
  { cooldown: [16, 15, 14, 13, 12], cooldownType: "standard" },
  { castTime: 0.5, range: 600 },
  {
    baseDamage: [10, 20, 30, 40, 50],
    maxHealthRatio: [8, 9, 10, 11, 12],
    damageType: "magic",
  },
  {
    shield: [60, 80],
  },
  undefined,
  undefined,
  ["10-50 + 8-12% max HP (50% physical, 50% magic)", "Shield: 60-80 (+65% AD)"],
);

const YoneE = new Ability(
  "Soul Unbound",
  "E",
  "Yone enters spirit form, gaining movement speed. When it ends, repeats damage dealt to champions.",
  { cooldown: [22, 19, 16, 13, 10], cooldownType: "standard" },
  { castTime: 0 },
  undefined,
  {
    bonusStats: { ms: [10, 12.5, 15, 17.5, 20] },
    duration: 5,
  },
  undefined,
  undefined,
  ["Repeats 25-35% of damage dealt to champions (scales with rank)"],
);

const YoneR = new Ability(
  "Fate Sealed",
  "R",
  "Yone blinks and strikes, dealing physical and magic damage and knocking up enemies.",
  { cooldown: [120, 100, 80], cooldownType: "standard" },
  { castTime: 0, range: 1000 },
  {
    baseDamage: [200, 400, 600],
    adRatio: 80,
    damageType: "physical",
  },
  {
    ccType: "knockup",
    ccDuration: 0.75,
  },
  undefined,
  undefined,
  ["200-600 (+80% AD) split 50/50 physical/magic", "Knocks up for 0.75s"],
);

const Yone = new Character(
  "Yone",
  620, // HP
  7.5, // HP5
  33, // AR
  32, // MR
  62, // AD
  200, // Crit DMG (%)
  345, // MS
  175, // Attack range
  0.625, // Base AS
  [YonePassive, YoneQ, YoneW, YoneE, YoneR],
  [],
);

// Yorick
const YorickPassive = new Ability(
  "Shepherd of Souls",
  "passive",
  "Yorick raises a grave for every 8-2 enemies that die near him (scales with rank).",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  ["Champions and large monsters always leave a grave", "Max 4 graves"],
);

const YorickQ = new Ability(
  "Last Rites",
  "Q",
  "Yorick's next attack deals bonus physical damage and restores health.",
  { cooldown: [7, 6.25, 5.5, 4.75, 4], cooldownType: "standard" },
  { castTime: 0 },
  {
    baseDamage: [30, 50, 70, 90, 110],
    adRatio: 50,
    damageType: "physical",
  },
  {
    heal: [10, 68],
  },
  undefined,
  undefined,
  [
    "Heals 10-68 (+4-8% missing HP) (scales with rank)",
    "Halved vs non-champions",
  ],
);

const YorickW = new Ability(
  "Dark Procession",
  "W",
  "Yorick summons a wall that traps enemies inside.",
  { cooldown: [20, 18, 16, 14, 12], cooldownType: "standard" },
  { castTime: 0.5, range: 600 },
  undefined,
  {
    duration: 4,
  },
  undefined,
  undefined,
  ["Wall health: 2-4 hits (scales with rank)", "Lasts 4s"],
);

const YorickE = new Ability(
  "Mourning Mist",
  "E",
  "Yorick throws Black Mist dealing magic damage based on max HP and marking enemies.",
  { cooldown: [12, 11, 10, 9, 8], cooldownType: "standard" },
  { castTime: 0.25, range: 700 },
  {
    baseDamage: [0],
    apRatio: 300,
    maxHealthRatio: [6, 6.5, 7, 7.5, 8],
    maxHealthRatioPerAP: 3,
    damageType: "magic",
  },
  {
    slow: 30,
    duration: 2,
  },
  undefined,
  undefined,
  [
    "6-8% max HP (+3% per 100 AP)",
    "Reduces armor by 18-30%",
    "Slows 30% for 2s",
  ],
);

const YorickR = new Ability(
  "Eulogy of the Isles",
  "R",
  "Yorick summons the Maiden of the Mist that attacks and raises Mist Walkers.",
  { cooldown: [160, 130, 100], cooldownType: "standard" },
  { castTime: 0.5, range: 600 },
  {
    baseDamage: [50, 75, 100],
    adRatio: 30,
    maxHealthRatio: [2, 2.5, 3],
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Maiden: 1050-3200 (+60% bonus HP) health",
    "Deals 50-100 (+30% AD)",
    "Yorick marks: 2-3% max HP magic damage",
  ],
);

const Yorick = new Character(
  "Yorick",
  650, // HP
  8, // HP5
  36, // AR
  32, // MR
  62, // AD
  200, // Crit DMG (%)
  340, // MS
  175, // Attack range
  0.625, // Base AS
  [YorickPassive, YorickQ, YorickW, YorickE, YorickR],
  [],
);

// Yuumi
const YuumiPassive = new Ability(
  "Feline Friendship",
  "passive",
  "Periodically, Yuumi's attacks restore health and grant mana.",
  { cooldown: [20, 12], cooldownType: "static" },
  undefined,
  undefined,
  {
    heal: [25, 110],
  },
  undefined,
  undefined,
  [
    "Heals 25-110 (+15% AP)",
    "Restores 30-70 mana",
    "CD: 20-12s (scales with level)",
  ],
);

const YuumiQ = new Ability(
  "Prowling Projectile",
  "Q",
  "Yuumi fires a missile that deals magic damage. Empowered if controlled for 1s.",
  { cooldown: [11.5, 10.5, 9.5, 8.5, 7.5, 6.5], cooldownType: "standard" },
  { castTime: 0.25, range: 1150 },
  {
    baseDamage: [60, 95, 130, 165, 200, 235],
    apRatio: 20,
    damageType: "magic",
  },
  {
    slow: 20,
    duration: 1,
  },
  undefined,
  undefined,
  ["Empowered: 80-355 (+30% AP)", "Empowered slow: 40-60% for 1.5s"],
);

const YuumiW = new Ability(
  "You and Me!",
  "W",
  "Yuumi attaches to an ally, becoming untargetable and granting bonus stats.",
  { cooldown: [10, 10, 10, 10, 10, 10], cooldownType: "standard" },
  { castTime: 0 },
  undefined,
  undefined,
  undefined,
  undefined,
  [
    "Best Friend: +4-8% heal/shield power",
    "+3-7 (+0.3% AP) damage on-hit (scales with rank)",
  ],
);

const YuumiE = new Ability(
  "Zoomies",
  "E",
  "Yuumi heals and grants attack speed to herself or her attached ally.",
  { cooldown: [12, 11.5, 11, 10.5, 10, 9.5], cooldownType: "standard" },
  { castTime: 0 },
  undefined,
  {
    heal: [70, 90, 110, 130, 150, 170],
    bonusStats: { as: [25, 27.5, 30, 32.5, 35, 37.5] },
    duration: 3,
  },
  undefined,
  undefined,
  ["Heal: 70-170 (+15% AP)", "AS: 25-37.5% (+8% per 100 AP) for 3s"],
);

const YuumiR = new Ability(
  "Final Chapter",
  "R",
  "Yuumi channels, firing waves that deal magic damage and slow or root enemies.",
  { cooldown: [130, 110, 90], cooldownType: "standard" },
  { castTime: 0, range: 1100 },
  {
    baseDamage: [60, 90, 120],
    apRatio: 20,
    damageType: "magic",
  },
  {
    ccType: "root",
    ccDuration: 1.25,
    slow: 10,
    duration: 3.5,
  },
  undefined,
  7,
  [
    "7 waves over 3.5s",
    "Per wave: 60-120 (+20% AP)",
    "1 hit: 10% slow, 3+ hits: 1.25s root",
  ],
);

const Yuumi = new Character(
  "Yuumi",
  500, // HP
  5, // HP5
  25, // AR
  25, // MR
  49, // AD
  200, // Crit DMG (%)
  330, // MS
  425, // Attack range
  0.625, // Base AS
  [YuumiPassive, YuumiQ, YuumiW, YuumiE, YuumiR],
  [],
);

// Yunara
const YunaraPassive = new Ability(
  "Way of the Hunter",
  "passive",
  "Attacks and abilities grant stacks; at max stacks, next ability is empowered.",
  { cooldown: 0, cooldownType: "standard" },
  undefined,
  {
    baseDamage: [10, 50],
    adRatio: 25,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  undefined,
  true,
);

const YunaraQ = new Ability(
  "Cultivation of Spirit",
  "Q",
  "Strikes in a line dealing physical damage; empowered form attacks faster.",
  { cooldown: [9, 8.5, 8, 7.5, 7], cooldownType: "standard" },
  { castTime: 0.25, range: 900, width: 120 },
  {
    baseDamage: [20, 100],
    adRatio: 90,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  ["Empowered: 3 rapid strikes"],
  true,
);

const YunaraW = new Ability(
  "Arc of Judgment",
  "W",
  "Creates a zone that grants attack speed and on-hit magic damage.",
  { cooldown: [16, 15, 14, 13, 12], cooldownType: "standard" },
  { castTime: 0.25, range: 900, radius: 400 },
  {
    baseDamage: [30, 110],
    adRatio: 40,
    apRatio: 40,
    damageType: "magic",
  },
  {
    bonusStats: { as: [25, 45] },
    duration: 4,
  },
);

const YunaraE = new Ability(
  "Kanmei's Steps",
  "E",
  "Becomes untargetable and dashes, gaining movement speed.",
  { cooldown: [18, 16, 14, 12, 10], cooldownType: "standard" },
  { castTime: 0, range: 450 },
  undefined,
  {
    bonusStats: { ms: [30, 50] },
    duration: 2,
  },
);

const YunaraR = new Ability(
  "Transcend One's Self",
  "R",
  "Enters ascended state with bonus range, attack speed, and on-hit damage.",
  { cooldown: [120, 100, 80], cooldownType: "standard" },
  { castTime: 0.25, range: 0 },
  {
    baseDamage: [50, 150],
    adRatio: 50,
    damageType: "magic",
  },
  {
    bonusStats: { as: [40, 60] },
    duration: 10,
  },
  undefined,
  undefined,
  ["+100-150 attack range while ascended", "On-hit magic damage"],
  true,
);

const Yunara = new Character(
  "Yunara",
  590, // HP
  4, // HP5
  25, // AR
  30, // MR
  55, // AD
  200, // Crit DMG (%)
  325, // MS
  575, // Attack range
  0.65, // Base AS
  [YunaraPassive, YunaraQ, YunaraW, YunaraE, YunaraR],
  [],
);

// Zaahen - The Unsundered
const ZaahenPassive = new Ability(
  "Cultivation of War",
  "passive",
  "Generate Determination stacks on damage. At max stacks, gain doubled bonus AD. Periodically revive at max stacks.",
  { cooldown: [300, 240, 180, 120], cooldownType: "static" },
  undefined,
  undefined,
  {
    // At max 12 stacks, doubled: 36-67.2% AD as bonus AD
    // Using level 18 value for DPS calc
    bonusStats: { ad: [36, 67.2] }, // % of AD as bonus AD at max stacks
  },
  undefined,
  undefined,
  [
    "Stacks: 1 per champion damaged, max 12",
    "Per stack: 1.5-2.8% AD as bonus AD",
    "Max stacks (doubled): 36-67.2% AD as bonus AD",
    "Duration: 5s, refreshes on damage",
    "Revive: 30/45/60/75% max HP over 4s (at max stacks)",
    "Revive CD: 300/240/180/120s (based on level)",
  ],
);

const ZaahenQ = new Ability(
  "The Darkin Glaive",
  "Q",
  "Empower next attack to strike twice, heal, and can recast for knockup.",
  { cooldown: [10, 9, 8, 7, 6], cooldownType: "standard" },
  { castTime: 0 },
  {
    // Total damage: 15-75 + 100% AD + 20-40% bonus AD (both strikes)
    baseDamage: [15, 30, 45, 60, 75],
    adRatio: 100,
    bonusAdRatio: [20, 25, 30, 35, 40],
    damageType: "physical",
  },
  {
    ccType: "knockup",
    ccDuration: 0.75, // Recast knockup
  },
  2, // 2 casts
  undefined,
  [
    "Cost: 25 mana",
    "First cast: 2 strikes, heals 5-9% max HP vs champs",
    "Can crit for (50% + 15% IE) AD bonus damage",
    "Recast: 25-125 (+20-40% bonus AD), 0.75s knockup",
    "175% damage vs monsters",
    "Resets attack timer",
  ],
  true, // Applies on-hit
);

const ZaahenW = new Ability(
  "Dreaded Return",
  "W",
  "Extend glaive in a direction, dealing damage twice. Pulls and stuns enemies at max range.",
  { cooldown: [16, 15, 14, 13, 12], cooldownType: "standard" },
  { castTime: 0.5, range: 850 },
  {
    // Total: 80-240 + 100% bonus AD
    baseDamage: [80, 120, 160, 200, 240],
    bonusAdRatio: 100,
    damageType: "physical",
  },
  {
    ccType: "stun",
    ccDuration: 0.25,
  },
  undefined,
  undefined,
  [
    "Cost: 50 mana",
    "Per hit: 40-120 (+50% bonus AD)",
    "Total: 80-240 (+100% bonus AD)",
    "At max range: 0.25s stun, 225 unit pull",
  ],
);

const ZaahenE = new Ability(
  "Aureate Rush",
  "E",
  "Dash to location and deal damage. Outer edge deals increased damage + % max HP magic damage.",
  { cooldown: [10, 9.5, 9, 8.5, 8], cooldownType: "standard" },
  { castTime: 0, range: 350 },
  {
    // Outer edge: 60-180 + 75% bonus AD + 4-6% max HP magic
    baseDamage: [60, 90, 120, 150, 180], // Using outer edge damage
    bonusAdRatio: 75,
    maxHealthRatio: [4, 4.5, 5, 5.5, 6], // Magic damage portion
    damageType: "physical", // Main damage is physical
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 40 mana",
    "Inner: 40-120 (+50% bonus AD) physical",
    "Outer edge: 150% = 60-180 (+75% bonus AD) physical",
    "Outer edge bonus: 4-6% max HP magic (capped 400 vs monsters)",
    "+50 bonus damage vs monsters",
  ],
);

const ZaahenR = new Ability(
  "Grim Deliverance",
  "R",
  "Passive: Gain armor pen. Active: Leap and slam dealing damage, healing per champion hit.",
  { cooldown: [110, 95, 80], cooldownType: "standard" },
  { castTime: 0.5, range: 600 },
  {
    baseDamage: [250, 400, 550],
    bonusAdRatio: 200,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "Passive: 10/20/30% armor penetration",
    "Damage: 250-550 (+200% bonus AD)",
    "Heal per champ: 82.5-181.5 (+66% bonus AD)",
    "50% damage reduction during cast",
    "CC immune during cast, displacement immune during leap",
  ],
);

const Zaahen = new Character(
  "Zaahen",
  640, // HP
  7.5, // HP5
  36, // AR
  32, // MR
  63, // AD
  200, // Crit DMG (%)
  345, // MS
  175, // Attack range
  0.625, // Base AS
  [ZaahenPassive, ZaahenQ, ZaahenW, ZaahenE, ZaahenR],
  [],
);

// Zac
const ZacPassive = new Ability(
  "Cell Division",
  "passive",
  "When Zac dies, he splits into 4 blobs. If any survive, he reforms with health based on blobs remaining.",
  { cooldown: [300], cooldownType: "static" },
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  ["Blobs have 12% max HP each", "Reforms with blob HP", "5 min CD"],
);

const ZacQ = new Ability(
  "Stretching Strikes",
  "Q",
  "Zac slaps enemies, dealing magic damage. Hitting two enemies throws them together.",
  { cooldown: [15, 13.5, 12, 10.5, 9], cooldownType: "standard" },
  { castTime: 0.25, range: 800 },
  {
    baseDamage: [40, 55, 70, 85, 100],
    apRatio: 30,
    maxHealthRatio: 3,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  ["40-100 (+30% AP)(+3% max HP)"],
);

const ZacW = new Ability(
  "Unstable Matter",
  "W",
  "Zac explodes, dealing magic damage based on max HP to nearby enemies.",
  { cooldown: [5, 5, 5, 5, 5], cooldownType: "standard" },
  { castTime: 0 },
  {
    baseDamage: [40, 50, 60, 70, 80],
    maxHealthRatio: [4, 5, 6, 7, 8],
    maxHealthRatioPerAP: 3,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  ["40-80 + 4-8% max HP (+3% per 100 AP)"],
);

const ZacE = new Ability(
  "Elastic Slingshot",
  "E",
  "Zac charges up, then launches himself dealing magic damage and knocking up enemies.",
  { cooldown: [24, 21, 18, 15, 12], cooldownType: "standard" },
  { castTime: 0, range: 1200 },
  {
    baseDamage: [60, 105, 150, 195, 240],
    apRatio: 80,
    damageType: "magic",
  },
  {
    ccType: "knockup",
    ccDuration: 1,
  },
  undefined,
  undefined,
  ["Charge time: up to 4s", "Knockup: 0.5-1s based on charge"],
);

const ZacR = new Ability(
  "Let's Bounce!",
  "R",
  "Zac bounces, dealing magic damage and slowing enemies.",
  { cooldown: [130, 115, 100], cooldownType: "standard" },
  { castTime: 0 },
  {
    baseDamage: [140, 210, 280],
    apRatio: 40,
    damageType: "magic",
  },
  {
    slow: 20,
    duration: 1,
  },
  undefined,
  4,
  [
    "First bounce: 140-280 (+40% AP)",
    "Next bounces: 70-140 (+20% AP)",
    "Up to 4 bounces",
  ],
);

const Zac = new Character(
  "Zac",
  685, // HP
  5, // HP5
  33, // AR
  32, // MR
  60, // AD
  200, // Crit DMG (%)
  340, // MS
  175, // Attack range
  0.736, // Base AS
  [ZacPassive, ZacQ, ZacW, ZacE, ZacR],
  [],
);

// Zed
const ZedPassive = new Ability(
  "Contempt for the Weak",
  "passive",
  "Zed's attacks against low HP enemies deal bonus magic damage based on max HP.",
  { cooldown: [10], cooldownType: "static" },
  undefined,
  {
    baseDamage: [0],
    maxHealthRatio: [6, 10],
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "6-10% max HP magic damage vs <50% HP targets (scales with level)",
    "10s CD per target",
  ],
);

const ZedQ = new Ability(
  "Razor Shuriken",
  "Q",
  "Zed and his shadows throw shurikens dealing physical damage.",
  { cooldown: [6, 6, 6, 6, 6], cooldownType: "standard" },
  { castTime: 0.25, range: 900 },
  {
    baseDamage: [80, 120, 160, 200, 240],
    bonusAdRatio: 110,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  ["Hits after first deal 60% damage"],
);

const ZedW = new Ability(
  "Living Shadow",
  "W",
  "Zed sends out a shadow. Recast to swap places.",
  { cooldown: [22, 20, 18, 16, 14], cooldownType: "standard" },
  { castTime: 0.25, range: 650 },
  undefined,
  {
    duration: 5,
  },
  undefined,
  undefined,
  ["Shadow lasts 5s", "Abilities cast by shadows deal full damage"],
);

const ZedE = new Ability(
  "Shadow Slash",
  "E",
  "Zed and his shadows slash, dealing physical damage and slowing.",
  { cooldown: [5, 4.5, 4, 3.5, 3], cooldownType: "standard" },
  { castTime: 0 },
  {
    baseDamage: [70, 95, 120, 145, 170],
    bonusAdRatio: 80,
    damageType: "physical",
  },
  {
    slow: 20,
    duration: 1.5,
  },
  undefined,
  undefined,
  ["Double hit: 40-90% slow for 1.5s"],
);

const ZedR = new Ability(
  "Death Mark",
  "R",
  "Zed becomes untargetable and marks a target. After 3s, repeats damage dealt.",
  { cooldown: [120, 100, 80], cooldownType: "standard" },
  { castTime: 0, range: 650 },
  {
    baseDamage: [0],
    adRatio: 65,
    damageType: "physical",
  },
  {
    duration: 3,
  },
  undefined,
  undefined,
  ["Initial: 65% AD", "Repeats 25-55% of damage dealt (scales with rank)"],
);

const Zed = new Character(
  "Zed",
  654, // HP
  7, // HP5
  32, // AR
  29, // MR
  63, // AD
  200, // Crit DMG (%)
  345, // MS
  125, // Attack range
  0.651, // Base AS
  [ZedPassive, ZedQ, ZedW, ZedE, ZedR],
  [],
);

// Zeri
const ZeriPassive = new Ability(
  "Living Battery",
  "passive",
  "Zeri gains a stack from shielding or damaging enemies. At full charge, next attack deals bonus magic damage.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  {
    baseDamage: [75, 160],
    apRatio: 110,
    maxHealthRatio: [1, 11],
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  ["Full charge: 75-160 (+110% AP)(+1-11% max HP)", "Partial: 10-25 (+3% AP)"],
);

const ZeriQ = new Ability(
  "Burst Fire",
  "Q",
  "Zeri fires 7 rounds dealing physical damage to the first enemy hit.",
  { cooldown: [1, 1, 1, 1, 1], cooldownType: "standard" },
  { castTime: 0, range: 825 },
  {
    baseDamage: [15, 17, 19, 21, 23],
    adRatio: 120,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  ["Total: 15-23 (+104-120% total AD)"],
);

const ZeriW = new Ability(
  "Ultrashock Laser",
  "W",
  "Zeri fires a laser that deals magic damage and slows.",
  { cooldown: [13, 12, 11, 10, 9], cooldownType: "standard" },
  { castTime: 0.25, range: 1200 },
  {
    baseDamage: [30, 70, 110, 150, 190],
    apRatio: 25,
    adRatio: 120,
    damageType: "magic",
  },
  {
    slow: [30, 35, 40, 45, 50],
    duration: 2,
  },
  undefined,
  undefined,
  [],
);

const ZeriE = new Ability(
  "Spark Surge",
  "E",
  "Zeri dashes and energizes her weapon. For 5s, shots pierce and deal bonus magic damage.",
  { cooldown: [24, 22.5, 21, 19.5, 18], cooldownType: "standard" },
  { castTime: 0, range: 300 },
  {
    baseDamage: [17, 19, 21, 23, 25],
    bonusAdRatio: 10,
    apRatio: 20,
    damageType: "magic",
  },
  {
    duration: 5,
  },
  undefined,
  undefined,
  [
    "Pierce damage: 0-85% based on crit chance",
    "On-hit: 17-25 (+10% bonus AD)(+20% AP)",
  ],
);

const ZeriR = new Ability(
  "Lightning Crash",
  "R",
  "Zeri discharges electricity, dealing magic damage. Burst Fire becomes a triple shot that chains.",
  { cooldown: [120, 105, 90], cooldownType: "standard" },
  { castTime: 0.5 },
  {
    baseDamage: [150, 250, 350],
    bonusAdRatio: 100,
    apRatio: 110,
    damageType: "magic",
  },
  {
    bonusStats: { ms: [2] },
    duration: 10,
  },
  undefined,
  undefined,
  ["Gains 2% MS per stack (max 10 stacks)", "Chains 40% AD to nearby enemies"],
);

const Zeri = new Character(
  "Zeri",
  600, // HP
  3.25, // HP5
  24, // AR
  30, // MR
  56, // AD
  200, // Crit DMG (%)
  330, // MS
  550, // Attack range
  0.658, // Base AS
  [ZeriPassive, ZeriQ, ZeriW, ZeriE, ZeriR],
  [],
);

// Ziggs
const ZiggsPassive = new Ability(
  "Short Fuse",
  "passive",
  "Every 12s, Ziggs' next attack deals bonus magic damage to structures. Abilities reduce CD.",
  { cooldown: [12], cooldownType: "static" },
  undefined,
  {
    baseDamage: [20, 160],
    apRatio: 50,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "20-160 (+50% AP)",
    "75% more damage to structures",
    "Abilities reduce CD by 4-6s",
  ],
);

const ZiggsQ = new Ability(
  "Bouncing Bomb",
  "Q",
  "Ziggs throws a bouncing bomb that deals magic damage.",
  { cooldown: [6, 5.5, 5, 4.5, 4], cooldownType: "standard" },
  { castTime: 0.25, range: 850 },
  {
    baseDamage: [80, 130, 180, 230, 280],
    apRatio: 80,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [],
);

const ZiggsW = new Ability(
  "Satchel Charge",
  "W",
  "Ziggs throws a satchel that detonates, dealing magic damage and knocking enemies away.",
  { cooldown: [20, 18, 16, 14, 12], cooldownType: "standard" },
  { castTime: 0.25, range: 1000 },
  {
    baseDamage: [70, 105, 140, 175, 210],
    apRatio: 50,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  ["Knocks Ziggs away from center", "Can destroy low HP towers"],
);

const ZiggsE = new Ability(
  "Hexplosive Minefield",
  "E",
  "Ziggs scatters proximity mines that detonate on contact, dealing magic damage and slowing.",
  { cooldown: [16, 15, 14, 13, 12], cooldownType: "standard" },
  { castTime: 0.25, range: 900 },
  {
    baseDamage: [30, 70, 110, 150, 190],
    apRatio: 45,
    damageType: "magic",
  },
  {
    slow: [10, 20, 30, 40, 50],
    duration: 1.5,
  },
  undefined,
  undefined,
  ["Mines last 10s"],
);

const ZiggsR = new Ability(
  "Mega Inferno Bomb",
  "R",
  "Ziggs hurls his ultimate bomb, dealing magic damage. Center takes more damage.",
  { cooldown: [120, 105, 90], cooldownType: "standard" },
  { castTime: 0, range: 5300 },
  {
    baseDamage: [300, 500, 700],
    apRatio: 100,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  ["Center: 300-700 (+100% AP)", "Edge: 200-467 (+67% AP)"],
);

const Ziggs = new Character(
  "Ziggs",
  606, // HP
  6.5, // HP5
  21, // AR
  30, // MR
  55, // AD
  200, // Crit DMG (%)
  325, // MS
  550, // Attack range
  0.656, // Base AS
  [ZiggsPassive, ZiggsQ, ZiggsW, ZiggsE, ZiggsR],
  [],
);

// Zilean
const ZileanPassive = new Ability(
  "Time in a Bottle",
  "passive",
  "Zilean stores experience and can grant it to an ally to level them up.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  undefined,
  undefined,
  undefined,
  undefined,
  [
    "Stores 2-12 exp every 5s (scales with rank)",
    "Right-click ally to grant stored exp",
  ],
);

const ZileanQ = new Ability(
  "Time Bomb",
  "Q",
  "Zilean places a bomb that detonates after 3s. Two bombs stun enemies in the blast.",
  { cooldown: [10, 9, 8, 7, 6], cooldownType: "standard" },
  { castTime: 0.25, range: 900 },
  {
    baseDamage: [75, 115, 165, 230, 300],
    apRatio: 90,
    damageType: "magic",
  },
  {
    ccType: "stun",
    ccDuration: 1.3,
  },
  undefined,
  undefined,
  ["Detonates after 3s", "Double bomb: stuns 1.1-1.5s (scales with rank)"],
);

const ZileanW = new Ability(
  "Rewind",
  "W",
  "Zilean reduces his other ability cooldowns by 10 seconds.",
  { cooldown: [14, 12, 10, 8, 6], cooldownType: "standard" },
  { castTime: 0 },
  undefined,
  undefined,
  undefined,
  undefined,
  ["Reduces Q and E CDs by 10s"],
);

const ZileanE = new Ability(
  "Time Warp",
  "E",
  "Zilean grants an ally movement speed or slows an enemy.",
  { cooldown: [15, 14, 13, 12, 11], cooldownType: "standard" },
  { castTime: 0.25, range: 700 },
  undefined,
  {
    bonusStats: { ms: [40, 55, 70, 85, 99] },
    slow: [40, 55, 70, 85, 99],
    duration: 2.5,
  },
  undefined,
  undefined,
  [],
);

const ZileanR = new Ability(
  "Chronoshift",
  "R",
  "Zilean places a rune that revives an ally if they die within duration.",
  { cooldown: [120, 100, 80], cooldownType: "standard" },
  { castTime: 0.25, range: 900 },
  undefined,
  {
    heal: [600, 850, 1100],
    duration: 5,
  },
  undefined,
  undefined,
  ["Revives with 600-1100 (+200% AP) HP after 3s in stasis"],
);

const Zilean = new Character(
  "Zilean",
  574, // HP
  5.5, // HP5
  24, // AR
  30, // MR
  52, // AD
  200, // Crit DMG (%)
  335, // MS
  550, // Attack range
  0.658, // Base AS
  [ZileanPassive, ZileanQ, ZileanW, ZileanE, ZileanR],
  [],
);

// Zoe
const ZoePassive = new Ability(
  "More Sparkles!",
  "passive",
  "After using an ability, Zoe's next attack deals bonus magic damage.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  {
    baseDamage: [16, 130],
    apRatio: 20,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  ["16-130 (+20% AP) based on level"],
);

const ZoeQ = new Ability(
  "Paddle Star",
  "Q",
  "Zoe fires a star that deals increasing magic damage the further it travels.",
  { cooldown: [8.5, 8, 7.5, 7, 6.5], cooldownType: "standard" },
  { castTime: 0.25, range: 800 },
  {
    baseDamage: [2, 50],
    apRatio: 60,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  ["Min: 2-50 (+50-170) (+60% AP)", "Max: +150% damage based on distance"],
);

const ZoeW = new Ability(
  "Spell Thief",
  "W",
  "Zoe picks up spell shards and summoner spells. Casting them grants movement speed and fires missiles.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  {
    baseDamage: [20, 30, 40, 50, 60],
    apRatio: 15,
    damageType: "magic",
  },
  {
    bonusStats: { ms: [30, 40, 50, 60, 70] },
    duration: 2.5,
  },
  undefined,
  undefined,
  ["3 missiles: 20-60 (+15% AP) each", "MS: 30-70% for 2-3s"],
);

const ZoeE = new Ability(
  "Sleepy Trouble Bubble",
  "E",
  "Zoe kicks a bubble that sleeps enemies. Damage wakes them but is increased.",
  { cooldown: [16, 15, 14, 13, 12], cooldownType: "standard" },
  { castTime: 0.25, range: 800 },
  {
    baseDamage: [70, 110, 150, 190, 230],
    apRatio: 45,
    damageType: "magic",
  },
  {
    ccType: "stun",
    ccDuration: 2,
  },
  undefined,
  undefined,
  [
    "Sleeps for 2-2.4s (scales with rank)",
    "Next damage doubled (max 70-230 (+45% AP) true damage)",
  ],
);

const ZoeR = new Ability(
  "Portal Jump",
  "R",
  "Zoe teleports to a nearby position for 1s, then returns.",
  { cooldown: [11, 8, 5], cooldownType: "standard" },
  { castTime: 0, range: 575 },
  undefined,
  {
    duration: 1,
  },
  undefined,
  undefined,
  ["Returns to original position after 1s"],
);

const Zoe = new Character(
  "Zoe",
  630, // HP
  7.5, // HP5
  21, // AR
  30, // MR
  58, // AD
  200, // Crit DMG (%)
  340, // MS
  550, // Attack range
  0.658, // Base AS
  [ZoePassive, ZoeQ, ZoeW, ZoeE, ZoeR],
  [],
);

// Zyra
const ZyraPassive = new Ability(
  "Garden of Thorns",
  "passive",
  "Seeds spawn around Zyra periodically. Abilities near seeds grow Plants.",
  { cooldown: [0], cooldownType: "static" },
  undefined,
  {
    baseDamage: [15, 75],
    apRatio: 20,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  ["Seeds last 30s", "Plants deal 15-75 (+20% AP) and last 8s"],
);

const ZyraQ = new Ability(
  "Deadly Spines",
  "Q",
  "Zyra causes vines to explode into spines, dealing magic damage. Seeds become Thorn Spitters.",
  { cooldown: [7, 6.5, 6, 5.5, 5], cooldownType: "standard" },
  { castTime: 0.625, range: 800 },
  {
    baseDamage: [60, 100, 140, 180, 220],
    apRatio: 65,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  ["Thorn Spitter: 20-100 (+15% AP) per shot"],
);

const ZyraW = new Ability(
  "Rampant Growth",
  "W",
  "Zyra plants a Seed that grants vision when stepped on. Stores 2 charges.",
  { cooldown: [1, 1, 1, 1, 1], cooldownType: "ammo" },
  { castTime: 0, range: 850 },
  undefined,
  undefined,
  2,
  undefined,
  ["Seeds last 60s", "Killing enemies reduces recharge time by 35-100%"],
);

const ZyraE = new Ability(
  "Grasping Roots",
  "E",
  "Zyra sends vines forward, rooting and dealing magic damage. Seeds become Vine Lashers.",
  { cooldown: [12, 11, 10, 9, 8], cooldownType: "standard" },
  { castTime: 0.25, range: 1100 },
  {
    baseDamage: [60, 95, 130, 165, 200],
    apRatio: 60,
    damageType: "magic",
  },
  {
    ccType: "root",
    ccDuration: 1.5,
  },
  undefined,
  undefined,
  ["Root: 1-2s (scales with rank)", "Vine Lasher: slows by 30%"],
);

const ZyraR = new Ability(
  "Stranglethorns",
  "R",
  "Zyra summons vines that knock up enemies after a delay and deal magic damage. Empowers Plants.",
  { cooldown: [130, 120, 110], cooldownType: "standard" },
  { castTime: 0.25, range: 700 },
  {
    baseDamage: [180, 265, 350],
    apRatio: 70,
    damageType: "magic",
  },
  {
    ccType: "knockup",
    ccDuration: 1,
  },
  undefined,
  undefined,
  ["2s delay", "Empowers Plants: +50% damage for 3s"],
);

const Zyra = new Character(
  "Zyra",
  574, // HP
  5.5, // HP5
  29, // AR
  30, // MR
  53, // AD
  200, // Crit DMG (%)
  340, // MS
  575, // Attack range
  0.681, // Base AS
  [ZyraPassive, ZyraQ, ZyraW, ZyraE, ZyraR],
  [],
);

// Exports
export { Character, Ability, Item };
export type {
  ItemStats,
  DamageScaling,
  CooldownInfo,
  CastInfo,
  EffectInfo,
  ScalingValue,
};

// ===== RUNE DEFINITIONS =====

// PRECISION KEYSTONES
const PressTheAttack: Rune = {
  name: "Press the Attack",
  path: "Precision",
  slot: "keystone",
  description:
    "3 consecutive hits deal 40-174 bonus adaptive damage and amplify damage by 8% for 5s",
  effects: [
    {
      type: "onHit",
      trigger: "onThirdHit",
      damage: {
        baseDamage: (level: number) => 40 + ((level - 1) * 134) / 17,
        damageType: "adaptive",
      },
      cooldown: 6,
    },
    {
      type: "statBuff",
      trigger: "onThirdHit",
      statMultiplier: 8, // 8% damage amplification
      cooldown: 6,
    },
  ],
};

const LethalTempo: Rune = {
  name: "Lethal Tempo (sustained avg)",
  path: "Precision",
  slot: "keystone",
  description:
    "Modeled ~62% of max attack speed stacks; bonus-attack damage uses sustained uptime (see DPS breakdown).",
  stats: {
    attackSpeed: 22, // ~62% of 6×6% melee cap — ramp + falloff not snapshot max
  },
  effects: [
    {
      type: "onHit",
      trigger: "perStack",
      damage: {
        baseDamage: (level: number) => 9 + ((level - 1) * 23.47) / 17,
        damageType: "adaptive",
      },
    },
  ],
};

const Conqueror: Rune = {
  name: "Conqueror",
  path: "Precision",
  slot: "keystone",
  description:
    "Stacks to 12 giving 2-4.5 AD/stack. Modeled at ~50% avg uptime in sustained combat.",
  effects: [
    {
      type: "conditional",
      trigger: "conditional",
      statMultiplier: 0,
    },
  ],
  stats: {
    // 12 stacks × 2-4.5 AD per stack (level-scaling), ~50% avg uptime
    // Level 1: 12×2×0.5 = 12 AD, Level 18: 12×4.5×0.5 = 27 AD
    ad: 18,
  },
};

const ConquerorAP: Rune = {
  name: "Conqueror (AP)",
  path: "Precision",
  slot: "keystone",
  description:
    "Stacks to 12 giving 3.3-7.5 AP/stack. Modeled at ~50% avg uptime in sustained combat.",
  stats: {
    // 12 stacks × 3.3-7.5 AP per stack (level-scaling), ~50% avg uptime
    // Level 1: 12×3.3×0.5 ≈ 20 AP, Level 18: 12×7.5×0.5 = 45 AP
    ap: 30,
  },
};

const FleetFootwork: Rune = {
  name: "Fleet Footwork",
  path: "Precision",
  slot: "keystone",
  description: "Energized attacks heal and grant movement speed",
  stats: {}, // Healing only, no DPS contribution
};

// DOMINATION KEYSTONES
const Electrocute: Rune = {
  name: "Electrocute",
  path: "Domination",
  slot: "keystone",
  description: "3 unique hits deal 50-190 (+25% bAD)(+15% AP) adaptive damage",
  effects: [
    {
      type: "onAbilityHit",
      trigger: "on3UniqueHits",
      damage: {
        baseDamage: (level: number) => 50 + ((level - 1) * 140) / 17,
        bonusAdRatio: 25,
        apRatio: 15,
        damageType: "adaptive",
      },
      cooldown: 20,
    },
  ],
};

const DarkHarvest: Rune = {
  name: "Dark Harvest (~5 souls)",
  path: "Domination",
  slot: "keystone",
  description:
    "Damaging low HP champions deals 20-60 (+9/soul)(+25% bAD)(+15% AP) adaptive. Modeled at ~5 souls.",
  effects: [
    {
      type: "onAbilityHit",
      trigger: "conditional",
      damage: {
        baseDamage: (level: number) => 20 + ((level - 1) * 40) / 17 + 9 * 5,
        bonusAdRatio: 25,
        apRatio: 15,
        damageType: "adaptive",
      },
      cooldown: 45,
      conditions: [
        {
          type: "targetHealthPercent",
          threshold: 50,
          operator: "<",
        },
      ],
    },
  ],
};

const HailOfBlades: Rune = {
  name: "Hail of Blades",
  path: "Domination",
  slot: "keystone",
  description:
    "140% AS for first 3 attacks — modeled as ~30% avg AS over short trades",
  stats: { attackSpeed: 30 },
};

// SORCERY KEYSTONES
const ArcaneComet: Rune = {
  name: "Arcane Comet",
  path: "Sorcery",
  slot: "keystone",
  description: "Abilities hurl a comet dealing 30-130 damage",
  effects: [
    {
      type: "onAbilityHit",
      trigger: "on3UniqueHits",
      damage: {
        baseDamage: (level: number) => 30 + ((level - 1) * 100) / 17,
        bonusAdRatio: 10,
        apRatio: 5,
        damageType: "adaptive",
      },
      cooldown: 14, // Average of 20-8s with CDR
    },
  ],
};

const SummonAery: Rune = {
  name: "Summon Aery",
  path: "Sorcery",
  slot: "keystone",
  description: "Damaging deals 10-50 bonus damage, shielding grants shield",
  effects: [
    {
      type: "onAbilityHit",
      trigger: "onAttack",
      damage: {
        baseDamage: (level: number) => 10 + ((level - 1) * 40) / 17,
        bonusAdRatio: 10,
        apRatio: 5,
        damageType: "adaptive",
      },
      cooldown: 2, // Average return time
    },
  ],
};

const PhaseRush: Rune = {
  name: "Phase Rush",
  path: "Sorcery",
  slot: "keystone",
  description: "Hitting 3 times grants movement speed",
  stats: {}, // Utility only, no DPS
};

// RESOLVE KEYSTONES
const GraspOfTheUndying: Rune = {
  name: "Grasp of the Undying",
  path: "Resolve",
  slot: "keystone",
  description: "Every 4s, next attack deals 4% max HP magic damage",
  effects: [
    {
      type: "onHit",
      trigger: "conditional",
      damage: {
        maxHealthRatio: 4,
        damageType: "magic",
      },
      cooldown: 4,
    },
  ],
};

const Aftershock: Rune = {
  name: "Aftershock",
  path: "Resolve",
  slot: "keystone",
  description: "Immobilizing enemy deals 25-120 + 8% bonus HP magic damage",
  effects: [
    {
      type: "onAbilityHit",
      trigger: "conditional",
      damage: {
        baseDamage: (level: number) => 25 + ((level - 1) * 95) / 17,
        bonusHPRatio: 8,
        damageType: "magic",
      },
      cooldown: 20,
    },
  ],
};

const Guardian: Rune = {
  name: "Guardian",
  path: "Resolve",
  slot: "keystone",
  description: "Shield nearby ally when in danger",
  stats: {}, // Shield only, no DPS
};

// INSPIRATION KEYSTONES
const FirstStrike: Rune = {
  name: "First Strike",
  path: "Inspiration",
  slot: "keystone",
  description:
    "7% bonus true damage while active (~5s, 12s CD) — not a flat % amp on all damage",
  effects: [
    {
      type: "conditional",
      trigger: "conditional",
      statMultiplier: 7, // 7% damage increase
      cooldown: 12, // Average of 15-9s
    },
  ],
};

const GlacialAugment: Rune = {
  name: "Glacial Augment",
  path: "Inspiration",
  slot: "keystone",
  description: "Immobilizing enemies creates slowing zones",
  stats: {}, // Utility only, no DPS
};

const UnsealedSpellbook: Rune = {
  name: "Unsealed Spellbook",
  path: "Inspiration",
  slot: "keystone",
  description: "Swap summoner spells",
  stats: {}, // Utility only, no DPS
};

// Collection of all keystones for meta build testing
export const AllKeystones: Rune[] = [
  // Precision
  PressTheAttack,
  LethalTempo,
  Conqueror,
  ConquerorAP,
  FleetFootwork,
  // Domination
  Electrocute,
  DarkHarvest,
  HailOfBlades,
  // Sorcery
  ArcaneComet,
  SummonAery,
  PhaseRush,
  // Resolve
  GraspOfTheUndying,
  Aftershock,
  Guardian,
  // Inspiration
  FirstStrike,
  GlacialAugment,
  UnsealedSpellbook,
];

// MINOR RUNES - PRECISION
const Triumph: Rune = {
  name: "Triumph",
  path: "Precision",
  slot: "slot1",
  description: "Takedowns restore HP and grant gold",
  stats: {}, // Healing only
};

const PresenceOfMind: Rune = {
  name: "Presence of Mind",
  path: "Precision",
  slot: "slot1",
  description: "Takedowns restore mana/energy and increase max mana",
  stats: {}, // Mana only
};

const Overheal: Rune = {
  name: "Overheal",
  path: "Precision",
  slot: "slot1",
  description: "Excess healing converts to shield",
  stats: {}, // Defensive only
};

const LegendAlacrity: Rune = {
  name: "Legend: Alacrity (avg stacks)",
  path: "Precision",
  slot: "slot2",
  description: "~68% of max Legend stacks for sustained 1v1",
  stats: {
    attackSpeed: 12,
  },
};

const LegendHaste: Rune = {
  name: "Legend: Haste (avg stacks)",
  path: "Precision",
  slot: "slot2",
  description: "~68% of max Legend stacks for sustained 1v1",
  stats: {
    abilityHaste: 14,
  },
};

const LegendBloodline: Rune = {
  name: "Legend: Bloodline (avg stacks)",
  path: "Precision",
  slot: "slot2",
  description: "~68% of max Legend stacks for sustained 1v1",
  stats: {
    lifeSteal: 6,
  },
};

const CoupDeGrace: Rune = {
  name: "Coup de Grace",
  path: "Precision",
  slot: "slot3",
  description: "Deal 8% more damage to champions below 40% HP",
  effects: [
    {
      type: "conditional",
      trigger: "conditional",
      statMultiplier: 8,
      conditions: [
        {
          type: "targetHealthPercent",
          threshold: 40,
          operator: "<",
        },
      ],
    },
  ],
};

const CutDown: Rune = {
  name: "Cut Down",
  path: "Precision",
  slot: "slot3",
  description: "5-12% more damage to high HP targets",
  effects: [
    {
      type: "conditional",
      trigger: "conditional",
      statMultiplier: 8,
      conditions: [
        {
          type: "targetHealthDifference",
          threshold: 1000,
          operator: ">",
        },
      ],
    },
  ],
};

const LastStand: Rune = {
  name: "Last Stand",
  path: "Precision",
  slot: "slot3",
  description: "Deal up to 11% more damage when low HP",
  effects: [
    {
      type: "conditional",
      trigger: "conditional",
      statMultiplier: 5.5, // Average of 0-11%
    },
  ],
};

// MINOR RUNES - DOMINATION
const CheapShot: Rune = {
  name: "Cheap Shot",
  path: "Domination",
  slot: "slot1",
  description: "Deal 10-45 true damage to CC'd champions",
  effects: [
    {
      type: "onHit",
      trigger: "conditional",
      damage: {
        baseDamage: (level: number) => 10 + ((level - 1) * 35) / 17,
        damageType: "true",
      },
      cooldown: 4,
    },
  ],
};

const TasteOfBlood: Rune = {
  name: "Taste of Blood",
  path: "Domination",
  slot: "slot1",
  description: "Heal when damaging champions",
  stats: {}, // Healing only
};

const SuddenImpact: Rune = {
  name: "Sudden Impact",
  path: "Domination",
  slot: "slot1",
  description: "9 Lethality + 7 Magic Pen after dash/blink for 5s",
  stats: {
    lethality: 9,
    flatMagicPen: 7,
  },
};

const ZombieWard: Rune = {
  name: "Zombie Ward",
  path: "Domination",
  slot: "slot2",
  description: "Gain adaptive force from zombie wards",
  stats: {
    ad: 6,
  },
};

const GhostPoro: Rune = {
  name: "Ghost Poro",
  path: "Domination",
  slot: "slot2",
  description: "Gain adaptive force from ghost poros",
  stats: {
    ad: 8,
  },
};

const EyeballCollection: Rune = {
  name: "Eyeball Collection (avg stacks)",
  path: "Domination",
  slot: "slot2",
  description: "~58% of max stacks — typical mid-duel value, not full 10",
  stats: {
    ad: 10,
  },
};

const EyeballCollectionAP: Rune = {
  name: "Eyeball Collection (avg stacks, AP)",
  path: "Domination",
  slot: "slot2",
  description: "~58% of max stacks — typical mid-duel value, not full 10",
  stats: {
    ap: 17,
  },
};

const TreasureHunter: Rune = {
  name: "Treasure Hunter",
  path: "Domination",
  slot: "slot3",
  description: "Gain gold from unique takedowns",
  stats: {}, // Gold only
};

const IngeniousHunter: Rune = {
  name: "Ingenious Hunter",
  path: "Domination",
  slot: "slot3",
  description: "Item haste from unique takedowns",
  stats: {}, // Item haste only
};

const RelentlessHunter: Rune = {
  name: "Relentless Hunter",
  path: "Domination",
  slot: "slot3",
  description: "Out of combat movement speed",
  stats: {}, // Movement speed only
};

const UltimateHunter: Rune = {
  name: "Ultimate Hunter (avg stacks)",
  path: "Domination",
  slot: "slot3",
  description: "~65% of max unique takedown stacks for ult haste",
  stats: {
    ultAbilityHaste: 20,
  },
};

// MINOR RUNES - SORCERY
const NullifyingOrb: Rune = {
  name: "Nullifying Orb",
  path: "Sorcery",
  slot: "slot1",
  description: "Magic damage shield when low HP",
  stats: {}, // Shield only
};

const ManaflowBand: Rune = {
  name: "Manaflow Band",
  path: "Sorcery",
  slot: "slot1",
  description: "Gain max mana and mana regen",
  stats: {
    mana: 250,
  },
};

const NimbusCloak: Rune = {
  name: "Nimbus Cloak",
  path: "Sorcery",
  slot: "slot1",
  description: "Movement speed after summoner spell",
  stats: {}, // Movement speed only
};

const Transcendence: Rune = {
  name: "Transcendence",
  path: "Sorcery",
  slot: "slot2",
  description: "10 ability haste at level 8",
  stats: {
    abilityHaste: 10,
  },
};

const Celerity: Rune = {
  name: "Celerity",
  path: "Sorcery",
  slot: "slot2",
  description: "7% bonus movement speed",
  stats: {
    msPercent: 7,
  },
};

const AbsoluteFocus: Rune = {
  name: "Absolute Focus",
  path: "Sorcery",
  slot: "slot2",
  description: "18 adaptive force when above 70% HP",
  stats: {
    ad: 10.8, // Average uptime (or ap: 18)
  },
};

const Scorch: Rune = {
  name: "Scorch",
  path: "Sorcery",
  slot: "slot3",
  description: "Abilities burn enemies for 20-60 damage",
  effects: [
    {
      type: "onAbilityHit",
      trigger: "onAttack",
      damage: {
        baseDamage: (level: number) => 20 + ((level - 1) * 40) / 17,
        damageType: "adaptive",
      },
      cooldown: 10,
    },
  ],
};

const Waterwalking: Rune = {
  name: "Waterwalking",
  path: "Sorcery",
  slot: "slot3",
  description: "Movement speed and adaptive force in river",
  stats: {}, // Situational
};

const GatheringStorm: Rune = {
  name: "Gathering Storm",
  path: "Sorcery",
  slot: "slot3",
  description: "Scaling adaptive force over time",
  stats: {
    ad: 14.4, // 30 min value (or ap: 24)
  },
};

// MINOR RUNES - RESOLVE
const Demolish: Rune = {
  name: "Demolish",
  path: "Resolve",
  slot: "slot1",
  description: "Charge up damage to towers",
  stats: {}, // Tower damage only
};

const FontOfLife: Rune = {
  name: "Font of Life",
  path: "Resolve",
  slot: "slot1",
  description: "Mark enemies for ally healing",
  stats: {}, // Ally healing only
};

const ShieldBash: Rune = {
  name: "Shield Bash",
  path: "Resolve",
  slot: "slot1",
  description: "Shields grant bonus resistances and damage",
  stats: {}, // Situational
};

const Conditioning: Rune = {
  name: "Conditioning",
  path: "Resolve",
  slot: "slot2",
  description: "18 armor and MR after 12 min",
  stats: {
    armor: 18,
    mr: 18,
  },
};

const SecondWind: Rune = {
  name: "Second Wind",
  path: "Resolve",
  slot: "slot2",
  description: "Heal after taking damage",
  stats: {}, // Healing only
};

const BonePlating: Rune = {
  name: "Bone Plating",
  path: "Resolve",
  slot: "slot2",
  description: "Reduce damage from consecutive attacks",
  stats: {}, // Damage reduction
};

const Overgrowth: Rune = {
  name: "Overgrowth (120 CS)",
  path: "Resolve",
  slot: "slot3",
  description: "Gain max HP from minions/monsters",
  stats: {
    hp: 120, // 120 CS = 120 HP
  },
};

const Revitalize: Rune = {
  name: "Revitalize",
  path: "Resolve",
  slot: "slot3",
  description: "Increase healing and shielding",
  stats: {}, // Healing/shield amp
};

const Unflinching: Rune = {
  name: "Unflinching",
  path: "Resolve",
  slot: "slot3",
  description: "Tenacity and slow resist when low HP",
  stats: {}, // Tenacity only
};

// MINOR RUNES - INSPIRATION
const HextechFlashtraption: Rune = {
  name: "Hextech Flashtraption",
  path: "Inspiration",
  slot: "slot1",
  description: "Channel to blink to a location",
  stats: {}, // Utility only
};

const MagicalFootwear: Rune = {
  name: "Magical Footwear",
  path: "Inspiration",
  slot: "slot1",
  description: "Free boots at 12 min",
  stats: {}, // Gold value only
};

const CashBack: Rune = {
  name: "Cash Back",
  path: "Inspiration",
  slot: "slot1",
  description: "Refund gold on item purchases",
  stats: {}, // Gold only
};

const TripleTonicPerfectTiming: Rune = {
  name: "Perfect Timing",
  path: "Inspiration",
  slot: "slot2",
  description: "Free Stopwatch at 14 min",
  stats: {}, // Item value only
};

const FuturesMarket: Rune = {
  name: "Future's Market",
  path: "Inspiration",
  slot: "slot2",
  description: "Go into debt to buy items",
  stats: {}, // Gold only
};

const MinionDematerializer: Rune = {
  name: "Minion Dematerializer",
  path: "Inspiration",
  slot: "slot2",
  description: "Execute minions and gain damage vs type",
  stats: {}, // Minion damage only
};

const CosmicInsight: Rune = {
  name: "Cosmic Insight",
  path: "Inspiration",
  slot: "slot3",
  description: "18 summoner spell haste and item haste",
  stats: {}, // Summoner/item haste
};

const ApproachVelocity: Rune = {
  name: "Approach Velocity",
  path: "Inspiration",
  slot: "slot3",
  description: "Movement speed toward impaired allies/enemies",
  stats: {}, // Movement speed
};

const JackOfAllTrades: Rune = {
  name: "Jack of All Trades",
  path: "Inspiration",
  slot: "slot3",
  description: "Gain adaptive force from item diversity",
  stats: {
    ad: 8, // Average (or ap: 13)
  },
};

// STAT SHARDS
const AdaptiveForceOffensive: Rune = {
  name: "Adaptive Force (Offense)",
  path: null,
  slot: "statShard1",
  description: "5.4 AD or 9 AP",
  stats: {
    ad: 5.4, // OR ap: 9 - choose based on build
  },
};

const AdaptiveForceOffensiveAP: Rune = {
  name: "Adaptive Force (Offense, AP)",
  path: null,
  slot: "statShard1",
  description: "5.4 AD or 9 AP",
  stats: {
    ap: 9,
  },
};

const AttackSpeedShard: Rune = {
  name: "Attack Speed",
  path: null,
  slot: "statShard1",
  description: "10% attack speed",
  stats: {
    attackSpeed: 10,
  },
};

const AbilityHasteShard: Rune = {
  name: "Ability Haste",
  path: null,
  slot: "statShard1",
  description: "8 ability haste",
  stats: {
    abilityHaste: 8,
  },
};

const AdaptiveForceFlexAD: Rune = {
  name: "Adaptive Force (Flex)",
  path: null,
  slot: "statShard2",
  description: "5.4 AD or 9 AP",
  stats: {
    ad: 5.4,
  },
};

const AdaptiveForceFlexAP: Rune = {
  name: "Adaptive Force (Flex, AP)",
  path: null,
  slot: "statShard2",
  description: "5.4 AD or 9 AP",
  stats: {
    ap: 9,
  },
};

const MovementSpeedShard: Rune = {
  name: "Movement Speed",
  path: null,
  slot: "statShard2",
  description: "2% movement speed",
  stats: {
    msPercent: 2,
  },
};

const HealthShard: Rune = {
  name: "Health",
  path: null,
  slot: "statShard2",
  description: "65 health",
  stats: {
    hp: 65,
  },
};

const HealthDefensive: Rune = {
  name: "Health (Defensive)",
  path: null,
  slot: "statShard3",
  description: "65 health",
  stats: {
    hp: 65,
  },
};

const TenacityShard: Rune = {
  name: "Tenacity",
  path: null,
  slot: "statShard3",
  description: "10% tenacity and slow resist",
  stats: {}, // Tenacity - not modeled in DPS
};

const HealthScalingShard: Rune = {
  name: "Health Scaling",
  path: null,
  slot: "statShard3",
  description: "15-140 HP based on level",
  stats: {
    hp: 140, // Level 18 value
  },
};

// Base mana values from Data Dragon (level 1). Only set for actual mana users.
const CHAMPION_BASE_MANA: Record<string, number> = {
  Ahri: 418, Akshan: 350, Alistar: 350, Amumu: 285, Anivia: 495, Annie: 418,
  Aphelios: 348, Ashe: 280, "Aurelion Sol": 530, Aurora: 475, Azir: 320,
  Bard: 350, Blitzcrank: 267, Brand: 469, Braum: 311, Caitlyn: 315,
  Camille: 339, Cassiopeia: 480, "Cho'Gath": 270, Corki: 350, Darius: 263,
  Diana: 375, Draven: 361, Ekko: 280, Elise: 324, Evelynn: 315, Ezreal: 375,
  Fiddlesticks: 500, Fiora: 300, Fizz: 317, Galio: 410, Gangplank: 280,
  Gragas: 400, Graves: 325, Gwen: 330, Hecarim: 280, Heimerdinger: 385,
  Hwei: 480, Illaoi: 350, Irelia: 350, Ivern: 450, Janna: 360,
  "Jarvan IV": 300, Jax: 339, Jayce: 375, Jhin: 300, Jinx: 260,
  "Kai'Sa": 345, Kalista: 300, Karma: 374, Karthus: 467, Kassadin: 400,
  Kayle: 330, Kayn: 410, Kindred: 300, "Kog'Maw": 325, "K'Sante": 320,
  LeBlanc: 400, Leona: 302, Lillia: 410, Lissandra: 475, Lucian: 320,
  Lulu: 350, Lux: 440, Malphite: 280, Malzahar: 375, Maokai: 375,
  "Master Yi": 251, Mel: 480, Milio: 365, "Miss Fortune": 300, Morgana: 340,
  Naafiri: 400, Nami: 365, Nasus: 326, Nautilus: 400, Neeko: 450,
  Nidalee: 295, Nilah: 350, Nocturne: 275, "Nunu & Willump": 280, Olaf: 316,
  Orianna: 418, Ornn: 341, Pantheon: 317, Poppy: 280, Pyke: 415,
  Qiyana: 375, Quinn: 269, Rakan: 315, Rammus: 310, Rell: 320,
  "Renata Glasc": 350, Ryze: 300, Samira: 349, Sejuani: 400, Senna: 350,
  Seraphine: 360, Shaco: 297, Singed: 330, Sion: 400, Sivir: 340,
  Skarner: 320, Smolder: 300, Sona: 340, Soraka: 425, Swain: 400,
  Sylas: 400, Syndra: 480, "Tahm Kench": 325, Taliyah: 470, Talon: 400,
  Taric: 300, Teemo: 334, Thresh: 274, Tristana: 300, Trundle: 340,
  "Twisted Fate": 333, Twitch: 300, Udyr: 271, Urgot: 340, Varus: 320,
  Vayne: 232, Veigar: 490, "Vel'Koz": 469, Vex: 490, Vi: 295, Viktor: 405,
  Volibear: 350, Warwick: 280, Wukong: 330, Xayah: 340, Xerath: 400,
  "Xin Zhao": 274, Yorick: 300, Yunara: 275, Yuumi: 440, Zaahen: 350,
  Zeri: 250, Ziggs: 480, Zilean: 452, Zoe: 425, Zyra: 418,
};

// Export arrays for easy import
export const Characters: Character[] = [
  Aatrox,
  Ahri,
  Akali,
  Akshan,
  Alistar,
  Ambessa,
  Amumu,
  Anivia,
  Annie,
  Aphelios,
  Ashe,
  AurelionSol,
  Aurora,
  Azir,
  Bard,
  BelVeth,
  Blitzcrank,
  Brand,
  Braum,
  Briar,
  Caitlyn,
  Camille,
  Cassiopeia,
  ChoGath,
  Corki,
  Darius,
  Diana,
  DrMundo,
  Draven,
  Ekko,
  Elise,
  Evelynn,
  Ezreal,
  Fiddlesticks,
  Fiora,
  Fizz,
  Galio,
  Gangplank,
  Garen,
  Gnar,
  Gragas,
  Graves,
  Gwen,
  Hecarim,
  Heimerdinger,
  Hwei,
  Illaoi,
  Irelia,
  Ivern,
  Janna,
  JarvanIV,
  Jax,
  Jayce,
  Jhin,
  Jinx,
  KSante,
  KaiSa,
  Kalista,
  Karma,
  Karthus,
  Kassadin,
  Katarina,
  Kayle,
  Kayn,
  Kennen,
  KhaZix,
  Kindred,
  Kled,
  KogMaw,
  LeBlanc,
  LeeSin,
  Leona,
  Lillia,
  Lissandra,
  Lucian,
  Lulu,
  Lux,
  Malphite,
  Malzahar,
  Maokai,
  MasterYi,
  Mel,
  Milio,
  MissFortune,
  Mordekaiser,
  Morgana,
  Naafiri,
  Nami,
  Nasus,
  Nautilus,
  Neeko,
  Nidalee,
  Nilah,
  Nocturne,
  Nunu,
  Olaf,
  Orianna,
  Ornn,
  Pantheon,
  Poppy,
  Pyke,
  Qiyana,
  Quinn,
  Rakan,
  Rammus,
  RekSai,
  Rell,
  Renata,
  Renekton,
  Rengar,
  Riven,
  Rumble,
  Ryze,
  Samira,
  Sejuani,
  Senna,
  Seraphine,
  Sett,
  Shaco,
  Shen,
  Shyvana,
  Singed,
  Sion,
  Sivir,
  Skarner,
  Smolder,
  Sona,
  Soraka,
  Swain,
  Sylas,
  Syndra,
  TahmKench,
  Taliyah,
  Talon,
  Taric,
  Teemo,
  Thresh,
  Tristana,
  Trundle,
  Tryndamere,
  TwistedFate,
  Twitch,
  Udyr,
  Urgot,
  Varus,
  Vayne,
  Veigar,
  VelKoz,
  Vex,
  Vi,
  Viego,
  Viktor,
  Vladimir,
  Volibear,
  Warwick,
  Wukong,
  Xayah,
  Xerath,
  XinZhao,
  Yasuo,
  Yone,
  Yorick,
  Yuumi,
  Yunara,
  Zaahen,
  Zac,
  Zed,
  Zeri,
  Ziggs,
  Zilean,
  Zoe,
  Zyra,
];

// Apply base mana from Data Dragon to all mana-using champions
for (const champ of Characters) {
  const bm = CHAMPION_BASE_MANA[champ.Name];
  if (bm !== undefined) champ.BaseMana = bm;
}

export const Items: Item[] = [
  AbyssalMask,
  AbyssalMaskDistanced,
  Actualizer,
  ArchangelsStaff,
  ArchangelsStaffMaxStacks,
  ArdentCenser,
  ArdentCenserSanctify,
  AxiomArc,
  Bandlepipes,
  BandlepipesFanfareMelee,
  BandlepipesFanfareRanged,
  BansheesVeil,
  Bastionbreaker,
  BastionbreakerShapedChargeMelee,
  BastionbreakerShapedChargeRanged,
  BlackCleaver,
  BlackCleaverCarve,
  BlackCleaverFervor,
  BlackCleaverCarveFervor,
  BlackfireTorch,
  BlackfireTorch1Stack,
  BlackfireTorch3Stacks,
  BlackfireTorch5Stacks,
  BladeOfTheRuinedKing,
  BladeOfTheRuinedKingMelee,
  BladeOfTheRuinedKingRanged,
  BloodlettersCurse,
  BloodlettersCurse1Stack,
  BloodlettersCurse2Stacks,
  BloodlettersCurse3Stacks,
  BloodlettersCurse4Stacks,
  BountyOfWorlds,
  Bloodsong,
  BloodsongSpellblade,
  BloodsongExposeWeaknessMelee,
  BloodsongExposeWeaknessRanged,
  Bloodthirster,
  CelestialOpposition,
  ChempunkChainsword,
  CosmicDrive,
  CosmicDriveSpelldance,
  Cryptbloom,
  Dawncore,
  DeadMansPlate,
  DeadMansPlateFullMomentum,
  DeathsDance,
  DiademOfSongs,
  DreamMaker,
  DuskAndDawn,
  DuskAndDawnSpellblade,
  EchoesOfHelia,
  Eclipse,
  EdgeOfNight,
  EndlessHunger,
  EndlessHungerFeast,
  EssenceReaver,
  EssenceReaverSpellblade,
  ExperimentalHexplate,
  FiendhunterBolts,
  Fimbulwinter,
  ForceOfNature,
  ForceOfNatureMaxStacks,
  FrozenHeart,
  GuardianAngel,
  GuinsoosRageblade,
  GuinsoosRagebladeMaxStacks,
  Heartsteel,
  HeartsteelConsumption,
  Heartsteel500Stacks,
  HexopticsC44,
  HexopticsC44ArcaneAim,
  HextechGunblade,
  HextechRocketbelt,
  HollowRadiance,
  HorizonFocus,
  HorizonFocusHypershot,
  Hubris,
  Hubris5Stacks,
  Hubris10Stacks,
  Hubris20Stacks,
  Hullbreaker,
  HullbreakerSkipperMelee,
  HullbreakerSkipperRanged,
  IcebornGauntlet,
  IcebornGauntletSpellblade,
  ImmortalShieldbow,
  ImperialMandate,
  InfinityEdge,
  JakSho,
  KaenicRookern,
  KnightsVow,
  KrakenSlayer,
  KrakenSlayerMeleeProc,
  KrakenSlayerRangedProc,
  LiandrysTorment,
  LocketOfTheIronSolari,
  LichBane,
  LichBaneSpellblade,
  LordDominiksRegards,
  LudensEcho,
  Malignance,
  Manamune,
  MawOfMalmortius,
  MawOfMalmortiusLifeline,
  MejaisSoulstealer,
  MejaisSoulstealer10Stacks,
  MejaisSoulstealer25Stacks,
  MercurialScimitar,
  MikaelsBlessing,
  MoonstoneRenewer,
  Morellonomicon,
  MortalReminder,
  MuramanaMelee,
  MuramanaRanged,
  NashorsTooth,
  NavoriFlickerblade,
  OverlordsBloodmail,
  OverlordsBloodmail25MissingHP,
  OverlordsBloodmail50MissingHP,
  OverlordsBloodmail75MissingHP,
  OverlordsBloodmail100MissingHP,
  PhantomDancer,
  ProfaneHydraMelee,
  ProfaneHydraRanged,
  ProtoplasmHarness,
  RabadonsDeathcap,
  RanduinsOmen,
  RapidFirecannon,
  RavenousHydraMelee,
  RavenousHydraRanged,
  Redemption,
  Riftmaker,
  RiftmakerMaxStacksMelee,
  RiftmakerMaxStacksRanged,
  RodOfAges,
  RodOfAgesMaxStacks,
  RunaansHurricane,
  RylaisCrystalScepter,
  SerpentsFang,
  SeryldasGrudge,
  Shadowflame,
  ShurelyasBattlesong,
  SolsticeSleigh,
  SpearOfShojin,
  SpearOfShojinMaxStacks,
  SpectralCutlass,
  SpiritVisage,
  StaffOfFlowingWater,
  StatikkShiv,
  SteraksGage,
  StormrazorMelee,
  StormrazorRanged,
  Stormsurge,
  StridebreakerMelee,
  StridebreakerRanged,
  SunderedSky,
  SunfireAegis,
  Terminus,
  TerminusMaxStacks,
  TheCollector,
  Thornmail,
  TitanicHydra,
  Trailblazer,
  TrinityForce,
  TrinityForceSpellblade,
  UmbralGlaive,
  UmbralGlaiveNightstalker,
  UnendingDespair,
  VoidStaff,
  VoltaicCyclosword,
  WarmogsArmor,
  WhisperingCirclet,
  WintersApproach,
  WitsEnd,
  YoumuusGhostblade,
  YunTalWildarrows,
  YunTalWildarrowsMeleeMax,
  YunTalWildarrowsRangedMax,
  ZazzaksRealmspike,
  ZekesConvergence,
  ZhonyasHourglass,
  SeraphsEmbrace,
];
