/**
 * 1v1-oriented build recommendations: balances damage and survivability instead of raw DPS-only.
 *
 * Primary search: **simulated annealing** (Metropolis MCMC) over valid 6-item loadouts,
 * seeded from a greedy build — explores non-local item synergies better than greedy alone.
 * This is not exhaustive and does not produce a proof of global optimality; raising
 * `iterationsPerRestart` / `restarts` tightens the high-probability region of the score.
 */

import type {
  Character,
  Item,
  Rune,
  RunePage,
  SimulationScenario,
} from "@/app/actions/sim";
import { AllKeystones, Item as ItemModel, Items } from "@/app/actions/sim";

export type { SimulationScenario };

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

const REALISTIC_PAREN_ALLOWED = new Set(["base", "melee", "ranged"]);

function isMeleeChampion(champion: Character): boolean {
  return champion.AttackRange <= 250;
}

function parenToken(name: string): string | null {
  const m = name.match(/\(([^)]+)\)/);
  return m ? m[1].trim().toLowerCase() : null;
}

function isRealisticName(name: string): boolean {
  const token = parenToken(name);
  if (!token) return true;
  if (!REALISTIC_PAREN_ALLOWED.has(token)) return false;
  return true;
}

function candidatePriority(item: Item, melee: boolean): number {
  const token = parenToken(item.name);
  let score = 0;

  if (!token) score += 6;
  if (token === "base") score += 10;
  if (token === "melee") score += melee ? 8 : -6;
  if (token === "ranged") score += melee ? -6 : 8;

  // Keep stable tie-breaking close to baseline rows.
  if (item.name.includes("(Base)")) score += 2;
  if (item.name.includes("(Melee)")) score += melee ? 2 : -1;
  if (item.name.includes("(Ranged)")) score += melee ? -1 : 2;
  return score;
}

function applyRealisticApproximation(item: Item, melee: boolean): Item {
  // Kraken is a 3-hit cadence proc with missing-HP scaling; approximate sustained value
  // with an average on-hit contribution rather than an always-proc burst row.
  if (item.getGroupName() === "Kraken Slayer") {
    const avgProc = melee ? 58 : 46; // ~175/3 melee, ~140/3 ranged
    return new ItemModel(
      "Kraken Slayer (Averaged)",
      {
        ...item.stats,
        physicalOnHit: avgProc,
      },
      [],
      "Kraken Slayer",
    );
  }
  return item;
}

function buildRealisticItemPool(champion: Character, itemPool: Item[]): Item[] {
  const melee = isMeleeChampion(champion);
  const grouped = new Map<string, Item[]>();

  for (const item of itemPool) {
    if (!isRealisticName(item.name)) continue;
    const group = item.getGroupName();
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group)?.push(item);
  }

  const selected: Item[] = [];
  for (const [, candidates] of grouped) {
    let best = candidates[0];
    let bestScore = candidatePriority(best, melee);
    for (let i = 1; i < candidates.length; i++) {
      const sc = candidatePriority(candidates[i], melee);
      if (sc > bestScore) {
        best = candidates[i];
        bestScore = sc;
      }
    }
    selected.push(applyRealisticApproximation(best, melee));
  }

  return selected;
}

export type ResolvedDuel = {
  /** Opponent max HP — drives %HP ratios and on-hit assumptions in DPS. */
  targetMaxHP: number;
  /** Opponent bonus HP over base — affects effects like % bonus HP damage. */
  targetBonusHP: number;
  /** Share of damage you expect to take as physical (rest magic); weights your effective HP. */
  incomingPhysShare: number;
};

export type DuelAssumptions = Partial<ResolvedDuel>;

const DEFAULT_DUEL: ResolvedDuel = {
  targetMaxHP: 3000,
  targetBonusHP: 1000,
  incomingPhysShare: 0.5,
};

export function resolveDuel(overrides?: DuelAssumptions): ResolvedDuel {
  return {
    targetMaxHP: clamp(
      overrides?.targetMaxHP ?? DEFAULT_DUEL.targetMaxHP,
      400,
      12000,
    ),
    targetBonusHP: clamp(
      overrides?.targetBonusHP ?? DEFAULT_DUEL.targetBonusHP,
      0,
      8000,
    ),
    incomingPhysShare: clamp(
      overrides?.incomingPhysShare ?? DEFAULT_DUEL.incomingPhysShare,
      0,
      1,
    ),
  };
}

