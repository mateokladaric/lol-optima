import {
  Characters,
  isManaScalingItem,
  Items,
  magicMitigationMultiplier,
  physicalMitigationMultiplier,
} from "../src/app/actions/sim";
import {
  recommendBuildsForChampion,
  resolveDuel,
} from "../src/lib/buildOptimizer";

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

const lux = Characters.find((c) => c.Name === "Lux");
if (lux) {
  const luxSpell = recommendBuildsForChampion(lux, Items, {
    simulation: { level: 18 },
    monteCarlo: false,
  }).find((r) => r.profile === "spell");
  const forbidden = /Blade of the Ruined King|Navori Flickerblade|Phantom Dancer/i;
  const bad = (luxSpell?.items ?? []).some((n) => forbidden.test(n));
  if (bad) {
    fail(
      `Lux spell-only must not pick auto/on-hit items (Navori/BotRK/PD): ${luxSpell?.items.join(", ")}`,
    );
  }
}

const duel = resolveDuel();
const noPen = physicalMitigationMultiplier(duel.targetArmor, {}, 18);
const withLeth = physicalMitigationMultiplier(
  duel.targetArmor,
  { lethality: 54 },
  18,
);
if (withLeth <= noPen) {
  fail(
    `Lethality should increase physical damage vs ${duel.targetArmor} armor (no pen=${noPen.toFixed(3)}, leth=${withLeth.toFixed(3)})`,
  );
}

const mr = 100;
const noMpen = magicMitigationMultiplier(mr, {});
const withVoid = magicMitigationMultiplier(mr, { magicPen: 40 });
if (withVoid >= noMpen) {
  fail(
    `40% magic pen should increase magic damage vs ${mr} MR (no pen=${noMpen.toFixed(3)}, void=${withVoid.toFixed(3)})`,
  );
}
// 40% pen → 60 MR; flat −40 would be harsher (wrong model)
const wrongFlat = 100 / (100 + Math.max(0, mr - 40));
if (withVoid < wrongFlat - 0.001) {
  fail(
    `Magic pen should use percentage, not flat subtraction (pct=${withVoid.toFixed(3)}, wrong flat=${wrongFlat.toFixed(3)})`,
  );
}

const zed = Characters.find((c) => c.Name === "Zed");
if (zed) {
  const mit = {
    targetArmor: duel.targetArmor,
    targetMR: duel.targetMR,
    comboWindowSeconds: duel.comboWindowSeconds,
  };
  const lethalityItems = Items.filter((i) => (i.stats.lethality ?? 0) >= 15);
  const adItems = Items.filter(
    (i) =>
      (i.stats.ad ?? 0) >= 50 &&
      !i.stats.lethality &&
      !i.stats.armorPen &&
      !i.stats.physicalBurstDamage,
  );
  if (lethalityItems.length < 6 || adItems.length < 6) {
    fail("Not enough items for lethality vs AD stack regression");
  }
  const groupsLeth = new Set<string>();
  const lethBuild: typeof Items = [];
  for (const it of lethalityItems) {
    const g = it.getGroupName();
    if (groupsLeth.has(g)) continue;
    groupsLeth.add(g);
    lethBuild.push(it);
    if (lethBuild.length === 6) break;
  }
  const groupsAd = new Set<string>();
  const adBuild: typeof Items = [];
  for (const it of adItems) {
    const g = it.getGroupName();
    if (groupsAd.has(g)) continue;
    groupsAd.add(g);
    adBuild.push(it);
    if (adBuild.length === 6) break;
  }
  const zLeth = Object.assign(
    Object.create(Object.getPrototypeOf(zed)),
    zed,
  ) as typeof zed;
  const zAd = Object.assign(
    Object.create(Object.getPrototypeOf(zed)),
    zed,
  ) as typeof zed;
  zLeth.Items = lethBuild;
  zAd.Items = adBuild;
  const dpsLeth = zLeth.calculateDPS(
    duel.targetMaxHP,
    duel.targetBonusHP,
    { level: 16, enableChampionRotationProfiles: true },
    mit,
  );
  const dpsAd = zAd.calculateDPS(
    duel.targetMaxHP,
    duel.targetBonusHP,
    { level: 16, enableChampionRotationProfiles: true },
    mit,
  );
  if (dpsLeth.totalDPS <= dpsAd.totalDPS) {
    fail(
      `Zed: 6× lethality items should beat 6× AD on totalDPS vs ${duel.targetArmor} armor (ad=${dpsAd.totalDPS.toFixed(1)}, leth=${dpsLeth.totalDPS.toFixed(1)})`,
    );
  }

  const recs = recommendBuildsForChampion(zed, Items, {
    simulation: { level: 16, enableChampionRotationProfiles: true },
    monteCarloParams: {
      iterationsPerRestart: 200,
      restarts: 2,
      randomProbeSamples: 40,
    },
  });
  for (const rec of recs) {
    if (hasDuplicateGroups(rec.items)) {
      fail(
        `Zed ${rec.profile}: duplicate item groups in ${rec.items.join(", ")}`,
      );
    }
    const manaflowCount = rec.items.filter((n) => {
      const it = Items.find((i) => i.name === n);
      return it?.getGroupName() === "Manaflow";
    }).length;
    if (manaflowCount > 1) {
      fail(
        `Zed ${rec.profile}: at most one Manaflow item allowed, got ${manaflowCount} in ${rec.items.join(", ")}`,
      );
    }
    const manaScaled = rec.items.filter((n) => {
      const it = Items.find((i) => i.name === n);
      return it && isManaScalingItem(it);
    });
    if (manaScaled.length > 0) {
      fail(
        `Zed ${rec.profile}: energy champ must not build mana items: ${manaScaled.join(", ")}`,
      );
    }
  }

  const glass = recs.find((r) => r.profile === "glass");
  if (glass) {
    const forbiddenGlass =
      /Infinity Edge|Blade of the Ruined King|Navori Flickerblade|Phantom Dancer|Warmog|Jak'Sho/i;
    const badGlass = glass.items.some((n) => forbiddenGlass.test(n));
    if (badGlass) {
      fail(
        `Zed glass should favor lethality burst, not crit/on-hit/tank: ${glass.items.join(", ")}`,
      );
    }
    const hasLethality = glass.items.some((n) => {
      const it = Items.find((i) => i.name === n);
      return (it?.stats.lethality ?? 0) >= 10;
    });
    if (!hasLethality) {
      fail(
        `Zed glass should include at least one lethality item: ${glass.items.join(", ")}`,
      );
    }
  }
}

console.log(`Regression checks passed (${CASES.length} champion scenarios).`);
