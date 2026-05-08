import type { Item, ItemStats } from "@/app/actions/sim";

/**
 * Approximate shop gold for tie-breaking and purchase-order sorting.
 * Uses a stat→gold linear model (not patch-perfect) plus optional group overrides.
 */
const GROUP_GOLD_OVERRIDES: Record<string, number> = {
  // Tune only when stat estimate is systematically off for a whole item line.
  "Support / Jungle": 400,
  Bloodsong: 400,
  "Spellblade": 400,
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Rough combat budget for comparing variants (higher = more power in sim terms). */
export function estimateItemPowerIndex(stats: ItemStats): number {
  let p = 0;
  p += (stats.ap ?? 0) * 2.4;
  p += (stats.ad ?? 0) * 2.1;
  p += (stats.hp ?? 0) * 0.065;
  p += (stats.mana ?? 0) * 0.035;
  p += (stats.armor ?? 0) * 1.25;
  p += (stats.mr ?? 0) * 1.25;
  p += (stats.abilityHaste ?? 0) * 2.6;
  p += (stats.basicAbilityHaste ?? 0) * 2.6;
  p += (stats.ultAbilityHaste ?? 0) * 2.2;
  p += (stats.attackSpeed ?? 0) * 0.22;
  p += (stats.critChance ?? 0) * 0.12;
  p += (stats.critDmg ?? 0) * 0.06;
  p += (stats.lethality ?? 0) * 2.2;
  p += (stats.armorPen ?? 0) * 2.0;
  p += (stats.magicPen ?? 0) * 2.4;
  p += (stats.lifeSteal ?? 0) * 0.35;
  p += (stats.omnivamp ?? 0) * 0.4;
  p += (stats.ms ?? 0) * 0.35;
  p += (stats.msPercent ?? 0) * 0.25;
  p += (stats.physicalOnHit ?? 0) * 0.18;
  p += (stats.magicOnHit ?? 0) * 0.18;
  p += (stats.magicDotDamage ?? 0) * 0.14;
  p += (stats.physicalOnHitMaxHealthPercent ?? 0) * 0.45;
  p += (stats.physicalOnHitCurrentHealthPercent ?? 0) * 0.35;
  p += (stats.apMultiplicative ?? 0) * 0.55;
  p += (stats.adMultiplicative ?? 0) * 0.55;
  p += (stats.abilityDamageMultiplicative ?? 0) * 0.42;
  p += (stats.magicDamageMultiplicative ?? 0) * 0.38;
  p += (stats.physicalDamageMultiplicative ?? 0) * 0.38;
  p += (stats.damageMultiplicative ?? 0) * 0.35;
  return p;
}

export function estimateGoldFromStats(stats: ItemStats): number {
  let g = 700;
  g += (stats.ap ?? 0) * 21.5;
  g += (stats.ad ?? 0) * 35;
  g += (stats.hp ?? 0) * 2.7;
  g += (stats.mana ?? 0) * 1.35;
  g += (stats.armor ?? 0) * 20;
  g += (stats.mr ?? 0) * 18;
  g += (stats.abilityHaste ?? 0) * 26;
  g += (stats.basicAbilityHaste ?? 0) * 26;
  g += (stats.ultAbilityHaste ?? 0) * 22;
  g += (stats.attackSpeed ?? 0) * 28;
  g += (stats.critChance ?? 0) * 38;
  g += (stats.critDmg ?? 0) * 12;
  g += (stats.ms ?? 0) * 12;
  g += (stats.msPercent ?? 0) * 24;
  g += (stats.lethality ?? 0) * 11;
  g += (stats.armorPen ?? 0) * 22;
  g += (stats.magicPen ?? 0) * 30;
  g += (stats.lifeSteal ?? 0) * 45;
  g += (stats.omnivamp ?? 0) * 50;
  g += (stats.physicalOnHit ?? 0) * 8;
  g += (stats.magicOnHit ?? 0) * 8;
  g += (stats.magicDotDamage ?? 0) * 12;
  g += (stats.physicalOnHitMaxHealthPercent ?? 0) * 42;
  g += (stats.physicalOnHitCurrentHealthPercent ?? 0) * 38;
  g += (stats.apMultiplicative ?? 0) * 28;
  g += (stats.adMultiplicative ?? 0) * 28;
  g += (stats.abilityDamageMultiplicative ?? 0) * 18;
  g += (stats.magicDamageMultiplicative ?? 0) * 15;
  g += (stats.physicalDamageMultiplicative ?? 0) * 15;
  return clamp(Math.round(g), 400, 3800);
}

export function getItemGold(item: Item): number {
  const group = item.getGroupName();
  if (GROUP_GOLD_OVERRIDES[group] !== undefined) {
    return GROUP_GOLD_OVERRIDES[group];
  }
  return estimateGoldFromStats(item.stats);
}

export function sortItemsByGoldAscending(items: Item[]): Item[] {
  return items.slice().sort((a, b) => getItemGold(a) - getItemGold(b));
}

/**
 * Suggested full-item buy order for a fixed build: higher estimated power/gold first
 * (earlier slots = better bang-for-buck), then cheaper items when efficiency ties
 * (smaller purchases reachable sooner). Not a real component path; for that you’d
 * need incremental sim or patch-accurate costs.
 */
export function sortItemsForPurchaseOrder(items: Item[]): Item[] {
  return items.slice().sort((a, b) => {
    const effDiff = goldEfficiencyTieBreak(b) - goldEfficiencyTieBreak(a);
    if (Math.abs(effDiff) > 1e-9) return effDiff;
    return getItemGold(a) - getItemGold(b);
  });
}

export function totalBuildGold(items: Item[]): number {
  let t = 0;
  for (const it of items) t += getItemGold(it);
  return t;
}

/** Secondary score: prefer more power per gold when melee/ranged/Base ties. */
export function goldEfficiencyTieBreak(item: Item): number {
  const g = Math.max(400, getItemGold(item));
  return estimateItemPowerIndex(item.stats) / g;
}
