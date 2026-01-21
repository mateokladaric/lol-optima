import { writeFileSync } from "fs";
import { join } from "path";
import { Item, Rune, AllKeystones, Characters, Items } from "./sim";

type BuildResult = {
  champion: string;
  items: string[];
  rune: string; // Keystone rune name
  totalDPS: number;
  autoAttackDPS: number;
  onHitDPS: number;
  dotDPS: number;
  abilityDPS: number;
  burstDPS: number;
  breakdown: string[];
  buildType: string; // e.g., "Crit", "On-Hit", "AP", "Hybrid"
};

type ChampionBuilds = {
  champion: string;
  builds: BuildResult[];
};

type MetaData = {
  championBuilds: ChampionBuilds[];
  generatedAt: string;
};

// Classify a build based on its item stats
function classifyBuild(items: Item[]): string {
  let critScore = 0;
  let onHitScore = 0;
  let apScore = 0;
  let tankScore = 0;
  let lethScore = 0;

  for (const item of items) {
    const stats = item.stats;
    if (stats.critChance) critScore += stats.critChance;
    if (stats.critDmg) critScore += stats.critDmg / 5;
    if (stats.ap) apScore += stats.ap;
    if (stats.attackSpeed) onHitScore += stats.attackSpeed / 5;
    if (stats.hp) tankScore += stats.hp / 50;
    if (stats.armor) tankScore += stats.armor;
    if (stats.mr) tankScore += stats.mr;
    if (stats.lethality) lethScore += stats.lethality * 2;
    // On-hit indicators
    if (stats.magicOnHit || stats.physicalOnHit) onHitScore += 30;
    if (stats.magicOnHitAPRatio || stats.physicalOnHitBaseADPercent)
      onHitScore += 20;
    if (
      stats.physicalOnHitMaxHealthPercent ||
      stats.physicalOnHitCurrentHealthPercent
    )
      onHitScore += 25;
  }

  // Determine primary build type
  const scores = [
    { type: "Crit", score: critScore },
    { type: "On-Hit", score: onHitScore },
    { type: "AP", score: apScore / 3 },
    { type: "Lethality", score: lethScore },
    { type: "Tank", score: tankScore / 2 },
  ];

  scores.sort((a, b) => b.score - a.score);

  // Check for hybrid builds
  if (scores[0].score > 0 && scores[1].score > scores[0].score * 0.5) {
    return `${scores[0].type}/${scores[1].type}`;
  }

  return scores[0].score > 0 ? scores[0].type : "Standard";
}

// Calculate build similarity (0-1, where 1 is identical)
function buildSimilarity(build1: Item[], build2: Item[]): number {
  const names1 = new Set(build1.map((i) => i.getGroupName()));
  const names2 = new Set(build2.map((i) => i.getGroupName()));

  let overlap = 0;
  for (const name of names1) {
    if (names2.has(name)) overlap++;
  }

  return overlap / Math.max(names1.size, names2.size);
}

// Check if a build is sufficiently different from existing builds
function isSufficientlyDifferent(
  newBuild: Item[],
  existingBuilds: Item[][],
  minDifference: number = 0.5,
): boolean {
  for (const existing of existingBuilds) {
    if (buildSimilarity(newBuild, existing) > 1 - minDifference) {
      return false; // Too similar
    }
  }
  return true;
}

// Helper to get DPS value based on optimization target
function getDPSValue(
  dps: { totalDPS: number; autoAttackDPS: number; abilityDPS: number },
  optimizeFor: "total" | "auto" | "ability",
): number {
  return optimizeFor === "total"
    ? dps.totalDPS
    : optimizeFor === "auto"
      ? dps.autoAttackDPS
      : dps.abilityDPS;
}

