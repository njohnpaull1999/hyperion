const { makeEnv } = require('./harness');
const assert = require('assert');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  PASS  ' + name); }
  catch (e) { failed++; console.log('  FAIL  ' + name + '\n        ' + e.message); }
}
const same = (a, b) => a && b && a.x === b.x && a.y === b.y;

// Advance until the head has moved `n` times (delay varies with score).
function moves(e, n) {
  for (let i = 0; i < n; i++) {
    const before = e.board().head;
    let guard = 0;
    while (guard++ < 200) {
      e.advance(5);
      if (e.overlayShown()) return;           // died
      if (!same(e.board().head, before)) break;
    }
  }
}

test('starts with a 3-segment snake centred on the board', () => {
  const e = makeEnv(); e.play(); e.stepFrames(1);
  const b = e.board();
  assert.strictEqual(b.length, 3, 'length ' + b.length);
  assert.deepStrictEqual(b.head, { x: 15, y: 10 });
  assert.ok(b.food, 'food should exist');
  assert.ok(!b.cells.some((c) => same(c, b.food)), 'food must not spawn inside the snake');
});

test('moves right by default', () => {
  const e = makeEnv(); e.play(); moves(e, 1);
  assert.deepStrictEqual(e.board().head, { x: 16, y: 10 });
});

test('steering up then continuing works', () => {
  const e = makeEnv(); e.play(); e.stepFrames(1);
  e.keydown('ArrowUp'); moves(e, 2);
  assert.deepStrictEqual(e.board().head, { x: 15, y: 8 });
});

test('wasd steers as well as arrows', () => {
  const e = makeEnv(); e.play(); e.stepFrames(1);
  e.keydown('w'); moves(e, 1);
  assert.deepStrictEqual(e.board().head, { x: 15, y: 9 });
});

test('reversing into your own neck is ignored', () => {
  const e = makeEnv(); e.play(); e.stepFrames(1);
  e.keydown('ArrowLeft'); moves(e, 1);
  assert.ok(!e.overlayShown(), 'should still be alive');
  assert.deepStrictEqual(e.board().head, { x: 16, y: 10 }, 'should keep heading right');
});

test('two turns inside one frame cannot fold the snake onto itself', () => {
  // The classic snake bug: up then left, both before the next tick, becomes a
  // 180 turn if input is applied immediately instead of queued.
  const e = makeEnv(); e.play(); e.stepFrames(1);
  e.keydown('ArrowUp');
  e.keydown('ArrowLeft');
  moves(e, 1);
  assert.ok(!e.overlayShown(), 'died instantly - turns were not queued');
  assert.deepStrictEqual(e.board().head, { x: 15, y: 9 }, 'first queued turn should be up');
  moves(e, 1);
  assert.ok(!e.overlayShown(), 'died on the second queued turn');
  assert.deepStrictEqual(e.board().head, { x: 14, y: 9 }, 'second queued turn should be left');
});

test('hitting a wall ends the game', () => {
  const e = makeEnv(); e.play();
  moves(e, 40);
  assert.ok(e.overlayShown(), 'overlay should appear');
  assert.strictEqual(e.overlayTitle(), 'Game over');
  // Food can spawn in the snake's path, so check against the live score.
  assert.ok(e.overlayText().indexOf('Final score: ' + e.score()) === 0,
    'text was: ' + e.overlayText() + ' (score ' + e.score() + ')');
});

// Deterministic RNG so food placement is repeatable run to run.
function seeded(seed) {
  return () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
}

// Measure the wall-clock ms the next head move costs; null if the game ended.
function timedMove(e) {
  const before = e.board().head;
  let ms = 0;
  while (ms < 2000) {
    e.advance(5); ms += 5;
    if (e.overlayShown()) return null;
    if (!same(e.board().head, before)) return ms;
  }
  return null;
}

