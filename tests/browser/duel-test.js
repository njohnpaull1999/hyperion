const { loadEngine, scenario } = require('./duel-harness');
const assert = require('assert');

const E = loadEngine();
const { UP, DOWN, LEFT, RIGHT } = E;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  PASS  ' + name); }
  catch (e) { failed++; console.log('  FAIL  ' + name + '\n        ' + e.message); }
}

// Arrays built inside the VM have a different prototype to the host realm's,
// so deepStrictEqual rejects them. These helpers copy into host arrays.
// Note also that elimination respawns immediately, so `deaths` is what tells
// you a snake died this tick -- `alive` is true again by the time step returns.
const deaths = (m) => Array.from(m.snakes, (s) => s.deaths);
const scores = (m) => Array.from(m.snakes, (s) => s.score);
const lens = (m) => Array.from(m.snakes, (s) => s.body.length);
const foods = (m) => Array.from(m.snakes, (s) => s.food.length);
const eaten = (m) => Array.from(m.snakes, (s) => s.eaten);

// ---------------------------------------------------------------- setup

test('a new match gives each player five owned food items', () => {
  const m = E.createMatch({ seed: 3 });
  assert.deepStrictEqual(foods(m), [5, 5]);
  assert.strictEqual(m.gold, null, 'gold must not exist before anyone is ready');
  assert.deepStrictEqual(lens(m), [3, 3]);
});

test('food never overlaps a snake, the other player\'s food, or itself', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const m = E.createMatch({ seed });
    const seen = new Set();
    const bodies = new Set();
    m.snakes.forEach((s) => s.body.forEach((c) => bodies.add(c.x + ',' + c.y)));
    m.snakes.forEach((s) => s.food.forEach((f) => {
      const k = f.x + ',' + f.y;
      assert.ok(!bodies.has(k), 'food inside a snake at seed ' + seed);
      assert.ok(!seen.has(k), 'two food items share a cell at seed ' + seed);
      seen.add(k);
    }));
  }
});

// ---------------------------------------------------- elimination rules

test('a wall eliminates the snake that hit it', () => {
  const m = scenario(E, { snakes: [
    { body: [[0, 5], [1, 5], [2, 5]], direction: LEFT },
    // Body trails behind the head: heading left, the tail is to the right.
    { body: [[20, 15], [21, 15], [22, 15]], direction: LEFT },
  ] });
  E.stepMatch(m);
  assert.deepStrictEqual(deaths(m), [1, 0], 'only the wall-hitter should have died');
});

test('moving into the opponent eliminates the mover, not the opponent', () => {
  // Player 0 drives right into the side of player 1's body.
  const m = scenario(E, { snakes: [
    { body: [[9, 10], [8, 10], [7, 10]], direction: RIGHT },
    { body: [[10, 9], [10, 10], [10, 11]], direction: UP },
  ] });
  E.stepMatch(m);
  assert.deepStrictEqual(deaths(m), [1, 0], 'the mover dies, the snake hit survives');
});

test('head-on: the longer snake survives', () => {
  const m = scenario(E, {
    snakes: [
      { body: [[9, 10], [8, 10], [7, 10], [6, 10], [5, 10]], direction: RIGHT },
      { body: [[11, 10], [12, 10], [13, 10]], direction: LEFT },
    ],
  });
  E.stepMatch(m);
  assert.deepStrictEqual(deaths(m), [0, 1], 'longer lives, shorter dies');
});

test('head-on: equal lengths eliminate both', () => {
  const m = scenario(E, { snakes: [
    { body: [[9, 10], [8, 10], [7, 10]], direction: RIGHT },
    { body: [[11, 10], [12, 10], [13, 10]], direction: LEFT },
  ] });
  E.stepMatch(m);
  assert.deepStrictEqual(deaths(m), [1, 1]);
});

