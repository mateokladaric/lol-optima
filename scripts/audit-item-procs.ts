/**
 * Full item catalog audit: proc stats, optimizer pool, modeling status.
 * Run: npm run audit:items
 */
import {
  Characters,
  Items,
  type Item,
  type ItemStats,
} from "../src/app/actions/sim";
import { buildRealisticItemPool } from "../src/lib/buildOptimizer";
import {
  MODELED_ITEM_GROUPS,
  HORIZON_HYPERSHOT_UPTIME_MELEE,
  HORIZON_HYPERSHOT_UPTIME_RANGED,
} from "../src/lib/itemMechanics";
import {
  getItemWikiNotes,
  itemsMissingWikiNotes,
} from "../src/lib/itemWikiNotes";
import {
  findUnparsedWikiKeywords,
  parseItemInteractionFlags,
} from "../src/lib/itemInteractions";

const PROC_KEYS: (keyof ItemStats)[] = [
  "trueOnAbilityHit",
  "trueOnAbilityHitPerLethality",
  "trueOnAbilityHitCooldown",
  "physicalOnAbilityHitMaxManaPercent",
  "physicalOnAbilityHitCooldown",
  "physicalOnHit",
  "physicalOnHitCurrentHealthPercent",
  "physicalOnHitMaxHealthPercent",
  "physicalOnHitBaseADPercent",
  "physicalOnHitMaxManaPercent",
  "magicOnHit",
  "magicOnHitAPRatio",
  "magicPeriodicOnHit",
  "magicDotDamage",
  "magicDotDamagePerAPRatio",
  "magicDotDamagePerTargetMaxHPRatio",
  "magicDotDamagePerBonusHPRatio",
  "damageAmplificationOnTarget",
  "damagePerTargetBonusHPPercent",
  "executeMaxHealthThresholdPercent",
  "physicalAoEOnHitADPercent",
  "armorReduction",
  "magicResistReduction",
  "ultCooldownRefundOnTakedown",
  "basicAbilityCooldownReductionOnAttack",
  "adMultiplicative",
  "adPerMaxManaPercent",
  "adPerBonusHPPercent",
  "apPerBonusHPPercent",
  "abilityDamagePerManaMultiplicative",
];

type Severity = "high" | "medium" | "low";
type Issue = { item: string; severity: Severity; note: string };

type PoolStatus = "mechanics" | "sim_ok" | "sim_partial" | "not_damage" | "sim_gap";

/** Enchanter/support — correct sim is ~0 damage contribution. */
const NOT_DAMAGE_GROUPS = new Set([
  "Ardent Censer",
  "Bandlepipes",
  "Diadem of Songs",
  "Echoes of Helia",
  "Imperial Mandate",
  "Knight's Vow",
  "Locket of the Iron Solari",
  "Mikael's Blessing",
  "Moonstone Renewer",
  "Protoplasm Harness",
  "Redemption",
  "Shurelya's Battlesong",
  "Solstice Sleigh",
  "Staff of Flowing Water",
  "Support / Jungle",
  "Zaz'Zak's Realmspike",
  "Zeke's Convergence",
]);

const STATIC_OK_GROUPS = new Set([
  "Lord Dominik's Regards",
  "The Collector",
  "Blade of the Ruined King",
  "Nashor's Tooth",
  "Wit's End",
  "Rabadon's Deathcap",
  "Void Staff",
  "Titanic Hydra",
  "Navori Flickerblade",
  "Trinity Force",
  "Iceborn Gauntlet",
  "Sheen",
  "Spellblade",
  "Manaflow",
  "Actualizer",
  "Last Whisper",
  "Infinity Edge",
  "Youmuu's Ghostblade",
  "Serpent's Fang",
  "Lifeline",
  "Annul",
  "Void Pen",
  "Morellonomicon",
  "Shadowflame",
  "Cosmic Drive",
  "Dawncore",
  "Glory",
  "Hydra",
  "Profane Hydra",
]);

