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
import {
  AllKeystones,
  BLENDED_DPS_COMBO_WEIGHT,
  CHAMPION_COMBO_PROFILES,
  championUsesMana,
  isManaScalingItem,
  Item as ItemModel,
  Items,
} from "@/app/actions/sim";
import {
  getItemGold,
  goldEfficiencyTieBreak,
  totalBuildGold,
} from "@/lib/itemGold";

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
  // Prefer melee/ranged variants over generic (Base) for melee/ranged champions.
  if (token === "base") score += melee ? 4 : 10;
  if (token === "melee") score += melee ? 10 : -6;
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

/** Per-profile sim tweaks: spell-only scoring assumes no autos / no on-hit cadence. */
function mergeProfileSimulation(
  profile: BuildProfileId,
  simulation: SimulationScenario | undefined,
): SimulationScenario {
  const base: SimulationScenario = simulation ? { ...simulation } : {};
  if (profile === "spell") return { ...base, spellOnlyNoAutos: true };
  return base;
}

function buildRealisticItemPool(champion: Character, itemPool: Item[]): Item[] {
  const melee = isMeleeChampion(champion);
  const grouped = new Map<string, Item[]>();

  const usesMana = championUsesMana(champion);

  for (const item of itemPool) {
    if (!isRealisticName(item.name)) continue;
    if (!usesMana && isManaScalingItem(item)) continue;
    const group = item.getGroupName();
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group)?.push(item);
  }

  const selected: Item[] = [];
  for (const [, candidates] of grouped) {
    let best = candidates[0];
    let bestScore =
      candidatePriority(best, melee) * 1000 +
      goldEfficiencyTieBreak(best) * 120;
    for (let i = 1; i < candidates.length; i++) {
      const cand = candidates[i];
      const sc =
        candidatePriority(cand, melee) * 1000 +
        goldEfficiencyTieBreak(cand) * 120;
      if (sc > bestScore) {
        best = cand;
        bestScore = sc;
      }
    }
    selected.push(applyRealisticApproximation(best, melee));
  }

  return selected;
}

/** Crit/on-hit legendaries that dominate combo DPS but aren't assassin burst items. */
const GLASS_ASSASSIN_ITEM_DENY =
  /Infinity Edge|Blade of the Ruined King|Navori Flickerblade|Phantom Dancer|Guinsoo|Kraken Slayer|Runaan|Stormrazor|Terminus|Experimental Hexplate|Yun Tal Wildarrows|Wit's End|Warmog|Jak'Sho|Sunfire|Heartsteel|Rylai|Liandry/i;

function isGlassAssassinExcluded(item: Item): boolean {
  if (GLASS_ASSASSIN_ITEM_DENY.test(item.name)) return true;
  const leth = item.stats.lethality ?? 0;
  const pen = item.stats.armorPen ?? 0;
  const crit = item.stats.critChance ?? 0;
  const as = item.stats.attackSpeed ?? 0;
  if (crit >= 20 && leth < 12 && pen < 20) return true;
  if (as >= 40 && leth < 12 && pen < 20) return true;
  return false;
}

function itemPoolForProfile(
  champion: Character,
  realisticPool: Item[],
  profile: BuildProfileId,
): Item[] {
  if (profile !== "glass" || !CHAMPION_COMBO_PROFILES[champion.Name]) {
    return realisticPool;
  }
  return realisticPool.filter((it) => !isGlassAssassinExcluded(it));
}

export type ResolvedDuel = {
  /** Opponent max HP — drives %HP ratios and on-hit assumptions in DPS. */
  targetMaxHP: number;
  /** Opponent bonus HP over base — affects effects like % bonus HP damage. */
  targetBonusHP: number;
  /** Share of damage you expect to take as physical (rest magic); weights your effective HP. */
  incomingPhysShare: number;
  /** Opponent armor — physical damage mitigation (lethality / % pen apply). */
  targetArmor: number;
  /** Opponent magic resist — magic damage mitigation. */
  targetMR: number;
  /** Seconds over which one-shot burst damage is amortized into total DPS. */
  comboWindowSeconds: number;
};

export type DuelAssumptions = Partial<ResolvedDuel>;