export type BuildProfileId =
  | "balanced"
  | "glass"
  | "tank"
  | "ap"
  | "ad"
  | "bruiser";

export interface BuildRecommendation {
  profile: BuildProfileId;
  label: string;
  description: string;
  items: string[];
  rune: string;
  score: number;
  totalDPS: number;
  autoAttackDPS: number;
  onHitDPS: number;
  abilityDPS: number;
  dotDPS: number;
  burstDPS: number;
  effectiveHP: number;
  breakdown: string[];
  duel: ResolvedDuel;
  simulation: SimulationScenario;
}

type RunePath = NonNullable<Rune["path"]>;

function emptyRune(path: RunePath, slot: Rune["slot"]): Rune {
  return {
    name: "Empty",
    path,
    slot,
    description: "",
    stats: {},
  };
}

function makeRunePage(keystone: Rune): RunePage {
  const p = (keystone.path || "Precision") as RunePath;
  return {
    primaryPath: p,
    keystone,
    primaryRunes: [
      emptyRune(p, "slot1"),
      emptyRune(p, "slot2"),
      emptyRune(p, "slot3"),
    ],
    secondaryPath: "Precision",
    secondaryRunes: [
      emptyRune("Precision", "slot1"),
      emptyRune("Precision", "slot2"),
    ],
    statShards: [
      { name: "Empty", path: null, slot: "statShard1", description: "", stats: {} },
      { name: "Empty", path: null, slot: "statShard2", description: "", stats: {} },
      { name: "Empty", path: null, slot: "statShard3", description: "", stats: {} },
    ],
  };
}

export function cloneChampionWithLoadout(
  champion: Character,
  itemList: Item[],
  runePage: RunePage | null,
): Character {
  const c = Object.assign(
    Object.create(Object.getPrototypeOf(champion)),
    champion,
  ) as Character;
  c.Items = itemList;
  c.Runes = runePage ?? undefined;
  return c;
}

/** Incoming damage split — simple 1v1 durability index vs mixed damage. */
export function mixedEffectiveHP(
  stats: ReturnType<Character["getTotalStats"]>,
  incomingPhysShare = 0.5,
): number {
  const hp = stats.hp;
  const vsPhys = (hp * (100 + stats.armor)) / 100;
  const vsMag = (hp * (100 + stats.mr)) / 100;
  const p = clamp(incomingPhysShare, 0, 1);
  return vsPhys * p + vsMag * (1 - p);
}

function itemApTotal(build: Item[]): number {
  let t = 0;
  for (const it of build) {
    t += it.stats.ap ?? 0;
  }
  return t;
}

function profileScore(
  profile: BuildProfileId,
  dps: ReturnType<Character["calculateDPS"]>,
  ehp: number,
  build: Item[],
): number {
  const adLike = dps.autoAttackDPS + dps.onHitDPS;
  const apLike = dps.abilityDPS + dps.dotDPS;
  const apFromItems = itemApTotal(build);

  switch (profile) {
    case "glass":
      return dps.totalDPS;
    case "tank":
      return (
        Math.log1p(ehp / 150) * 1.35 * Math.pow(Math.log1p(dps.totalDPS / 40), 0.65)
      );
    case "ap": {
      const apLean = apLike * 1.15 + dps.totalDPS * 0.25;
      const bonus =
        apFromItems >= 120 ? 1.15 : apFromItems >= 60 ? 1.05 : 0.72;
      return Math.log1p(apLean) * bonus * Math.pow(Math.log1p(ehp / 600), 0.25);
    }
    case "ad":
      return (
        Math.log1p(adLike * 1.1 + dps.abilityDPS * 0.45) *
        Math.pow(Math.log1p(ehp / 700), 0.3)
      );
    case "bruiser":
      return Math.log1p(dps.totalDPS / 45) * Math.log1p(ehp / 200);
    case "balanced":
    default:
      return (
        Math.log1p(dps.totalDPS / 50) * Math.log1p(ehp / 400) * 1.15
      );
  }
}

