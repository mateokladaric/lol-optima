/**
 * Generates src/lib/championWikiPassOverrides.ts from batch definitions.
 * Run: node scripts/gen-wiki-pass-overrides.mjs
 */
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** @type {Record<string, Record<string, unknown>>} */
const BATCHES = {
  batch4_adc: {
    Kalista: {
      autoAttackDamageMultiplier: 0.9,
      bonusAttackSpeedScale: 0.75,
      abilityCooldownMultiplier: { E: 0.85 },
    },
    Jhin: {
      passiveCritDamageBonusScale: 0.75,
      averagePassiveCritChancePercent: 25,
      ammoCycleDamageMultiplier: 1.12,
    },
    KaiSa: {
      sustainedBonusAttackSpeedPercent: 45,
      abilityCooldownMultiplier: { E: 0.72 },
    },
    Varus: {
      sustainedBonusAttackSpeedPercent: 12,
      explosiveChargeStackMultiplier: 2.2,
    },
    KogMaw: {
      sustainedBonusAttackSpeedPercent: 20,
      passiveArmorPenPercent: 22,
    },
    Twitch: {
      sustainedBonusAttackSpeedPercent: 35,
      stackDotBasePerSecond: 4,
      stackDotAPRatioPerSecond: 3,
      averageDotStacks: 4,
      stackDotDamageType: "true",
    },
    Ashe: {
      passiveCritDamageBonusScale: 1.35,
      sustainedBonusAttackSpeedPercent: 22,
    },
    Jinx: { sustainedBonusAttackSpeedPercent: 65 },
    Vayne: { everyNthHitTrueMaxHPPercent: 12, everyNthHit: 3 },
    Aphelios: {
      ammoCycleDamageMultiplier: 1.2,
      sustainedBonusAttackSpeedPercent: 15,
    },
    Zeri: { autoAttackDamageMultiplier: 0.15, sustainedBonusAttackSpeedPercent: 10 },
    Xayah: {
      postAbilityEmpoweredAutoAdPercent: 45,
      postAbilityEmpoweredUptime: 0.35,
      sustainedBonusAttackSpeedPercent: 42,
      abilityHitMultipliers: { Bladecaller: 2.5 },
    },
    Nilah: {
      passiveArmorPenPercent: 15,
      sustainedBonusAttackSpeedPercent: 25,
      abilityCooldownMultiplier: { Q: 0.55 },
    },
    Caitlyn: {},
  },
  batch5_dot: {
    Teemo: {
      stackDotBasePerSecond: 12,
      stackDotAPRatioPerSecond: 10,
      averageDotStacks: 1,
    },
    Singed: { toggleDotUptime: 0.85 },
    Cassiopeia: { ablazeAbilityDamageAmp: 1.35 },
    Lillia: {
      blazeDotPerStackMaxHPPercent: 1,
      averageBlazeStacks: 2,
    },
    Swain: { abilityHitMultipliers: { "Vision of Empire": 1.85 } },
    Karthus: { isolatedDamageMultiplier: 1.65 },
    Annie: {},
    VelKoz: {
      everyNthHitTrueMaxHPPercent: 8,
      everyNthHit: 3,
      abilityHitMultipliers: { "Life Form Disintegration Ray": 1.4 },
    },
  },
  batch6_stack: {
    ChoGath: { everyNthHitTrueMaxHPPercent: 4, everyNthHit: 3 },
    Veigar: {},
    Senna: { sustainedBonusAttackSpeedPercent: 8 },
    Thresh: { abilityHitMultipliers: { "Death Sentence": 1.5 } },
    Sion: { ultimateBonusHP: 400, ultimateBonusHPUptime: 0.25 },
    Diana: { sustainedBonusAttackSpeedPercent: 18 },
    Ekko: { everyNthHitTrueMaxHPPercent: 6, everyNthHit: 3, assumeComboKill: false },
  },
  batch7_form: {
    Jayce: { sustainedBonusAttackSpeedPercent: 12 },
    Elise: { sustainedBonusAttackSpeedPercent: 15 },
    Nidalee: { assumeComboKill: true, isolatedDamageMultiplier: 1.5 },
    Shyvana: {
      sustainedBonusAttackSpeedPercent: 18,
      blazeDotPerStackMaxHPPercent: 1.5,
      averageBlazeStacks: 1,
    },
    Udyr: { sustainedBonusAttackSpeedPercent: 20 },
  },
  batch8_bruiser: {
    Aatrox: { missingHPBonusADMax: 20, sustainedBonusAttackSpeedPercent: 15 },
    Camille: { everyNthHitTrueMaxHPPercent: 4, everyNthHit: 2 },
    Garen: { sustainedBonusAttackSpeedPercent: 10 },
    Renekton: { sustainedBonusAttackSpeedPercent: 12 },
    Riven: { sustainedBonusAttackSpeedPercent: 18 },
    Pantheon: { sustainedBonusAttackSpeedPercent: 14 },
    Olaf: { missingHPBonusADMax: 25, sustainedBonusAttackSpeedPercent: 20 },
    Wukong: { sustainedBonusAttackSpeedPercent: 22 },
    XinZhao: { sustainedBonusAttackSpeedPercent: 16 },
    Illaoi: { abilityHitMultipliers: { "Harsh Lesson": 1.8 } },
  },
  batch9_assassin: {
    Akshan: { sustainedBonusAttackSpeedPercent: 25 },
    Fizz: { sustainedBonusAttackSpeedPercent: 12 },
    Kassadin: { sustainedBonusAttackSpeedPercent: 8 },
    Katarina: { assumeComboKill: true },
    Pyke: { assumeComboKill: true, missingHPBonusADMax: 18 },
    Qiyana: { assumeComboKill: true },
    Rengar: { sustainedBonusAttackSpeedPercent: 20, passiveArmorPenPercent: 12 },
    Sylas: { sustainedBonusAttackSpeedPercent: 10 },
    Taliyah: { sustainedBonusAttackSpeedPercent: 8 },
  },
  batch10_mage: {
    Ahri: { sustainedBonusAttackSpeedPercent: 0 },
    Anivia: { sustainedBonusAttackSpeedPercent: 0 },
    AurelionSol: { sustainedBonusAttackSpeedPercent: 0 },
    Azir: { sustainedBonusAttackSpeedPercent: 5 },
    Hwei: { sustainedBonusAttackSpeedPercent: 0 },
    Lux: { sustainedBonusAttackSpeedPercent: 0 },
    Orianna: { sustainedBonusAttackSpeedPercent: 0 },
    Syndra: { sustainedBonusAttackSpeedPercent: 0 },
    Viktor: { sustainedBonusAttackSpeedPercent: 0 },
    Xerath: { sustainedBonusAttackSpeedPercent: 0 },
    Zoe: { sustainedBonusAttackSpeedPercent: 0 },
    Ryze: { sustainedBonusAttackSpeedPercent: 5 },
  },
  batch11_tank: {
    Alistar: {},
    Braum: {},
    Leona: {},
    Nautilus: {},
    Ornn: { sustainedBonusAttackSpeedPercent: 5 },
    Poppy: {},
    Rammus: {},
    Sejuani: {},
    Taric: {},
    Maokai: {},
    Malphite: {},
    Amumu: {},
    Blitzcrank: {},
  },
  batch12_misc: {
    Ambessa: { sustainedBonusAttackSpeedPercent: 18 },
    Aurora: { sustainedBonusAttackSpeedPercent: 10 },
    Bard: { sustainedBonusAttackSpeedPercent: 12 },
    Briar: { sustainedBonusAttackSpeedPercent: 35 },
    DrMundo: { missingHPBonusADMax: 20 },
    Evelynn: { assumeComboKill: true },
    Fiddlesticks: {},
    Galio: {},
    Gragas: {},
    Hecarim: { sustainedBonusAttackSpeedPercent: 15 },
    Heimerdinger: {},
    Ivern: {},
    Janna: {},
    Karma: {},
    Kennen: { sustainedBonusAttackSpeedPercent: 12 },
    Kindred: { sustainedBonusAttackSpeedPercent: 25 },
    Kled: { sustainedBonusAttackSpeedPercent: 20 },
    LeeSin: { assumeComboKill: true },
    Lissandra: {},
    Lulu: {},
    MasterYi: { sustainedBonusAttackSpeedPercent: 30 },
    Mel: {},
    Milio: {},
    Mordekaiser: { sustainedBonusAttackSpeedPercent: 8 },
    Morgana: {},
    Naafiri: { assumeComboKill: true },
    Nami: {},
    Neeko: {},
    Nunu: {},
    Nocturne: { sustainedBonusAttackSpeedPercent: 22 },
    Quinn: { sustainedBonusAttackSpeedPercent: 25 },
    RekSai: { sustainedBonusAttackSpeedPercent: 12 },
    Rell: {},
    Renata: {},
    Rumble: { blazeDotPerStackMaxHPPercent: 1.2, averageBlazeStacks: 1 },
    Senna: { sustainedBonusAttackSpeedPercent: 8 },
    Seraphine: {},
    Sett: { missingHPBonusADMax: 22 },
    Shaco: { assumeComboKill: true },
    Shen: {},
    Sion: { ultimateBonusHP: 400, ultimateBonusHPUptime: 0.25 },
    Skarner: {},
    Sona: {},
    Soraka: {},
    Swain: { abilityHitMultipliers: { "Vision of Empire": 1.85 } },
    TahmKench: {},
    Trundle: { sustainedBonusAttackSpeedPercent: 12 },
    TwistedFate: { sustainedBonusAttackSpeedPercent: 18 },
    Urgot: { sustainedBonusAttackSpeedPercent: 10 },
    Vi: { sustainedBonusAttackSpeedPercent: 12 },
    Vladimir: { sustainedBonusAttackSpeedPercent: 5 },
    Volibear: { sustainedBonusAttackSpeedPercent: 14 },
    Warwick: { sustainedBonusAttackSpeedPercent: 25 },
    Yorick: { sustainedBonusAttackSpeedPercent: 8 },
    Yuumi: {},
    Zaahen: { sustainedBonusAttackSpeedPercent: 15 },
    Zac: {},
    Ziggs: {},
    Zilean: {},
    Zyra: { blazeDotPerStackMaxHPPercent: 0.8, averageBlazeStacks: 2 },
    Fiora: {},
    ChoGath: { everyNthHitTrueMaxHPPercent: 4, everyNthHit: 3 },
    Vex: {},
    Yorick: { sustainedBonusAttackSpeedPercent: 8 },
  },
};

