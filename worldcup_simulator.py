#!/usr/bin/env python3
"""Monte Carlo simulator for the 2026 FIFA World Cup.

The simulator starts from a dated snapshot of played matches, simulates the
remaining group fixtures, advances the top two teams plus eight third-place
teams, and then plays out a 32-team knockout bracket.
"""

from __future__ import annotations

import argparse
import json
import math
import random
from collections import Counter, defaultdict
from dataclasses import dataclass
from functools import cmp_to_key
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
DEFAULT_DATA = ROOT / "data" / "world_cup_2026_snapshot.json"
DEFAULT_RATING = 1550
BASE_GOALS = 2.65


ROUND_OF_32 = [
    {"match": 73, "home": ("place", "A", 2), "away": ("place", "B", 2)},
    {"match": 74, "home": ("place", "E", 1), "away": ("third", ("A", "B", "C", "D", "F"))},
    {"match": 75, "home": ("place", "F", 1), "away": ("place", "C", 2)},
    {"match": 76, "home": ("place", "C", 1), "away": ("place", "F", 2)},
    {"match": 77, "home": ("place", "I", 1), "away": ("third", ("C", "D", "F", "G", "H"))},
    {"match": 78, "home": ("place", "E", 2), "away": ("place", "I", 2)},
    {"match": 79, "home": ("place", "A", 1), "away": ("third", ("C", "E", "F", "H", "I"))},
    {"match": 80, "home": ("place", "L", 1), "away": ("third", ("E", "H", "I", "J", "K"))},
    {"match": 81, "home": ("place", "D", 1), "away": ("third", ("B", "E", "F", "I", "J"))},
    {"match": 82, "home": ("place", "G", 1), "away": ("third", ("A", "E", "H", "I", "J"))},
    {"match": 83, "home": ("place", "K", 2), "away": ("place", "L", 2)},
    {"match": 84, "home": ("place", "H", 1), "away": ("place", "J", 2)},
    {"match": 85, "home": ("place", "B", 1), "away": ("third", ("E", "F", "G", "I", "J"))},
    {"match": 86, "home": ("place", "J", 1), "away": ("place", "H", 2)},
    {"match": 87, "home": ("place", "K", 1), "away": ("third", ("D", "E", "I", "J", "L"))},
    {"match": 88, "home": ("place", "D", 2), "away": ("place", "G", 2)},
]

KNOCKOUT_ROUNDS = [
    ("round_of_16", [(89, 74, 77), (90, 73, 75), (91, 76, 78), (92, 79, 80), (93, 83, 84), (94, 81, 82), (95, 86, 88), (96, 85, 87)]),
    ("quarterfinal", [(97, 89, 90), (98, 93, 94), (99, 91, 92), (100, 95, 96)]),
    ("semifinal", [(101, 97, 98), (102, 99, 100)]),
    ("final", [(104, 101, 102)]),
]


@dataclass
class TeamStats:
    team: str
    played: int = 0
    wins: int = 0
    draws: int = 0
    losses: int = 0
    goals_for: int = 0
    goals_against: int = 0
    points: int = 0

    @property
    def goal_difference(self) -> int:
        return self.goals_for - self.goals_against


def load_snapshot(path: Path = DEFAULT_DATA) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def apply_score(table: dict[str, TeamStats], home: str, away: str, home_goals: int, away_goals: int) -> None:
    home_stats = table[home]
    away_stats = table[away]
    home_stats.played += 1
    away_stats.played += 1
    home_stats.goals_for += home_goals
    home_stats.goals_against += away_goals
    away_stats.goals_for += away_goals
    away_stats.goals_against += home_goals

    if home_goals > away_goals:
        home_stats.wins += 1
        home_stats.points += 3
        away_stats.losses += 1
    elif home_goals < away_goals:
        away_stats.wins += 1
        away_stats.points += 3
        home_stats.losses += 1
    else:
        home_stats.draws += 1
        away_stats.draws += 1
        home_stats.points += 1
        away_stats.points += 1


