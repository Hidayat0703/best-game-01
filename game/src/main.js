// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one; two per frame at 2x
// speed), and the renderer paints what is there. The game moves between five
// screens: title, play, paused, game over and victory.
//
// ?seed=N fixes the spawn pattern. ?shot=title|cover|boss|win (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, DIFFICULTY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_BOSS, EVENT_KILL, EVENT_LEAK, EVENT_LOSS, EVENT_WIN, PHASE_LOST, PHASE_WON } from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, ACTION_SPEED, ACTION_WAVE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN, hitControl } from './render.js';
import { cellAt } from './path.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const audio = createAudio();

let difficulty = 'normal';
let world = createWorld(createRandom(seed), difficulty);
const renderer = createRenderer(canvas, world);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

// A read-only handle for the scripted play-test: it reads the live state and
// drives nothing the player cannot do themselves.
window.__lumenKeep = {
  get state() {
    return world.state;
  },
  get screen() {
    return currentScreen;
  },
  get selectedTower() {
    return playUi ? playUi.selectedTower : null;
  },
  world,
};

let currentScreen = SCREEN_TITLE;
let playUi = null;

function runShot(name) {
  const scene = stageShot(name, world, difficulty);
  currentScreen = scene.screen;
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, scene.ui);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  // The play UI: which tower kind is picked for building, which built tower is
  // selected, the cell under the pointer, and the wave banner.
  const ui = {
    selectedKind: null,
    selectedTower: null,
    hoverCell: null,
    muted: false,
    difficulty,
    banner: null,
  };
  playUi = ui;
  currentScreen = screen;

  // Screen readers (and anyone watching the page's text) hear the screen changes and each leak.
  function announce(message) {
    status.textContent = message;
  }

  function rebuildWorld() {
    world = createWorld(createRandom(seed), difficulty);
    window.__lumenKeep.world = world;
    ui.selectedKind = null;
    ui.selectedTower = null;
    ui.hoverCell = null;
    ui.banner = null;
  }

  function startGame() {
    rebuildWorld();
    accumulator = 0;
    screen = SCREEN_PLAY;
    currentScreen = screen;
    ui.difficulty = difficulty;
    announce(`Playing Lumen Keep on ${DIFFICULTY[difficulty].label}. ${world.state.lives} Sunspire health.`);
  }

  function endGame(won) {
    screen = won ? SCREEN_WIN : SCREEN_OVER;
    currentScreen = screen;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(won ? `Victory. Score ${world.state.score}. Best ${best}.` : `Game over. Score ${world.state.score}. Best ${best}.`);
  }

  function callWave() {
    if (world.startWave()) {
      const n = world.state.wave;
      ui.banner = { text: n === 12 ? 'Final wave — Nightmaw returns!' : `Wave ${n}`, at: performance.now() };
      audio.play('wave');
      announce(`Wave ${n} incoming.`);
    }
  }

  function playSounds(events) {
    for (const sound of events.sounds) {
      if (typeof sound === 'object' && sound.shoot) audio.shoot(sound.shoot);
      else if (sound === 'bossDown') audio.play('bossDown');
      else audio.play(sound);
    }
  }

  function handleEvents(events) {
    if (events.flags & EVENT_WIN) endGame(true);
    else if (events.flags & EVENT_LOSS) endGame(false);
    else if (events.flags & EVENT_BOSS) {
      ui.banner = { text: 'Nightmaw approaches!', at: performance.now() };
      audio.play('boss');
    }
    if (events.flags & EVENT_KILL) audio.play('kill');
    if (events.flags & EVENT_LEAK) announce(`A shadow reached the Sunspire. ${world.state.lives} health left.`);
    playSounds(events);
  }

  function stepWorld() {
    const repeats = world.state.speed === 2 ? 2 : 1;
    for (let i = 0; i < repeats; i += 1) {
      const events = world.step(STEP);
      handleEvents(events);
      if (world.state.phase === PHASE_WON || world.state.phase === PHASE_LOST) break;
    }
  }

  function handleClick(at) {
    audio.unlock();
    const control = hitControl(at.x, at.y, screen, ui);
    if (control) {
      if (control.type === 'difficulty') {
        difficulty = control.name;
        ui.difficulty = difficulty;
        return;
      }
      if (control.type === 'wave') {
        callWave();
        return;
      }
      if (control.type === 'speed') {
        world.state.speed = world.state.speed === 2 ? 1 : 2;
        return;
      }
      if (control.type === 'pause') {
        screen = SCREEN_PAUSED;
        currentScreen = screen;
        announce('Paused.');
        return;
      }
      if (control.type === 'mute') {
        ui.muted = audio.toggleMute();
        return;
      }
      if (control.type === 'card') {
        ui.selectedKind = ui.selectedKind === control.kind ? null : control.kind;
        ui.selectedTower = null;
        return;
      }
      if (control.type === 'upgrade') {
        if (ui.selectedTower && world.upgradeTower(ui.selectedTower)) audio.play('upgrade');
        else audio.play('error');
        return;
      }
      if (control.type === 'sell') {
        if (ui.selectedTower) {
          world.sellTower(ui.selectedTower);
          ui.selectedTower = null;
          audio.play('sell');
        }
        return;
      }
      if (control.type === 'bar') {
        ui.selectedKind = null;
        ui.selectedTower = null;
        return;
      }
    }
    if (screen === SCREEN_TITLE) {
      startGame();
      return;
    }
    if (screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      currentScreen = screen;
      announce('Playing.');
      return;
    }
    if (screen === SCREEN_OVER || screen === SCREEN_WIN) {
      startGame();
      return;
    }
    // Play screen, field click: build, or select a built tower.
    const cell = cellAt(at.x, at.y);
    if (!cell) return;
    if (ui.selectedKind) {
      const tower = world.placeTower(ui.selectedKind, cell.col, cell.row);
      if (tower) {
        audio.play('place');
        ui.selectedTower = tower;
        ui.selectedKind = null;
      } else {
        audio.play('error');
      }
      return;
    }
    const tower = world.towers.at(cell.col, cell.row);
    ui.selectedTower = tower;
  }

  function handleActions() {
    // Clicks first, in arrival order: a click that landed before a keypress
    // must be handled before it (a title click, then Space, starts once).
    for (const click of input.takeClicks()) handleClick(click);
    if (input.takeRightClick()) {
      ui.selectedKind = null;
      ui.selectedTower = null;
    }
    const actions = input.takeActions();
    for (const towerKey of input.takeTowerKeys()) {
      if (screen === SCREEN_PLAY) {
        ui.selectedKind = ui.selectedKind === towerKey ? null : towerKey;
        ui.selectedTower = null;
      }
    }
    for (const diffKey of input.takeDifficultyKeys()) {
      if (screen === SCREEN_TITLE) {
        difficulty = diffKey;
        ui.difficulty = difficulty;
      }
    }
    if (actions & ACTION_MUTE) ui.muted = audio.toggleMute();
    if (actions & ACTION_SPEED && screen === SCREEN_PLAY) {
      world.state.speed = world.state.speed === 2 ? 1 : 2;
    }
    if (actions & ACTION_WAVE && screen === SCREEN_PLAY) callWave();
    if (actions & ACTION_CONFIRM && screen === SCREEN_TITLE) startGame();
    else if (actions & ACTION_CONFIRM && (screen === SCREEN_OVER || screen === SCREEN_WIN)) startGame();
    else if (actions & ACTION_RESTART && (screen === SCREEN_OVER || screen === SCREEN_WIN)) startGame();
    else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      currentScreen = screen;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      currentScreen = screen;
      announce('Playing.');
    }
    const hover = input.hover();
    ui.hoverCell = hover.x >= 0 && hover.y >= 0 && hover.y < 624 ? cellAt(hover.x, hover.y) : null;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        stepWorld();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, ui);
  }

  // Leaving the tab pauses a running game rather than letting shadows walk unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      currentScreen = screen;
      announce('Paused.');
    }
  });

  announce('Lumen Keep. Choose a difficulty, then press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
