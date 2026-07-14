# 2026 World Cup Simulation

This repository contains a dependency-free Python Monte Carlo simulator for the
2026 FIFA World Cup.

The data snapshot fixes already played group-stage results and simulates every
remaining match from the snapshot date.

## Run

```bash
python3 worldcup_simulator.py --runs 10000 --seed 20260621
```

Show only current standings:

```bash
python3 worldcup_simulator.py --standings
```

Show one simulated tournament path:

```bash
python3 worldcup_simulator.py --one --seed 7
```

## Snapshot

Data file: `data/world_cup_2026_snapshot.json`

As of: `2026-06-21 Asia/Seoul`

The snapshot includes played results through:

- USA 2-0 Australia
- Scotland 0-1 Morocco
- Brazil 3-0 Haiti
- Turkey 0-1 Paraguay

June 20 North American evening fixtures such as Netherlands vs Sweden,
Germany vs Ivory Coast, Ecuador vs Curacao, and Tunisia vs Japan are left
unplayed in the data if a verified final score was not available in the checked
sources.

## Method

- Group-stage matches use fixed scores when available.
- Unplayed matches use a Poisson goal model based on the team ratings in the
  JSON data file.
- Group ranking uses points, head-to-head mini-table, goal difference, goals
  scored, and rating as the final deterministic fallback.
- The top two in each group plus the eight best third-place teams advance.
- Round-of-32 bracket slots follow the published group-position structure; the
  third-place slots are assigned by backtracking through the eligible group
  sets.

Ratings are pragmatic simulator inputs, not official FIFA Elo values. Update
them freely if you want a different model.

## Sources

- TechRadar World Cup 2026 schedule and group tables:
  https://www.techradar.com/how-to-watch/football/world-cup-2026-free
- Guardian USA 2-0 Australia:
  https://www.theguardian.com/football/live/2026/jun/19/usa-v-australia-world-cup-2026-live
- Guardian Scotland 0-1 Morocco:
  https://www.theguardian.com/football/live/2026/jun/19/scotland-v-morocco-world-cup-2026-live
- Guardian Brazil 3-0 Haiti:
  https://www.theguardian.com/football/live/2026/jun/20/fifa-world-cup-2026-live-brazil-v-haiti-updates-bra-vs-hai-group-c-match-score-latest
- Guardian Turkey 0-1 Paraguay:
  https://www.theguardian.com/football/live/2026/jun/20/fifa-world-cup-2026-live-turkey-v-paraguay-updates-tur-vs-par-group-d-match-score-latest
- 2026 FIFA World Cup format and bracket reference:
  https://en.wikipedia.org/wiki/2026_FIFA_World_Cup