const PARTIAL_NOTES: Record<string, string> = {
  Spellblade:
    "Sheen 1.5s ICD via spellbladeOnHitUptime; Bloodsong base row is enchanter stats only",
  Heartsteel: "base HP row only; stack/consumption excluded from pool",
  Mejai: "0-stack base in pool (conservative)",
  Hydra: "cleave AoE suppressed in 1v1; Titanic %maxHP on-hit on primary target",
  "Dead Man's Plate": "Momentum on-hit at 50% avg (Momentum group)",
  "Zeke's Convergence": "partner passive — no solo 1v1 damage",
  "Endless Hunger": "Feast omnivamp on kill only; base omnivamp in stats",
};

function procSnapshot(item: Item): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of PROC_KEYS) {
    const v = item.stats[k];
    if (v != null && v !== 0) out[k] = v as number;
  }
  return out;
}

function auditCatalogItem(item: Item, inPool: boolean): Issue[] {
  const issues: Issue[] = [];
  const s = item.stats;
  const name = item.name;

  if (
    (s.trueOnAbilityHit || s.trueOnAbilityHitPerLethality) &&
    !s.trueOnAbilityHitCooldown
  ) {
    issues.push({
      item: name,
      severity: "high",
      note: "true on-ability-hit without ICD",
    });
  }

  if (s.physicalOnAbilityHitMaxManaPercent && !s.physicalOnAbilityHitCooldown) {
    issues.push({
      item: name,
      severity: "high",
      note: "Muramana Shock without physicalOnAbilityHitCooldown",
    });
  }

  if (
    name.includes("Skipper") &&
    (s.physicalOnHitBaseADPercent || s.physicalOnHitMaxHealthPercent)
  ) {
    issues.push({
      item: name,
      severity: inPool ? "high" : "medium",
      note: "Skipper on-hit vs structures — excluded in sim",
    });
  }

  if (/\(\d+ stacks?\)/i.test(name) && inPool) {
    issues.push({
      item: name,
      severity: "high",
      note: "stack variant in optimizer pool",
    });
  }

  return issues;
}

function poolStatusForGroup(group: string): PoolStatus {
  if (NOT_DAMAGE_GROUPS.has(group)) return "not_damage";
  if ((MODELED_ITEM_GROUPS as readonly string[]).includes(group)) {
    return "mechanics";
  }
  if (STATIC_OK_GROUPS.has(group)) return "sim_ok";
  if (PARTIAL_NOTES[group]) return "sim_partial";
  return "sim_gap";
}

const probeNames = ["Ezreal", "Ahri", "Zed"] as const;

const allGroups = new Map<string, Item[]>();
for (const item of Items) {
  const g = item.getGroupName();
  if (!allGroups.has(g)) allGroups.set(g, []);
  allGroups.get(g)!.push(item);
}

const probe = Characters.find((c) => c.Name === "Ezreal")!;
const pool = buildRealisticItemPool(probe, Items);
const poolItemNames = new Set(pool.map((i) => i.name));
const ezPoolByGroup = new Map(pool.map((i) => [i.getGroupName(), i]));

console.log("=== Full item audit (loloptima) ===\n");
console.log(`Catalog: ${Items.length} rows, ${allGroups.size} groups`);
console.log(`Ezreal optimizer pool: ${pool.length} groups\n`);

console.log(`Modeled groups (${MODELED_ITEM_GROUPS.length}):`);
for (const g of MODELED_ITEM_GROUPS) {
  const row = ezPoolByGroup.get(g);
  console.log(`  ${g}${row ? ` → ${row.name}` : ""}`);
}
console.log(
  `\nHorizon Hypershot: ${HORIZON_HYPERSHOT_UPTIME_MELEE * 100}% melee / ${HORIZON_HYPERSHOT_UPTIME_RANGED * 100}% ranged`,
);
console.log("1v1: Hydra/Stridebreaker cleave AoE = 0\n");

