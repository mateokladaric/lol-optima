/**
 * Verification: test that the new duel model produces sensible results.
 * Key check: the duel scoring properly accounts for sustain, shields, and survivability
 * so that builds with defense + sustain outscore pure glass builds in duel-oriented profiles.
 */

import { Characters, Items } from "@/app/actions/sim";
import {
  cloneChampionWithLoadout,
  simulateDuel,
  mixedEffectiveHP,
} from "@/lib/buildOptimizer";

function findChampion(name: string) {
  const c = Characters.find((c) => c.Name.toLowerCase() === name.toLowerCase());
  if (!c) throw new Error(`Champion not found: ${name}`);
  return c;
}

function findItem(name: string) {
  const it = Items.find((i) => i.name.toLowerCase() === name.toLowerCase());
  if (!it) {
    const partial = Items.find((i) => i.name.toLowerCase().includes(name.toLowerCase()));
    if (!partial) throw new Error(`Item not found: ${name}`);
    return partial;
  }
  return it;
}

function printDuel(
  label: string,
  attacker: ReturnType<typeof cloneChampionWithLoadout>,
  defender: ReturnType<typeof cloneChampionWithLoadout>,
  simulation?: { level?: number; enableChampionRotationProfiles?: boolean },
) {
  const result = simulateDuel(attacker, defender, simulation);
  const aStats = attacker.getTotalStats();
  const dStats = defender.getTotalStats();
  const aDps = attacker.calculateDPS(
    dStats.hp,
    Math.max(0, dStats.hp - defender.HP),
    simulation,
    {
      targetArmor: dStats.armor,
      targetMR: dStats.mr,
      comboWindowSeconds: 8,
    },
  );
  const dDps = defender.calculateDPS(
    aStats.hp,
    Math.max(0, aStats.hp - attacker.HP),
    simulation,
    {
      targetArmor: aStats.armor,
      targetMR: aStats.mr,
      comboWindowSeconds: 8,
    },
  );
  const aCombat = aDps.combatStats;
  const dCombat = dDps.combatStats;

  console.log(`\n=== ${label} ===`);
  console.log(`  Attacker: HP=${aCombat.hp.toFixed(0)}, AR=${aCombat.armor.toFixed(0)}, MR=${aCombat.mr.toFixed(0)}, DPS=${aDps.totalDPS.toFixed(1)}, LS=${aCombat.lifeSteal ?? 0}%, OV=${aCombat.omnivamp ?? 0}%, Shield=${aCombat.shieldValue ?? 0}`);
  console.log(`  Defender: HP=${dCombat.hp.toFixed(0)}, AR=${dCombat.armor.toFixed(0)}, MR=${dCombat.mr.toFixed(0)}, DPS=${dDps.totalDPS.toFixed(1)}, LS=${dCombat.lifeSteal ?? 0}%, OV=${dCombat.omnivamp ?? 0}%, Shield=${dCombat.shieldValue ?? 0}`);
  console.log(`  Duel score: ${result.score.toFixed(3)} (>1 = attacker wins)`);
  console.log(`  Attacker kills in: ${result.attackerTTK.toFixed(1)}s`);
  console.log(`  Defender kills in: ${result.defenderTTK.toFixed(1)}s`);
  return result;
}

// === VOLIBEAR MIRROR ===
const voli = findChampion("Volibear");

// Standard Volibear: balanced offense/defense
const voliStandardItems = [
  findItem("Trinity Force (Base)"),
  findItem("Sterak's Gage"),
  findItem("Dead Man's Plate"),
  findItem("Spirit Visage"),
  findItem("Thornmail"),
  findItem("Sunfire Aegis"),
];

// Glass Volibear: all damage, no resistances (no Spellblade conflicts)
const voliGlassItems = [
  findItem("Blade of the Ruined King (Melee)"),
  findItem("Wit's End"),
  findItem("Nashor's Tooth"),
  findItem("Guinsoo's Rageblade"),
  findItem("Guinsoo's Rageblade (Max Stacks)"),
  findItem("Hollow Radiance"),
];