// Greedy algorithm: iteratively add the item that gives the most DPS improvement
function findBestBuildGreedy(
  champion: any,
  availableItems: Item[],
  optimizeFor: "total" | "auto" | "ability",
): { items: Item[]; rune: Rune | null } {
  const build: Item[] = [];
  const usedGroupNames = new Set<string>();

  for (let slot = 0; slot < 6; slot++) {
    let bestItem: Item | null = null;
    let bestDPS = 0;

    // Try each available item
    for (const item of availableItems) {
      const groupName = item.getGroupName();

      // Skip if item group already used
      if (usedGroupNames.has(groupName)) continue;

      // Test this item
      const testBuild = [...build, item];
      const originalItems = champion.Items;
      champion.Items = testBuild;
      const dps = champion.calculateDPS();
      champion.Items = originalItems;

      const currentDPS =
        optimizeFor === "total"
          ? dps.totalDPS
          : optimizeFor === "auto"
            ? dps.autoAttackDPS
            : dps.abilityDPS;

      if (currentDPS > bestDPS) {
        bestDPS = currentDPS;
        bestItem = item;
      }
    }

    if (bestItem) {
      build.push(bestItem);
      usedGroupNames.add(bestItem.getGroupName());
    } else {
      break; // No more valid items
    }
  }

  // Now find best keystone for this build
  let bestRune: Rune | null = null;
  let bestRuneDPS = 0;

  const originalItems = champion.Items;
  const originalRunes = champion.Runes;

  champion.Items = build;

  for (const keystone of AllKeystones) {
    // Create minimal rune page with just the keystone
    champion.Runes = {
      primaryPath: keystone.path as any,
      keystone: keystone,
      primaryRunes: [
        {
          name: "Empty",
          path: keystone.path as any,
          slot: "slot1",
          description: "",
          stats: {},
        },
        {
          name: "Empty",
          path: keystone.path as any,
          slot: "slot2",
          description: "",
          stats: {},
        },
        {
          name: "Empty",
          path: keystone.path as any,
          slot: "slot3",
          description: "",
          stats: {},
        },
      ] as any,
      secondaryPath: "Precision",
      secondaryRunes: [
        {
          name: "Empty",
          path: "Precision",
          slot: "slot1",
          description: "",
          stats: {},
        },
        {
          name: "Empty",
          path: "Precision",
          slot: "slot2",
          description: "",
          stats: {},
        },
      ] as any,
      statShards: [
        {
          name: "Empty",
          path: null,
          slot: "statShard1",
          description: "",
          stats: {},
        },
        {
          name: "Empty",
          path: null,
          slot: "statShard2",
          description: "",
          stats: {},
        },
        {
          name: "Empty",
          path: null,
          slot: "statShard3",
          description: "",
          stats: {},
        },
      ] as any,
    };

    const dps = champion.calculateDPS();
    const currentDPS = getDPSValue(dps, optimizeFor);

    if (currentDPS > bestRuneDPS) {
      bestRuneDPS = currentDPS;
      bestRune = keystone;
    }
  }

  champion.Items = originalItems;
  champion.Runes = originalRunes;

  return { items: build, rune: bestRune };
}

// Random sampling: try many random combinations and keep the best
function findBestBuildSampling(
  champion: any,
  availableItems: Item[],
  optimizeFor: "total" | "auto" | "ability",
  samples: number = 10000,
): { items: Item[]; rune: Rune | null } {
  let bestBuild: Item[] = [];
  let bestDPS = 0;

  for (let i = 0; i < samples; i++) {
    // Generate random build
    const shuffled = [...availableItems].sort(() => Math.random() - 0.5);
    const build: Item[] = [];
    const usedGroupNames = new Set<string>();

    for (const item of shuffled) {
      if (build.length >= 6) break;

      const groupName = item.getGroupName();
      if (!usedGroupNames.has(groupName)) {
        build.push(item);
        usedGroupNames.add(groupName);
      }
    }

    if (build.length < 6) continue;

    // Calculate DPS
    const originalItems = champion.Items;
    champion.Items = build;
    const dps = champion.calculateDPS();
    champion.Items = originalItems;

    const currentDPS =
      optimizeFor === "total"
        ? dps.totalDPS
        : optimizeFor === "auto"
          ? dps.autoAttackDPS
          : dps.abilityDPS;

    if (currentDPS > bestDPS) {
      bestDPS = currentDPS;
      bestBuild = build;
    }
  }

  // Now find best keystone for this build
  let bestRune: Rune | null = null;
  let bestRuneDPS = 0;

  const originalItems = champion.Items;
  const originalRunes = champion.Runes;

  champion.Items = bestBuild;

  for (const keystone of AllKeystones) {
    // Create minimal rune page with just the keystone
    champion.Runes = {
      primaryPath: keystone.path as any,
      keystone: keystone,
      primaryRunes: [
        {
          name: "Empty",
          path: keystone.path as any,
          slot: "slot1",
          description: "",
          stats: {},
        },
        {
          name: "Empty",
          path: keystone.path as any,
          slot: "slot2",
          description: "",
          stats: {},
        },
        {
          name: "Empty",
          path: keystone.path as any,
          slot: "slot3",
          description: "",
          stats: {},
        },
      ] as any,
      secondaryPath: "Precision",
      secondaryRunes: [
        {
          name: "Empty",
          path: "Precision",
          slot: "slot1",
          description: "",
          stats: {},
        },
        {
          name: "Empty",
          path: "Precision",
          slot: "slot2",
          description: "",
          stats: {},
        },
      ] as any,
      statShards: [
        {
          name: "Empty",
          path: null,
          slot: "statShard1",
          description: "",
          stats: {},
        },
        {
          name: "Empty",
          path: null,
          slot: "statShard2",
          description: "",
          stats: {},
        },
        {
          name: "Empty",
          path: null,
          slot: "statShard3",
          description: "",
          stats: {},
        },
      ] as any,
    };

    const dps = champion.calculateDPS();
    const currentDPS = getDPSValue(dps, optimizeFor);

    if (currentDPS > bestRuneDPS) {
      bestRuneDPS = currentDPS;
      bestRune = keystone;
    }
  }

  champion.Items = originalItems;
  champion.Runes = originalRunes;

  return { items: bestBuild, rune: bestRune };
}

