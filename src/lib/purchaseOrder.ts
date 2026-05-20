import type { Item } from "@/app/actions/sim";
import { bestComponentSpikePerGold, shopGoldForItem } from "@/lib/itemRecipes";

const BOOT_NAME_RE =
  /\b(boots|greaves|treads|steelcaps|shoes|sorcerer's shoes)\b/i;

export function isBootItem(item: Item): boolean {
  return BOOT_NAME_RE.test(item.name);
}

export type PurchaseScoreFn = (partial: Item[]) => number;

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
): number {
  if (marginal <= 0) return marginal - shopGoldForItem(item) * 1e-6;

  const gold = shopGoldForItem(item);
  const isBoot = isBootItem(item);
  const hasDamageItem = orderedSoFar.some((i) => !isBootItem(i));

  if (isBoot && !hasDamageItem && slotIndex < 2) {
    return marginal * 0.05 - gold;
  }

  const budget = cumulativeGoldBudget(slotIndex, totalBuildGold);
  const spikePerGold = marginal / gold ** 0.6;
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
    const baseScore = scorePartial(ordered);

    let bestItem = remaining[0];
    let bestMetric = -Infinity;

    for (const candidate of remaining) {
      const marginal = scorePartial([...ordered, candidate]) - baseScore;
      const metric = purchaseStepMetric(
        marginal,
        candidate,
        slotIndex,
        totalBuildGold,
        ordered,
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