const DEFAULT_DUEL: ResolvedDuel = {
  targetMaxHP: 3000,
  targetBonusHP: 1000,
  incomingPhysShare: 0.5,
  targetArmor: 100,
  targetMR: 100,
  comboWindowSeconds: 8,
};

/** Duel assumptions for `npm run compute-meta` / Meta Analysis (squishy carry, short burst). */
export const META_DUEL_DEFAULTS: ResolvedDuel = {
  targetMaxHP: 1500,
  targetBonusHP: 0,
  incomingPhysShare: 0.5,
  targetArmor: 50,
  targetMR: 50,
  comboWindowSeconds: 3,
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
    targetArmor: clamp(
      overrides?.targetArmor ?? DEFAULT_DUEL.targetArmor,
      0,
      500,
    ),
    targetMR: clamp(overrides?.targetMR ?? DEFAULT_DUEL.targetMR, 0, 500),
    comboWindowSeconds: clamp(
      overrides?.comboWindowSeconds ?? DEFAULT_DUEL.comboWindowSeconds,
      1,
      30,
    ),
  };
}

/** Arguments for {@link Character.calculateDPS} from duel assumptions. */
export function dpsMitigationFromDuel(duel: ResolvedDuel) {
  return {
    targetArmor: duel.targetArmor,
    targetMR: duel.targetMR,
    comboWindowSeconds: duel.comboWindowSeconds,
  };
}

export type BuildProfileId =
  | "balanced"
  | "glass"
  | "tank"
  | "ap"
  | "spell"
  | "ad"
  | "bruiser";

export interface BuildRecommendation {
  profile: BuildProfileId;
  label: string;
  description: string;
  items: string[];
  /** Sum of estimated gold (`items` order: power/gold first, then cheaper when tied). */
  totalGold: number;
  rune: string;
  score: number;
  totalDPS: number;
  autoAttackDPS: number;
  onHitDPS: number;
  abilityDPS: number;
  dotDPS: number;
  burstDPS: number;
  sustainedDPS: number;
  comboDPS: number;
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
  const sustainHPS =
    (stats.sustainHealPerSecond ?? 0) +
    (stats.ap * (stats.sustainHealPerSecondAPPercent ?? 0)) / 100;
  const sustainEhp = sustainHPS * 12;
  return vsPhys * p + vsMag * (1 - p) + sustainEhp;
}

function itemApTotal(build: Item[]): number {
  let t = 0;
  for (const it of build) {
    t += it.stats.ap ?? 0;
  }
  return t;
}

function blendedDps(
  dps: ReturnType<Character["calculateDPS"]>,
  comboWeight: number,
): number {
  const sustained = dps.sustainedDPS;
  const combo = dps.comboDPS;
  const w = clamp(comboWeight, 0, 1);
  return sustained * (1 - w) + combo * w;
}

/** Default combo weight — kept in sync with sim `totalDPS` headline metric. */
export const DEFAULT_COMBO_DPS_WEIGHT = BLENDED_DPS_COMBO_WEIGHT;

function profileScore(
  profile: BuildProfileId,
  dps: ReturnType<Character["calculateDPS"]>,
  ehp: number,
  build: Item[],
): number {
  const adLike = dps.autoAttackDPS + dps.onHitDPS;
  const apLike = dps.abilityDPS + dps.dotDPS;
  const apFromItems = itemApTotal(build);
  const combo = dps.comboDPS;
  const mixed = blendedDps(dps, DEFAULT_COMBO_DPS_WEIGHT);

  let lethalityFromItems = 0;
  let critFromItems = 0;
  for (const it of build) {
    lethalityFromItems += it.stats.lethality ?? 0;
    critFromItems += it.stats.critChance ?? 0;
  }

  switch (profile) {
    case "glass": {
      let s = combo + lethalityFromItems * 14 - critFromItems * 6;
      const penFromItems = build.reduce(
        (t, it) => t + (it.stats.armorPen ?? 0),
        0,
      );
      s += penFromItems * 4;
      return Math.max(0, s);
    }
    case "tank":
      return (
        Math.log1p(ehp / 150) * 1.35 * Math.pow(Math.log1p(mixed / 40), 0.65)
      );
    case "ap": {
      const apLean = apLike * 1.15 + combo * 0.25;
      const bonus =
        apFromItems >= 120 ? 1.15 : apFromItems >= 60 ? 1.05 : 0.72;
      return Math.log1p(apLean) * bonus * Math.pow(Math.log1p(ehp / 600), 0.25);
    }
    case "spell": {
      const spellOnly = dps.abilityDPS + dps.dotDPS + dps.burstDPS;
      const bonus =
        apFromItems >= 120 ? 1.15 : apFromItems >= 60 ? 1.05 : 0.72;
      return (
        Math.log1p(spellOnly) *
        bonus *
        Math.pow(Math.log1p(ehp / 650), 0.2)
      );
    }
    case "ad":
      return (
        Math.log1p(adLike * 1.1 + dps.abilityDPS * 0.45 + combo * 0.2) *
        Math.pow(Math.log1p(ehp / 700), 0.3)
      );
    case "bruiser":
      return Math.log1p(mixed / 45) * Math.log1p(ehp / 200);
    case "balanced":
    default:
      return Math.log1p(mixed / 50) * Math.log1p(ehp / 400) * 1.15;
  }
}

