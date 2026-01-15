type ScalingValue = number | number[] | ((level: number) => number);

interface DamageScaling {
  baseDamage?: ScalingValue;
  adRatio?: ScalingValue;
  apRatio?: ScalingValue;
  bonusAdRatio?: ScalingValue;
  maxHealthRatio?: ScalingValue;
  damageType: "physical" | "magic" | "true";
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

class Ability {
  name: string;
  abilityType: "passive" | "Q" | "W" | "E" | "R";
  description: string;
  cooldown: CooldownInfo;
  castInfo?: CastInfo;
  damage?: DamageScaling;
  effects?: EffectInfo;
  maxCasts?: number;
  recastWindow?: number;
  specialMechanics?: string[];

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
    specialMechanics?: string[]
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
    targetAP: number = 0
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

// Aatrox's Abilities
const AatroxPassive = new Ability(
  "Deathbringer Stance",
  "passive",
  "Periodically empowers basic attack with bonus range and damage based on target's max HP",
  {
    cooldown: (level: number) => 22 - ((level - 1) * 12) / 17, // 22 at level 1, 10 at level 18
    staticCooldown: 22,
    cooldownType: "static",
  },
  {
    range: 225, // 175 base + 50 bonus range
  },
  {
    baseDamage: (level: number) => 100 + ((level - 1) * 220) / 17, // 100 at lvl 1, 320 at lvl 18
    maxHealthRatio: (level: number) => 4 + ((level - 1) * 4) / 17, // 4% at lvl 1, 8% at lvl 18
    damageType: "magic",
  },
  {
    heal: 100, // Heals for 100% of post-mitigation damage dealt (25% vs minions)
  },
  undefined,
  undefined,
  [
    "Cooldown reduced by 2s on champion/large monster hit",
    "Reduced by 4s on Q sweetspot hit",
  ]
);

// Q ability - Cast 1
const AatroxQ1 = new Ability(
  "The Darkin Blade - First Cast",
  "Q",
  "First strike in rectangular area. Sweetspot at farthest edge deals 70% bonus damage and knocks up.",
  {
    cooldown: [14, 12, 10, 8, 6],
    cooldownType: "standard",
  },
  {
    castTime: 0.6,
    range: 625,
  },
  {
    baseDamage: [10, 25, 40, 55, 70],
    adRatio: [60, 67.5, 75, 82.5, 90],
    damageType: "physical",
  },
  {
    ccType: "knockup",
    ccDuration: 0.25,
  },
  3,
  4,
  [
    "70% bonus damage on sweetspot",
    "625x180 unit rectangular area",
    "1s static cooldown between casts",
  ]
);

// Q ability - Cast 2
const AatroxQ2 = new Ability(
  "The Darkin Blade - Second Cast",
  "Q",
  "Second strike in trapezoidal area. 25% more damage than first cast.",
  {
    cooldown: [14, 12, 10, 8, 6],
    cooldownType: "standard",
  },
  {
    castTime: 0.6,
    range: 475,
  },
  {
    baseDamage: [12.5, 31.25, 50, 68.75, 87.5],
    adRatio: [75, 84.375, 93.75, 103.125, 112.5],
    damageType: "physical",
  },
  {
    ccType: "knockup",
    ccDuration: 0.25,
  },
  3,
  4,
  [
    "70% bonus damage on sweetspot",
    "Trapezoidal area 300-500 units wide",
    "25% more damage than cast 1",
  ]
);

// Q ability - Cast 3
const AatroxQ3 = new Ability(
  "The Darkin Blade - Third Cast",
  "Q",
  "Third strike in circular area. 50% more damage than first cast.",
  {
    cooldown: [14, 12, 10, 8, 6],
    cooldownType: "standard",
  },
  {
    castTime: 0.6,
    radius: 300,
  },
  {
    baseDamage: [15, 37.5, 60, 82.5, 105],
    adRatio: [90, 101.25, 112.5, 123.75, 135],
    damageType: "physical",
  },
  {
    ccType: "knockup",
    ccDuration: 0.25,
  },
  3,
  4,
  [
    "70% bonus damage on sweetspot",
    "300-radius circular area",
    "50% more damage than cast 1",
  ]
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
    adRatio: [40, 40, 40, 40, 40],
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
  ]
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
  ]
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
    ccType: "fear",
    ccDuration: 3,
    bonusStats: {
      ad: [20, 30, 40], // % of AD
      ms: [60, 80, 100], // % bonus MS
    },
  },
  undefined,
  undefined,
  [
    "Extends 5s on takedown",
    "50/75/100% increased self-healing",
    "Ghosted",
    "5% increased size",
  ]
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
  magicPen?: number;
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
    groupName?: string
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
  "Abyssal Mask"
);

const AbyssalMaskDistanced = new Item(
  "Abyssal Mask (Distanced)",
  {
    abilityHaste: 15,
    mr: 45,
    hp: 350,
  },
  [],
  "Abyssal Mask"
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
  "Actualizer"
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
  "Manaflow"
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
  "Manaflow"
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
  "Lifeline"
);

const ArdentCenser = new Item(
  "Ardent Censer",
  {
    ap: 45,
    manaRegen: 125,
    msPercent: 4,
  },
  [],
  "Ardent Censer"
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
  "Ardent Censer"
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
  "Axiom Arc"
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
  "Bandlepipes"
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
  "Bandlepipes"
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
  "Bandlepipes"
);

const BansheesVeil = new Item(
  "Banshee's Veil",
  {
    ap: 105,
    mr: 40,
  },
  [],
  "Annul"
);

const Bastionbreaker = new Item(
  "Bastionbreaker",
  {
    ad: 55,
    abilityHaste: 15,
    lethality: 22,
  },
  [],
  "Bastionbreaker"
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
  "Bastionbreaker"
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
  "Bastionbreaker"
);

const BlackCleaver = new Item(
  "Black Cleaver",
  {
    ad: 40,
    abilityHaste: 20,
    hp: 400,
  },
  [],
  "Fatality"
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
  "Fatality"
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
  "Fatality"
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
  "Fatality"
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
  "Blackfire Torch"
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
  "Blackfire Torch"
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
  "Blackfire Torch"
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
  "Blackfire Torch"
);

const BladeOfTheRuinedKing = new Item(
  "Blade of the Ruined King",
  {
    ad: 40,
    attackSpeed: 25,
    lifeSteal: 10,
  },
  [],
  "Blade of the Ruined King"
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
  "Blade of the Ruined King"
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
  "Blade of the Ruined King"
);

const BloodlettersCurse = new Item(
  "Bloodletter's Curse",
  {
    ap: 65,
    abilityHaste: 15,
    hp: 400,
  },
  [],
  "Blight"
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
  "Blight"
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
  "Blight"
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
  "Blight"
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
  "Blight"
);

const BountyOfWorlds = new Item(
  "Bounty of Worlds",
  {
    hp: 200,
    healthRegen: 75,
    manaRegen: 75,
  },
  [],
  "Support / Jungle"
);

const CelestialOpposition = new Item(
  "Celestial Opposition",
  {
    hp: 200,
    healthRegen: 75,
    manaRegen: 75,
  },
  [],
  "Support / Jungle"
);

const DreamMaker = new Item(
  "Dream Maker",
  {
    hp: 200,
    healthRegen: 75,
    manaRegen: 75,
  },
  [],
  "Support / Jungle"
);

const ImperialMandate = new Item(
  "Imperial Mandate",
  {
    ap: 60,
    abilityHaste: 20,
    manaRegen: 125,
  },
  [],
  "Imperial Mandate"
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
  "Moonstone Renewer"
);