test('head-on length is measured after this tick\'s growth', () => {
  // Equal at 3 each, but player 0 eats on the very tick they collide, so it
  // becomes 4 against 3 and player 0 should survive.
  const m = scenario(E, {
    snakes: [
      { body: [[9, 10], [8, 10], [7, 10]], direction: RIGHT, food: [[10, 10]] },
      { body: [[11, 10], [12, 10], [13, 10]], direction: LEFT, food: [] },
    ],
  });
  E.stepMatch(m);
  assert.deepStrictEqual(deaths(m), [0, 1], 'eating on the duel tick should win it');
});

test('order independence: swapping the players mirrors the result exactly', () => {
  // The direct test for the simultaneity bug. Every scenario is played twice,
  // with the snakes swapped; the outcome must mirror, never favour slot 0.
  const cases = [
    { a: { body: [[9, 10], [8, 10], [7, 10], [6, 10]], direction: RIGHT },
      b: { body: [[11, 10], [12, 10], [13, 10]], direction: LEFT } },
    { a: { body: [[9, 10], [8, 10], [7, 10]], direction: RIGHT },
      b: { body: [[11, 10], [12, 10], [13, 10]], direction: LEFT } },
    { a: { body: [[9, 10], [8, 10], [7, 10]], direction: RIGHT },
      b: { body: [[10, 9], [10, 8], [10, 7]], direction: DOWN } },
    { a: { body: [[5, 5], [4, 5], [3, 5]], direction: RIGHT },
      b: { body: [[20, 15], [21, 15], [22, 15]], direction: LEFT } },
  ];

  const mirror = (spec) => ({ x: 29 - spec.x, y: spec.y });

  cases.forEach((c, i) => {
    const forward = scenario(E, { snakes: [c.a, c.b] });
    E.stepMatch(forward);
    const swapped = scenario(E, { snakes: [c.b, c.a] });
    E.stepMatch(swapped);

    assert.deepStrictEqual(
      [swapped.snakes[1].deaths, swapped.snakes[0].deaths],
      [forward.snakes[0].deaths, forward.snakes[1].deaths],
      'case ' + i + ': result changed when the players were swapped'
    );
  });
});

test('both players can be eliminated on the same tick', () => {
  const m = scenario(E, { snakes: [
    { body: [[0, 5], [1, 5], [2, 5]], direction: LEFT },
    { body: [[29, 15], [28, 15], [27, 15]], direction: RIGHT },
  ] });
  E.stepMatch(m);
  assert.deepStrictEqual(deaths(m), [1, 1]);
  assert.deepStrictEqual(scores(m), [0, 0], 'nobody scores');
});

// ------------------------------------------------------ tails and growth

test('chasing your own vacating tail is legal', () => {
  const m = scenario(E, {
    snakes: [
      { body: [[5, 5], [5, 6], [6, 6], [6, 5]], direction: UP, food: [] },
      { body: [[20, 15], [21, 15], [22, 15]], direction: LEFT },
    ],
  });
  // Head at (5,5) turning right moves onto (6,5), which is the tail cell.
  E.queueTurn(m.snakes[0], RIGHT);
  E.stepMatch(m);
  assert.strictEqual(m.snakes[0].deaths, 0, 'own vacating tail must be safe');
});

test('the opponent\'s tail is safe when they move and lethal when they grow', () => {
  const layout = (food) => ({
    snakes: [
      { body: [[9, 10], [9, 11], [9, 12]], direction: UP },
      { body: [[12, 10], [11, 10], [10, 10]], direction: RIGHT, food },
    ],
  });

  // Player 1's tail is at (10,10). Player 0 turns right into it.
  const moving = scenario(E, layout([]));
  E.queueTurn(moving.snakes[0], RIGHT);
  E.stepMatch(moving);
  assert.strictEqual(moving.snakes[0].deaths, 0, 'a vacating opponent tail must be safe');

  // Same cell, but now player 1 eats this tick so the tail stays put.
  const growing = scenario(E, layout([[13, 10]]));
  E.queueTurn(growing.snakes[0], RIGHT);
  E.stepMatch(growing);
  assert.strictEqual(growing.snakes[1].eaten, 1, 'opponent should have eaten');
  assert.strictEqual(growing.snakes[0].deaths, 1, 'a growing opponent tail must be lethal');
});

