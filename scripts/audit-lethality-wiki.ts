import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { extractItemWikiBullets } from "../src/lib/wikiItemNotesExtract";

type AuditRow = {
  item: string;
  group: string;
  wikiLethality: string;
  simLethality: string;
  wikiPassive: string;
  simPassive: string;
  status: "1:1" | "partial" | "gap" | "mismatch";
  notes: string[];
};

const SIM: Record<
  string,
  { lethality?: number; ad?: number; ah?: number; extra?: string }
> = {
  "Axiom Arc": { lethality: 18, ad: 55, ah: 20, extra: "15% + 0.15/leth refund" },
  Bastionbreaker: { lethality: 22, ad: 55, ah: 15, extra: "30/15 + 1.5/0.75 per leth true" },
  "Annul / Edge of Night": { lethality: 15, ad: 50, extra: "spell shield only" },
  Hubris: { lethality: 18, ad: 55, ah: 10, extra: "12+3*takedown AD (wrong?)" },
  "Profane Hydra": { lethality: 18, ad: 55, ah: 10, extra: "40/20% AD cleave" },
  "Serpent's Fang": { lethality: 15, ad: 55, extra: "shield reaver modeled" },
  "The Collector": { lethality: 10, ad: 50, extra: "5% execute" },
  "Umbral Glaive": { lethality: 18, ad: 60, ah: 15, extra: "Nightstalker 50+1.5/leth" },
  "Voltaic Cyclosword": { lethality: 10, ad: 55, ah: 10, extra: "Firmament +15/12 temp 4s" },
  "Youmuu's Ghostblade": { lethality: 18, ad: 55, extra: "ms passives gap" },
  Opportunity: { lethality: 18, ad: 55, extra: "not in sim pool" },
  "The Brutalizer": { lethality: 5, extra: "component not in pool" },
  "Serrated Dirk": { lethality: 10, ad: 30, extra: "component not in pool" },
};

function latestAddedStats(wikitext: string): string {
  const blocks = [...wikitext.matchAll(/;\[\[(V[\d.]+)\]\][^\n]*\n([\s\S]*?)(?=;\[\[V|\}\}\s*\n\n)/g)];
  for (const b of blocks) {
    if (b[0].includes("- Added") || b[0].includes("{{sbc|Stats:}}")) {
      const stats = b[0].match(/\{\{sbc\|Stats:\}\}[^\n]+/i);
      if (stats) return `[${b[1]}] ${stats[0]}`;
    }
  }
  const any = wikitext.match(/\{\{sbc\|Stats:\}\}[^\n]+/gi);
  return any?.[0] ?? "—";
}

function fluxFormula(notes: string[]): string {
  const t = notes.join(" ");
  const m = t.match(/10\+.*?lethality.*?0\.25/i);
  const scale = t.match(/0\.4% per 1 Lethality/i);
  return [m ? "10 + lethality×0.25%" : null, scale ? "+0.4%/leth total" : null]
    .filter(Boolean)
    .join("; ") || t.match(/refunds \d+%/)?.[0] || "—";
}

const pages: Record<string, string> = {
  "Axiom Arc": "Axiom_Arc",
  Bastionbreaker: "Bastionbreaker",
  "Annul / Edge of Night": "Edge_of_Night",
  Hubris: "Hubris",
  "Profane Hydra": "Profane_Hydra",
  "Serpent's Fang": "Serpent%27s_Fang",
  "The Collector": "The_Collector",
  "Umbral Glaive": "Umbral_Glaive",
  "Voltaic Cyclosword": "Voltaic_Cyclosword",
  "Youmuu's Ghostblade": "Youmuu%27s_Ghostblade",
  Opportunity: "Opportunity",
  "The Brutalizer": "The_Brutalizer",
  "Serrated Dirk": "Serrated_Dirk",
};

const rows: AuditRow[] = [];