def poisson(lam: float, rng: random.Random) -> int:
    limit = math.exp(-lam)
    product = 1.0
    count = 0
    while product > limit:
        count += 1
        product *= rng.random()
    return count - 1


def expected_goals(home: str, away: str, ratings: dict[str, int]) -> tuple[float, float]:
    home_rating = ratings.get(home, DEFAULT_RATING)
    away_rating = ratings.get(away, DEFAULT_RATING)
    delta = home_rating - away_rating
    home_share = 1.0 / (1.0 + 10.0 ** (-delta / 400.0))
    total_goals = BASE_GOALS + min(abs(delta) / 900.0, 0.35)
    home_xg = max(0.2, min(3.5, total_goals * home_share))
    away_xg = max(0.2, min(3.5, total_goals - home_xg))
    return home_xg, away_xg


def simulate_score(home: str, away: str, ratings: dict[str, int], rng: random.Random) -> tuple[int, int]:
    home_xg, away_xg = expected_goals(home, away, ratings)
    return poisson(home_xg, rng), poisson(away_xg, rng)


def knockout_winner(home: str, away: str, ratings: dict[str, int], rng: random.Random) -> tuple[str, str, tuple[int, int], bool]:
    home_goals, away_goals = simulate_score(home, away, ratings, rng)
    decided_by_penalties = False
    if home_goals > away_goals:
        return home, away, (home_goals, away_goals), decided_by_penalties
    if away_goals > home_goals:
        return away, home, (home_goals, away_goals), decided_by_penalties

    decided_by_penalties = True
    home_rating = ratings.get(home, DEFAULT_RATING)
    away_rating = ratings.get(away, DEFAULT_RATING)
    home_win_probability = 1.0 / (1.0 + 10.0 ** (-(home_rating - away_rating) / 500.0))
    if rng.random() < home_win_probability:
        return home, away, (home_goals, away_goals), decided_by_penalties
    return away, home, (home_goals, away_goals), decided_by_penalties


def played_score(match: dict[str, Any]) -> tuple[int, int] | None:
    score = match.get("score")
    if score is None:
        return None
    return int(score[0]), int(score[1])


def h2h_stats(teams: set[str], matches: list[dict[str, Any]]) -> dict[str, TeamStats]:
    table = {team: TeamStats(team) for team in teams}
    for match in matches:
        home = match["home"]
        away = match["away"]
        score = played_score(match)
        if score is None or home not in teams or away not in teams:
            continue
        apply_score(table, home, away, score[0], score[1])
    return table


def rank_group(
    group: str,
    teams: list[str],
    table: dict[str, TeamStats],
    matches: list[dict[str, Any]],
    ratings: dict[str, int],
) -> list[str]:
    def compare(a: str, b: str) -> int:
        a_stats = table[a]
        b_stats = table[b]
        if a_stats.points != b_stats.points:
            return b_stats.points - a_stats.points

        tied_on_points = {team for team in teams if table[team].points == a_stats.points}
        if len(tied_on_points) > 1:
            mini = h2h_stats(tied_on_points, matches)
            h2h_a = mini[a]
            h2h_b = mini[b]
            for attr in ("points", "goal_difference", "goals_for"):
                a_value = getattr(h2h_a, attr)
                b_value = getattr(h2h_b, attr)
                if a_value != b_value:
                    return -1 if a_value > b_value else 1

        for attr in ("goal_difference", "goals_for"):
            a_value = getattr(a_stats, attr)
            b_value = getattr(b_stats, attr)
            if a_value != b_value:
                return -1 if a_value > b_value else 1

        rating_delta = ratings.get(b, DEFAULT_RATING) - ratings.get(a, DEFAULT_RATING)
        if rating_delta:
            return rating_delta
        return -1 if a < b else 1 if a > b else 0

    return sorted(teams, key=cmp_to_key(compare))


