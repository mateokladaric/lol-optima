import type { Item } from "@/app/actions/sim";
import { getItemGold } from "@/lib/itemGold";
import recipesFile from "../../public/data/itemRecipes.json";

export type ComponentStep = {
  name: string;
  gold: number;
  powerPerGold: number;
};

export type ItemRecipe = {
  totalGold: number;
  components: ComponentStep[];
};

const byGroup = recipesFile.byGroup as Record<string, ItemRecipe>;

export function getItemRecipe(item: Item): ItemRecipe | null {
  return byGroup[item.getGroupName()] ?? null;
}

/** Shop price: Data Dragon total when known, else stat estimate. */
export function shopGoldForItem(item: Item): number {
  const recipe = getItemRecipe(item);
  if (recipe?.totalGold) return recipe.totalGold;
  return getItemGold(item);
}

/**
 * Best early spike along the component ladder (cheapest step with highest power/gold).
 * Used as a tie-break when full-item sim marginals are close.
 */
export function bestComponentSpikePerGold(item: Item): number {
  const recipe = getItemRecipe(item);
  if (!recipe?.components.length) return 0;
  let best = 0;
  for (const c of recipe.components) {
    if (c.powerPerGold > best) best = c.powerPerGold;
  }
  return best;
}
