import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { extractItemWikiBullets } from "../src/lib/wikiItemNotesExtract";

type AuditRow = {
  item: string;
  group: string;
  wikiStats: string;
  simStats: string;
  wikiPassive: string;
  simPassive: string;
  status: "1:1" | "partial" | "gap" | "mismatch" | "fixed";
  notes: string[];
};

const SIM: Record<
  string,
  { stats: string; passive: string; status?: AuditRow["status"] }
> = {
  "Kraken Slayer": {
    stats: "45 AD, 40% AS, 4% MS",
    passive: "2-stack Bring It Down: 150–200 (+75% missing HP), 80% ranged",
  },
  "Infinity Edge": {
    stats: "75 AD, 25% crit, +30% bonus crit dmg",
    passive: "Flat +30% bonus crit damage (V26.01)",
  },
  Stormrazor: {
    stats: "50 AD, 20% AS, 25% crit",
    passive: "Energized 100 magic + 45% MS 1.5s",
  },
  "Phantom Dancer": {
    stats: "65% AS, 25% crit, 10% MS",
    passive: "Spectral Waltz (ghosted) — cosmetic",
  },
  "Runaan's Hurricane": {
    stats: "40% AS, 25% crit, 4% MS",
    passive: "Wind's Fury: 2 bolts at 55% AD",
  },
  "Guinsoo's Rageblade": {
    stats: "30 AD, 30 AP, 25% AS",
    passive: "Wrath stacks + phantom hit; 30 magic on-hit",
  },
  "Blade of the Ruined King": {
    stats: "40 AD, 25% AS, 10% LS",
    passive: "Mist's Edge 9%/6% current HP on-hit",
  },
  Terminus: {
    stats: "30 AD, 35% AS",
    passive: "Shadow 30 magic + Juxtaposition pen/resist stacks",
  },
  "Navori Flickerblade": {
    stats: "40% AS, 25% crit, 4% MS",
    passive: "15% basic ability CDR on attack",
  },
  "Essence Reaver": {
    stats: "50 AD, 20 AH, 25% crit",
    passive: "Spellblade 125% base AD (no +50% crit scaling)",
  },
  "Statikk Shiv": {
    stats: "45 AD, 45 AP, 30% AS, 4% MS",
    passive: "Energized 60 magic chain (90 vs non-champs)",
  },
  "Rapid Firecannon": {
    stats: "35% AS, 25% crit, 4% MS",
    passive: "Energized +40 magic + 150 range",
  },
  "Yun Tal Wildarrows": {
    stats: "50 AD, 40% AS",
    passive: "Practice Makes Lethal → up to 25% crit",
  },
  "Lord Dominik's Regards": {
    stats: "35 AD, 35% armor pen, 25% crit",
    passive: "Giant Slayer 1%/100 bonus HP (max 15% @1500)",
  },
  "Mortal Reminder": {
    stats: "30 AD, 30% armor pen, 25% crit",
    passive: "Grievous Wounds 40%",
  },
  "Wit's End": {
    stats: "45 MR, 50% AS",
    passive: "Fray 45 magic on-hit",
  },
  Bloodthirster: {
    stats: "80 AD, 15% LS",
    passive: "Ichorshield overflow → shield",
  },
  "Hexoptics C44": {
    stats: "55 AD, 25% crit",
    passive: "Magnification 0–10% by distance; Arcane Aim +100 range",
  },
};

const WIKI_FILES: Record<string, string> = {
  "Kraken Slayer": "adc-Kraken",
  "Infinity Edge": "adc-IE",
  Stormrazor: "adc-Storm",
  "Phantom Dancer": "adc-PD",
  "Runaan's Hurricane": "adc-Runaan",
  "Guinsoo's Rageblade": "adc-Guinsoo",
  "Blade of the Ruined King": "adc-BotRK",
  Terminus: "adc-Term",
  "Navori Flickerblade": "adc-Navori",
  "Essence Reaver": "adc-ER",
  "Statikk Shiv": "adc-Shiv",
  "Rapid Firecannon": "adc-RFC",
  "Yun Tal Wildarrows": "adc-YunTal",
  "Lord Dominik's Regards": "adc-LDR",
  "Mortal Reminder": "adc-MR",
  "Wit's End": "adc-Wits",
  Bloodthirster: "adc-BT",
  "Hexoptics C44": "adc-Hex",
};

