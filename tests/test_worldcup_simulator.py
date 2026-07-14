import unittest

import worldcup_simulator as sim


class WorldCupSimulatorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.snapshot = sim.load_snapshot()

    def test_current_group_a_standings(self):
        tables, rankings = sim.build_current_group_state(self.snapshot)

        self.assertEqual(rankings["A"][0], "Mexico")
        self.assertEqual(tables["A"]["Mexico"].points, 6)
        self.assertEqual(tables["A"]["South Korea"].points, 3)
        self.assertEqual(tables["A"]["Czech Republic"].points, 1)
        self.assertEqual(tables["A"]["South Africa"].points, 1)

    def test_current_group_d_standings(self):
        tables, rankings = sim.build_current_group_state(self.snapshot)

        self.assertEqual(rankings["D"][0], "USA")
        self.assertEqual(tables["D"]["USA"].points, 6)
        self.assertEqual(tables["D"]["Australia"].points, 3)
        self.assertEqual(tables["D"]["Paraguay"].points, 3)
        self.assertEqual(tables["D"]["Turkey"].points, 0)

    def test_single_simulation_has_a_champion(self):
        result = sim.simulate_once(self.snapshot, sim.random.Random(123))
        champion = result["knockout"]["champion"]

        all_teams = {team for teams in self.snapshot["groups"].values() for team in teams}
        self.assertIn(champion, all_teams)

    def test_many_runs_count_all_champions(self):
        runs = 25
        counters = sim.run_many(self.snapshot, runs, seed=456)

        self.assertEqual(sum(counters["champion"].values()), runs)
        self.assertEqual(sum(counters["final"].values()), runs * 2)
        self.assertEqual(sum(counters["round_of_32"].values()), runs * 32)


if __name__ == "__main__":
    unittest.main()