const Bloodsong = new Item(
  "Bloodsong",
  {
    hp: 200,
    healthRegen: 75,
    manaRegen: 75,
  },
  [],
  "Spellblade"
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
  "Spellblade"
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
  "Spellblade"
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
  "Spellblade"
);

const Bloodthirster = new Item(
  "Bloodthirster",
  {
    ad: 80,
    lifeSteal: 15,
  },
  [],
  "Bloodthirster"
);

const ChempunkChainsword = new Item(
  "Chempunk Chainsword",
  {
    ad: 45,
    abilityHaste: 15,
    hp: 450,
  },
  [],
  "Chempunk Chainsword"
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
  "Cosmic Drive"
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
  "Cosmic Drive"
);

const Cryptbloom = new Item(
  "Cryptbloom",
  {
    ap: 75,
    abilityHaste: 20,
    magicPen: 30,
  },
  [],
  "Blight"
);

const Dawncore = new Item(
  "Dawncore",
  {
    ap: 45,
    manaRegen: 100,
    apPerManaRegenMultiplicative: 10,
  },
  [],
  "Dawncore"
);

const DeadMansPlate = new Item(
  "Dead Man's Plate",
  {
    armor: 55,
    hp: 350,
    msPercent: 4,
  },
  [],
  "Momentum"
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
  "Momentum"
);

const DeathsDance = new Item(
  "Death's Dance",
  {
    ad: 60,
    abilityHaste: 15,
    armor: 50,
  },
  [],
  "Death's Dance"
);

const DiademOfSongs = new Item(
  "Diadem of Songs",
  {
    hp: 200,
    mana: 1000,
    manaRegen: 100,
  },
  [],
  "Diadem of Songs"
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
  "Spellblade"
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
  "Spellblade"
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
  "Echoes of Helia"
);

const Eclipse = new Item(
  "Eclipse",
  {
    ad: 60,
    abilityHaste: 15,
  },
  [],
  "Eclipse"
);

const EdgeOfNight = new Item(
  "Edge of Night",
  {
    ad: 50,
    lethality: 15,
    hp: 250,
  },
  [],
  "Annul"
);

const EndlessHunger = new Item(
  "Endless Hunger",
  {
    ad: 60,
    omnivamp: 5,
  },
  [],
  "Endless Hunger"
);

const EndlessHungerFeast = new Item(
  "Endless Hunger (Feast)",
  {
    ad: 60,
    omnivamp: 20,
  },
  [],
  "Endless Hunger"
);

const EssenceReaver = new Item(
  "Essence Reaver",
  {
    ad: 50,
    abilityHaste: 20,
    critChance: 25,
  },
  [],
  "Spellblade"
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
  "Spellblade"
);

const ExperimentalHexplate = new Item(
  "Experimental Hexplate",
  {
    ad: 40,
    attackSpeed: 20,
    hp: 450,
  },
  [],
  "Experimental Hexplate"
);

const FiendhunterBolts = new Item(
  "Fiendhunter Bolts",
  {
    attackSpeed: 40,
    critChance: 25,
    msPercent: 4,
  },
  [],
  "Fiendhunter Bolts"
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
  "Fimbulwinter"
);

const ForceOfNature = new Item(
  "Force of Nature",
  {
    mr: 55,
    hp: 400,
    msPercent: 4,
  },
  [],
  "Force of Nature"
);

const ForceOfNatureMaxStacks = new Item(
  "Force of Nature (Max Steadfast)",
  {
    mr: 125,
    hp: 400,
    msPercent: 10,
  },
  [],
  "Force of Nature"
);

const FrozenHeart = new Item(
  "Frozen Heart",
  {
    abilityHaste: 20,
    armor: 75,
    mana: 400,
  },
  [],
  "Frozen Heart"
);

const GuardianAngel = new Item(
  "Guardian Angel",
  {
    ad: 55,
    armor: 45,
  },
  [],
  "Guardian Angel"
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
  "Guinsoo's Rageblade"
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
  "Guinsoo's Rageblade"
);

const Heartsteel = new Item(
  "Heartsteel",
  {
    hp: 900,
    healthRegen: 100,
  },
  [],
  "Heartsteel"
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
  "Heartsteel"
);

const HexopticsC44 = new Item(
  "Hexoptics C44",
  {
    ad: 50,
    critChance: 25,
  },
  [],
  "Hexoptics C44"
);

const HexopticsC44ArcaneAim = new Item(
  "Hexoptics C44 (Arcane Aim)",
  {
    ad: 50,
    critChance: 25,
    attackRange: 100,
  },
  [],
  "Hexoptics C44"
);

const HextechGunblade = new Item(
  "Hextech Gunblade",
  {
    ad: 40,
    ap: 80,
    omnivamp: 10,
  },
  [],
  "Hextech Gunblade"
);

const HextechRocketbelt = new Item(
  "Hextech Rocketbelt",
  {
    ap: 70,
    abilityHaste: 20,
    hp: 300,
  },
  [],
  "Hextech Rocketbelt"
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
  "Immolate"
);

const HorizonFocus = new Item(
  "Horizon Focus",
  {
    ap: 75,
    abilityHaste: 25,
  },
  [],
  "Horizon Focus"
);

const HorizonFocusHypershot = new Item(
  "Horizon Focus (Hypershot)",
  {
    ap: 75,
    abilityHaste: 25,
    damageAmplificationOnTarget: 10,
  },
  [],
  "Horizon Focus"
);

const Hubris = new Item(
  "Hubris",
  {
    ad: 60,
    abilityHaste: 10,
    lethality: 18,
  },
  [],
  "Hubris"
);

const Hubris5Stacks = new Item(
  "Hubris (5 stacks)",
  {
    ad: 85,
    abilityHaste: 10,
    lethality: 18,
  },
  [],
  "Hubris"
);

const Hubris10Stacks = new Item(
  "Hubris (10 stacks)",
  {
    ad: 95,
    abilityHaste: 10,
    lethality: 18,
  },
  [],
  "Hubris"
);

const Hubris20Stacks = new Item(
  "Hubris (20 stacks)",
  {
    ad: 115,
    abilityHaste: 10,
    lethality: 18,
  },
  [],
  "Hubris"
);

const Hullbreaker = new Item(
  "Hullbreaker",
  {
    ad: 40,
    hp: 500,
    msPercent: 4,
  },
  [],
  "Hullbreaker"
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
  "Hullbreaker"
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
  "Hullbreaker"
);

const IcebornGauntlet = new Item(
  "Iceborn Gauntlet",
  {
    abilityHaste: 15,
    armor: 50,
    hp: 300,
  },
  [],
  "Spellblade"
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
  "Spellblade"
);

const ImmortalShieldbow = new Item(
  "Immortal Shieldbow",
  {
    ad: 55,
    critChance: 25,
  },
  [],
  "Lifeline"
);

const InfinityEdge = new Item(
  "Infinity Edge",
  {
    ad: 75,
    critChance: 25,
    critDmg: 30,
  },
  [],
  "Infinity Edge"
);

const JakSho = new Item(
  "Jak'Sho, The Protean",
  {
    armor: 45,
    mr: 45,
    hp: 350,
  },
  [],
  "Jak'Sho, The Protean"
);

const KaenicRookern = new Item(
  "Kaenic Rookern",
  {
    mr: 80,
    hp: 400,
    healthRegen: 100,
  },
  [],
  "Kaenic Rookern"
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
  "Knight's Vow"
);

const KrakenSlayer = new Item(
  "Kraken Slayer (Base)",
  {
    ad: 45,
    attackSpeed: 40,
    msPercent: 4,
  },
  [],
  "Kraken Slayer"
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
  "Kraken Slayer"
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
  "Kraken Slayer"
);

