/**
 * Curated LoL Wiki "Notes" sections per item group.
 * Keys match Item.getMechanicsGroup() (defaults to groupName).
 */

import type { Item } from "@/app/actions/sim";

export type ItemWikiSimStatus =
  | "modeled"
  | "static"
  | "partial"
  | "gap"
  | "support";

export type ItemWikiEntry = {
  notes: string[];
  wikiUrl: string;
  wikiGaps?: string[];
  simStatus: ItemWikiSimStatus;
};

const WIKI_BASE = "https://wiki.leagueoflegends.com/en-us";

function wikiUrl(page: string): string {
  return `${WIKI_BASE}/${page.replace(/ /g, "_").replace(/'/g, "%27")}`;
}

function entry(
  page: string,
  notes: string[],
  simStatus: ItemWikiSimStatus,
  wikiGaps?: string[],
): ItemWikiEntry {
  return { wikiUrl: wikiUrl(page), notes, simStatus, wikiGaps };
}

/** Shared energized pool notes (Statikk Shiv, Stormrazor, RFC, Voltaic). */
const ENERGIZED_SHARED_NOTES = [
  "Each basic attack on-attack generates 6 Energize stacks while 1 is generated for every 24 in-game units traveled.",
  "Hitting abilities that apply on-hit effects will also generate 6 stacks.",
  "Energized effects stack with other sources and apply on-hit damage to structures.",
];

