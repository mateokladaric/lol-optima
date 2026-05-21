/**
 * In-game-accurate item passive modeling for 1v1 DPS simulation.
 * Replaces static stat hacks in buildOptimizer with mechanics tied to attack rate,
 * ability cadence, burn refresh, ICDs, and duel timing.
 */

import type { Character, Item, ItemStats } from "@/app/actions/sim";

export type ItemMechanicContext = {
  level: number;
  attackRate: number;
  comboWindowSeconds: number;
  targetMaxHP: number;
  targetBonusHP: number;
  avgCurrentHPRatio: number;
  melee: boolean;
  attackRange: number;
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
  breakdown: string[];
};

const BURN_DURATION = 3;

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
    breakdown: [],
  };

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
    const burnTotal = 60 + stats.ap * 0.1;
    const burnDPS = burnTotal / BURN_DURATION;
    const uptime = burnUptime(abilityHitsPerSec, BURN_DURATION);
    out.dotMagicDPS += burnDPS * uptime;
    out.breakdown.push(
      `Malignance burn: ${(burnDPS * uptime).toFixed(1)} DPS (${burnTotal.toFixed(0)} over ${BURN_DURATION}s)`,
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