const voliStd = cloneChampionWithLoadout(voli, voliStandardItems, null);
const voliGlass = cloneChampionWithLoadout(voli, voliGlassItems, null);

console.log("========== VOLIBEAR MIRROR MATCH ==========");
const v1 = printDuel("Standard vs Standard (baseline)", voliStd, voliStd);
const v2 = printDuel("Glass vs Standard", voliGlass, voliStd);
const v3 = printDuel("Standard vs Glass", voliStd, voliGlass);

// === CAMILLE MIRROR ===
const cam = findChampion("Camille");

// Standard Camille: Trinity + Sterak's + mixed defense
const camStandardItems = [
  findItem("Trinity Force (Base)"),
  findItem("Sterak's Gage"),
  findItem("Ravenous Hydra (Melee)"),
  findItem("Death's Dance"),
  findItem("Dead Man's Plate"),
  findItem("Spirit Visage"),
];

// Pure glass Camille: no defense, all AD/crit (no Spellblade conflict)
const camGlassItems = [
  findItem("Blade of the Ruined King (Melee)"),
  findItem("Infinity Edge"),
  findItem("Navori Flickerblade"),
  findItem("The Collector"),
  findItem("Lord Dominik's Regards"),
  findItem("Voltaic Cyclosword"),
];

const camStd = cloneChampionWithLoadout(cam, camStandardItems, null);
const camGlass = cloneChampionWithLoadout(cam, camGlassItems, null);

console.log("\n========== CAMILLE MIRROR MATCH ==========");
const c1 = printDuel("Standard vs Standard (baseline)", camStd, camStd);
const c2 = printDuel("Glass vs Standard", camGlass, camStd);
const c3 = printDuel("Standard vs Glass", camStd, camGlass);

// EHP comparison
console.log("\n========== EHP COMPARISON ==========");
const voliStdStats = voliStd.getTotalStats();
const voliGlassStats = voliGlass.getTotalStats();
const voliStdDps = voliStd.calculateDPS(voliStdStats.hp, 0);
const voliGlassDps = voliGlass.calculateDPS(voliGlassStats.hp, 0);

console.log(`Voli Standard EHP: ${mixedEffectiveHP(voliStdStats, 0.5, voliStdDps.totalDPS, 8, voliStdDps.autoAttackDPS + voliStdDps.onHitDPS, voliStdDps.physicalAbilityDPS).toFixed(0)}`);
console.log(`Voli Glass EHP: ${mixedEffectiveHP(voliGlassStats, 0.5, voliGlassDps.totalDPS, 8, voliGlassDps.autoAttackDPS + voliGlassDps.onHitDPS, voliGlassDps.physicalAbilityDPS).toFixed(0)}`);

const camStdStats = camStd.getTotalStats();
const camGlassStats = camGlass.getTotalStats();
const camStdDps = camStd.calculateDPS(camStdStats.hp, 0);
const camGlassDps = camGlass.calculateDPS(camGlassStats.hp, 0);

console.log(`Cam Standard EHP: ${mixedEffectiveHP(camStdStats, 0.5, camStdDps.totalDPS, 8, camStdDps.autoAttackDPS + camStdDps.onHitDPS, camStdDps.physicalAbilityDPS).toFixed(0)}`);
console.log(`Cam Glass EHP: ${mixedEffectiveHP(camGlassStats, 0.5, camGlassDps.totalDPS, 8, camGlassDps.autoAttackDPS + camGlassDps.onHitDPS, camGlassDps.physicalAbilityDPS).toFixed(0)}`);

// === KAYN RHAAST SUSTAIN ===
const kayn = findChampion("Kayn (Rhaast)");

const kaynSustainItems = [
  findItem("Black Cleaver"),
  findItem("Bloodthirster"),
  findItem("Death's Dance"),
  findItem("Sterak's Gage"),
  findItem("Ravenous Hydra (Melee)"),
  findItem("Eclipse"),
];

const kaynWarmogItems = [
  findItem("Black Cleaver"),
  findItem("Warmog's Armor"),
  findItem("Death's Dance"),
  findItem("Sterak's Gage"),
  findItem("Ravenous Hydra (Melee)"),
  findItem("Eclipse"),
];

