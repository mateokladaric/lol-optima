import { performance } from "node:perf_hooks";
import { Characters, Items, championUsesApScaling } from "../src/app/actions/sim";
import {
  recommendBuildsForChampion,
  INTERACTIVE_RECOMMEND_OPTIONS,
} from "../src/lib/buildOptimizer";

const names = ["Jinx", "Lux", "Yasuo", "Ahri", "Zed"];
for (const name of names) {
  const c = Characters.find((x) => x.Name === name);
  if (!c) continue;
  const t0 = performance.now();
  const recs = recommendBuildsForChampion(c, Items, {
    ...INTERACTIVE_RECOMMEND_OPTIONS,
    simulation: { level: 18 },
  });
  const ms = performance.now() - t0;
  const profiles = [...new Set(recs.map((r) => r.profile))];
  console.log(
    `${name}: ${Math.round(ms)}ms n=${recs.length} balanced=${profiles.includes("balanced")} balanced_ap=${profiles.includes("balanced_ap")} [${profiles.join(",")}]`,
  );
}
console.log(
  "AP eligible:",
  Characters.filter((c) => championUsesApScaling(c)).length,
  "/",
  Characters.length,
);
