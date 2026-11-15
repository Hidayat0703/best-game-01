// Waves: what marches in, and when. Each wave is a list of spawn groups
// (kind, count, gap between spawns). Bosses close waves 5 and 10 and lead the
// final wave 12; the mix shifts from lone Shades to Wisps and Bulwarks as the
// waves climb.

import { FINAL_WAVE, SPAWN_GAP, SPAWN_GAP_MIN } from './config.js';

/** The spawn groups of a wave: an array of { kind, count, gap }. */
export function waveGroups(wave) {
  const gap = Math.max(SPAWN_GAP_MIN, SPAWN_GAP - 0.035 * (wave - 1));
  const shades = 6 + wave;
  const wisps = wave >= 2 ? 2 + wave : 0;
  const bulwarks = wave >= 3 ? Math.floor((wave - 1) / 2) : 0;
  const groups = [{ kind: 'shade', count: shades, gap }];
  // Boss waves: the Nightmaw walks in the middle of the wave, its escorts
  // trailing behind it, so the road stays busy while it advances.
  if (wave === 5 || wave === 10) groups.push({ kind: 'boss', count: 1, gap: 2 });
  groups.push({ kind: 'wisp', count: wisps, gap: gap * 0.8 });
  if (bulwarks > 0) groups.push({ kind: 'bulwark', count: bulwarks, gap: gap * 1.6 });
  if (wave === FINAL_WAVE) {
    groups.push({ kind: 'wisp', count: 8, gap: gap * 0.7 });
    groups.push({ kind: 'boss', count: 1, gap: 2 });
  }
  return groups;
}

/** How many enemies a wave holds in total (bosses included). */
export function waveTotal(wave) {
  return waveGroups(wave).reduce((sum, group) => sum + group.count, 0);
}

/** A one-line summary for the HUD and the wave banner. */
export function waveSummary(wave) {
  const groups = waveGroups(wave);
  const parts = groups.map((g) => `${g.count} ${g.kind === 'boss' ? 'Nightmaw' : g.kind + 's'}`);
  return `Wave ${wave} of ${FINAL_WAVE}: ${parts.join(', ')}`;
}
