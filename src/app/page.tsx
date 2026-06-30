"use client";
import { AppShell } from "@/components/app-shell";
import { ChampionIcon } from "@/components/champion-icon";
import { HoverTip } from "@/components/hover-tip";
import { ItemIcon } from "@/components/item-icon";
import { RuneIcon } from "@/components/rune-icon";
import { SearchInput } from "@/components/search-input";
import { TabNav } from "@/components/tab-nav";
import { WidgetCard } from "@/components/widget-card";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  BuildRecommendation,
  DuelAssumptions,
  EnemyChampionInput,
  ResolvedDuel,
  SimulationScenario,
} from "@/lib/buildOptimizer";
import {
  averageEnemyTeamStats,
  dedupeSerializedMetaBuilds,
  INTERACTIVE_RECOMMEND_OPTIONS,
  META_DUEL_DEFAULTS,
  recommendBuildsForChampion,
  rescoreMetaDataset,
  type SerializedMeta,
} from "@/lib/buildOptimizer";
import { OPGG_REGION_OPTIONS } from "@/lib/opggLiveGame";
import { importLiveGameFromOpgg } from "./actions/liveGame";
import { type Character, Characters, type Item, Items } from "./actions/sim";
import {
  breakdownLineColorClass,
  DUEL_FIELD_TOOLTIPS,
  dpsDamageColorClasses,
  primaryDamageTypeFromDps,
  PROFILE_TOOLTIPS,
  STAT_TOOLTIPS,
  type DpsComponents,
} from "@/lib/statTooltips";

type ScrapedChampionBuild = {
  position: string;
  items: string[];
  boots: string | null;
  fullBuild: string[];
  baseStatsLv18: { hp: number; armor: number; mr: number };
};

type ScrapedBuildsFile = {
  patch: string;
  scrapedAt: string;
  champions: Record<string, ScrapedChampionBuild>;
};

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
  physicalAbilityDPS?: number;
  burstDPS: number;
  fightDurationSeconds?: number;
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

function dpsColorForBuild(build: DpsComponents) {
  return dpsDamageColorClasses(primaryDamageTypeFromDps(build));
}

function useRescoredMeta(raw: MetaData | null): SerializedMeta | null {
  return useMemo(() => {
    if (!raw) return null;
    return rescoreMetaDataset({
      championBuilds: raw.championBuilds as SerializedMeta["championBuilds"],
      generatedAt: raw.generatedAt,
      duel: raw.duel ?? META_DUEL_DEFAULTS,
      simulation: raw.simulation,
    });
  }, [raw]);
}

