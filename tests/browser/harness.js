// Loads the real <script> out of docs/index.html and runs it against DOM stubs.
// The canvas stub records roundRect calls so the drawn board can be read back:
// that is the only window into the IIFE's private state, and it also proves
// the rendering path actually runs.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PAGE = path.join(__dirname, '..', '..', 'docs', 'index.html');

const COLORS = { head: '#6ee7a8', body: '#35c88a', food: '#f0616d' };
const CELL = Math.max(8, Math.floor(480 / 30)); // matches resize() with clientWidth 480

function makeEnv({ localStorageThrows = false, random = Math.random } = {}) {
  const listeners = { document: {}, canvas: {}, window: {} };
  const noop = () => {};
  const draws = [];

  const ctxState = { fillStyle: '', strokeStyle: '', lineWidth: 0, font: '', textAlign: '', textBaseline: '' };
  const ctx = new Proxy(ctxState, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'roundRect') return (x, y, w, h) => draws.push({ x, y, w, h, color: t.fillStyle });
      // The background fill that opens every draw() doubles as a frame marker.
      if (k === 'fillRect') return (x, y, w, h) => draws.push({ marker: true, x, y, w, h });
      if (k === 'measureText') return (text) => ({ width: text.length * 8 });
      return noop;
    },
    set(t, k, v) { t[k] = v; return true; },
  });

  const els = {};
  const mk = (id) => (els[id] = {
    id, textContent: '', hidden: false, style: {}, width: 0, height: 0,
    addEventListener: (type, f) => { (listeners.canvas[type] = listeners.canvas[type] || []).push(f); },
    getContext: () => ctx,
    parentElement: { clientWidth: 480 },
  });
  ['board', 'score', 'best', 'overlay', 'overlay-title', 'overlay-text', 'overlay-button'].forEach(mk);
  els['overlay-button'].addEventListener = (type, f) => { if (type === 'click') els['overlay-button'].onclick = f; };

  const document = {
    body: {}, hidden: false,
    getElementById: (id) => els[id],
    addEventListener: (type, f) => { (listeners.document[type] = listeners.document[type] || []).push(f); },
  };

  const store = {};
  let rafCb = null;
  const sandbox = {
    document,
    window: {
      devicePixelRatio: 2,
      addEventListener: (type, f) => { (listeners.window[type] = listeners.window[type] || []).push(f); },
    },
    // Mirrors the custom properties the stylesheet declares, so the game reads
    // distinct colours back and the board stays legible in board().
    getComputedStyle: () => ({
      getPropertyValue: (name) => ({
        '--panel': ' #161923', '--grid': ' #1b1f2b', '--head': ' #6ee7a8',
        '--body': ' #35c88a', '--food': ' #f0616d', '--bg': ' #0f1117',
        '--text': ' #e6e9f0',
      }[name] || ''),
    }),
    requestAnimationFrame: (cb) => { rafCb = cb; return 1; },
    localStorage: {
      getItem: (k) => { if (localStorageThrows) throw new Error('denied'); return k in store ? store[k] : null; },
      setItem: (k, v) => { if (localStorageThrows) throw new Error('denied'); store[k] = v; },
    },
    Math: Object.assign(Object.create(Math), { random }),
    Set, console, Date,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  const html = fs.readFileSync(PAGE, 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  if (scripts.length !== 1) throw new Error('expected one inline script, got ' + scripts.length);
  vm.runInContext(scripts[0], sandbox, { filename: 'snake.js' });

  const fire = (target, type, ev) => (listeners[target][type] || []).forEach((f) => f(ev));
  const keydown = (key) => fire('document', 'keydown', { key, preventDefault: noop });
  const play = () => els['overlay-button'].onclick();

  let now = 0;
  const advance = (ms) => { now += ms; rafCb(now); };

  // Read the last rendered frame back as board state.
  function board() {
    // Slice out the newest frame: everything after the last background marker
    // that still has shapes drawn after it.
    // Anchor on the last marker still followed by a head-coloured segment, so
    // the pause overlay's own fill does not truncate the frame.
    let start = 0;
    for (let i = draws.length - 1; i >= 0; i--) {
      if (draws[i].marker && draws.slice(i + 1).some((d) => d.color === COLORS.head)) { start = i + 1; break; }
    }
    const frame = draws.slice(start);
    const cellOf = (d) => ({ x: Math.round(d.x / CELL), y: Math.round(d.y / CELL) });
    const segs = frame.filter((d) => d.color === COLORS.body || d.color === COLORS.head);
    const food = frame.filter((d) => d.color === COLORS.food).map(cellOf).pop() || null;
    const headDraw = frame.find((d) => d.color === COLORS.head);
    return {
      head: headDraw ? cellOf(headDraw) : null,
      cells: segs.map(cellOf),
      length: segs.length,
      food,
    };
  }

  const score = () => parseInt(els['score'].textContent, 10) || 0;
  const best = () => parseInt(els['best'].textContent, 10) || 0;
  const overlayShown = () => !els['overlay'].hidden;
  const overlayTitle = () => els['overlay-title'].textContent;
  const overlayText = () => els['overlay-text'].textContent;

  // Advance in fine slices so each tick is applied separately.
  const stepOnce = () => { for (let i = 0; i < 40; i++) { const s = score(), o = overlayShown(); advance(5); if (score() !== s || overlayShown() !== o) return; } };
  const stepFrames = (n) => { for (let i = 0; i < n; i++) advance(5); };

  return { els, keydown, play, advance, stepFrames, fire, listeners, sandbox, draws,
           board, score, best, overlayShown, overlayTitle, overlayText, store };
}

module.exports = { makeEnv, COLORS, CELL };