test('eating owned food grows you and counts toward your five', () => {
  const m = scenario(E, { snakes: [
    { body: [[9, 10], [8, 10], [7, 10]], direction: RIGHT, food: [[10, 10]] },
    { body: [[20, 15], [21, 15], [22, 15]], direction: LEFT },
  ] });
  E.stepMatch(m);
  assert.strictEqual(m.snakes[0].body.length, 4);
  assert.strictEqual(m.snakes[0].eaten, 1);
  assert.strictEqual(m.snakes[0].food.length, 0);
});

test('you cannot eat the other player\'s food', () => {
  const m = scenario(E, { snakes: [
    { body: [[9, 10], [8, 10], [7, 10]], direction: RIGHT, food: [] },
    { body: [[20, 15], [21, 15], [22, 15]], direction: LEFT, food: [[10, 10]] },
  ] });
  E.stepMatch(m);
  assert.strictEqual(m.snakes[0].body.length, 3, 'should not have grown');
  assert.strictEqual(m.snakes[0].eaten, 0);
  assert.strictEqual(m.snakes[1].food.length, 1, "the owner's food is still there");
  assert.strictEqual(m.snakes[0].deaths, 0, 'passing through it is harmless');
});

// ------------------------------------------------------------- the gold

test('gold appears once the first player clears their five', () => {
  const m = scenario(E, { snakes: [
    { body: [[9, 10], [8, 10], [7, 10]], direction: RIGHT, food: [[10, 10]], eaten: 4 },
    { body: [[20, 15], [21, 15], [22, 15]], direction: LEFT, food: [[0, 0], [0, 1]], eaten: 0 },
  ] });
  assert.strictEqual(m.gold, null);
  E.stepMatch(m);
  assert.strictEqual(m.snakes[0].eaten, 5, 'player 0 should now be ready');
  assert.ok(m.gold, 'gold should have spawned');
  assert.strictEqual(m.snakes[1].eaten, 0, 'the other player is still working');
});

test('with goldOnFirstReady off, gold waits for both players', () => {
  const m = E.createMatch({ seed: 2, goldOnFirstReady: false });
  m.snakes[0].body = [{ x: 9, y: 10 }, { x: 8, y: 10 }, { x: 7, y: 10 }];
  m.snakes[0].direction = RIGHT;
  m.snakes[0].food = [{ x: 10, y: 10 }];
  m.snakes[0].eaten = 4;
  m.snakes[1].body = [{ x: 20, y: 15 }, { x: 21, y: 15 }, { x: 22, y: 15 }];
  m.snakes[1].direction = LEFT;
  m.snakes[1].food = [{ x: 0, y: 0 }];
  m.snakes[1].eaten = 4;
  E.stepMatch(m);
  assert.strictEqual(m.snakes[0].eaten, 5);
  assert.strictEqual(m.gold, null, 'gold must wait for the second player');
});

test('taking the gold scores a point and restocks the board', () => {
  const m = scenario(E, {
    snakes: [
      { body: [[9, 10], [8, 10], [7, 10]], direction: RIGHT, eaten: 5, food: [] },
      { body: [[20, 15], [21, 15], [22, 15]], direction: LEFT, eaten: 5, food: [] },
    ],
    gold: [10, 10],
  });
  E.stepMatch(m);
  assert.strictEqual(m.snakes[0].score, 1);
  assert.strictEqual(m.round, 2, 'a new round should have started');
  assert.strictEqual(m.gold, null);
  assert.deepStrictEqual(foods(m), [5, 5], 'board restocked');
  assert.deepStrictEqual(eaten(m), [0, 0]);
  assert.strictEqual(m.snakes[0].body.length, 4, 'length carries across rounds');
});

test('dying on the tick you reach the gold scores nothing', () => {
  // Both heads land on the gold cell at equal length: both die, nobody scores.
  const m = scenario(E, {
    snakes: [
      { body: [[9, 10], [8, 10], [7, 10]], direction: RIGHT, eaten: 5, food: [] },
      { body: [[11, 10], [12, 10], [13, 10]], direction: LEFT, eaten: 5, food: [] },
    ],
    gold: [10, 10],
  });
  E.stepMatch(m);
  assert.deepStrictEqual(scores(m), [0, 0], 'no point on a mutual kill');
  assert.deepStrictEqual(deaths(m), [1, 1]);
});