function scoreChampion(
  profile: BuildProfileId,
  c: Character,
  build: Item[],
  duel: ResolvedDuel,
  simulation?: SimulationScenario,
): number {
  const dps = c.calculateDPS(duel.targetMaxHP, duel.targetBonusHP, simulation);
  const ehp = mixedEffectiveHP(c.getTotalStats(), duel.incomingPhysShare);
  return profileScore(profile, dps, ehp, build);
}

function bestKeystoneForBuild(
  champion: Character,
  build: Item[],
  profile: BuildProfileId,
  duel: ResolvedDuel,
  simulation?: SimulationScenario,
): { rune: Rune | null; score: number } {
  let best: Rune | null = null;
  let bestS = -Infinity;
  for (const k of AllKeystones) {
    const c = cloneChampionWithLoadout(champion, build, makeRunePage(k));
    const s = scoreChampion(profile, c, build, duel, simulation);
    if (s > bestS) {
      bestS = s;
      best = k;
    }
  }
  return { rune: best, score: bestS };
}

function copyBuild(build: Item[]): Item[] {
  return build.slice();
}

function scoreBuildFast(
  champion: Character,
  profile: BuildProfileId,
  build: Item[],
  duel: ResolvedDuel,
  simulation?: SimulationScenario,
): number {
  const c = cloneChampionWithLoadout(champion, build, null);
  return scoreChampion(profile, c, build, duel, simulation);
}

/** One-step neighbor: replace a random slot with any pool item whose group is unused elsewhere. */
function randomNeighbor(build: Item[], pool: Item[]): Item[] {
  if (build.length !== 6) return copyBuild(build);
  const slot = Math.floor(Math.random() * 6);
  const blocked = new Set<string>();
  for (let i = 0; i < 6; i++) {
    if (i !== slot) blocked.add(build[i].getGroupName());
  }
  const candidates = pool.filter((it) => !blocked.has(it.getGroupName()));
  if (candidates.length === 0) return copyBuild(build);
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  const next = copyBuild(build);
  next[slot] = pick;
  return next;
}

export type MonteCarloParams = {
  /** Simulated annealing proposals per restart. */
  iterationsPerRestart?: number;
  /** Independent runs (new RNG trajectory / random start unless seeded). */
  restarts?: number;
  /** Restart 0 initializes from greedy build when available. */
  seedFirstRestartWithGreedy?: boolean;
  /** Initial temperature for Metropolis acceptance (scale with typical |Δscore|). */
  initialTemperature?: number;
  /** Multiply T after each proposal ( < 1 cools down). */
  coolingFactor?: number;
  /**
   * Random full builds screened for alt recommendations (see also top-level `samples`).
   */
  randomProbeSamples?: number;
};

type ResolvedMonteCarlo = {
  iterationsPerRestart: number;
  restarts: number;
  seedFirstRestartWithGreedy: boolean;
  initialTemperature: number;
  coolingFactor: number;
};

export function resolveMonteCarloParams(
  partial?: MonteCarloParams,
): ResolvedMonteCarlo {
  return {
    iterationsPerRestart: clamp(
      partial?.iterationsPerRestart ?? 900,
      100,
      100_000,
    ),
    restarts: clamp(partial?.restarts ?? 6, 1, 64),
    seedFirstRestartWithGreedy: partial?.seedFirstRestartWithGreedy !== false,
    initialTemperature: clamp(
      partial?.initialTemperature ?? 0.1,
      0.001,
      5,
    ),
    coolingFactor: clamp(partial?.coolingFactor ?? 0.9995, 0.9, 0.99999),
  };
}

/**
 * Simulated annealing on 6-item loadouts (one item per group).
 * Monte Carlo / Metropolis exploration — not guaranteed global optimum, but much
 * stronger than greedy for non-local item synergies.
 */
