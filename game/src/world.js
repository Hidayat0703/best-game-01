// The game's rules and state, with no drawing and no browser in it: gold, the
// Sunspire's hit points, waves, spawning, kills, leaks, score, and the win and
// loss. step() advances one fixed step and returns what happened as bit flags
// plus the sounds the step made, so the caller can react without the world
// knowing about screens or sound. Nothing here allocates after createWorld
// returns, except the short-lived event lists the caller drains each step.

import {
  DIFFICULTY,
  EARLY_CALL_BONUS,
  FINAL_WAVE,
  POOL,
  SCORE_BOSS,
  SCORE_KILL,
  SCORE_WAVE,
  SELL_RATE,
  SPIRE_HP,
  WAVE_BONUS,
  WAVE_BONUS_PER_WAVE,
} from './config.js';
import { createEnemies } from './enemies.js';
import { createTowers, towerCost, towerStats, upgradeCost } from './towers.js';
import { createPath } from './path.js';
import { waveGroups, waveTotal } from './waves.js';

export const EVENT_KILL = 1;
export const EVENT_LEAK = 2;
export const EVENT_WAVE_CLEAR = 4;
export const EVENT_WIN = 8;
export const EVENT_LOSS = 16;
export const EVENT_BOSS = 32;

export const PHASE_BUILD = 'build';
export const PHASE_WAVE = 'wave';
export const PHASE_WON = 'won';
export const PHASE_LOST = 'lost';

