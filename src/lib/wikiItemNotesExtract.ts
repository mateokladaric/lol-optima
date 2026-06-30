/**
 * Parse LoL Wiki item page wikitext into Notes bullets + passive text.
 * Modern item pages use {{Item info|notes = ...}} rather than == Notes ==.
 */

/** Known template transclusions inlined into notes (from Template: pages). */
const INLINED_TEMPLATE_NOTES: Record<string, string[]> = {
  "Energized info": [
    "Each basic attack on-attack generates 6 Energize stacks while 1 is generated for every 24 in-game units traveled. This includes normal movement, dashes, blinks, or being displaced.",
    "Hitting abilities that apply on-hit effects will also generate 6 stacks.",
    "Effect applies as a separate cast instance.",
  ],
  "Quicksilver info": [
    "Quicksilver is an auto-targeted effect.",
    "Quicksilver's cast does not break stealth.",
    "Quicksilver has no cast time.",
    "Quicksilver's cooldown does not transfer between items that have its active effect.",
    "Quicksilver is disabled during Airborne effects.",
    "Suspension will be fully removed by Quicksilver.",
    "Quicksilver removes suppression and nearsight while Cleanse does not.",
    "Quicksilver cannot remove stasis.",
    "Quicksilver will not remove self slows.",
  ],
};

/** Strip common wiki markup to plain-ish text for sim parsers. */
export function cleanWikiLine(raw: string): string {
  let s = raw.replace(/<!--[\s\S]*?-->/g, "");

  s = s.replace(/\{\{sbc\|([^}]+)\}\}/gi, "$1");
  s = s.replace(/\{\{nie\|([^}]+)\}\}/gi, "$1");
  s = s.replace(/\{\{ii?s?\|([^}]+)\}\}/gi, "$1");
  s = s.replace(/\{\{tip\|([^|}]+)(?:\|([^}]+))?\}\}/gi, (_, a, b) => b ?? a);
  s = s.replace(/\{\{rd\|([^|}]+)\|([^}]+)\}\}/gi, "$1 / $2");
  s = s.replace(/\{\{fd\|([^}]+)\}\}/gi, "$1");
  s = s.replace(/\{\{g\|([^}]+)\}\}/gi, "$1 gold");
  s = s.replace(/\{\{as\|([^}]+)\}\}/gi, "$1");
  s = s.replace(/\{\{ap\|([^}]+)\}\}/gi, "$1");
  s = s.replace(/\{\{ci\|([^}]+)\}\}/gi, "$1");
  s = s.replace(/\{\{cai\|[^|]*\|([^}]+)\}\}/gi, "$1");
  s = s.replace(/\{\{cais\|[^|]*\|([^}|]+)[^}]*\}\}/gi, "$1");
  s = s.replace(/\{\{ai\|[^|]*\|([^}]+)\}\}/gi, "$1");
  s = s.replace(/\{\{sm2\|[^}]+\}\}/gi, "");
  s = s.replace(/\{\{ct[^}]*\}\}/gi, "");
  s = s.replace(/\{\{[^}]+\}\}/g, "");
  s = s.replace(/\{\{[^}]*$/g, "");

  s = s.replace(/\[\[([^|\]#]+#)?([^|\]]+\|)?([^\]]+)\]\]/g, "$3");
  s = s.replace(/'''+/g, "");
  s = s.replace(/''/g, "");
  s = s.replace(/<[^>]+>/g, "");
  s = s.replace(/&nbsp;/g, " ");
  s = s.replace(/\s+/g, " ").trim();

  return s;
}

function collectBullets(block: string): string[] {
  const bullets: string[] = [];
  for (const line of block.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("*") && !trimmed.startsWith("#")) continue;
    const text = cleanWikiLine(trimmed.replace(/^[*#]+\s*/, ""));
    if (text.length >= 8) bullets.push(text.slice(0, 500));
  }
  return bullets;
}

function expandTranscludedTemplates(block: string): string[] {
  const extra: string[] = [];
  for (const [name, bullets] of Object.entries(INLINED_TEMPLATE_NOTES)) {
    if (block.includes(`{{${name}}}`)) extra.push(...bullets);
  }
  return extra;
}

/** Extract |notes = bullets from {{Item info ...}} template. */
export function extractItemInfoNotes(wikitext: string): string[] {
  const notesMatch = wikitext.match(
    /\|notes\s*=\s*\n([\s\S]*?)(?=\n\|(?:strategy|oldicons|trivia|quotes|media|sfx|revisions|patchhistory)\s*=)/i,
  );
  if (!notesMatch) return [];

  const block = notesMatch[1];
  return [...expandTranscludedTemplates(block), ...collectBullets(block)];
}

/** Extract latest unique-passive lines from |patchhistory = (newest patches first). */
export function extractPatchHistoryPassives(wikitext: string): string[] {
  const phMatch = wikitext.match(
    /\|patchhistory\s*=\s*\n([\s\S]*?)(?=\n\}\}\s*(?:\n|$))/i,
  );
  if (!phMatch) return [];

  const out: string[] = [];
  for (const line of phMatch[1].split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("*")) continue;
    const text = cleanWikiLine(trimmed.replace(/^\*+\s*/, ""));
    if (text.length < 20) continue;
    const isPassive =
      /unique passive/i.test(text) ||
      /new effect:/i.test(text) ||
      /unique - passive/i.test(text) ||
      /ranged champions increased to \d+%/i.test(text) ||
      (/passive/i.test(text) &&
        (text.includes("lethality") ||
          text.includes("shield") ||
          text.includes("damage") ||
          text.includes("Energized") ||
          text.includes("on-hit")));
    if (!isPassive) continue;
    if (!out.includes(text)) out.push(text.slice(0, 500));
    if (out.length >= 8) break;
  }
  return out;
}

/** Extract == Notes == bullets (legacy pages). */
export function extractNotesSection(wikitext: string): string[] {
  const notesMatch = wikitext.match(
    /==\s*Notes\s*==([\s\S]*?)(?=\n==[^=\s]|\n== Map|$)/i,
  );
  if (!notesMatch) return [];
  return collectBullets(notesMatch[1]);
}

/** Extract unique passive description from ItemData-style wikitext if present. */
export function extractPassiveDescription(wikitext: string): string[] {
  const out: string[] = [];
  const passMatch = wikitext.match(/description\s*=\s*"([^"]+)"/i);
  if (passMatch) {
    const text = cleanWikiLine(passMatch[1]);
    if (text.length >= 8) out.push(text);
  }
  const uniquePassive = wikitext.match(
    /Unique\s*[–-]\s*([^:]+):\s*([^\n|]+)/i,
  );
  if (uniquePassive) {
    const text = cleanWikiLine(`${uniquePassive[1]}: ${uniquePassive[2]}`);
    if (text.length >= 8 && !out.includes(text)) out.push(text);
  }
  return out;
}

export function extractItemWikiBullets(wikitext: string): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];

  const add = (list: string[]) => {
    for (const note of list) {
      const key = note.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(note);
    }
  };

  add(extractItemInfoNotes(wikitext));
  add(extractPatchHistoryPassives(wikitext));
  add(extractNotesSection(wikitext));
  if (merged.length === 0) add(extractPassiveDescription(wikitext));

  return merged;
}
