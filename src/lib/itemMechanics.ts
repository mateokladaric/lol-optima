/**
 * In-game-accurate item passive modeling for 1v1 DPS simulation.
 * Replaces static stat hacks in buildOptimizer with mechanics tied to attack rate,
 * ability cadence, burn refresh, ICDs, and duel timing.
 */

import type { Character, Item, ItemStats } from "@/app/actions/sim";
import { championBaseStatsAtLevel } from "@/app/actions/sim";

function spellbladeUptime(attackRate: number): number {
  if (attackRate <= 0) return 0;
  return Math.min(1, 1 / (attackRate * 1.5));
}

export type ItemMechanicContext = {
  level: number;
  attackRate: number;
  comboWindowSeconds: number;
  targetMaxHP: number;
  targetBonusHP: number;
  avgCurrentHPRatio: number;
  melee: boolean;
  attackRange: number;
  championBaseHP: number;
  championBaseAD: number;
  /** 1v1: assume one champion takedown mid-fight for stack items. */
  duelTakedownAtSeconds: number;
  takedownCount: number;
};

export type ItemMechanicContributions = {
  /** Zeroes misleading flat stats already modeled below. */
  statSuppress: Partial<Record<keyof ItemStats, boolean>>;
  bonusAD: number;
  bonusAPPercent: number;
  magicResistReduction: number;
  /** Carve-style % armor reduction on target (Black Cleaver). */
  armorReduction: number;
  armorPen: number;
  percentMagicPen: number;
  /**
   * Effective % damage amp on target after Hypershot uptime (replaces flat item stat).
   * e.g. 10% amp × 0.8 ranged uptime → 8%.
   */
  effectiveDamageAmplificationOnTarget: number;
  dotMagicDPS: number;
  onHitPhysPerAttack: number;
  onHitMagicPerAttack: number;
  abilityPhysDPS: number;
  abilityMagicDPS: number;
  abilityTrueDPS: number;
  /** Extra ult casts worth of effective ability haste on R over the combo window. */
  ultEffectiveHasteBonus: number;
  /** Retribution-style missing-HP AD% (Overlord's Bloodmail). */
  bonusAdMultiplicativePercent: number;
  /** Juxtaposition / Wrath stack attack speed (Guinsoo's). */
  bonusAttackSpeed: number;
  /** Added to stats before damage (Rod of Ages ramp, etc.). */
  bonusAP: number;
  bonusHP: number;
  bonusMana: number;
  bonusCritChance: number;
  /** Everrising / Focus / Void Corruption style amps. */
  bonusDamageMultiplicativePercent: number;
  /** Combo-window burst (Rocketbelt, Luden's echo, etc.). */
  burstPhys: number;
  burstMagic: number;
  burstTrue: number;
  /** Time-averaged shield HP for EHP (Sterak-style passives use item stats). */
  shieldValue: number;
  breakdown: string[];
};

/** Item groups with bespoke passive simulation in this module. */
export const MODELED_ITEM_GROUPS = [
  "Kraken Slayer",
  "Stormrazor",
  "Hubris",
  "Terminus",
  "Blight",
  "Blackfire Torch",
  "Malignance",
  "Horizon Focus",
  "Axiom Arc",
  "Black Cleaver",
  "Overlord's Bloodmail",
  "Guinsoo's Rageblade",
  "Eclipse",
  "Stormsurge",
  "Luden's Echo",
  "Statikk Shiv",
  "Voltaic Cyclosword",
  "Riftmaker",
  "Spear of Shojin",
  "Hextech Rocketbelt",
  "Hextech Gunblade",
  "Eternity",
  "Immolate",
  "Momentum",
  "Yun Tal Wildarrows",
  "Sundered Sky",
  "Bastionbreaker",
  "Liandry's Torment",
] as const;

const BURN_DURATION = 3;

/** Ever Rising Moon — live values (melee / ranged). */
export const ECLIPSE_ICD_SECONDS = 6;
export const ECLIPSE_MELEE_MAX_HP_PERCENT = 6;
export const ECLIPSE_RANGED_MAX_HP_PERCENT = 4;
export const ECLIPSE_SHIELD_BASE_MELEE = 160;
export const ECLIPSE_SHIELD_BASE_RANGED = 80;
export const ECLIPSE_SHIELD_BONUS_AD_MELEE_PERCENT = 50;
export const ECLIPSE_SHIELD_BONUS_AD_RANGED_PERCENT = 25;
export const ECLIPSE_SHIELD_DURATION_SECONDS = 2;