export function createWorld(random, difficultyName) {
  const difficulty = DIFFICULTY[difficultyName] ?? DIFFICULTY.normal;
  const path = createPath();
  const grid = path.buildableGrid();
  const enemies = createEnemies(path, random);
  const towers = createTowers(random);
  const particles = [];
  const texts = [];
  for (let i = 0; i < POOL.particles; i += 1) {
    particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 3, color: '#f2a900' });
  }
  for (let i = 0; i < POOL.texts; i += 1) {
    texts.push({ active: false, x: 0, y: 0, text: '', life: 0, color: '#b8860b' });
  }

  const state = {
    gold: difficulty.gold,
    score: 0,
    lives: SPIRE_HP,
    wave: 0,
    phase: PHASE_BUILD,
    kills: 0,
    goldEarned: 0,
    leaks: 0,
    bossesSlain: 0,
    elapsed: 0,
    enemiesLeft: 0,
    spawnQueue: [],
    spawnTimer: 0,
    speed: 1,
  };

  function freeParticle() {
    for (const p of particles) if (!p.active) return p;
    return null;
  }

  function freeText() {
    for (const t of texts) if (!t.active) return t;
    return null;
  }

  function burst(x, y, color, count, power) {
    for (let i = 0; i < count; i += 1) {
      const p = freeParticle();
      if (!p) return;
      const angle = random() * Math.PI * 2;
      const speed = (0.4 + random() * 0.6) * power;
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed - 30;
      p.life = 0.5 + random() * 0.4;
      p.max = p.life;
      p.size = 2 + random() * 3;
      p.color = color;
    }
  }

  function floatText(x, y, text, color) {
    const t = freeText();
    if (!t) return;
    t.active = true;
    t.x = x;
    t.y = y;
    t.text = text;
    t.life = 1;
    t.color = color;
  }

  function reset() {
    state.gold = difficulty.gold;
    state.score = 0;
    state.lives = SPIRE_HP;
    state.wave = 0;
    state.phase = PHASE_BUILD;
    state.kills = 0;
    state.goldEarned = 0;
    state.leaks = 0;
    state.bossesSlain = 0;
    state.elapsed = 0;
    state.enemiesLeft = 0;
    state.spawnQueue = [];
    state.spawnTimer = 0;
    state.speed = 1;
    enemies.reset();
    towers.reset();
    for (const p of particles) p.active = false;
    for (const t of texts) t.active = false;
  }

  /** Start the next wave. Returns false when no wave is left to start. */
  function startWave() {
    if (state.phase === PHASE_WON || state.phase === PHASE_LOST) return false;
    if (state.wave >= FINAL_WAVE) return false;
    const early = state.phase === PHASE_WAVE;
    state.wave += 1;
    state.phase = PHASE_WAVE;
    state.spawnQueue = [];
    for (const group of waveGroups(state.wave)) {
      for (let i = 0; i < group.count; i += 1) state.spawnQueue.push({ kind: group.kind, gap: group.gap });
    }
    state.spawnTimer = 0.6;
    state.enemiesLeft = state.spawnQueue.length;
    if (early) {
      state.gold += EARLY_CALL_BONUS;
      state.goldEarned += EARLY_CALL_BONUS;
      floatText(640, 90, `+${EARLY_CALL_BONUS} bravery gold`, '#b8860b');
    }
    return true;
  }

  /** Place a tower; returns the tower, or null when it cannot be afforded or built. */
  function placeTower(kind, col, row) {
    if (!grid[row] || !grid[row][col]) return null;
    if (towers.at(col, row)) return null;
    const cost = towerCost(kind);
    if (state.gold < cost) return null;
    const centre = { x: col * 64 + 32, y: row * 64 + 32 };
    const tower = towers.place(kind, col, row, centre.x, centre.y);
    if (!tower) return null;
    state.gold -= cost;
    return tower;
  }

  /** Raise a tower one level; returns false when it is maxed or unaffordable. */
  function upgradeTower(tower) {
    const cost = upgradeCost(tower);
    if (cost === null || state.gold < cost) return false;
    state.gold -= cost;
    tower.invested += cost;
    tower.level += 1;
    return true;
  }

  /** Sell a tower; returns the gold refunded, or 0 when there is no tower. */
  function sellTower(tower) {
    if (!tower) return 0;
    const refund = Math.floor(towers.remove(tower) * SELL_RATE);
    state.gold += refund;
    return refund;
  }

  function damageEnemy(enemy, damage) {
    enemy.hp -= damage;
    enemy.hitFlash = 0.12;
    if (enemy.hp > 0) return false;
    enemy.dead = true;
    return true;
  }

  function killEnemy(enemy, events) {
    state.kills += 1;
    state.gold += enemy.bounty;
    state.goldEarned += enemy.bounty;
    state.score += Math.round(enemy.bounty * SCORE_KILL * difficulty.score);
    state.enemiesLeft = Math.max(0, state.enemiesLeft - 1);
    burst(enemy.x, enemy.y, '#f2c94c', enemy.kind === 'boss' ? 26 : 8, enemy.kind === 'boss' ? 160 : 90);
    floatText(enemy.x, enemy.y - 14, `+${enemy.bounty}`, '#b8860b');
    if (enemy.kind === 'boss') {
      state.bossesSlain += 1;
      state.score += Math.round(SCORE_BOSS * difficulty.score);
      events.sounds.push('bossDown');
    }
    events.flags |= EVENT_KILL;
  }

  function stepProjectilesAndShots(dt, events) {
    const shots = towers.step(dt, enemies.list, enemies.applySlow);
    for (const shot of shots) {
      if (shot.kind === 'frost') {
        for (const target of shot.targets) {
          if (damageEnemy(target, shot.damage)) killEnemy(target, events);
        }
        events.sounds.push({ shoot: 'frost' });
      } else {
        events.sounds.push({ shoot: shot.kind });
      }
    }
    for (const hit of towers.stepProjectiles(dt)) {
      if (hit.splash > 0) {
        burst(hit.x, hit.y, '#b9a7ff', 10, 110);
        for (const enemy of enemies.list) {
          if (enemy.dead || enemy.reachedEnd) continue;
          if (Math.hypot(enemy.x - hit.x, enemy.y - hit.y) <= hit.splash + enemy.radius) {
            if (damageEnemy(enemy, hit.damage)) killEnemy(enemy, events);
          }
        }
      } else if (hit.target && !hit.target.dead && !hit.target.reachedEnd) {
        if (damageEnemy(hit.target, hit.damage)) killEnemy(hit.target, events);
      }
    }
  }

  /**
   * One fixed step. `dt` is already the fixed step size; the caller repeats the
   * step for 2x speed. Returns { flags, sounds } for the caller to react to.
   */
  function step(dt) {
    const events = { flags: 0, sounds: [] };
    if (state.phase === PHASE_WON || state.phase === PHASE_LOST) return events;
    state.elapsed += dt;

    if (state.phase === PHASE_WAVE) {
      if (state.spawnQueue.length > 0) {
        state.spawnTimer -= dt;
        if (state.spawnTimer <= 0) {
          const next = state.spawnQueue.shift();
          const boss = next.kind === 'boss';
          enemies.spawn(next.kind, state.wave, difficulty.hp, difficulty.speed);
          if (boss) events.flags |= EVENT_BOSS;
          state.spawnTimer = next.gap;
        }
      }
      const arrived = enemies.step(dt, state.elapsed);
      for (const enemy of arrived) {
        state.lives -= enemy.leak;
        state.leaks += 1;
        state.enemiesLeft = Math.max(0, state.enemiesLeft - 1);
        burst(enemy.x, enemy.y, '#e5484d', 12, 120);
        floatText(enemy.x - 20, enemy.y - 20, `-${enemy.leak}`, '#e5484d');
        events.flags |= EVENT_LEAK;
        events.sounds.push('leak');
      }
      stepProjectilesAndShots(dt, events);
      enemies.sweep();

      if (state.lives <= 0) {
        state.lives = 0;
        state.phase = PHASE_LOST;
        events.flags |= EVENT_LOSS;
        events.sounds.push('lose');
        return events;
      }
      if (state.spawnQueue.length === 0 && enemies.list.length === 0) {
        const bonus = WAVE_BONUS + WAVE_BONUS_PER_WAVE * state.wave;
        state.gold += bonus;
        state.goldEarned += bonus;
        state.score += Math.round(SCORE_WAVE * state.wave * difficulty.score);
        events.flags |= EVENT_WAVE_CLEAR;
        events.sounds.push('coin');
        floatText(640, 90, `Wave clear +${bonus} gold`, '#b8860b');
        if (state.wave >= FINAL_WAVE) {
          state.phase = PHASE_WON;
          events.flags |= EVENT_WIN;
          events.sounds.push('win');
        } else {
          state.phase = PHASE_BUILD;
        }
      }
    }

    for (const p of particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 160 * dt;
    }
    for (const t of texts) {
      if (!t.active) continue;
      t.life -= dt;
      t.y -= 24 * dt;
      if (t.life <= 0) t.active = false;
    }
    return events;
  }

  /** True when the wave is over and the next one can be called. */
  function betweenWaves() {
    return state.phase === PHASE_BUILD;
  }

  /** Gold a tower would refund right now (shown before selling). */
  function sellValue(tower) {
    return Math.floor(tower.invested * SELL_RATE);
  }

  reset();
  return {
    state,
    path,
    grid,
    enemies,
    towers,
    particles,
    texts,
    difficulty,
    reset,
    startWave,
    placeTower,
    upgradeTower,
    sellTower,
    sellValue,
    betweenWaves,
    step,
    waveTotal: () => waveTotal(state.wave),
  };
}