test('reaching the target ends the match', () => {
  const m = scenario(E, {
    target: 2,
    snakes: [
      { body: [[9, 10], [8, 10], [7, 10]], direction: RIGHT, eaten: 5, food: [], score: 1 },
      { body: [[20, 15], [21, 15], [22, 15]], direction: LEFT, eaten: 5, food: [] },
    ],
    gold: [10, 10],
  });
  E.stepMatch(m);
  assert.strictEqual(m.over, true);
  assert.strictEqual(m.winner, 0);
});

// ------------------------------------------------------------- respawns

test('respawning puts you back at starting size, immune, with fresh food', () => {
  const m = scenario(E, { snakes: [
    { body: [[0, 5], [1, 5], [2, 5]], direction: LEFT, eaten: 3, food: [[8, 8], [9, 9]] },
    { body: [[20, 15], [21, 15], [22, 15]], direction: RIGHT },
  ] });
  E.stepMatch(m);
  const you = m.snakes[0];
  assert.strictEqual(you.alive, true, 'should be back immediately');
  assert.strictEqual(you.body.length, E.START_LENGTH);
  assert.ok(you.immune > 0, 'should have respawn protection');
  assert.strictEqual(you.eaten, 0, 'progress resets');
  assert.strictEqual(you.food.length, E.OWNED_FOOD, 'a fresh set of five');
});

test('a respawn never lands on top of anyone and always has an exit', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const m = E.createMatch({ seed });
    // Kill player 0 against the wall from wherever it starts.
    m.snakes[0].body = [{ x: 0, y: 5 }, { x: 1, y: 5 }, { x: 2, y: 5 }];
    m.snakes[0].direction = LEFT;
    E.stepMatch(m);
    const you = m.snakes[0], bot = m.snakes[1];
    const botCells = new Set(bot.body.map((c) => c.x + ',' + c.y));
    you.body.forEach((c) => {
      assert.ok(!botCells.has(c.x + ',' + c.y), 'respawned inside the bot at seed ' + seed);
      assert.ok(c.x >= 0 && c.x < 30 && c.y >= 0 && c.y < 20, 'respawned out of bounds');
    });
  }
});

test('respawn protection stops spawn camping but still blocks the camper', () => {
  const m = scenario(E, { snakes: [
    { body: [[9, 10], [8, 10], [7, 10]], direction: RIGHT, immune: 5 },
    { body: [[10, 9], [10, 8], [10, 7]], direction: DOWN },
  ] });
  // Player 1 drives into the immune snake's body.
  E.stepMatch(m);
  assert.deepStrictEqual(deaths(m), [0, 1],
    'the immune snake survives and is still a solid obstacle');
});

test('immunity wears off', () => {
  const m = E.createMatch({ seed: 4 });
  m.snakes[0].immune = 2;
  E.stepMatch(m); E.stepMatch(m); E.stepMatch(m);
  assert.strictEqual(m.snakes[0].immune, 0);
});

test('food bias pulls new food toward the trailing player', () => {
  // Compare average distance-to-owner with the bias off and at full strength.
  function averageDistance(biasPerPoint, deficit) {
    let total = 0, samples = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const m = E.createMatch({ seed, biasPerPoint });
      m.snakes[0].score = 0;
      m.snakes[1].score = deficit;
      m.snakes[0].food = [];
      m.snakes[0].body = [{ x: 5, y: 5 }, { x: 4, y: 5 }, { x: 3, y: 5 }];
      m.snakes[0].eaten = 0;
      // Kill and respawn is what triggers a biased restock; call it directly.
      m.snakes[0].alive = false;
      E.stepMatch(m);
      const head = m.snakes[0].body[0];
      m.snakes[0].food.forEach((f) => { total += E.manhattan(f, head); samples++; });
    }
    return total / samples;
  }
  const unbiased = averageDistance(0, 2);
  const biased = averageDistance(0.5, 2);
  assert.ok(biased < unbiased * 0.85,
    'biased food should land clearly closer: ' + biased.toFixed(1) + ' vs ' + unbiased.toFixed(1));
});

