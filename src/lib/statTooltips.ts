export const STAT_TOOLTIPS = {
  comboDPS:
    "Damage dealt during the burst combo window (abilities + autos in rotation).",
  sustainedDPS:
    "Steady-state damage over time once abilities are on cooldown.",
  effectiveHP:
    "Effective HP against the configured incoming physical/magic damage mix.",
  totalGold: "Estimated total gold to complete this build (buy order optimized).",
  keystone: "Recommended primary rune for this build profile.",
  autoAttack: "Damage from basic attacks only.",
  onHit: "Bonus damage from on-hit item effects.",
  ability: "Damage from ability casts.",
  dot: "Damage over time from burns, bleeds, and similar effects.",
  burst: "Maximum damage in a short burst window.",
  profile:
    "Build archetype — how the optimizer weighted damage vs survivability.",
  aa: "Auto attack DPS component.",
  oh: "On-hit DPS component.",
  ab: "Ability DPS component.",
  dotShort: "Damage-over-time DPS component.",
  fightDuration:
    "Fight length derived from time-to-kill: opponent HP divided by this build's offensive DPS.",
} as const;

export const PROFILE_TOOLTIPS: Record<string, string> = {
  balanced: "Mix of sustained damage and durability for a reference 1v1 duel.",
  glass: "Pure damage — lowest survivability tradeoff.",
  full_lethality:
    "Flat armor pen all-in — 3.5s burst window, scores combo + item burst only.",
  ability_burst: "Max combo burst without basic attacks in the sim.",
  tank: "Prioritizes effective HP while keeping meaningful threat.",
  ap: "Ability power and spell/DoT itemization.",
  spell: "Ability + DoT focus; sim assumes no auto-attack cadence.",
  ad: "Auto attacks, on-hit, and physical carry patterns.",
  bruiser: "Frontline profile: high HP/resists with solid total output.",
  cursed:
    "Meme stat stack — ability haste, mana, move speed, and other kit-leaning scalers your champ naturally wants.",
};

export const DUEL_FIELD_TOOLTIPS = {
  maxHP: "Target opponent's total max health at simulation level.",
  bonusHP: "Bonus HP from items, shields, and health scaling.",
  armor: "Target opponent's armor rating.",
  mr: "Target opponent's magic resist rating.",
  physShare:
    "Share of incoming damage treated as physical for effective HP weighting.",
  level: "Champion level used for stat and ability scaling in the sim.",
  rotation:
    "When enabled, uses champion-specific ability rotation templates.",
} as const;

export type PrimaryDamageType = "ad" | "ap";

export type DpsComponents = {
  autoAttackDPS: number;
  onHitDPS: number;
  abilityDPS: number;
  dotDPS: number;
  physicalAbilityDPS?: number;
};

/** AD if physical components dominate; otherwise AP (magic abilities + DoT). */
export function primaryDamageTypeFromDps(parts: DpsComponents): PrimaryDamageType {
  const physicalAbility = parts.physicalAbilityDPS ?? 0;
  const magicAbility = Math.max(0, parts.abilityDPS - physicalAbility);
  const ad = parts.autoAttackDPS + parts.onHitDPS + physicalAbility;
  const ap = magicAbility + parts.dotDPS;
  return ad >= ap ? "ad" : "ap";
}

export function dpsDamageColorClasses(type: PrimaryDamageType): {
  text: string;
  border: string;
} {
  return type === "ad"
    ? { text: "text-dpm-ad", border: "border-dpm-ad/50" }
    : { text: "text-dpm-ap", border: "border-dpm-ap/50" };
}

/** Color breakdown lines by inferred damage type. */
export function breakdownLineColorClass(line: string): string {
  if (line.includes("Damage multipliers:")) {
    return "text-dpm-accent-gold font-semibold";
  }
  if (
    line.includes("Base AA:") ||
    line.includes("On-hit") ||
    line.includes("on-hit")
  ) {
    return "text-dpm-ad";
  }
  if (
    line.includes("Magic DoT") ||
    /\bmagic\b/i.test(line) ||
    line.includes("Liandry") ||
    line.includes("Luden") ||
    line.includes("Stormsurge") ||
    line.includes("Torment")
  ) {
    return "text-dpm-ap";
  }
  if (/\btrue\b/i.test(line)) {
    return "text-dpm-accent-gold";
  }
  return "text-dpm-text";
}
