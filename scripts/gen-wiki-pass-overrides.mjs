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
  batch13_gap: {
    Akali: { abilityCooldownMultiplier: { Q: 0.62, E: 0.88 } },
    Malzahar: {
      abilityHitMultipliers: { "Malefic Visions": 1.15, "Void Swarm": 2.2 },
      globalAbilityCooldownMultiplier: 0.92,
    },
    Zed: { assumeComboKill: true, sustainedBonusAttackSpeedPercent: 12 },
    Smolder: {
      blazeDotPerStackMaxHPPercent: 0.65,
      averageBlazeStacks: 1,
      ablazeAbilityDamageAmp: 1.15,
      sustainedBonusAttackSpeedPercent: 18,
    },
    Yunara: {
      sustainedBonusAttackSpeedPercent: 35,
      postAbilityEmpoweredAutoAdPercent: 25,
      postAbilityEmpoweredUptime: 0.45,
    },
    KaynRhaast: {
      missingHPBonusADMax: 18,
      abilityHitMultipliers: { "Reaping Slash": 1.35, "Umbral Trespass": 1.35 },
    },
    KaynShadowAssassin: {
      assumeComboKill: true,
      isolatedDamageMultiplier: 1.55,
      abilityHitMultipliers: { "Reaping Slash": 1.25 },
    },
    JarvanIV: { abilityHitMultipliers: { Cataclysm: 1.15 } },
    KSante: { missingHPBonusADMax: 22, abilityHitMultipliers: { "All Out": 1.3 } },
    LeBlanc: { assumeComboKill: true, abilityHitMultipliers: { Mimic: 1.75 } },
    Rakan: { abilityHitMultipliers: { "Grand Entrance": 1.2 } },
    Sivir: {
      sustainedBonusAttackSpeedPercent: 45,
      abilityHitMultipliers: { Ricochet: 1.55 },
    },
    Talon: { assumeComboKill: true, passiveArmorPenPercent: 18 },
  },
};

