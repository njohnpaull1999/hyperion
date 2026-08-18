"""Rule tests for the terminal Snake game.

Uses unittest from the standard library so the suite runs with no install:

    python3 -m unittest discover -s tests -v
"""

from __future__ import annotations

import os
import random
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "games"))

from snake import DOWN, LEFT, RIGHT, UP, Game, Snake  # noqa: E402


class TestStartingState(unittest.TestCase):
    def test_snake_starts_centred_and_three_long(self) -> None:
        game = Game(10, 10)
        self.assertEqual(len(game.snake), 3)
        self.assertEqual(game.snake.head, (5, 5))
        self.assertEqual(game.snake.direction, RIGHT)

    def test_food_never_starts_inside_the_snake(self) -> None:
        for _ in range(200):
            game = Game(6, 6)
            self.assertNotIn(game.food, game.snake)

    def test_occupied_set_matches_the_body(self) -> None:
        game = Game(10, 10)
        self.assertEqual(len(game.snake.occupied), len(game.snake.body))


class TestMovement(unittest.TestCase):
    def test_moves_in_the_current_direction(self) -> None:
        game = Game(10, 10)
        game.food = (0, 0)
        game.step()
        self.assertEqual(game.snake.head, (6, 5))

    def test_turning_changes_direction(self) -> None:
        game = Game(10, 10)
        game.food = (0, 0)
        game.snake.turn(UP)
        game.step()
        self.assertEqual(game.snake.head, (5, 4))

    def test_reversing_onto_the_neck_is_ignored(self) -> None:
        game = Game(10, 10)
        game.food = (0, 0)
        game.snake.turn(LEFT)
        self.assertEqual(game.snake.direction, RIGHT)
        game.step()
        self.assertEqual(game.snake.head, (6, 5))
        self.assertFalse(game.over)

    def test_length_is_unchanged_when_not_eating(self) -> None:
        game = Game(10, 10)
        game.food = (0, 0)
        for _ in range(3):
            game.step()
        self.assertEqual(len(game.snake), 3)


class TestCollisions(unittest.TestCase):
    def test_running_into_a_wall_ends_the_game(self) -> None:
        game = Game(5, 5)
        game.food = None
        for _ in range(10):
            game.step()
        self.assertTrue(game.over)
        self.assertFalse(game.won)

    def test_running_into_itself_ends_the_game(self) -> None:
        # A snake shorter than five cells cannot physically reach itself.
        game = Game(10, 10)
        game.snake = Snake(5, 5, length=6)
        game.food = (0, 0)
        for direction in (UP, LEFT, DOWN, RIGHT):
            game.snake.turn(direction)
            game.step()
            if game.over:
                break
        self.assertTrue(game.over)

    def test_following_your_own_tail_is_legal(self) -> None:
        # The tail cell vacates on the same frame, so this must not be a death.
        game = Game(10, 10)
        game.snake = Snake(5, 5, length=4)
        game.food = (0, 0)
        for direction in (UP, LEFT, DOWN, RIGHT):
            game.snake.turn(direction)
            game.step()
            self.assertFalse(game.over, f"died turning {direction}")


class TestEating(unittest.TestCase):
    def test_eating_scores_and_grows(self) -> None:
        game = Game(10, 10)
        game.food = game.snake.next_head()
        game.step()
        self.assertEqual(game.score, 1)
        self.assertEqual(len(game.snake), 4)

    def test_new_food_never_lands_on_the_snake(self) -> None:
        game = Game(8, 8)
        for _ in range(20):
            game.food = game.snake.next_head()
            game.step()
            self.assertNotIn(game.food, game.snake)

    def test_filling_the_board_is_a_win_not_a_crash(self) -> None:
        game = Game(2, 1)
        game.snake = Snake(0, 0, length=1)
        game.snake.direction = RIGHT
        game.food = (1, 0)
        game.step()
        self.assertTrue(game.won)
        self.assertTrue(game.over)
        self.assertEqual(game.score, 1)
        self.assertIsNone(game.food)


class TestSpeed(unittest.TestCase):
    def test_delay_shrinks_with_score_and_clamps(self) -> None:
        game = Game(10, 10)
        self.assertEqual(game.delay_ms, 120)
        game.score = 5
        self.assertEqual(game.delay_ms, 105)
        game.score = 1000
        self.assertEqual(game.delay_ms, 55)


class TestPause(unittest.TestCase):
    def test_pause_freezes_the_snake_and_resumes(self) -> None:
        game = Game(10, 10)
        game.food = (0, 0)
        game.handle_key(ord("p"))
        head = game.snake.head
        for _ in range(20):
            game.step()
        self.assertTrue(game.paused)
        self.assertEqual(game.snake.head, head)
        self.assertFalse(game.over)

        game.handle_key(ord("p"))
        game.step()
        self.assertFalse(game.paused)
        self.assertNotEqual(game.snake.head, head)

    def test_steering_is_ignored_while_paused(self) -> None:
        game = Game(10, 10)
        game.handle_key(ord("p"))
        game.handle_key(ord("w"))
        self.assertEqual(game.snake.direction, RIGHT)


class TestFuzz(unittest.TestCase):
    def test_random_play_holds_every_invariant(self) -> None:
        random.seed(7)
        keys = [ord("w"), ord("a"), ord("s"), ord("d")]
        for _ in range(30):
            game = Game(12, 12)
            for _ in range(400):
                if game.over:
                    break
                if random.random() < 0.25:
                    game.handle_key(random.choice(keys))
                game.step()

                self.assertEqual(len(game.snake.occupied), len(game.snake.body))
                self.assertEqual(len(set(game.snake.body)), len(game.snake.body))
                if game.food is not None:
                    self.assertNotIn(game.food, game.snake)
                for cell in game.snake.body:
                    self.assertTrue(game.in_bounds(cell))
                self.assertEqual(len(game.snake), 3 + game.score)


if __name__ == "__main__":
    unittest.main()
