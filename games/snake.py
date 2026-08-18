#!/usr/bin/env python3
"""A terminal Snake game.

Uses only the Python standard library (curses), so there is nothing to install.

Run it with:

    python3 games/snake.py

Controls:
    arrow keys / WASD   move
    p                   pause
    r                   restart (on the game over screen)
    q                   quit
"""

from __future__ import annotations

import curses
import random
from collections import deque

# Playfield size in cells. Each cell is drawn two characters wide so the
# board looks square in a terminal, where glyphs are roughly twice as tall
# as they are wide.
BOARD_WIDTH = 30
BOARD_HEIGHT = 20
CELL_WIDTH = 2

# Frame delay in milliseconds: the snake starts slow and speeds up as it eats.
START_DELAY_MS = 120
MIN_DELAY_MS = 55
SPEEDUP_PER_FOOD_MS = 3

UP = (0, -1)
DOWN = (0, 1)
LEFT = (-1, 0)
RIGHT = (1, 0)

KEY_TO_DIRECTION = {
    curses.KEY_UP: UP,
    curses.KEY_DOWN: DOWN,
    curses.KEY_LEFT: LEFT,
    curses.KEY_RIGHT: RIGHT,
    ord("w"): UP,
    ord("s"): DOWN,
    ord("a"): LEFT,
    ord("d"): RIGHT,
    ord("W"): UP,
    ord("S"): DOWN,
    ord("A"): LEFT,
    ord("D"): RIGHT,
}

# Room needed around the playfield: a one cell border plus a status line.
CHROME_ROWS = 4
CHROME_COLS = 2


class Snake:
    """The snake: a deque of (x, y) cells, head first."""

    def __init__(self, x: int, y: int, length: int = 3) -> None:
        # Start pointing right, with the tail trailing off to the left.
        self.body = deque((x - offset, y) for offset in range(length))
        self.occupied = set(self.body)
        self.direction = RIGHT

    @property
    def head(self) -> tuple[int, int]:
        return self.body[0]

    def turn(self, direction: tuple[int, int]) -> None:
        """Face a new direction, ignoring a reversal onto our own neck."""
        dx, dy = direction
        cur_dx, cur_dy = self.direction
        if (dx, dy) == (-cur_dx, -cur_dy):
            return
        self.direction = direction

    def next_head(self) -> tuple[int, int]:
        x, y = self.head
        dx, dy = self.direction
        return x + dx, y + dy

    def move(self, cell: tuple[int, int], grow: bool) -> None:
        self.body.appendleft(cell)
        self.occupied.add(cell)
        if not grow:
            self.occupied.discard(self.body.pop())

    def __contains__(self, cell: object) -> bool:
        return cell in self.occupied

    def __len__(self) -> int:
        return len(self.body)