export function simulatedAnnealingOptimize(
  champion: Character,
  pool: Item[],
  profile: BuildProfileId,
  duel: ResolvedDuel,
  simulation: SimulationScenario | undefined,
  mc: ResolvedMonteCarlo,
  greedySeed: Item[] | null,
): Item[] {
  let globalBest: Item[] = [];
  let globalBestScore = -Infinity;

  for (let r = 0; r < mc.restarts; r++) {
    let current: Item[];
    if (
      r === 0 &&
      mc.seedFirstRestartWithGreedy &&
      greedySeed &&
      greedySeed.length === 6
    ) {
      current = copyBuild(greedySeed);
    } else {
      current = sampleFullBuild(pool);
      if (current.length < 6) continue;
    }

    let currentScore = scoreBuildFast(champion, profile, current, duel, simulation);
    let restartBest = copyBuild(current);
    let restartBestScore = currentScore;
    let T = mc.initialTemperature;

    for (let i = 0; i < mc.iterationsPerRestart; i++) {
      const neighbor = randomNeighbor(current, pool);
      const ns = scoreBuildFast(champion, profile, neighbor, duel, simulation);
      const delta = ns - currentScore;
      if (
        delta > 0 ||
        (T > 1e-9 && Math.random() < Math.exp(delta / T))
      ) {
        current = neighbor;
        currentScore = ns;
        if (currentScore > restartBestScore) {
          restartBestScore = currentScore;
          restartBest = copyBuild(current);
        }
      }
      T *= mc.coolingFactor;
    }

    if (restartBestScore > globalBestScore) {
      globalBestScore = restartBestScore;
      globalBest = copyBuild(restartBest);
    }
  }

  return globalBest;
}

function greedyFill(
  champion: Character,
  pool: Item[],
  profile: BuildProfileId,
  duel: ResolvedDuel,
  simulation: SimulationScenario | undefined,
): Item[] {
  const build: Item[] = [];
  const used = new Set<string>();

  for (let slot = 0; slot < 6; slot++) {
    let bestItem: Item | null = null;
    let bestScore = -Infinity;

    for (const item of pool) {
      const g = item.getGroupName();
      if (used.has(g)) continue;
      const trial = [...build, item];
      // Item pass without keystone keeps relative order close to final while staying fast;
      // keystone is chosen once the 6-item set is known.
      const c = cloneChampionWithLoadout(champion, trial, null);
      const s = scoreChampion(profile, c, trial, duel, simulation);
      if (s > bestScore) {
        bestScore = s;
        bestItem = item;
      }
    }

    if (bestItem) {
      build.push(bestItem);
      used.add(bestItem.getGroupName());
    } else {
      break;
    }
  }

  return build;
}

function sampleFullBuild(pool: Item[]): Item[] {
  const shuffled = pool.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const out: Item[] = [];
  const used = new Set<string>();
  for (const item of shuffled) {
    if (out.length >= 6) break;
    const g = item.getGroupName();
    if (!used.has(g)) {
      out.push(item);
      used.add(g);
    }
  }
  return out.length >= 6 ? out : [];
}

function buildSimilarity(a: Item[], b: Item[]): number {
  const sa = new Set(a.map((i) => i.getGroupName()));
  const sb = new Set(b.map((i) => i.getGroupName()));
  let n = 0;
  for (const x of sa) {
    if (sb.has(x)) n++;
  }
  return n / 6;
}

function isDistinct(
  build: Item[],
  existing: Item[][],
  minDiff = 0.34,
): boolean {
  for (const e of existing) {
    if (buildSimilarity(build, e) > 1 - minDiff) return false;
  }
  return true;
}

const PROFILE_META: Record<
  BuildProfileId,
  { label: string; description: string }
> = {
  balanced: {
    label: "Balanced (1v1)",
    description:
      "Best mix of sustained damage and durability for a reference duel.",
  },
  glass: {
    label: "Maximum damage",
    description: "Pure damage focus — lowest survivability tradeoff.",
  },
  tank: {
    label: "Tanky",
    description: "Emphasizes effective HP while keeping meaningful threat.",
  },
  ap: {
    label: "AP / spell-heavy",
    description: "Favors ability + DoT output and AP itemization.",
  },
  ad: {
    label: "AD / autos & on-hit",
    description: "Favors auto attacks, on-hit, and physical carry patterns.",
  },
  bruiser: {
    label: "Bruiser",
    description: "Frontline profile: high HP/resists with solid total output.",
  },
};

export type RecommendBuildsOptions = {
  /** @deprecated use monteCarloParams.randomProbeSamples; still used as fallback when unset */
  samples?: number;
  duel?: DuelAssumptions;
  /** When true (default), run simulated annealing after greedy seed. Set false for fast greedy-only. */
  monteCarlo?: boolean;
  monteCarloParams?: MonteCarloParams;
  simulation?: SimulationScenario;
};

