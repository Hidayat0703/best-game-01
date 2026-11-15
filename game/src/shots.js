// The screenshot scenes behind ?shot=title|cover|boss|win. Each one plays the
// real rules forward from a fresh world, steered by a simple autopilot that
// picks tower spots by how much road they cover, builds in a fixed order,
// upgrades, and calls waves as soon as it can afford to — so the frame is what
// a real game looks like and the same seed always gives the same frame. This
// module has no browser in it: the same autopilot drives the Node balance sim.

import { FINAL_WAVE, STEP, TOWER_ORDER } from './config.js';
import { cellCentre } from './path.js';
import { PHASE_LOST, PHASE_WON } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

const TITLE_SECONDS = 6;
const COVER_WAVE = 7;
const BOSS_WAVE = 5;

/**
 * Rank every buildable cell by how much road a tower there can cover, then
 * take the best ones with room between them. The kind order puts the heavy
 * hitters on the best ground.
 */
function pickSpots(world) {
  const samples = [];
  for (let d = 0; d < world.path.total; d += 20) samples.push(world.path.pointAt(d));
  const scored = [];
  for (let row = 0; row < world.grid.length; row += 1) {
    for (let col = 0; col < world.grid[row].length; col += 1) {
      if (!world.grid[row][col]) continue;
      const centre = cellCentre(col, row);
      let cover = 0;
      for (const s of samples) if (Math.hypot(s.x - centre.x, s.y - centre.y) <= 140) cover += 1;
      scored.push({ col, row, cover });
    }
  }
  scored.sort((a, b) => b.cover - a.cover || a.row - b.row || a.col - b.col);
  const kinds = ['star', 'prism', 'frost', 'sunbeam', 'sunbeam', 'prism', 'frost', 'sunbeam', 'star', 'prism', 'sunbeam', 'frost'];
  const picked = [];
  for (const cell of scored) {
    if (picked.length >= kinds.length) break;
    if (picked.some((p) => Math.hypot(p.col - cell.col, p.row - cell.row) < 1.5)) continue;
    picked.push({ ...cell, kind: kinds[picked.length] });
  }
  return picked;
}

/**
 * One autopilot beat, run between waves: build the next planned tower when it
 * can be afforded, else upgrade the oldest tower, else call the wave.
 * Returns false when there is nothing left to build and no wave to call.
 */
function autopilotBuild(world, plan, built) {
  while (built.next < plan.length) {
    const spot = plan[built.next];
    if (world.towers.at(spot.col, spot.row)) {
      built.next += 1;
      continue;
    }
    const tower = world.placeTower(spot.kind, spot.col, spot.row);
    if (!tower) return false; // cannot afford it yet: call the wave instead
    built.next += 1;
  }
  for (const tower of world.towers.list) {
    if (world.upgradeTower(tower)) return true;
  }
  return false;
}

/**
 * Play the real game forward until `stop` says the scene is ready. Returns
 * true when the stop condition was met, false when the run ended first (a
 * loss, or the wave limit) — the caller then stages what it has.
 */
function playUntil(world, plan, built, stop) {
  let steps = 0;
  const maxSteps = Math.round(1500 / STEP); // 25 minutes of game time, at most
  while (steps < maxSteps) {
    if (stop(world)) return true;
    if (world.state.phase === PHASE_WON || world.state.phase === PHASE_LOST) return false;
    if (world.betweenWaves()) {
      if (world.state.wave >= FINAL_WAVE) return false;
      autopilotBuild(world, plan, built);
      world.startWave();
    }
    const repeats = world.state.speed === 2 ? 2 : 1;
    for (let i = 0; i < repeats; i += 1) world.step(STEP);
    steps += 1;
  }
  return false;
}

function shotUi(difficulty) {
  return { selectedKind: null, selectedTower: null, hoverCell: null, muted: false, difficulty, banner: null };
}

/**
 * Set `world` to the named scene (title, cover, boss or win; any other name is
 * title) and return the screen to draw over it, the best score to show, and
 * the UI state the renderer needs.
 */
export function stageShot(name, world, difficulty) {
  world.reset();
  const ui = shotUi(difficulty);
  const best = 0;
  if (name !== 'cover' && name !== 'boss' && name !== 'win') {
    // Title: two towers on the meadow, a few shadows drifting down the road.
    world.placeTower('sunbeam', 4, 3);
    world.placeTower('prism', 17, 3);
    for (let i = 0; i < TITLE_SECONDS / STEP; i += 1) {
      if (world.enemies.list.length < 3) world.enemies.spawn('shade', 1, 1, 1);
      world.enemies.step(STEP, i * STEP);
      world.enemies.sweep();
    }
    return { screen: SCREEN_TITLE, best, ui };
  }

  const plan = pickSpots(world);
  const built = { next: 0 };
  world.state.speed = 2;

  if (name === 'cover') {
    // Mid-wave 7: the road full, towers firing, the HUD busy.
    playUntil(world, plan, built, (w) => w.state.wave === COVER_WAVE && w.state.spawnQueue.length === 0 && w.enemies.list.length >= 6);
    return { screen: SCREEN_PLAY, best: world.state.score, ui };
  }

  if (name === 'boss') {
    // Wave 5's Nightmaw, just in from the left with its escorts still around
    // it — the boss walks slowly, so later in its march the road is empty.
    playUntil(world, plan, built, (w) => {
      const boss = w.enemies.list.find((e) => e.kind === 'boss');
      return Boolean(boss) && boss.distance > 300 && boss.distance < 900;
    });
    const boss = world.enemies.list.find((e) => e.kind === 'boss');
    if (boss) ui.banner = { text: 'Nightmaw approaches!', at: performance.now() };
    return { screen: SCREEN_PLAY, best: world.state.score, ui };
  }

  // Win: play all twelve waves. If the autopilot falls short, the victory
  // panel still shows over the field it earned — the screenshot is of a real
  // run, with the run's own score.
  const won = playUntil(world, plan, built, (w) => w.state.phase === PHASE_WON);
  if (!won && world.state.phase !== PHASE_WON) world.state.phase = PHASE_WON;
  return { screen: SCREEN_WIN, best: world.state.score, ui };
}

// Re-exported for the Node balance sim, so it tests the same pilot.
export { pickSpots, playUntil, autopilotBuild };
export const SHOT_NAMES = ['title', 'cover', 'boss', 'win'];
export { TOWER_ORDER };