const LiandrysTorment = new Item(
  "Liandry's Torment",
  {
    ap: 60,
    hp: 300,
    magicDotDamagePerTargetMaxHPRatio: 2,
  },
  [],
  "Liandry's Torment"
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
  "Locket of the Iron Solari"
);

const LichBane = new Item(
  "Lich Bane",
  {
    ap: 100,
    abilityHaste: 10,
    msPercent: 4,
  },
  [],
  "Spellblade"
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
  "Spellblade"
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
  "Fatality"
);

const LudensEcho = new Item(
  "Luden's Echo",
  {
    ap: 100,
    abilityHaste: 10,
    mana: 600,
  },
  [],
  "Luden's Echo"
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
  "Malignance"
);

const Morellonomicon = new Item(
  "Morellonomicon",
  {
    ap: 80,
    hp: 350,
    magicPen: 15,
  },
  [],
  "Morellonomicon"
);

const MortalReminder = new Item(
  "Mortal Reminder",
  {
    ad: 30,
    armorPen: 35,
    critChance: 25,
  },
  [],
  "Fatality"
);

const MawOfMalmortius = new Item(
  "Maw of Malmortius (Base)",
  {
    ad: 60,
    abilityHaste: 15,
    mr: 40,
  },
  [],
  "Lifeline"
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
  "Lifeline"
);

const MejaisSoulstealer = new Item(
  "Mejai's Soulstealer",
  {
    ap: 20,
    hp: 100,
  },
  [],
  "Glory"
);

const MejaisSoulstealer10Stacks = new Item(
  "Mejai's (10 stacks)",
  {
    ap: 70,
    hp: 100,
    msPercent: 10,
  },
  [],
  "Glory"
);

const MejaisSoulstealer25Stacks = new Item(
  "Mejai's (25 stacks)",
  {
    ap: 145,
    hp: 100,
    msPercent: 10,
  },
  [],
  "Glory"
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
  "Manaflow"
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
  "Muramana"
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
  "Muramana"
);

const MercurialScimitar = new Item(
  "Mercurial Scimitar",
  {
    ad: 50,
    mr: 35,
    lifeSteal: 10,
  },
  [],
  "Quicksilver"
);

const MikaelsBlessing = new Item(
  "Mikael's Blessing",
  {
    abilityHaste: 15,
    hp: 250,
    manaRegen: 100,
  },
  [],
  "Mikael's Blessing"
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
  "Nashor's Tooth"
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
  "Navori Flickerblade"
);

const Opportunity = new Item(
  "Opportunity",
  {
    ad: 55,
    lethality: 18,
  },
  [],
  "Opportunity"
);

const OpportunityPreparationMelee = new Item(
  "Opportunity (Prep Melee)",
  {
    ad: 55,
    lethality: 29,
  },
  [],
  "Opportunity"
);

const OpportunityPreparationRanged = new Item(
  "Opportunity (Prep Ranged)",
  {
    ad: 55,
    lethality: 23,
  },
  [],
  "Opportunity"
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
  "Overlord's Bloodmail"
);

const ProtoplasmHarness = new Item(
  "Protoplasm Harness",
  {
    hp: 200,
    healthRegen: 75,
    manaRegen: 75,
  },
  [],
  "Support / Jungle"
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
  "Overlord's Bloodmail"
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
  "Overlord's Bloodmail"
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
  "Overlord's Bloodmail"
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
  "Overlord's Bloodmail"
);

const PhantomDancer = new Item(
  "Phantom Dancer",
  {
    attackSpeed: 65,
    critChance: 25,
    msPercent: 10,
  },
  [],
  "Phantom Dancer"
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
  "Hydra"
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
  "Hydra"
);

const RabadonsDeathcap = new Item(
  "Rabadon's Deathcap",
  {
    ap: 130,
    apMultiplicative: 30,
  },
  [],
  "Rabadon's Deathcap"
);

const RanduinsOmen = new Item(
  "Randuin's Omen",
  {
    armor: 80,
    hp: 350,
  },
  [],
  "Randuin's Omen"
);

const RapidFirecannon = new Item(
  "Rapid Firecannon",
  {
    attackSpeed: 35,
    critChance: 25,
    msPercent: 4,
  },
  [],
  "Rapid Firecannon"
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
  "Hydra"
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
  "Hydra"
);

const Redemption = new Item(
  "Redemption",
  {
    abilityHaste: 15,
    hp: 250,
    manaRegen: 125,
  },
  [],
  "Redemption"
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
  "Riftmaker"
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
  "Riftmaker"
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
  "Riftmaker"
);

const RodOfAges = new Item(
  "Rod of Ages",
  {
    ap: 45,
    hp: 350,
    mana: 500,
  },
  [],
  "Eternity"
);

const RodOfAgesMaxStacks = new Item(
  "Rod of Ages (Max Stacks)",
  {
    ap: 75,
    hp: 450,
    mana: 800,
  },
  [],
  "Eternity"
);

const RunaansHurricane = new Item(
  "Runaan's Hurricane",
  {
    attackSpeed: 40,
    critChance: 25,
    msPercent: 4,
  },
  [],
  "Runaan's Hurricane"
);

const RylaisCrystalScepter = new Item(
  "Rylai's Crystal Scepter",
  {
    ap: 75,
    hp: 400,
  },
  [],
  "Rylai's Crystal Scepter"
);

const SerpentsFang = new Item(
  "Serpent's Fang",
  {
    ad: 55,
    lethality: 15,
  },
  [],
  "Serpent's Fang"
);

const SeryldasGrudge = new Item(
  "Serylda's Grudge",
  {
    ad: 45,
    abilityHaste: 15,
    armorPen: 35,
  },
  [],
  "Fatality"
);

const Shadowflame = new Item(
  "Shadowflame",
  {
    ap: 110,
    magicPen: 15,
  },
  [],
  "Shadowflame"
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
  "Shurelya's Battlesong"
);

const SolsticeSleigh = new Item(
  "Solstice Sleigh",
  {
    hp: 200,
    healthRegen: 75,
    manaRegen: 75,
  },
  [],
  "Support / Jungle"
);

const SpearOfShojin = new Item(
  "Spear of Shojin (Base)",
  {
    ad: 45,
    hp: 450,
    basicAbilityHaste: 25,
  },
  [],
  "Spear of Shojin"
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
  "Spear of Shojin"
);

const SpectralCutlass = new Item(
  "Spectral Cutlass",
  {
    ad: 45,
    abilityHaste: 15,
    lethality: 12,
  },
  [],
  "Spectral Cutlass"
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
  "Spirit Visage"
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
  "Staff of Flowing Water"
);

const StatikkShiv = new Item(
  "Statikk Shiv",
  {
    ad: 45,
    attackSpeed: 30,
    msPercent: 4,
  },
  [],
  "Statikk Shiv"
);

const SteraksGage = new Item(
  "Sterak's Gage",
  {
    hp: 400,
    adPerBaseADPercent: 45,
  },
  [],
  "Lifeline"
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
  "Stormrazor"
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
  "Stormrazor"
);

const Stormsurge = new Item(
  "Stormsurge",
  {
    ap: 90,
    magicPen: 15,
    msPercent: 6,
  },
  [],
  "Stormsurge"
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
  "Hydra"
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
  "Hydra"
);

const SunderedSky = new Item(
  "Sundered Sky",
  {
    ad: 45,
    abilityHaste: 10,
    hp: 400,
  },
  [],
  "Sundered Sky"
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
  "Immolate"
);

