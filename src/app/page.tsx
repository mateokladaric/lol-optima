"use client";
import { useEffect, useMemo, useState } from "react";
import type {
  BuildRecommendation,
  DuelAssumptions,
  ResolvedDuel,
  SimulationScenario,
} from "@/lib/buildOptimizer";
import { recommendBuildsForChampion, resolveDuel } from "@/lib/buildOptimizer";
import { type Character, Characters, type Item, Items } from "./actions/sim";

type BuildResult = {
  champion: string;
  items: string[];
  totalGold?: number;
  rune: string; // Keystone rune name
  totalDPS: number;
  sustainedDPS?: number;
  comboDPS?: number;
  autoAttackDPS: number;
  onHitDPS: number;
  dotDPS: number;
  abilityDPS: number;
  burstDPS: number;
  breakdown: string[];
  buildType: string;
};

type ChampionBuilds = {
  champion: string;
  builds: BuildResult[];
};

type SortConfig = {
  key: keyof BuildResult;
  direction: "asc" | "desc";
};

function BuildFinder(): React.ReactElement {
  const [championSearch, setChampionSearch] = useState("");
  const [selectedChampion, setSelectedChampion] = useState<Character | null>(
    null,
  );
  const [recs, setRecs] = useState<BuildRecommendation[]>([]);
  const [busy, setBusy] = useState(false);
  const [targetMaxHP, setTargetMaxHP] = useState(3000);
  const [targetBonusHP, setTargetBonusHP] = useState(1000);
  const [targetArmor, setTargetArmor] = useState(100);
  const [targetMR, setTargetMR] = useState(100);
  const [comboWindowSeconds, setComboWindowSeconds] = useState(8);
  const [incomingPhysPct, setIncomingPhysPct] = useState(50);
  const [simulationLevel, setSimulationLevel] = useState(18);
  const [useRotationProfiles, setUseRotationProfiles] = useState(true);

  const duelOptions = useMemo<DuelAssumptions>(
    () => ({
      targetMaxHP,
      targetBonusHP,
      targetArmor,
      targetMR,
      comboWindowSeconds,
      incomingPhysShare: incomingPhysPct / 100,
    }),
    [
      targetMaxHP,
      targetBonusHP,
      targetArmor,
      targetMR,
      comboWindowSeconds,
      incomingPhysPct,
    ],
  );

  const duelResolved = useMemo(() => resolveDuel(duelOptions), [duelOptions]);

  const filteredChampions = useMemo(
    () =>
      Characters.filter((c) =>
        c.Name.toLowerCase().includes(championSearch.toLowerCase()),
      ),
    [championSearch],
  );

  useEffect(() => {
    if (!selectedChampion) {
      setRecs([]);
      return;
    }
    setBusy(true);
    const t = window.setTimeout(() => {
      setRecs(
        recommendBuildsForChampion(selectedChampion, Items, {
          duel: duelOptions,
          simulation: {
            level: simulationLevel,
            enableChampionRotationProfiles: useRotationProfiles,
          },
        }),
      );
      setBusy(false);
    }, 0);
    return () => window.clearTimeout(t);
  }, [selectedChampion, duelOptions, simulationLevel, useRotationProfiles]);

  return (
    <div className="flex flex-1 flex-col min-h-0 p-4 overflow-hidden">
      <div className="mb-4 shrink-0">
        <h1 className="text-2xl font-bold text-white mb-1">1v1 build finder</h1>
        <p className="text-gray-400 text-sm max-w-3xl">
          Picks a balanced mix of damage and effective HP for a reference duel.
          Tune opponent HP and how much damage you expect to take as physical vs
          magic. Builds are refined with simulated annealing (Monte Carlo
          search), so the first computation for a champion can take a few
          seconds. Press <kbd className="px-1 bg-gray-800 rounded">F4</kbd> for
          Random / Meta / manual Planner.
        </p>
        <fieldset className="mt-3 flex flex-wrap gap-4 items-end text-sm border border-gray-700 rounded-lg p-3 bg-gray-800/30">
          <legend className="text-gray-500 px-1 text-xs">
            Duel assumptions
          </legend>
          <div>
            <label
              htmlFor="duel-max-hp"
              className="block text-gray-500 text-xs mb-1"
            >
              Opponent max HP
            </label>
            <input
              id="duel-max-hp"
              type="number"
              min={400}
              max={12000}
              step={100}
              value={targetMaxHP}
              onChange={(e) => setTargetMaxHP(Number(e.target.value) || 3000)}
              className="w-28 px-2 py-1 bg-gray-900 border border-gray-600 rounded text-white"
            />
          </div>
          <div>
            <label
              htmlFor="duel-bonus-hp"
              className="block text-gray-500 text-xs mb-1"
            >
              Opponent bonus HP
            </label>
            <input
              id="duel-bonus-hp"
              type="number"
              min={0}
              max={8000}
              step={100}
              value={targetBonusHP}
              onChange={(e) => setTargetBonusHP(Number(e.target.value) || 0)}
              className="w-28 px-2 py-1 bg-gray-900 border border-gray-600 rounded text-white"
            />
          </div>
          <div>
            <label
              htmlFor="duel-armor"
              className="block text-gray-500 text-xs mb-1"
            >
              Opponent armor
            </label>
            <input
              id="duel-armor"
              type="number"
              min={0}
              max={500}
              step={5}
              value={targetArmor}
              onChange={(e) => setTargetArmor(Number(e.target.value) || 0)}
              className="w-28 px-2 py-1 bg-gray-900 border border-gray-600 rounded text-white"
            />
          </div>
          <div>
            <label
              htmlFor="duel-mr"
              className="block text-gray-500 text-xs mb-1"
            >
              Opponent MR
            </label>
            <input
              id="duel-mr"
              type="number"
              min={0}
              max={500}
              step={5}
              value={targetMR}
              onChange={(e) => setTargetMR(Number(e.target.value) || 0)}
              className="w-28 px-2 py-1 bg-gray-900 border border-gray-600 rounded text-white"
            />
          </div>
          <div>
            <label
              htmlFor="duel-combo-window"
              className="block text-gray-500 text-xs mb-1"
            >
              Burst window (s)
            </label>
            <input
              id="duel-combo-window"
              type="number"
              min={1}
              max={30}
              step={1}
              value={comboWindowSeconds}
              onChange={(e) =>
                setComboWindowSeconds(Number(e.target.value) || 8)
              }
              className="w-28 px-2 py-1 bg-gray-900 border border-gray-600 rounded text-white"
            />
          </div>
          <div className="min-w-[200px]">
            <label
              htmlFor="duel-phys-share"
              className="block text-gray-500 text-xs mb-1"
            >
              Incoming damage: {incomingPhysPct}% phys / {100 - incomingPhysPct}
              % magic
            </label>
            <input
              id="duel-phys-share"
              type="range"
              min={0}
              max={100}
              value={incomingPhysPct}
              onChange={(e) => setIncomingPhysPct(Number(e.target.value))}
              className="w-full accent-blue-500"
            />
          </div>
          <div>
            <label
              htmlFor="duel-level"
              className="block text-gray-500 text-xs mb-1"
            >
              Simulation level
            </label>
            <input
              id="duel-level"
              type="number"
              min={1}
              max={18}
              step={1}
              value={simulationLevel}
              onChange={(e) =>
                setSimulationLevel(
                  Math.max(1, Math.min(18, Number(e.target.value) || 18)),
                )
              }
              className="w-24 px-2 py-1 bg-gray-900 border border-gray-600 rounded text-white"
            />
          </div>
          <div>
            <label
              htmlFor="duel-rotation-profiles"
              className="block text-gray-500 text-xs mb-1"
            >
              Rotation templates
            </label>
            <button
              id="duel-rotation-profiles"
              type="button"
              onClick={() => setUseRotationProfiles((prev) => !prev)}
              className={`px-3 py-1 rounded border text-xs font-medium transition-colors ${
                useRotationProfiles
                  ? "bg-emerald-900/50 border-emerald-600 text-emerald-200"
                  : "bg-gray-900 border-gray-600 text-gray-300"
              }`}
            >
              {useRotationProfiles ? "Enabled" : "Disabled"}
            </button>
          </div>
        </fieldset>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
        <div className="w-full lg:w-[320px] shrink-0 flex flex-col border border-gray-700 rounded-lg bg-gray-800/40">
          <label htmlFor="champion-search" className="sr-only">
            Search champion
          </label>
          <input
            id="champion-search"
            type="text"
            placeholder="Search champion..."
            value={championSearch}
            onChange={(e) => setChampionSearch(e.target.value)}
            className="m-2 px-3 py-2 text-sm bg-gray-900 border border-gray-600 rounded focus:outline-none focus:border-blue-500"
          />
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            <div className="grid grid-cols-2 gap-1">
              {filteredChampions.map((c) => (
                <button
                  key={c.Name}
                  type="button"
                  onClick={() => setSelectedChampion(c)}
                  className={`p-2 rounded text-left text-xs font-medium border transition-colors ${
                    selectedChampion?.Name === c.Name
                      ? "border-blue-500 bg-blue-900/40 text-white"
                      : "border-gray-600 bg-gray-800/80 hover:border-gray-500"
                  }`}
                >
                  {c.Name}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 min-w-0 flex flex-col overflow-y-auto pr-1">
          {!selectedChampion && (
            <div className="text-gray-500 text-sm">Select a champion.</div>
          )}
          {selectedChampion && busy && (
            <div className="text-gray-400 text-sm">Computing builds…</div>
          )}
          {selectedChampion && !busy && recs.length === 0 && (
            <div className="text-gray-500 text-sm">No recommendations.</div>
          )}
          {selectedChampion && !busy && recs.length > 0 && (
            <div className="space-y-3">
              <p className="text-gray-500 text-xs">
                Scores use opponent HP {duelResolved.targetMaxHP} (+{" "}
                {duelResolved.targetBonusHP} bonus), {duelResolved.targetArmor}{" "}
                armor / {duelResolved.targetMR} MR, burst window{" "}
                {duelResolved.comboWindowSeconds}s, and your Eff. HP weights{" "}
                {(duelResolved.incomingPhysShare * 100).toFixed(0)}% physical at
                level {simulationLevel}. Rotation templates{" "}
                {useRotationProfiles ? "enabled" : "disabled"}.
              </p>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                {recs.map((r) => (
                  <div
                    key={`${r.profile}-${r.label}-${r.items.join(",")}`}
                    className="border border-gray-600 rounded-lg p-3 bg-gray-800/60"
                  >
                    <div className="flex justify-between items-start gap-2 mb-2">
                      <div>
                        <div className="text-amber-300 font-semibold text-sm">
                          {r.label}
                        </div>
                        <div className="text-gray-500 text-xs mt-0.5">
                          {r.description}
                        </div>
                      </div>
                      <span className="text-[10px] uppercase tracking-wide text-gray-500 border border-gray-600 rounded px-1.5 py-0.5 shrink-0">
                        {r.profile}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-center text-xs mb-2">
                      <div className="bg-gray-900/50 rounded p-1.5">
                        <div className="text-gray-500">Combo DPS</div>
                        <div className="font-bold text-blue-300">
                          {r.comboDPS.toFixed(0)}
                        </div>
                      </div>
                      <div className="bg-gray-900/50 rounded p-1.5">
                        <div className="text-gray-500">Sustained</div>
                        <div className="font-bold text-sky-300">
                          {r.sustainedDPS.toFixed(0)}
                        </div>
                      </div>
                      <div className="bg-gray-900/50 rounded p-1.5">
                        <div className="text-gray-500">Eff. HP</div>
                        <div className="font-bold text-green-300">
                          {Math.round(r.effectiveHP)}
                        </div>
                      </div>
                      <div className="bg-gray-900/50 rounded p-1.5">
                        <div className="text-gray-500">Est. gold</div>
                        <div className="font-bold text-cyan-200">
                          ~{r.totalGold.toLocaleString()}g
                        </div>
                      </div>
                      <div className="bg-gray-900/50 rounded p-1.5">
                        <div className="text-gray-500">Keystone</div>
                        <div className="font-bold text-yellow-200 truncate">
                          {r.rune}
                        </div>
                      </div>
                    </div>
                    <div className="text-[10px] text-gray-500 mb-1">
                      Items (buy order: best marginal sim spike per gold;
                      expensive legendaries deferred)
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {r.items.map((name) => (
                        <span
                          key={name}
                          className="text-[11px] bg-purple-900/40 px-2 py-0.5 rounded border border-purple-700/50"
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                    <div className="grid grid-cols-4 gap-1 mt-2 text-[10px] text-center text-gray-400">
                      <span>AA {r.autoAttackDPS.toFixed(0)}</span>
                      <span>OH {r.onHitDPS.toFixed(0)}</span>
                      <span>Ab {r.abilityDPS.toFixed(0)}</span>
                      <span>DoT {r.dotDPS.toFixed(0)}</span>
                    </div>
                    <details className="mt-2 text-xs">
                      <summary className="cursor-pointer text-gray-400 hover:text-gray-300">
                        DPS breakdown
                      </summary>
                      <div className="mt-2 space-y-0.5 font-mono text-[10px] text-gray-400 max-h-40 overflow-y-auto border border-gray-700/50 rounded p-2 bg-gray-900/40">
                        {r.breakdown.map((line) => (
                          <div key={`${r.profile}-${line}`}>{line}</div>
                        ))}
                      </div>
                    </details>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Random Build Generator Component with case-unboxing animation
function RandomBuildGenerator(): React.ReactElement {
  const [isSpinning, setIsSpinning] = useState(false);
  const [selectedBuild, setSelectedBuild] = useState<BuildResult | null>(null);
  const [spinItems, setSpinItems] = useState<BuildResult[]>([]);
  const [metaData, setMetaData] = useState<MetaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [spinPosition, setSpinPosition] = useState(0);

  useEffect(() => {
    fetch("/data/metaBuilds.json")
      .then((res) => {
        if (!res.ok) throw new Error("Meta data not found");
        return res.json();
      })
      .then((data: MetaData) => {
        setMetaData(data);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  // Keyboard controls: Escape closes popup, Space spins
  // biome-ignore lint/correctness/useExhaustiveDependencies: spin handler reads selectedBuild from closure
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedBuild) {
        setSelectedBuild(null);
      }
      if (e.key === " " && !selectedBuild && !isSpinning) {
        e.preventDefault();
        startSpin();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedBuild, isSpinning]);

  const allBuilds = useMemo(() => {
    if (!metaData) return [];
    let builds: BuildResult[] = [];
    for (const cb of metaData.championBuilds) {
      builds = builds.concat(cb.builds);
    }
    return builds;
  }, [metaData]);

  const startSpin = () => {
    if (isSpinning || allBuilds.length === 0) return;

    setIsSpinning(true);
    setSelectedBuild(null);

    // Create a list of random builds to scroll through (50 items for smooth animation)
    const spinList: BuildResult[] = [];
    for (let i = 0; i < 50; i++) {
      spinList.push(allBuilds[Math.floor(Math.random() * allBuilds.length)]);
    }
    // The final item is the actual selected one
    const finalBuild = allBuilds[Math.floor(Math.random() * allBuilds.length)];
    spinList.push(finalBuild);
    // Add more items after the final one to fake infinite scroll
    for (let i = 0; i < 10; i++) {
      spinList.push(allBuilds[Math.floor(Math.random() * allBuilds.length)]);
    }
    setSpinItems(spinList);

    // Animate the spin
    let pos = 0;
    const selectedIndex = 50; // The index of the selected build in spinList
    const itemHeight = 120; // pixels per item
    const totalDistance = selectedIndex * itemHeight; // Stop at the selected item, not the end

    // Easing function for smooth deceleration
    const duration = 4000; // 4 seconds
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Cubic ease-out for that slot machine feel
      const eased = 1 - (1 - progress) ** 3;
      pos = eased * totalDistance;

      setSpinPosition(pos);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        // Spin complete
        setIsSpinning(false);
        setSelectedBuild(finalBuild);
      }
    };

    requestAnimationFrame(animate);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-gray-400 text-xl">Loading builds...</div>
      </div>
    );
  }

  if (allBuilds.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-400 text-xl mb-2">No builds available</div>
          <div className="text-gray-500 text-xs">
            Run{" "}
            <code className="bg-gray-800 px-2 py-1 rounded">
              npm run compute-meta
            </code>{" "}
            to generate builds
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold mb-2 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
        Random Build Generator
      </h1>
      <p className="text-gray-400 mb-8">Click to discover your destiny</p>

      {/* Slot machine container */}
      <div className="relative w-full max-w-2xl mb-8">
        {/* Glow effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 via-pink-500/20 to-purple-500/20 blur-xl rounded-3xl" />

        {/* Main container */}
        <div className="relative bg-gray-800 rounded-2xl border-4 border-purple-500/50 overflow-hidden">
          {/* Selection indicator */}
          <div className="absolute top-1/2 left-0 right-0 h-[120px] -translate-y-1/2 border-y-4 border-yellow-400 bg-yellow-400/10 z-10 pointer-events-none" />
          <div className="absolute top-1/2 left-0 w-4 h-8 -translate-y-1/2 bg-yellow-400 z-20" />
          <div className="absolute top-1/2 right-0 w-4 h-8 -translate-y-1/2 bg-yellow-400 z-20" />

          {/* Scrolling items */}
          <div className="h-[360px] overflow-hidden">
            {isSpinning || spinItems.length > 0 ? (
              <div
                className="transition-none"
                style={{
                  transform: `translateY(${120 - spinPosition}px)`,
                }}
              >
                {spinItems.map((build, idx) => (
                  <div
                    key={`${build.champion}-${build.buildType}-${idx}`}
                    className="h-[120px] flex items-center justify-center px-6 border-b border-gray-700"
                  >
                    <div className="text-center">
                      <div className="text-2xl font-bold text-white mb-1">
                        {build.champion}
                      </div>
                      <div className="text-sm text-gray-400">
                        {build.buildType} • {build.totalDPS.toFixed(0)} DPS
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-gray-500 text-xl">
                  Press the button to spin!
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Spin button */}
      <button
        type="button"
        onClick={startSpin}
        disabled={isSpinning}
        className={`px-12 py-4 text-2xl font-bold rounded-xl transition-all transform ${
          isSpinning
            ? "bg-gray-600 cursor-not-allowed scale-95"
            : "bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 hover:scale-105 active:scale-95 shadow-lg shadow-purple-500/30"
        }`}
      >
        {isSpinning ? "SPINNING..." : "SPIN!"}
      </button>

      {/* Selected build popup overlay */}
      {selectedBuild && !isSpinning && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div
            className="relative w-full max-w-2xl mx-4"
            style={{
              animation: "scaleIn 0.3s ease-out forwards",
            }}
          >
            {/* Close button */}
            <button
              type="button"
              onClick={() => setSelectedBuild(null)}
              className="absolute -top-3 -right-3 w-10 h-10 bg-gray-800 hover:bg-red-600 rounded-full border-2 border-gray-600 hover:border-red-500 flex items-center justify-center text-xl font-bold transition-colors z-10"
            >
              X
            </button>

            <div className="bg-gradient-to-r from-purple-900/90 to-pink-900/90 rounded-xl p-6 border-2 border-purple-500/50 shadow-2xl shadow-purple-500/20">
              <div className="text-center mb-4">
                <div className="text-sm text-purple-300 mb-1">YOUR BUILD</div>
                <h2 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">
                  {selectedBuild.champion}
                </h2>
                <div className="text-purple-300 mt-1">
                  {selectedBuild.buildType}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                  <div className="text-gray-400 text-sm">Total DPS</div>
                  <div className="text-3xl font-bold text-blue-400">
                    {selectedBuild.totalDPS.toFixed(1)}
                  </div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                  <div className="text-gray-400 text-sm">Rune</div>
                  <div className="text-xl font-bold text-yellow-400">
                    {selectedBuild.rune}
                  </div>
                </div>
              </div>

              <div className="mb-4">
                <div className="text-gray-400 text-sm mb-2 text-center">
                  Items
                </div>
                <div className="flex flex-wrap gap-2 justify-center">
                  {selectedBuild.items.map((item) => (
                    <span
                      key={item}
                      className="bg-purple-900/50 px-3 py-2 rounded-lg border border-purple-500/50 text-sm font-medium"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2 text-center text-sm">
                <div className="bg-gray-800/50 rounded p-2">
                  <div className="text-gray-500 text-xs">Auto</div>
                  <div className="font-semibold">
                    {selectedBuild.autoAttackDPS.toFixed(0)}
                  </div>
                </div>
                <div className="bg-gray-800/50 rounded p-2">
                  <div className="text-gray-500 text-xs">On-Hit</div>
                  <div className="font-semibold">
                    {selectedBuild.onHitDPS.toFixed(0)}
                  </div>
                </div>
                <div className="bg-gray-800/50 rounded p-2">
                  <div className="text-gray-500 text-xs">Ability</div>
                  <div className="font-semibold">
                    {selectedBuild.abilityDPS.toFixed(0)}
                  </div>
                </div>
                <div className="bg-gray-800/50 rounded p-2">
                  <div className="text-gray-500 text-xs">Burst</div>
                  <div className="font-semibold">
                    {selectedBuild.burstDPS.toFixed(0)}
                  </div>
                </div>
              </div>

              <div className="mt-4 text-center text-gray-500 text-xs">
                Click X or press Escape to spin again
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type MetaData = {
  championBuilds: ChampionBuilds[];
  generatedAt: string;
  duel?: ResolvedDuel;
  simulation?: SimulationScenario;
};

function MetaAnalysis(): React.ReactElement {
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: "totalDPS",
    direction: "desc",
  });
  const [metaData, setMetaData] = useState<MetaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredBuild, setHoveredBuild] = useState<BuildResult | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{
    x: number;
    y: number;
  }>({ x: 0, y: 0 });

  useEffect(() => {
    fetch("/data/metaBuilds.json")
      .then((res) => {
        if (!res.ok)
          throw new Error(
            "Meta data not found. Run 'npm run compute-meta' first.",
          );
        return res.json();
      })
      .then((data: MetaData) => {
        setMetaData(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const [selectedChampionFilter, setSelectedChampionFilter] = useState<
    string | null
  >(null);

  // Flatten all builds from all champions
  const allBuilds = useMemo(() => {
    if (!metaData) return [];

    // Get all builds from all champions
    let builds: BuildResult[] = [];
    for (const cb of metaData.championBuilds) {
      builds = builds.concat(cb.builds);
    }

    // Filter by champion if selected
    if (selectedChampionFilter) {
      builds = builds.filter((b) => b.champion === selectedChampionFilter);
    }

    return builds;
  }, [metaData, selectedChampionFilter]);

  // Get unique champion names for filter dropdown
  const championNames = useMemo(() => {
    if (!metaData) return [];
    return metaData.championBuilds.map((cb) => cb.champion).sort();
  }, [metaData]);

  const sortedBuilds = useMemo(() => {
    const sorted = [...allBuilds].sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];

      if (typeof aValue === "number" && typeof bValue === "number") {
        return sortConfig.direction === "asc"
          ? aValue - bValue
          : bValue - aValue;
      }

      if (typeof aValue === "string" && typeof bValue === "string") {
        return sortConfig.direction === "asc"
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }

      return 0;
    });

    return sorted;
  }, [allBuilds, sortConfig]);

  const handleSort = (key: keyof BuildResult) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "desc" ? "asc" : "desc",
    }));
  };

  const getSortIcon = (key: keyof BuildResult) => {
    if (sortConfig.key !== key) return "↕";
    return sortConfig.direction === "desc" ? "↓" : "↑";
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-gray-400 text-xl">Loading meta data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-400 text-xl mb-2">
            Error loading meta data
          </div>
          <div className="text-gray-400 text-sm">{error}</div>
          <div className="text-gray-500 text-xs mt-4">
            Run{" "}
            <code className="bg-gray-800 px-2 py-1 rounded">
              npm run compute-meta
            </code>{" "}
            to generate the data
          </div>
        </div>
      </div>
    );
  }

  const displayBuilds = sortedBuilds;

  return (
    <div className="flex-1 flex flex-col p-4 overflow-hidden">
      <div className="mb-4">
        <h2 className="text-2xl font-bold mb-2">Meta Analysis</h2>
        <p className="text-gray-400 text-sm mb-4">
          Diverse builds for each champion (showing {allBuilds.length} builds),
          scored vs a{" "}
          {metaData?.duel ? (
            <>
              {metaData.duel.targetMaxHP} HP target
              {metaData.duel.targetBonusHP > 0
                ? ` (+${metaData.duel.targetBonusHP} bonus)`
                : ""}
              , {metaData.duel.targetArmor} armor, {metaData.duel.targetMR} MR
            </>
          ) : (
            "reference duel"
          )}
          .
          {metaData && (
            <span className="text-gray-500 block mt-1 text-[11px]">
              Generated {new Date(metaData.generatedAt).toLocaleString()}
              {metaData.duel && (
                <>
                  {" "}
                  · burst window {metaData.duel.comboWindowSeconds}s · Eff. HP
                  weight {(metaData.duel.incomingPhysShare * 100).toFixed(0)}%
                  phys
                </>
              )}
              {metaData.duel &&
                (metaData.duel.targetMaxHP !== 1500 ||
                  metaData.duel.targetBonusHP !== 0 ||
                  metaData.duel.targetArmor !== 0 ||
                  metaData.duel.targetMR !== 0) && (
                  <span className="block mt-1 text-amber-400/90">
                    Stale duel assumptions — run{" "}
                    <code className="bg-gray-800 px-1 rounded">
                      npm run compute-meta
                    </code>{" "}
                    for 1500 HP / 0 bonus / 0 armor / 0 MR targets.
                  </span>
                )}
            </span>
          )}
        </p>

        <div className="flex gap-4 mb-4 items-center">
          <div className="flex items-center gap-2">
            <label
              htmlFor="meta-champion-filter"
              className="text-gray-400 text-sm"
            >
              Champion:
            </label>
            <select
              id="meta-champion-filter"
              value={selectedChampionFilter || ""}
              onChange={(e) =>
                setSelectedChampionFilter(e.target.value || null)
              }
              className="bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
            >
              <option value="">All Champions</option>
              {championNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          {selectedChampionFilter && (
            <button
              type="button"
              onClick={() => setSelectedChampionFilter(null)}
              className="text-gray-400 hover:text-white text-sm underline"
            >
              Clear filter
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-800 border-b border-gray-700">
            <tr>
              <th className="p-2 text-left">
                <button
                  type="button"
                  onClick={() => handleSort("champion")}
                  className="hover:text-blue-400 transition-colors"
                >
                  Champion {getSortIcon("champion")}
                </button>
              </th>
              <th className="p-2 text-left">
                <button
                  type="button"
                  onClick={() => handleSort("rune")}
                  className="hover:text-blue-400 transition-colors"
                >
                  Rune {getSortIcon("rune")}
                </button>
              </th>
              <th className="p-2 text-left">Items</th>
              <th className="p-2 text-left">
                <button
                  type="button"
                  onClick={() => handleSort("buildType")}
                  className="hover:text-blue-400 transition-colors"
                >
                  Type {getSortIcon("buildType")}
                </button>
              </th>
              <th className="p-2 text-right">
                <button
                  type="button"
                  onClick={() => handleSort("totalDPS")}
                  className="hover:text-blue-400 transition-colors"
                >
                  Total {getSortIcon("totalDPS")}
                </button>
              </th>
              <th className="p-2 text-right">
                <button
                  type="button"
                  onClick={() => handleSort("autoAttackDPS")}
                  className="hover:text-blue-400 transition-colors"
                >
                  Auto {getSortIcon("autoAttackDPS")}
                </button>
              </th>
              <th className="p-2 text-right">
                <button
                  type="button"
                  onClick={() => handleSort("abilityDPS")}
                  className="hover:text-blue-400 transition-colors"
                >
                  Ability {getSortIcon("abilityDPS")}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {displayBuilds.map((build) => (
              <tr
                key={`${build.champion}-${build.buildType}-${build.rune}`}
                className="border-b border-gray-800 hover:bg-gray-800/50 relative"
                onMouseEnter={(e) => {
                  setHoveredBuild(build);
                  setTooltipPosition({ x: e.clientX + 15, y: e.clientY + 10 });
                }}
                onMouseMove={(e) => {
                  setTooltipPosition({ x: e.clientX + 15, y: e.clientY + 10 });
                }}
                onMouseLeave={() => setHoveredBuild(null)}
              >
                <td className="p-2 font-semibold">{build.champion}</td>
                <td className="p-2">
                  <span className="text-xs bg-yellow-900/30 px-2 py-1 rounded border border-yellow-700 font-medium">
                    {build.rune}
                  </span>
                </td>
                <td className="p-2">
                  <div className="flex flex-wrap gap-1">
                    {build.items.map((item: string) => (
                      <span
                        key={`${build.champion}-${item}`}
                        className="text-xs bg-purple-900/30 px-1 py-0.5 rounded border border-purple-700"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="p-2">
                  <span className="text-xs bg-green-900/30 px-2 py-1 rounded border border-green-700">
                    {build.buildType}
                  </span>
                </td>
                <td className="p-2 text-right font-bold text-blue-400">
                  {build.totalDPS.toFixed(1)}
                </td>
                <td className="p-2 text-right text-gray-400">
                  {build.autoAttackDPS.toFixed(1)}
                </td>
                <td className="p-2 text-right text-gray-400">
                  {build.abilityDPS.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* DPS Breakdown Tooltip */}
      {hoveredBuild?.breakdown && (
        <div
          className="fixed z-50 bg-gray-900 border border-gray-600 rounded-lg shadow-xl p-4 max-w-md"
          style={{
            left: Math.min(tooltipPosition.x, window.innerWidth - 420),
            top: Math.max(
              10,
              Math.min(tooltipPosition.y, window.innerHeight - 300),
            ),
          }}
        >
          <div className="text-sm font-bold text-blue-400 mb-2 border-b border-gray-700 pb-2">
            {hoveredBuild.champion} - DPS Breakdown
          </div>
          <div className="space-y-1 text-xs font-mono">
            {hoveredBuild.breakdown.map((line) => {
              // Color-code different types of breakdown lines
              let colorClass = "text-gray-300";
              if (line.includes("Base AA:")) colorClass = "text-yellow-400";
              else if (line.includes("on-hit")) colorClass = "text-purple-400";
              else if (line.includes("On-hit total:"))
                colorClass = "text-purple-300 font-semibold";
              else if (line.includes("DPS (") && !line.includes("On-hit"))
                colorClass = "text-cyan-400";
              else if (line.includes("Damage multipliers:"))
                colorClass = "text-orange-400 font-semibold";

              return (
                <div key={line} className={colorClass}>
                  {line}
                </div>
              );
            })}
          </div>
          <div className="mt-3 pt-2 border-t border-gray-700 text-xs text-gray-500">
            Total:{" "}
            <span className="text-blue-400 font-bold">
              {hoveredBuild.totalDPS.toFixed(1)}
            </span>{" "}
            DPS
          </div>
        </div>
      )}
    </div>
  );
}

export default function Home(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<
    "finder" | "random" | "planner" | "meta"
  >("finder");
  const [showDevTabs, setShowDevTabs] = useState(false);
  const [selectedChampion, setSelectedChampion] = useState<Character | null>(
    null,
  );
  const [selectedItems, setSelectedItems] = useState<Item[]>([]);
  const [championSearch, setChampionSearch] = useState("");
  const [itemSearch, setItemSearch] = useState("");

  // F4 key toggles dev tabs visibility
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F4") {
        e.preventDefault();
        setShowDevTabs((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Available champions and items
  const champions = Characters;
  const availableItems = Items;

  // Filtered lists
  const filteredChampions = champions.filter((champ) =>
    champ.Name.toLowerCase().includes(championSearch.toLowerCase()),
  );
  const filteredItems = availableItems.filter((item) =>
    item.name.toLowerCase().includes(itemSearch.toLowerCase()),
  );

  const handleChampionSelect = (champion: Character) => {
    setSelectedChampion(champion);
    setSelectedItems([]);
  };

  const handleItemAdd = (item: Item) => {
    if (selectedItems.length >= 6 || !selectedChampion) return;

    // Check if item with same group name already exists
    const itemGroupName = item.getGroupName();
    const hasConflict = selectedItems.some(
      (existingItem) => existingItem.getGroupName() === itemGroupName,
    );

    if (!hasConflict) {
      setSelectedItems([...selectedItems, item]);
    }
  };

  const handleItemRemove = (index: number) => {
    setSelectedItems(selectedItems.filter((_, i) => i !== index));
  };

  const getTotalStats = () => {
    if (!selectedChampion) return null;

    const championWithItems = Object.assign(
      Object.create(Object.getPrototypeOf(selectedChampion)),
      selectedChampion,
    );
    championWithItems.Items = selectedItems;
    return championWithItems.getTotalStats();
  };

  const getDPS = () => {
    if (!selectedChampion) return null;

    const championWithItems = Object.assign(
      Object.create(Object.getPrototypeOf(selectedChampion)),
      selectedChampion,
    );
    championWithItems.Items = selectedItems;
    return championWithItems.calculateDPS();
  };

  const stats = getTotalStats();
  const dps = getDPS();

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white">
      {/* Tab Header - Only shown when dev mode enabled via F4 */}
      {showDevTabs && (
        <div className="flex border-b border-gray-700">
          <button
            type="button"
            onClick={() => setActiveTab("finder")}
            className={`px-6 py-3 font-semibold transition-colors ${
              activeTab === "finder"
                ? "bg-gray-800 text-white border-b-2 border-emerald-500"
                : "text-gray-400 hover:text-white hover:bg-gray-800/50"
            }`}
          >
            1v1 Finder
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("random")}
            className={`px-6 py-3 font-semibold transition-colors ${
              activeTab === "random"
                ? "bg-gray-800 text-white border-b-2 border-purple-500"
                : "text-gray-400 hover:text-white hover:bg-gray-800/50"
            }`}
          >
            Random
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("planner")}
            className={`px-6 py-3 font-semibold transition-colors ${
              activeTab === "planner"
                ? "bg-gray-800 text-white border-b-2 border-blue-500"
                : "text-gray-400 hover:text-white hover:bg-gray-800/50"
            }`}
          >
            Planner
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("meta")}
            className={`px-6 py-3 font-semibold transition-colors ${
              activeTab === "meta"
                ? "bg-gray-800 text-white border-b-2 border-blue-500"
                : "text-gray-400 hover:text-white hover:bg-gray-800/50"
            }`}
          >
            Meta
          </button>
        </div>
      )}

      {/* Tab Content */}
      {!showDevTabs || activeTab === "finder" ? (
        <BuildFinder />
      ) : activeTab === "random" ? (
        <RandomBuildGenerator />
      ) : activeTab === "planner" ? (
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Champions (40%) */}
          <div className="w-[45%] border-r border-gray-700 p-2 flex flex-col">
            <h2 className="text-lg font-bold mb-2">Champions</h2>
            <input
              type="text"
              placeholder="Search champions..."
              value={championSearch}
              onChange={(e) => setChampionSearch(e.target.value)}
              className="mb-2 px-2 py-1 text-xs bg-gray-800 border border-gray-600 rounded focus:outline-none focus:border-blue-500"
            />
            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-6 gap-1">
                {filteredChampions.map((champion) => (
                  <button
                    type="button"
                    key={champion.Name}
                    onClick={() => handleChampionSelect(champion)}
                    className={`p-1 rounded border transition-all ${
                      selectedChampion?.Name === champion.Name
                        ? "border-blue-500 bg-blue-900/30"
                        : "border-gray-600 bg-gray-800 hover:border-gray-500"
                    }`}
                  >
                    <div className="text-xs font-semibold truncate">
                      {champion.Name}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Middle: Selected Champion + Items (10%) */}
          <div className="w-[10%] border-r border-gray-700 p-2 flex flex-col items-center">
            {selectedChampion ? (
              <>
                <div className="mb-2 text-center">
                  <div className="text-sm font-bold">
                    {selectedChampion.Name}
                  </div>
                </div>
                <div className="flex-1 w-full">
                  <h3 className="text-xs font-semibold mb-1 text-center">
                    Items
                  </h3>
                  <div className="space-y-1">
                    {Array.from({ length: 6 }).map((_, index) => (
                      <button
                        type="button"
                        key={`slot-${index}-${selectedItems[index]?.name ?? "empty"}`}
                        onClick={() =>
                          selectedItems[index] && handleItemRemove(index)
                        }
                        className={`w-full h-8 rounded border transition-all ${
                          selectedItems[index]
                            ? "border-purple-500 bg-purple-900/30 hover:border-red-500 hover:bg-red-900/30"
                            : "border-gray-600 bg-gray-800/50"
                        }`}
                        title={
                          selectedItems[index]
                            ? `Click to remove ${selectedItems[index].name}`
                            : "Empty slot"
                        }
                      >
                        {selectedItems[index] && (
                          <div className="text-[10px] truncate px-1">
                            {selectedItems[index].name}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-gray-500 text-center text-xs">
                Select a champion
              </div>
            )}
          </div>

          {/* Right: Stats (top 50%) + Items (bottom 50%) (40%) */}
          <div className="w-[45%] flex flex-col">
            {/* Stats (50%) */}
            <div className="h-[50%] border-b border-gray-700 p-2 overflow-y-auto">
              <h2 className="text-lg font-bold mb-2">Stats & DPS</h2>
              {stats ? (
                <>
                  <div className="grid grid-cols-3 gap-1 mb-3">
                    <div className="bg-gray-800 p-1 rounded">
                      <div className="text-gray-400 text-[10px]">HP</div>
                      <div className="text-sm font-bold">
                        {Math.round(stats.hp)}
                      </div>
                    </div>
                    <div className="bg-gray-800 p-1 rounded">
                      <div className="text-gray-400 text-[10px]">Mana</div>
                      <div className="text-sm font-bold">
                        {Math.round(stats.mana)}
                      </div>
                    </div>
                    <div className="bg-gray-800 p-1 rounded">
                      <div className="text-gray-400 text-[10px]">AD</div>
                      <div className="text-sm font-bold">
                        {Math.round(stats.ad)}
                      </div>
                    </div>
                    <div className="bg-gray-800 p-1 rounded">
                      <div className="text-gray-400 text-[10px]">AP</div>
                      <div className="text-sm font-bold">
                        {Math.round(stats.ap)}
                      </div>
                    </div>
                    <div className="bg-gray-800 p-1 rounded">
                      <div className="text-gray-400 text-[10px]">Armor</div>
                      <div className="text-sm font-bold">
                        {Math.round(stats.armor)}
                      </div>
                    </div>
                    <div className="bg-gray-800 p-1 rounded">
                      <div className="text-gray-400 text-[10px]">MR</div>
                      <div className="text-sm font-bold">
                        {Math.round(stats.mr)}
                      </div>
                    </div>
                    <div className="bg-gray-800 p-1 rounded">
                      <div className="text-gray-400 text-[10px]">AS</div>
                      <div className="text-sm font-bold">
                        {stats.as.toFixed(2)}
                      </div>
                    </div>
                    <div className="bg-gray-800 p-1 rounded">
                      <div className="text-gray-400 text-[10px]">Crit %</div>
                      <div className="text-sm font-bold">
                        {Math.round(stats.critChance)}%
                      </div>
                    </div>
                    <div className="bg-gray-800 p-1 rounded">
                      <div className="text-gray-400 text-[10px]">AH</div>
                      <div className="text-sm font-bold">
                        {Math.round(stats.abilityHaste)}
                      </div>
                    </div>
                    <div className="bg-gray-800 p-1 rounded">
                      <div className="text-gray-400 text-[10px]">LS %</div>
                      <div className="text-sm font-bold">
                        {Math.round(stats.lifeSteal)}%
                      </div>
                    </div>
                    <div className="bg-gray-800 p-1 rounded">
                      <div className="text-gray-400 text-[10px]">MS</div>
                      <div className="text-sm font-bold">
                        {Math.round(stats.ms)}
                      </div>
                    </div>
                    <div className="bg-gray-800 p-1 rounded">
                      <div className="text-gray-400 text-[10px]">Leth</div>
                      <div className="text-sm font-bold">
                        {Math.round(stats.lethality)}
                      </div>
                    </div>
                  </div>

                  {/* DPS Section */}
                  {dps && (
                    <div className="mt-3 space-y-2">
                      <div className="bg-blue-900/30 p-2 rounded border border-blue-700">
                        <div className="text-blue-400 text-xs font-semibold mb-1">
                          Total DPS
                        </div>
                        <div className="text-2xl font-bold">
                          {dps.totalDPS.toFixed(1)}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-1">
                        <div className="bg-gray-800 p-1 rounded">
                          <div className="text-gray-400 text-[10px]">
                            Auto Attack
                          </div>
                          <div className="text-sm font-bold">
                            {dps.autoAttackDPS.toFixed(1)}
                          </div>
                        </div>
                        <div className="bg-gray-800 p-1 rounded">
                          <div className="text-gray-400 text-[10px]">
                            On-Hit
                          </div>
                          <div className="text-sm font-bold">
                            {dps.onHitDPS.toFixed(1)}
                          </div>
                        </div>
                        <div className="bg-gray-800 p-1 rounded">
                          <div className="text-gray-400 text-[10px]">DoT</div>
                          <div className="text-sm font-bold">
                            {dps.dotDPS.toFixed(1)}
                          </div>
                        </div>
                        <div className="bg-gray-800 p-1 rounded">
                          <div className="text-gray-400 text-[10px]">
                            Abilities
                          </div>
                          <div className="text-sm font-bold">
                            {dps.abilityDPS.toFixed(1)}
                          </div>
                        </div>
                        <div className="bg-orange-900/30 p-1 rounded border border-orange-700">
                          <div className="text-orange-400 text-[10px]">
                            Burst
                          </div>
                          <div className="text-sm font-bold">
                            {dps.burstDPS.toFixed(1)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-gray-500 text-xs">
                  Select a champion to view stats
                </div>
              )}
            </div>

            {/* Items (50%) */}
            <div className="h-[50%] p-2 flex flex-col">
              <h2 className="text-lg font-bold mb-2">Available Items</h2>
              {selectedChampion ? (
                <>
                  <input
                    type="text"
                    placeholder="Search items..."
                    value={itemSearch}
                    onChange={(e) => setItemSearch(e.target.value)}
                    className="mb-2 px-2 py-1 text-xs bg-gray-800 border border-gray-600 rounded focus:outline-none focus:border-blue-500"
                  />
                  <div className="flex-1 overflow-y-auto">
                    <div className="grid grid-cols-4 gap-1">
                      {filteredItems.map((item) => {
                        const itemGroupName = item.getGroupName();
                        const hasConflict = selectedItems.some(
                          (existingItem) =>
                            existingItem.getGroupName() === itemGroupName,
                        );
                        const isFull = selectedItems.length >= 6;
                        const isDisabled = isFull || hasConflict;

                        return (
                          <button
                            type="button"
                            key={item.name}
                            onClick={() => handleItemAdd(item)}
                            disabled={isDisabled}
                            className={`p-1 rounded border transition-all text-left ${
                              isDisabled
                                ? "border-gray-700 bg-gray-800/50 opacity-50 cursor-not-allowed"
                                : "border-purple-600 bg-purple-900/20 hover:border-purple-500 hover:bg-purple-900/30"
                            }`}
                            title={
                              hasConflict
                                ? `Cannot equip: ${itemGroupName} already equipped`
                                : isFull
                                  ? "Item slots full"
                                  : `Equip ${item.name}`
                            }
                          >
                            <div className="font-semibold text-[10px] truncate">
                              {item.name}
                            </div>
                            {item.groupName && (
                              <div className="text-[9px] text-blue-400 truncate">
                                {item.groupName}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-gray-500 text-xs">
                  Select a champion to add items
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <MetaAnalysis />
      )}
    </div>
  );
}
