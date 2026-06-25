/**
 * League purchase limits beyond variant groupName (e.g. only one Fatality item).
 *
 * Terminus and Last Whisper upgrades (Serylda's, LDR, Mortal Reminder) share the
 * Fatality limit — they cannot be in the same build.
 */

import type { Item } from "@/app/actions/sim";

/** Maps item.getGroupName() → shared purchase limit tag. */
const EXCLUSIVE_GROUP_BY_ITEM_GROUP: Record<string, string> = {
  Terminus: "Fatality",
  "Last Whisper": "Fatality",
};

export function getItemExclusiveGroup(item: Item): string | null {
  return EXCLUSIVE_GROUP_BY_ITEM_GROUP[item.getGroupName()] ?? null;
}

export function itemExclusiveGroupsInBuild(build: Item[]): Set<string> {
  const out = new Set<string>();
  for (const item of build) {
    const tag = getItemExclusiveGroup(item);
    if (tag) out.add(tag);
  }
  return out;
}

/** True if `item` may be added alongside `build` (group + exclusive limits). */
export function canAddItemToBuild(item: Item, build: Item[]): boolean {
  const group = item.getGroupName();
  if (build.some((i) => i.getGroupName() === group)) return false;

  const exclusive = getItemExclusiveGroup(item);
  if (!exclusive) return true;

  return !build.some((i) => getItemExclusiveGroup(i) === exclusive);
}

export function isValidFullBuild(items: Item[]): boolean {
  const groups = new Set<string>();
  const exclusive = new Set<string>();

  for (const item of items) {
    const g = item.getGroupName();
    if (groups.has(g)) return false;
    groups.add(g);

    const ex = getItemExclusiveGroup(item);
    if (!ex) continue;
    if (exclusive.has(ex)) return false;
    exclusive.add(ex);
  }

  return true;
}

export function hasFatalityConflict(items: Item[]): boolean {
  let hasTerminus = false;
  let hasLastWhisperLine = false;
  for (const item of items) {
    const g = item.getGroupName();
    if (g === "Terminus") hasTerminus = true;
    if (g === "Last Whisper") hasLastWhisperLine = true;
  }
  return hasTerminus && hasLastWhisperLine;
}

/**
 * If both Fatality items are present (invalid build), keep Terminus pen and drop
 * % armor pen from Last Whisper-line item stats already summed on `stats`.
 */
export function resolveFatalityArmorPenConflict(
  items: Item[],
  stats: { armorPen?: number },
): void {
  if (!hasFatalityConflict(items)) return;

  let penFromLastWhisper = 0;
  for (const item of items) {
    if (item.getGroupName() === "Last Whisper") {
      penFromLastWhisper += item.stats.armorPen ?? 0;
    }
  }
  if (penFromLastWhisper > 0) {
    stats.armorPen = Math.max(0, (stats.armorPen ?? 0) - penFromLastWhisper);
  }
}
