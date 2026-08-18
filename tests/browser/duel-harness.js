// Loads the duel page's real script and hands back the rules engine it
// exposes on window. The renderer bails out when there is no canvas, so the
// engine runs headless without stubbing the DOM.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PAGE = path.join(__dirname, '..', '..', 'docs', 'duel.html');

function loadEngine() {
  const sandbox = {
    document: {
      getElementById: () => null,
      addEventListener: () => {},
      body: {},
    },
    window: { addEventListener: () => {} },
    requestAnimationFrame: () => 1,
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    Math, Set, Date, console,
  };
  sandbox.window = Object.assign(sandbox.window, {});
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  const html = fs.readFileSync(PAGE, 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  if (scripts.length !== 1) throw new Error('expected one inline script, got ' + scripts.length);
  vm.runInContext(scripts[0], sandbox, { filename: 'duel.js' });

  if (!sandbox.window.SnakeDuel) throw new Error('page did not expose window.SnakeDuel');
  return sandbox.window.SnakeDuel;
}

// Build a match in an exact state, so one-tick coincidences can be set up
// directly instead of played toward.
function scenario(engine, spec) {
  const match = engine.createMatch({ seed: spec.seed || 1, target: spec.target || 3 });
  match.snakes.forEach((snake, i) => {
    const s = spec.snakes[i];
    snake.body = s.body.map((c) => ({ x: c[0], y: c[1] }));
    snake.direction = s.direction;
    snake.pending = [];
    snake.alive = s.alive === undefined ? true : s.alive;
    snake.immune = s.immune || 0;
    snake.food = (s.food || []).map((c) => ({ x: c[0], y: c[1] }));
    snake.eaten = s.eaten || 0;
    snake.score = s.score || 0;
  });
  match.gold = spec.gold ? { x: spec.gold[0], y: spec.gold[1] } : null;
  return match;
}

module.exports = { loadEngine, scenario };
