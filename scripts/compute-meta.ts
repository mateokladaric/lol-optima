import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Characters, Items } from "../src/app/actions/sim";
import {
  computeMetaForAllChampions,
  type DuelAssumptions,
  type MonteCarloParams,
} from "../src/lib/buildOptimizer";

function envNum(key: string): number | undefined {
  const v = process.env[key];
  if (v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

const duel: DuelAssumptions = {};
const maxHp = envNum("LOLOPTIMA_TARGET_MAX_HP");
const bonusHp = envNum("LOLOPTIMA_TARGET_BONUS_HP");
const phys = envNum("LOLOPTIMA_INCOMING_PHYS_SHARE");
if (maxHp !== undefined) duel.targetMaxHP = maxHp;
if (bonusHp !== undefined) duel.targetBonusHP = bonusHp;
if (phys !== undefined) duel.incomingPhysShare = phys;

const mc: MonteCarloParams = {};
const saIter = envNum("LOLOPTIMA_SA_ITER");
const saRestarts = envNum("LOLOPTIMA_SA_RESTARTS");
const mcProbes = envNum("LOLOPTIMA_MC_PROBES");
if (saIter !== undefined) mc.iterationsPerRestart = saIter;
if (saRestarts !== undefined) mc.restarts = saRestarts;
if (mcProbes !== undefined) mc.randomProbeSamples = mcProbes;

const meta = computeMetaForAllChampions(
  Characters,
  Items,
  Object.keys(duel).length > 0 ? duel : undefined,
  Object.keys(mc).length > 0 ? mc : undefined,
);
const outPath = join(process.cwd(), "public", "data", "metaBuilds.json");
writeFileSync(outPath, JSON.stringify(meta, null, 2), "utf8");
console.log(`Wrote ${outPath} (${meta.championBuilds.length} champions)`);
console.log("Duel assumptions:", meta.duel);
