import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Characters, Items } from "../src/app/actions/sim";
import {
  computeMetaForAllChampions,
  META_DUEL_DEFAULTS,
  resolveDuel,
  type DuelAssumptions,
  type MonteCarloParams,
  type SimulationScenario,
} from "../src/lib/buildOptimizer";

function envNum(key: string): number | undefined {
  const v = process.env[key];
  if (v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function envBool(key: string): boolean | undefined {
  const v = process.env[key];
  if (v === undefined || v === "") return undefined;
  const norm = v.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(norm)) return true;
  if (["0", "false", "no", "off"].includes(norm)) return false;
  return undefined;
}

const duelOverrides: DuelAssumptions = { ...META_DUEL_DEFAULTS };
const maxHp = envNum("LOLOPTIMA_TARGET_MAX_HP");
const bonusHp = envNum("LOLOPTIMA_TARGET_BONUS_HP");
const phys = envNum("LOLOPTIMA_INCOMING_PHYS_SHARE");
const armor = envNum("LOLOPTIMA_TARGET_ARMOR");
const mr = envNum("LOLOPTIMA_TARGET_MR");
const comboWindow = envNum("LOLOPTIMA_COMBO_WINDOW");
if (maxHp !== undefined) duelOverrides.targetMaxHP = maxHp;
if (bonusHp !== undefined) duelOverrides.targetBonusHP = bonusHp;
if (phys !== undefined) duelOverrides.incomingPhysShare = phys;
if (armor !== undefined) duelOverrides.targetArmor = armor;
if (mr !== undefined) duelOverrides.targetMR = mr;
if (comboWindow !== undefined) duelOverrides.comboWindowSeconds = comboWindow;
const duel = resolveDuel(duelOverrides);

const mc: MonteCarloParams = {};
const saIter = envNum("LOLOPTIMA_SA_ITER");
const saRestarts = envNum("LOLOPTIMA_SA_RESTARTS");
const mcProbes = envNum("LOLOPTIMA_MC_PROBES");
if (saIter !== undefined) mc.iterationsPerRestart = saIter;
if (saRestarts !== undefined) mc.restarts = saRestarts;
if (mcProbes !== undefined) mc.randomProbeSamples = mcProbes;

const simulation: SimulationScenario = {};
const level = envNum("LOLOPTIMA_SIM_LEVEL");
if (level !== undefined) simulation.level = level;
const useRotation = envBool("LOLOPTIMA_SIM_ROTATION_PROFILES");
if (useRotation !== undefined) {
  simulation.enableChampionRotationProfiles = useRotation;
}

console.log("[compute-meta] Optimizing builds…");
const meta = computeMetaForAllChampions(
  Characters,
  Items,
  duel,
  Object.keys(mc).length > 0 ? mc : undefined,
  Object.keys(simulation).length > 0 ? simulation : undefined,
);
const outPath = join(process.cwd(), "public", "data", "metaBuilds.json");
console.log(`[compute-meta] Writing ${outPath}…`);
writeFileSync(outPath, JSON.stringify(meta, null, 2), "utf8");
console.log(`[compute-meta] Wrote ${outPath} (${meta.championBuilds.length} champions)`);
console.log("Duel assumptions:", meta.duel);
if (meta.simulation) {
  console.log("Simulation assumptions:", meta.simulation);
}
