import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sim = readFileSync(join(root, "src/app/actions/sim.ts"), "utf8");
const wiki = readFileSync(join(root, "src/lib/championWikiPassOverrides.ts"), "utf8");
const coreBlock = readFileSync(join(root, "src/lib/abilityInteractions.ts"), "utf8");

const chars = [...sim.matchAll(/const (\w+) = new Character\(\s*\n\s*"([^"]+)"/g)].map(
  (m) => ({ key: m[1], name: m[2] }),
);

const wikiEntries = [...wiki.matchAll(/^\s+(\w+):\s*(\{[\s\S]*?\n\s+\}),?$/gm)];
const wikiMap = new Map(wikiEntries.map((m) => [m[1], m[2].trim()]));

const coreMatch = coreBlock.match(
  /CHAMPION_INTERACTION_OVERRIDES[\s\S]*?=\s*\{([\s\S]*?)\n\};/,
);
const coreKeys = new Set(
  [...(coreMatch?.[1] ?? "").matchAll(/^\s+(\w+):/gm)].map((m) => m[1]),
);

const sk = (n) => n.replace(/[^a-zA-Z0-9]/g, "");

const noWiki = [];
const emptyWiki = [];
const noEither = [];

for (const c of chars) {
  const k = sk(c.name);
  const w = wikiMap.get(k);
  const co = coreKeys.has(k) || coreKeys.has(c.key);
  if (!w && !co) noEither.push(c.name);
  else if (!w) noWiki.push(c.name);
  else if (w === "{}" && !co) emptyWiki.push(c.name);
}

console.log("Total:", chars.length);
console.log("\nNo wiki AND no core (" + noEither.length + "):");
console.log(noEither.join(", "));
console.log("\nEmpty wiki, no core (" + emptyWiki.length + "):");
console.log(emptyWiki.join(", "));