function scoreChampion(
  profile: BuildProfileId,
  c: Character,
  build: Item[],
  duel: ResolvedDuel,
  simulation?: SimulationScenario,
): number {
  const dps = c.calculateDPS(
    duel.targetMaxHP,
    duel.targetBonusHP,
    simulation,
    dpsMitigationFromDuel(duel),
  );
  const ehp = mixedEffectiveHP(c.getTotalStats(), duel.incomingPhysShare);
  return profileScore(profile, dps, ehp, build);
}

/**
 * Priority for the next purchase: marginal sim power, discounted when the item
 * costs more than a realistic single-buy budget for this slot (defers Rabadon-style
 * all-or-nothing legendaries until you can afford them without being useless).
 */
function purchaseStepMetric(
  marginal: number,
  itemGold: number,
  slotIndex: number,
  totalSlots: number,
  avgGoldPerSlot: number,
): number {
  if (marginal <= 0) return marginal - itemGold * 1e-6;

  const mpg = marginal / Math.pow(Math.max(itemGold, 350), 0.5);
  const lateGame = slotIndex >= totalSlots - 2;

  // Typical gold available for this purchase (ramps up through the build).
  const maxSingleBuy = avgGoldPerSlot * (0.8 + 0.45 * slotIndex);
  let afford = 1;
  if (!lateGame && itemGold > maxSingleBuy) {
    afford = (maxSingleBuy / itemGold) ** 2;
  }
  if (!lateGame && itemGold > avgGoldPerSlot * 1.3) {
    afford *= (avgGoldPerSlot / itemGold) ** 1.25;
  }

  return mpg * afford;
}

/**
 * Greedy buy order: best marginal sim spike per gold at each step, with early-slot
 * budgets so 3k+ legendaries are not shown as "buy first" while you're still weak.
 */
export function greedySimPurchaseOrder(
  champion: Character,
  finalBuild: Item[],
  profile: BuildProfileId,
  duel: ResolvedDuel,
  simulation: SimulationScenario | undefined,
  runePage: RunePage | null,
): Item[] {
  if (finalBuild.length <= 1) return finalBuild.slice();

  const totalSlots = finalBuild.length;
  const totalGold = totalBuildGold(finalBuild);
  const avgGoldPerSlot = totalGold / totalSlots;

  const remaining = finalBuild.slice();
  const ordered: Item[] = [];

  const scorePartial = (partial: Item[]): number => {
    const c = cloneChampionWithLoadout(champion, partial, runePage);
    return scoreChampion(profile, c, partial, duel, simulation);
  };

  while (remaining.length > 0) {
    const slotIndex = ordered.length;
    const baseScore = scorePartial(ordered);

    let bestItem = remaining[0];
    let bestMetric = -Infinity;

    for (const candidate of remaining) {
      const partial = [...ordered, candidate];
      const marginal = scorePartial(partial) - baseScore;
      const gold = getItemGold(candidate);
      const metric = purchaseStepMetric(
        marginal,
        gold,
        slotIndex,
        totalSlots,
        avgGoldPerSlot,
      );
      if (metric > bestMetric) {
        bestMetric = metric;
        bestItem = candidate;
      }
    }

    ordered.push(bestItem);
    const idx = remaining.indexOf(bestItem);
    remaining.splice(idx, 1);
  }

  return ordered;
}

