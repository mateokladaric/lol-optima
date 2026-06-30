/**
 * Sim classification + wiki page slugs per item mechanics group.
 * Notes text lives in data/wiki-item-notes-fetched.json (from npm run fetch:wiki-items).
 */

export type ItemWikiSimStatus =
  | "modeled"
  | "static"
  | "partial"
  | "gap"
  | "support";

export type ItemWikiSimMeta = {
  simStatus: ItemWikiSimStatus;
  wikiGaps?: string[];
};

/** Override wiki page slug when it differs from group name. */
export const ITEM_WIKI_PAGE_SLUGS: Record<string, string> = {
  Blight: "Bloodletter%27s_Curse",
  Eternity: "Fimbulwinter",
  Immolate: "Sunfire_Aegis",
  Momentum: "Dead_Man%27s_Plate",
  Manaflow: "Manamune",
  Muramana: "Muramana",
  Hydra: "Titanic_Hydra",
  "Profane Hydra": "Profane_Hydra",
  Glory: "Imperial_Mandate",
  Mejai: "Mejai%27s_Soulstealer",
  "Dead Man's Plate": "Dead_Man%27s_Plate",
  "Endless Hunger": "Endless_Hunger",
  Mercurial: "Mercurial_Scimitar",
  Quicksilver: "Quicksilver_Sash",
  Stasis: "Zhonya%27s_Hourglass",
  Lifeline: "Maw_of_Malmortius",
  Annul: "Edge_of_Night",
  "Lord Dominik's Regards": "Lord_Dominik%27s_Regards",
  "Serylda's Grudge": "Serylda%27s_Grudge",
  "Youmuu's Ghostblade": "Youmuu%27s_Ghostblade",
  "Guinsoo's Rageblade": "Guinsoo%27s_Rageblade",
  "Overlord's Bloodmail": "Overlord%27s_Bloodmail",
  "Liandry's Torment": "Liandry%27s_Torment",
  "Serpent's Fang": "Serpent%27s_Fang",
  "Luden's Echo": "Luden%27s_Companion",
  "Nashor's Tooth": "Nashor%27s_Tooth",
  "Wit's End": "Wit%27s_End",
  "Rabadon's Deathcap": "Rabadon%27s_Deathcap",
  "Warmog's Armor": "Warmog%27s_Armor",
  "Randuin's Omen": "Randuin%27s_Omen",
  "Runaan's Hurricane": "Runaan%27s_Hurricane",
  "Rylai's Crystal Scepter": "Rylai%27s_Crystal_Scepter",
  "Shurelya's Battlesong": "Shurelya%27s_Battlesong",
  "Zeke's Convergence": "Zeke%27s_Convergence",
  "Zaz'Zak's Realmspike": "Zaz%27Zak%27s_Realmspike",
  "Winter's Approach": "Winter%27s_Approach",
  "Archangel's Staff": "Archangel%27s_Staff",
  "Seraph's Embrace": "Seraph%27s_Embrace",
  "Rod of Ages": "Rod_of_Ages",
  "Banshee's Veil": "Banshee%27s_Veil",
  "Knight's Vow": "Knight%27s_Vow",
  "Mikael's Blessing": "Mikael%27s_Blessing",
  "Locket of the Iron Solari": "Locket_of_the_Iron_Solari",
  "Echoes of Helia": "Echoes_of_Helia",
  "Hollow Radiance": "Hollow_Radiance",
  "Jak'Sho, The Protean": "Jak%27Sho,_The_Protean",
  Spellblade: "Sheen",
  "Void Pen": "Void_Staff",
  Void_Pen: "Void_Staff",
  "Hexoptics C44": "Hexoptics_C44",
  "Support / Jungle": "Bounty_of_Worlds",
  "Bounty of Worlds": "Bounty_of_Worlds",
  "Dusk and Dawn": "Duskblade_of_Draktharr",
  "Edge of Night": "Edge_of_Night",
  "Dream Maker": "Dream_Maker",
  "Solstice Sleigh": "Solstice_Sleigh",
  "Whispering Circlet": "Whispering_Circlet",
  "Celestial Opposition": "Celestial_Opposition",
};

const MODELED = new Set([
  "Kraken Slayer",
  "Stormrazor",
  "Hubris",
  "Terminus",
  "Blight",
  "Blackfire Torch",
  "Malignance",
  "Horizon Focus",
  "Axiom Arc",
  "Black Cleaver",
  "Overlord's Bloodmail",
  "Guinsoo's Rageblade",
  "Eclipse",
  "Stormsurge",
  "Luden's Echo",
  "Statikk Shiv",
  "Voltaic Cyclosword",
  "Rapid Firecannon",
  "Riftmaker",
  "Spear of Shojin",
  "Hextech Rocketbelt",
  "Hextech Gunblade",
  "Eternity",
  "Immolate",
  "Momentum",
  "Yun Tal Wildarrows",
  "Sundered Sky",
  "Bastionbreaker",
  "Liandry's Torment",
  "Serpent's Fang",
  "Umbral Glaive",
]);

