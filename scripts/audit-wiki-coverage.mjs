import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sim = readFileSync(join(root, "src/app/actions/sim.ts"), "utf8");
const ai = readFileSync(join(root, "src/lib/abilityInteractions.ts"), "utf8");
const wp = readFileSync(join(root, "src/lib/championWikiPassOverrides.ts"), "utf8");

const champs = [
  ...sim.matchAll(/^const (\w+) = new Character\(\r?\n\s+"([^"]+)"/gm),
].map((m) => ({ key: m[1], name: m[2] }));

function parseOverrideKeys(src, exportName) {
  const start = src.indexOf(`export const ${exportName}`);
  const brace = src.indexOf("{", start);
  let depth = 0;
  const keys = [];
  let i = brace;
  while (i < src.length) {
    const c = src[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) break;
    }
    if (depth === 1 && /^[A-Za-z]/.test(c)) {
      const m = src.slice(i).match(/^(\w+):\s*\{/);
      if (m) {
        keys.push(m[1]);
        i += m[0].length - 1;
      }
    }
    i++;
  }
  return keys;
}

function isEmptyBlock(src, exportName, key) {
  const re = new RegExp(`\\b${key}:\\s*\\{\\s*\\}`, "m");
  return re.test(src);
}

const coreKeys = parseOverrideKeys(ai, "CHAMPION_INTERACTION_OVERRIDES");
const wikiKeys = parseOverrideKeys(wp, "CHAMPION_WIKI_PASS_OVERRIDES");
const coreSet = new Set(coreKeys);
const wikiSet = new Set(wikiKeys);

const deepCore = coreKeys.filter((k) => !isEmptyBlock(ai, "", k));
const deepWiki = wikiKeys.filter((k) => !isEmptyBlock(wp, "", k));
const emptyWiki = wikiKeys.filter((k) => isEmptyBlock(wp, "", k));
const genericOnly = champs.filter(
  (c) => !coreSet.has(c.key) && !wikiSet.has(c.key),
);

console.log(
  JSON.stringify(
    {
      total: champs.length,
      deepCoreOverrides: deepCore.length,
      deepWikiPassOverrides: deepWiki.length,
      emptyWikiPlaceholders: emptyWiki.length,
      genericOnlyNoOverride: genericOnly.length,
      genericOnlyNames: genericOnly.map((c) => c.name).sort(),
      hasAnyOverride: champs.length - genericOnly.length,
    },
    null,
    2,
  ),
);