type KeystoneCacheEntry = { rune: Rune | null; score: number };
type KeystoneCache = Map<string, KeystoneCacheEntry>;

function keystoneCacheKey(
  championName: string,
  profile: BuildProfileId,
  build: Item[],
  duel: ResolvedDuel,
  simulation?: SimulationScenario,
): string {
  const items = build
    .map((i) => i.name)
    .sort()
    .join("|");
  const simKey = simulation
    ? `${simulation.level ?? ""}:${simulation.spellOnlyNoAutos ?? ""}:${simulation.enableChampionRotationProfiles ?? ""}`
    : "";
  return `${championName}\0${profile}\0${items}\0${duel.targetMaxHP}\0${duel.targetBonusHP}\0${duel.targetArmor}\0${duel.targetMR}\0${duel.comboWindowSeconds}\0${simKey}`;
}

function bestKeystoneForBuild(
  champion: Character,
  build: Item[],
  profile: BuildProfileId,
  duel: ResolvedDuel,
  simulation?: SimulationScenario,
): KeystoneCacheEntry {
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

function getCachedKeystone(
  cache: KeystoneCache,
  champion: Character,
  build: Item[],
  profile: BuildProfileId,
  duel: ResolvedDuel,
  simulation?: SimulationScenario,
): KeystoneCacheEntry {
  const key = keystoneCacheKey(
    champion.Name,
    profile,
    build,
    duel,
    simulation,
  );
  const hit = cache.get(key);
  if (hit) return hit;
  const result = bestKeystoneForBuild(
    champion,
    build,
    profile,
    duel,
    simulation,
  );
  cache.set(key, result);
  return result;
}

function copyBuild(build: Item[]): Item[] {
  return build.slice();
}

type BuildSearchCtx = {
  optimizeKeystones: boolean;
  keystoneCache: KeystoneCache;
};

function scoreBuildFast(
  champion: Character,
  profile: BuildProfileId,
  build: Item[],
  duel: ResolvedDuel,
  simulation: SimulationScenario | undefined,
  search: BuildSearchCtx,
): number {
  if (!search.optimizeKeystones) {
    const c = cloneChampionWithLoadout(champion, build, null);
    return scoreChampion(profile, c, build, duel, simulation);
  }
  return getCachedKeystone(
    search.keystoneCache,
    champion,
    build,
    profile,
    duel,
    simulation,
  ).score;
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
  search: BuildSearchCtx,
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

    let currentScore = scoreBuildFast(
      champion,
      profile,
      current,
      duel,
      simulation,
      search,
    );
    let restartBest = copyBuild(current);
    let restartBestScore = currentScore;
    let T = mc.initialTemperature;

    for (let i = 0; i < mc.iterationsPerRestart; i++) {
      const neighbor = randomNeighbor(current, pool);
      const ns = scoreBuildFast(
        champion,
        profile,
        neighbor,
        duel,
        simulation,
        search,
      );
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
  search: BuildSearchCtx,
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
      const s = scoreBuildFast(
        champion,
        profile,
        trial,
        duel,
        simulation,
        search,
      );
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
  spell: {
    label: "Spell-only (no autos)",
    description:
      "Optimizes ability + DoT + burst. Sim assumes no attack cadence (no AA/on-hit DPS, no Navori CDR from autos).",
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
  /**
   * When true (default), score every candidate build with all keystones (compute-meta).
   * When false, search uses no keystone; best keystone is chosen once per final build (live UI).
   */
  optimizeKeystones?: boolean;
  /** Optional progress hook (used by compute-meta). */
  onProgress?: (message: string) => void;
};

/** Defaults for the 1v1 build finder — fast search, keystone resolved on final builds only. */
export const INTERACTIVE_RECOMMEND_OPTIONS: Pick<
  RecommendBuildsOptions,
  "optimizeKeystones" | "monteCarloParams"
> = {
  optimizeKeystones: false,
  monteCarloParams: { randomProbeSamples: 180 },
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
  const optimizeKeystones = options?.optimizeKeystones !== false;
  const mc = resolveMonteCarloParams(options?.monteCarloParams);
  const defaultProbes = optimizeKeystones ? 400 : 180;
  const nProbes = clamp(
    options?.monteCarloParams?.randomProbeSamples ??
      options?.samples ??
      (useMC ? defaultProbes : 180),
    0,
    50_000,
  );
  const search: BuildSearchCtx = {
    optimizeKeystones,
    keystoneCache: new Map(),
  };
  const profiles: BuildProfileId[] = [
    "balanced",
    "glass",
    "tank",
    "ap",
    "spell",
    "ad",
    "bruiser",
  ];

  const results: BuildRecommendation[] = [];
  const seenItemSets: Item[][] = [];

  for (let pi = 0; pi < profiles.length; pi++) {
    const profile = profiles[pi];
    options?.onProgress?.(
      `profile ${profile} (${pi + 1}/${profiles.length})`,
    );
    const profileSim = mergeProfileSimulation(profile, simulation);
    const profilePool = itemPoolForProfile(champion, realisticPool, profile);
    const greedy = greedyFill(
      champion,
      profilePool,
      profile,
      duel,
      profileSim,
      search,
    );
    let primary: Item[] = [];

    if (useMC && greedy.length === 6) {
      options?.onProgress?.(
        `profile ${profile}: simulated annealing (${mc.iterationsPerRestart}×${mc.restarts})`,
      );
      const saBest = simulatedAnnealingOptimize(
        champion,
        profilePool,
        profile,
        duel,
        profileSim,
        mc,
        greedy,
        search,
      );
      const gFast = scoreBuildFast(
        champion,
        profile,
        greedy,
        duel,
        profileSim,
        search,
      );
      const sFast =
        saBest.length === 6
          ? scoreBuildFast(
              champion,
              profile,
              saBest,
              duel,
              profileSim,
              search,
            )
          : -Infinity;
      primary = sFast >= gFast && saBest.length === 6 ? saBest : greedy;
    } else if (greedy.length === 6) {
      primary = greedy;
    } else if (useMC) {
      primary = simulatedAnnealingOptimize(
        champion,
        profilePool,
        profile,
        duel,
        profileSim,
        mc,
        null,
        search,
      );
    }

    if (primary.length === 0) continue;

    const { rune: gRune } = getCachedKeystone(
      search.keystoneCache,
      champion,
      primary,
      profile,
      duel,
      profileSim,
    );
    const gc = cloneChampionWithLoadout(
      champion,
      primary,
      gRune ? makeRunePage(gRune) : null,
    );
    const gd = gc.calculateDPS(
      duel.targetMaxHP,
      duel.targetBonusHP,
      profileSim,
      dpsMitigationFromDuel(duel),
    );
    const gehp = mixedEffectiveHP(gc.getTotalStats(), duel.incomingPhysShare);
    const gscore = profileScore(profile, gd, gehp, primary);

    if (isDistinct(primary, seenItemSets)) {
      seenItemSets.push(primary);
      const purchaseOrder = greedySimPurchaseOrder(
        champion,
        primary,
        profile,
        duel,
        profileSim,
        gRune ? makeRunePage(gRune) : null,
      );
      results.push({
        profile,
        label: PROFILE_META[profile].label,
        description: PROFILE_META[profile].description,
        items: purchaseOrder.map((i) => i.name),
        totalGold: totalBuildGold(purchaseOrder),
        rune: gRune?.name ?? "None",
        score: gscore,
        totalDPS: gd.totalDPS,
        sustainedDPS: gd.sustainedDPS,
        comboDPS: gd.comboDPS,
        autoAttackDPS: gd.autoAttackDPS,
        onHitDPS: gd.onHitDPS,
        abilityDPS: gd.abilityDPS,
        dotDPS: gd.dotDPS,
        burstDPS: gd.burstDPS,
        effectiveHP: gehp,
        breakdown: gd.breakdown,
        duel: { ...duel },
        simulation: { ...profileSim },
      });
    }

    let bestAlt: Item[] | null = null;
    let bestAltScore = -Infinity;
    for (let i = 0; i < nProbes; i++) {
      const b = sampleFullBuild(profilePool);
      if (b.length < 6) continue;
      if (!isDistinct(b, [primary])) continue;
      const s0 = scoreBuildFast(
        champion,
        profile,
        b,
        duel,
        profileSim,
        search,
      );
      if (s0 > bestAltScore) {
        bestAltScore = s0;
        bestAlt = b;
      }
    }
    if (bestAlt && isDistinct(bestAlt, seenItemSets)) {
      const { rune: aRune } = getCachedKeystone(
        search.keystoneCache,
        champion,
        bestAlt,
        profile,
        duel,
        profileSim,
      );
      const c = cloneChampionWithLoadout(
        champion,
        bestAlt,
        aRune ? makeRunePage(aRune) : null,
      );
      const dps = c.calculateDPS(
        duel.targetMaxHP,
        duel.targetBonusHP,
        profileSim,
        dpsMitigationFromDuel(duel),
      );
      const ehp = mixedEffectiveHP(c.getTotalStats(), duel.incomingPhysShare);
      const sc = profileScore(profile, dps, ehp, bestAlt);
      if (sc > gscore * 0.88) {
        seenItemSets.push(bestAlt);
        const altOrder = greedySimPurchaseOrder(
          champion,
          bestAlt,
          profile,
          duel,
          profileSim,
          aRune ? makeRunePage(aRune) : null,
        );
        results.push({
          profile,
          label: `${PROFILE_META[profile].label} (alt)`,
          description: PROFILE_META[profile].description,
          items: altOrder.map((x) => x.name),
          totalGold: totalBuildGold(altOrder),
          rune: aRune?.name ?? "None",
          score: sc,
          totalDPS: dps.totalDPS,
          sustainedDPS: dps.sustainedDPS,
          comboDPS: dps.comboDPS,
          autoAttackDPS: dps.autoAttackDPS,
          onHitDPS: dps.onHitDPS,
          abilityDPS: dps.abilityDPS,
          dotDPS: dps.dotDPS,
          burstDPS: dps.burstDPS,
          effectiveHP: ehp,
          breakdown: dps.breakdown,
          duel: { ...duel },
          simulation: { ...profileSim },
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
        "spell",
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
  totalGold: number;
  rune: string;
  totalDPS: number;
  sustainedDPS: number;
  comboDPS: number;
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

export type ComputeMetaOptions = {
  /** Log champion/profile progress (default true unless LOLOPTIMA_QUIET=1). */
  verbose?: boolean;
};

export type ChampionMetaEntry = {
  champion: string;
  builds: SerializedBuildResult[];
};

/** Serializable payload for compute-meta parallel workers (stdio subprocess). */
export type ComputeMetaWorkerJob = {
  championNames: string[];
  duelOverrides: DuelAssumptions;
  monteCarloParams: MonteCarloParams;
  simulation?: SimulationScenario;
};

export type ComputeMetaWorkerResult = {
  championBuilds: ChampionMetaEntry[];
  errors: { champion: string; message: string }[];
};

function isEnvTruthy(key: string): boolean {
  const v = process.env[key];
  if (v === undefined || v === "") return false;
  return ["1", "true", "yes", "on"].includes(v.trim().toLowerCase());
}

/** Optimize one champion for meta JSON (all profiles + alts). */
export function computeMetaForChampion(
  champion: Character,
  itemPool: Item[],
  duel: ResolvedDuel,
  mcParams: MonteCarloParams,
  simulation: SimulationScenario | undefined,
  itemByName: Map<string, Item>,
): ChampionMetaEntry | null {
  const recs = recommendBuildsForChampion(champion, itemPool, {
    duel,
    simulation,
    monteCarloParams: mcParams,
    optimizeKeystones: true,
  });
  const builds: SerializedBuildResult[] = recs.map((r) => {
    const its = r.items
      .map((n) => itemByName.get(n))
      .filter((x): x is Item => Boolean(x));
    return {
      champion: champion.Name,
      items: r.items,
      totalGold: r.totalGold,
      rune: r.rune,
      totalDPS: r.totalDPS,
      sustainedDPS: r.sustainedDPS,
      comboDPS: r.comboDPS,
      autoAttackDPS: r.autoAttackDPS,
      onHitDPS: r.onHitDPS,
      abilityDPS: r.abilityDPS,
      dotDPS: r.dotDPS,
      burstDPS: r.burstDPS,
      breakdown: r.breakdown,
      buildType: `${r.profile} · ${classifyBuildFromItems(its)}`,
    };
  });
  if (builds.length === 0) return null;
  return { champion: champion.Name, builds };
}

/** Used by compute-meta script: all champions, best row per profile + alts. */
export function computeMetaForAllChampions(
  champions: Character[],
  itemPool: Item[] = Items,
  duelOverrides?: DuelAssumptions,
  monteCarloOverrides?: MonteCarloParams,
  simulation?: SimulationScenario,
  metaOptions?: ComputeMetaOptions,
): SerializedMeta {
  const duel = resolveDuel(duelOverrides);
  const championBuilds: SerializedMeta["championBuilds"] = [];
  const itemByName = new Map(itemPool.map((i) => [i.name, i] as const));
  const mcParams: MonteCarloParams = {
    iterationsPerRestart: 1200,
    restarts: 6,
    randomProbeSamples: 320,
    ...monteCarloOverrides,
  };
  const mc = resolveMonteCarloParams(mcParams);
  const verbose = metaOptions?.verbose ?? !isEnvTruthy("LOLOPTIMA_QUIET");
  const total = champions.length;
  const log = (msg: string) => {
    if (verbose) console.log(msg);
  };

  log(
    `[compute-meta] Starting ${total} champions | SA ${mc.iterationsPerRestart} iter × ${mc.restarts} restarts | ${mcParams.randomProbeSamples ?? 320} alt probes per profile`,
  );
  log(
    `[compute-meta] Duel: ${duel.targetMaxHP} HP (+${duel.targetBonusHP} bonus), ${duel.targetArmor}/${duel.targetMR} armor/MR, ${duel.comboWindowSeconds}s combo`,
  );
  const runStarted = Date.now();

  for (let i = 0; i < champions.length; i++) {
    const champion = champions[i];
    const label = `[${i + 1}/${total}]`;
    const champStarted = Date.now();
    log(`[compute-meta] ${label} ${champion.Name} — starting`);

    let entry: ChampionMetaEntry | null;
    if (verbose) {
      const recs = recommendBuildsForChampion(champion, itemPool, {
        duel,
        simulation,
        monteCarloParams: mcParams,
        optimizeKeystones: true,
        onProgress: (step) =>
          log(`[compute-meta] ${label} ${champion.Name} — ${step}`),
      });
      const builds: SerializedBuildResult[] = recs.map((r) => {
        const its = r.items
          .map((n) => itemByName.get(n))
          .filter((x): x is Item => Boolean(x));
        return {
          champion: champion.Name,
          items: r.items,
          totalGold: r.totalGold,
          rune: r.rune,
          totalDPS: r.totalDPS,
          sustainedDPS: r.sustainedDPS,
          comboDPS: r.comboDPS,
          autoAttackDPS: r.autoAttackDPS,
          onHitDPS: r.onHitDPS,
          dotDPS: r.dotDPS,
          abilityDPS: r.abilityDPS,
          burstDPS: r.burstDPS,
          breakdown: r.breakdown,
          buildType: `${r.profile} · ${classifyBuildFromItems(its)}`,
        };
      });
      entry = builds.length > 0 ? { champion: champion.Name, builds } : null;
    } else {
      entry = computeMetaForChampion(
        champion,
        itemPool,
        duel,
        mcParams,
        simulation,
        itemByName,
      );
    }

    const topDps = entry?.builds[0]?.totalDPS ?? 0;
    const elapsedSec = ((Date.now() - champStarted) / 1000).toFixed(1);
    log(
      `[compute-meta] ${label} ${champion.Name} — done in ${elapsedSec}s (${entry?.builds.length ?? 0} builds, top ${topDps.toFixed(0)} DPS)`,
    );

    if (entry) championBuilds.push(entry);
  }

  const runMin = ((Date.now() - runStarted) / 60_000).toFixed(1);
  log(
    `[compute-meta] Finished ${championBuilds.length}/${total} champions with builds in ${runMin} min`,
  );

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