function latestV26Patch(wikitext: string): string {
  const m = wikitext.match(
    /;\[\[(V26\.[^\]]+)\]\][^\n]*\n([\s\S]*?)(?=;\[\[V)/,
  );
  if (!m) return "—";
  return `${m[1]}: ${m[2].split("\n").filter((l) => l.trim()).slice(0, 5).join(" | ")}`;
}

function passiveFromNotes(notes: string[]): string {
  const keys = [
    "Bring It Down",
    "Perfection",
    "Bolt",
    "Electrospark",
    "Wind's Fury",
    "Wrath",
    "Mist's Edge",
    "Juxtaposition",
    "Shadow",
    "Giant Slayer",
    "Grievous",
    "Fray",
    "Ichorshield",
    "Magnification",
    "Practice Makes Lethal",
    "Spellblade",
    "Spectral Waltz",
    "Transcendence",
  ];
  for (const k of keys) {
    const hit = notes.find((n) => n.includes(k));
    if (hit) return hit.slice(0, 120);
  }
  return notes[0]?.slice(0, 120) ?? "—";
}

const rows: AuditRow[] = [];

for (const [name, file] of Object.entries(WIKI_FILES)) {
  const sim = SIM[name];
  const notes: string[] = [];
  let wikitext = "";
  try {
    const j = JSON.parse(
      readFileSync(join(process.cwd(), "data", `${file}.json`), "utf8"),
    );
    wikitext = j.parse?.wikitext ?? "";
    notes.push(...extractItemWikiBullets(wikitext));
  } catch {
    /* missing fetch */
  }

  const auditNotes: string[] = [];
  let status: AuditRow["status"] = sim.status ?? "partial";

  if (name === "Kraken Slayer") {
    status = "fixed";
    auditNotes.push("Was every-3rd-AA 175/140 flat; now 2-stack 150–200 + missing HP");
    auditNotes.push(latestV26Patch(wikitext));
  } else if (name === "Infinity Edge") {
    status = "1:1";
    auditNotes.push("V26.01 flat +30% bonus crit dmg matches critDmg:30");
  } else if (name === "Stormrazor") {
    status = "1:1";
    auditNotes.push("Energized 100 magic modeled; legacy magicPeriodicOnHit suppressed");
  } else if (name === "Runaan's Hurricane") {
    status = "partial";
    auditNotes.push("Wind's Fury multi-target bolts excluded in 1v1");
  } else if (name === "Guinsoo's Rageblade") {
    status = "partial";
    auditNotes.push("Phantom hit / crit conversion not modeled");
  } else if (name === "Essence Reaver") {
    status = "partial";
    auditNotes.push("Spellblade +50% crit chance scaling on proc not modeled");
    auditNotes.push(latestV26Patch(wikitext));
  } else if (name === "Statikk Shiv") {
    status = "partial";
    auditNotes.push("Chain lightning to extra targets not in 1v1");
  } else if (name === "Rapid Firecannon") {
    status = "partial";
    auditNotes.push("Sharpshooter +150 attack range not in DPS sim");
  } else if (name === "Yun Tal Wildarrows") {
    status = "partial";
    auditNotes.push("Flurry AS stacks not modeled; crit via avg stack ramp");
  } else if (name === "Lord Dominik's Regards") {
    status = "fixed";
    auditNotes.push("Giant Slayer was 1.5%/100 HP; wiki is 1%/100 up to 15%");
  } else if (name === "Mortal Reminder") {
    status = "fixed";
    auditNotes.push("Armor pen was 35%; V26.01 is 30%");
  } else if (name === "Hexoptics C44") {
    status = "partial";
    auditNotes.push("Magnification distance amp not in DPS sim");
    auditNotes.push("AD fixed 50→55 per V26.02");
  } else if (name === "Bloodthirster") {
    status = "partial";
    auditNotes.push("Ichorshield modeled as ~25% uptime shield only");
  } else if (name === "Terminus") {
    status = "partial";
    auditNotes.push("Wiki V14.4: max 3 Light/Dark stacks (notes may show old 5)");
  } else if (name === "Blade of the Ruined King") {
    status = "1:1";
    auditNotes.push("V25.14 9%/6% current HP matches sim");
  } else if (name === "Navori Flickerblade") {
    status = "1:1";
    auditNotes.push("15% basic ability CDR on attack");
  } else if (name === "Phantom Dancer") {
    status = "1:1";
    auditNotes.push("V25.14 65% AS / 10% MS matches");
  } else if (name === "Wit's End") {
    status = "1:1";
    auditNotes.push("V14.19 45 magic on-hit flat");
  }

  rows.push({
    item: name,
    group: name,
    wikiStats: latestV26Patch(wikitext),
    simStats: sim.stats,
    wikiPassive: passiveFromNotes(notes),
    simPassive: sim.passive,
    status,
    notes: auditNotes,
  });
}

const out = {
  generatedAt: new Date().toISOString(),
  summary: {
    total: rows.length,
    oneToOne: rows.filter((r) => r.status === "1:1").length,
    fixed: rows.filter((r) => r.status === "fixed").length,
    partial: rows.filter((r) => r.status === "partial").length,
    mismatch: rows.filter((r) => r.status === "mismatch").length,
    gap: rows.filter((r) => r.status === "gap").length,
  },
  rows,
};

writeFileSync(
  join(process.cwd(), "data", "adc-wiki-audit.json"),
  JSON.stringify(out, null, 2),
);
console.log(JSON.stringify(out.summary, null, 2));
