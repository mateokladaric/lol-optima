import {
  BLENDED_DPS_COMBO_WEIGHT,
  Characters,
  championBaseStatsAtLevel,
  championLevelStatScale,
  collectorExecuteBonusDamage,
  isManaScalingItem,
  Item,
  Items,
  magicMitigationMultiplier,
  physicalMitigationMultiplier,
  runeConditionUptime,
  runeProcSustainedDPS,
} from "../src/app/actions/sim";
import {
  BASTIONBREAKER_ICD_SECONDS,
  BASTIONBREAKER_TRUE_BASE_MELEE,
  BASTIONBREAKER_TRUE_LETHALITY_MELEE,
  ECLIPSE_ICD_SECONDS,
  ECLIPSE_MELEE_MAX_HP_PERCENT,
  ECLIPSE_RANGED_MAX_HP_PERCENT,
  HORIZON_HYPERSHOT_UPTIME_MELEE,
  HORIZON_HYPERSHOT_UPTIME_RANGED,
} from "../src/lib/itemMechanics";
import {
  averageEnemyTeamStats,
  dpsMitigationForPurchaseStep,
  dpsMitigationFromDuel,
  estimateEnemyIncomingPhysShare,
  greedySimPurchaseOrder,
  recommendBuildsForChampion,
  resolveDuel,
} from "../src/lib/buildOptimizer";
import { championIncomingPhysShare } from "../src/app/actions/sim";
import {
  opponentAtPurchaseStep,
  purchaseLevelForItemCount,
} from "../src/lib/purchaseOrder";
import {
  canAddItemToBuild,
  hasFatalityConflict,
  isValidFullBuild,
} from "../src/lib/itemExclusiveGroups";

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
  const luxOpts = {
    simulation: { level: 18 },
    monteCarlo: false as const,
  };
  const luxRecs = recommendBuildsForChampion(lux, Items, luxOpts);
  const forbidden = /Blade of the Ruined King|Navori Flickerblade|Phantom Dancer/i;
  for (const profile of ["spell", "ability_burst"] as const) {
    const rec = luxRecs.find((r) => r.profile === profile);
    const bad = (rec?.items ?? []).some((n) => forbidden.test(n));
    if (bad) {
      fail(
        `Lux ${profile} must not pick auto/on-hit items (Navori/BotRK/PD): ${rec?.items.join(", ")}`,
      );
    }
    if (rec && (rec.autoAttackDPS > 0.5 || rec.onHitDPS > 0.5)) {
      fail(
        `Lux ${profile} sim must have no AA/on-hit DPS (aa=${rec.autoAttackDPS}, onHit=${rec.onHitDPS})`,
      );
    }
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
const withVoid = magicMitigationMultiplier(mr, { percentMagicPen: 40 });
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
  const mit = dpsMitigationFromDuel(duel, 8);
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

    const zedOrderNames = [
      "Youmuu's Ghostblade",
      "Eclipse",
      "Serylda's Grudge",
      "Ionian Boots of Lucidity",
      "Edge of Night",
      "Voltaic Cyclosword",
    ];
    const zedOrderItems = zedOrderNames
      .map((n) => Items.find((i) => i.name === n))
      .filter((i): i is Item => i != null);
    if (zedOrderItems.length === 6) {
      const buyOrder = greedySimPurchaseOrder(
        zed,
        zedOrderItems,
        "glass",
        duel,
        { level: 16 },
        null,
      );
      const first = buyOrder[0]?.name ?? "";
      const mit0 = dpsMitigationForPurchaseStep(duel, 1, 6);
      const mit6 = dpsMitigationFromDuel(duel);
      if (mit0.targetArmor >= mit6.targetArmor - 5) {
        fail(
          `Purchase-step armor should scale down early (1 item=${mit0.targetArmor}, full=${mit6.targetArmor})`,
        );
      }
      if (/Serylda|Last Whisper|Lord Dominik/i.test(first)) {
        fail(
          `Zed buy order should not rush armor pen first vs low early armor (got: ${buyOrder.map((i) => i.name).join(" → ")})`,
        );
      }
      const userBuild = [
        "Serylda's Grudge",
        "Profane Hydra (Melee)",
        "Hubris",
        "Axiom Arc",
        "Bastionbreaker",
        "Umbral Glaive (Base)",
      ]
        .map((n) => Items.find((i) => i.name === n))
        .filter((i): i is Item => i != null);
      if (userBuild.length === 6) {
        const userOrder = greedySimPurchaseOrder(
          zed,
          userBuild,
          "glass",
          duel,
          { level: 16 },
          null,
        );
        if (/Serylda/i.test(userOrder[0]?.name ?? "")) {
          fail(
            `Zed buy order (reported build): Serylda first (got: ${userOrder.map((i) => i.name).join(" → ")})`,
          );
        }
      }
    }
  }

  const kayn = Characters.find((c) => c.Name === "Kayn (Rhaast)");
  if (kayn) {
    const kaynRecs = recommendBuildsForChampion(kayn, Items, {
      simulation: { level: 18, enableChampionRotationProfiles: true },
      monteCarloParams: {
        iterationsPerRestart: 400,
        restarts: 3,
        randomProbeSamples: 60,
      },
    });
    const kaynBalanced = kaynRecs.find((r) => r.profile === "balanced");
    if (kaynBalanced) {
      if (/Warmog/i.test(kaynBalanced.items.join(" "))) {
        fail(
          `Kayn (Rhaast) balanced must not include Warmog's (got: ${kaynBalanced.items.join(", ")})`,
        );
      }
      const sustainHit = kaynBalanced.items.filter((n) =>
        /Bloodthirster|Death's Dance|Ravenous Hydra|Profane Hydra|Blade of the Ruined King|Maw of Malmortius/i.test(
          n,
        ),
      );
      if (sustainHit.length < 1) {
        fail(
          `Kayn (Rhaast) balanced should include a sustain item (BT/Hydra/DD), got: ${kaynBalanced.items.join(", ")}`,
        );
      }
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

const khazix = Characters.find((c) => c.Name === "Kha'Zix");
if (khazix) {
  const squishyDuel = resolveDuel({
    targetArmor: 0,
    targetMR: 0,
    targetMaxHP: 2000,
    targetBonusHP: 0,
    comboWindowSeconds: 8,
  });
  const khaRecs = recommendBuildsForChampion(khazix, Items, {
    simulation: { level: 16 },
    duel: squishyDuel,
    monteCarlo: false,
    optimizeKeystones: false,
  });
  const khaGlass = khaRecs.find((r) => r.profile === "glass");
  if (khaGlass) {
    const apMythics =
      /Luden|Stormsurge|Rabadon|Rocketbelt|Gunblade|Liandry|Void Staff|Riftmaker|Blackfire|Malignance/i;
    const apHit = khaGlass.items.filter((n) => apMythics.test(n));
    if (apHit.length > 0) {
      fail(
        `Kha'Zix glass vs 0 armor/0 MR must not stack AP mythics (no kit AP scaling): ${apHit.join(", ")} (full: ${khaGlass.items.join(", ")})`,
      );
    }
    const lethalityOrAd = khaGlass.items.filter((n) => {
      const it = Items.find((i) => i.name === n);
      if (!it) return false;
      return (
        (it.stats.lethality ?? 0) >= 10 ||
        (it.stats.ad ?? 0) >= 45 ||
        (it.stats.armorPen ?? 0) >= 20
      );
    });
    if (lethalityOrAd.length < 3) {
      fail(
        `Kha'Zix glass needs AD/lethality items, got ${lethalityOrAd.length}: ${khaGlass.items.join(", ")}`,
      );
    }
  }
}

const rengar = Characters.find((c) => c.Name === "Rengar");
if (rengar) {
  const squishyDuel = resolveDuel({
    targetArmor: 0,
    targetMR: 0,
    targetMaxHP: 2000,
    targetBonusHP: 0,
    comboWindowSeconds: 8,
  });
  const rengarRecs = recommendBuildsForChampion(rengar, Items, {
    simulation: { level: 16 },
    duel: squishyDuel,
    monteCarlo: false,
    optimizeKeystones: false,
  });
  const rengarGlass = rengarRecs.find((r) => r.profile === "glass");
  if (rengarGlass) {
    const apMythics =
      /Luden|Stormsurge|Rabadon|Rocketbelt|Gunblade|Liandry|Void Staff|Shadowflame|Riftmaker|Blackfire|Malignance/i;
    const apHit = rengarGlass.items.filter((n) => apMythics.test(n));
    if (apHit.length > 0) {
      fail(
        `Rengar glass must not stack AP mythics (AD assassin): ${apHit.join(", ")} (full: ${rengarGlass.items.join(", ")})`,
      );
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

{
  const graspEffect = {
    type: "onHit" as const,
    trigger: "conditional" as const,
    cooldown: 4,
    damage: { maxHealthRatio: 4, damageType: "magic" as const },
  };
  const slow = runeProcSustainedDPS(80, graspEffect, 1.0);
  const fast = runeProcSustainedDPS(80, graspEffect, 2.5);
  if (Math.abs(slow.dps - fast.dps) > 0.05) {
    fail(
      `ICD rune DPS must not double with AS (1.0 AS=${slow.dps.toFixed(2)}, 2.5 AS=${fast.dps.toFixed(2)})`,
    );
  }
  const ptaEffect = {
    type: "onHit" as const,
    trigger: "onThirdHit" as const,
    cooldown: 6,
    damage: { baseDamage: 100, damageType: "physical" as const },
  };
  // At 0.4 AS, 3 hits take 7.5s > 6s ICD, so DPS = 100/7.5
  // At 0.8 AS, 3 hits take 3.75s < 6s ICD, so DPS = 100/6
  const ptaSlow = runeProcSustainedDPS(100, ptaEffect, 0.4);
  const ptaFast = runeProcSustainedDPS(100, ptaEffect, 0.8);
  if (ptaFast.dps <= ptaSlow.dps) {
    fail("PTA proc DPS should rise with attack speed when 3-hit time exceeds ICD");
  }
}

{
  const sim = {
    avgCurrentHPRatio: 0.6,
    conditionalLowHpUptime: 0.3,
    conditionalHighHpUptime: 0.8,
    conditionalGeneralUptime: 0.5,
    level: 18,
    onHitPassiveFallbackSustain: 0.85,
    onHitActiveFallbackSustain: 0.92,
    abilityHasteCap: 120,
    cooldownFloorBaseRatio: 0.1,
    enableChampionRotationProfiles: true,
    spellOnlyNoAutos: false,
    assumedForm: "base" as const,
  };
  const cutDownUptime = runeConditionUptime(
    [{ type: "targetHealthDifference", threshold: 1000, operator: ">" }],
    sim,
    2000,
  );
  const cutDownLowBonus = runeConditionUptime(
    [{ type: "targetHealthDifference", threshold: 1000, operator: ">" }],
    sim,
    200,
  );
  if (cutDownUptime <= cutDownLowBonus) {
    fail("Cut Down uptime should be higher vs high bonus-HP targets");
  }
}

{
  const horizon = Items.find((i) => i.name === "Horizon Focus");
  const ahri = Characters.find((c) => c.Name === "Ahri");
  const zed = Characters.find((c) => c.Name === "Zed");
  if (horizon && ahri && zed) {
    const mit = dpsMitigationFromDuel(duel);
    const sim = { level: 16, enableChampionRotationProfiles: true };
    const dpsGain = (champ: typeof ahri) => {
      const base = Object.assign(
        Object.create(Object.getPrototypeOf(champ)),
        champ,
      ) as typeof champ;
      const withHorizon = Object.assign(
        Object.create(Object.getPrototypeOf(champ)),
        champ,
      ) as typeof champ;
      withHorizon.Items = [horizon];
      const d0 = base.calculateDPS(
        duel.targetMaxHP,
        duel.targetBonusHP,
        sim,
        mit,
      ).totalDPS;
      const d1 = withHorizon.calculateDPS(
        duel.targetMaxHP,
        duel.targetBonusHP,
        sim,
        mit,
      ).totalDPS;
      return (d1 - d0) / Math.max(d0, 1);
    };
    const rangedGain = dpsGain(ahri);
    const meleeGain = dpsGain(zed);
    const expectedRatio =
      HORIZON_HYPERSHOT_UPTIME_RANGED / HORIZON_HYPERSHOT_UPTIME_MELEE;
    if (rangedGain < meleeGain * expectedRatio * 0.85) {
      fail(
        `Horizon Hypershot should benefit ranged more than melee (Ahri +${(rangedGain * 100).toFixed(1)}%, Zed +${(meleeGain * 100).toFixed(1)}%, expected ~${expectedRatio.toFixed(2)}×)`,
      );
    }
    const ahriLine = withHorizonBreakdown(ahri, horizon, sim, mit);
    if (!ahriLine?.includes("ranged")) {
      fail("Horizon breakdown should tag ranged Hypershot uptime for Ahri");
    }
  }
}

function withHorizonBreakdown(
  champ: (typeof Characters)[0],
  horizon: Item,
  sim: { level: number; enableChampionRotationProfiles: boolean },
  mit: ReturnType<typeof dpsMitigationFromDuel>,
): string | undefined {
  const c = Object.assign(
    Object.create(Object.getPrototypeOf(champ)),
    champ,
  ) as typeof champ;
  c.Items = [horizon];
  return c
    .calculateDPS(duel.targetMaxHP, duel.targetBonusHP, sim, mit)
    .breakdown.find((b) => b.includes("Horizon Hypershot"));
}

const ezreal = Characters.find((c) => c.Name === "Ezreal");
if (ezreal) {
  const mit = dpsMitigationFromDuel(duel);
  const muramana = Items.find((i) => i.name === "Muramana (Ranged)");
  if (muramana) {
    const withMuramana = Object.assign(
      Object.create(Object.getPrototypeOf(ezreal)),
      ezreal,
    ) as typeof ezreal;
    withMuramana.Items = [muramana];
    const d = withMuramana.calculateDPS(
      duel.targetMaxHP,
      duel.targetBonusHP,
      { level: 16, enableChampionRotationProfiles: true },
      mit,
    );
    const shockLine = d.breakdown.find((b) => b.includes("Muramana Shock"));
    if (!shockLine) {
      fail("Muramana Shock should appear as ICD-gated proc in DPS breakdown");
    }
    const maxMana = withMuramana.getTotalStats().mana;
    const shockPerProc = (maxMana * 3) / 100;
    const shockDpsCap = (shockPerProc / 2) * 1.5;
    if (d.abilityDPS > shockDpsCap + 400) {
      fail(
        `Muramana shock inflated per ability cast (abilityDPS=${d.abilityDPS.toFixed(0)}, cap~${shockDpsCap.toFixed(0)})`,
      );
    }
  }
}

const jinx = Characters.find((c) => c.Name === "Jinx");
if (jinx) {
  const mit = dpsMitigationFromDuel(duel);
  const botrk = Items.find((i) => i.name.includes("Blade of the Ruined King"));
  if (botrk) {
    const withOnHit = Object.assign(
      Object.create(Object.getPrototypeOf(jinx)),
      jinx,
    ) as typeof jinx;
    withOnHit.Items = [botrk];
    const d = withOnHit.calculateDPS(
      duel.targetMaxHP,
      duel.targetBonusHP,
      { level: 16, enableChampionRotationProfiles: true },
      mit,
    );
    if (d.comboDPS <= d.autoAttackDPS * 0.5) {
      fail(
        `On-hit items should contribute to combo DPS (combo=${d.comboDPS.toFixed(1)}, aa=${d.autoAttackDPS.toFixed(1)})`,
      );
    }
    const blended =
      d.sustainedDPS * (1 - BLENDED_DPS_COMBO_WEIGHT) +
      d.comboDPS * BLENDED_DPS_COMBO_WEIGHT;
    if (Math.abs(d.totalDPS - blended) > 0.5) {
      fail(
        `totalDPS should match blended sustained/combo (got ${d.totalDPS.toFixed(2)}, expected ${blended.toFixed(2)})`,
      );
    }
  }
}

if (
  purchaseLevelForItemCount(1) !== 7 ||
  purchaseLevelForItemCount(2) !== 10 ||
  purchaseLevelForItemCount(6) !== 17
) {
  fail(
    `Purchase step levels mismatch: got ${[1, 2, 6].map(purchaseLevelForItemCount).join(", ")}`,
  );
}

if (championLevelStatScale(7) >= championLevelStatScale(18)) {
  fail("Level 7 base stat scale should be below level 18");
}

const duelFull = resolveDuel({ targetArmor: 100, targetMR: 80, targetMaxHP: 3000 });
const oppEarly = opponentAtPurchaseStep(duelFull, 1, 6, 1);
const oppLate = opponentAtPurchaseStep(duelFull, 6, 6, 6);
if (oppEarly.level !== 7 || oppLate.level !== 17) {
  fail(
    `Opponent purchase levels wrong: early=${oppEarly.level} late=${oppLate.level}`,
  );
}
if (
  oppEarly.targetMaxHP >= oppLate.targetMaxHP ||
  oppEarly.targetArmor >= oppLate.targetArmor
) {
  fail(
    `Opponent should scale up with items/level (HP ${oppEarly.targetMaxHP}→${oppLate.targetMaxHP}, armor ${oppEarly.targetArmor}→${oppLate.targetArmor})`,
  );
}

const zedPurchase = Characters.find((c) => c.Name === "Zed");
if (zedPurchase) {
  const youmuu = Items.find((i) => i.name === "Youmuu's Ghostblade");
  if (youmuu) {
    const mit = dpsMitigationFromDuel(duel);
    const clone = (items: Item[], level: number) => {
      const c = Object.assign(
        Object.create(Object.getPrototypeOf(zedPurchase)),
        zedPurchase,
      ) as typeof zedPurchase;
      c.Items = items;
      return c.calculateDPS(
        duel.targetMaxHP,
        duel.targetBonusHP,
        { level, enableChampionRotationProfiles: true },
        mit,
      );
    };
    const early = clone([youmuu], purchaseLevelForItemCount(1));
    const late = clone([youmuu], purchaseLevelForItemCount(6));
    if (early.comboDPS >= late.comboDPS) {
      fail(
        `Same item should score lower at purchase level 7 than 17 (early=${early.comboDPS.toFixed(1)}, late=${late.comboDPS.toFixed(1)})`,
      );
    }
    const baseEarly = championBaseStatsAtLevel(zedPurchase, 7);
    const baseLate = championBaseStatsAtLevel(zedPurchase, 17);
    if (baseEarly.armor >= baseLate.armor || baseEarly.ad >= baseLate.ad) {
      fail("Scaled base armor/AD should rise with purchase level");
    }
  }
}

const zedEclipse = Characters.find((c) => c.Name === "Zed");
const ezrealEclipse = Characters.find((c) => c.Name === "Ezreal");
const eclipseItem = Items.find((i) => i.getGroupName() === "Eclipse");
if (zedEclipse && ezrealEclipse && eclipseItem) {
  const mit = dpsMitigationFromDuel(duel);
  const clone = (champ: typeof zedEclipse, items: Item[]) => {
    const c = Object.assign(
      Object.create(Object.getPrototypeOf(champ)),
      champ,
    ) as typeof champ;
    c.Items = items;
    return c;
  };
  const zedDps = clone(zedEclipse, [eclipseItem]).calculateDPS(
    3000,
    1000,
    { level: 16, enableChampionRotationProfiles: true },
    mit,
  );
  const ezDps = clone(ezrealEclipse, [eclipseItem]).calculateDPS(
    3000,
    1000,
    { level: 16, enableChampionRotationProfiles: true },
    mit,
  );
  const meleeProc = 3000 * (ECLIPSE_MELEE_MAX_HP_PERCENT / 100);
  const rangedProc = 3000 * (ECLIPSE_RANGED_MAX_HP_PERCENT / 100);
  const zedLine = zedDps.breakdown.find((b) =>
    b.includes("Eclipse Ever Rising Moon"),
  );
  const ezLine = ezDps.breakdown.find((b) =>
    b.includes("Eclipse Ever Rising Moon"),
  );
  if (!zedLine?.includes(String(Math.round(meleeProc)))) {
    fail(
      `Zed Eclipse proc should be ${meleeProc.toFixed(0)} melee max-HP damage (got: ${zedLine ?? "missing"})`,
    );
  }
  if (!ezLine?.includes(String(Math.round(rangedProc)))) {
    fail(
      `Ezreal Eclipse proc should be ${rangedProc.toFixed(0)} ranged max-HP damage (got: ${ezLine ?? "missing"})`,
    );
  }
  if (!zedLine?.includes(`${ECLIPSE_ICD_SECONDS}s CD`)) {
    fail(`Eclipse should use ${ECLIPSE_ICD_SECONDS}s cooldown`);
  }
  if (!zedDps.breakdown.some((b) => b.includes("Eclipse shield"))) {
    fail("Eclipse shield should appear in breakdown");
  }
  if (eclipseItem.stats.ad !== 60) {
    fail(`Eclipse base AD should be 60, got ${eclipseItem.stats.ad}`);
  }
}

const zedBastion = Characters.find((c) => c.Name === "Zed");
const bastionItem = Items.find((i) => i.name === "Bastionbreaker");
if (zedBastion && bastionItem) {
  const mit = dpsMitigationFromDuel(duel);
  const clone = Object.assign(
    Object.create(Object.getPrototypeOf(zedBastion)),
    zedBastion,
  ) as typeof zedBastion;
  clone.Items = [bastionItem];
  const dps = clone.calculateDPS(
    duel.targetMaxHP,
    duel.targetBonusHP,
    { level: 16, enableChampionRotationProfiles: true },
    mit,
  );
  const expectedProc =
    BASTIONBREAKER_TRUE_BASE_MELEE +
    (bastionItem.stats.lethality ?? 0) * BASTIONBREAKER_TRUE_LETHALITY_MELEE;
  const line = dps.breakdown.find((b) => b.includes("Bastionbreaker Shaped Charge"));
  if (!line?.includes(String(Math.round(expectedProc)))) {
    fail(
      `Zed Bastionbreaker proc should be ${expectedProc.toFixed(0)} true (got: ${line ?? "missing"})`,
    );
  }
  if (!line?.includes(`${BASTIONBREAKER_ICD_SECONDS}s ICD`)) {
    fail(`Bastionbreaker should use ${BASTIONBREAKER_ICD_SECONDS}s ICD`);
  }
  if (dps.breakdown.some((b) => b.startsWith("Shaped Charge:"))) {
    fail("Bastionbreaker must not double-count legacy Shaped Charge line");
  }
}

const ahriLiandry = Characters.find((c) => c.Name === "Ahri");
const liandryItem = Items.find((i) => i.name === "Liandry's Torment");
if (ahriLiandry && liandryItem) {
  const mit = dpsMitigationFromDuel(duel);
  const clone = Object.assign(
    Object.create(Object.getPrototypeOf(ahriLiandry)),
    ahriLiandry,
  ) as typeof ahriLiandry;
  clone.Items = [liandryItem];
  const dps = clone.calculateDPS(
    3000,
    1000,
    { level: 16, enableChampionRotationProfiles: true },
    mit,
  );
  const line = dps.breakdown.find((b) => b.includes("Liandry's Torment"));
  if (!line) {
    fail("Ahri Liandry should appear in breakdown with burn uptime");
  }
  if (dps.breakdown.some((b) => b.includes("Magic DoT (target max HP): +60"))) {
    fail("Liandry must not apply full-time 2% max HP DoT without burn uptime");
  }
  if (!line.includes("burn uptime")) {
    fail("Liandry breakdown should report burn uptime");
  }
}

const zedChamp = Characters.find((c) => c.Name === "Zed");
const ahriChamp = Characters.find((c) => c.Name === "Ahri");
if (zedChamp && ahriChamp) {
  const zedPhys = championIncomingPhysShare(zedChamp);
  const ahriPhys = championIncomingPhysShare(ahriChamp);
  if (zedPhys <= ahriPhys) {
    fail(
      `Zed should skew more physical than Ahri (zed=${(zedPhys * 100).toFixed(0)}%, ahri=${(ahriPhys * 100).toFixed(0)}%)`,
    );
  }
  const zedBuild = estimateEnemyIncomingPhysShare({
    champion: "Zed",
    items: [
      "Youmuu's Ghostblade",
      "Hubris",
      "Serylda's Grudge",
      "Edge of Night",
      "Axiom Arc",
      "Plated Steelcaps",
    ],
    baseStatsLv18: { hp: 2084, armor: 99, mr: 52 },
  });
  const ahriBuild = estimateEnemyIncomingPhysShare({
    champion: "Ahri",
    items: [
      "Stormsurge",
      "Shadowflame",
      "Rabadon's Deathcap",
      "Void Staff",
      "Zhonya's Hourglass",
      "Sorcerer's Shoes",
    ],
    baseStatsLv18: { hp: 2242, armor: 87, mr: 38 },
  });
  if (zedBuild <= ahriBuild) {
    fail(
      `AD build should skew more physical than AP build (zed=${(zedBuild * 100).toFixed(0)}%, ahri=${(ahriBuild * 100).toFixed(0)}%)`,
    );
  }
  const team = averageEnemyTeamStats([
    {
      champion: "Zed",
      items: [
        "Youmuu's Ghostblade",
        "Hubris",
        "Serylda's Grudge",
        "Edge of Night",
        "Axiom Arc",
        "Plated Steelcaps",
      ],
      baseStatsLv18: { hp: 2084, armor: 99, mr: 52 },
    },
    {
      champion: "Ahri",
      items: [
        "Stormsurge",
        "Shadowflame",
        "Rabadon's Deathcap",
        "Void Staff",
        "Zhonya's Hourglass",
        "Sorcerer's Shoes",
      ],
      baseStatsLv18: { hp: 2242, armor: 87, mr: 38 },
    },
  ]);
  if (team.incomingPhysShare <= 0.05 || team.incomingPhysShare >= 0.95) {
    fail(`Team incoming phys share should stay in (5%, 95%), got ${team.incomingPhysShare}`);
  }
}

const EXPECTED_CHAMPION_COUNT = 173;
if (Characters.length !== EXPECTED_CHAMPION_COUNT) {
  fail(
    `Expected ${EXPECTED_CHAMPION_COUNT} champions in roster, got ${Characters.length}`,
  );
}

function checkFatalityItemExclusivity() {
  const terminus = Items.find((i) => i.getGroupName() === "Terminus");
  const serylda = Items.find((i) => i.name === "Serylda's Grudge");
  if (!terminus || !serylda) {
    fail("Missing Terminus or Serylda's Grudge in item pool");
  }
  if (canAddItemToBuild(serylda!, [terminus!])) {
    fail("Serylda's Grudge must not combine with Terminus (Fatality limit)");
  }
  if (isValidFullBuild([terminus!, serylda!])) {
    fail("Terminus + Serylda's is not a valid full build");
  }

  const jinx = Characters.find((c) => c.Name === "Jinx");
  if (jinx) {
    const recs = recommendBuildsForChampion(jinx, Items, {
      monteCarlo: false,
      samples: 0,
      duel: resolveDuel({ targetArmor: 150 }),
    });
    for (const rec of recs) {
      const itemObjs = rec.items
        .map((name) => Items.find((i) => i.name === name))
        .filter((i): i is Item => i != null);
      if (!isValidFullBuild(itemObjs)) {
        fail(
          `Jinx ${rec.profile} build violates item limits: ${rec.items.join(", ")}`,
        );
      }
      if (hasFatalityConflict(itemObjs)) {
        fail(
          `Jinx ${rec.profile} has Terminus + Last Whisper line: ${rec.items.join(", ")}`,
        );
      }
    }
  }
}

checkFatalityItemExclusivity();

console.log(
  `Regression checks passed (${CASES.length} champion scenarios, ${Characters.length} champions).`,
);
