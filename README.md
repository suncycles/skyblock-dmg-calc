# SkyDmg

A Hypixel Skyblock damage calculator. Build a loadout, pick a target, see exactly where every point
of damage comes from.

### **→ [skydmg.pages.dev](https://skydmg.pages.dev)**

## Features

- **Import from Hypixel** — type an IGN and your gear, pet, accessories, attributes and skill levels
  load straight off your profile. No login, no API key.
- **Full damage breakdown** — Initial Damage → additive → multiplicative → Final Damage, per target
  mob, with every stat expandable to its individual sources.
- **Per-item customization** — enchants, ultimates, gemstones, reforges, books, stars, Master Stars,
  recombobulator, dungeonization, and item-specific specials.
- **Damage Optimizer** — ranks real upgrades against live bazaar/auction prices, sortable by damage
  gained or by damage per coin, filterable by category and budget.
- **Modes** — Slayer, Diana, Mage, and Dungeon (Archer / Mage Beam / Mage Ability), with Master Mode
  and DPS views.
- **333 target mobs** with real HP and defense, searchable and filterable by location.
- **Compare** two builds side by side, save loadouts locally, and share them as short links.

## Stack

`frontend/` — React 19 + Vite + Tailwind v4, deployed to Cloudflare Pages.
`worker/` — Cloudflare Worker + KV, serving the item catalog (ingested from
[NotEnoughUpdates-REPO](https://github.com/NotEnoughUpdates/NotEnoughUpdates-REPO)), proxying the
Hypixel API for imports, and storing shared loadout links.

```bash
cd frontend && npm install && npm run dev
```