const Terminus = new Item(
  "Terminus (Base)",
  {
    ad: 30,
    attackSpeed: 35,
    magicOnHit: 30,
  },
  [],
  "Fatality"
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
    magicPen: 30,
  },
  [],
  "Fatality"
);

const TheCollector = new Item(
  "The Collector",
  {
    ad: 50,
    lethality: 10,
    critChance: 25,
  },
  [],
  "The Collector"
);

const Thornmail = new Item(
  "Thornmail",
  {
    armor: 75,
    hp: 150,
  },
  [],
  "Thornmail"
);

const TitanicHydra = new Item(
  "Titanic Hydra (Base)",
  {
    ad: 40,
    hp: 600,
    physicalOnHitMaxHealthPercent: 1,
  },
  [],
  "Hydra"
);

const Trailblazer = new Item(
  "Trailblazer",
  {
    armor: 40,
    hp: 250,
    msPercent: 4,
  },
  [],
  "Momentum"
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
  "Spellblade"
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
  "Spellblade"
);

const UmbralGlaive = new Item(
  "Umbral Glaive (Base)",
  {
    ad: 60,
    abilityHaste: 15,
    lethality: 18,
  },
  [],
  "Umbral Glaive"
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
  "Umbral Glaive"
);

const UnendingDespair = new Item(
  "Unending Despair",
  {
    abilityHaste: 15,
    armor: 50,
    hp: 400,
  },
  [],
  "Unending Despair"
);

const VoidStaff = new Item(
  "Void Staff",
  {
    ap: 95,
    magicPen: 40,
  },
  [],
  "Blight"
);

const VoltaicCyclosword = new Item(
  "Voltaic Cyclosword",
  {
    ad: 55,
    abilityHaste: 10,
    lethality: 18,
  },
  [],
  "Voltaic Cyclosword"
);

const WarmogsArmor = new Item(
  "Warmog's Armor",
  {
    hp: 1000,
    healthRegen: 100,
    bonusHPMultiplicative: 12,
  },
  [],
  "Warmog's Armor"
);

const WhisperingCirclet = new Item(
  "Whispering Circlet",
  {
    hp: 200,
    healthRegen: 75,
    manaRegen: 75,
  },
  [],
  "Support / Jungle"
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
  "Manaflow"
);

const WitsEnd = new Item(
  "Wit's End",
  {
    mr: 45,
    attackSpeed: 50,
    magicOnHit: 45,
  },
  [],
  "Wit's End"
);

const YoumuusGhostblade = new Item(
  "Youmuu's Ghostblade",
  {
    ad: 55,
    lethality: 18,
    msPercent: 4,
  },
  [],
  "Youmuu's Ghostblade"
);

const YunTalWildarrows = new Item(
  "Yun Tal Wildarrows",
  {
    ad: 50,
    attackSpeed: 40,
    critChance: 0,
  },
  [],
  "Yun Tal Wildarrows"
);

const YunTalWildarrowsMeleeMax = new Item(
  "Yun Tal (Melee Max)",
  {
    ad: 50,
    attackSpeed: 40,
    critChance: 25,
  },
  [],
  "Yun Tal Wildarrows"
);

const YunTalWildarrowsRangedMax = new Item(
  "Yun Tal (Ranged Max)",
  {
    ad: 50,
    attackSpeed: 40,
    critChance: 25,
  },
  [],
  "Yun Tal Wildarrows"
);

const ZazzaksRealmspike = new Item(
  "Zaz'Zak's Realmspike",
  {
    hp: 200,
    healthRegen: 75,
    manaRegen: 75,
  },
  [],
  "Support / Jungle"
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
  "Zeke's Convergence"
);