// A safe-ish autoplayer: head toward the food, but never into a wall,
// your own body, or your neck. Good enough to rack up a real score.
function autostep(e) {
  const b = e.board();
  if (!b.food || !b.head) return false;
  const occupied = new Set(b.cells.map((c) => c.x + ',' + c.y));
  const tail = b.cells[0];
  occupied.delete(tail.x + ',' + tail.y);            // the tail vacates
  const neck = b.cells[b.cells.length - 2];
  const opts = [
    { key: 'ArrowRight', d: { x: 1, y: 0 } }, { key: 'ArrowLeft', d: { x: -1, y: 0 } },
    { key: 'ArrowDown', d: { x: 0, y: 1 } }, { key: 'ArrowUp', d: { x: 0, y: -1 } },
  ].map((o) => ({ ...o, cell: { x: b.head.x + o.d.x, y: b.head.y + o.d.y } }))
   .filter((o) => o.cell.x >= 0 && o.cell.x < 30 && o.cell.y >= 0 && o.cell.y < 20)
   .filter((o) => !occupied.has(o.cell.x + ',' + o.cell.y))
   .filter((o) => !(neck && o.cell.x === neck.x && o.cell.y === neck.y));
  if (!opts.length) return false;
  opts.sort((p, q) =>
    (Math.abs(p.cell.x - b.food.x) + Math.abs(p.cell.y - b.food.y)) -
    (Math.abs(q.cell.x - b.food.x) + Math.abs(q.cell.y - b.food.y)));
  e.keydown(opts[0].key);
  moves(e, 1);
  return !e.overlayShown();
}

test('eating grows the snake, one segment per point', () => {
  const e = makeEnv({ random: seeded(99) }); e.play(); e.stepFrames(1);
  let guard = 0;
  while (e.score() < 10 && guard++ < 5000) {
    if (!autostep(e)) break;
    assert.strictEqual(e.board().length, 3 + e.score(),
      'length ' + e.board().length + ' vs score ' + e.score());
  }
  assert.strictEqual(e.score(), 10, 'only reached ' + e.score() + ' in ' + guard + ' moves');
  assert.strictEqual(e.board().length, 13);
});

test('the snake speeds up as the score climbs', () => {
  // Sample the move interval at each score reached, and check it against the
  // same formula the Python version uses: max(55, 120 - 3 * score).
  const e = makeEnv({ random: seeded(7) }); e.play(); e.stepFrames(1);
  const samples = new Map();
  let guard = 0;
  while (e.score() < 12 && guard++ < 5000) {
    if (!samples.has(e.score())) {
      const t = timedMove(e);
      if (t === null) break;
      samples.set(e.score(), t);
    }
    if (!autostep(e)) break;
  }
  assert.ok(samples.size >= 4, 'only sampled ' + samples.size + ' score levels');
  const scores = [...samples.keys()].sort((a, b) => a - b);
  for (const sc of scores) {
    const expected = Math.max(55, 120 - 3 * sc);
    const got = samples.get(sc);
    // The 5ms sampling step plus accumulator carry-over gives a little slack.
    assert.ok(Math.abs(got - expected) <= 10,
      'at score ' + sc + ' interval was ' + got + 'ms, expected ~' + expected + 'ms');
  }
  const first = samples.get(scores[0]);
  const last = samples.get(scores[scores.length - 1]);
  assert.ok(last < first, 'no speed-up: ' + first + 'ms then ' + last + 'ms');
  console.log('        (delays: ' + scores.map((sc) => sc + '->' + samples.get(sc) + 'ms').join(', ') + ')');
});

test('pause freezes the snake and resumes cleanly', () => {
  const e = makeEnv(); e.play(); e.stepFrames(1);
  const before = e.board().head;
  e.keydown('p');
  e.stepFrames(400);                       // 2s of frames while paused
  assert.ok(same(e.board().head, before), 'snake moved while paused');
  assert.ok(!e.overlayShown(), 'should not have died while paused');
  e.keydown('p');
  moves(e, 1);
  assert.ok(!same(e.board().head, before), 'snake did not resume');
});

test('r restarts from the game over screen', () => {
  const e = makeEnv(); e.play(); moves(e, 40);
  assert.ok(e.overlayShown());
  e.keydown('r'); e.stepFrames(1);
  assert.ok(!e.overlayShown(), 'overlay should clear');
  assert.strictEqual(e.score(), 0);
  assert.strictEqual(e.board().length, 3);
  assert.deepStrictEqual(e.board().head, { x: 15, y: 10 });
});

