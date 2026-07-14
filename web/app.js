const DEFAULT_RATING = 1550;
const BASE_GOALS = 2.65;

const ROUND_OF_32 = [
  { match: 73, home: ["place", "A", 2], away: ["place", "B", 2] },
  { match: 74, home: ["place", "E", 1], away: ["third", ["A", "B", "C", "D", "F"]] },
  { match: 75, home: ["place", "F", 1], away: ["place", "C", 2] },
  { match: 76, home: ["place", "C", 1], away: ["place", "F", 2] },
  { match: 77, home: ["place", "I", 1], away: ["third", ["C", "D", "F", "G", "H"]] },
  { match: 78, home: ["place", "E", 2], away: ["place", "I", 2] },
  { match: 79, home: ["place", "A", 1], away: ["third", ["C", "E", "F", "H", "I"]] },
  { match: 80, home: ["place", "L", 1], away: ["third", ["E", "H", "I", "J", "K"]] },
  { match: 81, home: ["place", "D", 1], away: ["third", ["B", "E", "F", "I", "J"]] },
  { match: 82, home: ["place", "G", 1], away: ["third", ["A", "E", "H", "I", "J"]] },
  { match: 83, home: ["place", "K", 2], away: ["place", "L", 2] },
  { match: 84, home: ["place", "H", 1], away: ["place", "J", 2] },
  { match: 85, home: ["place", "B", 1], away: ["third", ["E", "F", "G", "I", "J"]] },
  { match: 86, home: ["place", "J", 1], away: ["place", "H", 2] },
  { match: 87, home: ["place", "K", 1], away: ["third", ["D", "E", "I", "J", "L"]] },
  { match: 88, home: ["place", "D", 2], away: ["place", "G", 2] },
];

const KNOCKOUT_ROUNDS = [
  ["roundOf16", [[89, 74, 77], [90, 73, 75], [91, 76, 78], [92, 79, 80], [93, 83, 84], [94, 81, 82], [95, 86, 88], [96, 85, 87]]],
  ["quarterfinal", [[97, 89, 90], [98, 93, 94], [99, 91, 92], [100, 95, 96]]],
  ["semifinal", [[101, 97, 98], [102, 99, 100]]],
  ["final", [[104, 101, 102]]],
];

const state = {
  snapshot: null,
  counters: null,
  runs: 0,
};

const elements = {
  snapshotStatus: document.querySelector("#snapshot-status"),
  runStatus: document.querySelector("#run-status"),
  runsInput: document.querySelector("#runs-input"),
  seedInput: document.querySelector("#seed-input"),
  runButton: document.querySelector("#run-button"),
  teamSelect: document.querySelector("#team-select"),
  teamFocus: document.querySelector("#team-focus"),
  homeSelect: document.querySelector("#home-select"),
  awaySelect: document.querySelector("#away-select"),
  matchButton: document.querySelector("#match-button"),
  matchResult: document.querySelector("#match-result"),
  championName: document.querySelector("#champion-name"),
  championValue: document.querySelector("#champion-value"),
  chartRuns: document.querySelector("#chart-runs"),
  championChart: document.querySelector("#champion-chart"),
  probabilityBody: document.querySelector("#probability-body"),
  playedCount: document.querySelector("#played-count"),
  groupsGrid: document.querySelector("#groups-grid"),
};