test('the gold is never biased', () => {
  // Even with a huge deficit, gold sits between the two heads.
  let fair = 0;
  for (let seed = 1; seed <= 25; seed++) {
    const m = E.createMatch({ seed, biasPerPoint: 1 });
    m.snakes[0].score = 0;
    m.snakes[1].score = 5;
    m.snakes.forEach((s) => { s.eaten = 5; s.food = []; });
    E.stepMatch(m);
    if (!m.gold) continue;
    const d0 = E.manhattan(m.gold, m.snakes[0].body[0]);
    const d1 = E.manhattan(m.gold, m.snakes[1].body[0]);
    assert.ok(Math.abs(d0 - d1) <= 4,
      'gold favoured a player at seed ' + seed + ': ' + d0 + ' vs ' + d1);
    fair++;
  }
  assert.ok(fair > 20, 'expected gold to spawn in most seeds, got ' + fair);
});

// ----------------------------------------------------------------- bot

test('the bot never walks into a wall or a body', () => {
  for (const difficulty of ['easy', 'normal', 'hard']) {
    const m = E.createMatch({ seed: 11, difficulty });
    for (let i = 0; i < 400 && !m.over; i++) {
      E.driveBot(m, 1);
      E.driveBot(m, 0);      // both sides driven, so it is a real game
      E.stepMatch(m);
      m.snakes.forEach((s) => {
        if (!s.alive) return;
        s.body.forEach((c) => {
          assert.ok(c.x >= 0 && c.x < 30 && c.y >= 0 && c.y < 20,
            difficulty + ': snake left the board');
        });
      });
    }
  }
});

test('a harder bot survives longer than an easier one', () => {
  function deaths(difficulty) {
    let total = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const m = E.createMatch({ seed, difficulty, target: 99 });
      for (let i = 0; i < 500 && !m.over; i++) { E.driveBot(m, 1); E.stepMatch(m); }
      total += m.snakes[1].deaths;
    }
    return total;
  }
  const easy = deaths('easy');
  const hard = deaths('hard');
  assert.ok(hard < easy, 'hard bot died ' + hard + ' times vs easy ' + easy);
});

test('the bot is deterministic under a seed', () => {
  function play(seed) {
    const m = E.createMatch({ seed, difficulty: 'hard', target: 99 });
    for (let i = 0; i < 200 && !m.over; i++) { E.driveBot(m, 1); E.driveBot(m, 0); E.stepMatch(m); }
    return JSON.stringify(m.snakes.map((s) => [s.body, s.score, s.deaths]));
  }
  assert.strictEqual(play(9), play(9), 'same seed must replay identically');
  assert.notStrictEqual(play(9), play(10), 'different seeds should differ');
});

// -------------------------------------------------------- full matches

test('seeded bot-versus-bot matches finish with every invariant intact', () => {
  let finished = 0, ticks = 0;
  for (let seed = 1; seed <= 15; seed++) {
    const m = E.createMatch({ seed, difficulty: 'hard' });
    for (let i = 0; i < 4000 && !m.over; i++) {
      E.driveBot(m, 0);
      E.driveBot(m, 1);
      E.stepMatch(m);
      ticks++;

      const cells = new Map();
      m.snakes.forEach((s, idx) => {
        if (!s.alive) return;
        assert.ok(s.body.length >= E.START_LENGTH, 'snake shrank below start length');
        s.body.forEach((c) => {
          assert.ok(c.x >= 0 && c.x < 30 && c.y >= 0 && c.y < 20, 'out of bounds');
          const k = c.x + ',' + c.y;
          // Two live snakes may never share a cell, nor may a snake overlap itself.
          assert.ok(!cells.has(k), 'cell ' + k + ' shared (snakes ' + cells.get(k) + ' and ' + idx + ')');
          cells.set(k, idx);
        });
        assert.ok(s.eaten <= E.OWNED_FOOD, 'ate more than the allowance');
        s.food.forEach((f) => {
          assert.ok(!cells.has(f.x + ',' + f.y) || cells.get(f.x + ',' + f.y) !== idx,
            'food sitting under its own owner');
        });
      });
      assert.ok(m.snakes[0].score <= m.target && m.snakes[1].score <= m.target, 'score overran target');
    }
    if (m.over) {
      finished++;
      assert.ok(m.winner === 0 || m.winner === 1, 'a finished match needs a winner');
      assert.strictEqual(m.snakes[m.winner].score, m.target);
    }
  }
  assert.ok(finished >= 12, 'only ' + finished + '/15 matches reached a winner');
  console.log('        (' + finished + '/15 matches finished, ' + ticks + ' ticks simulated)');
});


