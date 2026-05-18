import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Character } from "../src/app/actions/sim";
import {
  type ComputeMetaWorkerJob,
  type ComputeMetaWorkerResult,
  type DuelAssumptions,
  type MonteCarloParams,
  type SerializedMeta,
  type SimulationScenario,
  resolveDuel,
  resolveMonteCarloParams,
} from "../src/lib/buildOptimizer";

export type ParallelMetaOptions = {
  workerCount?: number;
  verbose?: boolean;
};

const require = createRequire(import.meta.url);
const tsxCli = join(
  require.resolve("tsx/package.json"),
  "..",
  "dist",
  "cli.mjs",
);
const workerScript = fileURLToPath(
  new URL("./compute-meta-worker.ts", import.meta.url),
);

function chunkNames(names: string[], workers: number): string[][] {
  const buckets: string[][] = Array.from({ length: workers }, () => []);
  for (let i = 0; i < names.length; i++) {
    buckets[i % workers].push(names[i]);
  }
  return buckets.filter((b) => b.length > 0);
}

/** Subprocess workers run under the tsx CLI so `@/` path aliases resolve (worker_threads do not). */
function runWorker(job: ComputeMetaWorkerJob): Promise<ComputeMetaWorkerResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tsxCli, workerScript], {
      stdio: ["pipe", "pipe", "inherit"],
      cwd: process.cwd(),
      env: process.env,
    });
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stdin.write(JSON.stringify(job));
    child.stdin.end();
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`compute-meta worker exited with code ${code ?? "unknown"}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout.trim()) as ComputeMetaWorkerResult);
      } catch {
        reject(
          new Error(
            `compute-meta worker returned invalid JSON (${stdout.length} bytes)`,
          ),
        );
      }
    });
  });
}

/** Same MC/duel settings as sequential meta; champions run in parallel subprocesses. */
export async function computeMetaParallel(
  champions: Character[],
  duelOverrides: DuelAssumptions | undefined,
  monteCarloOverrides: MonteCarloParams | undefined,
  simulation: SimulationScenario | undefined,
  options?: ParallelMetaOptions,
): Promise<SerializedMeta> {
  const duel = resolveDuel(duelOverrides);
  const mcParams: MonteCarloParams = {
    iterationsPerRestart: 1200,
    restarts: 6,
    randomProbeSamples: 320,
    ...monteCarloOverrides,
  };
  const mc = resolveMonteCarloParams(mcParams);
  const verbose = options?.verbose ?? true;
  const log = (msg: string) => {
    if (verbose) console.log(msg);
  };

  const names = champions.map((c) => c.Name);
  const total = names.length;
  const envWorkers = Number(process.env.LOLOPTIMA_WORKERS);
  const requested =
    options?.workerCount ??
    (Number.isFinite(envWorkers) && envWorkers > 0 ? envWorkers : undefined) ??
    Math.max(1, (availableParallelism() ?? 4) - 1);
  const workerCount = Math.max(1, Math.min(requested, total));

  log(
    `[compute-meta] Parallel: ${workerCount} workers × ${total} champions | SA ${mc.iterationsPerRestart} iter × ${mc.restarts} restarts | ${mcParams.randomProbeSamples ?? 320} alt probes`,
  );
  log(
    `[compute-meta] Duel: ${duel.targetMaxHP} HP (+${duel.targetBonusHP} bonus), ${duel.targetArmor}/${duel.targetMR} armor/MR, ${duel.comboWindowSeconds}s combo`,
  );

  const runStarted = Date.now();
  const chunks = chunkNames(names, workerCount);

  log(
    `[compute-meta] Work split: ${chunks.map((c) => c.length).join(", ")} champions per worker`,
  );

  const results = await Promise.all(
    chunks.map((championNames, wi) => {
      const job: ComputeMetaWorkerJob = {
        championNames,
        duelOverrides: duelOverrides ?? {},
        monteCarloParams: mcParams,
        simulation,
      };
      log(
        `[compute-meta] Worker ${wi + 1}/${chunks.length} started (${championNames.length} champions)`,
      );
      return runWorker(job).then((result) => {
        log(
          `[compute-meta] Worker ${wi + 1}/${chunks.length} finished (${result.championBuilds.length} ok, ${result.errors.length} errors)`,
        );
        return result;
      });
    }),
  );

  const championBuilds: SerializedMeta["championBuilds"] = [];
  const errors: ComputeMetaWorkerResult["errors"] = [];
  for (const r of results) {
    championBuilds.push(...r.championBuilds);
    errors.push(...r.errors);
  }

  if (errors.length > 0) {
    for (const e of errors) {
      console.error(`[compute-meta] ERROR ${e.champion}: ${e.message}`);
    }
    throw new Error(
      `compute-meta failed for ${errors.length} champion(s); see errors above`,
    );
  }

  const runMin = ((Date.now() - runStarted) / 60_000).toFixed(1);
  log(
    `[compute-meta] Finished ${championBuilds.length}/${total} champions with builds in ${runMin} min (${workerCount} workers)`,
  );

  championBuilds.sort(
    (a, b) => (b.builds[0]?.totalDPS ?? 0) - (a.builds[0]?.totalDPS ?? 0),
  );

  return {
    championBuilds,
    generatedAt: new Date().toISOString(),
    duel,
    simulation,
  };
}
