import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Characters, Items } from "../src/app/actions/sim";
import {
  type ComputeMetaWorkerJob,
  type ComputeMetaWorkerResult,
  computeMetaForChampion,
  resolveDuel,
} from "../src/lib/buildOptimizer";

export function runComputeMetaWorkerJob(
  job: ComputeMetaWorkerJob,
): ComputeMetaWorkerResult {
  const duel = resolveDuel(job.duelOverrides);
  const itemByName = new Map(Items.map((i) => [i.name, i] as const));
  const championBuilds: ComputeMetaWorkerResult["championBuilds"] = [];
  const errors: ComputeMetaWorkerResult["errors"] = [];

  for (const name of job.championNames) {
    const champion = Characters.find((c) => c.Name === name);
    if (!champion) {
      errors.push({ champion: name, message: "Champion not found in pool" });
      continue;
    }
    try {
      const entry = computeMetaForChampion(
        champion,
        Items,
        duel,
        job.monteCarloParams,
        job.simulation,
        itemByName,
      );
      if (entry) championBuilds.push(entry);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ champion: name, message });
    }
  }

  return { championBuilds, errors };
}

function isCliEntry(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return (
    fileURLToPath(import.meta.url) === fileURLToPath(pathToFileURL(entry))
  );
}

async function readStdinJson<T>(): Promise<T> {
  const lines: string[] = [];
  const rl = createInterface({ input: process.stdin });
  for await (const line of rl) lines.push(line);
  return JSON.parse(lines.join("\n")) as T;
}

async function main(): Promise<void> {
  const job = await readStdinJson<ComputeMetaWorkerJob>();
  const result = runComputeMetaWorkerJob(job);
  process.stdout.write(JSON.stringify(result));
}

if (isCliEntry()) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