const STATIC = new Set([
  "Blade of the Ruined King",
  "The Collector",
  "Wit's End",
  "Nashor's Tooth",
  "Manaflow",
  "Muramana",
  "Infinity Edge",
  "Youmuu's Ghostblade",
  "Lord Dominik's Regards",
  "Serylda's Grudge",
  "Mortal Reminder",
  "Last Whisper",
  "Navori Flickerblade",
  "Trinity Force",
  "Spellblade",
  "Void Staff",
  "Void Pen",
  "Morellonomicon",
  "Shadowflame",
  "Cosmic Drive",
  "Actualizer",
  "Archangel's Staff",
  "Seraph's Embrace",
  "Rod of Ages",
  "Rabadon's Deathcap",
  "Iceborn Gauntlet",
  "Lich Bane",
  "Essence Reaver",
  "Hollow Radiance",
]);

const PARTIAL = new Set([
  "Heartsteel",
  "Mejai",
  "Hydra",
  "Profane Hydra",
  "Dead Man's Plate",
  "Endless Hunger",
  "Stridebreaker",
]);

const SUPPORT = new Set([
  "Ardent Censer",
  "Bandlepipes",
  "Diadem of Songs",
  "Echoes of Helia",
  "Imperial Mandate",
  "Knight's Vow",
  "Locket of the Iron Solari",
  "Mikael's Blessing",
  "Moonstone Renewer",
  "Redemption",
  "Shurelya's Battlesong",
  "Staff of Flowing Water",
  "Zeke's Convergence",
  "Zaz'Zak's Realmspike",
  "Support / Jungle",
  "Bounty of Worlds",
  "Bloodsong",
  "Celestial Opposition",
  "Cryptbloom",
  "Dream Maker",
  "Protoplasm Harness",
  "Solstice Sleigh",
  "Whispering Circlet",
  "Dawncore",
  "Glory",
]);

/** Per-group sim routing + optional out-of-scope gaps (not duplicated in wiki Notes). */
export const ITEM_WIKI_SIM_META: Record<string, ItemWikiSimMeta> = {};

function setMeta(
  group: string,
  simStatus: ItemWikiSimStatus,
  wikiGaps?: string[],
): void {
  ITEM_WIKI_SIM_META[group] = { simStatus, wikiGaps };
}

for (const g of MODELED) setMeta(g, "modeled");
setMeta("Kraken Slayer", "modeled", [
  "Guinsoo phantom hit stack interaction not modeled",
  "Runaan bolts do not stack Bring It Down",
]);
for (const g of STATIC) setMeta(g, "static");
for (const g of PARTIAL) setMeta(g, "partial");
for (const g of SUPPORT) setMeta(g, "support");

// Modeled items — sim scope gaps (wiki Notes are in fetched JSON)
setMeta("Statikk Shiv", "modeled", [
  "Chain lightning to extra targets not modeled in 1v1",
]);
setMeta("Horizon Focus", "modeled", [
  "Hypershot 600+ unit threshold modeled as body-type uptime",
]);
setMeta("Hydra", "partial", ["Cleave AoE suppressed in 1v1"]);
setMeta("Profane Hydra", "partial", ["Cleave AoE suppressed in 1v1"]);
setMeta("Heartsteel", "partial", [
  "Optimizer uses base HP row; stack variants excluded",
]);
setMeta("Mejai", "partial", ["0-stack base row in pool (conservative)"]);

// Default remaining catalog groups to gap
const GAP_HINTS: Record<string, string[]> = {
  Hullbreaker: ["Skipper vs structures excluded", "Solo resist not in DPS"],
  "Runaan's Hurricane": ["Multi-target bolts not in 1v1"],
  Thornmail: ["Reflect damage not in DPS sim"],
  "Guardian Angel": ["Revive not in DPS sim"],
  Stasis: ["Zhonya stasis not in DPS sim"],
  Annul: ["Spell shield not in DPS sim"],
  "Banshee's Veil": ["Spell shield not in DPS sim"],
};

export function defaultSimStatus(group: string): ItemWikiSimStatus {
  if (MODELED.has(group)) return "modeled";
  if (STATIC.has(group)) return "static";
  if (PARTIAL.has(group)) return "partial";
  if (SUPPORT.has(group)) return "support";
  return "gap";
}

export function simMetaForGroup(group: string): ItemWikiSimMeta {
  return (
    ITEM_WIKI_SIM_META[group] ?? {
      simStatus: defaultSimStatus(group),
      wikiGaps: GAP_HINTS[group],
    }
  );
}

export function wikiPageSlug(group: string): string {
  return ITEM_WIKI_PAGE_SLUGS[group] ?? group.replace(/'/g, "%27").replace(/ /g, "_");
}

export function wikiPageUrl(group: string): string {
  return `https://wiki.leagueoflegends.com/en-us/${wikiPageSlug(group)}`;
}