const merged = {};
for (const batch of Object.values(BATCHES)) {
  Object.assign(merged, batch);
}

function fmtKey(k) {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k) ? k : JSON.stringify(k);
}

function fmtValue(v, indent) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return JSON.stringify(v);
  const inner = Object.entries(v)
    .map(
      ([k, val]) =>
        `${indent}  ${fmtKey(k)}: ${fmtValue(val, indent + "  ")},`,
    )
    .join("\n");
  return `{\n${inner}\n${indent}}`;
}

const lines = Object.entries(merged)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([k, v]) => {
    if (Object.keys(v).length === 0) return `  ${k}: {},`;
    return `  ${k}: ${fmtValue(v, "  ")},`;
  });

const out = `/**
 * Wiki Details → sim overrides for champions beyond the core interaction table.
 * Generated by scripts/gen-wiki-pass-overrides.mjs — edit the script and re-run to bulk-update.
 */
import type { ChampionInteractionProfile } from "./abilityInteractions";

export const CHAMPION_WIKI_PASS_OVERRIDES: Record<
  string,
  Partial<ChampionInteractionProfile>
> = {
${lines.join("\n")}
};
`;

writeFileSync(join(root, "src/lib/championWikiPassOverrides.ts"), out);
console.log("Wrote", Object.keys(merged).length, "overrides");
