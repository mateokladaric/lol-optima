import { CHAMPION_ROTATION_PROFILES, Characters } from "../src/app/actions/sim";

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const all = Characters.map((c) => c.Name).sort((a, b) => a.localeCompare(b));
const coveredNormalized = new Set(
  Object.keys(CHAMPION_ROTATION_PROFILES).map(normalize),
);
const missing = all.filter((name) => !coveredNormalized.has(normalize(name)));

console.log(`Rotation profile coverage: ${all.length - missing.length}/${all.length}`);
console.log(
  `Coverage rate: ${(((all.length - missing.length) / Math.max(1, all.length)) * 100).toFixed(1)}%`,
);

if (missing.length > 0) {
  console.log("");
  console.log("Missing champions:");
  for (const name of missing) {
    console.log(`- ${name}`);
  }
}
