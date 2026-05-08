import { Characters, Items } from "../src/app/actions/sim";
import { recommendBuildsForChampion } from "../src/lib/buildOptimizer";

type CheckCase = {
  champion: string;
  level: number;
};

const CASES: CheckCase[] = [
  { champion: "Aatrox", level: 11 },
  { champion: "Ahri", level: 11 },
  { champion: "Jinx", level: 16 },
  { champion: "Renekton", level: 16 },
  { champion: "Zed", level: 16 },
];

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function fail(msg: string): never {
  throw new Error(msg);
}

function hasDuplicateGroups(itemNames: string[]): boolean {
  const groups = itemNames.map((name) => name.replace(/\s*\(([^)]+)\)\s*$/, ""));
  return new Set(groups).size !== groups.length;
}

for (const test of CASES) {
  const champ = Characters.find((c) => c.Name === test.champion);
  if (!champ) fail(`Missing champion in pool: ${test.champion}`);

  const recs = recommendBuildsForChampion(champ, Items, {
    simulation: { level: test.level },
  });
  if (recs.length === 0) {
    fail(`No recommendations for ${test.champion} @ level ${test.level}`);
  }

  for (const rec of recs) {
    if (rec.items.length !== 6) {
      fail(`${test.champion}: expected 6 items, got ${rec.items.length}`);
    }
    if (!isFiniteNumber(rec.totalDPS) || rec.totalDPS < 0) {
      fail(`${test.champion}: invalid totalDPS ${rec.totalDPS}`);
    }
    if (!isFiniteNumber(rec.effectiveHP) || rec.effectiveHP <= 0) {
      fail(`${test.champion}: invalid effectiveHP ${rec.effectiveHP}`);
    }
    if (!rec.rune || rec.rune.trim() === "" || rec.rune === "None") {
      fail(`${test.champion}: expected non-empty keystone`);
    }
    if (hasDuplicateGroups(rec.items)) {
      fail(`${test.champion}: duplicate item groups in build ${rec.items.join(", ")}`);
    }
  }

  const withRotation = recommendBuildsForChampion(champ, Items, {
    simulation: { level: test.level, enableChampionRotationProfiles: true },
  });
  const withoutRotation = recommendBuildsForChampion(champ, Items, {
    simulation: { level: test.level, enableChampionRotationProfiles: false },
  });
  if (withRotation.length === 0 || withoutRotation.length === 0) {
    fail(`${test.champion}: missing recommendations when comparing rotation toggle`);
  }
  const topWith = withRotation[0];
  const topWithout = withoutRotation[0];
  if (!isFiniteNumber(topWith.totalDPS) || !isFiniteNumber(topWithout.totalDPS)) {
    fail(`${test.champion}: invalid DPS in rotation toggle comparison`);
  }
}

console.log(`Regression checks passed (${CASES.length} champion scenarios).`);
