// Enemies: the shadows that walk the road. An enemy is a position on the path
// (distance travelled), hit points, a slow effect, and a wobble so the crowd
// does not march in lockstep. Bosses are just big enemies with a crown of eyes.

import { ENEMIES, HP_PER_WAVE, SPEED_PER_WAVE, SPEED_WAVE_CAP } from './config.js';

export const KIND_SHADE = 'shade';
export const KIND_WISP = 'wisp';
export const KIND_BULWARK = 'bulwark';
export const KIND_BOSS = 'boss';

/** Hit points for a kind on a wave, after the difficulty multiplier. */
export function enemyHp(kind, wave, hpScale) {
  const base = ENEMIES[kind].hp;
  const waveScale = kind === KIND_BOSS ? 1 + 0.3 * (wave - 1) : 1 + HP_PER_WAVE * (wave - 1);
  return Math.round(base * waveScale * hpScale);
}

/** Walk speed for a kind on a wave, after the difficulty multiplier. */
export function enemySpeed(kind, wave, speedScale) {
  const base = ENEMIES[kind].speed;
  const waveScale = Math.min(SPEED_WAVE_CAP, 1 + SPEED_PER_WAVE * (wave - 1));
  return base * waveScale * speedScale;
}

export function createEnemies(path, random) {
  const list = [];

  /** Spawn one enemy of a kind at the road's start. */
  function spawn(kind, wave, hpScale, speedScale) {
    const def = ENEMIES[kind];
    const hp = enemyHp(kind, wave, hpScale);
    const enemy = {
      kind,
      x: path.points[0].x,
      y: path.points[0].y,
      distance: 0,
      hp,
      maxHp: hp,
      speed: enemySpeed(kind, wave, speedScale),
      radius: def.radius,
      bounty: def.bounty,
      leak: def.leak,
      slowFactor: 1,
      slowLeft: 0,
      wobble: random() * Math.PI * 2,
      wobbleSpeed: 1.5 + random() * 2,
      dead: false,
      reachedEnd: false,
      hitFlash: 0,
    };
    list.push(enemy);
    return enemy;
  }

  /** Chill an enemy: it walks slower for `secs` seconds. */
  function applySlow(enemy, factor, secs) {
    enemy.slowFactor = Math.min(enemy.slowFactor, 1 - factor);
    enemy.slowLeft = Math.max(enemy.slowLeft, secs);
  }

  /** Walk every living enemy one step; returns the ones that reached the Sunspire. */
  function step(dt, elapsed) {
    const arrived = [];
    for (const enemy of list) {
      if (enemy.dead || enemy.reachedEnd) continue;
      if (enemy.slowLeft > 0) {
        enemy.slowLeft -= dt;
        if (enemy.slowLeft <= 0) enemy.slowFactor = 1;
      }
      if (enemy.hitFlash > 0) enemy.hitFlash -= dt;
      enemy.distance += enemy.speed * enemy.slowFactor * dt;
      const at = path.pointAt(enemy.distance);
      const wob = Math.sin(elapsed * enemy.wobbleSpeed + enemy.wobble) * 4;
      enemy.x = at.x;
      enemy.y = at.y + wob;
      if (enemy.distance >= path.total) {
        enemy.reachedEnd = true;
        arrived.push(enemy);
      }
    }
    return arrived;
  }

  /** Drop the dead and the arrived; keep the living for the next step. */
  function sweep() {
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (list[i].dead || list[i].reachedEnd) list.splice(i, 1);
    }
  }

  function reset() {
    list.length = 0;
  }

  return { list, spawn, applySlow, step, sweep, reset };
}
