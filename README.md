# hyperion

A Django project, plus a Snake game that comes in two versions.

**[Play it in your browser](https://njohnpaull1999.github.io/hyperion/)**

| Path | What it is |
| --- | --- |
| `games/snake.py` | Snake for the terminal, written against `curses` |
| `docs/index.html` | The same game on a canvas, served by GitHub Pages |
| `docs/duel.html` | Two-player duel against a local bot |
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

## Snake Duel

[`docs/duel.html`](docs/duel.html) is a one-on-one match against a bot, on the
same board, with no server involved.

Each player owns five food items, tinted to their colour, and can only eat their
own. Clear your five and a single gold food appears; taking it wins the round.
First to three rounds wins the match.

- **Move into the other snake and you are out.** The snake you hit is unharmed.
- **Head-on, the longer snake survives.** Equal lengths eliminate both. Length is
  measured after that tick's growth, so eating as you collide can win the duel —
  which is why both lengths are always on screen.
- **Losing does not end the match.** You respawn at starting size with brief
  protection, your progress for the round resets, and your next five food items
  are placed closer to you the further behind you are. That bias never applies to
  the gold.
- **A round has a time limit.** Two long snakes can circle each other forever
  with the gold untouched, so an overrunning round is awarded on progress:
  most food eaten, then greatest length, then to whoever is behind on score. In
  practice it settles fewer than one round in twenty.
- The bot has three settings. They differ only in how much it knows — whether it
  checks the space a move leads into, whether it keeps a route back to its own
  tail, and whether it plays the head-on rule against you.

Both snakes move on the same tick, and collisions are judged only after both
heads have moved. Resolving them one snake at a time would quietly favour
whichever snake was processed first.

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
node tests/browser/duel-test.js            # duel
```

Neither needs anything installed. Both run in CI on every push and pull request.

The duel suite drives the rules engine that `docs/duel.html` exposes on
`window`, so scenarios that only happen on a single tick — a head-on at equal
length, an opponent's tail that is growing rather than moving — can be set up
directly. It also plays fifteen seeded bot-versus-bot matches to a winner,
checking every invariant on every tick.

The browser suite is worth a note: it extracts the real `<script>` from
`docs/index.html` and runs it against DOM stubs, with the canvas stub recording
draw calls. That means it reads the actual rendered board back rather than
mocking the renderer away, so the shipped code is what gets tested.

## The Django app

See [`hyperion-app/README.md`](hyperion-app/README.md). It is unrelated to the
game.
