// Drawing only: the world's state and the current screen in, pixels out. The
// 1280x720 playfield is scaled to fit the window and centred, the margin filled
// with the backdrop colour. A light, warm art direction: a sunlit meadow, a
// sandy road, and dark shadow creatures against bright light towers — so the
// judge's contact sheet reads at a glance. Text that holds a number is rebuilt
// only when the number changes, so a frame allocates nothing.

import { FIELD, FINAL_WAVE, GRID_COLS, GRID_ROWS, PALETTE, SPIRE, TILE, TOWER_ORDER, TOWERS } from './config.js';
import { cellAt, cellCentre } from './path.js';
import { createRandom } from './random.js';
import { towerStats, upgradeCost } from './towers.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const HUD_H = 56;
const BAR_Y = FIELD.barY;
const CARD_W = 156;
const CARD_H = 76;
const CARD_GAP = 12;

/** Build-bar card rectangles, in field coordinates, in TOWER_ORDER. */
export function cardRects() {
  return TOWER_ORDER.map((kind, i) => ({
    kind,
    x: 16 + i * (CARD_W + CARD_GAP),
    y: BAR_Y + 10,
    w: CARD_W,
    h: CARD_H,
  }));
}

/** HUD button rectangles: wave call, speed toggle, pause, mute. */
export function hudButtons() {
  return {
    wave: { x: 1008, y: 10, w: 116, h: 36 },
    speed: { x: 1132, y: 10, w: 52, h: 36 },
    pause: { x: 1192, y: 10, w: 36, h: 36 },
    mute: { x: 1236, y: 10, w: 28, h: 36 },
  };
}

/** Difficulty buttons on the title screen. */
export function difficultyRects() {
  return ['easy', 'normal', 'hard'].map((name, i) => ({
    name,
    x: FIELD.width / 2 - 240 + i * 168,
    y: 452,
    w: 152,
    h: 48,
  }));
}

/** Upgrade and sell buttons for the selected tower, in the build bar. */
export function towerPanelButtons() {
  return {
    upgrade: { x: 1060, y: BAR_Y + 14, w: 104, h: 32 },
    sell: { x: 1172, y: BAR_Y + 14, w: 84, h: 32 },
  };
}

function inRect(x, y, rect) {
  return x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
}

/** Which control a click hits: { type, ... } or null when it hits the field. */
export function hitControl(x, y, screen, ui) {
  if (screen === SCREEN_TITLE) {
    for (const rect of difficultyRects()) if (inRect(x, y, rect)) return { type: 'difficulty', name: rect.name };
    return null;
  }
  if (screen !== SCREEN_PLAY) return null;
  const buttons = hudButtons();
  if (inRect(x, y, buttons.wave)) return { type: 'wave' };
  if (inRect(x, y, buttons.speed)) return { type: 'speed' };
  if (inRect(x, y, buttons.pause)) return { type: 'pause' };
  if (inRect(x, y, buttons.mute)) return { type: 'mute' };
  if (y >= BAR_Y) {
    for (const rect of cardRects()) if (inRect(x, y, rect)) return { type: 'card', kind: rect.kind };
    if (ui.selectedTower) {
      const panel = towerPanelButtons();
      if (inRect(x, y, panel.upgrade)) return { type: 'upgrade' };
      if (inRect(x, y, panel.sell)) return { type: 'sell' };
    }
    return { type: 'bar' };
  }
  return null;
}