/** Shaped Charge — live values (melee / ranged), 45s ICD. */
export const BASTIONBREAKER_ICD_SECONDS = 45;
export const BASTIONBREAKER_TRUE_BASE_MELEE = 30;
export const BASTIONBREAKER_TRUE_LETHALITY_MELEE = 1.5;
export const BASTIONBREAKER_TRUE_BASE_RANGED = 15;
export const BASTIONBREAKER_TRUE_LETHALITY_RANGED = 0.75;

/** Liandry's Torment — 2% target max HP per second while burn is active (3s, refreshed on ability hit). */
export const LIANDRY_BURN_MAX_HP_PERCENT_PER_SEC = 2;

function eclipseProcsPerSecond(hitRate: number): number {
  if (hitRate <= 0) return 0;
  // Two separate hits within ~2s; sustained combat ≈ half the raw hit rate builds stacks.
  return Math.min(hitRate / 2, 1 / ECLIPSE_ICD_SECONDS);
}

/** Hypershot: +10% damage vs champions when damaging from 600+ units (wiki). */
export const HORIZON_HYPERSHOT_AMP_PERCENT = 10;
/** Share of ability damage that procs Hypershot in 1v1 — fixed by body type, not per-champion combo. */
export const HORIZON_HYPERSHOT_UPTIME_MELEE = 0.3;
export const HORIZON_HYPERSHOT_UPTIME_RANGED = 0.8;

function hasGroup(items: Item[], group: string): boolean {
  return items.some((i) => i.getGroupName() === group);
}

function avgTerminusStacks(attackRate: number, windowSec: number): number {
  const cap = 30;
  const built = attackRate * windowSec;
  if (built <= 0) return 0;
  if (built <= cap) return built / 2;
  const rampSec = cap / attackRate;
  return (cap * rampSec + cap * (windowSec - rampSec)) / windowSec;
}

function burnUptime(hitsPerSecond: number, duration: number): number {
  if (hitsPerSecond <= 0) return 0;
  return Math.min(1, hitsPerSecond * duration);
}

function hubrisBonusAD(
  ctx: ItemMechanicContext,
  takedowns: number,
): number {
  const base = 12;
  const perTrigger = 3;
  const triggers = Math.max(0, takedowns);
  const fullBonus = base + perTrigger * triggers;
  const activeSec = Math.max(
    0,
    ctx.comboWindowSeconds - ctx.duelTakedownAtSeconds,
  );
  const uptime = activeSec / Math.max(ctx.comboWindowSeconds, 0.1);
  return fullBonus * uptime;
}

function krakenProcDamage(
  melee: boolean,
  level: number,
  avgCurrentHPRatio: number,
): number {
  const base = melee ? 175 : 140;
  const missingBonus = 0.75 * (1 - avgCurrentHPRatio);
  const levelScale = 0.85 + (level / 18) * 0.15;
  return base * levelScale * (1 + missingBonus);
}

function stormrazorProcPerAttack(attackRate: number): number {
  const ENERGIZE_MAX = 100;
  const STACKS_PER_AUTO = 12;
  const BOLT_DAMAGE = 100;
  if (attackRate <= 0) return 0;
  const autosToProc = ENERGIZE_MAX / STACKS_PER_AUTO;
  return BOLT_DAMAGE / autosToProc;
}

/** Energized on-hit (Statikk / Voltaic): stacks per auto until 100, then proc. */
function energizedMagicPerAuto(
  attackRate: number,
  boltDamage: number,
  stacksPerAuto: number,
): number {
  if (attackRate <= 0) return 0;
  return boltDamage / (100 / stacksPerAuto);
}

function icdAbilityProcDps(
  procDamage: number,
  icdSeconds: number,
  abilityHitsPerSec: number,
): number {
  if (procDamage <= 0 || icdSeconds <= 0) return 0;
  const procsPerSec = Math.min(abilityHitsPerSec, 1 / icdSeconds);
  return procDamage * procsPerSec;
}

function comboProcs(windowSec: number, icdSeconds: number): number {
  return Math.max(1, Math.floor(windowSec / Math.max(icdSeconds, 0.5)));
}

