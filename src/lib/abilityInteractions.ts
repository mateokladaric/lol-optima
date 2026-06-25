/**
 * Parses wiki Details (stored in Ability.specialMechanics) into sim behavior.
 * Human-authored overrides live in CHAMPION_INTERACTION_OVERRIDES when notes are ambiguous.
 */

import { CHAMPION_WIKI_PASS_OVERRIDES } from "./championWikiPassOverrides";

export type AbilityInteraction = {
  /** Ability procs item on-hit effects at this fraction (GP Q = 1, Bel'Veth Q = 0.75). */
  appliesItemOnHitScale: number;
  resetsAttackTimer: boolean;
  cooldownResetOnKill: boolean;
  /** Physical spell can crit (Gangplank Q, Nasus Q base). */
  canCrit: boolean;
  /** After casting, next attack is Lightslinger-style (Lucian passive). */
  triggersLightslinger: boolean;
};

export type ChampionInteractionProfile = {
  lightslingerOnHitInstances: number;
  abilityCooldownMultiplier?: Partial<Record<"Q" | "W" | "E" | "R", number>>;
  assumeComboKill: boolean;
  isolatedDamageMultiplier?: number;
  lucianRShotsPerCrit: boolean;
  /** Flat % armor pen from kit passives (Darius E). */
  passiveArmorPenPercent?: number;
  /** Average bonus AS% from passive stacks in a fight (Ezreal). */
  sustainedBonusAttackSpeedPercent?: number;
  /** Flat multiplier on all ability CDs after refund mechanics (Ezreal Q). */
  globalAbilityCooldownMultiplier?: number;
  /** Every-Nth missile/shot damage average (Corki R Big One = 4/3). */
  ammoCycleDamageMultiplier?: number;
  /** MF Q bounce can crit if first target dies — extra crit weight on ability. */
  bounceCritUptime?: number;
  /** Yasuo-style: multiply item/passive crit chance (150% bonus → ×2.5). */
  passiveCritChanceMultiplier?: number;
  /** Base crit % before passive multiplier (Yasuo/Yone innate). */
  passiveBaseCritChancePercent?: number;
  /** Scale only the bonus portion of crit damage (Yasuo = 0.9). */
  passiveCritDamageBonusScale?: number;
  /** Bonus AD per 1% crit chance above 100% after multiplier. */
  bonusADPerOverflowCritPercent?: number;
  /** Average Siphoning Strike stacks in a duel (Nasus Q). */
  averageSiphoningStacks?: number;
  /** MF R: bonus damage per wave when a crit procs (20 = +20%). */
  channelWaveCritBonusPercent?: number;
  /** Amplify passive on-hit when Soul Nails are consumed (Locke). */
  soulNailPassiveAmp?: number;
  /** Last Breath: % armor ignored on crits (Yasuo R = 60). */
  rCritArmorPenPercent?: number;
  /** Fraction of fight with R armor-ignore active (15s / ~40s cycle). */
  rCritArmorPenUptime?: number;
  /** Grey-health recast heal HPS (Locke W). */
  greyHealthHealHPS?: number;
  /** Combo finisher execute threshold (% target max HP, Locke R). */
  comboExecuteMaxHealthPercent?: number;
  /** Bonus HP while ultimate is active (Nasus R). */
  ultimateBonusHP?: number;
  /** Fraction of fight with ultimate bonus HP active. */
  ultimateBonusHPUptime?: number;
  /** Fraction of fight in melee range for forked abilities (Samira Q). */
  meleeAbilityUptime?: number;
  /** Extra damage on melee-fork abilities at full uptime. */
  meleeAbilityDamageBonus?: number;
  /** Average stacks on stack-scaled abilities (Yasuo E). */
  averageAbilityStacks?: Partial<Record<"Q" | "W" | "E" | "R", number>>;
  /** Damage multiplier per stack (0.25 = +25% per stack). */
  abilityStackDamagePerStack?: number;
  /** Max stacks for stack-scaled abilities. */
  abilityStackDamageCap?: number;
  /** Flat bonus when Soul Nails are consumed on empowered hit (Locke E). */
  soulNailConsumeBonus?: number;
  /** Extra execute threshold % per Sealed Champion stack (Locke R). */
  sealedChampionExecuteBonusPerStack?: number;
  /** Assumed Sealed Champion stacks when combo kill is modeled. */
  sealedChampionStacks?: number;
  /** Style-grade damage amp before ult gate (Samira). */
  styleGradeDamageAmp?: number;
  /** Ability names → hit count multiplier (Viego Q = 2). */
  abilityHitMultipliers?: Record<string, number>;
  /** Fraction of autos that get post-ability double-hit (Viego passive). */
  postAbilityDoubleHitUptime?: number;
  /** Flat bonus crit chance from kit resource (Tryndamere Fury). */
  averagePassiveCritChancePercent?: number;
  /** Max bonus AD from missing-HP passive (Tryndamere Q). */
  missingHPBonusADMax?: number;
  /** Multiplier on auto attack damage (Bel'Veth passive = 0.75). */
  autoAttackDamageMultiplier?: number;
  /** Soul Unbound-style echo of combo damage (Yone E). */
  comboDamageEchoPercent?: number;
  /** % max HP per second per Ablaze stack (Brand passive). */
  blazeDotPerStackMaxHPPercent?: number;
  /** Average Ablaze stacks in sustained fight. */
  averageBlazeStacks?: number;
  /** Damage amp when target has Ablaze (Brand W = 1.25). */
  ablazeAbilityDamageAmp?: number;
  /** Graves shotgun single-target AD ratio vs one pellet. */
  shotgunAutoAdRatio?: number;
  /** Tristana E average stack multiplier (4 stacks × 25%). */
  explosiveChargeStackMultiplier?: number;
  /** Varus W: average stacks detonated when Q/W/E/R pop Blight. */
  blightDetonationAvgStacks?: number;
  /** Varus W: % target max HP magic damage per Blight stack on detonation. */
  blightDetonationMaxHPPercentPerStack?: number;
  /** Dampen bonus AS scaling (Kalista Martial Poise = 0.75). */
  bonusAttackSpeedScale?: number;
  /** Every Nth auto deals % target max HP true (Vayne W). */
  everyNthHitTrueMaxHPPercent?: number;
  everyNthHit?: number;
  /** Flat + AP poison/venom DPS per stack (Twitch, Teemo). */
  stackDotBasePerSecond?: number;
  stackDotAPRatioPerSecond?: number;
  averageDotStacks?: number;
  stackDotDamageType?: "magic" | "true";
  /** Toggle ability sustained uptime (Singed Q). */
  toggleDotUptime?: number;
  /** Post-cast empowered auto bonus AD% (Xayah Clean Cuts). */
  postAbilityEmpoweredAutoAdPercent?: number;
  postAbilityEmpoweredUptime?: number;
};

