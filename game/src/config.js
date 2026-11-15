// Lumen Keep — every tuning number, colour and definition in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to the
// window, so no rule below depends on the screen size. The bottom 96 px are the
// build bar; the path and the buildable grid live above it.

export const FIELD = { width: 1280, height: 720, barY: 624, barHeight: 96 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Build grid: 64 px cells over the play area above the build bar. */
export const TILE = 64;
export const GRID_COLS = 20;
export const GRID_ROWS = 9;

/** The shadow road: waypoints the enemies walk, left edge to the Sunspire. */
export const PATH_POINTS = [
  { x: -40, y: 120 },
  { x: 1060, y: 120 },
  { x: 1060, y: 320 },
  { x: 220, y: 320 },
  { x: 220, y: 520 },
  { x: 1140, y: 520 },
];
export const PATH_WIDTH = 52;
export const SPIRE = { x: 1185, y: 520, radius: 36 };

/** The Sunspire's hit points: each leaked enemy costs its leak value. */
export const SPIRE_HP = 20;
/** The last wave: clearing it wins the game. */
export const FINAL_WAVE = 12;

/** Starting gold and enemy scaling per difficulty. */
export const DIFFICULTY = {
  easy: { label: 'Easy', hp: 0.8, speed: 0.9, gold: 280, score: 1 },
  normal: { label: 'Normal', hp: 1, speed: 1, gold: 220, score: 1 },
  hard: { label: 'Hard', hp: 1.25, speed: 1.1, gold: 180, score: 1.25 },
};

/**
 * Towers. Each has three levels: level 1 is bought, levels 2 and 3 are upgrades
 * (upgradeCost[i] buys level i+1). range in px, rate in shots per second.
 * Frost Lantern pulses an aura instead of firing a projectile.
 */
export const TOWERS = {
  sunbeam: {
    name: 'Sunbeam',
    key: '1',
    cost: 50,
    range: 120,
    damage: 9,
    rate: 2.0,
    splash: 0,
    slow: 0,
    slowSecs: 0,
    targets: 1,
    color: '#f2a900',
    dark: '#c47f00',
    desc: 'Fast rays, single target',
    upgradeCost: [55, 90],
    upgrade: [
      { damage: 14, range: 130, rate: 2.0 },
      { damage: 22, range: 140, rate: 2.6 },
    ],
  },
  prism: {
    name: 'Prism',
    key: '2',
    cost: 110,
    range: 140,
    damage: 26,
    rate: 0.7,
    splash: 55,
    slow: 0,
    slowSecs: 0,
    targets: 1,
    color: '#7c5cff',
    dark: '#5438c8',
    desc: 'Splash burst, hurts crowds',
    upgradeCost: [100, 160],
    upgrade: [
      { damage: 40, range: 150, splash: 70 },
      { damage: 62, range: 160, splash: 85, rate: 0.9 },
    ],
  },
  frost: {
    name: 'Frost Lantern',
    key: '3',
    cost: 80,
    range: 130,
    damage: 3,
    rate: 1.2,
    splash: 0,
    slow: 0.45,
    slowSecs: 1.6,
    targets: 3,
    color: '#37b6d9',
    dark: '#1d7f9e',
    desc: 'Chills up to 3 shadows',
    upgradeCost: [80, 130],
    upgrade: [
      { damage: 5, slow: 0.55, range: 140 },
      { damage: 8, slow: 0.65, range: 150 },
    ],
  },
  star: {
    name: 'Star Cannon',
    key: '4',
    cost: 160,
    range: 180,
    damage: 55,
    rate: 0.45,
    splash: 0,
    slow: 0,
    slowSecs: 0,
    targets: 1,
    color: '#e5484d',
    dark: '#a92c31',
    desc: 'One huge star-shell',
    upgradeCost: [150, 230],
    upgrade: [
      { damage: 90, range: 195 },
      { damage: 140, range: 210, rate: 0.6 },
    ],
  },
};
export const TOWER_ORDER = ['sunbeam', 'prism', 'frost', 'star'];
/** Selling a tower returns this share of everything spent on it. */
export const SELL_RATE = 0.7;
/** Bonus gold for calling the next wave while the last one still fights. */
export const EARLY_CALL_BONUS = 15;

/**
 * Enemies. hp and speed scale with the wave and the difficulty; bounty is the gold
 * a kill pays; leak is the Sunspire hit points a leaked enemy costs.
 */
export const ENEMIES = {
  shade: { name: 'Shade', hp: 30, speed: 55, radius: 13, bounty: 6, leak: 1, color: '#3b2d5c', eye: '#ffd166' },
  wisp: { name: 'Wisp', hp: 16, speed: 105, radius: 10, bounty: 7, leak: 1, color: '#5c2d4d', eye: '#ff8fb1' },
  bulwark: { name: 'Bulwark', hp: 130, speed: 32, radius: 19, bounty: 12, leak: 2, color: '#2b2b40', eye: '#ff5d5d' },
  boss: { name: 'Nightmaw', hp: 1200, speed: 26, radius: 30, bounty: 150, leak: 5, color: '#1d1233', eye: '#ff2e63' },
};
/** Enemy hit points grow this much per wave after the first. */
export const HP_PER_WAVE = 0.22;
/** Enemy speed grows this much per wave after the first (capped). */
export const SPEED_PER_WAVE = 0.03;
export const SPEED_WAVE_CAP = 1.4;

/** Seconds between spawns inside a wave, shrinking as waves go on. */
export const SPAWN_GAP = 0.75;
export const SPAWN_GAP_MIN = 0.32;

/** Gold paid when a wave is cleared, plus this per wave number. */
export const WAVE_BONUS = 20;
export const WAVE_BONUS_PER_WAVE = 4;
/** Score: a kill pays bounty x 10, a cleared wave 100 x wave, a boss 500. */
export const SCORE_KILL = 10;
export const SCORE_WAVE = 100;
export const SCORE_BOSS = 500;

/** How many projectiles, particles and floating texts can exist at once. */
export const POOL = { projectiles: 128, particles: 256, texts: 32 };

export const PALETTE = {
  backdrop: '#f6efdb',
  meadow: '#e9e2c2',
  meadowDark: '#ddd2a6',
  path: '#d9c184',
  pathEdge: '#c2a55e',
  grid: 'rgba(120, 100, 40, 0.10)',
  gridHover: 'rgba(242, 169, 0, 0.35)',
  gridBad: 'rgba(229, 72, 77, 0.30)',
  bar: '#efe6c8',
  barEdge: '#d8c795',
  panel: '#fffaf0',
  panelEdge: '#d8c795',
  ink: '#2e2a1e',
  muted: '#7a7159',
  gold: '#b8860b',
  goldBright: '#f2a900',
  red: '#e5484d',
  green: '#3d9e57',
  text: '#2e2a1e',
  spireGlow: 'rgba(255, 214, 90, 0.45)',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'lumen-keep.best';