export const ITEM_WIKI_NOTES: Record<string, ItemWikiEntry> = {
  // --- Modeled (itemMechanics.ts) ---
  "Kraken Slayer": entry(
    "Kraken_Slayer",
    [
      "Bring It Down triggers every third basic attack on-attack.",
      "Bonus physical damage scales with target missing health.",
      "Proc applies as on-attack damage.",
    ],
    "modeled",
    ["Cleave to secondary targets not modeled in 1v1"],
  ),
  Stormrazor: entry(
    "Stormrazor",
    [
      ...ENERGIZED_SHARED_NOTES,
      "Bolt: +6 Energize stacks per basic attack.",
      "Energized attack deals 100 bonus magic damage on-hit.",
    ],
    "modeled",
  ),
  Hubris: entry(
    "Hubris",
    [
      "Eminence: takedown grants stacking AD for a duration.",
      "Stacks persist through death until duration ends.",
    ],
    "modeled",
    ["Exact stack decay on assist vs kill simplified in sim"],
  ),
  Terminus: entry(
    "Terminus",
    [
      "Juxtaposition: alternate attacks grant stacks of armor pen and on-hit magic damage.",
      "Stacks cap at 30.",
    ],
    "modeled",
  ),
  Blight: entry(
    "Bloodletter%27s_Curse",
    [
      "Blight: ability hits apply stacks reducing MR.",
      "Shred scales with stacks consumed.",
    ],
    "modeled",
  ),
  "Blackfire Torch": entry(
    "Blackfire_Torch",
    [
      "Blight: ability hits apply burn stacks.",
      "Burn deals magic damage over time; stacks increase damage.",
    ],
    "modeled",
  ),
  Malignance: entry(
    "Malignance",
    [
      "Hatefog: ability hits burn enemies and shred MR.",
      "Burn refreshes on ability hit.",
    ],
    "modeled",
  ),
  "Horizon Focus": entry(
    "Horizon_Focus",
    [
      "Hypershot: damaging champions from 600+ units away amplifies damage by 10%.",
      "Applies to abilities and attacks that proc spell effects.",
    ],
    "modeled",
    ["Distance threshold modeled as body-type uptime estimate"],
  ),
  "Axiom Arc": entry(
    "Axiom_Arc",
    [
      "Flux: champion takedown refunds ultimate cooldown.",
      "Refund scales with bonus lethality.",
    ],
    "modeled",
  ),
  "Black Cleaver": entry(
    "Black_Cleaver",
    [
      "Carve: physical damage from champion applies stacks reducing armor.",
      "Max 5 stacks, 6% armor reduction per stack.",
      "Fervor: at max stacks grants bonus movement speed.",
    ],
    "modeled",
  ),
  "Overlord's Bloodmail": entry(
    "Overlord%27s_Bloodmail",
    [
      "Retribution: gain bonus AD based on wearer's missing health.",
      "Scales up to 12% increased AD.",
    ],
    "modeled",
  ),
  "Guinsoo's Rageblade": entry(
    "Guinsoo%27s_Rageblade",
    [
      "Wrath: basic attacks grant stacking attack speed.",
      "Every third attack deals bonus magic on-hit damage.",
    ],
    "modeled",
  ),
  Eclipse: entry(
    "Eclipse",
    [
      "Ever Rising Moon: two separate attacks or abilities within 2s trigger proc.",
      "Once every 6 seconds: shield and bonus max HP physical damage.",
      "Shield and damage are separate instances.",
    ],
    "modeled",
    ["Shield modeled as EHP only, not damage"],
  ),
  Stormsurge: entry(
    "Stormsurge",
    [
      "Squall: ability damage against high-HP targets deals bonus magic burst.",
      "Storm: movement speed after ability damage.",
    ],
    "modeled",
    ["MS not modeled in DPS sim"],
  ),
  "Luden's Echo": entry(
    "Luden%27s_Companion",
    [
      "Echo: ability damage triggers bonus magic damage.",
      "ICD between Echo procs.",
    ],
    "modeled",
  ),
  "Statikk Shiv": entry(
    "Statikk_Shiv",
    [
      ...ENERGIZED_SHARED_NOTES,
      "Electroshock: +9 Energize stacks per basic attack.",
      "Energized attack deals 60 bonus magic damage, can chain to additional targets.",
    ],
    "modeled",
    ["Chain lightning to extra targets not modeled in 1v1"],
  ),
  "Voltaic Cyclosword": entry(
    "Voltaic_Cyclosword",
    [
      ...ENERGIZED_SHARED_NOTES,
      "Galvanize: damaging enemy champions with abilities triggers Energized attacks if ready.",
      "Firmament: when fully Energized, next basic attack grants melee 15 / ranged 12 lethality for 4 seconds before dealing bonus physical damage equal to melee 9% / ranged 7% of target current health.",
      "Firmament deals proc damage and will not trigger spell effects.",
      "Firmament is not blocked by spell shield.",
      "Firmament's additional lethality is applied before its own damage.",
      "Firmament's damage is applied before the damage of the triggering attack or ability.",
      "Capped at 200 against non-champions.",
    ],
    "modeled",
    ["Structures, spell shield, non-champion cap — out of 1v1 scope"],
  ),
  "Rapid Firecannon": entry(
    "Rapid_Firecannon",
    [
      ...ENERGIZED_SHARED_NOTES,
      "Energized attack deals 40 bonus magic damage and increases attack range.",
    ],
    "modeled",
    ["Bonus range not modeled"],
  ),
  Riftmaker: entry(
    "Riftmaker",
    [
      "Void Corruption: combat stacks increase damage amp.",
      "Max stacks grant true damage conversion on damage dealt.",
    ],
    "modeled",
    ["True damage conversion approximated as amp"],
  ),
  "Spear of Shojin": entry(
    "Spear_of_Shojin",
    [
      "Focus: ability damage grants Focus stacks.",
      "Ultimate damage is increased based on Focus.",
    ],
    "modeled",
  ),
  "Hextech Rocketbelt": entry(
    "Hextech_Rocketbelt",
    [
      "Supersonic: active dash fires missiles dealing magic damage.",
      "Active has cooldown.",
    ],
    "modeled",
    ["Active modeled as combo-window burst"],
  ),
  "Hextech Gunblade": entry(
    "Hextech_Gunblade",
    [
      "Lightning Bolt: active deals magic damage and slows.",
    ],
    "modeled",
    ["Active modeled as combo-window burst"],
  ),
  Eternity: entry(
    "Fimbulwinter",
    [
      "Eternity: mana restores health when taking damage; spending mana restores health on cast.",
    ],
    "modeled",
    ["Sustain modeled as average HPS"],
  ),
  Immolate: entry(
    "Sunfire_Aegis",
    [
      "Immolate: nearby enemies take magic damage per second.",
      "Damage scales with bonus HP.",
    ],
    "modeled",
    ["AoE aura — single target in 1v1"],
  ),
  Momentum: entry(
    "Dead_Man%27s_Plate",
    [
      "Momentum: movement generates stacks up to 100.",
      "Full momentum empowers next basic attack with bonus physical on-hit.",
    ],
    "modeled",
    ["Momentum at 50% average in sim"],
  ),
  "Yun Tal Wildarrows": entry(
    "Yun_Tal_Wildarrows",
    [
      "Flurry: critical strikes grant stacking attack speed.",
      "On-attack bonus physical damage at max stacks.",
    ],
    "modeled",
  ),
  "Sundered Sky": entry(
    "Sundered_Sky",
    [
      "Lightshield Strike: critical strikes against champions heal the wearer.",
      "Heal scales with critical strike damage.",
    ],
    "modeled",
    ["Heal not counted in DPS"],
  ),
  Bastionbreaker: entry(
    "Bastionbreaker",
    [
      "Shaped Charge: every 45 seconds next ability hit deals bonus true damage.",
      "True damage scales with lethality.",
    ],
    "modeled",
  ),
  "Liandry's Torment": entry(
    "Liandry%27s_Torment",
    [
      "Torment: ability damage burns target for % max HP magic damage per second.",
      "Burn lasts 3 seconds and refreshes on ability hit.",
    ],
    "modeled",
  ),
  "Serpent's Fang": entry(
    "Serpent%27s_Fang",
    [
      "Shield Reaver: damaging champions reduces their shield effectiveness.",
      "Melee 50% / ranged 35% shield reduction.",
    ],
    "modeled",
    ["Shield shred affects EHP calc, not direct DPS"],
  ),

  // --- Static proc (sim_ok) ---
  "Blade of the Ruined King": entry(
    "Blade_of_the_Ruined_King",
    [
      "Mist's Edge: basic attacks deal bonus physical damage on-hit equal to % current health.",
      "Clawing Shadows: basic attacks apply stacking slow.",
    ],
    "static",
    ["Slow not modeled", "On-hit applies from on-hit abilities at champion scale"],
  ),
  "The Collector": entry(
    "The_Collector",
    [
      "Death: execute champions below 5% health after damage.",
      "Taxes: champion kills grant bonus gold.",
    ],
    "static",
    ["Execute threshold not sequenced with pre-attack procs yet"],
  ),
  "Wit's End": entry(
    "Wit%27s_End",
    [
      "Fray: basic attacks deal bonus magic damage on-hit.",
      "Stacks magic resist per hit up to 5.",
    ],
    "static",
    ["MR shred on self not modeled for DPS"],
  ),
  "Nashor's Tooth": entry(
    "Nashor%27s_Tooth",
    [
      "Icathian Bite: basic attacks deal bonus magic damage on-hit scaling with AP.",
    ],
    "static",
    ["On-hit from abilities at champion interaction scale"],
  ),
  Manaflow: entry(
    "Manamune",
    [
      "Awe: bonus AD scales with max mana.",
      "Shock: ability hits deal bonus physical damage based on max mana.",
      "Shock can occur once every 1.5 seconds.",
    ],
    "static",
  ),
  Muramana: entry(
    "Muramana",
    [
      "Awe: bonus AD scales with max mana.",
      "Shock: ability hits deal bonus physical damage based on max mana.",
      "Shock can occur once every 1.5 seconds.",
    ],
    "static",
  ),
  Hydra: entry(
    "Titanic_Hydra",
    [
      "Cleave: basic attacks deal physical damage to nearby enemies.",
      "Titanic: basic attacks deal bonus physical on-hit based on max HP.",
    ],
    "partial",
    ["Cleave AoE suppressed in 1v1", "Structures bonus not modeled"],
  ),
  "Profane Hydra": entry(
    "Profane_Hydra",
    [
      "Cleave: basic attacks deal physical damage to nearby enemies.",
      "Heretical: bonus AD cleave damage.",
    ],
    "partial",
    ["Cleave AoE suppressed in 1v1"],
  ),
  "Infinity Edge": entry(
    "Infinity_Edge",
    [
      "Perfection: critical strike damage increased.",
      "Critical strikes grant bonus damage amp.",
    ],
    "static",
  ),
  "Youmuu's Ghostblade": entry(
    "Youmuu%27s_Ghostblade",
    [
      "Haunt: out-of-combat movement grants bonus movement speed.",
      "Wraith Step: active grants bonus movement speed and ghosting.",
    ],
    "static",
    ["MS/active not in DPS sim"],
  ),
  "Lord Dominik's Regards": entry(
    "Lord_Dominik%27s_Regards",
    [
      "Giant Slayer: bonus damage vs targets with more bonus health.",
      "35% armor penetration.",
    ],
    "static",
  ),
  "Serylda's Grudge": entry(
    "Serylda%27s_Grudge",
    [
      "Bitter Cold: damaging abilities slow enemies below 50% health.",
      "35% armor penetration.",
    ],
    "static",
    ["Slow not modeled"],
  ),
  "Mortal Reminder": entry(
    "Mortal_Reminder",
    [
      "Grievous Wounds: applies 40% healing reduction.",
      "35% armor penetration.",
    ],
    "static",
    ["Grievous not in 1v1 DPS"],
  ),
  "Last Whisper": entry(
    "Last_Whisper",
    ["18% armor penetration."],
    "static",
  ),
  "Navori Flickerblade": entry(
    "Navori_Flickerblade",
    [
      "Transcendence: critical strikes reduce basic ability cooldowns.",
      "Requires critical strike chance.",
    ],
    "static",
    ["CDR modeled via stats"],
  ),
  "Trinity Force": entry(
    "Trinity_Force",
    [
      "Spellblade: after using an ability, next attack deals bonus physical damage.",
      "Sheen items share a 1.5 second cooldown.",
    ],
    "static",
  ),
  Spellblade: entry(
    "Sheen",
    [
      "Spellblade: after using an ability, next attack deals bonus on-hit damage.",
      "Sheen items share a 1.5 second cooldown.",
    ],
    "static",
  ),
  "Void Staff": entry(
    "Void_Staff",
    ["40% magic penetration."],
    "static",
  ),
  "Void Pen": entry("Void_Staff", ["40% magic penetration."], "static"),
  Void_Pen: entry("Void_Staff", ["40% magic penetration."], "static"),
  Morellonomicon: entry(
    "Morellonomicon",
    ["Grievous Wounds on magic damage."],
    "static",
    ["Grievous not in DPS sim"],
  ),
  Shadowflame: entry(
    "Shadowflame",
    [
      "Hyperscale: magic damage critically strikes against high-health targets.",
      "15 flat magic penetration.",
    ],
    "static",
  ),
  "Cosmic Drive": entry(
    "Cosmic_Drive",
    ["Spelldance: ability damage grants stacking movement speed and ability haste."],
    "static",
    ["MS/AH ramp not fully modeled"],
  ),
  Dawncore: entry(
    "Dawncore",
    ["First Light: reduces enchanter heal/shield cooldowns."],
    "static",
    ["Enchanter item — no DPS"],
  ),
  Actualizer: entry(
    "Actualizer",
    ["Focus: ability damage grants stacking damage amp."],
    "static",
  ),
  Glory: entry(
    "Imperial_Mandate",
    ["Coordinated Charge: immobilizing an enemy empowers allies."],
    "support",
    ["Team buff — no solo DPS"],
  ),

  // --- Partial ---
  Heartsteel: entry(
    "Heartsteel",
    [
      "Colossal Consumption: immobilize or combat vs champions grants permanent HP.",
      "Bonus damage on-hit based on stacks.",
    ],
    "partial",
    ["Optimizer uses base HP row; stack variants excluded"],
  ),
  Mejai: entry(
    "Mejai%27s_Soulstealer",
    [
      "Glory: takedowns grant stacks of AP and movement speed.",
      "Lose stacks on death.",
    ],
    "partial",
    ["0-stack base row in pool (conservative)"],
  ),
  "Dead Man's Plate": entry(
    "Dead_Man%27s_Plate",
    [
      "Momentum: movement generates stacks.",
      "Full momentum empowers next basic attack.",
    ],
    "partial",
    ["Momentum on-hit at 50% avg via Momentum group"],
  ),
  "Endless Hunger": entry(
    "Endless_Hunger",
    [
      "Feast: champion takedown grants omnivamp.",
      "Omnivamp from item stats.",
    ],
    "partial",
    ["Feast omnivamp on kill only"],
  ),

  // --- Stat sticks / defensive (gap) ---
  "Abyssal Mask": entry(
    "Abyssal_Mask",
    ["Unmake: nearby enemies take increased magic damage."],
    "gap",
    ["Aura amp not modeled in 1v1"],
  ),
  Bloodthirster: entry(
    "Bloodthirster",
    [
      "Ichorshield: life steal can overheal into a shield.",
      "Critical strike chance and life steal.",
    ],
    "gap",
    ["Shield sustain not in DPS"],
  ),
  "Chempunk Chainsword": entry(
    "Chempunk_Chainsword",
    ["Hackshorn: physical damage applies Grievous Wounds."],
    "gap",
  ),
  "Death's Dance": entry(
    "Death%27s_Dance",
    [
      "Ignore Pain: damage taken is dealt over time.",
      "Defy: takedown cleanses bleed and heals.",
    ],
    "gap",
    ["Damage reduction not in DPS sim"],
  ),
  "Experimental Hexplate": entry(
    "Experimental_Hexplate",
    ["Hexcharged: alternate attacks grant attack speed or ability haste."],
    "gap",
  ),
  "Fiendhunter Bolts": entry(
    "Fiendhunter_Bolts",
    ["Night Vigil: bonus lethality and attack speed out of combat."],
    "gap",
  ),
  "Force of Nature": entry(
    "Force_of_Nature",
    ["Steadfast: taking magic damage grants stacking MR and MS."],
    "gap",
  ),
  "Frozen Heart": entry(
    "Frozen_Heart",
    ["Winter's Caress: reduces enemy attack speed in aura."],
    "gap",
  ),
  "Guardian Angel": entry(
    "Guardian_Angel",
    ["Salvation: revive on death after a delay."],
    "gap",
    ["Revive not in DPS sim"],
  ),
  "Hexoptics C44": entry(
    "Hexoptics_C-44",
    ["Arcane Aim: critical strikes grant stacking attack speed."],
    "gap",
  ),
  Hullbreaker: entry(
    "Hullbreaker",
    [
      "Skipper: bonus on-hit damage vs structures.",
      "Boarding Party: bonus resistances when no allies nearby.",
    ],
    "gap",
    ["Structure damage excluded", "Solo resist not in DPS"],
  ),
  "Jak'Sho, The Protean": entry(
    "Jak%27Sho,_the_Protean",
    ["Voidborn Resilience: combat grants stacking resistances."],
    "gap",
  ),
  "Kaenic Rookern": entry(
    "Kaenic_Rookern",
    ["Endurance: bonus magic resist."],
    "gap",
  ),
  Mercurial: entry(
    "Mercurial_Scimitar",
    ["Quicksilver: active removes crowd control."],
    "gap",
  ),
  Quicksilver: entry(
    "Quicksilver_Sash",
    ["Active removes crowd control."],
    "gap",
  ),
  "Phantom Dancer": entry(
    "Phantom_Dancer",
    ["Spectral Waltz: stacking attack speed on attack."],
    "gap",
  ),
  "Randuin's Omen": entry(
    "Randuin%27s_Omen",
    [
      "Rock Solid: reduces critical strike damage taken.",
      "Active slows nearby enemies.",
    ],
    "gap",
  ),
  "Runaan's Hurricane": entry(
    "Runaan%27s_Hurricane",
    [
      "Wind's Fury: ranged attacks fire bolts at nearby enemies.",
      "On-hit applies to bolt targets.",
    ],
    "gap",
    ["Multi-target not in 1v1"],
  ),
  "Rylai's Crystal Scepter": entry(
    "Rylai%27s_Crystal_Scepter",
    ["Rimefrost: ability damage slows enemies."],
    "gap",
  ),
  "Spirit Visage": entry(
    "Spirit_Visage",
    ["Boundless Vitality: increases all healing and shielding."],
    "gap",
  ),
  Thornmail: entry(
    "Thornmail",
    [
      "Thorns: reflects magic damage when hit by attacks.",
      "Grievous Wounds when struck.",
    ],
    "gap",
    ["Reflect not in DPS sim"],
  ),
  "Umbral Glaive": entry(
    "Umbral_Glaive",
    [
      "Blackout: damaging abilities mark enemies.",
      "Nightstalker: takedown on marked target grants stealth.",
    ],
    "gap",
    ["Vision/stealth not in DPS"],
  ),
  "Unending Despair": entry(
    "Unending_Despair",
    [
      "Anguish: nearby enemies take magic damage per second.",
      "Heal when damaging champions.",
    ],
    "gap",
  ),
  "Warmog's Armor": entry(
    "Warmog%27s_Armor",
    ["Warmog's Heart: massive health regen out of combat."],
    "gap",
  ),
  Stasis: entry(
    "Zhonya%27s_Hourglass",
    ["Stasis: active makes wearer untargetable and invulnerable."],
    "gap",
  ),
  Lifeline: entry(
    "Maw_of_Malmortius",
    ["Lifeline: magic damage brings wearer below threshold grants shield."],
    "gap",
  ),
  Annul: entry(
    "Edge_of_Night",
    ["Annul: spell shield blocks next enemy ability."],
    "gap",
  ),

  // --- Support ---
  "Ardent Censer": entry(
    "Ardent_Censer",
    ["Sanctify: heals/shields empower ally attacks."],
    "support",
  ),
  Bandlepipes: entry("Bandlepipes", ["Fanfare: CC empowers allies."], "support"),
  "Diadem of Songs": entry(
    "Diadem_of_Songs",
    ["Harmony: heals grant damage amp."],
    "support",
  ),
  "Echoes of Helia": entry(
    "Echoes_of_Helia",
    ["Soulshot: CC triggers heal and damage."],
    "support",
  ),
  "Imperial Mandate": entry(
    "Imperial_Mandate",
    ["Coordinated Charge: immobilize empowers allies."],
    "support",
  ),
  "Knight's Vow": entry(
    "Knight%27s_Vow",
    ["Sacrifice: redirect damage to wearer."],
    "support",
  ),
  "Locket of the Iron Solari": entry(
    "Locket_of_the_Iron_Solari",
    ["Active grants team shield."],
    "support",
  ),
  "Mikael's Blessing": entry(
    "Mikael%27s_Blessing",
    ["Active cleanses CC from ally."],
    "support",
  ),
  "Moonstone Renewer": entry(
    "Moonstone_Renewer",
    ["Starlit Grace: heal/shield grants bonus heal over time."],
    "support",
  ),
  Redemption: entry(
    "Redemption",
    ["Active heals allies and damages enemies in area."],
    "support",
  ),
  "Shurelya's Battlesong": entry(
    "Shurelya%27s_Battlesong",
    ["Active grants team movement speed."],
    "support",
  ),
  "Staff of Flowing Water": entry(
    "Staff_of_Flowing_Water",
    ["Rapids: heal/shield grants AP to ally."],
    "support",
  ),
  "Zeke's Convergence": entry(
    "Zeke%27s_Convergence",
    ["Frostfire Tempest: ultimate creates storm damaging enemies."],
    "support",
    ["Partner passive — no solo 1v1 damage"],
  ),
  "Zaz'Zak's Realmspike": entry(
    "Zaz%27Zak%27s_Realmspike",
    ["Void Explosion: CC triggers void explosion."],
    "support",
  ),
  "Support / Jungle": entry(
    "Bounty_of_Worlds",
    ["Jungle/support starter item."],
    "support",
  ),
  "Bounty of Worlds": entry(
    "Bounty_of_Worlds",
    ["Jungle/support starter."],
    "support",
  ),

  // --- Additional catalog groups ---
  "Archangel's Staff": entry(
    "Archangel%27s_Staff",
    ["Awe: AP scales with max mana.", "Manaflow: earn mana stacks."],
    "static",
  ),
  "Seraph's Embrace": entry(
    "Seraph%27s_Embrace",
    ["Awe: AP scales with max mana.", "Lifeline: active shield."],
    "static",
    ["Active shield not in DPS"],
  ),
  "Rod of Ages": entry(
    "Rod_of_Ages",
    ["Eternity: combat grants stacking stats over time."],
    "static",
  ),
  "Rabadon's Deathcap": entry(
    "Rabadon%27s_Deathcap",
    ["Magical Opus: 35% increased AP."],
    "static",
  ),
  "Banshee's Veil": entry(
    "Banshee%27s_Veil",
    ["Annul: spell shield blocks next ability."],
    "gap",
  ),
  Bloodsong: entry(
    "Bloodsong",
    ["Spellblade and mark mechanics for supports."],
    "support",
  ),
  "Celestial Opposition": entry(
    "Celestial_Opposition",
    ["Support starter."],
    "support",
  ),
  Cryptbloom: entry(
    "Cryptbloom",
    ["Lament: damage spreads as heal to allies."],
    "support",
  ),
  "Dream Maker": entry("Dream_Maker", ["Dream Maker support item."], "support"),
  "Dusk and Dawn": entry("Duskblade_of_Draktharr", ["Assassin item."], "gap"),
  "Edge of Night": entry(
    "Edge_of_Night",
    ["Annul: spell shield blocks next ability."],
    "gap",
  ),
  "Hollow Radiance": entry(
    "Hollow_Radiance",
    ["Immolate aura with MS on CC."],
    "modeled",
  ),
  "Iceborn Gauntlet": entry(
    "Iceborn_Gauntlet",
    ["Spellblade: slow field on ability-empowered attack."],
    "static",
    ["Slow field not in DPS"],
  ),
  "Immortal Shieldbow": entry(
    "Immortal_Shieldbow",
    ["Lifeline: lethal damage grants shield."],
    "gap",
  ),
  "Lich Bane": entry(
    "Lich_Bane",
    ["Spellblade with AP scaling.", "Sheen 1.5s ICD."],
    "static",
  ),
  "Protoplasm Harness": entry(
    "Protoplasm_Harness",
    ["Support item."],
    "support",
  ),
  "Solstice Sleigh": entry("Solstice_Sleigh", ["Support item."], "support"),
  "Stridebreaker": entry(
    "Stridebreaker",
    ["Cleave on attacks.", "Active slow."],
    "partial",
    ["Cleave suppressed in 1v1"],
  ),
  "Whispering Circlet": entry(
    "Whispering_Circlet",
    ["Support starter."],
    "support",
  ),
  "Winter's Approach": entry(
    "Winter%27s_Approach",
    ["Eternity sustain."],
    "modeled",
  ),
  "Essence Reaver": entry(
    "Essence_Reaver",
    ["Spellblade with mana restore.", "Sheen 1.5s ICD."],
    "static",
  ),
};