test('best score is recorded and persisted', () => {
  const e = makeEnv({ random: seeded(42) }); e.play(); e.stepFrames(1);
  let guard = 0;
  while (e.score() < 3 && guard++ < 5000) { if (!autostep(e)) break; }
  assert.ok(e.score() >= 3, 'expected to eat at least 3 times, got ' + e.score());
  const scored = e.score();
  guard = 0;
  while (!e.overlayShown() && guard++ < 5000) moves(e, 1);   // run until death
  assert.ok(e.overlayShown(), 'should be over');
  assert.strictEqual(e.best(), scored, 'best should match the score just made');
  assert.strictEqual(e.store['snake.best'], String(scored), 'not written to localStorage');
});

test('a blocked localStorage does not break the game', () => {
  const e = makeEnv({ localStorageThrows: true });
  e.play(); moves(e, 40);
  assert.ok(e.overlayShown(), 'game should still reach game over');
  assert.strictEqual(e.overlayTitle(), 'Game over');
});

test('hiding the tab auto-pauses', () => {
  const e = makeEnv(); e.play(); e.stepFrames(1);
  const before = e.board().head;
  e.sandbox.document.hidden = true;
  e.fire('document', 'visibilitychange', {});
  e.stepFrames(400);
  assert.ok(same(e.board().head, before), 'snake kept moving in a hidden tab');
});

test('a long stall does not replay a burst of moves', () => {
  const e = makeEnv(); e.play(); e.stepFrames(1);
  const before = e.board().head;
  e.advance(60000);   // tab backgrounded for a minute
  const after = e.board().head;
  const travelled = Math.abs(after.x - before.x) + Math.abs(after.y - before.y);
  assert.ok(travelled <= 5, 'snake jumped ' + travelled + ' cells after a stall');
  assert.ok(!e.overlayShown(), 'stall should not kill the snake');
});

test('swipe steering works on touch', () => {
  const e = makeEnv(); e.play(); e.stepFrames(1);
  const t = (x, y) => ({ changedTouches: [{ clientX: x, clientY: y }] });
  e.fire('canvas', 'touchstart', t(100, 100));
  e.fire('canvas', 'touchend', t(100, 180));    // downward swipe
  moves(e, 1);
  assert.deepStrictEqual(e.board().head, { x: 15, y: 11 });
});

test('tap toggles pause on touch', () => {
  const e = makeEnv(); e.play(); e.stepFrames(1);
  const before = e.board().head;
  const t = (x, y) => ({ changedTouches: [{ clientX: x, clientY: y }] });
  e.fire('canvas', 'touchstart', t(100, 100));
  e.fire('canvas', 'touchend', t(102, 103));    // short move = tap
  e.stepFrames(400);
  assert.ok(same(e.board().head, before), 'tap did not pause');
});

test('fuzz: random play never crashes or breaks invariants', () => {
  const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'];
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  let frames = 0;
  for (let game = 0; game < 25; game++) {
    const e = makeEnv({ random: rnd });
    e.play(); e.stepFrames(1);
    for (let i = 0; i < 120; i++) {
      if (e.overlayShown()) break;
      if (rnd() < 0.3) e.keydown(keys[Math.floor(rnd() * keys.length)]);
      moves(e, 1); frames++;
      const b = e.board();
      if (!b.head) continue;
      assert.ok(b.head.x >= 0 && b.head.x < 30 && b.head.y >= 0 && b.head.y < 20,
                'head left the board at ' + JSON.stringify(b.head));
      const uniq = new Set(b.cells.map((c) => c.x + ',' + c.y));
      assert.strictEqual(uniq.size, b.cells.length, 'snake overlapped itself while alive');
      if (b.food) assert.ok(!b.cells.some((c) => same(c, b.food)), 'food spawned inside the snake');
      assert.strictEqual(b.length, 3 + e.score(), 'length/score mismatch');
    }
  }
  console.log('        (' + frames + ' fuzzed moves)');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
