import type { Item } from "@/app/actions/sim";
import { bestComponentSpikePerGold, shopGoldForItem } from "@/lib/itemRecipes";

/** Minimal duel shape for buy-order armor scaling (avoids import cycle). */
export type PurchaseDuelMitigation = {
  targetArmor: number;
  targetMR: number;
  comboWindowSeconds: number;
};

const PURCHASE_OPP_BASE_ARMOR = 48;
const PURCHASE_OPP_BASE_MR = 30;

function enemyResistsAtItemCount(
  duel: PurchaseDuelMitigation,
  enemyCompletedItems: number,
  fullBuildSlots: number,
) {
  const slots = Math.max(1, fullBuildSlots);
  const pace = Math.max(0, Math.min(enemyCompletedItems, slots)) / slots;
  const itemArmor = Math.max(0, duel.targetArmor - PURCHASE_OPP_BASE_ARMOR);
  const itemMR = Math.max(0, duel.targetMR - PURCHASE_OPP_BASE_MR);
  return {
    targetArmor: Math.round(PURCHASE_OPP_BASE_ARMOR + itemArmor * pace),
    targetMR: Math.round(PURCHASE_OPP_BASE_MR + itemMR * pace),
    comboWindowSeconds: duel.comboWindowSeconds,
  };
}

function armorPenPurchaseScale(targetArmor: number): number {
  if (targetArmor >= 95) return 1;
  if (targetArmor <= 50) return 0.5;
  return 0.5 + (0.5 * (targetArmor - 50)) / 45;
}

function isMajorArmorPenItem(item: Item): boolean {
  return (item.stats.armorPen ?? 0) >= 20 || (item.stats.lethality ?? 0) >= 15;
}

const BOOT_NAME_RE =
  /\b(boots|greaves|treads|steelcaps|shoes|sorcerer's shoes)\b/i;

export function isBootItem(item: Item): boolean {
  return BOOT_NAME_RE.test(item.name);
}

export type PurchaseScoreFn = (
  partial: Item[],
  /** Enemy item count at this point in the game (usually `ordered.length`). */
  enemyCompletedItems: number,
) => number;

/**
 * Cumulative gold typically available when completing purchase `slotIndex` (0-based)
 * in a full 6-item build (~27 min solo lane). Not meta data — income ramp only.
 */
export function cumulativeGoldBudget(
  slotIndex: number,
  totalBuildGold: number,
): number {
  const ramp = [0.11, 0.24, 0.39, 0.55, 0.74, 1.0];
  const t = ramp[Math.min(slotIndex, ramp.length - 1)] ?? 1;
  return totalBuildGold * t;
}

function affordMultiplier(itemGold: number, budget: number): number {
  if (itemGold <= budget * 1.05) return 1;
  return (budget / itemGold) ** 2.5;
}

/**
 * Priority for completing the next full item in the build.
 *
 * - **Marginal power** from sim (caller supplies damage-focused score, not EHP/meta).
 * - **Spike per gold** = marginal / shopGold^0.6 (DDragon price when known).
 * - **Afford** = can't finish a 3.6k item at minute 8 — defer via income ramp.
 * - **Components** = tie-break toward items whose first component step has better power/gold.
 * - **Boots** = only after at least one damage item; never hard-coded to slot 4.
 */
export function purchaseStepMetric(
  marginal: number,
  item: Item,
  slotIndex: number,
  totalBuildGold: number,
  orderedSoFar: Item[],
  targetArmor = 100,
): number {
  if (marginal <= 0) return marginal - shopGoldForItem(item) * 1e-6;

  const gold = shopGoldForItem(item);
  const isBoot = isBootItem(item);
  const hasDamageItem = orderedSoFar.some((i) => !isBootItem(i));

  if (isBoot && !hasDamageItem && slotIndex < 2) {
    return marginal * 0.05 - gold;
  }

  const budget = cumulativeGoldBudget(slotIndex, totalBuildGold);
  let adjMarginal = marginal;
  if (isMajorArmorPenItem(item)) {
    adjMarginal *= armorPenPurchaseScale(targetArmor);
  }
  const spikePerGold = adjMarginal / gold ** 0.6;
  const compTie = 1 + 0.08 * bestComponentSpikePerGold(item);

  return spikePerGold * affordMultiplier(gold, budget) * compTie;
}

/**
 * Greedy buy order: at each step, finish the remaining item with the best
 * power spike per gold given what you already own and realistic income.
 */
export function greedyPurchaseOrder(
  finalBuild: Item[],
  scorePartial: PurchaseScoreFn,
  duel?: PurchaseDuelMitigation,
): Item[] {
  if (finalBuild.length <= 1) return finalBuild.slice();

  const totalBuildGold = finalBuild.reduce(
    (s, i) => s + shopGoldForItem(i),
    0,
  );
  const remaining = finalBuild.slice();
  const ordered: Item[] = [];

  while (remaining.length > 0) {
    const slotIndex = ordered.length;
    const enemyItems = ordered.length;
    const baseScore = scorePartial(ordered, enemyItems);
    const targetArmor = duel
      ? enemyResistsAtItemCount(duel, enemyItems, finalBuild.length)
          .targetArmor
      : 100;

    let bestItem = remaining[0];
    let bestMetric = -Infinity;

    for (const candidate of remaining) {
      const marginal =
        scorePartial([...ordered, candidate], enemyItems) - baseScore;
      const metric = purchaseStepMetric(
        marginal,
        candidate,
        slotIndex,
        totalBuildGold,
        ordered,
        targetArmor,
      );
      if (metric > bestMetric) {
        bestMetric = metric;
        bestItem = candidate;
      }
    }

    ordered.push(bestItem);
    remaining.splice(remaining.indexOf(bestItem), 1);
  }

  return ordered;
}
