## LoLoptima

LoLoptima is a 1v1-oriented League build simulator and recommender. It evaluates
item/rune loadouts with a sustained-DPS + effective-HP score and uses
simulated annealing to explore strong 6-item builds.

## Simulation Controls

- Duel assumptions (UI + compute script):
  - Target max HP
  - Target bonus HP
  - Target armor / MR (defaults: 100 / 100)
  - Burst combo window (seconds; burst damage is amortized into total DPS)
  - Incoming physical damage share
- Simulation assumptions:
  - Scenario level (used for ability/rune scaling and ability ranks)
  - Champion rotation templates toggle (rotation-aware vs raw generic cadence)

## Item gold (buy order & efficiency)

Recommendations list items in **rough purchase order** (estimated cheap → expensive).
`Est. gold` is a **stat-based approximation** to Riot’s shop pricing (not patch-perfect),
plus a few manual overrides. It is used to:

- sort displayed item slots for “power sooner” intuition
- break ties when choosing between item variants in the same group (better power per gold)

### Meta generation env vars

Used by `npm run compute-meta`:

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

## Quality scripts

- `npm run regression:sim`  
  Fast simulation regression checks for several champions and scenario toggles.

- `npm run meta:diff`  
  Compares current computed top-build DPS against a baseline meta file (default:
  `public/data/metaBuilds.json`) and prints top movers.

Optional env vars for `meta:diff`:

- `LOLOPTIMA_BASELINE_META_PATH`
- `LOLOPTIMA_SIM_LEVEL`
- `LOLOPTIMA_SIM_ROTATION_PROFILES`
- `LOLOPTIMA_META_DIFF_TOP_N`

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