export function recommendBuildsForChampion(
  champion: Character,
  itemPool: Item[] = Items,
  options?: RecommendBuildsOptions,
): BuildRecommendation[] {
  const realisticPool = buildRealisticItemPool(champion, itemPool);
  const duel = resolveDuel(options?.duel);
  const useMC = options?.monteCarlo !== false;
  const simulation = options?.simulation;
  const mc = resolveMonteCarloParams(options?.monteCarloParams);
  const nProbes = clamp(
    options?.monteCarloParams?.randomProbeSamples ??
      options?.samples ??
      (useMC ? 400 : 180),
    0,
    50_000,
  );
  const profiles: BuildProfileId[] = [
    "balanced",
    "glass",
    "tank",
    "ap",
    "ad",
    "bruiser",
  ];

  const results: BuildRecommendation[] = [];
  const seenItemSets: Item[][] = [];

  for (const profile of profiles) {
    const greedy = greedyFill(champion, realisticPool, profile, duel, simulation);
    let primary: Item[] = [];

    if (useMC && greedy.length === 6) {
      const saBest = simulatedAnnealingOptimize(
        champion,
        realisticPool,
        profile,
        duel,
        simulation,
        mc,
        greedy,
      );
      const gFast = scoreBuildFast(champion, profile, greedy, duel, simulation);
      const sFast =
        saBest.length === 6
          ? scoreBuildFast(champion, profile, saBest, duel, simulation)
          : -Infinity;
      primary = sFast >= gFast && saBest.length === 6 ? saBest : greedy;
    } else if (greedy.length === 6) {
      primary = greedy;
    } else if (useMC) {
      primary = simulatedAnnealingOptimize(
        champion,
        realisticPool,
        profile,
        duel,
        simulation,
        mc,
        null,
      );
    }

    if (primary.length === 0) continue;

    const { rune: gRune } = bestKeystoneForBuild(
      champion,
      primary,
      profile,
      duel,
        simulation,
    );
    const gc = cloneChampionWithLoadout(
      champion,
      primary,
      gRune ? makeRunePage(gRune) : null,
    );
    const gd = gc.calculateDPS(
      duel.targetMaxHP,
      duel.targetBonusHP,
      simulation,
    );
    const gehp = mixedEffectiveHP(gc.getTotalStats(), duel.incomingPhysShare);
    const gscore = profileScore(profile, gd, gehp, primary);

    if (isDistinct(primary, seenItemSets)) {
      seenItemSets.push(primary);
      results.push({
        profile,
        label: PROFILE_META[profile].label,
        description: PROFILE_META[profile].description,
        items: primary.map((i) => i.name),
        rune: gRune?.name ?? "None",
        score: gscore,
        totalDPS: gd.totalDPS,
        autoAttackDPS: gd.autoAttackDPS,
        onHitDPS: gd.onHitDPS,
        abilityDPS: gd.abilityDPS,
        dotDPS: gd.dotDPS,
        burstDPS: gd.burstDPS,
        effectiveHP: gehp,
        breakdown: gd.breakdown,
        duel: { ...duel },
        simulation: { ...simulation },
      });
    }

    let bestAlt: Item[] | null = null;
    let bestAltScore = -Infinity;
    for (let i = 0; i < nProbes; i++) {
      const b = sampleFullBuild(realisticPool);
      if (b.length < 6) continue;
      if (!isDistinct(b, [primary])) continue;
      const s0 = scoreBuildFast(champion, profile, b, duel, simulation);
      if (s0 > bestAltScore) {
        bestAltScore = s0;
        bestAlt = b;
      }
    }
    if (bestAlt && isDistinct(bestAlt, seenItemSets)) {
      const { rune: aRune } = bestKeystoneForBuild(
        champion,
        bestAlt,
        profile,
        duel,
        simulation,
      );
      const c = cloneChampionWithLoadout(
        champion,
        bestAlt,
        aRune ? makeRunePage(aRune) : null,
      );
      const dps = c.calculateDPS(
        duel.targetMaxHP,
        duel.targetBonusHP,
        simulation,
      );
      const ehp = mixedEffectiveHP(c.getTotalStats(), duel.incomingPhysShare);
      const sc = profileScore(profile, dps, ehp, bestAlt);
      if (sc > gscore * 0.88) {
        seenItemSets.push(bestAlt);
        results.push({
          profile,
          label: `${PROFILE_META[profile].label} (alt)`,
          description: PROFILE_META[profile].description,
          items: bestAlt.map((x) => x.name),
          rune: aRune?.name ?? "None",
          score: sc,
          totalDPS: dps.totalDPS,
          autoAttackDPS: dps.autoAttackDPS,
          onHitDPS: dps.onHitDPS,
          abilityDPS: dps.abilityDPS,
          dotDPS: dps.dotDPS,
          burstDPS: dps.burstDPS,
          effectiveHP: ehp,
          breakdown: dps.breakdown,
          duel: { ...duel },
          simulation: { ...simulation },
        });
      }
    }
  }

  results.sort((a, b) => {
    if (a.profile !== b.profile) {
      const order: BuildProfileId[] = [
        "balanced",
        "glass",
        "tank",
        "ap",
        "ad",
        "bruiser",
      ];
      return order.indexOf(a.profile) - order.indexOf(b.profile);
    }
    return b.score - a.score;
  });

  return results;
}