class Game:
    """Game state and rules, independent of how it is drawn."""

    def __init__(self, width: int = BOARD_WIDTH, height: int = BOARD_HEIGHT) -> None:
        self.width = width
        self.height = height
        self.snake = Snake(width // 2, height // 2)
        self.score = 0
        self.over = False
        self.won = False
        self.paused = False
        self.food = self.place_food()

    @property
    def delay_ms(self) -> int:
        return max(MIN_DELAY_MS, START_DELAY_MS - self.score * SPEEDUP_PER_FOOD_MS)

    def place_food(self) -> tuple[int, int] | None:
        """Pick a random empty cell, or None when the board is full."""
        free = [
            (x, y)
            for y in range(self.height)
            for x in range(self.width)
            if (x, y) not in self.snake
        ]
        if not free:
            return None
        return random.choice(free)

    def in_bounds(self, cell: tuple[int, int]) -> bool:
        x, y = cell
        return 0 <= x < self.width and 0 <= y < self.height

    def step(self) -> None:
        """Advance the game by one frame."""
        if self.over or self.paused:
            return

        head = self.snake.next_head()
        if not self.in_bounds(head):
            self.over = True
            return

        eating = head == self.food
        # The tail cell moves out of the way this frame unless we are growing,
        # so following your own tail is legal.
        tail = self.snake.body[-1]
        if head in self.snake and not (head == tail and not eating):
            self.over = True
            return

        self.snake.move(head, grow=eating)
        if eating:
            self.score += 1
            self.food = self.place_food()
            if self.food is None:
                # Every cell is snake — nothing left to eat.
                self.won = True
                self.over = True

    def handle_key(self, key: int) -> None:
        direction = KEY_TO_DIRECTION.get(key)
        if direction is not None:
            if not self.paused:
                self.snake.turn(direction)
        elif key in (ord("p"), ord("P")):
            self.paused = not self.paused


def draw(stdscr: "curses._CursesWindow", game: Game, colors: dict[str, int]) -> None:
    stdscr.erase()

    board_cols = game.width * CELL_WIDTH
    max_y, max_x = stdscr.getmaxyx()
    origin_y = max(0, (max_y - (game.height + CHROME_ROWS)) // 2) + 1
    origin_x = max(0, (max_x - (board_cols + CHROME_COLS)) // 2) + 1

    def put(y: int, x: int, text: str, attr: int = 0) -> None:
        # Writing to the last cell of a curses window raises, so clip the
        # right edge and swallow anything that still lands out of bounds.
        if not (0 <= y < max_y) or x >= max_x:
            return
        try:
            stdscr.addstr(y, x, text[: max_x - x - 1], attr)
        except curses.error:
            pass

    # Border.
    border = colors["border"]
    put(origin_y - 1, origin_x - 1, "+" + "-" * board_cols + "+", border)
    put(origin_y + game.height, origin_x - 1, "+" + "-" * board_cols + "+", border)
    for row in range(game.height):
        put(origin_y + row, origin_x - 1, "|", border)
        put(origin_y + row, origin_x + board_cols, "|", border)

    # Food.
    if game.food is not None:
        fx, fy = game.food
        put(origin_y + fy, origin_x + fx * CELL_WIDTH, "()", colors["food"])

    # Snake, head picked out from the body.
    for index, (x, y) in enumerate(game.snake.body):
        glyph = "[]" if index == 0 else "oo"
        attr = colors["head"] if index == 0 else colors["body"]
        put(origin_y + y, origin_x + x * CELL_WIDTH, glyph, attr)

    # Status line.
    status = f" Score: {game.score}   Length: {len(game.snake)} "
    hint = "arrows/wasd move  p pause  q quit"
    put(origin_y - 2, origin_x - 1, status, colors["status"] | curses.A_BOLD)
    put(origin_y + game.height + 1, origin_x - 1, hint, colors["status"])

    if game.paused:
        banner = " PAUSED — press p to resume "
        put(
            origin_y + game.height // 2,
            origin_x + max(0, (board_cols - len(banner)) // 2),
            banner,
            colors["status"] | curses.A_REVERSE,
        )

    if game.over:
        lines = [
            " YOU FILLED THE BOARD! " if game.won else " GAME OVER ",
            f" Final score: {game.score} ",
            " r restart    q quit ",
        ]
        top = origin_y + game.height // 2 - len(lines) // 2
        for offset, line in enumerate(lines):
            put(
                top + offset,
                origin_x + max(0, (board_cols - len(line)) // 2),
                line,
                colors["status"] | curses.A_REVERSE | curses.A_BOLD,
            )

    stdscr.refresh()


def init_colors() -> dict[str, int]:
    """Set up color pairs, falling back to plain text on mono terminals."""
    plain = {"head": 0, "body": 0, "food": 0, "border": 0, "status": 0}
    if not curses.has_colors():
        return plain

    curses.start_color()
    try:
        curses.use_default_colors()
        background = -1
    except curses.error:
        background = curses.COLOR_BLACK

    pairs = {
        "head": curses.COLOR_GREEN,
        "body": curses.COLOR_CYAN,
        "food": curses.COLOR_RED,
        "border": curses.COLOR_BLUE,
        "status": curses.COLOR_YELLOW,
    }
    colors = {}
    for index, (name, color) in enumerate(pairs.items(), start=1):
        try:
            curses.init_pair(index, color, background)
        except curses.error:
            return plain
        colors[name] = curses.color_pair(index)
    colors["head"] |= curses.A_BOLD
    return colors


def run(stdscr: "curses._CursesWindow") -> int:
    curses.curs_set(0)
    stdscr.keypad(True)
    colors = init_colors()

    max_y, max_x = stdscr.getmaxyx()
    needed_y = BOARD_HEIGHT + CHROME_ROWS
    needed_x = BOARD_WIDTH * CELL_WIDTH + CHROME_COLS
    if max_y < needed_y or max_x < needed_x:
        raise SystemExit(
            f"Terminal too small: need at least {needed_x}x{needed_y}, "
            f"got {max_x}x{max_y}. Resize the window and try again."
        )

    game = Game()
    while True:
        draw(stdscr, game, colors)
        # getch doubles as the frame timer: it returns -1 once the delay
        # elapses with no key pressed.
        stdscr.timeout(-1 if (game.over or game.paused) else game.delay_ms)
        key = stdscr.getch()

        if key in (ord("q"), ord("Q")):
            return game.score
        if game.over:
            if key in (ord("r"), ord("R")):
                game = Game()
            continue
        if key != -1:
            game.handle_key(key)

        game.step()


def main() -> None:
    score = curses.wrapper(run)
    print(f"Final score: {score}")


if __name__ == "__main__":
    main()