def build_current_group_state(snapshot: dict[str, Any]) -> tuple[dict[str, dict[str, TeamStats]], dict[str, list[str]]]:
    ratings = snapshot["ratings"]
    tables: dict[str, dict[str, TeamStats]] = {}
    ranked: dict[str, list[str]] = {}
    for group, teams in snapshot["groups"].items():
        table = {team: TeamStats(team) for team in teams}
        group_matches = [match for match in snapshot["matches"] if match["group"] == group]
        for match in group_matches:
            score = played_score(match)
            if score is not None:
                apply_score(table, match["home"], match["away"], score[0], score[1])
        tables[group] = table
        ranked[group] = rank_group(group, teams, table, group_matches, ratings)
    return tables, ranked


def simulate_group_stage(
    snapshot: dict[str, Any], rng: random.Random
) -> tuple[dict[str, list[str]], dict[str, TeamStats], dict[str, list[dict[str, Any]]]]:
    ratings = snapshot["ratings"]
    all_stats: dict[str, TeamStats] = {}
    group_rankings: dict[str, list[str]] = {}
    simulated_matches: dict[str, list[dict[str, Any]]] = {}

    for group, teams in snapshot["groups"].items():
        table = {team: TeamStats(team) for team in teams}
        group_matches = []
        for match in snapshot["matches"]:
            if match["group"] != group:
                continue
            copied = dict(match)
            score = played_score(copied)
            if score is None:
                score = simulate_score(copied["home"], copied["away"], ratings, rng)
                copied["score"] = list(score)
            apply_score(table, copied["home"], copied["away"], score[0], score[1])
            group_matches.append(copied)
        all_stats.update(table)
        simulated_matches[group] = group_matches
        group_rankings[group] = rank_group(group, teams, table, group_matches, ratings)

    return group_rankings, all_stats, simulated_matches


def rank_third_placed(
    group_rankings: dict[str, list[str]], all_stats: dict[str, TeamStats], ratings: dict[str, int]
) -> list[tuple[str, str]]:
    thirds = []
    for group, ranking in group_rankings.items():
        team = ranking[2]
        stats = all_stats[team]
        thirds.append((group, team, stats.points, stats.goal_difference, stats.goals_for, ratings.get(team, DEFAULT_RATING)))
    thirds.sort(key=lambda item: (item[2], item[3], item[4], item[5]), reverse=True)
    return [(group, team) for group, team, *_ in thirds]


def assign_third_place_slots(
    qualified_thirds: list[tuple[str, str]], slots: list[dict[str, Any]]
) -> dict[int, tuple[str, str]]:
    ordered_groups = [group for group, _team in qualified_thirds]
    teams_by_group = dict(qualified_thirds)

    def search(index: int, available: set[str], assigned: dict[int, tuple[str, str]]) -> dict[int, tuple[str, str]] | None:
        if index == len(slots):
            return assigned
        slot = slots[index]
        match_number = slot["match"]
        eligible = set(slot["away"][1])
        options = [group for group in ordered_groups if group in available and group in eligible]
        for group in options:
            next_assigned = dict(assigned)
            next_assigned[match_number] = (group, teams_by_group[group])
            result = search(index + 1, available - {group}, next_assigned)
            if result is not None:
                return result
        return None

    third_slots = [slot for slot in slots if slot["away"][0] == "third"]
    assigned = search(0, set(ordered_groups[:8]), {})
    if assigned is not None:
        return assigned

    # Fallback for unusual combinations: keep every qualified third in the
    # bracket, choosing the best available team that can fit each slot.
    fallback: dict[int, tuple[str, str]] = {}
    available = set(ordered_groups[:8])
    for slot in third_slots:
        eligible = set(slot["away"][1])
        candidates = [group for group in ordered_groups if group in available and group in eligible]
        if not candidates:
            candidates = [group for group in ordered_groups if group in available]
        group = candidates[0]
        available.remove(group)
        fallback[slot["match"]] = (group, teams_by_group[group])
    return fallback