function EnemyTeamPicker({
  opggBuilds,
  enemyTeam,
  setEnemyTeam,
}: {
  opggBuilds: ScrapedBuildsFile | null;
  enemyTeam: string[];
  setEnemyTeam: (team: string[]) => void;
}): React.ReactElement {
  const [search, setSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const availableChamps = useMemo(() => {
    if (!opggBuilds) return [];
    return Object.keys(opggBuilds.champions).sort();
  }, [opggBuilds]);

  const filtered = useMemo(
    () =>
      availableChamps.filter(
        (name) =>
          !enemyTeam.includes(name) &&
          name.toLowerCase().includes(search.toLowerCase()),
      ),
    [availableChamps, enemyTeam, search],
  );

  const addChamp = useCallback(
    (name: string) => {
      if (enemyTeam.length >= 5 || enemyTeam.includes(name)) return;
      setEnemyTeam([...enemyTeam, name]);
      setSearch("");
    },
    [enemyTeam, setEnemyTeam],
  );

  const removeChamp = useCallback(
    (name: string) => {
      setEnemyTeam(enemyTeam.filter((n) => n !== name));
    },
    [enemyTeam, setEnemyTeam],
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <div className="flex flex-wrap gap-1.5 mb-1.5">
        {enemyTeam.map((name) => {
          const data = opggBuilds?.champions[name];
          return (
            <span
              key={name}
              className="inline-flex items-center gap-1.5 text-xs bg-dpm-accent/10 border border-dpm-accent/25 text-dpm-text px-2 py-1 rounded-full"
            >
              <ChampionIcon name={name} size={20} />
              {name}
              {data && (
                <span className="text-dpm-muted text-[10px]">
                  {data.position}
                </span>
              )}
              <button
                type="button"
                onClick={() => removeChamp(name)}
                className="ml-0.5 text-dpm-muted hover:text-dpm-down font-bold"
              >
                x
              </button>
            </span>
          );
        })}
      </div>
      {enemyTeam.length < 5 && (
        <input
          type="text"
          placeholder={
            opggBuilds
              ? `Add enemy champion (${5 - enemyTeam.length} slots)…`
              : "Loading OP.GG data…"
          }
          disabled={!opggBuilds}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setDropdownOpen(true);
          }}
          onFocus={() => setDropdownOpen(true)}
          className="dpm-input text-xs"
        />
      )}
      {dropdownOpen && filtered.length > 0 && (
        <div className="absolute z-30 mt-1 w-full max-h-48 overflow-y-auto bg-dpm-widget border border-white/10 rounded-lg shadow-lg">
          {filtered.slice(0, 30).map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => {
                addChamp(name);
                setDropdownOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-xs hover:bg-dpm-widget-hover transition-colors flex items-center gap-2"
            >
              <ChampionIcon name={name} size={24} />
              {name}
              {opggBuilds?.champions[name] && (
                <span className="text-dpm-muted ml-2">
                  {opggBuilds.champions[name].position}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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
  const [incomingPhysPct, setIncomingPhysPct] = useState(50);
  const [useRotationProfiles, setUseRotationProfiles] = useState(true);

  const [opggBuilds, setOpggBuilds] = useState<ScrapedBuildsFile | null>(null);
  const [enemyTeam, setEnemyTeam] = useState<string[]>([]);
  const [useAutoStats, setUseAutoStats] = useState(true);

  const [liveRiotId, setLiveRiotId] = useState("");
  const [liveRegion, setLiveRegion] = useState("NA");
  const [liveImportBusy, setLiveImportBusy] = useState(false);
  const [liveImportStatus, setLiveImportStatus] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    fetch("/data/opggBuilds.json")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ScrapedBuildsFile | null) => {
        if (data) setOpggBuilds(data);
      })
      .catch(() => {});
  }, []);

  const autoStats = useMemo(() => {
    if (!opggBuilds || enemyTeam.length === 0) return null;
    const inputs: EnemyChampionInput[] = enemyTeam
      .map((name) => {
        const data = opggBuilds.champions[name];
        if (!data) return null;
        return {
          champion: name,
          items: data.fullBuild,
          baseStatsLv18: data.baseStatsLv18,
        };
      })
      .filter((x): x is EnemyChampionInput => x !== null);
    if (inputs.length === 0) return null;
    return averageEnemyTeamStats(inputs);
  }, [opggBuilds, enemyTeam]);

  useEffect(() => {
    if (autoStats && useAutoStats) {
      setTargetMaxHP(autoStats.targetMaxHP);
      setTargetBonusHP(autoStats.targetBonusHP);
      setTargetArmor(autoStats.targetArmor);
      setTargetMR(autoStats.targetMR);
      setIncomingPhysPct(Math.round(autoStats.incomingPhysShare * 100));
    }
  }, [autoStats, useAutoStats]);

  const duelOptions = useMemo<DuelAssumptions>(
    () => ({
      targetMaxHP,
      targetBonusHP,
      targetArmor,
      targetMR,
      incomingPhysShare: incomingPhysPct / 100,
      ...(autoStats && useAutoStats
        ? {
            targetPhysicalShieldEHP: autoStats.targetPhysicalShieldEHP,
            targetMagicShieldEHP: autoStats.targetMagicShieldEHP,
            targetSpellShieldBlockChance:
              autoStats.targetSpellShieldBlockChance,
            targetProjectileBlockChance: autoStats.targetProjectileBlockChance,
            targetHealReductionPercent: autoStats.targetHealReductionPercent,
          }
        : {}),
    }),
    [targetMaxHP, targetBonusHP, targetArmor, targetMR, incomingPhysPct, autoStats, useAutoStats],
  );

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
      setBusy(false);
      return;
    }
    setBusy(true);
    const t = window.setTimeout(() => {
      setRecs(
        recommendBuildsForChampion(selectedChampion, Items, {
          ...INTERACTIVE_RECOMMEND_OPTIONS,
          duel: duelOptions,
          simulation: {
            level: 18,
            enableChampionRotationProfiles: useRotationProfiles,
          },
        }),
      );
      setBusy(false);
    }, 400);
    return () => window.clearTimeout(t);
  }, [selectedChampion, duelOptions, useRotationProfiles]);

  const isAutoActive =
    useAutoStats && enemyTeam.length > 0 && autoStats !== null;

  const missingOpggEnemies =
    opggBuilds && enemyTeam.length > 0
      ? enemyTeam.filter((name) => !opggBuilds.champions[name])
      : [];

  const handleLiveImport = useCallback(async () => {
    if (liveImportBusy || !liveRiotId.trim()) return;
    setLiveImportBusy(true);
    setLiveImportStatus(null);
    const result = await importLiveGameFromOpgg(liveRiotId.trim(), liveRegion);
    setLiveImportBusy(false);
    if (!result.ok) {
      setLiveImportStatus({ kind: "error", message: result.message });
      return;
    }
    if (result.data.resolvedRegion) {
      setLiveRegion(result.data.resolvedRegion);
    }
    const you = Characters.find((c) => c.Name === result.data.myChampion);
    if (you) setSelectedChampion(you);
    setEnemyTeam(result.data.enemyTeam);
    setUseAutoStats(true);
    setChampionSearch(result.data.myChampion);
    const queue =
      result.data.queueLabel != null ? ` (${result.data.queueLabel})` : "";
    setLiveImportStatus({
      kind: "success",
      message: `Loaded ${result.data.myChampion} vs ${result.data.enemyTeam.join(", ")}${queue}`,
    });
  }, [liveImportBusy, liveRiotId, liveRegion]);

  return (
    <div className="finder-layout">
      {/* Column 1 — Champion picker */}
      <aside className="finder-col finder-col-champs finder-col-panel">
        <p className="finder-section-label">Champion</p>
        {selectedChampion && (
          <div className="flex items-center gap-2.5 mb-1 pb-3 border-b border-white/10">
            <ChampionIcon name={selectedChampion.Name} size={44} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-white text-sm truncate">
                {selectedChampion.Name}
              </p>
              <p className="text-dpm-muted text-[10px] mt-0.5">
                Lv 18 · rot {useRotationProfiles ? "on" : "off"}
              </p>
            </div>
          </div>
        )}
        <label htmlFor="champion-search" className="sr-only">
          Search champion
        </label>
        <SearchInput
          id="champion-search"
          placeholder="Search champion…"
          value={championSearch}
          onChange={(e) => setChampionSearch(e.target.value)}
          className="mb-2 shrink-0"
        />
        <div className="finder-champ-grid">
          {filteredChampions.map((c) => (
            <HoverTip key={c.Name} label={c.Name}>
              <button
                type="button"
                onClick={() => {
                  setSelectedChampion(c);
                  setChampionSearch("");
                }}
                className={`finder-champ-cell w-full ${
                  selectedChampion?.Name === c.Name
                    ? "finder-champ-cell-active"
                    : ""
                }`}
              >
                <ChampionIcon name={c.Name} size={36} />
                <span className="text-[9px] font-medium truncate w-full text-center leading-tight">
                  {c.Name}
                </span>
              </button>
            </HoverTip>
          ))}
        </div>
      </aside>

      {/* Column 2 — Matchup */}
      <section className="finder-col finder-col-matchup finder-col-panel">
        <p className="finder-section-label">Matchup</p>

        <div>
          <p className="finder-section-label">Live import</p>
          <HoverTip label="Requires an active game visible on OP.GG. Enter Riot ID as Name#Tag.">
            <label
              htmlFor="live-riot-id"
              className="finder-field-label cursor-help"
            >
              Riot ID (Name#Tag)
            </label>
          </HoverTip>
          <input
            id="live-riot-id"
            type="text"
            placeholder="Faker#KR1"
            value={liveRiotId}
            onChange={(e) => setLiveRiotId(e.target.value)}
            className="dpm-input w-full mb-2"
          />
          <div className="flex gap-2">
            <select
              id="live-region"
              value={liveRegion}
              onChange={(e) => setLiveRegion(e.target.value)}
              className="dpm-input flex-1 min-w-0"
            >
              {OPGG_REGION_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={liveImportBusy || !liveRiotId.trim()}
              onClick={() => void handleLiveImport()}
              className="dpm-btn dpm-btn-primary shrink-0 px-4"
            >
              {liveImportBusy ? "Loading…" : "Load game"}
            </button>
          </div>
          {liveImportStatus && (
            <p
              className={`mt-2 text-xs ${liveImportStatus.kind === "success" ? "text-dpm-up" : "text-dpm-down"}`}
            >
              {liveImportStatus.message}
            </p>
          )}
        </div>

        <div>
          <p className="finder-section-label">
            Enemy team{opggBuilds ? ` · ${opggBuilds.patch}` : ""}
          </p>
          <EnemyTeamPicker
            opggBuilds={opggBuilds}
            enemyTeam={enemyTeam}
            setEnemyTeam={setEnemyTeam}
          />
          {missingOpggEnemies.length > 0 && (
            <p className="mt-2 text-dpm-accent-gold text-xs leading-relaxed">
              Missing OP.GG data: {missingOpggEnemies.join(", ")}
            </p>
          )}
          {autoStats && enemyTeam.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-dpm-muted text-xs leading-relaxed">
                Avg {autoStats.targetMaxHP} HP (+{autoStats.targetBonusHP}),{" "}
                {autoStats.targetArmor}/{autoStats.targetMR},{" "}
                {Math.round(autoStats.incomingPhysShare * 100)}% phys
              </span>
              <button
                type="button"
                onClick={() => setUseAutoStats((prev) => !prev)}
                className={`dpm-btn text-[10px] shrink-0 ${useAutoStats ? "dpm-btn-active" : ""}`}
              >
                {useAutoStats ? "Auto-fill ON" : "Auto-fill OFF"}
              </button>
            </div>
          )}
        </div>

        <div>
          <p className="finder-section-label">Target stats</p>
          <div className="finder-stat-grid">
            <div>
              <HoverTip label={DUEL_FIELD_TOOLTIPS.maxHP}>
                <label
                  htmlFor="duel-max-hp"
                  className="finder-field-label cursor-help"
                >
                  Max HP
                </label>
              </HoverTip>
              <input
                id="duel-max-hp"
                type="number"
                min={400}
                max={12000}
                step={100}
                value={targetMaxHP}
                onChange={(e) => {
                  setTargetMaxHP(Number(e.target.value) || 3000);
                  if (isAutoActive) setUseAutoStats(false);
                }}
                className={`dpm-input ${isAutoActive ? "border-dpm-accent/25" : ""}`}
              />
            </div>
            <div>
              <HoverTip label={DUEL_FIELD_TOOLTIPS.bonusHP}>
                <label
                  htmlFor="duel-bonus-hp"
                  className="finder-field-label cursor-help"
                >
                  Bonus HP
                </label>
              </HoverTip>
              <input
                id="duel-bonus-hp"
                type="number"
                min={0}
                max={8000}
                step={100}
                value={targetBonusHP}
                onChange={(e) => {
                  setTargetBonusHP(Number(e.target.value) || 0);
                  if (isAutoActive) setUseAutoStats(false);
                }}
                className={`dpm-input ${isAutoActive ? "border-dpm-accent/25" : ""}`}
              />
            </div>
            <div>
              <HoverTip label={DUEL_FIELD_TOOLTIPS.armor}>
                <label
                  htmlFor="duel-armor"
                  className="finder-field-label cursor-help"
                >
                  Armor
                </label>
              </HoverTip>
              <input
                id="duel-armor"
                type="number"
                min={0}
                max={500}
                step={5}
                value={targetArmor}
                onChange={(e) => {
                  setTargetArmor(Number(e.target.value) || 0);
                  if (isAutoActive) setUseAutoStats(false);
                }}
                className={`dpm-input ${isAutoActive ? "border-dpm-accent/25" : ""}`}
              />
            </div>
            <div>
              <HoverTip label={DUEL_FIELD_TOOLTIPS.mr}>
                <label
                  htmlFor="duel-mr"
                  className="finder-field-label cursor-help"
                >
                  MR
                </label>
              </HoverTip>
              <input
                id="duel-mr"
                type="number"
                min={0}
                max={500}
                step={5}
                value={targetMR}
                onChange={(e) => {
                  setTargetMR(Number(e.target.value) || 0);
                  if (isAutoActive) setUseAutoStats(false);
                }}
                className={`dpm-input ${isAutoActive ? "border-dpm-accent/25" : ""}`}
              />
            </div>
          </div>
        </div>

        <div className="space-y-4 pt-1 border-t border-white/10">
          <div>
            <HoverTip label={DUEL_FIELD_TOOLTIPS.physShare}>
              <label
                htmlFor="duel-phys-share"
                className="finder-field-label cursor-help"
              >
                Incoming damage: {incomingPhysPct}% physical /{" "}
                {100 - incomingPhysPct}% magic
              </label>
            </HoverTip>
            <input
              id="duel-phys-share"
              type="range"
              min={0}
              max={100}
              value={incomingPhysPct}
              onChange={(e) => {
                setIncomingPhysPct(Number(e.target.value));
                if (useAutoStats) setUseAutoStats(false);
              }}
              className="w-full accent-dpm-accent"
            />
          </div>
          <div>
            <HoverTip label={DUEL_FIELD_TOOLTIPS.rotation}>
              <label
                htmlFor="duel-rotation-profiles"
                className="finder-field-label cursor-help"
              >
                Rotation templates
              </label>
            </HoverTip>
            <button
              id="duel-rotation-profiles"
              type="button"
              onClick={() => setUseRotationProfiles((prev) => !prev)}
              className={`dpm-btn ${useRotationProfiles ? "dpm-btn-active" : ""}`}
            >
              {useRotationProfiles ? "Enabled" : "Disabled"}
            </button>
          </div>
        </div>
      </section>

      {/* Column 3 — Builds */}
      <section className="finder-col finder-col-builds min-h-0">
        <p className="finder-section-label">Builds</p>
        {!selectedChampion && (
          <p className="text-dpm-muted text-sm py-8 text-center lg:text-left">
            Select a champion to see build recommendations.
          </p>
        )}
        {selectedChampion && busy && (
          <div className="flex items-center gap-2 text-dpm-muted text-sm py-8">
            <ChampionIcon name={selectedChampion.Name} size={32} />
            <span>Computing builds for {selectedChampion.Name}…</span>
          </div>
        )}
        {selectedChampion && !busy && recs.length === 0 && (
          <p className="text-dpm-muted text-sm py-8">No recommendations.</p>
        )}
        {selectedChampion && !busy && recs.length > 0 && (
          <div className="finder-build-grid">
            {recs.map((r) => (
              <article
                key={`${r.profile}-${r.label}-${r.items.join(",")}`}
                className="finder-build-card"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-dpm-accent-gold font-semibold text-sm leading-snug">
                    {r.label}
                  </h3>
                  <HoverTip
                    label={PROFILE_TOOLTIPS[r.profile] ?? STAT_TOOLTIPS.profile}
                  >
                    <span className="dpm-badge-accent shrink-0 cursor-help text-[10px]">
                      {r.profile}
                    </span>
                  </HoverTip>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {r.items.map((name) => (
                    <HoverTip key={name} label={name}>
                      <ItemIcon name={name} size={36} className="cursor-help" />
                    </HoverTip>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 border-t border-white/8">
                  <HoverTip label={r.rune}>
                    <RuneIcon name={r.rune} size={28} className="cursor-help" />
                  </HoverTip>
                  <HoverTip label={STAT_TOOLTIPS.fightDuration}>
                    <span className="text-dpm-muted text-[11px] cursor-help">
                      ~{r.fightDurationSeconds.toFixed(1)}s to kill
                    </span>
                  </HoverTip>
                </div>
                <details className="text-[11px]">
                  <summary className="cursor-pointer text-dpm-muted hover:text-dpm-text list-none">
                    DPS breakdown
                  </summary>
                  <div className="mt-2 space-y-0.5 font-mono text-[9px] text-dpm-muted max-h-32 overflow-y-auto border border-white/10 rounded p-2 bg-dpm-bg/60">
                    {r.breakdown.map((line) => (
                      <div key={`${r.profile}-${line}`}>{line}</div>
                    ))}
                  </div>
                </details>
              </article>
            ))}
          </div>
        )}
      </section>
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
    fetch(`/data/metaBuilds.json?ts=${Date.now()}`)
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

  const scoredMeta = useRescoredMeta(metaData);

  const allBuilds = useMemo(() => {
    if (!scoredMeta) return [];
    let builds: BuildResult[] = [];
    for (const cb of scoredMeta.championBuilds) {
      builds = builds.concat(dedupeSerializedMetaBuilds(cb.builds, Items));
    }
    return builds;
  }, [scoredMeta]);

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
        <div className="text-dpm-muted text-xl">Loading builds...</div>
      </div>
    );
  }

  if (allBuilds.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="text-dpm-down text-xl mb-2">No builds available</div>
          <div className="text-dpm-muted text-xs">
            Run <code className="dpm-kbd">npm run compute-meta</code> to
            generate builds
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="mb-8 text-center">
        <p className="text-xs uppercase tracking-widest text-dpm-muted mb-1">
          Discover your
        </p>
        <h1 className="text-3xl lg:text-4xl font-bold text-white mb-2">
          Random Build
        </h1>
        <p className="text-dpm-muted">Click to discover your destiny</p>
      </div>

      {/* Slot machine container */}
      <div className="relative w-full max-w-2xl mb-8">
        <div className="absolute inset-0 bg-dpm-accent/10 blur-xl rounded-3xl" />

        <div className="relative dpm-widget dpm-widget-glow dpm-widget-glow-gold overflow-hidden !p-0 border-2 border-dpm-accent-gold/30">
          {/* Selection indicator */}
          <div className="absolute top-1/2 left-0 right-0 h-[120px] -translate-y-1/2 border-y-2 border-dpm-accent-gold bg-dpm-accent-gold/10 z-10 pointer-events-none" />
          <div className="absolute top-1/2 left-0 w-4 h-8 -translate-y-1/2 bg-dpm-accent-gold z-20" />
          <div className="absolute top-1/2 right-0 w-4 h-8 -translate-y-1/2 bg-dpm-accent-gold z-20" />

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
                    className="h-[120px] flex items-center justify-center px-6 border-b border-white/10"
                  >
                    <div className="text-center">
                      <div className="text-2xl font-bold text-white mb-1">
                        {build.champion}
                      </div>
                      <div className="text-sm text-dpm-muted">
                        {build.buildType} • {build.totalDPS.toFixed(0)} DPS
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-dpm-muted text-xl">
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
        className={`px-12 py-4 text-2xl font-bold rounded-xl transition-all transform dpm-btn dpm-btn-primary ${
          isSpinning
            ? "opacity-50 cursor-not-allowed scale-95"
            : "hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(121,137,236,0.2)]"
        }`}
      >
        {isSpinning ? "SPINNING..." : "SPIN!"}
      </button>

      {/* Selected build popup overlay */}
      {selectedBuild && !isSpinning && (
        <div className="fixed inset-0 bg-dpm-header/80 flex items-center justify-center z-50">
          <div className="relative w-full max-w-2xl mx-4">
            <button
              type="button"
              onClick={() => setSelectedBuild(null)}
              className="absolute -top-3 -right-3 w-10 h-10 bg-dpm-widget hover:bg-dpm-down rounded-full border border-white/10 flex items-center justify-center text-xl font-bold transition-colors z-10"
            >
              X
            </button>

            <div className="dpm-widget dpm-widget-glow dpm-widget-glow-purple !p-6 shadow-[0_0_40px_rgba(121,137,236,0.15)]">
              <div className="text-center mb-4">
                <div className="text-sm text-dpm-accent mb-1">YOUR BUILD</div>
                <ChampionIcon
                  name={selectedBuild.champion}
                  size={64}
                  className="mx-auto mb-2"
                />
                <h2 className="text-4xl font-bold text-dpm-accent-gold">
                  {selectedBuild.champion}
                </h2>
                <div className="text-dpm-accent mt-1">
                  {selectedBuild.buildType}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="dpm-stat-tile !p-3">
                  <div className="dpm-stat-tile-label">Total DPS</div>
                  <div
                    className={`text-3xl font-bold ${dpsColorForBuild(selectedBuild).text}`}
                  >
                    {selectedBuild.totalDPS.toFixed(1)}
                  </div>
                </div>
                <div className="dpm-stat-tile !p-3">
                  <div className="dpm-stat-tile-label">Rune</div>
                  <div className="flex items-center justify-center gap-2 mt-1">
                    <HoverTip label={selectedBuild.rune}>
                      <RuneIcon
                        name={selectedBuild.rune}
                        size={36}
                        className="cursor-help"
                      />
                    </HoverTip>
                  </div>
                </div>
              </div>

              <div className="mb-4">
                <div className="text-dpm-muted text-sm mb-2 text-center">
                  Items
                </div>
                <div className="flex flex-wrap gap-2 justify-center">
                  {selectedBuild.items.map((item) => (
                    <HoverTip key={item} label={item}>
                      <ItemIcon name={item} size={44} className="cursor-help" />
                    </HoverTip>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2 text-center text-sm">
                <div className="dpm-stat-tile">
                  <div className="dpm-stat-tile-label">Auto</div>
                  <div className="font-semibold">
                    {selectedBuild.autoAttackDPS.toFixed(0)}
                  </div>
                </div>
                <div className="dpm-stat-tile">
                  <div className="dpm-stat-tile-label">On-Hit</div>
                  <div className="font-semibold">
                    {selectedBuild.onHitDPS.toFixed(0)}
                  </div>
                </div>
                <div className="dpm-stat-tile">
                  <div className="dpm-stat-tile-label">Ability</div>
                  <div className="font-semibold">
                    {selectedBuild.abilityDPS.toFixed(0)}
                  </div>
                </div>
                <div className="dpm-stat-tile">
                  <div className="dpm-stat-tile-label">Burst</div>
                  <div className="font-semibold">
                    {selectedBuild.burstDPS.toFixed(0)}
                  </div>
                </div>
              </div>

              <div className="mt-4 text-center text-dpm-muted text-xs">
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
    fetch(`/data/metaBuilds.json?ts=${Date.now()}`)
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

  const scoredMeta = useRescoredMeta(metaData);

  // Flatten all builds from all champions (TTK-rescored per build)
  const allBuilds = useMemo(() => {
    if (!scoredMeta) return [];

    let builds: BuildResult[] = [];
    for (const cb of scoredMeta.championBuilds) {
      builds = builds.concat(dedupeSerializedMetaBuilds(cb.builds, Items));
    }

    if (selectedChampionFilter) {
      builds = builds.filter((b) => b.champion === selectedChampionFilter);
    }

    return builds;
  }, [scoredMeta, selectedChampionFilter]);

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
        <div className="text-dpm-muted text-xl">Loading meta data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="text-dpm-down text-xl mb-2">
            Error loading meta data
          </div>
          <div className="text-dpm-muted text-sm">{error}</div>
          <div className="text-dpm-muted text-xs mt-4">
            Run <code className="dpm-kbd">npm run compute-meta</code> to
            generate the data
          </div>
        </div>
      </div>
    );
  }

  const displayBuilds = sortedBuilds;

  return (
    <div className="flex-1 flex flex-col py-4 overflow-hidden">
      <div className="mb-6 text-center shrink-0">
        <p className="text-xs uppercase tracking-widest text-dpm-muted mb-1">
          Explore the
        </p>
        <h2 className="text-3xl lg:text-4xl font-bold text-white mb-2">
          Meta Analysis
        </h2>
        <p className="text-dpm-muted text-sm max-w-2xl mx-auto">
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
            <span className="text-dpm-muted block mt-1 text-[11px]">
              Generated {new Date(metaData.generatedAt).toLocaleString()}
              {metaData.duel && (
                <>
                  {" "}
                  · per-build fight length from TTK · Eff. HP weight{" "}
                  {(metaData.duel.incomingPhysShare * 100).toFixed(0)}% phys
                </>
              )}
            </span>
          )}
        </p>
      </div>

      <WidgetCard glow="blue" className="mb-4 shrink-0">
        <div className="flex gap-4 items-center">
          <div className="flex items-center gap-2">
            <label
              htmlFor="meta-champion-filter"
              className="text-dpm-muted text-sm"
            >
              Champion:
            </label>
            <select
              id="meta-champion-filter"
              value={selectedChampionFilter || ""}
              onChange={(e) =>
                setSelectedChampionFilter(e.target.value || null)
              }
              className="dpm-input"
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
              className="text-dpm-muted hover:text-dpm-text text-sm underline"
            >
              Clear filter
            </button>
          )}
        </div>
      </WidgetCard>

      <WidgetCard glow="purple" className="flex-1 overflow-hidden !p-0">
        <div className="flex-1 overflow-auto max-h-[calc(100vh-320px)]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-dpm-widget border-b border-white/10">
              <tr>
                <th className="p-3 text-left text-dpm-muted font-medium">
                  <button
                    type="button"
                    onClick={() => handleSort("champion")}
                    className="hover:text-dpm-accent transition-colors"
                  >
                    Champion {getSortIcon("champion")}
                  </button>
                </th>
                <th className="p-3 text-left text-dpm-muted font-medium">
                  <button
                    type="button"
                    onClick={() => handleSort("rune")}
                    className="hover:text-dpm-accent transition-colors"
                  >
                    Rune {getSortIcon("rune")}
                  </button>
                </th>
                <th className="p-3 text-left text-dpm-muted font-medium">
                  Items
                </th>
                <th className="p-3 text-left text-dpm-muted font-medium">
                  <button
                    type="button"
                    onClick={() => handleSort("buildType")}
                    className="hover:text-dpm-accent transition-colors"
                  >
                    Type {getSortIcon("buildType")}
                  </button>
                </th>
                <th className="p-3 text-right text-dpm-muted font-medium">
                  <button
                    type="button"
                    onClick={() => handleSort("totalDPS")}
                    className="hover:text-dpm-accent transition-colors"
                  >
                    Total {getSortIcon("totalDPS")}
                  </button>
                </th>
                <th className="p-3 text-right text-dpm-muted font-medium">
                  <button
                    type="button"
                    onClick={() => handleSort("autoAttackDPS")}
                    className="hover:text-dpm-accent transition-colors"
                  >
                    Auto {getSortIcon("autoAttackDPS")}
                  </button>
                </th>
                <th className="p-3 text-right text-dpm-muted font-medium">
                  <button
                    type="button"
                    onClick={() => handleSort("abilityDPS")}
                    className="hover:text-dpm-accent transition-colors"
                  >
                    Ability {getSortIcon("abilityDPS")}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {displayBuilds.map((build) => {
                const dpsColors = dpsColorForBuild(build);
                return (
                  <tr
                    key={`${build.champion}-${build.buildType}-${build.rune}`}
                    className="border-b border-white/5 hover:bg-dpm-widget-hover/50 transition-colors"
                    onMouseEnter={(e) => {
                      setHoveredBuild(build);
                      setTooltipPosition({
                        x: e.clientX + 15,
                        y: e.clientY + 10,
                      });
                    }}
                    onMouseMove={(e) => {
                      setTooltipPosition({
                        x: e.clientX + 15,
                        y: e.clientY + 10,
                      });
                    }}
                    onMouseLeave={() => setHoveredBuild(null)}
                  >
                    <td className="p-3 font-semibold">
                      <div className="flex items-center gap-2">
                        <ChampionIcon name={build.champion} size={28} />
                        {build.champion}
                      </div>
                    </td>
                    <td className="p-3">
                      <HoverTip label={build.rune}>
                        <RuneIcon
                          name={build.rune}
                          size={32}
                          className="cursor-help"
                        />
                      </HoverTip>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1.5">
                        {build.items.map((item: string) => (
                          <HoverTip
                            key={`${build.champion}-${item}`}
                            label={item}
                          >
                            <ItemIcon
                              name={item}
                              size={32}
                              className="cursor-help"
                            />
                          </HoverTip>
                        ))}
                      </div>
                    </td>
                    <td className="p-3">
                      <HoverTip
                        label={
                          PROFILE_TOOLTIPS[build.buildType] ??
                          STAT_TOOLTIPS.profile
                        }
                      >
                        <span className="dpm-badge-accent cursor-help">
                          {build.buildType}
                        </span>
                      </HoverTip>
                    </td>
                    <td className="p-3 text-right font-bold">
                      <HoverTip
                        label={
                          build.fightDurationSeconds != null
                            ? `${STAT_TOOLTIPS.fightDuration} (~${build.fightDurationSeconds.toFixed(1)}s for this build)`
                            : STAT_TOOLTIPS.fightDuration
                        }
                      >
                        <span
                          className={`cursor-help border-b border-dotted ${dpsColors.text} ${dpsColors.border}`}
                        >
                          {build.totalDPS.toFixed(1)}
                        </span>
                      </HoverTip>
                    </td>
                    <td className="p-3 text-right text-dpm-muted">
                      {build.autoAttackDPS.toFixed(1)}
                    </td>
                    <td className="p-3 text-right text-dpm-muted">
                      {build.abilityDPS.toFixed(1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </WidgetCard>

      {/* DPS Breakdown Tooltip */}
      {hoveredBuild?.breakdown && (
        <div
          className="fixed z-50 dpm-widget shadow-[0_0_30px_rgba(121,137,236,0.15)] p-4 max-w-md"
          style={{
            left: Math.min(tooltipPosition.x, window.innerWidth - 420),
            top: Math.max(
              10,
              Math.min(tooltipPosition.y, window.innerHeight - 300),
            ),
          }}
        >
          <div className="text-sm font-bold text-dpm-accent mb-2 border-b border-white/10 pb-2">
            {hoveredBuild.champion} - DPS Breakdown
          </div>
          <div className="space-y-1 text-xs font-mono">
            {hoveredBuild.breakdown.map((line) => (
              <div key={line} className={breakdownLineColorClass(line)}>
                {line}
              </div>
            ))}
          </div>
          <div className="mt-3 pt-2 border-t border-white/10 text-xs text-dpm-muted">
            Total:{" "}
            <span
              className={`font-bold ${dpsColorForBuild(hoveredBuild).text}`}
            >
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
  const [activeTab, setActiveTab] = useState<"finder" | "random" | "meta">(
    "finder",
  );
  const [showDevTabs, setShowDevTabs] = useState(false);

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

  const devTabs = [
    { id: "finder", label: "1v1 Finder" },
    { id: "random", label: "Random" },
    { id: "meta", label: "Meta" },
  ];

  return (
    <AppShell
      headerTabs={
        showDevTabs ? (
          <TabNav
            tabs={devTabs}
            activeTab={activeTab}
            onTabChange={(id) =>
              setActiveTab(id as "finder" | "random" | "meta")
            }
          />
        ) : undefined
      }
    >
      {!showDevTabs || activeTab === "finder" ? (
        <BuildFinder />
      ) : activeTab === "random" ? (
        <RandomBuildGenerator />
      ) : (
        <MetaAnalysis />
      )}
    </AppShell>
  );
}