for (const probeName of probeNames) {
  const champ = Characters.find((c) => c.Name === probeName);
  if (!champ) continue;

  const champPool = buildRealisticItemPool(champ, Items);
  const poolByGroup = new Map(champPool.map((i) => [i.getGroupName(), i]));

  console.log(`=== Probe: ${probeName} (${champPool.length} pool groups) ===\n`);

  const byStatus: Record<PoolStatus, string[]> = {
    mechanics: [],
    sim_ok: [],
    sim_partial: [],
    not_damage: [],
    sim_gap: [],
  };

  for (const [group, row] of poolByGroup) {
    const status = poolStatusForGroup(group);
    const procs = procSnapshot(row);
    const procStr =
      Object.keys(procs).length > 0
        ? ` {${Object.entries(procs)
            .map(([k, v]) => `${k}:${v}`)
            .join(", ")}}`
        : "";
    let line = `${row.name}${procStr}`;
    if (status === "sim_partial" && PARTIAL_NOTES[group]) {
      line += ` — ${PARTIAL_NOTES[group]}`;
    } else if (status === "not_damage") {
      line += " — support/enchanter (0 dmg expected)";
    } else if (status === "sim_gap") {
      line += " — stat stick / defensive only";
    }
    byStatus[status].push(line);
  }

  for (const status of [
    "mechanics",
    "sim_ok",
    "sim_partial",
    "not_damage",
    "sim_gap",
  ] as PoolStatus[]) {
    const rows = byStatus[status];
    if (rows.length === 0) continue;
    console.log(`--- ${probeName} / ${status} (${rows.length}) ---`);
    for (const r of rows.sort()) console.log(`  ${r}`);
    console.log();
  }

  const damagePool = champPool.length - byStatus.not_damage.length;
  console.log(
    `${probeName}: ${damagePool} damage-relevant groups, ${byStatus.not_damage.length} support.\n`,
  );
}

console.log("--- Catalog proc scan (Ezreal pool for blocking issues) ---\n");

const allIssues: Issue[] = [];
for (const item of Items) {
  if (Object.keys(procSnapshot(item)).length === 0) continue;
  const inPool = poolItemNames.has(item.name);
  for (const iss of auditCatalogItem(item, inPool)) {
    allIssues.push({
      ...iss,
      item: `${iss.item}${inPool ? " [pool]" : ""}`,
    });
  }
}

const counts = { high: 0, medium: 0, low: 0 };
for (const i of allIssues) counts[i.severity]++;

console.log(
  `Catalog proc issues: high=${counts.high} medium=${counts.medium} low=${counts.low}`,
);

for (const sev of ["high", "medium", "low"] as Severity[]) {
  const rows = allIssues.filter((i) => i.severity === sev);
  if (rows.length === 0) continue;
  console.log(`\n--- ${sev.toUpperCase()} (catalog) ---`);
  for (const r of rows) console.log(`  ${r.item}: ${r.note}`);
}

const blockingHigh = allIssues.filter(
  (i) =>
    i.severity === "high" &&
    poolItemNames.has(i.item.replace(/ \[pool\]$/, "")),
);

if (blockingHigh.length > 0) {
  console.error(
    `\n${blockingHigh.length} HIGH severity issue(s) in optimizer pool.`,
  );
  process.exit(1);
}

console.log(
  `\nAudit complete: ${MODELED_ITEM_GROUPS.length} modeled groups, 0 blocking high issues.`,
);

console.log("\n--- Wiki notes cross-reference (Ezreal pool) ---\n");
const wikiMissing = itemsMissingWikiNotes(pool);
if (wikiMissing.length > 0) {
  console.log(`Missing wiki notes: ${wikiMissing.join(", ")}`);
} else {
  console.log("All Ezreal pool groups have wiki notes.");
}
const wikiUnparsed: string[] = [];
for (const item of pool) {
  const entry = getItemWikiNotes(item);
  if (!entry) continue;
  const flags = parseItemInteractionFlags(entry.notes);
  const unparsed = findUnparsedWikiKeywords(entry, flags);
  if (unparsed.length > 0) {
    wikiUnparsed.push(
      `${item.getMechanicsGroup()}: ${unparsed.join(", ")}`,
    );
  }
}
if (wikiUnparsed.length > 0) {
  console.log(`Unparsed keywords (${wikiUnparsed.length}):`);
  for (const line of wikiUnparsed.slice(0, 12)) console.log(`  ${line}`);
} else {
  console.log("No unparsed DPS keywords in pool items.");
}
