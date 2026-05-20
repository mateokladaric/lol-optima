## LoLoptima

LoLoptima is a 1v1-oriented League build simulator and recommender. It scores
item/rune loadouts using **combo-window DPS** (short all-in) and **sustained
rotation DPS**, plus an effective-HP index, and uses simulated annealing to
explore strong 6-item builds.

## Simulation Controls

- Duel assumptions (UI + compute script):
  - Target max HP
  - Target bonus HP
  - Target armor / MR (UI defaults: 100 / 100; meta script defaults: 50 / 50)
  - Burst combo window in seconds (combo damage amortized into combo DPS)
  - Incoming physical damage share
- Simulation assumptions:
  - Scenario level (ability ranks and rune scaling)
  - Champion rotation templates toggle

## Scoring metrics

- **Combo DPS** — damage in the combo window ÷ window length (what optimizers
  maximize for burst/glass profiles).
- **Sustained DPS** — full rotation autos + abilities + on-hit + DoT.
- **Eff. HP** — mixed mitigation index; includes sustain passives (e.g.
  Cryptbloom heal) as pseudo-HP.

## Item gold (buy order)

Recommendations list items in **sim-greedy buy order**: best marginal profile
score per gold at each step, with early-slot budgets so 3k+ legendaries (Rabadon,
etc.) are deferred until later slots.

## Meta generation env vars

Used by `npm run compute-meta` (defaults: **1500** HP, **0** bonus HP, **50**
armor, **50** MR, **3s** combo window):

- `LOLOPTIMA_TARGET_MAX_HP`
- `LOLOPTIMA_TARGET_BONUS_HP`
- `LOLOPTIMA_TARGET_ARMOR`
- `LOLOPTIMA_TARGET_MR`
- `LOLOPTIMA_COMBO_WINDOW`
- `LOLOPTIMA_INCOMING_PHYS_SHARE`
- `LOLOPTIMA_SA_ITER`
- `LOLOPTIMA_SA_RESTARTS`
- `LOLOPTIMA_MC_PROBES`
- `LOLOPTIMA_SIM_LEVEL`
- `LOLOPTIMA_SIM_ROTATION_PROFILES` (`true/false`, `1/0`, `yes/no`)
- `LOLOPTIMA_QUIET=1` — disable per-champion progress logs during meta generation
- `LOLOPTIMA_WORKERS` — parallel champion threads for `compute-meta` (default:
  CPU count − 1; set `1` or `0` for single-threaded sequential run)

## Enemy team builds (OP.GG scraper)

`npm run scrape-builds` fetches the most common build per champion from OP.GG
and writes `public/data/opggBuilds.json`. The 1v1 Build Finder UI reads this
file to let you select 1–5 enemy champions; their level-18 stats (base + items)
are averaged and auto-filled into the duel assumptions.

`npm run compute-all` runs `scrape-builds` then `compute-meta` in sequence.

## Quality scripts

- `npm run regression:sim` — simulation regression (pen, manaless champs, etc.)
- `npm run meta:diff` — compare top-build DPS vs baseline meta file (uses same
  duel defaults as `compute-meta`)
