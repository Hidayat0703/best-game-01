// Sound, synthesized live with WebAudio: no audio files, no network. Every
// effect is a short oscillator envelope; the win fanfare is a little arpeggio.
// The context is created on the first user gesture (browsers block it before
// that) and every call before that is a silent no-op.

export function createAudio() {
  let context = null;
  let muted = false;
  let lastShoot = 0;

  function ensure() {
    if (context !== null) return context;
    try {
      const Ctor = window.AudioContext ?? window.webkitAudioContext;
      if (!Ctor) return null;
      context = new Ctor();
    } catch {
      context = null;
    }
    return context;
  }

  /** Call from any user gesture so later sounds are allowed to play. */
  function unlock() {
    const ctx = ensure();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function tone(freq, dur, type, gain, slideTo) {
    const ctx = ensure();
    if (!ctx || muted || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), now + dur);
    amp.gain.setValueAtTime(gain, now);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  /** Shoot blips are throttled so a busy wave stays pleasant, not a buzz. */
  function shoot(kind) {
    const now = performance.now();
    if (now - lastShoot < 70) return;
    lastShoot = now;
    if (kind === 'prism') tone(520, 0.12, 'triangle', 0.05, 260);
    else if (kind === 'star') tone(180, 0.22, 'sawtooth', 0.06, 90);
    else if (kind === 'frost') tone(880, 0.16, 'sine', 0.045, 1200);
    else tone(740, 0.07, 'square', 0.035, 520);
  }

  function play(name) {
    if (name === 'shoot') return; // shoot goes through shoot(kind) instead
    if (name === 'kill') tone(660, 0.1, 'sine', 0.06, 990);
    else if (name === 'coin') tone(1180, 0.09, 'sine', 0.05, 1560);
    else if (name === 'leak') tone(140, 0.3, 'sawtooth', 0.09, 70);
    else if (name === 'place') tone(440, 0.1, 'triangle', 0.07, 660);
    else if (name === 'upgrade') { tone(520, 0.1, 'triangle', 0.07, 780); setTimeout(() => tone(780, 0.12, 'triangle', 0.07, 1040), 90); }
    else if (name === 'sell') tone(520, 0.12, 'triangle', 0.06, 300);
    else if (name === 'error') tone(160, 0.15, 'square', 0.06, 120);
    else if (name === 'wave') { tone(220, 0.25, 'triangle', 0.08, 440); setTimeout(() => tone(330, 0.3, 'triangle', 0.08, 550), 140); }
    else if (name === 'boss') { tone(98, 0.5, 'sawtooth', 0.09, 65); setTimeout(() => tone(130, 0.4, 'sawtooth', 0.08, 82), 220); }
    else if (name === 'bossDown') [784, 659, 880, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'triangle', 0.08), i * 110));
    else if (name === 'win') [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.35, 'triangle', 0.09), i * 150));
    else if (name === 'lose') [392, 330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, 0.4, 'triangle', 0.08), i * 170));
  }

  return {
    unlock,
    shoot,
    play,
    toggleMute() {
      muted = !muted;
      return muted;
    },
    isMuted() {
      return muted;
    },
  };
}
