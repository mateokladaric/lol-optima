import { Characters, Items } from "../src/app/actions/sim";
import {
  keystoneCandidatesFor,
  metaDuelForTtkScoring,
  pickBestKeystoneForBuild,
  profileFromBuildType,
  resolveDuel,
} from "../src/lib/buildOptimizer";
import { readFileSync } from "node:fs";

const meta = JSON.parse(
  readFileSync("public/data/metaBuilds.json", "utf8"),
) as {
  duel?: Parameters<typeof resolveDuel>[0];
  championBuilds: {
    champion: string;
    builds: { buildType: string; items: string[]; rune: string }[];
  }[];
};

const duel = metaDuelForTtkScoring(resolveDuel(meta.duel ?? {}));
const sim = { level: 18, enableChampionRotationProfiles: true };

const auditNames = [
  "Zed",
  "Lux",
  "LeBlanc",
  "Ahri",
  "Jinx",
  "Darius",
  "Syndra",
  "Yasuo",
  "Garen",
  "Vayne",
];

console.log("Keystone audit (first build row per champion):\n");
console.log("champion | profile | old | new | candidates");
console.log("-".repeat(72));

for (const name of auditNames) {
  const entry = meta.championBuilds.find((c) => c.champion === name);
  const champ = Characters.find((c) => c.Name === name);
  if (!entry || !champ) continue;

  const row = entry.builds[0];
  const profile = profileFromBuildType(row.buildType);
  const items = row.items
    .map((n) => Items.find((i) => i.name === n))
    .filter((x): x is NonNullable<typeof x> => Boolean(x));
  if (items.length === 0) continue;

  const picked = pickBestKeystoneForBuild(champ, items, profile, duel, sim);
  const candidates = keystoneCandidatesFor(champ, profile).map((k) => k.name);
  console.log(
    `${name.padEnd(10)} | ${profile.padEnd(14)} | ${row.rune.padEnd(18)} | ${(picked?.name ?? "?").padEnd(18)} | ${candidates.join(", ")}`,
  );
}
