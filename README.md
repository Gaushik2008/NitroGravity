# NITRO GRAVITY

3D space mission design game for the NASA Space Apps Challenge (Team Nitro Gravity, Chennai).
Assemble a rocket from parts and structure materials, launch it, and read a debrief that names the exact cause of success or failure.

**Rules:** thrust-to-weight >= 1.2, budget <= $1.0M, mass <= 5,000 kg, net power > 0 kW. Liftoff load above 3 g breaks plain aluminium (stronger materials hold more).

## Run
Open `index.html` in a browser (Three.js r128 and the Inter font load from CDNs). No build step needed.

## Develop
- `src/sim.js` physics, parts, materials, advisor (pure, no DOM)
- `src/app.js` Three.js scene, UI, debrief
- `src/head.html` markup and styles
- `python3 build.py` rebuilds `index.html`
- `node tests/sim-golden.js` prints the three golden builds (A crashes, B reaches orbit, C fails power and budget)

## Roadmap
Agency flag creator, grid VAB, docking, landing, re-entry. Full spec in `docs/BUILD_PROMPT.md`.

Ascent physics is simplified for learning. Not affiliated with NASA.