// ------------------------------------------- regressions found by play-testing

test('a player who has not cleared their five cannot take the gold', () => {
  // Otherwise the best strategy is to ignore your own food, camp the middle,
  // and snipe the gold the moment your opponent finishes farming.
  const m = scenario(E, {
    snakes: [
      { body: [[9, 10], [8, 10], [7, 10]], direction: RIGHT, eaten: 0, food: [] },
      { body: [[20, 15], [21, 15], [22, 15]], direction: LEFT, eaten: 5, food: [] },
    ],
    gold: [10, 10],
  });
  E.stepMatch(m);
  assert.strictEqual(m.snakes[0].score, 0, 'a non-ready player must not score');
  assert.ok(m.gold, 'the gold must still be there');
  assert.strictEqual(m.snakes[0].body.length, 3, 'and must not have fed them');
  assert.strictEqual(m.snakes[0].deaths, 0, 'passing over it is harmless');
});

test('flood fill measures the space actually reachable', () => {
  assert.strictEqual(E.floodFill(new Set(), { x: 5, y: 5 }), 30 * 20, 'empty board');
  // Wall off a 3x20 column on the left: x=3 blocked for every row.
  const wall = new Set();
  for (let y = 0; y < 20; y++) wall.add(y * 30 + 3);
  assert.strictEqual(E.floodFill(wall, { x: 0, y: 0 }), 3 * 20, 'sealed pocket');
  assert.strictEqual(E.floodFill(wall, { x: 4, y: 0 }), 26 * 20, 'the larger side');
});

test('a space-aware bot refuses a dead end that a greedy one walks into', () => {
  // (16,10) is a one-cell pocket: its other three neighbours are blocked, and
  // the food sits straight beyond it. Greedy takes the bait; rung 2 and up
  // should not.
  //
  // The blocker's head and tail are parked far away on purpose. A tail cell
  // vacates as that snake moves, so the engine rightly treats it as free --
  // sealing the pocket with one would not seal it at all. Keeping the head
  // away also stops the hard rung refusing the cell merely for being next to
  // an opponent's head, which would pass this test for the wrong reason.
  function decide(difficulty) {
    const m = scenario(E, {
      snakes: [
        { body: [[20, 2], [21, 2], [22, 2]], direction: RIGHT },
        { body: [[15, 10], [14, 10], [13, 10]], direction: RIGHT, food: [[17, 10]] },
      ],
    });
    m.snakes[0].body = [
      { x: 20, y: 2 },                                        // head, far away
      { x: 17, y: 10 }, { x: 16, y: 11 }, { x: 16, y: 9 },    // the three walls
      { x: 21, y: 2 },                                        // tail, far away
    ];
    m.difficulty = difficulty;
    return E.botDecide(m, 1);
  }
  const greedy = decide('easy');
  assert.deepStrictEqual({ x: greedy.x, y: greedy.y }, { x: 1, y: 0 },
    'the greedy rung should take the bait');
  ['normal', 'hard'].forEach((d) => {
    const choice = decide(d);
    assert.ok(!(choice.x === 1 && choice.y === 0),
      d + ' walked into the dead end, so its space check is not working');
  });
});

