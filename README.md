# hyperion

A Django project, plus a Snake game that comes in two versions.

**[Play it in your browser](https://njohnpaull1999.github.io/hyperion/)**

| Path | What it is |
| --- | --- |
| `games/snake.py` | Snake for the terminal, written against `curses` |
| `docs/index.html` | The same game on a canvas, served by GitHub Pages |
| `tests/` | Rule tests for both versions |
| `hyperion-app/` | The Django project |

## Playing in the terminal

```bash
python3 games/snake.py
```

Nothing to install — `curses` ships with Python. Two caveats:

- The terminal has to be at least **62×24**. Smaller and the game exits with a
  message telling you the size it needs.
- **On Windows**, `curses` is not part of the standard library. Run
  `pip install windows-curses` first, or use WSL.

Arrow keys or `WASD` to steer, `p` to pause, `r` to restart once you have died,
`q` to quit.

## Playing in the browser

Open `docs/index.html` directly, or visit the
[live site](https://njohnpaull1999.github.io/hyperion/). It is one self-contained
file with no dependencies and no build step, which is why Pages needs no
workflow: pushing to `master` publishes it.

Same controls, plus swipe to steer and tap to pause on a touchscreen. Your best
score is kept in the browser.

## The rules, in both versions

Both versions implement the same game:

- Walls and your own body end the run. **Following your own tail is legal** —
  the tail cell vacates on the same frame you enter it.
- A reversal onto your own neck is ignored rather than being an instant death.
- Eating grows you by one and speeds the game up: the delay between moves is
  `max(55, 120 - 3 × score)` milliseconds.
- Filling the entire board is a win, not a crash.

They are separate implementations, so a change to one is a change to both.

## Tests

```bash
python3 -m unittest discover -s tests -v   # terminal version
node tests/browser/test.js                 # browser version
```

Neither needs anything installed. Both run in CI on every push and pull request.

The browser suite is worth a note: it extracts the real `<script>` from
`docs/index.html` and runs it against DOM stubs, with the canvas stub recording
draw calls. That means it reads the actual rendered board back rather than
mocking the renderer away, so the shipped code is what gets tested.

## The Django app

See [`hyperion-app/README.md`](hyperion-app/README.md). It is unrelated to the
game.