const kaynSim = { level: 18, enableChampionRotationProfiles: true };
const kaynSustain = cloneChampionWithLoadout(kayn, kaynSustainItems, null);
const kaynWarmog = cloneChampionWithLoadout(kayn, kaynWarmogItems, null);

console.log("\n========== KAYN RHAAST SUSTAIN vs WARMOG ==========");
const k1 = printDuel(
  "Sustain build vs Warmog build",
  kaynSustain,
  kaynWarmog,
  kaynSim,
);
const k2 = printDuel(
  "Warmog build vs Sustain build",
  kaynWarmog,
  kaynSustain,
  kaynSim,
);

console.log("\n========== RESULTS SUMMARY ==========");

let issues = 0;

// Voli standard should beat glass
if (v2.score >= 1) {
  console.log("CONCERN: Voli glass beat Voli standard (score=" + v2.score.toFixed(3) + ")");
  issues++;
} else {
  console.log("OK: Voli standard beats Voli glass (score=" + v2.score.toFixed(3) + ")");
}

// Cam standard should beat glass
if (c2.score >= 1) {
  console.log("CONCERN: Cam glass beat Cam standard (score=" + c2.score.toFixed(3) + ")");
  issues++;
} else {
  console.log("OK: Cam standard beats Cam glass (score=" + c2.score.toFixed(3) + ")");
}

// Verify the model is sensible: mirror match scores should be ~1.0
if (Math.abs(v1.score - 1.0) > 0.001) {
  console.log("FAIL: Voli mirror score should be 1.0, got " + v1.score.toFixed(3));
  issues++;
} else {
  console.log("OK: Voli mirror is 1.000");
}

if (Math.abs(c1.score - 1.0) > 0.001) {
  console.log("FAIL: Cam mirror score should be 1.0, got " + c1.score.toFixed(3));
  issues++;
} else {
  console.log("OK: Cam mirror is 1.000");
}

// Standard EHP should be much higher than glass EHP
const voliStdEHP = mixedEffectiveHP(voliStdStats, 0.5, voliStdDps.totalDPS, 8, voliStdDps.autoAttackDPS + voliStdDps.onHitDPS, voliStdDps.physicalAbilityDPS);
const voliGlassEHP = mixedEffectiveHP(voliGlassStats, 0.5, voliGlassDps.totalDPS, 8, voliGlassDps.autoAttackDPS + voliGlassDps.onHitDPS, voliGlassDps.physicalAbilityDPS);
if (voliStdEHP < voliGlassEHP * 1.5) {
  console.log("CONCERN: Voli standard EHP not significantly higher than glass");
  issues++;
} else {
  console.log("OK: Voli standard EHP is " + (voliStdEHP / voliGlassEHP).toFixed(1) + "x glass");
}

const camStdEHP = mixedEffectiveHP(camStdStats, 0.5, camStdDps.totalDPS, 8, camStdDps.autoAttackDPS + camStdDps.onHitDPS, camStdDps.physicalAbilityDPS);
const camGlassEHP = mixedEffectiveHP(camGlassStats, 0.5, camGlassDps.totalDPS, 8, camGlassDps.autoAttackDPS + camGlassDps.onHitDPS, camGlassDps.physicalAbilityDPS);
if (camStdEHP < camGlassEHP * 1.5) {
  console.log("CONCERN: Cam standard EHP not significantly higher than glass");
  issues++;
} else {
  console.log("OK: Cam standard EHP is " + (camStdEHP / camGlassEHP).toFixed(1) + "x glass");
}

if (k1.score < 1) {
  console.log("CONCERN: Kayn Warmog build beat sustain build (score=" + k1.score.toFixed(3) + ")");
  issues++;
} else {
  console.log("OK: Kayn sustain build beats Warmog (score=" + k1.score.toFixed(3) + ")");
}

if (issues === 0) {
  console.log("\nAll duel verification checks PASSED!");
} else {
  console.log(`\n${issues} issue(s) found — see details above.`);
}
