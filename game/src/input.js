// Keyboard and pointer input. One-shot presses (start, pause, speed, mute,
// tower hotkeys, wave call) are queued as bit flags and taken once by the loop,
// so a press between two frames is never lost and never counted twice. Pointer
// clicks are reported with field coordinates (the canvas is scaled to fit).

import { FIELD } from './config.js';

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_WAVE = 4;
export const ACTION_SPEED = 8;
export const ACTION_MUTE = 16;
export const ACTION_CANCEL = 32;
export const ACTION_RESTART = 64;

const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const WAVE = new Set(['KeyW']);
const SPEED = new Set(['KeyF']);
const MUTE = new Set(['KeyM']);
const RESTART = new Set(['KeyR']);
const TOWER_KEYS = new Map([
  ['Digit1', 'sunbeam'],
  ['Digit2', 'prism'],
  ['Digit3', 'frost'],
  ['Digit4', 'star'],
]);
const DIFFICULTY_KEYS = new Map([
  ['Digit1', 'easy'],
  ['Digit2', 'normal'],
  ['Digit3', 'hard'],
]);

export function createInput(canvas) {
  let actions = 0;
  let towerKeys = [];
  let difficultyKeys = [];
  let clicks = [];
  let hover = { x: -1, y: -1 };
  let rightClick = false;

  function toField(event) {
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / FIELD.width, rect.height / FIELD.height);
    const ox = (rect.width - FIELD.width * scale) / 2;
    const oy = (rect.height - FIELD.height * scale) / 2;
    return {
      x: (event.clientX - rect.left - ox) / scale,
      y: (event.clientY - rect.top - oy) / scale,
    };
  }

  window.addEventListener('keydown', (event) => {
    if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (WAVE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_WAVE;
    } else if (SPEED.has(event.code)) {
      if (!event.repeat) actions |= ACTION_SPEED;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (RESTART.has(event.code)) {
      if (!event.repeat) actions |= ACTION_RESTART;
    } else if (TOWER_KEYS.has(event.code)) {
      if (!event.repeat) towerKeys.push(TOWER_KEYS.get(event.code));
    } else if (DIFFICULTY_KEYS.has(event.code)) {
      if (!event.repeat) difficultyKeys.push(DIFFICULTY_KEYS.get(event.code));
    } else {
      return;
    }
    event.preventDefault();
  });
  window.addEventListener('blur', () => {
    actions = 0;
    towerKeys = [];
    difficultyKeys = [];
  });

  canvas.addEventListener('pointermove', (event) => {
    hover = toField(event);
  });
  canvas.addEventListener('pointerdown', (event) => {
    const at = toField(event);
    if (event.button === 2) {
      rightClick = true;
      return;
    }
    // A queue, not a single slot: at a slow frame rate two quick clicks must
    // both land, or a fast build-select-upgrade loses the middle one.
    clicks.push(at);
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** The tower hotkeys pressed since the last call, in order. */
    takeTowerKeys() {
      const taken = towerKeys;
      towerKeys = [];
      return taken;
    },
    /** The difficulty hotkeys pressed since the last call, in order. */
    takeDifficultyKeys() {
      const taken = difficultyKeys;
      difficultyKeys = [];
      return taken;
    },
    /** The clicks since the last call, in field coordinates, in order. */
    takeClicks() {
      const taken = clicks;
      clicks = [];
      return taken;
    },
    /** True when the right mouse button was pressed since the last call. */
    takeRightClick() {
      const taken = rightClick;
      rightClick = false;
      return taken;
    },
    /** The pointer's current field coordinates. */
    hover() {
      return hover;
    },
  };
}