/** Second-pass mechanics from sim.ts Details — merged over batch defaults. */
const DEEPEN = {
  Aatrox: {
    missingHPBonusADMax: 20,
    abilityCooldownMultiplier: { Q: 0.88, E: 0.75 },
  },
  Akshan: { autoAttackDamageMultiplier: 1.48, abilityHitMultipliers: { Avengerang: 1.85 } },
  Ambessa: {
    sustainedBonusAttackSpeedPercent: 18,
    abilityHitMultipliers: { "Public Execution": 1.35 },
  },
  Anivia: { ablazeAbilityDamageAmp: 2, abilityCooldownMultiplier: { R: 0.72 } },
  Aphelios: {
    ammoCycleDamageMultiplier: 1.25,
    sustainedBonusAttackSpeedPercent: 15,
    abilityHitMultipliers: { Moonshot: 1.1, "Infernum Chains": 1.15 },
  },
  Ashe: {
    passiveCritDamageBonusScale: 1.35,
    sustainedBonusAttackSpeedPercent: 22,
    abilityHitMultipliers: { "Ranger's Focus": 4.2 },
  },
  AurelionSol: {
    stackDotBasePerSecond: 8,
    stackDotAPRatioPerSecond: 2.5,
    averageDotStacks: 3,
  },
  Aurora: { abilityHitMultipliers: { "Across the Veil": 1.2 } },
  Azir: { abilityHitMultipliers: { "Arise!": 1.35, "Conquering Sands": 1.1 } },
  Bard: { abilityHitMultipliers: { "Cosmic Binding": 1.15 } },
  Briar: { autoAttackDamageMultiplier: 0.92, missingHPBonusADMax: 18 },
  Camille: { everyNthHitTrueMaxHPPercent: 4, everyNthHit: 2 },
  Cassiopeia: {
    ablazeAbilityDamageAmp: 1.35,
    abilityCooldownMultiplier: { E: 0.55 },
  },
  ChoGath: { everyNthHitTrueMaxHPPercent: 4, everyNthHit: 3 },
  Diana: { sustainedBonusAttackSpeedPercent: 18 },
  DrMundo: { missingHPBonusADMax: 20 },
  Ekko: { everyNthHitTrueMaxHPPercent: 6, everyNthHit: 3 },
  Elise: { sustainedBonusAttackSpeedPercent: 15, abilityCooldownMultiplier: { Q: 0.85 } },
  Evelynn: { assumeComboKill: true, isolatedDamageMultiplier: 1.8 },
  Fizz: { abilityCooldownMultiplier: { E: 0.7 }, sustainedBonusAttackSpeedPercent: 12 },
  Garen: {
    sustainedBonusAttackSpeedPercent: 10,
    abilityHitMultipliers: { Judgment: 1.15 },
  },
  Hecarim: {
    sustainedBonusAttackSpeedPercent: 15,
    abilityHitMultipliers: { "Devastating Charge": 1.45 },
  },
  Hwei: { abilityHitMultipliers: { "Subject: Disaster": 1.25 } },
  Illaoi: { abilityHitMultipliers: { "Harsh Lesson": 1.8, "Test of Spirit": 1.2 } },
  Jayce: {
    sustainedBonusAttackSpeedPercent: 12,
    ammoCycleDamageMultiplier: 1.45,
    abilityHitMultipliers: { "To the Skies! / Shock Blast": 1.2 },
  },
  Jhin: {
    passiveCritDamageBonusScale: 0.75,
    averagePassiveCritChancePercent: 25,
    ammoCycleDamageMultiplier: 1.12,
  },
  Jinx: {
    sustainedBonusAttackSpeedPercent: 55,
    autoAttackDamageMultiplier: 1.08,
  },
  KaiSa: {
    sustainedBonusAttackSpeedPercent: 45,
    abilityCooldownMultiplier: { E: 0.72, Q: 0.88 },
  },
  Kalista: {
    autoAttackDamageMultiplier: 0.9,
    bonusAttackSpeedScale: 0.75,
    abilityCooldownMultiplier: { E: 0.85 },
  },
  Karthus: { isolatedDamageMultiplier: 1.65, abilityCooldownMultiplier: { E: 0.65 } },
  Kassadin: {
    sustainedBonusAttackSpeedPercent: 8,
    globalAbilityCooldownMultiplier: 0.88,
  },
  Katarina: { assumeComboKill: true, abilityCooldownMultiplier: { Q: 0.82, E: 0.75 } },
  Kennen: { sustainedBonusAttackSpeedPercent: 12, abilityHitMultipliers: { "Slicing Maelstrom": 1.2 } },
  Kindred: { sustainedBonusAttackSpeedPercent: 25, isolatedDamageMultiplier: 1.45 },
  Kled: { sustainedBonusAttackSpeedPercent: 20, missingHPBonusADMax: 15 },
  KogMaw: { sustainedBonusAttackSpeedPercent: 20, passiveArmorPenPercent: 22 },
  LeeSin: { assumeComboKill: true, abilityHitMultipliers: { "Dragon's Rage": 1.3 } },
  Lillia: { blazeDotPerStackMaxHPPercent: 1, averageBlazeStacks: 2.5 },
  Lux: { abilityHitMultipliers: { "Final Spark": 1.15 } },
  MasterYi: { sustainedBonusAttackSpeedPercent: 30, autoAttackDamageMultiplier: 1.22 },
  Mordekaiser: {
    sustainedBonusAttackSpeedPercent: 8,
    everyNthHitTrueMaxHPPercent: 3,
    everyNthHit: 3,
  },
  Naafiri: { assumeComboKill: true, abilityHitMultipliers: { "The Call of the Pack": 1.25 } },
  Nidalee: { assumeComboKill: true, isolatedDamageMultiplier: 1.55 },
  Nilah: {
    passiveArmorPenPercent: 15,
    sustainedBonusAttackSpeedPercent: 25,
    abilityCooldownMultiplier: { Q: 0.55 },
  },
  Nocturne: { sustainedBonusAttackSpeedPercent: 22 },
  Olaf: { missingHPBonusADMax: 25, sustainedBonusAttackSpeedPercent: 20 },
  Orianna: { abilityHitMultipliers: { "Command: Shockwave": 1.2 } },
  Ornn: { sustainedBonusAttackSpeedPercent: 5, abilityHitMultipliers: { "Call of the Forge God": 1.15 } },
  Pantheon: {
    sustainedBonusAttackSpeedPercent: 14,
    abilityHitMultipliers: { "Comet Spear": 1.2, "Shield Vault": 1.15 },
  },
  Pyke: { assumeComboKill: true, missingHPBonusADMax: 18 },
  Qiyana: { assumeComboKill: true, abilityHitMultipliers: { "Supreme Display of Talent": 1.25 } },
  Quinn: {
    sustainedBonusAttackSpeedPercent: 25,
    postAbilityEmpoweredAutoAdPercent: 35,
    postAbilityEmpoweredUptime: 0.28,
  },
  RekSai: { sustainedBonusAttackSpeedPercent: 12, abilityHitMultipliers: { "Queen's Wrath": 1.35 } },
  Renekton: {
    sustainedBonusAttackSpeedPercent: 12,
    abilityHitMultipliers: { "Cull the Meek": 1.3, "Ruthless Predator": 1.25 },
  },
  Rengar: { sustainedBonusAttackSpeedPercent: 20, passiveArmorPenPercent: 12 },
  Riven: {
    sustainedBonusAttackSpeedPercent: 18,
    postAbilityDoubleHitUptime: 0.52,
  },
  Rumble: { blazeDotPerStackMaxHPPercent: 1.2, averageBlazeStacks: 1.2 },
  Ryze: { sustainedBonusAttackSpeedPercent: 5, globalAbilityCooldownMultiplier: 0.86 },
  Senna: { sustainedBonusAttackSpeedPercent: 8, passiveCritChanceMultiplier: 1.08 },
  Sett: { missingHPBonusADMax: 22, abilityHitMultipliers: { "The Show Stopper": 1.2 } },
  Shaco: { assumeComboKill: true, abilityHitMultipliers: { "Deceive": 1.35 } },
  Shyvana: {
    sustainedBonusAttackSpeedPercent: 18,
    blazeDotPerStackMaxHPPercent: 1.5,
    averageBlazeStacks: 1,
  },
  Singed: { toggleDotUptime: 0.85 },
  Sion: { ultimateBonusHP: 400, ultimateBonusHPUptime: 0.25 },
  Swain: { abilityHitMultipliers: { "Vision of Empire": 1.85, "Nevermove": 1.15 } },
  Sylas: {
    sustainedBonusAttackSpeedPercent: 10,
    postAbilityDoubleHitUptime: 0.38,
  },
  Syndra: { abilityHitMultipliers: { "Unleashed Power": 1.2, "Force of Will": 1.15 } },
  Taliyah: { sustainedBonusAttackSpeedPercent: 8, ammoCycleDamageMultiplier: 1.55 },
  Teemo: {
    stackDotBasePerSecond: 12,
    stackDotAPRatioPerSecond: 10,
    averageDotStacks: 1,
  },
  Thresh: { abilityHitMultipliers: { "Death Sentence": 1.5 } },
  Trundle: { sustainedBonusAttackSpeedPercent: 12, missingHPBonusADMax: 12 },
  TwistedFate: { sustainedBonusAttackSpeedPercent: 18, abilityHitMultipliers: { "Pick a Card": 1.2 } },
  Twitch: {
    sustainedBonusAttackSpeedPercent: 35,
    stackDotBasePerSecond: 4,
    stackDotAPRatioPerSecond: 3,
    averageDotStacks: 4,
    stackDotDamageType: "true",
  },
  Udyr: { sustainedBonusAttackSpeedPercent: 20, blazeDotPerStackMaxHPPercent: 0.8, averageBlazeStacks: 1 },
  Urgot: {
    sustainedBonusAttackSpeedPercent: 10,
    abilityHitMultipliers: { "Fear Beyond Death": 1.4 },
    missingHPBonusADMax: 10,
  },
  Varus: {
    sustainedBonusAttackSpeedPercent: 12,
    blightDetonationAvgStacks: 3,
    blightDetonationMaxHPPercentPerStack: 4,
  },
  Vayne: { everyNthHitTrueMaxHPPercent: 12, everyNthHit: 3 },
  VelKoz: {
    everyNthHitTrueMaxHPPercent: 8,
    everyNthHit: 3,
    abilityHitMultipliers: { "Life Form Disintegration Ray": 1.4 },
  },
  Vi: { sustainedBonusAttackSpeedPercent: 12, abilityHitMultipliers: { "Cease and Desist": 1.15 } },
  Viktor: { sustainedBonusAttackSpeedPercent: 0, abilityHitMultipliers: { "Chaos Storm": 1.35 } },
  Vladimir: { sustainedBonusAttackSpeedPercent: 5, missingHPBonusADMax: 8 },
  Volibear: { sustainedBonusAttackSpeedPercent: 14, everyNthHitTrueMaxHPPercent: 5, everyNthHit: 2 },
  Warwick: { sustainedBonusAttackSpeedPercent: 25, missingHPBonusADMax: 12 },
  Wukong: { sustainedBonusAttackSpeedPercent: 22, abilityHitMultipliers: { "Cyclone": 1.25 } },
  Xayah: {
    postAbilityEmpoweredAutoAdPercent: 45,
    postAbilityEmpoweredUptime: 0.35,
    sustainedBonusAttackSpeedPercent: 42,
    abilityHitMultipliers: { Bladecaller: 2.5 },
  },
  XinZhao: { sustainedBonusAttackSpeedPercent: 16 },
  Yorick: { sustainedBonusAttackSpeedPercent: 8, abilityHitMultipliers: { "Last Rites": 1.2 } },
  Zaahen: { sustainedBonusAttackSpeedPercent: 15, abilityHitMultipliers: { "Grim Deliverance": 1.2 } },
  Zeri: { autoAttackDamageMultiplier: 0.12, sustainedBonusAttackSpeedPercent: 10 },
  Zyra: { blazeDotPerStackMaxHPPercent: 0.8, averageBlazeStacks: 2 },
  Akali: { sustainedBonusAttackSpeedPercent: 15 },
  Caitlyn: { sustainedBonusAttackSpeedPercent: 18 },
  Fiora: { sustainedBonusAttackSpeedPercent: 20, abilityHitMultipliers: { Lunge: 1.15 } },
  Gangplank: {
    abilityCooldownMultiplier: { Q: 0.88 },
    abilityHitMultipliers: { "Powder Keg": 1.75 },
  },
  Jax: { postAbilityDoubleHitUptime: 0.38, sustainedBonusAttackSpeedPercent: 22 },
  JarvanIV: { abilityHitMultipliers: { Cataclysm: 1.15, "Demacian Standard": 1.1 } },
  KSante: { missingHPBonusADMax: 22, abilityHitMultipliers: { "All Out": 1.3 } },
  KaynRhaast: {
    missingHPBonusADMax: 18,
    abilityHitMultipliers: { "Reaping Slash": 1.35, "Umbral Trespass": 1.35 },
  },
  KaynShadowAssassin: {
    assumeComboKill: true,
    isolatedDamageMultiplier: 1.55,
    abilityHitMultipliers: { "Reaping Slash": 1.25 },
  },
  LeBlanc: { assumeComboKill: true, abilityHitMultipliers: { Mimic: 1.75, "Sigil of Malice": 1.2 } },
  Malzahar: {
    abilityHitMultipliers: { "Malefic Visions": 1.15, "Void Swarm": 2.2 },
    globalAbilityCooldownMultiplier: 0.92,
  },
  Rakan: { abilityHitMultipliers: { "Grand Entrance": 1.2, "Battle Dance": 1.15 } },
  Sivir: {
    sustainedBonusAttackSpeedPercent: 45,
    abilityHitMultipliers: { Ricochet: 1.55 },
  },
  Smolder: {
    blazeDotPerStackMaxHPPercent: 0.65,
    averageBlazeStacks: 1,
    ablazeAbilityDamageAmp: 1.15,
    sustainedBonusAttackSpeedPercent: 18,
  },
  Talon: { assumeComboKill: true, passiveArmorPenPercent: 18 },
  Veigar: { abilityHitMultipliers: { "Primordial Burst": 1.2 } },
  Yunara: {
    sustainedBonusAttackSpeedPercent: 35,
    postAbilityEmpoweredAutoAdPercent: 25,
    postAbilityEmpoweredUptime: 0.45,
    abilityHitMultipliers: { "Transcend One's Self": 1.25 },
  },
  Zed: { assumeComboKill: true, everyNthHitTrueMaxHPPercent: 8, everyNthHit: 4 },
};

const merged = {};
for (const batch of Object.values(BATCHES)) {
  Object.assign(merged, batch);
}
for (const [key, deep] of Object.entries(DEEPEN)) {
  merged[key] = { ...(merged[key] ?? {}), ...deep };
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
