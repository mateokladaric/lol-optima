import {
  Characters,
  collectorExecuteBonusDamage,
  isManaScalingItem,
  Item,
  Items,
  magicMitigationMultiplier,
  physicalMitigationMultiplier,
} from "../src/app/actions/sim";
import {
  dpsMitigationFromDuel,
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
if (withVoid <= noMpen) {
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
      iterationsPerRestart: 400,
      restarts: 3,
      randomProbeSamples: 60,
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
    const tankForbidden = /Warmog|Jak'Sho|Heartsteel|Sunfire|Rylai|Liandry|Guinsoo|Kraken/i;
    const tankHit = glass.items.filter((n) => tankForbidden.test(n));
    if (tankHit.length > 0) {
      fail(
        `Zed glass must not include tank/on-hit farm items: ${tankHit.join(", ")} (full: ${glass.items.join(", ")})`,
      );
    }

    const lethalityOrPen = glass.items.filter((n) => {
      const it = Items.find((i) => i.name === n);
      if (!it) return false;
      return (it.stats.lethality ?? 0) >= 10 || (it.stats.armorPen ?? 0) >= 20;
    });
    if (lethalityOrPen.length < 3) {
      fail(
        `Zed glass needs at least 3 lethality or major armor-pen items, got ${lethalityOrPen.length}: ${glass.items.join(", ")}`,
      );
    }

    const pureCritFarm =
      /Blade of the Ruined King|Navori Flickerblade|Phantom Dancer|Runaan|Terminus/i;
    const critFarm = glass.items.filter((n) => pureCritFarm.test(n));
    if (critFarm.length > 0) {
      fail(
        `Zed glass should not stack attack-speed/crit farm items: ${critFarm.join(", ")}`,
      );
    }
  }

  const collector = Items.find((i) => i.name === "The Collector");
  if (collector) {
    const mitZed = dpsMitigationFromDuel(duel);
    const filler = Items.filter(
      (i) =>
        i.getGroupName() !== collector.getGroupName() &&
        (i.stats.lethality ?? 0) >= 10,
    ).slice(0, 5);
    if (filler.length === 5) {
      const withCollector = Object.assign(
        Object.create(Object.getPrototypeOf(zed)),
        zed,
      ) as typeof zed;
      const without = Object.assign(
        Object.create(Object.getPrototypeOf(zed)),
        zed,
      ) as typeof zed;
      withCollector.Items = [collector, ...filler];
      without.Items = filler;
      const dWith = withCollector.calculateDPS(
        duel.targetMaxHP,
        duel.targetBonusHP,
        { level: 16, enableChampionRotationProfiles: true },
        mitZed,
      );
      const dWithout = without.calculateDPS(
        duel.targetMaxHP,
        duel.targetBonusHP,
        { level: 16, enableChampionRotationProfiles: true },
        mitZed,
      );
      const hasExecuteLine = dWith.breakdown.some((l) =>
        l.includes("Collector execute"),
      );
      if (dWith.comboDPS <= dWithout.comboDPS && !hasExecuteLine) {
        fail(
          `Collector should raise combo DPS or proc execute on near-lethal combo (with=${dWith.comboDPS.toFixed(1)}, without=${dWithout.comboDPS.toFixed(1)})`,
        );
      }
    }
  }
}

const aatrox = Characters.find((c) => c.Name === "Aatrox");
if (aatrox) {
  const aatroxRecs = recommendBuildsForChampion(aatrox, Items, {
    simulation: { level: 16 },
    monteCarloParams: { iterationsPerRestart: 150, restarts: 2, randomProbeSamples: 30 },
  });
  for (const rec of aatroxRecs) {
    const manaItems = rec.items.filter((n) => {
      const it = Items.find((i) => i.name === n);
      return it && isManaScalingItem(it);
    });
    if (manaItems.length > 0) {
      fail(
        `Aatrox ${rec.profile}: manaless champ must not build mana items: ${manaItems.join(", ")}`,
      );
    }
  }
}

{
  const bonus = collectorExecuteBonusDamage(1450, 1500, 1500, 5);
  if (bonus <= 0 || bonus >= 75) {
    fail(
      `Collector execute bonus should be >0 and <5% max HP when leaving target sub-threshold (got ${bonus})`,
    );
  }
  const noBonus = collectorExecuteBonusDamage(1200, 1500, 1500, 5);
  if (noBonus !== 0) {
    fail(`Collector execute should not proc when target remains above 5% max HP`);
  }
}

const garen = Characters.find((c) => c.Name === "Garen");
if (garen) {
  const mit = dpsMitigationFromDuel(duel);
  const ampItem = new Item(
    "Regression Phys Amp",
    { physicalDamageMultiplicative: 30 },
    [],
    "Regression Phys Amp",
  );
  const noItem = Object.assign(
    Object.create(Object.getPrototypeOf(garen)),
    garen,
  ) as typeof garen;
  const withAmp = Object.assign(
    Object.create(Object.getPrototypeOf(garen)),
    garen,
  ) as typeof garen;
  withAmp.Items = [ampItem];
  const d0 = noItem.calculateDPS(
    duel.targetMaxHP,
    duel.targetBonusHP,
    { level: 16 },
    mit,
  );
  const d1 = withAmp.calculateDPS(
    duel.targetMaxHP,
    duel.targetBonusHP,
    { level: 16 },
    mit,
  );
  if (d1.abilityDPS <= d0.abilityDPS) {
    fail(
      `Physical damage amp should buff physical abilities (base=${d0.abilityDPS.toFixed(1)}, amp=${d1.abilityDPS.toFixed(1)})`,
    );
  }
}

console.log(`Regression checks passed (${CASES.length} champion scenarios).`);