// Generate multiple diverse builds for a champion
function generateDiverseBuilds(
  champion: any,
  availableItems: Item[],
  maxBuilds: number = 10,
  minDifferenceRatio: number = 0.5, // At least 50% different items (3 out of 6)
): { build: Item[]; rune: Rune | null; dps: any }[] {
  const diverseBuilds: { build: Item[]; rune: Rune | null; dps: any }[] = [];
  const originalItems = champion.Items;
  const originalRunes = champion.Runes;

  // Helper to set rune on champion
  const setRune = (rune: Rune | null) => {
    if (rune) {
      champion.Runes = {
        primaryPath: rune.path as any,
        keystone: rune,
        primaryRunes: [
          {
            name: "Empty",
            path: rune.path as any,
            slot: "slot1",
            description: "",
            stats: {},
          },
          {
            name: "Empty",
            path: rune.path as any,
            slot: "slot2",
            description: "",
            stats: {},
          },
          {
            name: "Empty",
            path: rune.path as any,
            slot: "slot3",
            description: "",
            stats: {},
          },
        ] as any,
        secondaryPath: "Precision",
        secondaryRunes: [
          {
            name: "Empty",
            path: "Precision",
            slot: "slot1",
            description: "",
            stats: {},
          },
          {
            name: "Empty",
            path: "Precision",
            slot: "slot2",
            description: "",
            stats: {},
          },
        ] as any,
        statShards: [
          {
            name: "Empty",
            path: null,
            slot: "statShard1",
            description: "",
            stats: {},
          },
          {
            name: "Empty",
            path: null,
            slot: "statShard2",
            description: "",
            stats: {},
          },
          {
            name: "Empty",
            path: null,
            slot: "statShard3",
            description: "",
            stats: {},
          },
        ] as any,
      };
    }
  };

  // Try different optimization targets
  const targets: ("total" | "auto" | "ability")[] = [
    "total",
    "auto",
    "ability",
  ];

  for (const target of targets) {
    // Greedy approach
    const greedyResult = findBestBuildGreedy(champion, availableItems, target);
    if (
      greedyResult.items.length > 0 &&
      isSufficientlyDifferent(
        greedyResult.items,
        diverseBuilds.map((b) => b.build),
        minDifferenceRatio,
      )
    ) {
      setRune(greedyResult.rune);
      champion.Items = greedyResult.items;
      diverseBuilds.push({
        build: greedyResult.items,
        rune: greedyResult.rune,
        dps: champion.calculateDPS(),
      });
    }

    // Sampling approach
    const sampledResult = findBestBuildSampling(
      champion,
      availableItems,
      target,
      3000,
    );
    if (
      sampledResult.items.length > 0 &&
      isSufficientlyDifferent(
        sampledResult.items,
        diverseBuilds.map((b) => b.build),
        minDifferenceRatio,
      )
    ) {
      setRune(sampledResult.rune);
      champion.Items = sampledResult.items;
      diverseBuilds.push({
        build: sampledResult.items,
        rune: sampledResult.rune,
        dps: champion.calculateDPS(),
      });
    }
  }

  // Generate more builds by excluding core items from best builds
  const usedCoreItems = new Set<string>();
  for (const b of diverseBuilds) {
    for (const item of b.build.slice(0, 2)) {
      // First 2 items are "core"
      usedCoreItems.add(item.getGroupName());
    }
  }

  // Try to find builds excluding popular core items
  for (
    let attempt = 0;
    attempt < 5 && diverseBuilds.length < maxBuilds;
    attempt++
  ) {
    const excludeItems = new Set<string>();
    // Exclude some core items from previous builds
    for (const b of diverseBuilds) {
      if (Math.random() > 0.5) {
        excludeItems.add(b.build[0]?.getGroupName());
      }
      if (Math.random() > 0.5) {
        excludeItems.add(b.build[1]?.getGroupName());
      }
    }

    const filteredItems = availableItems.filter(
      (i) => !excludeItems.has(i.getGroupName()),
    );
    if (filteredItems.length < 10) continue;

    const result = findBestBuildGreedy(champion, filteredItems, "total");
    if (
      result.items.length > 0 &&
      isSufficientlyDifferent(
        result.items,
        diverseBuilds.map((b) => b.build),
        minDifferenceRatio,
      )
    ) {
      setRune(result.rune);
      champion.Items = result.items;
      diverseBuilds.push({
        build: result.items,
        rune: result.rune,
        dps: champion.calculateDPS(),
      });
    }
  }

  // Additional random sampling to fill up to maxBuilds
  for (
    let attempt = 0;
    attempt < 20 && diverseBuilds.length < maxBuilds;
    attempt++
  ) {
    const result = findBestBuildSampling(
      champion,
      availableItems,
      "total",
      1000,
    );
    if (
      result.items.length > 0 &&
      isSufficientlyDifferent(
        result.items,
        diverseBuilds.map((b) => b.build),
        minDifferenceRatio,
      )
    ) {
      setRune(result.rune);
      champion.Items = result.items;
      diverseBuilds.push({
        build: result.items,
        rune: result.rune,
        dps: champion.calculateDPS(),
      });
    }
  }

  // Restore original state
  champion.Items = originalItems;
  champion.Runes = originalRunes;

  // Sort by total DPS descending
  diverseBuilds.sort((a, b) => b.dps.totalDPS - a.dps.totalDPS);

  return diverseBuilds.slice(0, maxBuilds);
}