export function buildItemMechanicContext(
  champion: Character,
  mit: { comboWindowSeconds: number },
  sim: {
    level: number;
    avgCurrentHPRatio: number;
    spellOnlyNoAutos: boolean;
  },
  stats: { as: number },
  targetMaxHP: number,
  targetBonusHP: number,
): ItemMechanicContext {
  const window = mit.comboWindowSeconds;
  return {
    level: sim.level,
    attackRate: sim.spellOnlyNoAutos ? 0 : stats.as,
    comboWindowSeconds: window,
    targetMaxHP,
    targetBonusHP,
    avgCurrentHPRatio: sim.avgCurrentHPRatio,
    melee: champion.AttackRange <= 250,
    attackRange: champion.AttackRange,
    championBaseHP: championBaseStatsAtLevel(champion, sim.level).hp,
    championBaseAD: championBaseStatsAtLevel(champion, sim.level).ad,
    duelTakedownAtSeconds: window * 0.5,
    takedownCount: 1,
  };
}

export function computeItemMechanicContributions(
  items: Item[],
  ctx: ItemMechanicContext,
  stats: ItemStats & { ad: number; ap: number; mana: number },
  abilityHitsPerSec: number,
): ItemMechanicContributions {
  const out: ItemMechanicContributions = {
    statSuppress: {},
    bonusAD: 0,
    bonusAPPercent: 0,
    magicResistReduction: 0,
    armorReduction: 0,
    armorPen: 0,
    percentMagicPen: 0,
    effectiveDamageAmplificationOnTarget: 0,
    dotMagicDPS: 0,
    onHitPhysPerAttack: 0,
    onHitMagicPerAttack: 0,
    abilityPhysDPS: 0,
    abilityMagicDPS: 0,
    abilityTrueDPS: 0,
    ultEffectiveHasteBonus: 0,
    bonusAdMultiplicativePercent: 0,
    bonusAttackSpeed: 0,
    bonusAP: 0,
    bonusHP: 0,
    bonusMana: 0,
    bonusCritChance: 0,
    bonusDamageMultiplicativePercent: 0,
    burstPhys: 0,
    burstMagic: 0,
    burstTrue: 0,
    shieldValue: 0,
    breakdown: [],
  };

  // 1v1 duel: Hydra cleave / Stridebreaker shockwave only hits secondary targets.
  for (const item of items) {
    if (
      item.stats.physicalAoEOnHitADPercent ||
      item.stats.physicalAoEOnHitMaxHealthPercent
    ) {
      out.statSuppress.physicalAoEOnHitADPercent = true;
      out.statSuppress.physicalAoEOnHitMaxHealthPercent = true;
    }
  }

  if (hasGroup(items, "Kraken Slayer")) {
    out.statSuppress.physicalOnHit = true;
    const proc = krakenProcDamage(
      ctx.melee,
      ctx.level,
      ctx.avgCurrentHPRatio,
    );
    const procsPerSec = ctx.attackRate / 3;
    const dps = proc * procsPerSec;
    out.onHitPhysPerAttack += proc / 3;
    out.breakdown.push(
      `Kraken (every 3rd AA): ~${dps.toFixed(1)} DPS (${proc.toFixed(0)} dmg, ${(0.75 * (1 - ctx.avgCurrentHPRatio) * 100).toFixed(0)}% missing-HP bonus)`,
    );
  }

  if (hasGroup(items, "Stormrazor")) {
    out.statSuppress.magicPeriodicOnHit = true;
    const perAuto = stormrazorProcPerAttack(ctx.attackRate);
    out.onHitMagicPerAttack += perAuto;
    out.breakdown.push(
      `Stormrazor Bolt: +${(perAuto * ctx.attackRate).toFixed(1)} DPS (${perAuto.toFixed(1)} magic per AA, 100 energize)`,
    );
  }

  if (hasGroup(items, "Hubris")) {
    const bonus = hubrisBonusAD(ctx, ctx.takedownCount);
    out.bonusAD += bonus;
    out.breakdown.push(
      `Hubris Eminence: +${bonus.toFixed(0)} AD (${ctx.takedownCount} takedown, ${((ctx.comboWindowSeconds - ctx.duelTakedownAtSeconds) / ctx.comboWindowSeconds * 100).toFixed(0)}% fight uptime)`,
    );
  }

  if (hasGroup(items, "Terminus") && ctx.attackRate > 0) {
    out.statSuppress.magicOnHit = true;
    const avgStacks = avgTerminusStacks(
      ctx.attackRate,
      ctx.comboWindowSeconds,
    );
    const frac = avgStacks / 30;
    out.onHitMagicPerAttack += 30 * frac;
    out.armorPen += 30 * frac;
    out.percentMagicPen += 30 * frac;
    out.breakdown.push(
      `Terminus Juxtaposition: ~${avgStacks.toFixed(1)} avg stacks (${(frac * 100).toFixed(0)}% max on-hit/pen)`,
    );
  }

  if (hasGroup(items, "Blight")) {
    out.statSuppress.magicResistReduction = true;
    const maxStacks = 4;
    const hitsPerSec = Math.max(abilityHitsPerSec, 0.25);
    const secToMax = maxStacks / hitsPerSec;
    const window = ctx.comboWindowSeconds;
    let avgStacks: number;
    if (window >= secToMax + 2) {
      avgStacks = maxStacks;
    } else {
      const built = hitsPerSec * window;
      avgStacks = Math.min(maxStacks, built / 2);
    }
    out.magicResistReduction = 7.5 * avgStacks;
    out.breakdown.push(
      `Bloodletter Blight: ~${avgStacks.toFixed(1)} stacks (${out.magicResistReduction.toFixed(1)}% MR shred)`,
    );
  }

  if (hasGroup(items, "Blackfire Torch")) {
    out.statSuppress.magicDotDamage = true;
    out.statSuppress.magicDotDamagePerAPRatio = true;
    out.statSuppress.apPerBurnedTargetMultiplicative = true;
    const burnTotal = 60 + stats.ap * 0.12;
    const burnDPS = burnTotal / BURN_DURATION;
    const uptime = burnUptime(abilityHitsPerSec, BURN_DURATION);
    out.dotMagicDPS += burnDPS * uptime;
    out.bonusAPPercent += 4;
    out.breakdown.push(
      `Blackfire Baleful Blaze: ${(burnDPS * uptime).toFixed(1)} DPS (${burnTotal.toFixed(0)} over ${BURN_DURATION}s, ${(uptime * 100).toFixed(0)}% uptime, +4% AP)`,
    );
  }

  if (hasGroup(items, "Malignance")) {
    out.statSuppress.magicDotDamage = true;
    out.statSuppress.magicDotDamagePerAPRatio = true;
    out.statSuppress.magicResistReduction = true;
    const burnTotal = 60 + stats.ap * 0.1;
    const burnDPS = burnTotal / BURN_DURATION;
    const uptime = burnUptime(abilityHitsPerSec, BURN_DURATION);
    out.dotMagicDPS += burnDPS * uptime;
    out.magicResistReduction = 10 * uptime;
    out.breakdown.push(
      `Malignance burn: ${(burnDPS * uptime).toFixed(1)} DPS (${burnTotal.toFixed(0)} over ${BURN_DURATION}s, ${(uptime * 100).toFixed(0)}% burn, ${out.magicResistReduction.toFixed(0)}% MR shred)`,
    );
  }

  if (hasGroup(items, "Horizon Focus")) {
    out.statSuppress.damageAmplificationOnTarget = true;
    const uptime = ctx.melee
      ? HORIZON_HYPERSHOT_UPTIME_MELEE
      : HORIZON_HYPERSHOT_UPTIME_RANGED;
    out.effectiveDamageAmplificationOnTarget =
      HORIZON_HYPERSHOT_AMP_PERCENT * uptime;
    const body = ctx.melee ? "melee" : "ranged";
    out.breakdown.push(
      `Horizon Hypershot (${body}): +${out.effectiveDamageAmplificationOnTarget.toFixed(1)}% effective damage amp (${HORIZON_HYPERSHOT_AMP_PERCENT}% × ${(uptime * 100).toFixed(0)}% hits from 600+ units)`,
    );
  }

  if (hasGroup(items, "Black Cleaver")) {
    out.statSuppress.armorReduction = true;
    const physHitsPerSec =
      abilityHitsPerSec + (ctx.attackRate > 0 ? ctx.attackRate : 0);
    const maxStacks = 6;
    const hitsPerSec = Math.max(physHitsPerSec, 0.3);
    const secToMax = maxStacks / hitsPerSec;
    let avgStacks: number;
    if (ctx.comboWindowSeconds >= secToMax + 1) {
      avgStacks = maxStacks;
    } else {
      avgStacks = Math.min(maxStacks, (hitsPerSec * ctx.comboWindowSeconds) / 2);
    }
    out.armorReduction = avgStacks * 5;
    out.breakdown.push(
      `Black Cleaver Carve: ~${avgStacks.toFixed(1)} stacks (${out.armorReduction}% armor reduction)`,
    );
  }

  if (hasGroup(items, "Overlord's Bloodmail")) {
    out.statSuppress.adMultiplicative = true;
    const wearerMissing = 1 - ctx.avgCurrentHPRatio;
    out.bonusAdMultiplicativePercent = 12 * Math.min(1, Math.max(0, wearerMissing));
    out.breakdown.push(
      `Overlord Retribution: +${out.bonusAdMultiplicativePercent.toFixed(1)}% AD (${(wearerMissing * 100).toFixed(0)}% avg missing HP)`,
    );
  }

  if (hasGroup(items, "Guinsoo's Rageblade") && ctx.attackRate > 0) {
    out.statSuppress.magicOnHit = true;
    const maxStacks = 11;
    const avgStacks = Math.min(
      maxStacks,
      (ctx.attackRate * ctx.comboWindowSeconds) / 2,
    );
    const wrathFrac = avgStacks / maxStacks;
    out.onHitMagicPerAttack += 30 / 3;
    out.bonusAttackSpeed = (57 - 25) * wrathFrac;
    out.breakdown.push(
      `Guinsoo's Wrath: ~${avgStacks.toFixed(1)} stacks, ${(30 / 3).toFixed(0)} avg magic/on-hit, +${out.bonusAttackSpeed.toFixed(0)}% AS`,
    );
  }

  if (hasGroup(items, "Bastionbreaker")) {
    out.statSuppress.trueOnAbilityHit = true;
    out.statSuppress.trueOnAbilityHitPerLethality = true;
    out.statSuppress.trueOnAbilityHitCooldown = true;
    const base = ctx.melee
      ? BASTIONBREAKER_TRUE_BASE_MELEE
      : BASTIONBREAKER_TRUE_BASE_RANGED;
    const perLeth = ctx.melee
      ? BASTIONBREAKER_TRUE_LETHALITY_MELEE
      : BASTIONBREAKER_TRUE_LETHALITY_RANGED;
    const proc = base + (stats.lethality ?? 0) * perLeth;
    const procDps = proc / BASTIONBREAKER_ICD_SECONDS;
    out.abilityTrueDPS += procDps;
    out.burstTrue += proc * comboProcs(ctx.comboWindowSeconds, BASTIONBREAKER_ICD_SECONDS);
    const body = ctx.melee ? "melee" : "ranged";
    out.breakdown.push(
      `Bastionbreaker Shaped Charge (${body}): ~${procDps.toFixed(1)} true DPS (${proc.toFixed(0)} / ${BASTIONBREAKER_ICD_SECONDS}s ICD)`,
    );
  }

  if (hasGroup(items, "Liandry's Torment")) {
    out.statSuppress.magicDotDamagePerTargetMaxHPRatio = true;
    const burnDPS =
      (ctx.targetMaxHP * LIANDRY_BURN_MAX_HP_PERCENT_PER_SEC) / 100;
    const uptime = burnUptime(abilityHitsPerSec, BURN_DURATION);
    out.dotMagicDPS += burnDPS * uptime;
    out.breakdown.push(
      `Liandry's Torment: ${(burnDPS * uptime).toFixed(1)} DPS (${LIANDRY_BURN_MAX_HP_PERCENT_PER_SEC}% max HP/s, ${(uptime * 100).toFixed(0)}% burn uptime)`,
    );
  }

  if (hasGroup(items, "Axiom Arc")) {
    const refund =
      (stats.ultCooldownRefundOnTakedown ?? 0) +
      (stats.lethality ?? 0) *
        (stats.ultCooldownRefundPerLethalityOnTakedown ?? 0);
    if (refund > 0 && ctx.takedownCount > 0) {
      out.ultEffectiveHasteBonus = refund * 0.5;
      out.breakdown.push(
        `Axiom Arc: ~${refund.toFixed(0)}% ult CD refund on takedown (second R in long fights)`,
      );
    }
  }

  if (hasGroup(items, "Eclipse")) {
    const maxHpPct = ctx.melee
      ? ECLIPSE_MELEE_MAX_HP_PERCENT / 100
      : ECLIPSE_RANGED_MAX_HP_PERCENT / 100;
    const procPhys = ctx.targetMaxHP * maxHpPct;
    const hitRate = abilityHitsPerSec + ctx.attackRate;
    const procsPerSec = eclipseProcsPerSecond(hitRate);
    const dps = procPhys * procsPerSec;
    out.abilityPhysDPS += dps;
    out.burstPhys +=
      procPhys * comboProcs(ctx.comboWindowSeconds, ECLIPSE_ICD_SECONDS);

    const bonusAD = Math.max(0, stats.ad - ctx.championBaseAD);
    const shieldBase = ctx.melee
      ? ECLIPSE_SHIELD_BASE_MELEE
      : ECLIPSE_SHIELD_BASE_RANGED;
    const shieldAdPct = ctx.melee
      ? ECLIPSE_SHIELD_BONUS_AD_MELEE_PERCENT
      : ECLIPSE_SHIELD_BONUS_AD_RANGED_PERCENT;
    const shieldPerProc = shieldBase + (bonusAD * shieldAdPct) / 100;
    out.shieldValue =
      shieldPerProc *
      (ECLIPSE_SHIELD_DURATION_SECONDS / ECLIPSE_ICD_SECONDS);

    const body = ctx.melee ? "melee" : "ranged";
    out.breakdown.push(
      `Eclipse Ever Rising Moon (${body}): ~${dps.toFixed(1)} DPS (${procPhys.toFixed(0)} per proc, ${ECLIPSE_ICD_SECONDS}s CD)`,
    );
    out.breakdown.push(
      `Eclipse shield: ~${out.shieldValue.toFixed(0)} avg HP (${shieldPerProc.toFixed(0)} for ${ECLIPSE_SHIELD_DURATION_SECONDS}s)`,
    );
  }

  if (hasGroup(items, "Stormsurge")) {
    const procMagic = 75 + stats.ap * 0.25;
    const dps = icdAbilityProcDps(procMagic, 15, abilityHitsPerSec);
    out.abilityMagicDPS += dps;
    out.burstMagic += procMagic * comboProcs(ctx.comboWindowSeconds, 15);
    out.breakdown.push(
      `Stormsurge: ~${dps.toFixed(1)} DPS (${procMagic.toFixed(0)} magic / 15s ICD)`,
    );
  }

  if (hasGroup(items, "Luden's Echo")) {
    const echo = 100 + stats.ap * 0.1;
    const dps = icdAbilityProcDps(echo, 10, abilityHitsPerSec);
    out.abilityMagicDPS += dps;
    out.burstMagic += echo;
    out.breakdown.push(
      `Luden's Echo: ~${dps.toFixed(1)} DPS (${echo.toFixed(0)} magic / 10s)`,
    );
  }

  if (hasGroup(items, "Statikk Shiv") && ctx.attackRate > 0) {
    const perAuto = energizedMagicPerAuto(ctx.attackRate, 120, 25);
    out.onHitMagicPerAttack += perAuto;
    out.breakdown.push(
      `Statikk Shiv: +${(perAuto * ctx.attackRate).toFixed(1)} DPS (${perAuto.toFixed(0)} magic / ~4 autos)`,
    );
  }

  if (hasGroup(items, "Voltaic Cyclosword") && ctx.attackRate > 0) {
    const perAuto = energizedMagicPerAuto(ctx.attackRate, 175, 25);
    out.onHitMagicPerAttack += perAuto;
    out.breakdown.push(
      `Voltaic Cyclosword: +${(perAuto * ctx.attackRate).toFixed(1)} DPS (${perAuto.toFixed(0)} magic / ~4 autos)`,
    );
  }

  if (hasGroup(items, "Riftmaker")) {
    out.statSuppress.damageMultiplicative = true;
    const combatUptime = 0.85;
    out.bonusDamageMultiplicativePercent = 8 * combatUptime;
    out.breakdown.push(
      `Riftmaker Void Corruption: +${out.bonusDamageMultiplicativePercent.toFixed(1)}% damage (${(combatUptime * 100).toFixed(0)}% combat uptime)`,
    );
  }

  if (hasGroup(items, "Spear of Shojin")) {
    out.statSuppress.damageMultiplicative = true;
    const ramp = Math.min(1, (abilityHitsPerSec * ctx.comboWindowSeconds) / 6);
    out.bonusDamageMultiplicativePercent = 12 * ramp;
    out.breakdown.push(
      `Spear of Shojin Focus: +${out.bonusDamageMultiplicativePercent.toFixed(1)}% damage (~${(ramp * 100).toFixed(0)}% stacks)`,
    );
  }

  if (hasGroup(items, "Hextech Rocketbelt")) {
    const active = 125 + stats.ap * 0.45;
    out.burstMagic += active;
    out.breakdown.push(`Hextech Rocketbelt active: ${active.toFixed(0)} magic (combo)`);
  }

  if (hasGroup(items, "Hextech Gunblade")) {
    const active = 170 + stats.ap * 0.85;
    out.burstMagic += active;
    out.breakdown.push(`Hextech Gunblade active: ${active.toFixed(0)} magic (combo)`);
  }

  if (hasGroup(items, "Eternity")) {
    const frac = 0.8;
    out.bonusAP += (75 - 45) * frac;
    out.bonusHP += (450 - 350) * frac;
    out.bonusMana += (800 - 500) * frac;
    out.breakdown.push(
      `Rod of Ages: +${out.bonusAP.toFixed(0)} AP, +${out.bonusHP.toFixed(0)} HP, +${out.bonusMana.toFixed(0)} mana (~80% stacks)`,
    );
  }

  if (hasGroup(items, "Immolate")) {
    const meleeUptime = ctx.melee ? 0.85 : 0.35;
    const bonusHP = Math.max(0, (stats.hp ?? 0) - ctx.championBaseHP);
    const dot = (20 + bonusHP * 0.01) * meleeUptime;
    out.statSuppress.magicDotDamage = true;
    out.statSuppress.magicDotDamagePerBonusHPRatio = true;
    out.dotMagicDPS += dot;
    out.breakdown.push(
      `Sunfire Immolate: ${dot.toFixed(1)} DPS (${(meleeUptime * 100).toFixed(0)}% melee uptime)`,
    );
  }

  if (items.some((i) => i.name.includes("Dead Man's Plate")) && ctx.attackRate > 0) {
    const frac = 0.5;
    if (ctx.attackRate > 0) {
      out.onHitPhysPerAttack += 40 * frac;
      const spellblade = (stats.ad * 1.0) * spellbladeUptime(ctx.attackRate) * frac;
      out.onHitPhysPerAttack += spellblade;
      out.breakdown.push(
        `Dead Man's Plate: +${(40 * frac + spellblade).toFixed(1)} avg on-hit (${(frac * 100).toFixed(0)}% Momentum)`,
      );
    }
  }

  if (hasGroup(items, "Yun Tal Wildarrows") && ctx.attackRate > 0) {
    out.statSuppress.critChance = true;
    const maxStacks = 11;
    const avgStacks = Math.min(
      maxStacks,
      (ctx.attackRate * ctx.comboWindowSeconds) / 2,
    );
    out.bonusCritChance = (25 * avgStacks) / maxStacks;
    out.breakdown.push(
      `Yun Tal Wildarrows: +${out.bonusCritChance.toFixed(0)}% avg crit (${avgStacks.toFixed(1)} stacks)`,
    );
  }

  if (hasGroup(items, "Sundered Sky") && ctx.attackRate > 0) {
    const crit = Math.min(
      100,
      (stats.critChance ?? 0) + (out.bonusCritChance || 0),
    );
    if (crit > 5) {
      out.bonusDamageMultiplicativePercent += (crit / 100) * 8;
      out.breakdown.push(
        `Sundered Sky: +${((crit / 100) * 8).toFixed(1)}% damage via crit strikes`,
      );
    }
  }

  for (const item of items) {
    if (!item.name.includes("Skipper")) continue;
    out.statSuppress.physicalOnHitBaseADPercent = true;
    out.statSuppress.physicalOnHitMaxHealthPercent = true;
    out.breakdown.push(
      `Hullbreaker Skipper: structure/minion on-hit excluded vs champions`,
    );
  }

  return out;
}

/** Apply suppress flags so flat item stats are not double-counted. */
export function applyStatSuppress(
  stats: ItemStats,
  suppress: Partial<Record<keyof ItemStats, boolean>>,
): void {
  for (const key of Object.keys(suppress) as (keyof ItemStats)[]) {
    if (suppress[key]) {
      (stats as Record<string, number | undefined>)[key] = 0;
    }
  }
}
