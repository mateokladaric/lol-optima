import { availableParallelism } from "node:os";
import { readFileSync } from "node:fs";
import { Characters, Items } from "../src/app/actions/sim";
import {
  computeMetaForAllChampions,
  META_DUEL_DEFAULTS,
  resolveDuel,
  type SerializedMeta,
  type SimulationScenario,
} from "../src/lib/buildOptimizer";
import { computeMetaParallel } from "./compute-meta-parallel";

function envNum(key: string): number | undefined {
  const v = process.env[key];
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function envBool(key: string): boolean | undefined {
  const v = process.env[key];
  if (!v) return undefined;
  const norm = v.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(norm)) return true;
  if (["0", "false", "no", "off"].includes(norm)) return false;
  return undefined;
}

function loadBaseline(path: string): SerializedMeta {
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw) as SerializedMeta;
}

const baselinePath =
  process.env.LOLOPTIMA_BASELINE_META_PATH ?? "public/data/metaBuilds.json";
const baseline = loadBaseline(baselinePath);

const simulation: SimulationScenario = {};
const level = envNum("LOLOPTIMA_SIM_LEVEL");
if (level !== undefined) simulation.level = level;
const rot = envBool("LOLOPTIMA_SIM_ROTATION_PROFILES");
if (rot !== undefined) simulation.enableChampionRotationProfiles = rot;

const metaDuel = resolveDuel(META_DUEL_DEFAULTS);
const simOverrides =
  Object.keys(simulation).length > 0 ? simulation : undefined;

const workersEnv = envNum("LOLOPTIMA_WORKERS");
const workerCount =
  workersEnv === 0
    ? 1
    : workersEnv ?? Math.max(1, (availableParallelism() ?? 4) - 1);

async function main() {
const current =
  workerCount <= 1
    ? computeMetaForAllChampions(
        Characters,
        Items,
        metaDuel,
        undefined,
        simOverrides,
        { verbose: false },
      )
    : await computeMetaParallel(
        Characters,
        metaDuel,
        undefined,
        simOverrides,
        { workerCount, verbose: false },
      );

type Delta = {
  champion: string;
  baselineTopDps: number;
  currentTopDps: number;
  delta: number;
  deltaPct: number;
};

const baselineMap = new Map(
  baseline.championBuilds.map((c) => [c.champion, c.builds[0]?.totalDPS ?? 0]),
);
const currentMap = new Map(
  current.championBuilds.map((c) => [c.champion, c.builds[0]?.totalDPS ?? 0]),
);

const allChampions = new Set<string>([
  ...baselineMap.keys(),
  ...currentMap.keys(),
]);
const deltas: Delta[] = [];

for (const champion of allChampions) {
  const b = baselineMap.get(champion) ?? 0;
  const c = currentMap.get(champion) ?? 0;
  const d = c - b;
  const pct = b > 0 ? (d / b) * 100 : 0;
  deltas.push({
    champion,
    baselineTopDps: b,
    currentTopDps: c,
    delta: d,
    deltaPct: pct,
  });
}

deltas.sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct));
const topN = envNum("LOLOPTIMA_META_DIFF_TOP_N") ?? 15;

console.log(`Baseline: ${baselinePath}`);
console.log(`Baseline generatedAt: ${baseline.generatedAt}`);
console.log(`Current generatedAt:  ${current.generatedAt}`);
console.log("");
console.log("Top movers (by absolute % change in top build DPS):");
console.log("champion | baseline | current | delta | delta%");

for (const row of deltas.slice(0, topN)) {
  console.log(
    `${row.champion} | ${row.baselineTopDps.toFixed(1)} | ${row.currentTopDps.toFixed(1)} | ${row.delta.toFixed(1)} | ${row.deltaPct.toFixed(2)}%`,
  );
}
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