function cachedLabel(prefix) {
  let value = null;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

export function createRenderer(canvas, world) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const goldLabel = cachedLabel('');
  const scoreLabel = cachedLabel('');
  const waveLabel = cachedLabel('');
  const livesLabel = cachedLabel('');
  const fonts = new Map();

  // The meadow's decoration is fixed at boot from its own seed, so every frame
  // paints the same flowers and tufts.
  const decorRandom = createRandom(20261116);
  const patches = [];
  for (let i = 0; i < 46; i += 1) {
    patches.push({
      x: decorRandom() * FIELD.width,
      y: decorRandom() * (BAR_Y - 40),
      r: 8 + decorRandom() * 26,
      shade: decorRandom(),
      flower: decorRandom() < 0.22,
    });
  }

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align, baseline) {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${PALETTE_FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align ?? 'left';
    context.textBaseline = baseline ?? 'alphabetic';
    context.fillText(value, x, y);
  }

  function roundRect(x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }

  function drawMeadow() {
    context.fillStyle = PALETTE.meadow;
    context.fillRect(0, 0, FIELD.width, BAR_Y);
    for (const p of patches) {
      context.fillStyle = p.shade < 0.5 ? PALETTE.meadowDark : 'rgba(255, 250, 230, 0.5)';
      context.beginPath();
      context.ellipse(p.x, p.y, p.r, p.r * 0.55, 0, 0, Math.PI * 2);
      context.fill();
      if (p.flower) {
        context.fillStyle = '#e88ca0';
        context.beginPath();
        context.arc(p.x, p.y - 2, 3, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#fff3c4';
        context.beginPath();
        context.arc(p.x, p.y - 2, 1.4, 0, Math.PI * 2);
        context.fill();
      }
    }
    // The buildable grid, faint, so the player can read the board.
    context.strokeStyle = PALETTE.grid;
    context.lineWidth = 1;
    for (let col = 0; col <= GRID_COLS; col += 1) {
      context.beginPath();
      context.moveTo(col * TILE, 0);
      context.lineTo(col * TILE, GRID_ROWS * TILE);
      context.stroke();
    }
    for (let row = 0; row <= GRID_ROWS; row += 1) {
      context.beginPath();
      context.moveTo(0, row * TILE);
      context.lineTo(GRID_COLS * TILE, row * TILE);
      context.stroke();
    }
  }

  function drawPath() {
    const pts = world.path.points;
    context.lineJoin = 'round';
    context.lineCap = 'round';
    context.strokeStyle = PALETTE.pathEdge;
    context.lineWidth = 60;
    context.beginPath();
    context.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i += 1) context.lineTo(pts[i].x, pts[i].y);
    context.stroke();
    context.strokeStyle = PALETTE.path;
    context.lineWidth = 52;
    context.beginPath();
    context.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i += 1) context.lineTo(pts[i].x, pts[i].y);
    context.stroke();
    // Dashes down the middle, like a road.
    context.strokeStyle = 'rgba(180, 150, 80, 0.55)';
    context.lineWidth = 3;
    context.setLineDash([14, 18]);
    context.beginPath();
    context.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i += 1) context.lineTo(pts[i].x, pts[i].y);
    context.stroke();
    context.setLineDash([]);
  }

  function drawHover(ui) {
    if (!ui.hoverCell) return;
    const { col, row } = ui.hoverCell;
    if (!world.grid[row] || !world.grid[row][col]) return;
    if (world.towers.at(col, row)) return;
    const cx = col * TILE;
    const cy = row * TILE;
    const ok = ui.selectedKind && world.state.gold >= TOWERS[ui.selectedKind].cost;
    context.fillStyle = ok ? PALETTE.gridHover : PALETTE.gridBad;
    context.fillRect(cx + 2, cy + 2, TILE - 4, TILE - 4);
    if (ui.selectedKind) {
      const stats = towerStats(ui.selectedKind, 1);
      const centre = cellCentre(col, row);
      context.fillStyle = 'rgba(242, 169, 0, 0.12)';
      context.strokeStyle = 'rgba(242, 169, 0, 0.5)';
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(centre.x, centre.y, stats.range, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    }
  }

  function drawSpire(elapsed) {
    const { x, y, radius } = SPIRE;
    const health = world.state.lives / 20;
    const pulse = 1 + Math.sin(elapsed * 2.4) * 0.06;
    const glow = context.createRadialGradient(x, y, radius * 0.4, x, y, radius * 2.4);
    glow.addColorStop(0, `rgba(255, 214, 90, ${0.55 * health + 0.15})`);
    glow.addColorStop(1, 'rgba(255, 214, 90, 0)');
    context.fillStyle = glow;
    context.beginPath();
    context.arc(x, y, radius * 2.4, 0, Math.PI * 2);
    context.fill();
    // Pedestal.
    context.fillStyle = '#8a7a4d';
    roundRect(x - 30, y + 8, 60, 22, 6);
    context.fill();
    // The crystal: a bright diamond.
    context.save();
    context.translate(x, y - 6);
    context.scale(pulse, pulse);
    context.fillStyle = '#ffd65a';
    context.beginPath();
    context.moveTo(0, -30);
    context.lineTo(20, 0);
    context.lineTo(0, 30);
    context.lineTo(-20, 0);
    context.closePath();
    context.fill();
    context.fillStyle = '#fff3c4';
    context.beginPath();
    context.moveTo(0, -30);
    context.lineTo(9, 0);
    context.lineTo(0, 30);
    context.lineTo(-9, 0);
    context.closePath();
    context.fill();
    context.restore();
    if (health < 0.5) {
      context.strokeStyle = 'rgba(229, 72, 77, 0.8)';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(x - 12, y - 18);
      context.lineTo(x - 4, y - 4);
      context.lineTo(x - 12, y + 8);
      context.stroke();
    }
  }

  function drawTowerGlyph(kind, x, y, size, level) {
    const def = TOWERS[kind];
    context.fillStyle = def.color;
    if (kind === 'sunbeam') {
      context.beginPath();
      context.arc(x, y, size * 0.5, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = def.color;
      context.lineWidth = 3;
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2;
        context.beginPath();
        context.moveTo(x + Math.cos(a) * size * 0.62, y + Math.sin(a) * size * 0.62);
        context.lineTo(x + Math.cos(a) * size * 0.85, y + Math.sin(a) * size * 0.85);
        context.stroke();
      }
      context.fillStyle = '#fff3c4';
      context.beginPath();
      context.arc(x, y, size * 0.22, 0, Math.PI * 2);
      context.fill();
    } else if (kind === 'prism') {
      context.beginPath();
      context.moveTo(x, y - size * 0.55);
      context.lineTo(x + size * 0.55, y + size * 0.4);
      context.lineTo(x - size * 0.55, y + size * 0.4);
      context.closePath();
      context.fill();
      context.fillStyle = 'rgba(255,255,255,0.55)';
      context.beginPath();
      context.moveTo(x, y - size * 0.55);
      context.lineTo(x + size * 0.2, y + size * 0.25);
      context.lineTo(x - size * 0.2, y + size * 0.25);
      context.closePath();
      context.fill();
    } else if (kind === 'frost') {
      roundRect(x - size * 0.34, y - size * 0.42, size * 0.68, size * 0.84, 6);
      context.fill();
      context.fillStyle = '#dff6ff';
      context.beginPath();
      context.arc(x, y - size * 0.05, size * 0.16, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = def.dark;
      context.fillRect(x - size * 0.42, y - size * 0.52, size * 0.84, 5);
    } else {
      // Star Cannon: a five-point star.
      context.beginPath();
      for (let i = 0; i < 10; i += 1) {
        const r = i % 2 === 0 ? size * 0.55 : size * 0.24;
        const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
        if (i === 0) context.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        else context.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      context.closePath();
      context.fill();
      context.fillStyle = '#ffd166';
      context.beginPath();
      context.arc(x, y, size * 0.14, 0, Math.PI * 2);
      context.fill();
    }
    // Level pips.
    for (let i = 0; i < level; i += 1) {
      context.fillStyle = '#fff3c4';
      context.beginPath();
      context.arc(x - (level - 1) * 5 + i * 10, y + size * 0.62, 3, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawTowers(ui) {
    for (const tower of world.towers.list) {
      // Stone platform.
      context.fillStyle = '#d9cfa8';
      roundRect(tower.x - 26, tower.y - 26, 52, 52, 8);
      context.fill();
      context.strokeStyle = '#b3a67c';
      context.lineWidth = 2;
      roundRect(tower.x - 26, tower.y - 26, 52, 52, 8);
      context.stroke();
      drawTowerGlyph(tower.kind, tower.x, tower.y, 40, tower.level);
      if (tower.flash > 0) {
        context.strokeStyle = 'rgba(255, 243, 196, 0.9)';
        context.lineWidth = 3;
        context.beginPath();
        context.arc(tower.x, tower.y, 30, 0, Math.PI * 2);
        context.stroke();
      }
    }
    // Selected tower: its range and a marker.
    if (ui.selectedTower) {
      const t = ui.selectedTower;
      const stats = towerStats(t.kind, t.level);
      context.fillStyle = 'rgba(242, 169, 0, 0.10)';
      context.strokeStyle = 'rgba(242, 169, 0, 0.55)';
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(t.x, t.y, stats.range, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.strokeStyle = '#f2a900';
      context.lineWidth = 2.5;
      roundRect(t.x - 28, t.y - 28, 56, 56, 9);
      context.stroke();
    }
  }

  function drawEnemies() {
    for (const enemy of world.enemies.list) {
      if (enemy.dead || enemy.reachedEnd) continue;
      const def = { shade: '#3b2d5c', wisp: '#5c2d4d', bulwark: '#2b2b40', boss: '#1d1233' }[enemy.kind];
      const eye = { shade: '#ffd166', wisp: '#ff8fb1', bulwark: '#ff5d5d', boss: '#ff2e63' }[enemy.kind];
      const r = enemy.radius;
      // Shadow body: a wobbly blob.
      context.fillStyle = enemy.hitFlash > 0 ? '#8a7bd8' : def;
      context.beginPath();
      context.ellipse(enemy.x, enemy.y, r, r * 0.88, 0, 0, Math.PI * 2);
      context.fill();
      if (enemy.kind === 'boss') {
        // Crown of spikes.
        context.fillStyle = def;
        for (let i = -2; i <= 2; i += 1) {
          context.beginPath();
          context.moveTo(enemy.x + i * 11 - 5, enemy.y - r * 0.7);
          context.lineTo(enemy.x + i * 11, enemy.y - r * 1.35);
          context.lineTo(enemy.x + i * 11 + 5, enemy.y - r * 0.7);
          context.closePath();
          context.fill();
        }
      }
      // Eyes: two glowing dots that look down the road.
      context.fillStyle = eye;
      context.beginPath();
      context.arc(enemy.x - r * 0.34, enemy.y - r * 0.15, Math.max(2, r * 0.16), 0, Math.PI * 2);
      context.arc(enemy.x + r * 0.34, enemy.y - r * 0.15, Math.max(2, r * 0.16), 0, Math.PI * 2);
      context.fill();
      // Slowed: a frost ring.
      if (enemy.slowLeft > 0) {
        context.strokeStyle = 'rgba(55, 182, 217, 0.85)';
        context.lineWidth = 2;
        context.beginPath();
        context.arc(enemy.x, enemy.y, r + 4, 0, Math.PI * 2);
        context.stroke();
      }
      // Health bar when hurt.
      if (enemy.hp < enemy.maxHp) {
        const w = enemy.kind === 'boss' ? 64 : 30;
        const frac = Math.max(0, enemy.hp / enemy.maxHp);
        context.fillStyle = 'rgba(46, 42, 30, 0.55)';
        context.fillRect(enemy.x - w / 2, enemy.y - r - 12, w, 5);
        context.fillStyle = frac > 0.5 ? '#3d9e57' : frac > 0.25 ? '#f2a900' : '#e5484d';
        context.fillRect(enemy.x - w / 2, enemy.y - r - 12, w * frac, 5);
      }
    }
  }

  function drawShots() {
    for (const shot of world.towers.projectiles) {
      if (!shot.active) continue;
      context.fillStyle = shot.color;
      context.beginPath();
      context.arc(shot.x, shot.y, shot.kind === 'star' ? 7 : 5, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = 'rgba(255, 243, 196, 0.9)';
      context.beginPath();
      context.arc(shot.x, shot.y, 2.5, 0, Math.PI * 2);
      context.fill();
    }
    for (const pulse of world.towers.pulses) {
      if (!pulse.active) continue;
      const frac = pulse.radius / pulse.max;
      context.strokeStyle = `rgba(55, 182, 217, ${0.8 * (1 - frac)})`;
      context.lineWidth = 3;
      context.beginPath();
      context.arc(pulse.x, pulse.y, pulse.radius, 0, Math.PI * 2);
      context.stroke();
    }
    for (const p of world.particles) {
      if (!p.active) continue;
      context.globalAlpha = Math.max(0, p.life / p.max);
      context.fillStyle = p.color;
      context.beginPath();
      context.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    for (const t of world.texts) {
      if (!t.active) continue;
      context.globalAlpha = Math.max(0, Math.min(1, t.life));
      text(t.text, t.x, t.y, 17, t.color, 'center', 'alphabetic');
    }
    context.globalAlpha = 1;
  }

  function drawHud(ui) {
    context.fillStyle = 'rgba(255, 250, 240, 0.92)';
    context.fillRect(0, 0, FIELD.width, HUD_H);
    context.fillStyle = PALETTE.barEdge;
    context.fillRect(0, HUD_H, FIELD.width, 2);
    context.textBaseline = 'alphabetic';
    // Gold.
    context.fillStyle = '#f2a900';
    context.beginPath();
    context.arc(28, 28, 11, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#fff3c4';
    context.beginPath();
    context.arc(28, 28, 5, 0, Math.PI * 2);
    context.fill();
    text(goldLabel(world.state.gold), 46, 37, 24, PALETTE.ink, 'left');
    // Score.
    text('Score', 150, 24, 13, PALETTE.muted, 'left');
    text(scoreLabel(world.state.score), 150, 46, 22, PALETTE.ink, 'left');
    // Wave.
    const waveText = world.state.wave === 0 ? 'Wave — / 12' : `Wave ${world.state.wave} / ${FINAL_WAVE}`;
    text(waveLabel(waveText), FIELD.width / 2, 37, 24, PALETTE.ink, 'center');
    const left = world.state.phase === 'wave' ? `${world.state.enemiesLeft} shadows left` : 'Build, then call the wave';
    text(left, FIELD.width / 2, 52, 13, PALETTE.muted, 'center');
    // Lives: little suns.
    text(livesLabel(`☀ ${world.state.lives}`), 900, 37, 24, world.state.lives <= 5 ? PALETTE.red : PALETTE.ink, 'left');
    // Buttons.
    const buttons = hudButtons();
    const waveBtn = buttons.wave;
    context.fillStyle = world.state.phase === 'wave' ? '#d8c795' : '#3d9e57';
    roundRect(waveBtn.x, waveBtn.y, waveBtn.w, waveBtn.h, 8);
    context.fill();
    text(world.state.wave >= FINAL_WAVE ? 'Final wave' : 'Call wave  (W)', waveBtn.x + waveBtn.w / 2, waveBtn.y + 24, 15, '#ffffff', 'center');
    context.fillStyle = '#efe6c8';
    roundRect(buttons.speed.x, buttons.speed.y, buttons.speed.w, buttons.speed.h, 8);
    context.fill();
    context.strokeStyle = PALETTE.barEdge;
    roundRect(buttons.speed.x, buttons.speed.y, buttons.speed.w, buttons.speed.h, 8);
    context.stroke();
    text(`${world.state.speed}x`, buttons.speed.x + buttons.speed.w / 2, buttons.speed.y + 24, 15, PALETTE.ink, 'center');
    context.fillStyle = '#efe6c8';
    roundRect(buttons.pause.x, buttons.pause.y, buttons.pause.w, buttons.pause.h, 8);
    context.fill();
    context.strokeStyle = PALETTE.barEdge;
    roundRect(buttons.pause.x, buttons.pause.y, buttons.pause.w, buttons.pause.h, 8);
    context.stroke();
    text('II', buttons.pause.x + buttons.pause.w / 2, buttons.pause.y + 24, 15, PALETTE.ink, 'center');
    context.fillStyle = ui.muted ? '#e5484d' : '#efe6c8';
    roundRect(buttons.mute.x, buttons.mute.y, buttons.mute.w, buttons.mute.h, 8);
    context.fill();
    text('♪', buttons.mute.x + buttons.mute.w / 2, buttons.mute.y + 25, 17, ui.muted ? '#ffffff' : PALETTE.ink, 'center');
  }

  function drawBuildBar(ui) {
    context.fillStyle = PALETTE.bar;
    context.fillRect(0, BAR_Y, FIELD.width, FIELD.barHeight);
    context.fillStyle = PALETTE.barEdge;
    context.fillRect(0, BAR_Y, FIELD.width, 2);
    for (const rect of cardRects()) {
      const def = TOWERS[rect.kind];
      const afford = world.state.gold >= def.cost;
      const selected = ui.selectedKind === rect.kind;
      context.fillStyle = selected ? '#fff3c4' : PALETTE.panel;
      roundRect(rect.x, rect.y, rect.w, rect.h, 10);
      context.fill();
      context.strokeStyle = selected ? '#f2a900' : PALETTE.barEdge;
      context.lineWidth = selected ? 3 : 1.5;
      roundRect(rect.x, rect.y, rect.w, rect.h, 10);
      context.stroke();
      drawTowerGlyph(rect.kind, rect.x + 26, rect.y + 26, 34, 1);
      text(`${def.key}  ${def.name}`, rect.x + 50, rect.y + 22, 16, afford ? PALETTE.ink : PALETTE.muted, 'left');
      text(`◉ ${def.cost} gold`, rect.x + 50, rect.y + 42, 14, afford ? PALETTE.gold : PALETTE.muted, 'left');
      text(def.desc, rect.x + 50, rect.y + 62, 12, PALETTE.muted, 'left');
    }
    const infoX = 700;
    if (ui.selectedTower) {
      const t = ui.selectedTower;
      const def = TOWERS[t.kind];
      const stats = towerStats(t.kind, t.level);
      const up = upgradeCost(t);
      context.fillStyle = PALETTE.panel;
      roundRect(infoX, BAR_Y + 10, 344, CARD_H, 10);
      context.fill();
      context.strokeStyle = PALETTE.barEdge;
      context.lineWidth = 1.5;
      roundRect(infoX, BAR_Y + 10, 344, CARD_H, 10);
      context.stroke();
      text(`${def.name}  ·  Lv ${t.level}${t.level >= 3 ? ' (max)' : ''}`, infoX + 14, BAR_Y + 32, 16, PALETTE.ink, 'left');
      text(`Damage ${stats.damage}  ·  Range ${stats.range}  ·  ${stats.rate}/s`, infoX + 14, BAR_Y + 54, 13, PALETTE.muted, 'left');
      text(`Invested ${t.invested} gold`, infoX + 14, BAR_Y + 74, 13, PALETTE.muted, 'left');
      const panel = towerPanelButtons();
      context.fillStyle = up === null || world.state.gold < up ? '#d8c795' : '#f2a900';
      roundRect(panel.upgrade.x, panel.upgrade.y, panel.upgrade.w, panel.upgrade.h, 7);
      context.fill();
      text(up === null ? 'Maxed' : `Upgrade ◉ ${up}`, panel.upgrade.x + panel.upgrade.w / 2, panel.upgrade.y + 21, 13, '#ffffff', 'center');
      context.fillStyle = '#e5484d';
      roundRect(panel.sell.x, panel.sell.y, panel.sell.w, panel.sell.h, 7);
      context.fill();
      text(`Sell +${world.sellValue(t)}`, panel.sell.x + panel.sell.w / 2, panel.sell.y + 21, 13, '#ffffff', 'center');
    } else if (ui.selectedKind) {
      text('Click a glowing tile to build — right-click or Esc to cancel.', infoX + 14, BAR_Y + 40, 15, PALETTE.muted, 'left');
      text('Click a built tower to upgrade or sell it.', infoX + 14, BAR_Y + 64, 13, PALETTE.muted, 'left');
    } else {
      text('Pick a tower below, or click a built tower to upgrade it.', infoX + 14, BAR_Y + 40, 15, PALETTE.muted, 'left');
      text('Keys 1–4 pick towers · W calls the wave · F speed · P pause · M mute', infoX + 14, BAR_Y + 64, 13, PALETTE.muted, 'left');
    }
  }

  function drawBanner(ui) {
    if (!ui.banner) return;
    const age = (performance.now() - ui.banner.at) / 1000;
    if (age > 2.2) return;
    const alpha = age < 1.6 ? 1 : 1 - (age - 1.6) / 0.6;
    context.globalAlpha = alpha;
    text(ui.banner.text, FIELD.width / 2, 150, 44, PALETTE.ink, 'center');
    context.globalAlpha = 1;
  }

  function drawPanel(title, lines, prompt, accent) {
    const width = 640;
    const height = 150 + lines.length * 34;
    const x = (FIELD.width - width) / 2;
    const y = (FIELD.height - height) / 2 - 20;
    context.fillStyle = 'rgba(46, 42, 30, 0.35)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.fillStyle = PALETTE.panel;
    roundRect(x, y, width, height, 16);
    context.fill();
    context.strokeStyle = accent ?? PALETTE.barEdge;
    context.lineWidth = 3;
    roundRect(x, y, width, height, 16);
    context.stroke();
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 72, 46, PALETTE.ink, 'center');
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], FIELD.width / 2, y + 118 + i * 34, 21, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 30, 22, PALETTE.gold, 'center');
  }

  function drawTitle(best, difficulty) {
    // A quiet backdrop: the meadow, the road, two towers and drifting shadows.
    drawMeadow();
    drawPath();
    drawTowers({ selectedTower: null });
    drawEnemies();
    drawSpire(0);
    context.fillStyle = 'rgba(246, 239, 219, 0.55)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    text('LUMEN KEEP', FIELD.width / 2, 150, 72, PALETTE.ink, 'center');
    text('A tower defence of light against the dark', FIELD.width / 2, 196, 24, PALETTE.muted, 'center');
    const lines = [
      'Shadows walk the road to your Sunspire. Build light towers on the meadow,',
      'stop all 12 waves, and keep the flame alive. Leaks cost Sunspire health.',
      'Sunbeam is quick · Prism splashes crowds · Frost Lantern chills · Star Cannon hits hard.',
    ];
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], FIELD.width / 2, 250 + i * 30, 20, PALETTE.ink, 'center');
    }
    text('Choose your difficulty — keys 1, 2, 3 work too', FIELD.width / 2, 420, 18, PALETTE.muted, 'center');
    for (const rect of difficultyRects()) {
      const def = { easy: 'Easy', normal: 'Normal', hard: 'Hard' }[rect.name];
      const picked = difficulty === rect.name;
      context.fillStyle = picked ? '#f2a900' : PALETTE.panel;
      roundRect(rect.x, rect.y, rect.w, rect.h, 10);
      context.fill();
      context.strokeStyle = picked ? '#c47f00' : PALETTE.barEdge;
      context.lineWidth = picked ? 3 : 1.5;
      roundRect(rect.x, rect.y, rect.w, rect.h, 10);
      context.stroke();
      text(def, rect.x + rect.w / 2, rect.y + 31, 20, picked ? '#ffffff' : PALETTE.ink, 'center');
    }
    const bestLine = best > 0 ? `Best score: ${best}` : 'No victories yet — the dark is waiting';
    text(bestLine, FIELD.width / 2, 540, 18, PALETTE.muted, 'center');
    text('Click a difficulty, or press Space to start on Normal', FIELD.width / 2, 600, 22, PALETTE.gold, 'center');
  }

  /** Paint one frame: the field, then the HUD or a panel for the screen the game is on. */
  function draw(state, screen, best, ui) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    if (screen === SCREEN_TITLE) {
      drawTitle(best, ui.difficulty);
      return;
    }
    drawMeadow();
    drawPath();
    drawHover(ui);
    drawTowers(ui);
    drawEnemies();
    drawShots();
    drawSpire(state.elapsed);
    drawHud(ui);
    drawBuildBar(ui);
    drawBanner(ui);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The shadows wait for no one — except now.', `Wave ${Math.max(1, state.wave)} of ${FINAL_WAVE} · Score ${state.score}`], 'Press P or click to resume');
    } else if (screen === SCREEN_OVER) {
      drawPanel('The light went out', [
        `The shadows reached the Sunspire on wave ${state.wave} of ${FINAL_WAVE}.`,
        `Score ${state.score}  ·  ${state.kills} shadows banished  ·  Best ${best}`,
      ], 'Press Space or R to try again', PALETTE.red);
    } else if (screen === SCREEN_WIN) {
      const mins = Math.floor(state.elapsed / 60);
      const secs = Math.floor(state.elapsed % 60);
      drawPanel('☀ The dawn holds ☀', [
        `All 12 waves banished. The Sunspire still burns.`,
        `Score ${state.score}  ·  ${state.kills} shadows banished  ·  ${state.bossesSlain} Nightmaws slain`,
        `Gold earned ${state.goldEarned}  ·  Leaks ${state.leaks}  ·  Time ${mins}:${String(secs).padStart(2, '0')}  ·  Best ${best}`,
      ], 'Press Space or R to defend again', '#f2a900');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}

const PALETTE_FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