def resolve_slot(slot: tuple[Any, ...], group_rankings: dict[str, list[str]], third_assignments: dict[int, tuple[str, str]], match_number: int) -> str:
    if slot[0] == "place":
        _kind, group, place = slot
        return group_rankings[group][place - 1]
    if slot[0] == "third":
        return third_assignments[match_number][1]
    raise ValueError(f"Unknown bracket slot: {slot}")


def simulate_knockout(
    group_rankings: dict[str, list[str]], qualified_thirds: list[tuple[str, str]], ratings: dict[str, int], rng: random.Random
) -> dict[str, Any]:
    third_assignments = assign_third_place_slots(qualified_thirds[:8], ROUND_OF_32)
    match_results: dict[int, dict[str, Any]] = {}
    r32_teams: set[str] = set()

    for slot in ROUND_OF_32:
        match_number = slot["match"]
        home = resolve_slot(slot["home"], group_rankings, third_assignments, match_number)
        away = resolve_slot(slot["away"], group_rankings, third_assignments, match_number)
        winner, loser, score, penalties = knockout_winner(home, away, ratings, rng)
        match_results[match_number] = {
            "home": home,
            "away": away,
            "winner": winner,
            "loser": loser,
            "score": score,
            "penalties": penalties,
        }
        r32_teams.update((home, away))

    round_winners: dict[str, set[str]] = {"round_of_32": {result["winner"] for result in match_results.values() if result}}
    round_participants: dict[str, set[str]] = {"round_of_32": r32_teams}

    for round_name, pairings in KNOCKOUT_ROUNDS:
        participants: set[str] = set()
        winners: set[str] = set()
        for match_number, left_match, right_match in pairings:
            home = match_results[left_match]["winner"]
            away = match_results[right_match]["winner"]
            winner, loser, score, penalties = knockout_winner(home, away, ratings, rng)
            participants.update((home, away))
            winners.add(winner)
            match_results[match_number] = {
                "home": home,
                "away": away,
                "winner": winner,
                "loser": loser,
                "score": score,
                "penalties": penalties,
            }
        round_participants[round_name] = participants
        round_winners[round_name] = winners

    final = match_results[104]
    return {
        "matches": match_results,
        "round_participants": round_participants,
        "round_winners": round_winners,
        "champion": final["winner"],
        "runner_up": final["loser"],
        "qualified_thirds": qualified_thirds[:8],
        "third_assignments": third_assignments,
    }


def simulate_once(snapshot: dict[str, Any], rng: random.Random) -> dict[str, Any]:
    group_rankings, all_stats, _matches = simulate_group_stage(snapshot, rng)
    qualified_thirds = rank_third_placed(group_rankings, all_stats, snapshot["ratings"])
    knockout = simulate_knockout(group_rankings, qualified_thirds, snapshot["ratings"], rng)
    return {
        "groups": group_rankings,
        "stats": all_stats,
        "knockout": knockout,
    }


def run_many(snapshot: dict[str, Any], runs: int, seed: int | None) -> dict[str, Counter[str]]:
    rng = random.Random(seed)
    counters: dict[str, Counter[str]] = {
        "round_of_32": Counter(),
        "round_of_16": Counter(),
        "quarterfinal": Counter(),
        "semifinal": Counter(),
        "final": Counter(),
        "champion": Counter(),
    }

    for _ in range(runs):
        result = simulate_once(snapshot, rng)
        knockout = result["knockout"]
        counters["round_of_32"].update(knockout["round_participants"]["round_of_32"])
        counters["round_of_16"].update(knockout["round_participants"]["round_of_16"])
        counters["quarterfinal"].update(knockout["round_participants"]["quarterfinal"])
        counters["semifinal"].update(knockout["round_participants"]["semifinal"])
        counters["final"].update(knockout["round_participants"]["final"])
        counters["champion"].update([knockout["champion"]])

    return counters


