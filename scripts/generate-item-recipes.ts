/**
 * Builds public/data/itemRecipes.json from Data Dragon (shop gold + component tree).
 * Run: npx tsx scripts/generate-item-recipes.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Items } from "../src/app/actions/sim";
import { estimateItemPowerIndex } from "../src/lib/itemGold";
import { resolveItemByDDName } from "../src/lib/itemNameMap";

type DDItem = {
  name: string;
  gold: { total: number; base: number; purchasable?: boolean };
  from?: string[];
};

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const versions = await fetch(
    "https://ddragon.leagueoflegends.com/api/versions.json",
  ).then((r) => r.json() as Promise<string[]>);
  const ver = versions[0];
  const raw = await fetch(
    `https://ddragon.leagueoflegends.com/cdn/${ver}/data/en_US/item.json`,
  ).then((r) => r.json() as Promise<{ data: Record<string, DDItem> }>);

  const byNorm = new Map<string, DDItem>();
  const idToName = new Map<string, string>();
  for (const [id, item] of Object.entries(raw.data)) {
    idToName.set(id, item.name);
    byNorm.set(normalize(item.name), item);
  }

  const entries: Record<
    string,
    {
      totalGold: number;
      components: { name: string; gold: number; powerPerGold: number }[];
    }
  > = {};

  for (const item of Items) {
    const group = item.getGroupName();
    if (entries[group]) continue;

    const stripped = normalize(
      item.name.replace(/\s*\((Melee|Ranged)\)\s*/gi, ""),
    );
    const dd =
      byNorm.get(normalize(item.name)) ??
      byNorm.get(stripped) ??
      byNorm.get(normalize(group));

    if (!dd?.gold?.total || dd.gold.total < 300) continue;
    if (dd.gold.purchasable === false) continue;

    const components = (dd.from ?? [])
      .map((id) => {
        const name = idToName.get(id);
        const comp = name ? raw.data[id] : undefined;
        if (!name || !comp?.gold?.total) return null;
        const simItem = resolveItemByDDName(name, true);
        const power = simItem
          ? estimateItemPowerIndex(simItem.stats)
          : estimateItemPowerIndex({});
        return {
          name,
          gold: comp.gold.total,
          powerPerGold: power / Math.max(comp.gold.total, 50),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x != null)
      .sort((a, b) => a.gold - b.gold);

    entries[group] = {
      totalGold: dd.gold.total,
      components,
    };
  }

  const out = {
    patch: ver,
    generatedAt: new Date().toISOString(),
    byGroup: entries,
  };

  const outPath = join(process.cwd(), "public", "data", "itemRecipes.json");
  writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");
  console.log(`Wrote ${outPath} (${Object.keys(entries).length} recipes)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