const ITEM_NAME_ALIASES: Record<string, string> = {
  Muramana: "Manaflow",
  "Blight": "Blight",
  "Bloodletter's Curse": "Blight",
  Fimbulwinter: "Eternity",
  "Sunfire Aegis": "Immolate",
  "Dead Man's Plate": "Momentum",
  Sheen: "Spellblade",
  "Zhonya's Hourglass": "Stasis",
  "Mercurial Scimitar": "Mercurial",
  "Quicksilver Sash": "Quicksilver",
  "Maw of Malmortius": "Lifeline",
  "Winter's Approach": "Eternity",
  "Hollow Radiance": "Immolate",
};

export function getItemWikiNotes(item: Item): ItemWikiEntry | undefined {
  const mech = item.getMechanicsGroup();
  const group = item.getGroupName();
  const baseName = item.name.replace(/\s*\([^)]*\)\s*$/, "").trim();

  return (
    ITEM_WIKI_NOTES[mech] ??
    ITEM_WIKI_NOTES[group] ??
    ITEM_WIKI_NOTES[baseName] ??
    ITEM_WIKI_NOTES[ITEM_NAME_ALIASES[mech] ?? ""] ??
    ITEM_WIKI_NOTES[ITEM_NAME_ALIASES[group] ?? ""] ??
    ITEM_WIKI_NOTES[ITEM_NAME_ALIASES[baseName] ?? ""]
  );
}

/** Deduplicated notes from all equipped item groups. */
export function getEquippedItemNotes(items: Item[]): string[] {
  const seen = new Set<string>();
  const notes: string[] = [];
  for (const item of items) {
    const key = item.getMechanicsGroup();
    if (seen.has(key)) continue;
    seen.add(key);
    const entry = getItemWikiNotes(item);
    if (entry) notes.push(...entry.notes);
  }
  return notes;
}

export function itemsMissingWikiNotes(items: Item[]): string[] {
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const key = item.getMechanicsGroup();
    if (seen.has(key)) continue;
    seen.add(key);
    if (!getItemWikiNotes(item)) missing.push(key);
  }
  return missing;
}

export function allWikiNoteGroups(): string[] {
  return Object.keys(ITEM_WIKI_NOTES).sort();
}