const ZhonyasHourglass = new Item(
  "Zhonya's Hourglass",
  {
    ap: 105,
    armor: 50,
  },
  [],
  "Stasis"
);

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
  AS: Number;
  Abilities: Ability[];
  Items: Item[];

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
    items: Item[] = []
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
    this.Abilities = abilities;
    this.Items = items;
  }

  // Get all abilities including item passives
  getAllAbilities(): Ability[] {
    const itemPassives = this.Items.flatMap((item) => item.passives);
    return [...this.Abilities, ...itemPassives];
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
      magicPen: 0,
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
      hpPerBonusManaPercent: 0,
      damageMultiplicative: 0,
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

    // Calculate final AS with bonus attack speed percentage
    const finalAS = baseStats.baseAS * (1 + baseStats.attackSpeed / 100);

    // Calculate final MS with bonus movement speed percentage
    const finalMS = baseStats.ms * (1 + baseStats.msPercent / 100);

    // Calculate bonus HP from bonus mana (e.g., Winter's Approach/Fimbulwinter Awe: 15% bonus mana as HP)
    const bonusMana = baseStats.mana; // All mana is bonus mana (no base mana on champions)
    const bonusHPFromMana = (bonusMana * baseStats.hpPerBonusManaPercent) / 100;

    // Apply bonus HP multiplier (e.g., Warmog's Vitality: 12% increased bonus HP)
    const rawBonusHP = baseStats.hp - this.HP + bonusHPFromMana; // Total HP from items + HP from mana
    const bonusHPMultiplier = 1 + (baseStats.bonusHPMultiplicative || 0) / 100;
    const bonusHP = rawBonusHP * bonusHPMultiplier;
    const finalHP = this.HP + bonusHP;

    // Calculate bonus AD from max mana (e.g., Manamune/Muramana Awe passive)
    const bonusADFromMana =
      (baseStats.mana * baseStats.adPerMaxManaPercent) / 100;

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

    // Calculate base total AP (before multipliers)
    const baseTotalAP = baseStats.ap + bonusAPFromHP;

    // Apply AP multiplier (e.g., Rabadon's Deathcap Magical Opus passive)
    const apMultiplier = 1 + (baseStats.apMultiplicative || 0) / 100;
    const finalAP = baseTotalAP * apMultiplier;

    return {
      ...baseStats,
      hp: finalHP,
      as: finalAS,
      ms: finalMS,
      ad: finalAD,
      ap: finalAP,
    };
  }

  calculateDPS(
    targetMaxHP: number = 3000,
    targetBonusHP: number = 1000
  ): {
    autoAttackDPS: number;
    onHitDPS: number;
    dotDPS: number;
    abilityDPS: number;
    totalDPS: number;
    breakdown: string[];
  } {
    const stats = this.getTotalStats();
    const breakdown: string[] = [];

    // Calculate effective ability haste for cooldown reduction
    const totalAbilityHaste = stats.abilityHaste + stats.basicAbilityHaste;
    const abilityCDR = totalAbilityHaste / (100 + totalAbilityHaste);

    // 1. Base Auto Attack DPS
    const baseAutoAttackDamage = stats.ad;
    const critMultiplier =
      1 + (stats.critChance / 100) * ((stats.critDmg - 100) / 100);
    const autoAttackDamagePerHit = baseAutoAttackDamage * critMultiplier;
    const autoAttackDPS = autoAttackDamagePerHit * stats.as;
    breakdown.push(
      `Base AA: ${autoAttackDPS.toFixed(1)} DPS (${stats.ad.toFixed(
        1
      )} AD * ${critMultiplier.toFixed(2)} crit * ${stats.as.toFixed(2)} AS)`
    );

    // 2. On-Hit Damage (per attack, multiplied by AS)
    let onHitDamagePerAttack = 0;

    // Physical on-hit
    if (stats.physicalOnHit) {
      onHitDamagePerAttack += stats.physicalOnHit;
      breakdown.push(`Physical on-hit: +${stats.physicalOnHit}`);
    }
    if (stats.physicalOnHitBaseADPercent) {
      const dmg = (this.AD * stats.physicalOnHitBaseADPercent) / 100;
      onHitDamagePerAttack += dmg;
      breakdown.push(`Physical on-hit (base AD): +${dmg.toFixed(1)}`);
    }
    if (stats.physicalOnHitMaxHealthPercent) {
      const dmg = (targetMaxHP * stats.physicalOnHitMaxHealthPercent) / 100;
      onHitDamagePerAttack += dmg;
      breakdown.push(`Physical on-hit (target max HP): +${dmg.toFixed(1)}`);
    }
    if (stats.physicalOnHitMaxManaPercent) {
      const dmg = (stats.mana * stats.physicalOnHitMaxManaPercent) / 100;
      onHitDamagePerAttack += dmg;
      breakdown.push(`Physical on-hit (max mana): +${dmg.toFixed(1)}`);
    }

    // Magic on-hit
    if (stats.magicOnHit) {
      onHitDamagePerAttack += stats.magicOnHit;
      breakdown.push(`Magic on-hit: +${stats.magicOnHit}`);
    }
    if (stats.magicOnHitBaseADPercent) {
      const dmg = (this.AD * stats.magicOnHitBaseADPercent) / 100;
      onHitDamagePerAttack += dmg;
      breakdown.push(`Magic on-hit (base AD): +${dmg.toFixed(1)}`);
    }
    if (stats.magicOnHitAPRatio) {
      const dmg = (stats.ap * stats.magicOnHitAPRatio) / 100;
      onHitDamagePerAttack += dmg;
      breakdown.push(`Magic on-hit (AP): +${dmg.toFixed(1)}`);
    }

    // Periodic on-hit (already averaged per attack)
    if (stats.magicPeriodicOnHit) {
      onHitDamagePerAttack += stats.magicPeriodicOnHit;
      breakdown.push(`Periodic magic on-hit: +${stats.magicPeriodicOnHit}`);
    }

    // AoE on-hit damage
    if (stats.physicalAoEOnHitADPercent) {
      const dmg = (stats.ad * stats.physicalAoEOnHitADPercent) / 100;
      onHitDamagePerAttack += dmg;
      breakdown.push(`AoE physical on-hit: +${dmg.toFixed(1)}`);
    }
    if (stats.physicalAoEOnHitMaxHealthPercent) {
      const dmg = (targetMaxHP * stats.physicalAoEOnHitMaxHealthPercent) / 100;
      onHitDamagePerAttack += dmg;
      breakdown.push(`AoE physical on-hit (max HP): +${dmg.toFixed(1)}`);
    }

    const onHitDPS = onHitDamagePerAttack * stats.as;
    if (onHitDamagePerAttack > 0) {
      breakdown.push(
        `On-hit total: ${onHitDPS.toFixed(
          1
        )} DPS (${onHitDamagePerAttack.toFixed(1)} * ${stats.as.toFixed(2)} AS)`
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

    // 4. Ability DPS
    let abilityDPS = 0;
    const abilities = this.getAllAbilities();

    for (const ability of abilities) {
      if (!ability.damage || ability.abilityType === "passive") continue;

      // Get base cooldown at max rank
      const baseCooldown = ability.getCooldownAtLevel(5);
      if (baseCooldown === 0) continue;

      // Apply ability haste (basic abilities get both general + basic AH, ult gets only general + ult AH)
      const effectiveAH =
        ability.abilityType === "R"
          ? stats.abilityHaste + stats.ultAbilityHaste
          : totalAbilityHaste;
      const effectiveCDR = effectiveAH / (100 + effectiveAH);
      const actualCooldown = baseCooldown * (1 - effectiveCDR);

      // Calculate ability damage at max rank
      let abilityDamage = 0;
      if (ability.damage.baseDamage) {
        abilityDamage += ability.getValueAtLevel(ability.damage.baseDamage, 5);
      }
      if (ability.damage.adRatio) {
        abilityDamage +=
          (stats.ad * ability.getValueAtLevel(ability.damage.adRatio, 5)) / 100;
      }
      if (ability.damage.apRatio) {
        abilityDamage +=
          (stats.ap * ability.getValueAtLevel(ability.damage.apRatio, 5)) / 100;
      }
      if (ability.damage.bonusAdRatio) {
        const bonusAD = stats.ad - this.AD;
        abilityDamage +=
          (bonusAD * ability.getValueAtLevel(ability.damage.bonusAdRatio, 5)) /
          100;
      }
      if (ability.damage.maxHealthRatio) {
        abilityDamage +=
          (targetMaxHP *
            ability.getValueAtLevel(ability.damage.maxHealthRatio, 5)) /
          100;
      }

      // Account for multiple casts (like Ahri R)
      const castsPerWindow = ability.maxCasts || 1;
      const totalDamage = abilityDamage * castsPerWindow;

      // DPS = damage / cooldown
      const dps = totalDamage / actualCooldown;
      abilityDPS += dps;

      breakdown.push(
        `${ability.name}: ${dps.toFixed(1)} DPS (${totalDamage.toFixed(
          0
        )} dmg / ${actualCooldown.toFixed(1)}s CD)`
      );
    }

    // 5. Apply damage multipliers
    const damageMultiplier = 1 + (stats.damageMultiplicative || 0) / 100;
    const targetDamageAmp = 1 + (stats.damageAmplificationOnTarget || 0) / 100;
    const giantSlayerMultiplier =
      1 +
      Math.min(
        15,
        (targetBonusHP / 100) * (stats.damagePerTargetBonusHPPercent || 0)
      ) /
        100;

    const totalMultiplier =
      damageMultiplier * targetDamageAmp * giantSlayerMultiplier;

    if (totalMultiplier > 1) {
      breakdown.push(
        `Damage multipliers: ${(totalMultiplier * 100).toFixed(
          1
        )}% (${damageMultiplier.toFixed(2)} * ${targetDamageAmp.toFixed(
          2
        )} * ${giantSlayerMultiplier.toFixed(2)})`
      );
    }

    // Apply ability damage multiplier (abilities benefit from general damage multiplier and ability-specific multipliers)
    const abilityMultiplier =
      damageMultiplier *
      targetDamageAmp *
      giantSlayerMultiplier *
      (1 + (stats.abilityDamageMultiplicative || 0) / 100);
    const finalAbilityDPS = abilityDPS * abilityMultiplier;

    const totalDPS =
      (autoAttackDPS + onHitDPS + dotDPS) * totalMultiplier + finalAbilityDPS;

    return {
      autoAttackDPS: autoAttackDPS * totalMultiplier,
      onHitDPS: onHitDPS * totalMultiplier,
      dotDPS: dotDPS * totalMultiplier,
      abilityDPS: finalAbilityDPS,
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
  [AatroxPassive, AatroxQ1, AatroxQ2, AatroxQ3, AatroxW, AatroxE, AatroxR],
  [] // Items (can be added later)
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
  ]
);

const AhriQ = new Ability(
  "Orb of Deception",
  "Q",
  "Sends orb that deals magic damage outward and true damage on return",
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
    apRatio: 50,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  ["Return pass deals true damage", "Hits once per pass"]
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
    baseDamage: [40, 60, 80, 100, 120],
    apRatio: 40,
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
    "3 flames orbit for 2.5s",
    "Subsequent flames deal 40% damage",
    "Doubled damage vs minions below 20% HP",
  ]
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
    baseDamage: [80, 120, 160, 200, 240],
    apRatio: 85,
    damageType: "magic",
  },
  {
    ccType: "slow",
    ccDuration: 1.8,
    slow: 65,
  },
  undefined,
  undefined,
  ["Knocks down and charms target"]
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
    baseDamage: [75, 125, 175],
    apRatio: 35,
    damageType: "magic",
  },
  undefined,
  3,
  15,
  [
    "Up to 3 recasts within 15s",
    "Champion takedown extends duration by 10s and grants additional recast",
    "Max 3 stored recasts",
    "Targets up to 3 nearby enemies per cast",
  ]
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
  [AhriPassive, AhriQ, AhriW, AhriE, AhriR],
  [] // Items (can be added later)
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
    baseDamage: [35, 182], // Level 1 to 18
    bonusAdRatio: 60,
    apRatio: 55,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  ["Empowered attack has doubled range", "Gain bonus MS moving away from ring"]
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
  ["Targets beyond 120 range are slowed"]
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
  ]
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
    baseDamage: [21, 42, 63, 84, 105],
    adRatio: 30,
    apRatio: 33,
    damageType: "magic",
  },
  undefined,
  undefined,
  2, // Two casts
  ["Recast deals 49/98/147/196/245 (+70% bonus AD)(+77% AP) magic damage"]
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
    baseDamage: [110, 220, 330],
    bonusAdRatio: 50,
    apRatio: 30,
    damageType: "magic",
  },
  undefined,
  undefined,
  2, // Two casts
  [
    "First cast: Fixed damage",
    "Second cast: 70/140/210 (+30% AP), increased by 0-200% based on missing health",
  ]
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
  [] // Items
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
  ]
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
    baseDamage: [45, 75, 105, 135, 165],
    bonusAdRatio: 70,
    damageType: "physical",
  },
  undefined,
  undefined,
  2,
  ["Total damage: 90/150/210/270/330 (+140% bonus AD)"]
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
  ]
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
  ["Fires shots every 0.231s", "Scales with bonus AS"]
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
    baseDamage: [25, 35, 45],
    adRatio: 15,
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Stores 5/6/7 bullets over 2.5s",
    "Execute: 0-200% increased damage based on missing health",
  ]
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
  []
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
  ]
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
  ["Stuns and knocks up simultaneously"]
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
  ["Knocks back 700 units over 0.5s", "Stuns for 0.75s"]
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
  ]
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
  ["Cleanses all CC", "55/65/75% damage reduction for 7s"]
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
  []
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
  ["Empowered attacks gain 75 range, 50% AS, and restore 40/55/70 energy"]
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
  ["Outer edge deals double damage", "Enables Sundering Slam for 4s"]
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
  ["First enemy hit takes double damage"]
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
  ["Shield: 50-320 (+150% bonus AD)", "If shield absorbs damage: +50% damage"]
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
  ["Spins twice if dashing", "Total: 80/120/160/200/240 (+100% bonus AD)"]
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
  ]
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
  []
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
    apRatio: 2.7, // +2.7% max HP per 100 AP
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "3 stacks: 1% (+2.7% per 100 AP) max HP magic damage",
    "Spirit heals 3-20 (+2% AP)/sec",
    "Max 4 Spirits",
  ]
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
  ]
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
  ["Invis: 1-1.6s", "MS: 20-40% for 4s", "Takedown resets cooldown"]
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
  ["Recoil 250 units backwards", "80% slow decaying after 0.15s"]
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
  ["Rift lasts 1.75-3.25s", "Borders slow enemies 50%", "Can dash across rift"]
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
  []
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
  ["Sun Disc decays over 45s", "Loses armor/MR when Azir away"]
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
  ["Additional soldiers: +25% slow each", "Requires Sand Soldier"]
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
  ]
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
  ["Shield: 70-230 (+60% AP)", "Hit champion: Refund W charge"]
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
  ["Wall lasts 5s", "Impassible terrain for enemies", "6/7/8 soldiers wide"]
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
  []
);