type AbilityLike = {
  name: string;
  abilityType: string;
  specialMechanics?: string[];
};

const DEFAULT_INTERACTION: AbilityInteraction = {
  appliesItemOnHitScale: 0,
  resetsAttackTimer: false,
  cooldownResetOnKill: false,
  canCrit: false,
  triggersLightslinger: false,
};

const DEFAULT_CHAMPION_PROFILE: ChampionInteractionProfile = {
  lightslingerOnHitInstances: 1,
  assumeComboKill: false,
  lucianRShotsPerCrit: false,
};

/** Explicit overrides where notes alone are insufficient. */
export const CHAMPION_INTERACTION_OVERRIDES: Record<
  string,
  Partial<ChampionInteractionProfile>
> = {
  Lucian: {
    lightslingerOnHitInstances: 1.4,
    abilityCooldownMultiplier: { E: 0.58 },
    lucianRShotsPerCrit: true,
  },
  Belveth: { lightslingerOnHitInstances: 1 },
  BelVeth: {
    lightslingerOnHitInstances: 1,
    autoAttackDamageMultiplier: 0.75,
    sustainedBonusAttackSpeedPercent: 32,
  },
  Gangplank: {},
  Irelia: { assumeComboKill: true },
  Khazix: { assumeComboKill: true, isolatedDamageMultiplier: 2.1 },
  KhaZix: { assumeComboKill: true, isolatedDamageMultiplier: 2.1 },
  Ezreal: {
    sustainedBonusAttackSpeedPercent: 38,
    globalAbilityCooldownMultiplier: 0.82,
  },
  Corki: {
    sustainedBonusAttackSpeedPercent: 0,
    ammoCycleDamageMultiplier: 4 / 3,
  },
  Darius: { passiveArmorPenPercent: 40 },
  Jax: {},
  Nasus: {
    averageSiphoningStacks: 120,
    abilityCooldownMultiplier: { Q: 0.72 },
    ultimateBonusHP: 600,
    ultimateBonusHPUptime: 0.38,
  },
  MissFortune: {
    bounceCritUptime: 0.35,
    channelWaveCritBonusPercent: 20,
    sustainedBonusAttackSpeedPercent: 32,
  },
  Samira: {
    assumeComboKill: true,
    abilityCooldownMultiplier: { R: 3.25 },
    sustainedBonusAttackSpeedPercent: 22,
    meleeAbilityUptime: 0.6,
    meleeAbilityDamageBonus: 0.08,
    styleGradeDamageAmp: 1.06,
  },
  Yasuo: {
    passiveBaseCritChancePercent: 18,
    passiveCritChanceMultiplier: 2.5,
    passiveCritDamageBonusScale: 0.9,
    bonusADPerOverflowCritPercent: 0.5,
    rCritArmorPenPercent: 60,
    rCritArmorPenUptime: 0.38,
    averageAbilityStacks: { E: 1.5 },
    abilityStackDamagePerStack: 0.25,
    abilityStackDamageCap: 2,
  },
  Locke: {
    soulNailPassiveAmp: 1.35,
    assumeComboKill: true,
    greyHealthHealHPS: 28,
    comboExecuteMaxHealthPercent: 11,
    soulNailConsumeBonus: 95,
    sealedChampionExecuteBonusPerStack: 0.5,
    sealedChampionStacks: 2,
  },
  Gwen: {
    sustainedBonusAttackSpeedPercent: 28,
  },
  Viego: {
    postAbilityDoubleHitUptime: 0.42,
    abilityHitMultipliers: { "Blade of the Ruined King": 2 },
  },
  Kayle: {
    sustainedBonusAttackSpeedPercent: 30,
  },
  Yone: {
    passiveBaseCritChancePercent: 18,
    passiveCritChanceMultiplier: 2.5,
    passiveCritDamageBonusScale: 0.9,
    comboDamageEchoPercent: 30,
  },
  Tryndamere: {
    averagePassiveCritChancePercent: 35,
    missingHPBonusADMax: 30,
  },
  Brand: {
    blazeDotPerStackMaxHPPercent: 2,
    averageBlazeStacks: 2.5,
    ablazeAbilityDamageAmp: 1.2,
  },
  Draven: {
    sustainedBonusAttackSpeedPercent: 28,
  },
  Tristana: {
    explosiveChargeStackMultiplier: 2,
    sustainedBonusAttackSpeedPercent: 35,
  },
  Graves: {
    shotgunAutoAdRatio: 1.55,
    abilityCooldownMultiplier: { E: 0.62 },
  },
  Gnar: {
    sustainedBonusAttackSpeedPercent: 18,
  },
};