export type SerializedBuildResult = {
  champion: string;
  items: string[];
  rune: string;
  totalDPS: number;
  autoAttackDPS: number;
  onHitDPS: number;
  dotDPS: number;
  abilityDPS: number;
  burstDPS: number;
  breakdown: string[];
  buildType: string;
};

export type SerializedMeta = {
  championBuilds: { champion: string; builds: SerializedBuildResult[] }[];
  generatedAt: string;
  duel: ResolvedDuel;
  simulation?: SimulationScenario;
};

function classifyBuildFromItems(items: Item[]): string {
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
    if (stats.magicOnHit || stats.physicalOnHit) onHitScore += 30;
    if (stats.magicOnHitAPRatio || stats.physicalOnHitBaseADPercent)
      onHitScore += 20;
    if (
      stats.physicalOnHitMaxHealthPercent ||
      stats.physicalOnHitCurrentHealthPercent
    )
      onHitScore += 25;
  }

  const scores = [
    { type: "Crit", score: critScore },
    { type: "On-Hit", score: onHitScore },
    { type: "AP", score: apScore / 3 },
    { type: "Lethality", score: lethScore },
    { type: "Tank", score: tankScore / 2 },
  ];
  scores.sort((a, b) => b.score - a.score);

  if (scores[0].score > 0 && scores[1].score > scores[0].score * 0.5) {
    return `${scores[0].type}/${scores[1].type}`;
  }
  return scores[0].score > 0 ? scores[0].type : "Standard";
}

/** Used by compute-meta script: all champions, best row per profile + alts. */
export function computeMetaForAllChampions(
  champions: Character[],
  itemPool: Item[] = Items,
  duelOverrides?: DuelAssumptions,
  monteCarloOverrides?: MonteCarloParams,
  simulation?: SimulationScenario,
): SerializedMeta {
  const duel = resolveDuel(duelOverrides);
  const championBuilds: SerializedMeta["championBuilds"] = [];
  const itemByName = new Map(itemPool.map((i) => [i.name, i] as const));

  for (const champion of champions) {
    const recs = recommendBuildsForChampion(champion, itemPool, {
      duel,
      simulation,
      monteCarloParams: {
        iterationsPerRestart: 1200,
        restarts: 6,
        randomProbeSamples: 320,
        ...monteCarloOverrides,
      },
    });
    const builds: SerializedBuildResult[] = recs.map((r) => {
      const its = r.items
        .map((n) => itemByName.get(n))
        .filter((x): x is Item => Boolean(x));
      return {
        champion: champion.Name,
        items: r.items,
        rune: r.rune,
        totalDPS: r.totalDPS,
        autoAttackDPS: r.autoAttackDPS,
        onHitDPS: r.onHitDPS,
        dotDPS: r.dotDPS,
        abilityDPS: r.abilityDPS,
        burstDPS: r.burstDPS,
        breakdown: r.breakdown,
        buildType: `${r.profile} · ${classifyBuildFromItems(its)}`,
      };
    });

    if (builds.length > 0) {
      championBuilds.push({ champion: champion.Name, builds });
    }
  }

  championBuilds.sort(
    (a, b) => (b.builds[0]?.totalDPS ?? 0) - (a.builds[0]?.totalDPS ?? 0),
  );

  return {
    championBuilds,
    generatedAt: new Date().toISOString(),
    duel,
    simulation,
  };
}