function mulberry32(seed) {
  let value = seed >>> 0;
  return function random() {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function poisson(lambda, random) {
  const limit = Math.exp(-lambda);
  let product = 1;
  let count = 0;
  while (product > limit) {
    count += 1;
    product *= random();
  }
  return count - 1;
}

function expectedGoals(home, away, ratings) {
  const homeRating = ratings[home] ?? DEFAULT_RATING;
  const awayRating = ratings[away] ?? DEFAULT_RATING;
  const delta = homeRating - awayRating;
  const homeShare = 1 / (1 + 10 ** (-delta / 400));
  const totalGoals = BASE_GOALS + Math.min(Math.abs(delta) / 900, 0.35);
  const homeXg = Math.max(0.2, Math.min(3.5, totalGoals * homeShare));
  const awayXg = Math.max(0.2, Math.min(3.5, totalGoals - homeXg));
  return [homeXg, awayXg];
}

function simulateScore(home, away, ratings, random) {
  const [homeXg, awayXg] = expectedGoals(home, away, ratings);
  return [poisson(homeXg, random), poisson(awayXg, random)];
}

function knockoutWinner(home, away, ratings, random) {
  const [homeGoals, awayGoals] = simulateScore(home, away, ratings, random);
  if (homeGoals > awayGoals) return { winner: home, loser: away };
  if (awayGoals > homeGoals) return { winner: away, loser: home };

  const homeRating = ratings[home] ?? DEFAULT_RATING;
  const awayRating = ratings[away] ?? DEFAULT_RATING;
  const homeWinProbability = 1 / (1 + 10 ** (-(homeRating - awayRating) / 500));
  return random() < homeWinProbability ? { winner: home, loser: away } : { winner: away, loser: home };
}

function emptyStats(team) {
  return {
    team,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: 0,
  };
}

function goalDifference(stats) {
  return stats.goalsFor - stats.goalsAgainst;
}

function applyScore(table, home, away, homeGoals, awayGoals) {
  const homeStats = table[home];
  const awayStats = table[away];
  homeStats.played += 1;
  awayStats.played += 1;
  homeStats.goalsFor += homeGoals;
  homeStats.goalsAgainst += awayGoals;
  awayStats.goalsFor += awayGoals;
  awayStats.goalsAgainst += homeGoals;

  if (homeGoals > awayGoals) {
    homeStats.wins += 1;
    homeStats.points += 3;
    awayStats.losses += 1;
  } else if (homeGoals < awayGoals) {
    awayStats.wins += 1;
    awayStats.points += 3;
    homeStats.losses += 1;
  } else {
    homeStats.draws += 1;
    awayStats.draws += 1;
    homeStats.points += 1;
    awayStats.points += 1;
  }
}

function scoreOf(match) {
  return Array.isArray(match.score) ? match.score : null;
}

function headToHeadStats(teams, matches) {
  const table = Object.fromEntries([...teams].map((team) => [team, emptyStats(team)]));
  for (const match of matches) {
    const score = scoreOf(match);
    if (!score || !teams.has(match.home) || !teams.has(match.away)) continue;
    applyScore(table, match.home, match.away, score[0], score[1]);
  }
  return table;
}

function rankGroup(teams, table, matches, ratings) {
  return [...teams].sort((a, b) => {
    const aStats = table[a];
    const bStats = table[b];
    if (aStats.points !== bStats.points) return bStats.points - aStats.points;

    const tied = new Set(teams.filter((team) => table[team].points === aStats.points));
    if (tied.size > 1) {
      const mini = headToHeadStats(tied, matches);
      const pairs = [
        [mini[a].points, mini[b].points],
        [goalDifference(mini[a]), goalDifference(mini[b])],
        [mini[a].goalsFor, mini[b].goalsFor],
      ];
      for (const [aValue, bValue] of pairs) {
        if (aValue !== bValue) return bValue - aValue;
      }
    }

    const pairs = [
      [goalDifference(aStats), goalDifference(bStats)],
      [aStats.goalsFor, bStats.goalsFor],
      [ratings[a] ?? DEFAULT_RATING, ratings[b] ?? DEFAULT_RATING],
    ];
    for (const [aValue, bValue] of pairs) {
      if (aValue !== bValue) return bValue - aValue;
    }
    return a.localeCompare(b);
  });
}

function buildCurrentGroups(snapshot) {
  const tables = {};
  const rankings = {};
  for (const [group, teams] of Object.entries(snapshot.groups)) {
    const table = Object.fromEntries(teams.map((team) => [team, emptyStats(team)]));
    const matches = snapshot.matches.filter((match) => match.group === group);
    for (const match of matches) {
      const score = scoreOf(match);
      if (score) applyScore(table, match.home, match.away, score[0], score[1]);
    }
    tables[group] = table;
    rankings[group] = rankGroup(teams, table, matches, snapshot.ratings);
  }
  return { tables, rankings };
}

function simulateGroupStage(snapshot, random) {
  const groupRankings = {};
  const allStats = {};

  for (const [group, teams] of Object.entries(snapshot.groups)) {
    const table = Object.fromEntries(teams.map((team) => [team, emptyStats(team)]));
    const matches = [];
    for (const match of snapshot.matches.filter((item) => item.group === group)) {
      const copied = { ...match };
      let score = scoreOf(copied);
      if (!score) {
        score = simulateScore(copied.home, copied.away, snapshot.ratings, random);
        copied.score = score;
      }
      applyScore(table, copied.home, copied.away, score[0], score[1]);
      matches.push(copied);
    }
    Object.assign(allStats, table);
    groupRankings[group] = rankGroup(teams, table, matches, snapshot.ratings);
  }

  return { groupRankings, allStats };
}

function rankThirdPlaced(groupRankings, allStats, ratings) {
  return Object.entries(groupRankings)
    .map(([group, ranking]) => {
      const team = ranking[2];
      const stats = allStats[team];
      return {
        group,
        team,
        points: stats.points,
        goalDifference: goalDifference(stats),
        goalsFor: stats.goalsFor,
        rating: ratings[team] ?? DEFAULT_RATING,
      };
    })
    .sort((a, b) => {
      const pairs = [
        [a.points, b.points],
        [a.goalDifference, b.goalDifference],
        [a.goalsFor, b.goalsFor],
        [a.rating, b.rating],
      ];
      for (const [aValue, bValue] of pairs) {
        if (aValue !== bValue) return bValue - aValue;
      }
      return a.team.localeCompare(b.team);
    });
}

function assignThirdPlaceSlots(qualifiedThirds) {
  const orderedGroups = qualifiedThirds.map((item) => item.group);
  const teamsByGroup = Object.fromEntries(qualifiedThirds.map((item) => [item.group, item.team]));
  const thirdSlots = ROUND_OF_32.filter((slot) => slot.away[0] === "third");

  function search(index, available, assigned) {
    if (index === thirdSlots.length) return assigned;
    const slot = thirdSlots[index];
    const matchNumber = slot.match;
    const eligible = new Set(slot.away[1]);
    const options = orderedGroups.filter((group) => available.has(group) && eligible.has(group));

    for (const group of options) {
      const nextAvailable = new Set(available);
      nextAvailable.delete(group);
      const result = search(index + 1, nextAvailable, {
        ...assigned,
        [matchNumber]: { group, team: teamsByGroup[group] },
      });
      if (result) return result;
    }
    return null;
  }

  const assigned = search(0, new Set(orderedGroups.slice(0, 8)), {});
  if (assigned) return assigned;

  const fallback = {};
  const available = new Set(orderedGroups.slice(0, 8));
  for (const slot of thirdSlots) {
    const eligible = new Set(slot.away[1]);
    const candidate = orderedGroups.find((group) => available.has(group) && eligible.has(group)) ?? [...available][0];
    available.delete(candidate);
    fallback[slot.match] = { group: candidate, team: teamsByGroup[candidate] };
  }
  return fallback;
}

function resolveSlot(slot, groupRankings, thirdAssignments, matchNumber) {
  if (slot[0] === "place") return groupRankings[slot[1]][slot[2] - 1];
  return thirdAssignments[matchNumber].team;
}

function simulateKnockout(groupRankings, qualifiedThirds, ratings, random) {
  const thirdAssignments = assignThirdPlaceSlots(qualifiedThirds.slice(0, 8));
  const matchResults = {};
  const roundParticipants = {
    roundOf32: new Set(),
    roundOf16: new Set(),
    quarterfinal: new Set(),
    semifinal: new Set(),
    final: new Set(),
  };

  for (const slot of ROUND_OF_32) {
    const home = resolveSlot(slot.home, groupRankings, thirdAssignments, slot.match);
    const away = resolveSlot(slot.away, groupRankings, thirdAssignments, slot.match);
    const result = knockoutWinner(home, away, ratings, random);
    matchResults[slot.match] = { home, away, ...result };
    roundParticipants.roundOf32.add(home);
    roundParticipants.roundOf32.add(away);
  }

  for (const [roundName, pairings] of KNOCKOUT_ROUNDS) {
    for (const [matchNumber, leftMatch, rightMatch] of pairings) {
      const home = matchResults[leftMatch].winner;
      const away = matchResults[rightMatch].winner;
      roundParticipants[roundName].add(home);
      roundParticipants[roundName].add(away);
      matchResults[matchNumber] = { home, away, ...knockoutWinner(home, away, ratings, random) };
    }
  }

  return {
    champion: matchResults[104].winner,
    roundParticipants,
  };
}

function increment(counter, key, amount = 1) {
  counter[key] = (counter[key] ?? 0) + amount;
}

function runMany(snapshot, runs, seed) {
  const random = mulberry32(seed);
  const counters = {
    roundOf32: {},
    roundOf16: {},
    quarterfinal: {},
    semifinal: {},
    final: {},
    champion: {},
  };

  for (let index = 0; index < runs; index += 1) {
    const { groupRankings, allStats } = simulateGroupStage(snapshot, random);
    const qualifiedThirds = rankThirdPlaced(groupRankings, allStats, snapshot.ratings);
    const knockout = simulateKnockout(groupRankings, qualifiedThirds, snapshot.ratings, random);

    for (const [round, teams] of Object.entries(knockout.roundParticipants)) {
      for (const team of teams) increment(counters[round], team);
    }
    increment(counters.champion, knockout.champion);
  }

  return counters;
}

function percent(value, runs) {
  return `${((value ?? 0) * 100 / runs).toFixed(1)}%`;
}

function teamRows(counters, runs) {
  const teams = new Set();
  for (const counter of Object.values(counters)) {
    Object.keys(counter).forEach((team) => teams.add(team));
  }
  return [...teams]
    .map((team) => ({
      team,
      roundOf32: counters.roundOf32[team] ?? 0,
      roundOf16: counters.roundOf16[team] ?? 0,
      quarterfinal: counters.quarterfinal[team] ?? 0,
      semifinal: counters.semifinal[team] ?? 0,
      final: counters.final[team] ?? 0,
      champion: counters.champion[team] ?? 0,
    }))
    .sort((a, b) => b.champion - a.champion || b.final - a.final || b.semifinal - a.semifinal || a.team.localeCompare(b.team))
    .map((row) => ({
      ...row,
      championPct: (row.champion * 100) / runs,
    }));
}

function renderChart(rows) {
  const topRows = rows.slice(0, 12);
  const max = Math.max(...topRows.map((row) => row.championPct), 1);
  elements.championChart.innerHTML = topRows.map((row) => `
    <div class="bar-row">
      <div class="bar-name">${row.team}</div>
      <div class="bar-track"><div class="bar-fill" style="width: ${(row.championPct / max) * 100}%"></div></div>
      <div class="bar-value">${row.championPct.toFixed(1)}%</div>
    </div>
  `).join("");
}

function renderTable(rows, runs) {
  elements.probabilityBody.innerHTML = rows.map((row) => `
    <tr>
      <td>${row.team}</td>
      <td>${percent(row.roundOf32, runs)}</td>
      <td>${percent(row.roundOf16, runs)}</td>
      <td>${percent(row.quarterfinal, runs)}</td>
      <td>${percent(row.semifinal, runs)}</td>
      <td>${percent(row.final, runs)}</td>
      <td>${percent(row.champion, runs)}</td>
    </tr>
  `).join("");
}

function renderTeamFocus() {
  if (!state.counters) return;
  const team = elements.teamSelect.value;
  const counters = state.counters;
  const runs = state.runs;
  elements.teamFocus.innerHTML = `
    <div class="metric-row"><span>R32</span><strong>${percent(counters.roundOf32[team], runs)}</strong></div>
    <div class="metric-row"><span>R16</span><strong>${percent(counters.roundOf16[team], runs)}</strong></div>
    <div class="metric-row"><span>QF</span><strong>${percent(counters.quarterfinal[team], runs)}</strong></div>
    <div class="metric-row"><span>SF</span><strong>${percent(counters.semifinal[team], runs)}</strong></div>
    <div class="metric-row"><span>Final</span><strong>${percent(counters.final[team], runs)}</strong></div>
    <div class="metric-row"><span>Champion</span><strong>${percent(counters.champion[team], runs)}</strong></div>
  `;
}

function renderCurrentGroups(snapshot) {
  const { tables, rankings } = buildCurrentGroups(snapshot);
  const groupNames = Object.keys(snapshot.groups).sort();
  elements.groupsGrid.innerHTML = groupNames.map((group) => `
    <article class="group-card">
      <h3>Group ${group}</h3>
      <ol>
        ${rankings[group].map((team) => {
          const stats = tables[group][team];
          return `<li>${team} - ${stats.points} pts - ${goalDifference(stats)} GD</li>`;
        }).join("")}
      </ol>
    </article>
  `).join("");
}

function renderResults(counters, runs) {
  const rows = teamRows(counters, runs);
  const leader = rows[0];
  elements.championName.textContent = leader?.team ?? "-";
  elements.championValue.textContent = leader ? `${leader.championPct.toFixed(1)}%` : "0.0%";
  elements.chartRuns.textContent = `${runs.toLocaleString()} runs`;
  renderChart(rows);
  renderTable(rows, runs);
  renderTeamFocus();
}

function renderMatchPrediction() {
  const snapshot = state.snapshot;
  const home = elements.homeSelect.value;
  const away = elements.awaySelect.value;
  if (home === away) {
    elements.matchResult.innerHTML = `<span class="error">Choose two teams</span>`;
    return;
  }

  const random = mulberry32(Number(elements.seedInput.value) + 17);
  const runs = 30000;
  const result = { win: 0, draw: 0, loss: 0 };
  for (let index = 0; index < runs; index += 1) {
    const [homeGoals, awayGoals] = simulateScore(home, away, snapshot.ratings, random);
    if (homeGoals > awayGoals) result.win += 1;
    else if (homeGoals === awayGoals) result.draw += 1;
    else result.loss += 1;
  }

  const rows = [
    ["Win", result.win],
    ["Draw", result.draw],
    ["Loss", result.loss],
  ];
  const max = Math.max(...rows.map((row) => row[1]), 1);
  elements.matchResult.innerHTML = `
    <div class="match-bars">
      ${rows.map(([label, value]) => `
        <div class="mini-bar">
          <span>${label}</span>
          <div class="bar-track"><div class="bar-fill" style="width: ${(value / max) * 100}%"></div></div>
          <strong>${percent(value, runs)}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

async function runSimulation() {
  const runs = Math.max(100, Math.min(100000, Number(elements.runsInput.value) || 10000));
  const seed = Number(elements.seedInput.value) || 1;
  elements.runsInput.value = runs;
  elements.runButton.disabled = true;
  elements.runStatus.textContent = "Running";
  await new Promise((resolve) => setTimeout(resolve, 20));
  const counters = runMany(state.snapshot, runs, seed);
  state.counters = counters;
  state.runs = runs;
  renderResults(counters, runs);
  elements.runButton.disabled = false;
  elements.runStatus.textContent = "Complete";
}

function fillTeamSelectors(snapshot) {
  const teams = Object.values(snapshot.groups).flat().sort((a, b) => a.localeCompare(b));
  const options = teams.map((team) => `<option value="${team}">${team}</option>`).join("");
  elements.teamSelect.innerHTML = options;
  elements.homeSelect.innerHTML = options;
  elements.awaySelect.innerHTML = options;
  elements.teamSelect.value = "South Korea";
  elements.homeSelect.value = "South Korea";
  elements.awaySelect.value = "Japan";
}

async function init() {
  try {
    const response = await fetch("../data/world_cup_2026_snapshot.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const snapshot = await response.json();
    state.snapshot = snapshot;
    const played = snapshot.matches.filter((match) => Array.isArray(match.score)).length;
    elements.snapshotStatus.textContent = snapshot.as_of;
    elements.playedCount.textContent = `${played} played matches`;
    fillTeamSelectors(snapshot);
    renderCurrentGroups(snapshot);
    await runSimulation();
    renderMatchPrediction();
  } catch (error) {
    elements.snapshotStatus.textContent = "Data unavailable";
    elements.runStatus.innerHTML = `<span class="error">${error.message}</span>`;
  }
}

elements.runButton.addEventListener("click", runSimulation);
elements.teamSelect.addEventListener("change", renderTeamFocus);
elements.matchButton.addEventListener("click", renderMatchPrediction);
elements.homeSelect.addEventListener("change", renderMatchPrediction);
elements.awaySelect.addEventListener("change", renderMatchPrediction);

init();