function notesText(ability: AbilityLike): string {
  return (ability.specialMechanics ?? []).join(" ").toLowerCase();
}

export function parseAbilityInteraction(ability: AbilityLike): AbilityInteraction {
  const notes = notesText(ability);
  const out = { ...DEFAULT_INTERACTION };

  const onHitMatch = notes.match(
    /applies on-hit(?:\s+effects)?(?:\s+as\s+\w+\s+attack)?(?:\s*\((\d+(?:\.\d+)?)%\))?/i,
  );
  if (onHitMatch) {
    out.appliesItemOnHitScale = onHitMatch[1]
      ? Number(onHitMatch[1]) / 100
      : 1;
  } else if (
    notes.includes("applies on-hit") ||
    notes.includes("on-attack effects")
  ) {
    out.appliesItemOnHitScale = 1;
  }

  if (
    notes.includes("resets auto attack timer") ||
    notes.includes("resets aa timer") ||
    notes.includes("resets basic attack")
  ) {
    out.resetsAttackTimer = true;
  }

  if (
    notes.includes("resets on kill") ||
    notes.includes("reset on kill") ||
    notes.includes("resets on champion takedown") ||
    notes.includes("reset on champion takedown") ||
    notes.includes("resets on takedown") ||
    notes.includes("cooldown resets on takedown")
  ) {
    out.cooldownResetOnKill = true;
  }

  if (notes.includes("can crit") || notes.includes("affected by crit")) {
    out.canCrit = true;
  }

  if (
    ability.name === "Lightslinger" ||
    notes.includes("fires two shots") ||
    notes.includes("second shot")
  ) {
    out.triggersLightslinger = true;
  }

  switch (ability.name) {
    case "Relentless Pursuit":
    case "Empower":
    case "Crippling Strike":
      out.resetsAttackTimer = true;
      break;
    case "Parrrley":
      out.appliesItemOnHitScale = 1;
      out.canCrit = true;
      break;
    case "Void Surge":
      out.appliesItemOnHitScale = 0.75;
      out.resetsAttackTimer = true;
      break;
    case "Bladesurge":
    case "Leap":
    case "Wild Rush":
    case "Ashen Pursuit":
      out.cooldownResetOnKill = true;
      break;
    case "Mystic Shot":
      out.appliesItemOnHitScale = 1;
      break;
    case "Siphoning Strike":
      out.resetsAttackTimer = true;
      out.canCrit = true;
      out.appliesItemOnHitScale = 1;
      break;
    case "Double Up":
      out.canCrit = true;
      break;
    case "Steel Tempest":
    case "Mortal Steel":
    case "Inferno Trigger":
    case "Last Breath":
      out.canCrit = true;
      break;
    default:
      break;
  }

  return out;
}