// Bard - The Wandering Caretaker
const BardPassive = new Ability(
  "Traveler's Call",
  "passive",
  "Collect Chimes for mana, XP, MS. Meeps empower basic attacks",
  { cooldown: 0, cooldownType: "standard" },
  { castTime: 0, range: 500 },
  {
    baseDamage: [85], // 35 base + 50 from 25 Chimes (5*10)
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
  ]
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
  ["Slow: 60% if only one target", "Stun: 1-1.8s if binds two targets or wall"]
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
  ]
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
  ]
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
  ]
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
  []
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
  ]
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
  ]
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
  ["Slow: 1.25-2.25s", "Hit champion: Reset Q cooldown for that direction"]
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
  ]
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
  ]
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
  []
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
  ["Shield: 35% max mana", "Duration: 10s", "90s CD"]
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
  ["Pulls enemy to Blitzcrank", "Cannot move/attack during flight"]
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
  ]
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
  ]
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
  ]
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
  []
);

// Brand - The Burning Vengeance
const BrandPassive = new Ability(
  "Blaze",
  "passive",
  "Abilities apply Ablaze stacks. 3 stacks explode for % max HP damage",
  { cooldown: 0, cooldownType: "standard" },
  { castTime: 0, range: 0, radius: 475 },
  {
    baseDamage: [0],
    maxHealthRatio: 10, // 8-12% based on level, using avg
    apRatio: 2, // +2% per 100 AP
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Ablaze: 2% max HP over 4s per stack",
    "3 stacks: 8-12% (+2% per 100 AP) max HP explosion",
    "Kills refund 20-40 mana",
  ]
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
  ["Stuns for 1.75s if target has Ablaze"]
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
  ]
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
  ]
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
  ]
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
  []
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
  ]
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
  ]
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
  ]
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
  ]
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
  ]
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
  []
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
  ]
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
    adRatio: [125, 145, 165, 185, 205],
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  ["60% damage after first target", "Trapped targets: Always take full damage"]
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
  ]
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
  ]
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
  ]
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
  []
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
  ]
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
  ]
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
    maxHealthRatio: 7, // 6-8% avg
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
    "Outer cone: 6-8% (+2.5% per 100 bonus AD) max HP",
    "Heal: 100% of outer damage vs champions",
    "Cast time: 1.1s",
    "Ghosted during cast",
  ]
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
  ]
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
  ]
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
  []
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
  ["MS bonus effectiveness: 6-40% (based on level)", "Cannot purchase boots"]
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
  ]
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
  ]
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
  ]
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
  ]
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
  []
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
  ["Cursed enemies take 10% bonus true damage from magic damage"]
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
  ["Pulls Amumu to target", "Reduces cooldown by 75% if used again within 3s"]
);

const AmumuW = new Ability(
  "Despair",
  "W",
  "Toggle: Drains mana to deal damage per second to nearby enemies",
  { cooldown: 0, cooldownType: "standard" },
  { castTime: 0, radius: 300 },
  { baseDamage: [8, 11, 14, 17, 20], apRatio: 10, damageType: "magic" },
  undefined,
  undefined,
  undefined,
  [
    "Costs 8 mana per second",
    "Damage per second values",
    "Deals bonus 1% max HP per 100 AP per second",
  ]
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
  ]
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
  ["Also roots enemies for 2s (cannot move but can attack)"]
);

const Amumu = new Character(
  "Amumu",
  685,
  8.5,
  40,
  32,
  53,
  200,
  335,
  125,
  0.638,
  [AmumuPassive, AmumuQ, AmumuW, AmumuE, AmumuR],
  []
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
  ["Egg has 25% max HP + AP", "120s cooldown"]
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
  ["Slow: 20% while passing", "Detonation stuns for 1s"]
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
  ["Wall lasts 5 seconds", "Blocks pathing"]
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
  ["Doubled damage if chilled: 100/150/200/250/300 (+120% AP)"]
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
  ]
);