def percent(count: int, runs: int) -> str:
    return f"{(100.0 * count / runs):5.1f}%"


def print_current_standings(snapshot: dict[str, Any]) -> None:
    tables, rankings = build_current_group_state(snapshot)
    print("Current group standings from snapshot")
    print(f"As of: {snapshot['as_of']}")
    print()
    for group in sorted(snapshot["groups"]):
        print(f"Group {group}")
        print("  Team                      P  W  D  L  GF GA  GD Pts")
        for team in rankings[group]:
            stats = tables[group][team]
            print(
                f"  {team:<24} {stats.played:>1}  {stats.wins:>1}  {stats.draws:>1}  {stats.losses:>1}"
                f"  {stats.goals_for:>2} {stats.goals_against:>2} {stats.goal_difference:>3} {stats.points:>3}"
            )
        print()


def print_probability_table(counters: dict[str, Counter[str]], runs: int, top: int) -> None:
    teams = set()
    for counter in counters.values():
        teams.update(counter)
    ordered = sorted(teams, key=lambda team: (counters["champion"][team], counters["final"][team], counters["semifinal"][team]), reverse=True)
    print(f"Monte Carlo projection ({runs:,} runs)")
    print("Team                       R32    R16     QF     SF  Final  Champ")
    for team in ordered[:top]:
        print(
            f"{team:<24}"
            f" {percent(counters['round_of_32'][team], runs)}"
            f" {percent(counters['round_of_16'][team], runs)}"
            f" {percent(counters['quarterfinal'][team], runs)}"
            f" {percent(counters['semifinal'][team], runs)}"
            f" {percent(counters['final'][team], runs)}"
            f" {percent(counters['champion'][team], runs)}"
        )


def print_single_run(snapshot: dict[str, Any], seed: int | None) -> None:
    rng = random.Random(seed)
    result = simulate_once(snapshot, rng)
    knockout = result["knockout"]
    print("Single simulated tournament")
    print(f"Champion: {knockout['champion']}")
    print(f"Runner-up: {knockout['runner_up']}")
    print()
    print("Group ranking")
    for group in sorted(result["groups"]):
        print(f"  {group}: {', '.join(result['groups'][group])}")
    print()
    print("Round of 32")
    for match_number in range(73, 89):
        match = knockout["matches"][match_number]
        score = f"{match['score'][0]}-{match['score'][1]}"
        suffix = " pens" if match["penalties"] else ""
        print(f"  M{match_number}: {match['home']} {score} {match['away']} -> {match['winner']}{suffix}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Simulate the 2026 FIFA World Cup from a dated data snapshot.")
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA, help="Path to the tournament snapshot JSON.")
    parser.add_argument("--runs", type=int, default=10000, help="Number of Monte Carlo runs.")
    parser.add_argument("--seed", type=int, default=20260621, help="Random seed for reproducible output.")
    parser.add_argument("--top", type=int, default=16, help="Rows to show in the probability table.")
    parser.add_argument("--standings", action="store_true", help="Only print current group standings.")
    parser.add_argument("--one", action="store_true", help="Print one full simulated path instead of probabilities.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.runs < 1:
        raise SystemExit("--runs must be at least 1")
    snapshot = load_snapshot(args.data)
    if args.standings:
        print_current_standings(snapshot)
        return
    if args.one:
        print_single_run(snapshot, args.seed)
        return

    print(f"Snapshot: {snapshot['name']} ({snapshot['as_of']})")
    print(f"Played group matches fixed in data: {sum(1 for match in snapshot['matches'] if played_score(match) is not None)}")
    print()
    print_current_standings(snapshot)
    counters = run_many(snapshot, args.runs, args.seed)
    print_probability_table(counters, args.runs, args.top)


if __name__ == "__main__":
    main()