export function championSimKey(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, "");
}

export function getChampionInteractionProfile(
  championName: string,
): ChampionInteractionProfile {
  const key = championSimKey(championName);
  const core =
    CHAMPION_INTERACTION_OVERRIDES[key] ??
    CHAMPION_INTERACTION_OVERRIDES[championName];
  const wiki =
    CHAMPION_WIKI_PASS_OVERRIDES[key] ??
    CHAMPION_WIKI_PASS_OVERRIDES[championName];
  return { ...DEFAULT_CHAMPION_PROFILE, ...wiki, ...core };
}

export function spellbladeUptimeFromAttackRate(attackRate: number): number {
  if (attackRate <= 0) return 0;
  return Math.min(1, 1 / (attackRate * 1.5));
}

export function effectiveSpellbladeUptime(
  attackRate: number,
  abilityResetHitsPerSec: number,
): number {
  const base = spellbladeUptimeFromAttackRate(attackRate);
  if (abilityResetHitsPerSec <= 0) return base;
  const resetProcRate = Math.min(0.7, abilityResetHitsPerSec / (1 / 1.5));
  return Math.min(1, base + resetProcRate * (1 - base * 0.5));
}

export function critScaledAbilityDamage(
  baseDamage: number,
  critChancePercent: number,
  critDamagePercent: number,
  critDamageBonusScale = 1,
): number {
  const c = Math.min(100, Math.max(0, critChancePercent)) / 100;
  const bonus = Math.max(0, critDamagePercent - 100) * critDamageBonusScale;
  const mult = 1 + bonus / 100;
  return baseDamage * (1 - c + c * mult);
}

/** Effective crit chance / damage after champion passive forks (Yasuo). */
export function resolveChampionCritStats(
  baseCritChance: number,
  baseCritDamage: number,
  profile: ChampionInteractionProfile,
): {
  critChance: number;
  critDamage: number;
  overflowAD: number;
} {
  const rawChance =
    (baseCritChance + (profile.passiveBaseCritChancePercent ?? 0)) *
    (profile.passiveCritChanceMultiplier ?? 1);
  const critChance = Math.min(100, rawChance);
  const bonusScale = profile.passiveCritDamageBonusScale ?? 1;
  const critDamage =
    100 + Math.max(0, baseCritDamage - 100) * bonusScale;
  const overflowAD =
    profile.bonusADPerOverflowCritPercent && rawChance > 100
      ? (rawChance - 100) * profile.bonusADPerOverflowCritPercent
      : 0;
  return { critChance, critDamage, overflowAD };
}

export function missFortuneRChannelCritDamage(
  perWaveDamage: number,
  waveCount: number,
  critChancePercent: number,
  waveCritBonusPercent: number,
): number {
  const c = Math.min(100, Math.max(0, critChancePercent)) / 100;
  const perWaveMult = 1 + c * (waveCritBonusPercent / 100);
  return perWaveDamage * waveCount * perWaveMult;
}

/** MF Q: ~half the damage is on the bounce which can crit on kill. */
export function missFortuneQBounceCritDamage(
  firstTargetDamage: number,
  critChancePercent: number,
  critDamagePercent: number,
  bounceCritUptime: number,
): number {
  const bounceDamage = firstTargetDamage * 1.85;
  const total = firstTargetDamage + bounceDamage;
  const c = Math.min(100, Math.max(0, critChancePercent)) / 100;
  const mult = 1 + Math.max(0, critDamagePercent - 100) / 100;
  const bounceCritBonus =
    bounceDamage * c * (mult - 1) * Math.max(0, Math.min(1, bounceCritUptime));
  return total + bounceCritBonus;
}

export function lucianRCritShotMultiplier(critChancePercent: number): number {
  const baseShots = 28;
  const extraShots = Math.floor(Math.min(100, critChancePercent) / 4);
  return (baseShots + extraShots) / baseShots;
}

