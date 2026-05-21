/**
 * Static audit: item proc stats vs optimizer pool + known modeling rules.
 * Run: npm run audit:items
 */
import {
  Characters,
  Items,
  type Item,
  type ItemStats,
} from "../src/app/actions/sim";
import {
  buildRealisticItemPool,
  applyRealisticApproximation,
} from "../src/lib/buildOptimizer";

const PROC_KEYS: (keyof ItemStats)[] = [
  "trueOnAbilityHit",
  "trueOnAbilityHitPerLethality",
  "trueOnAbilityHitCooldown",
  "physicalOnAbilityHitMaxManaPercent",
  "physicalOnAbilityHitCooldown",
  "physicalOnHit",
  "physicalOnHitMaxHealthPercent",
  "physicalOnHitCurrentHealthPercent",
  "magicOnHit",
  "magicPeriodicOnHit",
  "magicDotDamage",
  "magicDotDamagePerAPRatio",
  "damageAmplificationOnTarget",
  "executeMaxHealthThresholdPercent",
  "physicalAoEOnHitADPercent",
  "physicalAoEOnHitMaxHealthPercent",
];

type Issue = { item: string; severity: "high" | "medium" | "low"; note: string };

function isMeleeChampion(name: string): boolean {
  const c = Characters.find((ch) => ch.Name === name);
  return c ? c.AttackRange <= 250 : true;
}

function procSnapshot(item: Item): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of PROC_KEYS) {
    const v = item.stats[k];
    if (v != null && v !== 0) out[k] = v as number;
  }
  return out;
}

function auditItem(item: Item, inPool: boolean): Issue[] {
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
      note: "true on-ability-hit without ICD (every-cast inflation risk)",
    });
  }

  if (s.physicalOnAbilityHitMaxManaPercent && !s.physicalOnAbilityHitCooldown) {
    issues.push({
      item: name,
      severity: "high",
      note: "Muramana-style shock without physicalOnAbilityHitCooldown",
    });
  }

  if (name.includes("Skipper") && (s.physicalOnHitBaseADPercent || s.physicalOnHitMaxHealthPercent)) {
    issues.push({
      item: name,
      severity: "high",
      note: "Hullbreaker Skipper on-hit is vs structures/minions, not champions",
    });
  }

  if (s.magicDotDamage && s.magicDotDamage >= 40 && !name.includes("Burn avg")) {
    issues.push({
      item: name,
      severity: "medium",
      note: `magicDotDamage=${s.magicDotDamage} treated as flat DPS — verify burn uptime`,
    });
  }

  if (s.damageAmplificationOnTarget && name.includes("Hypershot")) {
    issues.push({
      item: name,
      severity: "low",
      note: "Hypershot row — sim uses fixed melee/ranged uptime in itemMechanics",
    });
  }
  if (
    s.damageAmplificationOnTarget &&
    inPool &&
    item.getGroupName() === "Horizon Focus" &&
    !name.includes("Hypershot")
  ) {
    issues.push({
      item: name,
      severity: "low",
      note: "Horizon base row — amp applied via Hypershot melee/ranged uptime in sim",
    });
  }

  if (/\(\d+ stacks?\)/i.test(name) && inPool) {
    issues.push({
      item: name,
      severity: "medium",
      note: "stack variant in optimizer pool — may overstate stacks",
    });
  }

  if (s.ultCooldownRefundOnTakedown) {
    issues.push({
      item: name,
      severity: "low",
      note: "Axiom ult refund on takedown not modeled in sustained 1v1 CD loop",
    });
  }

  return issues;
}

const probe = Characters.find((c) => c.Name === "Ezreal")!;
const melee = isMeleeChampion("Ezreal");
const pool = buildRealisticItemPool(probe, Items);
const poolItemNames = new Set(pool.map((i) => i.name));

console.log("=== Item proc audit (loloptima) ===\n");
console.log(`Optimizer pool: ${pool.length} item groups\n`);

const allIssues: Issue[] = [];
for (const item of Items) {
  const procs = procSnapshot(item);
  if (Object.keys(procs).length === 0) continue;
  const inPool = poolItemNames.has(item.name);
  const issues = auditItem(item, inPool);
  for (const iss of issues) {
    allIssues.push({ ...iss, item: `${iss.item}${inPool ? " [pool]" : ""}` });
  }
}

const approxGroups = [
  "Kraken Slayer",
  "Hubris",
  "Terminus",
  "Blight",
  "Blackfire Torch",
  "Malignance",
];
console.log("Mechanics modeled in sim (itemMechanics.ts + calculateDPS):");
console.log(
  "  Kraken (3rd AA + missing HP), Stormrazor (100 energize), Hubris (Eminence takedown),",
);
console.log(
  "  Terminus (stack ramp), Bloodletter (Blight stacks), Blackfire/Malignance (burn refresh),",
);
console.log(
  "  Horizon Hypershot (fixed 30% melee / 80% ranged uptime @ 600+ units), Axiom, Muramana, Hullbreaker Skipper excluded.",
);

const bySeverity = { high: 0, medium: 0, low: 0 };
for (const i of allIssues) bySeverity[i.severity]++;

console.log(`\nIssues: high=${bySeverity.high} medium=${bySeverity.medium} low=${bySeverity.low}\n`);

for (const sev of ["high", "medium", "low"] as const) {
  const rows = allIssues.filter((i) => i.severity === sev);
  if (rows.length === 0) continue;
  console.log(`--- ${sev.toUpperCase()} ---`);
  for (const r of rows) console.log(`  ${r.item}: ${r.note}`);
  console.log();
}

const blockingHigh = allIssues.filter(
  (i) => i.severity === "high" && poolItemNames.has(i.item.replace(/ \[pool\]$/, "")),
);
if (blockingHigh.length > 0) {
  console.error(
    `Audit found ${blockingHigh.length} HIGH severity issue(s) in the optimizer pool.`,
  );
  process.exit(1);
}

console.log("Audit complete (no unresolved high-severity issues in catalog).");