for (const [name, page] of Object.entries(pages)) {
  const file = join(process.cwd(), "data", `wiki-${page.replace(/%27/g, "")}.json`);
  let wikitext = "";
  let notes: string[] = [];
  try {
    const j = JSON.parse(readFileSync(file, "utf8"));
    wikitext = j.parse?.wikitext ?? "";
    notes = extractItemWikiBullets(wikitext);
  } catch {
    notes = [];
  }

  const sim = SIM[name];
  let status: AuditRow["status"] = "gap";
  let wikiPassive = "—";
  const auditNotes: string[] = [];

  if (name === "Axiom Arc") {
    wikiPassive = fluxFormula(notes);
    const expected = "10 + itemLeth×0.25% (+0.4%/bonus leth per patch)";
    status = sim.extra?.includes("15%") ? "mismatch" : "partial";
    auditNotes.push(`Wiki Flux: ${wikiPassive}`);
    auditNotes.push(`Sim: ${sim.extra} — should be ~14.5% at 18 leth (10+4.5) or 10+total×0.4%`);
  } else if (name === "Bastionbreaker") {
    wikiPassive = notes.find((n) => n.includes("Shaped Charge")) ?? "30/15 + per lethality";
    status = sim.extra?.includes("1.5") ? "1:1" : "mismatch";
    if (!notes.some((n) => n.includes("Sabotage"))) auditNotes.push("Sabotage passive not modeled");
  } else if (name === "Hubris") {
    wikiPassive = notes.find((n) => n.includes("Eminence")) ?? "10 + 1/rank AD";
    status = sim.extra?.includes("12+3") ? "mismatch" : "partial";
  } else if (name === "Profane Hydra") {
    wikiPassive = notes.find((n) => n.includes("Cleave")) ?? "40/20% AD cleave";
    const stats = latestAddedStats(wikitext);
    auditNotes.push(`Wiki stats: ${stats}`);
    status = sim.ad === 55 ? "mismatch" : "partial";
    auditNotes.push("Heretical Cleave active not in DPS sim");
  } else if (name === "Serpent's Fang") {
    wikiPassive = "Shield Reaver 50/35% shred, 3s venom";
    status = "partial";
    auditNotes.push("Requires targetPhysicalShieldEHP > 0 to affect DPS");
  } else if (name === "The Collector") {
    wikiPassive = notes.find((n) => n.includes("Death")) ?? "5% execute";
    status = "1:1";
  } else if (name === "Umbral Glaive") {
    wikiPassive = notes.find((n) => n.includes("Nightstalker")) ?? "50 bonus on AA";
    status = sim.extra?.includes("1.5/leth") ? "mismatch" : "partial";
    auditNotes.push("Nightstalker is out-of-vision basic attack, not ability+leth scaling");
  } else if (name === "Voltaic Cyclosword") {
    wikiPassive = notes.find((n) => n.includes("Firmament")) ?? "15/12 leth 4s + %HP";
    status = "1:1";
  } else if (name === "Youmuu's Ghostblade") {
    wikiPassive = notes.find((n) => n.includes("Haunt")) ?? "40 OOC MS + shards";
    status = "partial";
    auditNotes.push("Only flat 18 lethality in DPS; Haunt/Wraith Step are gap");
  } else if (name === "Annul / Edge of Night") {
    wikiPassive = notes.find((n) => n.includes("Annul")) ?? "spell shield";
    status = sim.lethality === 15 ? "1:1" : "mismatch";
    auditNotes.push("Annul spell shield defensive — wikiGaps");
  } else if (name.includes("Dirk") || name.includes("Brutalizer") || name === "Opportunity") {
    wikiPassive = latestAddedStats(wikitext);
    status = "gap";
    auditNotes.push("Component / not in optimizer item pool");
  }

  rows.push({
    item: name,
    group: name,
    wikiLethality: latestAddedStats(wikitext),
    simLethality: sim.lethality != null ? String(sim.lethality) : "—",
    wikiPassive,
    simPassive: sim.extra ?? "flat lethality only",
    status,
    notes: auditNotes,
  });
}

const out = join(process.cwd(), "data", "lethality-wiki-audit.json");
writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2));
console.log(JSON.stringify(rows, null, 2));