/** Parse "Armor reduction: 30-50%" style wiki Details. */
export function parseArmorReductionPercent(
  ability: AbilityLike,
  rank: number,
): number {
  const notes = notesText(ability);
  const rangeMatch = notes.match(/armor reduction:\s*(\d+)\s*-\s*(\d+)/);
  if (rangeMatch) {
    const low = Number(rangeMatch[1]);
    const high = Number(rangeMatch[2]);
    const idx = Math.max(0, Math.min(rank - 1, 4));
    return low + ((high - low) * idx) / 4;
  }
  const labelMatch = notes.match(/armor reduction:\s*(\d+)/);
  if (labelMatch) return Number(labelMatch[1]);
  const inflictMatch = notes.match(/(\d+)%\s*armor reduction/);
  if (inflictMatch) return Number(inflictMatch[1]);
  return 0;
}

/** Yasuo/Yone Q: CD = base / (1 + bonus AS), floored at minCooldown. */
export function attackSpeedScaledAbilityCooldown(
  baseCooldown: number,
  bonusAttackSpeedPercent: number,
  minCooldown = 1.33,
): number {
  const bonus = Math.max(0, bonusAttackSpeedPercent) / 100;
  return Math.max(minCooldown, baseCooldown / (1 + bonus));
}

export function yasuoSteelTempestCooldown(bonusAttackSpeedPercent: number): number {
  return attackSpeedScaledAbilityCooldown(4, bonusAttackSpeedPercent);
}

export function abilityUsesAttackSpeedScaledCooldown(ability: AbilityLike): boolean {
  const notes = notesText(ability);
  return notes.includes("cd scales with as");
}

export type AbilityDoTSpec = {
  dotPerSecond: number;
  duration: number;
  /** Ability damage field is total spread over duration (MF E). */
  totalOverDuration: boolean;
  /** Initial burst is separate from per-second ticks (Nasus E). */
  hasSeparateInitial: boolean;
};

type AbilityDoTLike = AbilityLike & {
  effects?: { duration?: number };
};

function abilityRankIndex(rank: number): number {
  return Math.max(0, Math.min(rank - 1, 4));
}

function interpolateRankRange(
  low: number,
  high: number,
  rank: number,
): number {
  const idx = abilityRankIndex(rank);
  return low + ((high - low) * idx) / 4;
}

/** Parse wiki Details for DoT-over-duration patterns. */
export function parseAbilityDoTSpec(
  ability: AbilityDoTLike,
  rank: number,
  ap: number,
): AbilityDoTSpec | null {
  const notes = notesText(ability);

  const dotMatch = notes.match(
    /dot:\s*(\d+)\s*-\s*(\d+)(?:\s*\(\+(\d+(?:\.\d+)?)%\s*ap\))?/i,
  );
  if (dotMatch) {
    let dotPerSec = interpolateRankRange(
      Number(dotMatch[1]),
      Number(dotMatch[2]),
      rank,
    );
    if (dotMatch[3]) {
      dotPerSec += (ap * Number(dotMatch[3])) / 100;
    }
    const durMatch = notes.match(/duration:\s*(\d+)s/);
    const duration =
      durMatch != null
        ? Number(durMatch[1])
        : (ability.effects?.duration ?? 5);
    return {
      dotPerSecond: dotPerSec,
      duration,
      totalOverDuration: false,
      hasSeparateInitial: true,
    };
  }

  const overMatch = notes.match(/over\s*(\d+(?:\.\d+)?)s/);
  if (overMatch) {
    const duration = Number(overMatch[1]);
    return {
      dotPerSecond: 0,
      duration,
      totalOverDuration: true,
      hasSeparateInitial: false,
    };
  }

  const stackDotMatch = notes.match(
    /(\d+(?:\.\d+)?)%\s*max hp over (\d+)s per stack/i,
  );
  if (stackDotMatch) {
    return {
      dotPerSecond: Number(stackDotMatch[1]),
      duration: Number(stackDotMatch[2]),
      totalOverDuration: false,
      hasSeparateInitial: false,
    };
  }

  return null;
}

/** Add separate DoT ticks to instant ability damage. */
export function abilityDamageWithDoT(
  instantDamage: number,
  spec: AbilityDoTSpec,
): number {
  if (spec.totalOverDuration) return instantDamage;
  if (!spec.hasSeparateInitial) return instantDamage;
  return instantDamage + spec.dotPerSecond * spec.duration;
}

export function stackScaledAbilityDamage(
  baseDamage: number,
  averageStacks: number,
  perStackMultiplier: number,
  maxStacks: number,
): number {
  const stacks = Math.min(maxStacks, Math.max(0, averageStacks));
  return baseDamage * (1 + perStackMultiplier * stacks);
}