const Anivia = new Character(
  "Anivia",
  550,
  5.5,
  21,
  30,
  51,
  200,
  325,
  600,
  0.625,
  [AniviaPassive, AniviaQ, AniviaW, AniviaE, AniviaR],
  []
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
  ["Visual indicator at 4 stacks"]
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
  ["Refunds full mana cost if kills target"]
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
  ["Cone angle: 50 degrees"]
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
  ]
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
  ]
);

const Annie = new Character(
  "Annie",
  560,
  5.5,
  19,
  30,
  50,
  200,
  335,
  625,
  0.579,
  [AnniePassive, AnnieQ, AnnieW, AnnieE, AnnieR],
  []
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
  ]
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
  ]
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
  ["Instant swap"]
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
  ["Order: Calibrum, Severum, Gravitum, Infernum, Crescendum"]
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
  ["Applies offhand weapon's special effect to all enemies hit"]
);

const Aphelios = new Character(
  "Aphelios",
  600,
  3.25,
  26,
  30,
  55,
  200,
  325,
  550,
  0.64,
  [ApheliosPassive, ApheliosQ, ApheliosW, ApheliosE, ApheliosR],
  []
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
  ]
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
  ]
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
  ["Slows by 20-40% for 2s", "Applies Frost Shot"]
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
  ["Grants vision for 5 seconds", "Stores 2 charges, 90s recharge"]
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
  ["Stun: 1-3.5s based on distance", "Slows nearby enemies by 50% for 3s"]
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
  []
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
  ]
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
  ]
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
  ]
);

const EvelynnE = new Ability(
  "Whiplash",
  "E",
  "Whips target for damage. Empowered version dashes to target",
  { cooldown: [8], cooldownType: "standard" },
  { castTime: 0.25, range: 210 },
  { baseDamage: [60, 90, 120, 150, 180], apRatio: 0, damageType: "magic" },
  undefined,
  undefined,
  undefined,
  [
    "Base: 60/90/120/150/180 (+3% +1.5% per 100 AP of max HP)",
    "Empowered: 80/120/160/200/240 (+4% +2.5% per 100 AP of max HP)",
    "Grants 30/35/40/45/50% MS for 2s",
    "Demon Shade resets CD and empowers next cast",
  ]
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
  ]
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
  []
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
  ]
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
  ]
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
  ]
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
  ]
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
  ]
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
  []
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
  ["Heal: 18-52 (based on level)", "Mana restore: 4.72-9.48 (based on level)"]
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
  ["Delay: 0.627s", "After knockup: 60% slow for 1.5s", "Grants vision of area"]
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
  ]
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
  ]
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
  ]
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
  []
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
  ["True damage: 20% AD", "Affected by critical strike modifiers"]
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
  ]
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
  ]
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
  ]
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
  ]
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
  []
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
  ]
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
    adRatio: [100, 110, 120, 130, 140],
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
  ]
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
    adRatio: [40, 45, 50, 55, 60],
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
  ]
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
  ]
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
  ]
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
  []
);

// Diana - Scorn of the Moon
const DianaPassive = new Ability(
  "Moonsilver Blade",
  "passive",
  "Gain bonus AS. 3rd attack cleaves dealing magic damage",
  { cooldown: 0, cooldownType: "standard" },
  { castTime: 0, range: 0, radius: 175 },
  {
    baseDamage: [20, 220],
    apRatio: 50,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Bonus AS: 15-35% (based on level)",
    "After ability cast: Triple AS bonus (45-105%) for 5s",
    "Every 3rd attack: 20-220 (+50% AP) magic damage",
    "Cleave radius: 175",
    "280% damage vs monsters",
  ]
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
  ]
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
    baseDamage: [20, 32, 44, 56, 68],
    apRatio: 18,
    damageType: "magic",
  },
  {
    shield: [45, 60, 75, 90, 105],
  },
  undefined,
  undefined,
  [
    "Cost: 40/45/50/55/60 mana",
    "Shield: 45/60/75/90/105 (+30% AP)(+9% bonus HP)",
    "Duration: 5s",
    "Damage per orb: 20/32/44/56/68 (+18% AP)",
    "All 3 orbs detonate: Double shield (90/120/150/180/210 +60% AP +18% bonus HP)",
  ]
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
  ]
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
  ]
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
  []
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
  ]
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
    maxHealthRatio: [20, 22.5, 25, 27.5, 30],
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
    "Minimum damage: 80/130/180/230/280",
    "Monster cap: 300/375/450/525/600",
    "Heal: 50% cost (100% vs champions/monsters)",
  ]
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
  ]
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
  ]
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
  ]
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
  []
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
  ]
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
    bonusAdRatio: [75, 85, 95, 105, 115],
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
  ]
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
  ]
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
  ["Cost: 70 mana", "Width: 260", "Knocks aside (not through terrain)"]
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
    bonusAdRatio: [110, 130, 150],
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
  ]
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
  []
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
  ]
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
    baseDamage: [80, 95, 110, 125, 140],
    apRatio: 30,
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
    "Cost: 50/60/70/80/90 mana",
    "First hit: 80/95/110/125/140 (+30% AP)",
    "Second hit: 40/65/90/115/140 (+60% AP)",
    "At 700 units or hit champion: Slows and expands",
    "One hit per pass",
  ]
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
  ]
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
  ]
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
  ]
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
  []
);

// Elise - The Spider Queen
const ElisePassive = new Ability(
  "Spider Queen",
  "passive",
  "Human: Store spiderlings. Spider: Bonus damage and heal on-hit",
  { cooldown: 0, cooldownType: "standard" },
  { castTime: 0, range: 0 },
  {
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
  ]
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
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 80/85/90/95/100 mana",
    "Damage: 40/70/100/130/160 + 4% (+3% per 100 AP) target's current HP",
    "Monster cap: 65/85/105/125/145 (+90% AP)",
  ]
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
  ]
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
  ]
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
  ]
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
  []
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
  ]
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
  ]
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
    apRatio: [70, 75, 80, 85, 90],
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
  ]
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
  ]
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
  ]
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
  []
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
  ]
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
    baseDamage: [40, 60, 80, 100, 120],
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
    "Min damage: 40/60/80/100/120",
    "Monster cap: 400",
    "Passive: Out of combat 2.5s or as effigy: Next ability fears",
    "Target immunity: Equal to CD",
    "Against immune: Double damage (8-12% +6% per 100 AP, min 80-240)",
    "90% slow during fear",
  ]
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
  ]
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
  ]
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
  ]
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
  []
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
  ]
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
    "On hit: 50% CDR",
    "Applies on-hit effects",
    "Can hit structures and wards",
    "Can cast abilities during dash",
    "Does not require vision",
  ]
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
  ]
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
  ]
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
  ]
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
  []
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
  ]
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
  ]
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
  ]
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
  ]
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
  ]
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
  []
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
  ]
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
    baseDamage: [70, 105, 140, 175, 210],
    apRatio: 70,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 70/75/80/85/90 mana",
    "Initial damage: 70/105/140/175/210 (+70% AP)",
    "Tornado: 2% (+1% per 100 AP) max HP per 0.5s",
    "Duration: 2s",
    "Monster cap: 150 per tick",
    "Width: 120",
    "Windblasts start 250 units apart",
  ]
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
  ]
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
  ]
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
  ]
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
  []
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
  ]
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
  ]
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
  ]
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
  ]
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
  ]
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
  []
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
  ]
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
  ]
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
  ]
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
  ]
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
    damageType: "true",
  },
  undefined,
  undefined,
  undefined,
  [
    "Additional damage: 25/30/35% of target's missing health",
    "Reveals target for 1s",
  ]
);

