// Towers: what they cost, what they shoot, and how they grow. A tower is a
// grid cell with a kind, a level, and the gold sunk into it. Each step a tower
// cools down, picks the enemy furthest along the road inside its range, and
// fires — a projectile for Sunbeam, Prism and Star Cannon, an instant chilling
// pulse for the Frost Lantern.

import { POOL, TOWERS } from './config.js';

/** The live stats of a tower kind at a level (1, 2 or 3). */
export function towerStats(kind, level) {
  const def = TOWERS[kind];
  const stats = {
    range: def.range,
    damage: def.damage,
    rate: def.rate,
    splash: def.splash,
    slow: def.slow,
    slowSecs: def.slowSecs,
    targets: def.targets,
  };
  const up = def.upgrade[level - 2];
  if (up) Object.assign(stats, up);
  return stats;
}

/** Gold to buy a tower kind outright. */
export function towerCost(kind) {
  return TOWERS[kind].cost;
}

/** Gold to raise a tower from its current level to the next, or null at max. */
export function upgradeCost(tower) {
  const costs = TOWERS[tower.kind].upgradeCost;
  return tower.level >= 3 ? null : costs[tower.level - 1];
}

export function createTowers(random) {
  const list = [];
  const projectiles = [];
  const pulses = [];
  for (let i = 0; i < POOL.projectiles; i += 1) {
    projectiles.push({ active: false, x: 0, y: 0, target: null, speed: 0, damage: 0, splash: 0, kind: 'sunbeam', color: '#f2a900' });
  }
  for (let i = 0; i < POOL.particles; i += 1) {
    pulses.push({ active: false, x: 0, y: 0, radius: 0, max: 0, color: '#37b6d9' });
  }

  function freeProjectile() {
    for (const p of projectiles) if (!p.active) return p;
    return null;
  }

  function freePulse() {
    for (const p of pulses) if (!p.active) return p;
    return null;
  }

  /** Put a tower on a cell; returns the tower or null when the cell is taken. */
  function place(kind, col, row, x, y) {
    for (const t of list) if (t.col === col && t.row === row) return null;
    const tower = { kind, col, row, x, y, level: 1, cooldown: 0, invested: TOWERS[kind].cost, angle: -Math.PI / 2, flash: 0 };
    list.push(tower);
    return tower;
  }

  /** Remove a tower (sold or never built); returns the gold sunk into it. */
  function remove(tower) {
    const index = list.indexOf(tower);
    if (index !== -1) list.splice(index, 1);
    return tower.invested;
  }

  function at(col, row) {
    for (const t of list) if (t.col === col && t.row === row) return t;
    return null;
  }

  function furthestInRange(tower, stats, enemies) {
    let best = null;
    let boss = null;
    for (const enemy of enemies) {
      if (enemy.dead || enemy.reachedEnd) continue;
      const d = Math.hypot(enemy.x - tower.x, enemy.y - tower.y);
      if (d > stats.range + enemy.radius) continue;
      // Towers always focus the Nightmaw while it is in range: a boss the
      // guns ignore walks straight through to the Sunspire.
      if (enemy.kind === 'boss' && (boss === null || enemy.distance > boss.distance)) boss = enemy;
      if (best === null || enemy.distance > best.distance) best = enemy;
    }
    return boss ?? best;
  }

  function nearestInRange(tower, stats, enemies, count) {
    const found = [];
    for (const enemy of enemies) {
      if (enemy.dead || enemy.reachedEnd) continue;
      const d = Math.hypot(enemy.x - tower.x, enemy.y - tower.y);
      if (d <= stats.range + enemy.radius) found.push({ enemy, d });
    }
    found.sort((a, b) => a.d - b.d);
    return found.slice(0, count).map((entry) => entry.enemy);
  }

  /**
   * One step for every tower. Returns the shots fired this step, each naming the
   * tower kind (for its sound) and, for Frost Lanterns, the chilled enemies.
   */
  function step(dt, enemies, applySlow) {
    const shots = [];
    for (const tower of list) {
      if (tower.cooldown > 0) tower.cooldown -= dt;
      if (tower.flash > 0) tower.flash -= dt;
      const stats = towerStats(tower.kind, tower.level);
      if (tower.cooldown > 0) continue;
      if (tower.kind === 'frost') {
        const chilled = nearestInRange(tower, stats, enemies, stats.targets);
        if (chilled.length === 0) continue;
        tower.cooldown = 1 / stats.rate;
        tower.flash = 0.12;
        const pulse = freePulse();
        if (pulse) {
          pulse.active = true;
          pulse.x = tower.x;
          pulse.y = tower.y;
          pulse.radius = 8;
          pulse.max = stats.range;
          pulse.color = TOWERS.frost.color;
        }
        for (const enemy of chilled) applySlow(enemy, stats.slow, stats.slowSecs);
        shots.push({ kind: 'frost', tower, targets: chilled, damage: stats.damage });
        continue;
      }
      const target = furthestInRange(tower, stats, enemies);
      if (!target) continue;
      tower.cooldown = 1 / stats.rate;
      tower.flash = 0.1;
      tower.angle = Math.atan2(target.y - tower.y, target.x - tower.x);
      const shot = freeProjectile();
      if (!shot) continue;
      shot.active = true;
      shot.x = tower.x;
      shot.y = tower.y;
      shot.target = target;
      shot.speed = tower.kind === 'star' ? 520 : 420;
      shot.damage = stats.damage;
      shot.splash = stats.splash;
      shot.kind = tower.kind;
      shot.color = TOWERS[tower.kind].color;
      shots.push({ kind: tower.kind, tower, targets: [target], damage: stats.damage });
    }
    return shots;
  }

  /**
   * Fly every projectile one step. Returns the hits: each names the projectile's
   * kind, damage, splash radius and where it landed, so the world can apply it.
   */
  function stepProjectiles(dt) {
    const hits = [];
    for (const shot of projectiles) {
      if (!shot.active) continue;
      if (!shot.target || shot.target.dead || shot.target.reachedEnd) {
        shot.active = false;
        continue;
      }
      const dx = shot.target.x - shot.x;
      const dy = shot.target.y - shot.y;
      const dist = Math.hypot(dx, dy);
      const move = shot.speed * dt;
      if (dist <= move + shot.target.radius) {
        shot.active = false;
        hits.push({ kind: shot.kind, damage: shot.damage, splash: shot.splash, x: shot.target.x, y: shot.target.y, target: shot.target });
      } else {
        shot.x += (dx / dist) * move;
        shot.y += (dy / dist) * move;
      }
    }
    for (const pulse of pulses) {
      if (!pulse.active) continue;
      pulse.radius += 260 * dt;
      if (pulse.radius >= pulse.max) pulse.active = false;
    }
    return hits;
  }

  function reset() {
    list.length = 0;
    for (const shot of projectiles) shot.active = false;
    for (const pulse of pulses) pulse.active = false;
  }

  return { list, projectiles, pulses, place, remove, at, step, stepProjectiles, reset };
}
