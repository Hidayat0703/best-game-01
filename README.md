# Lumen Keep

A tower defence of light against the dark — a best-game-01 entry for make.fun.

Shadows walk the road to your Sunspire. Build light towers on the meadow,
stop all 12 waves, and keep the flame alive. A leaked shadow costs Sunspire
health; at zero, the light goes out.

## Towers

- **Sunbeam** (50 gold, key 1) — fast rays, single target.
- **Prism** (110 gold, key 2) — splash burst, hurts crowds.
- **Frost Lantern** (80 gold, key 3) — chills up to 3 shadows, slowing them.
- **Star Cannon** (160 gold, key 4) — one huge star-shell, long range.

Every tower upgrades twice (stronger, further, faster) and sells back for 70%
of what you spent on it. Click a built tower to upgrade or sell it.

## Waves

12 waves, growing harder. A **Nightmaw** boss closes waves 5 and 10 and leads
the final wave. Clearing a wave pays a gold bonus; calling the next wave early,
while the last one still fights, pays bravery gold. Three difficulties: Easy,
Normal, Hard (keys 1–3 on the title screen).

## Controls

- Mouse: pick a tower in the build bar, click a glowing tile to build; click
  a built tower to upgrade or sell; right-click or Esc cancels.
- Keys: 1–4 pick towers, W calls the wave, F toggles 1x/2x speed, P pauses,
  M mutes, R restarts after a win or a loss, Space starts.

## Play it

No build step, no network: serve `game/` with any static server
(`node serve.ts`, then open http://localhost:8080) or open `game/index.html`
through a local server. Sound is synthesized live with WebAudio.

Screenshots are deterministic scenes from the game's own code:
`?shot=title|cover|boss|win&seed=1`.

## License

MIT — see LICENSE.
