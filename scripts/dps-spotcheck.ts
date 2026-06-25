/**
 * Quick sustained + combo DPS spot-check for wiki wiring validation.
 * Run: npx tsx scripts/dps-spotcheck.ts
 */
import { Characters, Items } from "@/app/actions/sim";
import { cloneChampionWithLoadout } from "@/lib/buildOptimizer";

const TARGET_HP = 2200;
const TARGET_CURRENT = 1320;
const LEVEL = 18;

const LOADOUT = [
  "Kraken Slayer (Base)",
  "Infinity Edge",
  "Lord Dominik's Regards",
  "Phantom Dancer",
  "Bloodthirster",
  "The Collector",
];

function findChampion(name: string) {
  const c = Characters.find((ch) => ch.Name === name);
  if (!c) throw new Error(`Champion not found: ${name}`);
  return c;
}

function findItem(name: string) {
  const it = Items.find((i) => i.name.toLowerCase() === name.toLowerCase());
  if (!it) throw new Error(`Item not found: ${name}`);
  return it;
}

function spotCheck(name: string) {
  const base = findChampion(name);
  const items = LOADOUT.map(findItem);
  const champ = cloneChampionWithLoadout(base, items, null);
  const sim = { level: LEVEL, enableChampionRotationProfiles: true };

  const sustained = champ.calculateDPS(TARGET_HP, TARGET_CURRENT, sim, {
    targetArmor: 95,
    targetMR: 45,
  });
  const combo = champ.calculateDPS(TARGET_HP, TARGET_CURRENT, sim, {
    targetArmor: 95,
    targetMR: 45,
    comboWindowSeconds: 8,
  });

  console.log(`\n${name} (L${LEVEL} ADC-ish loadout vs ~95 AR / 45 MR dummy)`);
  console.log(
    `  Sustained: ${sustained.totalDPS.toFixed(0)} DPS (auto ${sustained.autoAttackDPS?.toFixed(0) ?? "?"}, ability ${sustained.abilityDPS?.toFixed(0) ?? "?"})`,
  );
  console.log(`  8s combo:  ${combo.totalDPS.toFixed(0)} DPS`);
  if (sustained.breakdown?.length) {
    console.log(`  Notes: ${sustained.breakdown.slice(0, 4).join(" | ")}`);
  }
}

const CHAMPS = [
  "Varus",
  "Zeri",
  "Master Yi",
  "Akali",
  "Malzahar",
  "Zed",
  "Smolder",
  "Kayn (Rhaast)",
  "Kayn (Shadow Assassin)",
];

console.log("=== DPS spot-check (post wiki deepen) ===");
for (const name of CHAMPS) spotCheck(name);
