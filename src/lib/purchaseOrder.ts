import { championLevelStatScale } from "@/app/actions/sim";
import type { Item } from "@/app/actions/sim";
import { bestComponentSpikePerGold, shopGoldForItem } from "@/lib/itemRecipes";

/** Minimal duel shape for buy-order armor scaling (avoids import cycle). */
export type PurchaseDuelMitigation = {
  targetArmor: number;
  targetMR: number;
};

const PURCHASE_OPP_BASE_ARMOR = 48;
const PURCHASE_OPP_BASE_MR = 30;

/** Champion level when each item slot is completed (1st → 6th). */
export const PURCHASE_STEP_LEVELS = [7, 10, 12, 14, 16, 17] as const;

/** Level for sim scoring when the build has `itemCount` completed items. */
export function purchaseLevelForItemCount(itemCount: number): number {
  if (itemCount <= 0) return PURCHASE_STEP_LEVELS[0];
  const idx = Math.min(itemCount, PURCHASE_STEP_LEVELS.length) - 1;
  return PURCHASE_STEP_LEVELS[idx];
}

/** Fraction of level-18 combat stats at this purchase step (matches buyer level ramp). */
export function purchaseLevelScale(itemCount: number): number {
  const level = purchaseLevelForItemCount(itemCount);
  return championLevelStatScale(level) / championLevelStatScale(18);
}

export type PurchaseDuelTarget = PurchaseDuelMitigation & {
  targetMaxHP: number;
  targetBonusHP: number;
};

/**
 * Opponent HP + resists at a buy-order step: same level ramp as the buyer and
 * item-count pacing on armor/MR from items.
 */
export function opponentAtPurchaseStep(
  duel: PurchaseDuelTarget,
  buyerCompletedItems: number,
  fullBuildSlots = 6,
  /**
   * Enemy completed items for this comparison (buy-order marginals pass
   * `ordered.length` so the first purchase is vs baseline resists).
   */
  enemyCompletedItems?: number,
) {
  const level = purchaseLevelForItemCount(buyerCompletedItems);
  const levelScale = purchaseLevelScale(buyerCompletedItems);
  const slots = Math.max(1, fullBuildSlots);
  const enemyN = Math.max(
    0,
    Math.min(enemyCompletedItems ?? buyerCompletedItems, slots),
  );
  const pace = enemyN / slots;
  const baseArmor = PURCHASE_OPP_BASE_ARMOR * levelScale;
  const baseMR = PURCHASE_OPP_BASE_MR * levelScale;
  const itemArmor =
    Math.max(0, duel.targetArmor - PURCHASE_OPP_BASE_ARMOR) * levelScale;
  const itemMR = Math.max(0, duel.targetMR - PURCHASE_OPP_BASE_MR) * levelScale;
  return {
    level,
    targetMaxHP: Math.round(duel.targetMaxHP * levelScale),
    targetBonusHP: Math.round(duel.targetBonusHP * levelScale),
    targetArmor: Math.round(baseArmor + itemArmor * pace),
    targetMR: Math.round(baseMR + itemMR * pace),
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
      ? opponentAtPurchaseStep(
          {
            targetMaxHP: 3000,
            targetBonusHP: 1000,
            ...duel,
          },
          enemyItems,
          finalBuild.length,
          enemyItems,
        ).targetArmor
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