function computeBestBuilds(): MetaData {
  console.log("Computing best builds for all champions...");
  console.log(`Champions: ${Characters.length}`);
  console.log(`Items: ${Items.length}`);
  console.log("\nGenerating up to 10 diverse builds per champion...\n");

  const availableItems = Items;
  const championBuilds: ChampionBuilds[] = [];

  for (const champion of Characters) {
    const diverseBuilds = generateDiverseBuilds(
      champion,
      availableItems,
      10,
      0.5,
    );

    const builds: BuildResult[] = diverseBuilds.map((b) => ({
      champion: champion.Name,
      items: b.build.map((item) => item.name),
      rune: b.rune?.name || "None",
      totalDPS: b.dps.totalDPS,
      autoAttackDPS: b.dps.autoAttackDPS,
      onHitDPS: b.dps.onHitDPS,
      dotDPS: b.dps.dotDPS,
      abilityDPS: b.dps.abilityDPS,
      burstDPS: b.dps.burstDPS,
      breakdown: b.dps.breakdown,
      buildType: classifyBuild(b.build),
    }));

    if (builds.length > 0) {
      championBuilds.push({
        champion: champion.Name,
        builds,
      });
    }
  }

  // Sort champions by their best build's total DPS
  championBuilds.sort(
    (a, b) => (b.builds[0]?.totalDPS || 0) - (a.builds[0]?.totalDPS || 0),
  );

  return {
    championBuilds,
    generatedAt: new Date().toISOString(),
  };
}

// Run the computation
console.log("Starting meta build computation...\n");
const startTime = Date.now();

const metaData = computeBestBuilds();

const endTime = Date.now();
const duration = ((endTime - startTime) / 1000).toFixed(2);

console.log(`\nComputation complete in ${duration}s`);
console.log(`\nTop champions by best build DPS:`);
for (let i = 0; i < Math.min(5, metaData.championBuilds.length); i++) {
  const cb = metaData.championBuilds[i];
  console.log(
    `  ${i + 1}. ${cb.champion} - ${cb.builds[0]?.totalDPS.toFixed(1)} DPS (${cb.builds.length} builds)`,
  );
}

// Write to JSON file in public directory so Next.js can serve it
const outputPath = join(__dirname, "..", "public", "data", "metaBuilds.json");
writeFileSync(outputPath, JSON.stringify(metaData, null, 2));

console.log(`\nData written to: ${outputPath}`);
