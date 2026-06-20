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
  ability_burst: "Max combo burst without basic attacks in the sim.",
  tank: "Prioritizes effective HP while keeping meaningful threat.",
  ap: "Ability power and spell/DoT itemization.",
  spell: "Ability + DoT focus; sim assumes no auto-attack cadence.",
  ad: "Auto attacks, on-hit, and physical carry patterns.",
  bruiser: "Frontline profile: high HP/resists with solid total output.",
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