const Garen = new Character(
  "Garen",
  690,
  0,
  38,
  69,
  32,
  200,
  340,
  175,
  0.625,
  [GarenPassive, GarenQ, GarenW, GarenE, GarenR],
  []
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
  ]
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
    baseDamage: [5, 45, 85, 125, 165],
    adRatio: 125,
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
    "Return damage: 50%",
    "Catching refunds 40% cooldown",
    "Max range: 3000 units",
  ]
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
  ]
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
  ]
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
  ]
);

const Gnar = new Character(
  "Gnar",
  540,
  0,
  32,
  60,
  30,
  200,
  335,
  175,
  0.625,
  [GnarPassive, GnarQ1, GnarW1, GnarE1, GnarR],
  []
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
  ["Heal: 5.5% max HP", "Cooldown: 12/10/8/6s (based on level)"]
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
  ]
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
    apRatio: 70,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 30 mana",
    "Damage reduction: 10/12/14/16/18% (+4% per 100 AP) for 2.5s",
    "Empowered attack: +50 range, uncancellable windup, lasts 5s",
    "50% damage vs structures",
    "Cap vs monsters: 300 damage",
  ]
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
  ]
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
  ]
);

const Gragas = new Character(
  "Gragas",
  640,
  400,
  38,
  64,
  32,
  200,
  330,
  125,
  0.675,
  [GragasPassive, GragasQ, GragasW, GragasE, GragasR],
  []
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
  ]
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
  ]
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
  ]
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
  ]
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
  ]
);

const Graves = new Character(
  "Graves",
  625,
  325,
  33,
  68,
  30,
  200,
  340,
  425,
  0.475,
  [GravesPassive, GravesQ, GravesW, GravesE, GravesR],
  []
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
    apRatio: 0.6,
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
  ]
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
    baseDamage: [10, 15, 20, 25, 30],
    apRatio: 5,
    damageType: "magic",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 40 mana",
    "Passive: AA generates Snippy stack (max 4, lasts 6s)",
    "Final snip: 60/85/110/135/160 (+35% AP)",
    "Min damage (2 snips): 70/100/130/160/190 (+40% AP)",
    "Max damage (6 snips): 110/160/210/260/310 (+60% AP)",
    "Center: 50% true damage",
    "75% damage vs minions, execute below 20% HP",
  ]
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
  ]
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
  ]
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
    baseDamage: [35, 65, 95],
    apRatio: 10,
    damageType: "magic",
  },
  {
    ccType: "slow",
    ccDuration: 1.5,
    slow: [30, 45, 60],
  },
  undefined,
  undefined,
  [
    "Cost: 100 mana",
    "3 casts (1s between)",
    "Needles: 1/3/5",
    "Per needle: 35/65/95 (+10% AP)",
    "Max (5 needles): 175/325/475 (+50% AP)",
    "Slow: 30/45/60% (1st hit), 15/20/25% (additional hits per target)",
    "Includes passive damage: +3% (+1.8% per 100 AP) max HP",
  ]
);

const Gwen = new Character(
  "Gwen",
  620,
  330,
  39,
  63,
  32,
  200,
  340,
  150,
  0.69,
  [GwenPassive, GwenQ, GwenW, GwenE, GwenR],
  []
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
  ["Bonus AD: 12-24% of bonus MS (based on level)"]
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
  ]
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
  ]
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
  ]
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
  ]
);

const Hecarim = new Character(
  "Hecarim",
  625,
  280,
  32,
  66,
  32,
  200,
  345,
  175,
  0.67,
  [HecarimPassive, HecarimQ, HecarimW, HecarimE, HecarimR],
  []
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
  ["20% MS within 300 units of turrets"]
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
  ]
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
  ]
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
  ]
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
  ]
);

const Heimerdinger = new Character(
  "Heimerdinger",
  558,
  385,
  19,
  56,
  30,
  200,
  340,
  550,
  0.658,
  [
    HeimerdingerPassive,
    HeimerdingerQ,
    HeimerdingerW,
    HeimerdingerE,
    HeimerdingerR,
  ],
  []
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
  ]
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
  ]
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
  ]
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
  ]
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
  ]
);

const Hwei = new Character(
  "Hwei",
  580,
  480,
  21,
  54,
  30,
  200,
  330,
  550,
  0.69,
  [HweiPassive, HweiQ, HweiW, HweiE, HweiR],
  []
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
  ]
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
  ["Cost: 40/45/50/55/60 mana", "Passive: +10/15/20/25/30% tentacle damage"]
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
    damageType: "physical",
  },
  undefined,
  undefined,
  undefined,
  [
    "Cost: 30 mana",
    "Bonus range: +225",
    "% HP damage: 3/3.5/4/4.5/5% (+3.5% per 100 AD)",
    "Min damage: 20/30/40/50/60",
    "Cap vs non-champions: 300",
    "Resets basic attack timer",
  ]
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
  ]
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
  ]
);

const Illaoi = new Character(
  "Illaoi",
  656,
  350,
  35,
  65,
  32,
  200,
  350,
  125,
  0.625,
  [IllaoiPassive, IllaoiQ, IllaoiW, IllaoiE, IllaoiR],
  []
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
];
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
  Opportunity,
  OpportunityPreparationMelee,
  OpportunityPreparationRanged,
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

// iterating through characters
export async function findOptimalItemsForAllChampions(
  targetMaxHP: number = 3000,
  targetBonusHP: number = 1000
): Promise<
  {
    champion: Character;
    bestItems: Item[];
    bestDPS: number;
    breakdown: string[];
  }[]
> {
  // Only allow 1 item per groupName
  function canAddItem(current: Item[], candidate: Item): boolean {
    const group = candidate.getGroupName();
    return !current.some((i) => i.getGroupName() === group);
  }

  // Greedy: for each slot, pick the item that increases DPS the most
  function findBestItemsForChampion(champion: Character): {
    bestItems: Item[];
    bestDPS: number;
    breakdown: string[];
  } {
    let equipped: Item[] = [];
    let bestDPS = 0;
    let bestBreakdown: string[] = [];
    let available = Items;

    for (let slot = 0; slot < 6; slot++) {
      let bestItem: Item | null = null;
      let bestItemDPS = bestDPS;
      let bestItemBreakdown: string[] = bestBreakdown;

      for (const item of available) {
        if (!canAddItem(equipped, item)) continue;
        const testItems = [...equipped, item];
        const testChampion = new Character(
          champion.Name,
          champion.HP,
          champion.HP5,
          champion.AR,
          champion.MR,
          champion.AD,
          champion.CritDMG,
          champion.MS,
          champion.AttackRange,
          Number(champion.AS),
          champion.Abilities,
          testItems
        );
        const dpsResult = testChampion.calculateDPS(targetMaxHP, targetBonusHP);
        if (dpsResult.totalDPS > bestItemDPS) {
          bestItemDPS = dpsResult.totalDPS;
          bestItem = item;
          bestItemBreakdown = dpsResult.breakdown;
        }
      }

      if (bestItem) {
        equipped.push(bestItem);
        bestDPS = bestItemDPS;
        bestBreakdown = bestItemBreakdown;
      } else {
        // No more improvements
        break;
      }
    }

    return { bestItems: equipped, bestDPS, breakdown: bestBreakdown };
  }

  const results: {
    champion: Character;
    bestItems: Item[];
    bestDPS: number;
    breakdown: string[];
  }[] = [];

  for (const champ of Characters) {
    const { bestItems, bestDPS, breakdown } = findBestItemsForChampion(champ);
    results.push({ champion: champ, bestItems, bestDPS, breakdown });
  }

  return results;
}