test('the bot plays the same on a mirrored board', () => {
  // A tie broken by a fixed compass order is not symmetric under mirroring,
  // and quietly hands the player starting on one side a real advantage.
  const layout = {
    snakes: [
      { body: [[6, 10], [5, 10], [4, 10]], direction: RIGHT, food: [[9, 4], [12, 14], [2, 8]] },
      { body: [[23, 10], [24, 10], [25, 10]], direction: LEFT, food: [[20, 4], [17, 14], [27, 8]] },
    ],
  };
  const mirrorCell = (c) => [29 - c[0], c[1]];
  const mirrorDir = (d) => ({ x: -d.x, y: d.y });
  const mirrored = {
    snakes: [
      { body: layout.snakes[1].body.map(mirrorCell), direction: mirrorDir(layout.snakes[1].direction),
        food: layout.snakes[1].food.map(mirrorCell) },
      { body: layout.snakes[0].body.map(mirrorCell), direction: mirrorDir(layout.snakes[0].direction),
        food: layout.snakes[0].food.map(mirrorCell) },
    ],
  };
  ['easy', 'normal', 'hard'].forEach((difficulty) => {
    const a = scenario(E, layout); a.difficulty = difficulty;
    const b = scenario(E, mirrored); b.difficulty = difficulty;
    const choice = E.botDecide(a, 0);
    const mirroredChoice = E.botDecide(b, 1);
    assert.deepStrictEqual(
      // `|| 0` because negating zero gives -0, which deepStrictEqual rejects.
      { x: mirroredChoice.x || 0, y: mirroredChoice.y || 0 },
      { x: -choice.x || 0, y: choice.y || 0 },
      difficulty + ': the bot does not play symmetrically, so one side has an edge'
    );
  });
});

test('every difficulty can finish a match', () => {
  // The regression for a bot that orbited its target forever: it only showed
  // up on the settings the original suite never played.
  ['easy', 'normal', 'hard'].forEach((difficulty) => {
    let finished = 0;
    for (let seed = 1; seed <= 4; seed++) {
      const m = E.createMatch({ seed, difficulty });
      for (let i = 0; i < 3000 && !m.over; i++) { E.driveBot(m, 0); E.driveBot(m, 1); E.stepMatch(m); }
      if (m.over) finished++;
    }
    assert.strictEqual(finished, 4, difficulty + ' finished only ' + finished + '/4 matches');
  });
});

test('a round that overruns is decided rather than left to circle', () => {
  // Two long snakes can loop around each other indefinitely with the gold
  // untouched, so the round needs a backstop.
  // Nobody is driven, so both run straight; they start with more than 20 cells
  // of clear space ahead. Food is cleared so the counts cannot drift, and
  // neither snake may die -- a respawn would reset `eaten` and void the test.
  const m = E.createMatch({ seed: 5, roundLimit: 20 });
  // Different rows: the default start has them facing each other down row 10,
  // where they meet head-on well inside the window.
  m.snakes[0].body = [{ x: 4, y: 3 }, { x: 3, y: 3 }, { x: 2, y: 3 }];
  m.snakes[0].direction = RIGHT;
  m.snakes[1].body = [{ x: 25, y: 16 }, { x: 26, y: 16 }, { x: 27, y: 16 }];
  m.snakes[1].direction = LEFT;
  m.snakes.forEach((s) => { s.food = []; });
  m.snakes[0].eaten = 3;
  m.snakes[1].eaten = 1;
  for (let i = 0; i < 20; i++) E.stepMatch(m);
  assert.deepStrictEqual(deaths(m), [0, 0], 'neither snake should have died first');
  assert.strictEqual(m.snakes[0].score, 1, 'the player who had eaten more should take it');
  assert.strictEqual(m.round, 2, 'and a new round should have begun');
});

test('the round clock breaks a genuine stalemate', () => {
  const m = E.createMatch({ seed: 7, difficulty: 'hard' });
  let ticks = 0;
  while (!m.over && ticks < 4000) { E.driveBot(m, 0); E.driveBot(m, 1); E.stepMatch(m); ticks++; }
  assert.ok(m.over, 'seed 7 used to circle forever; it must now resolve');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
