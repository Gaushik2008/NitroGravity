# MASTER BUILD PROMPT — NITRO GRAVITY: 2D Space Mission Simulator

> Paste everything below the line into your coding agent (Claude Code, Cursor, etc.) as the first message. It is self-contained.
> **v2:** merged with the *Aerocosmo* reference (agency creator, VAB grid, flight HUD, docking, landing, re-entry) and the new goals: lower build cost and time, higher efficiency, many more material combinations (Sections 1A, 5A, 7A and phases 8–11). Ship phases 1–7 first (the NASA Space Apps demo), then v2.

---

## 0. ROLE & OPERATING MODE

You are a senior game/web engineer and product designer. Build **NITRO GRAVITY**, a production-quality, from-scratch 2D space-mission design game for the NASA Space Apps Challenge ("Space Mission Design Game", Chennai, India). Work autonomously in phases (Section 14). After each phase: run tests, run the app, fix defects, commit. Do not stop at a skeleton: deliver a polished, playable, deployable app. Ask me a question only if a decision is irreversible and ambiguous; otherwise choose the sensible default, record it in `docs/DECISIONS.md`, and continue.

## 1. PRODUCT VISION

An interactive **split-screen aerospace-engineering game** for students and beginners. The learner assembles a rocket from modules on the left, watches it assemble live on a 2D launchpad on the right, presses LAUNCH, and sees physics-driven outcomes (orbit or crash) followed by **telemetry that names the exact engineering cause of success or failure**.

**Core promise:** "Visual trial-and-error that makes mass, thrust, power and budget trade-offs obvious."

**Problem being solved:** space mission design is full of coupled trade-offs (budget, mass, thrust, power); orbital tools overwhelm beginners; textbooks are static; one miscalculation ruins a launch. The sandbox must give instant, visual cause-and-effect feedback.

**Target users:** high-school/undergrad students, aerospace clubs, teachers (classroom use), NASA Space Apps judges (3-minute demo).

## 1A. REFERENCE GAME & EXPANDED GOALS (v2 addition)

### 1A.1 Reference: *Aerocosmo: Aerospace Simulator* (Android, Google Play) — summary
A 2:03 showcase video presents a connected, mobile-first spaceflight career loop:
**Agency customization → Vehicle assembly → Launch → Orbital operations → Docking → Planetary landing → Atmospheric re-entry.**

| Stage | What the video shows |
|---|---|
| Agency flag creator (0:10) | Field, Pattern, Emblem (None/Rocket/Star/Planet/Moon); emblem colour, position (L/C/R), size (S/M/L); live preview. Gives player ownership: "you run an agency". |
| Vehicle Builder / VAB (0:28) | Grid-based modular assembly; engine inventory by category (liquid, solid motor, aircraft engine); part inspector (e.g. Radial Decoupler: 55 kg, 1.5×1.95 m, adjustable separation speed 1.40 m/s); attach events ("Motor attached to Radial Decoupler"); top nav **ROCKET · CRAFT · LAUNCH**. |
| Launch & flight (0:52) | HUD: mission clock T+, time warp, altitude ASL, surface velocity, throttle %, stage, fuel %; Decouple/Activate staging buttons; RCS translation pad (left), navball + heading (right). |
| Orbit & docking (1:16) | Orbital altitude/velocity (ORB reference), station with solar arrays, docking camera with target ID, separate ROTATION and TRANSLATION joysticks, roll slider, "Vessels docked" event. |
| Landing (1:36) | Four-legged lander with science box on rust-red terrain; event log ("2x Parachute released after landing"). |
| Re-entry (1:52) | Cinematic plasma glow, motion blur, curved planet limb. |

**Key lessons to copy:** (1) building and flying are one connected loop; (2) parts expose real specs and tunable parameters; (3) each mission phase gets its own purpose-built interface; (4) a timestamped event log gives feedback; (5) cinematic moments reward the player; (6) touch-friendly controls.
**Not established by the video (do not assume):** real orbital-mechanics accuracy, economy/tech tree, multiplayer, procedural missions, building stations from scratch. Decide these ourselves in `docs/DECISIONS.md`.

### 1A.2 Our new product goals (the game must make these measurable and fun)
The player is **rewarded for building smarter**. Every design is scored on:
1. **Lower build cost** ($ total and $/kg delivered).
2. **Shorter build time and mission duration** (assembly days + flight time to objective).
3. **Higher efficiency** (payload mass fraction, fuel use/Δv margin, power use, reuse).
4. **More material and component combinations** (a large, meaningful design space with trade-offs, no single dominant choice).

### 1A.3 What we adopt, adapt, skip
| Aerocosmo feature | Decision |
|---|---|
| Agency flag creator | **Adopt** (Phase 8), saved locally, shown on rocket, debrief and certificates |
| Grid VAB with attach rules | **Adopt** as "Advanced Builder"; keep slot-snap "Simple Builder" for beginners (toggle) |
| Part inspector + tunable parameter | **Adopt** (decoupler separation speed, throttle limit, fuel load, material) |
| ROCKET · CRAFT · LAUNCH nav | **Adopt** as the top-level tabs |
| Full flight HUD, staging, throttle | **Adopt** in simplified 2D form |
| Docking, landing, re-entry | **Adapt** as optional mission modes (Phases 9–10), each with its own scoring |
| Real orbital simulation | **Skip** full n-body; use simplified, documented 2D approximations and say so in the UI |

## 2. NON-NEGOTIABLE GAME RULES (from the pitch deck)

| Constraint | Value | Rule |
|---|---|---|
| Minimum thrust-to-weight ratio (TWR) | **≥ 1.2** | If TWR < 1.2 at ignition: rocket shakes violently, fails to lift, crashes back onto the pad |
| Mission budget ceiling | **$1,000,000** | Total cost ≤ $1.0M (equal to ceiling passes) |
| Launchpad mass limit | **5,000 kg** | Total wet mass ≤ 5,000 kg |
| Net power surplus | **> 0 kW** | Generation − consumption must be strictly > 0 (0.0 fails) |

All four are **pre-flight gates**. Evaluate them live while building (HUD gauges turn green/amber/red) and again on launch. Launch is allowed even if gates fail (learning by failure) but the outcome sequence and telemetry must reflect every violated gate, not just the first.

## 3. TECH STACK (decisions already made — do not relitigate)

The original prototype was in Godot 4. This build is a **browser-first web app** (matches roadmap Phase 04: free browser deployment for schools):

- **Language:** TypeScript (strict mode)
- **Build:** Vite
- **UI shell:** React 18 + Zustand (state) + Tailwind CSS + CSS variables for design tokens
- **2D renderer:** PixiJS v8 (WebGL, falls back to Canvas) in a dedicated `<canvas>`; procedural graphics only (no raster art dependency)
- **Audio:** Howler.js or WebAudio (procedural engine rumble/UI blips; mute toggle)
- **Animation:** GSAP (UI) + a fixed-timestep simulation loop (see Section 6)
- **Testing:** Vitest (unit/physics), Playwright (E2E + screenshots), axe-core (a11y)
- **Lint/format:** ESLint, Prettier, TypeScript `--noEmit` in CI
- **PWA:** vite-plugin-pwa (offline classroom use) ; optional Capacitor wrapper for Android APK (Phase 7, optional)
- **Deploy:** static build to GitHub Pages / Netlify / Vercel; GitHub Actions CI
- **No backend required.** Persistence via `localStorage` (try/catch every access; app must work with storage blocked).

*Alternative if I say "Godot":* Godot 4.x with GDScript, same specs; map sections 5–9 to scenes/autoloads and export to HTML5.

## 4. SKILLS, PLUGINS & ENVIRONMENT (set up before coding)

### 4.1 Design/engineering skills to load and apply (invoke each at the stated moment)
| When | Skill | Use it to |
|---|---|---|
| Before any UI | `frontend-design` | Choose a distinctive aesthetic direction; avoid templated look |
| Before tokens | `design-skills:design-systems` and `website-design:web-design-system` | Produce `DESIGN.md` + tokens (color roles, type, spacing, radius, shadow, motion; light+dark) |
| Visual polish | `design-skills:design-elevation`, `zizi-skills:design-guide` | Hierarchy, spacing, color judgment |
| Interactions | `design-skills:interaction-design`, `agentic-council:artisan-motion-design` | State machines, microinteractions, launch choreography |
| Copy | `design-skills:ux-writing` | Button labels, errors, telemetry sentences, empty states |
| Layout/IA | `zizi-skills:information-architecture`, `design-skills:design-critique` | Panel layout, navigation, heuristic review |
| Flow | `design-skills:journey-mapping`, `design-skills:ux-research` | Learner journey, playtest script |
| Data viz | `dataviz` | Gauges, thrust/altitude/power charts in the telemetry screen |
| Accessibility | `design-skills:accessibility-audit`, `design:accessibility-review` | WCAG 2.2 AA audit before release |
| Frontend structure | `zizi-skills:frontend`, `modern-web-guidance:modern-web-guidance` | Component/state structure, web performance |
| Quality | `zizi-skills:tdd-skill`, `zizi-skills:code-quality`, `engineering:code-review`, `agentic-council:craftsman-e2e-testing` | Test-first physics, review, E2E |
| Perf/security | `agentic-council:tuner-performance-audit`, `zizi-skills:security-and-hardening` | 60 fps budget, dependency hygiene |
| Docs | `agentic-council:chronicler-documentation-plan`, `engineering:documentation` | README, DESIGN.md, ADRs |
| Release | `zizi-skills:git-sync`, `zizi-skills:handoff` | Branching, PRs, final handoff |
| Optional | `animatedwebs:animatedwebs-hero`, `21st:21st-ui` | Landing-screen hero / polished components |

If a listed skill is unavailable, say so in `docs/DECISIONS.md` and apply the equivalent principle manually.

### 4.2 Packages
```bash
npm create vite@latest nitro-gravity -- --template react-ts
cd nitro-gravity
npm i pixi.js zustand gsap howler clsx
npm i -D tailwindcss postcss autoprefixer vitest @vitest/coverage-v8 jsdom \
  @testing-library/react @playwright/test @axe-core/playwright eslint prettier \
  vite-plugin-pwa typescript @types/howler
npx playwright install chromium
# optional Android: npm i @capacitor/core @capacitor/cli @capacitor/android
```
Fonts (self-host or Google Fonts): one display face with aerospace character (e.g. *Orbitron*, *Space Grotesk*, or *Chakra Petch*) + one highly legible UI face (e.g. *Inter* / *IBM Plex Sans*) + a mono face for telemetry (*JetBrains Mono* / *IBM Plex Mono*). Pick, justify in DESIGN.md.

## 5. DOMAIN MODEL

### 5.1 Part catalog (data-driven JSON: `src/data/parts.json`; tunable starting values)
Each part: `id, name, category, massKg, costUSD, thrustN, powerKW (+gen / −draw), slot, description, learnMore`.

| id | Category | Mass (kg) | Cost | Thrust | Power | Slot |
|---|---|---|---|---|---|---|
| `capsule` (avionics bus, **mandatory**) | Core | 400 | $120k | – | −0.5 kW | top |
| `core-stage` (**mandatory**) | Propulsion | 1,800 | $250k | 30 kN | – | center |
| `booster-side` (SRB) | Propulsion | 500 | $90k | 15 kN | – | side L/R (max 2) |
| `booster-heavy` | Propulsion | 800 | $150k | 28 kN | – | side L/R (max 2, replaces SRB) |
| `solar-wing` (pair) | Power | 120 | $60k | – | +3.0 kW | wing (max 2) |
| `rtg` | Power | 200 | $140k | – | +1.0 kW | body |
| `camera` | Payload | 80 | $70k | – | −1.0 kW | payload bay |
| `spectrometer` | Payload | 150 | $110k | – | −1.5 kW | payload bay |
| `radar` | Payload | 300 | $180k | – | −2.5 kW | payload bay |

Add one more "learning" part in a later phase (shielding plate for micrometeoroids/solar flares — Phase 3 roadmap).

### 5.2 Derived values (pure functions, 100% unit-tested)
```
totalMass   = Σ massKg
totalCost   = Σ costUSD
totalThrust = Σ thrustN
weight      = totalMass * g              (g = 9.81 m/s² Earth; per-planet later)
TWR         = totalThrust / weight
netPower    = Σ powerKW
Δ-readiness = a simplified "orbit score" from TWR margin (see 6.3)
```

### 5.3 Validation result type
```ts
type GateId = 'TWR' | 'BUDGET' | 'MASS' | 'POWER' | 'MANDATORY_PARTS' | 'SLOTS';
interface GateResult { id: GateId; pass: boolean; value: number; limit: number; unit: string; message: string }
interface BuildReport { gates: GateResult[]; allPass: boolean; derived: Derived }
```

### 5.4 Golden test builds (must pass in unit tests; they also seed the in-app "Example builds")
| Build | Mass | Cost | TWR | Net power | Expected outcome |
|---|---|---|---|---|---|
| A. capsule+core+radar+spectrometer+solar | 2,770 kg | $720k | **1.10** | −1.5 kW | CRASH (TWR **and** POWER fail) |
| B. capsule+core+camera+solar+1 side booster | 2,900 kg | $590k | **1.58** | +1.5 kW | SUCCESS, orbit |
| C. capsule+core+2 heavy boosters+radar+spectrometer+solar+RTG | 4,570 kg | $1,160k | 1.92 | −0.5 kW | FAIL pre-flight (BUDGET and POWER), physically lifts |

## 5A. MATERIALS, COMBINATIONS & EFFICIENCY ENGINE (v2 addition — core to the new goals)

### 5A.1 Material layer
Every part has `allowedMaterials[]`; a chosen material applies **multipliers** to the base part. Default material `al-standard` has all multipliers = 1.0, so the golden builds in 5.4 stay valid.

| Material | Mass × | Cost × | Build time × | Strength | Heat tol. | Notes |
|---|---|---|---|---|---|---|
| `al-standard` (aluminium) | 1.00 | 1.00 | 1.00 | 1.0 | 1.0 | baseline |
| `al-lithium` | 0.88 | 1.25 | 1.10 | 1.1 | 1.0 | lighter, pricier |
| `steel-stainless` | 1.35 | 0.70 | 0.85 | 1.3 | 1.8 | cheap, heavy, great heat tolerance |
| `titanium` | 1.05 | 2.10 | 1.50 | 1.6 | 1.7 | strong, slow to build, expensive |
| `cfrp-composite` | 0.70 | 1.80 | 1.70 | 1.4 | 0.8 | lightest, slowest, weak to heat |
| `printed-alloy` (3D printed) | 0.95 | 1.10 | 0.55 | 1.1 | 1.1 | **fast build**, small parts only |
| `reclaimed` (reused parts) | 1.00 | 0.45 | 0.60 | 0.9 | 0.9 | cheap and quick, risk of failure |

Add **coatings/TPS** (none, ablative, ceramic tiles, reflective foil) and **propellant types** (solid, kerolox, hydrolox, methalox: different thrust, Isp, density, cost). Values are tunable starting points in `src/data/materials.json`; no option may dominate on every axis (add a unit test that checks no material is Pareto-dominated by another across mass/cost/time/strength/heat).

### 5A.2 Combination space
Design = `structure material × tank material × engine type × propellant × coating × staging layout × payload set`. Show a live counter ("1,240,000 possible designs, you've tried 7") and a **Combination Codex** that unlocks entries as the player tries new pairings. Add **synergy and conflict rules**, for example: hydrolox + low-density tank needs bigger tank; steel + hydrolox is cheap but heavy; composites + ablative coating needs a cooling note; reclaimed parts + crew-rated payload is blocked.

### 5A.3 Build-time and cost model (pure, tested)
```
assemblyHours   = Σ(part.baseHours × material.buildTimeMult) × integrationFactor
integrationFactor = 1 + 0.04 × (distinctPartTypes − 1) − modularityDiscount − reuseDiscount
buildDays       = assemblyHours / (crewSize × 8)         # crew is a purchasable upgrade
totalCost       = Σ(part.cost × material.costMult) + crewDays×rate + facilityOverhead(buildDays)
learning curve  : repeating the same part type cuts its baseHours by 8 % per repeat, floor 60 %
```
Time costs money (overhead per day), so slow materials hurt twice. The player can spend budget on **crew, tooling, and automation upgrades** to cut build time, with diminishing returns.

### 5A.4 Efficiency metrics (shown in the VAB sidebar and in the debrief)
| Metric | Formula | Good |
|---|---|---|
| Payload mass fraction | payloadMass / totalMass | higher |
| Cost per kg to orbit | totalCost / payloadMass | lower |
| Build time | buildDays | lower |
| Mission duration | T+ to objective complete | lower |
| Δv margin | availableΔv − requiredΔv | ≥ 0, not wasteful |
| Power utilisation | draw / generation | 60–90 % |
| Reuse savings | $ saved from reclaimed/reused parts | higher |
| **Efficiency Index** (0–100) | weighted blend of the above, weights in `score.ts` | higher |

Include a **Pareto chart** (cost vs time, bubble = payload) with the player's previous designs and a "best known" frontier, plus an **Optimizer advisor** that suggests specific swaps ("Swap steel tank → al-lithium: −210 kg, +$18k, TWR 1.31 → 1.44"). Advice must be computed by re-running validation, never hard-coded.

## 6. SIMULATION & PHYSICS

### 6.1 Loop
Fixed timestep (1/120 s) accumulator, render interpolated at display rate. Simulation is **deterministic** (seeded RNG for shake/stars) so tests and replays match.

### 6.2 Flight state machine
`BUILD → PREFLIGHT_CHECK → IGNITION → (LIFTOFF → ASCENT → STAGE_SEP → ORBIT_INSERTION → ORBIT) | (SHAKE → ABORT → CRASH) → TELEMETRY → BUILD`

- **IGNITION:** exhaust flames ignite; if TWR < 1.2 → `SHAKE` (camera/rocket jitter, amplitude ∝ shortfall, ~2.5 s), engines sputter, rocket slumps and crashes on the pad (explosion particles, smoke, dust).
- **LIFTOFF/ASCENT:** 1D vertical dynamics: `a = (T − m·g)/m − drag`, mass decreases as boosters burn; boosters have burn time (SRB 20 s, heavy 25 s sim-time; time-compressed ×4 for pacing) and **jettison visibly** (side boosters detach and tumble).
- **Power system check during ascent/orbit:** if netPower ≤ 0, payload goes dark at orbit insertion; mission fails as "Mission lost: power starvation" with a visible dimmed payload and flickering HUD.
- **ORBIT:** camera pulls out, planet curvature appears, rocket becomes satellite with deployed solar wings, payload icons pulse, mission-success card.

### 6.3 Outcome classification
`SUCCESS` (all gates pass) · `PAD_CRASH` (TWR < 1.2) · `POWER_FAILURE` · `OVER_BUDGET` / `OVER_MASS` (flagged pre-flight, still simulated to teach consequences) · `PARTIAL` (multiple). Provide a **Mission Score** (0–1000): margin bonuses for TWR 1.2–2.0 sweet spot, budget efficiency, payload science value, mass efficiency; penalties for wasted margin (e.g., TWR > 3 = over-engineered).

### 6.4 Telemetry Loop (the educational heart)
After every launch show a **Mission Debrief** with:
1. Outcome banner with plain-language headline ("Liftoff failed: not enough thrust").
2. **Root-cause list**, one card per violated gate: measured value vs limit, a one-sentence explanation, and a **specific fix suggestion** ("Add one side booster (+15 kN) → TWR 1.56 ✔").
3. Time-series mini-charts (altitude, velocity, TWR, power) with the failure moment annotated.
4. "What changed since last attempt" diff vs previous build.
5. Buttons: **Rebuild (keeps your design)**, **Reset**, **Try an example**.

## 7. SCREENS, LAYOUT & INFORMATION ARCHITECTURE

**Split-screen (≥ 1024 px):** left 40 % **Engineering Bay** (catalog + stats), right 60 % **Launchpad Viewport** (live canvas). On tablets: stacked with sticky viewport. On phones (≥ 360 px): viewport on top (40 vh), bottom-sheet catalog with drag handle.

1. **Title/Briefing screen:** mission statement, "Start Mission", "How it works" (3-step), "Examples", team credit "TEAM NITRO GRAVITY • CHENNAI, INDIA", NASA Space Apps badge (text only; no NASA logo/trademark misuse — include disclaimer "Not affiliated with NASA").
2. **Build screen (main):**
   - Catalog tabs: Propulsion · Power · Payload (searchable, each card shows mass/cost/thrust/power chips and a "?" learn-more popover).
   - **Live Stats HUD:** four gauges (TWR, Budget, Mass, Power), each with threshold marker, color state, and numeric + textual status (never color alone).
   - Launchpad: drag-and-drop **or** click/tap-to-equip; modules **snap** to slots with ease + sound; ghost preview shows where it will attach; invalid slots highlighted with reason.
   - Controls: **LAUNCH** (primary), **Reset** (one click, with undo toast), **Undo/Redo**, Examples menu, Sound toggle, Settings.
3. **Launch sequence:** HUD collapses to a compact flight panel (altitude, speed, TWR, power, mission clock T+), countdown 3-2-1, cinematic camera.
4. **Mission Debrief** (Section 6.4).
5. **Tutorial/Guided mode:** 3 scripted missions (Level 1 "First Flight": get TWR ≥ 1.2; Level 2 "Power Up": add science payload and stay power-positive; Level 3 "Penny Pincher": all payloads under $1.0M). Unlock stars (1–3) based on score.
6. **Settings/Accessibility:** reduce motion, high contrast, colorblind-safe palette, text size, sound/music, units (SI/imperial toggle), language-ready strings.
7. **Roadmap teaser screen** (locked "Moon / Mars / Jupiter" planets with their g values: 1.62 / 3.71 / 24.79 m/s²) — Phase 01 hook built in as a `Planet` config so gravity is already a parameter.

## 7A. EXTENDED SCREENS & MISSION MODES (v2 addition, inspired by Aerocosmo)

**Top-level tabs:** `ROCKET` (design stages and parts) · `CRAFT` (payload, lander, capsule, station module) · `LAUNCH` (pre-flight checks, flight, debrief). A persistent top bar shows agency flag, funds, and Efficiency Index.

1. **Agency Creator:** Field (colour), Pattern (stripe, chevron, split, none), Emblem (None, Rocket, Star, Planet, Moon), emblem colour, position (Left/Center/Right), size (S/M/L), live preview, agency name. Renders as an SVG flag; appears on the rocket body and debrief. Colour pairs must pass contrast checks and have text labels.
2. **Advanced Builder (VAB grid):** snap-to-grid canvas with pan/zoom, part inspector on the right (mass, dimensions, cost, build hours, material picker, adjustable params such as decoupler separation speed with slider), inventory on the left grouped by category (liquid engines, solid motors, tanks, decouplers, power, payload, landing gear, parachutes, heat shields), attach/detach toast events, symmetry mode (mirror radial parts), undo/redo, save/load designs, and share-as-JSON/QR.
3. **Simple Builder:** the original slot-snap builder from Section 7 for beginners; toggle between modes while keeping the same design data.
4. **Flight HUD (LAUNCH):** mission clock T+, time warp (1×, 2×, 4×), altitude, velocity (surface / orbit toggle), throttle slider (0–100 %), current stage, fuel %, Decouple and Activate staging buttons, event log (timestamped), pause. Mobile: left-thumb RCS/translation pad, right-thumb navball/heading; desktop: keyboard (`Shift/Ctrl` throttle, `Space` stage, `Z/X` time warp).
5. **Orbit & Docking mode (Phase 9):** simplified 2D relative-motion docking puzzle: target station with solar arrays, docking camera inset with target ID, separate **ROTATION** and **TRANSLATION** controls, closing-speed and alignment gauges, success event "Vessels docked", fuel penalty for sloppy approach.
6. **Landing mode (Phase 10):** lander with legs, parachutes and thrusters; terrain by planet config (Moon grey, Mars rust-red, etc.); touchdown speed/tilt limits, parachute-release event logged, science-box payload scoring.
7. **Re-entry mode (Phase 10):** heat-shield and coating choice actually matter (material heat tolerance vs entry velocity); orange plasma glow scales with heat flux; survive or burn up, with debrief naming the cause.
8. **Event log:** one shared component used everywhere (build attach events, staging, docking, landing, failures); exportable as text.
9. **Cinematic moments:** liftoff, stage separation, orbit insertion, docking, landing, re-entry; skippable, reduce-motion safe.

## 8. VISUAL DESIGN DIRECTION

Invoke `frontend-design` + `design-systems` first, then commit to ONE direction and document it in `DESIGN.md`. Suggested direction: **"Mission-control meets blueprint"** — deep space navy/near-black background, a luminous accent for thrust (orange→amber flame gradient), cool cyan for data, signal green/amber/red for gates, crisp 1 px grid lines and tick marks on panels, monospaced telemetry numerals with tabular figures. Avoid generic purple-gradient "AI" look and generic dashboard cards.

**Procedural art (PixiJS Graphics/shaders, no external images):**
- Parallax starfield (3 layers, twinkle), subtle nebula noise shader, distant planet limb at orbit.
- Rocket modules as clean vector shapes with consistent stroke weight; each part has a distinct silhouette, panel lines, and small status lights.
- Exhaust: particle emitter with flame core + smoke; intensity ∝ thrust; booster flames separate.
- Launchpad: tower, gantry, ground, steam vents; crash → shockwave, debris, scorch decal.
- Day/ambient lighting shift from pad to orbit.

**Tokens** (define in `src/styles/tokens.css`, light + dark, `prefers-color-scheme` + manual toggle): color roles (bg, surface, border, text, muted, accent-thrust, data-cyan, ok, warn, danger), type scale (1.2 modular), 4-pt spacing grid, radii (2/4/8), elevation (3 levels), motion durations (120/240/480 ms) and easings. Contrast ≥ 4.5:1 text, ≥ 3:1 UI.

## 9. INTERACTION & MOTION SPEC

- Drag has inertia, snap radius 48 px, magnetic ease-out 240 ms, "clunk" sound + 1-frame scale pulse; invalid drop springs back with a short shake and an inline reason.
- Gauges animate with spring easing; threshold crossings trigger a brief pulse (disabled under reduce-motion).
- LAUNCH button: disabled state **never** — instead show "Launch anyway (2 gates failing)" so failure is explorable; hold-to-confirm optional in Settings.
- Keyboard-complete: Tab through catalog, `Enter/Space` to equip, arrow keys to move between slots, `L` launch, `R` reset, `Z/Shift+Z` undo/redo, `?` shortcuts overlay. Focus rings visible and styled.
- Every animated effect has a reduce-motion alternative (static state + text change).

## 10. COPY & VOICE (apply `ux-writing`)

Friendly, precise, no jargon without a tooltip. Examples: "Not enough lift. Your rocket needs thrust of at least 1.2× its weight." · "Power is at −1.5 kW. Add a solar wing or drop a payload." · Success: "You're in orbit. Payload online." Provide all strings in `src/i18n/en.json` (i18n-ready; no hard-coded text in components). Add a Tamil (`ta`) stub as a nod to Chennai (optional).

## 11. ACCESSIBILITY (WCAG 2.2 AA — hard requirement)

Semantic HTML for all UI around the canvas; canvas has an accessible text equivalent (live region announcing: "Booster attached", "TWR 1.58, passes", "Liftoff", "Orbit reached"); all gauges have text values; no information by color alone; motion-reduction, high-contrast, and colorblind-safe palettes; touch targets ≥ 44 px; works at 200 % zoom; screen-reader-tested flow (axe-core zero critical/serious violations in CI).

## 12. QUALITY BARS

- **Performance:** 60 fps on a mid-range laptop and ≥ 30 fps on a mid-range phone; initial JS ≤ 250 kB gz (lazy-load audio and charts); LCP < 2.5 s; no layout shift.
- **Correctness:** physics/validation 100 % line + branch coverage; the three golden builds asserted exactly; property tests (fast-check optional) that adding mass never increases TWR and adding a generator never decreases net power.
- **Robustness:** works offline (PWA), storage-blocked, window resize/orientation change mid-flight, tab hidden/visible (pause), no console errors.
- **Security/privacy:** no analytics or network calls by default; pinned dependency versions; CSP meta; no secrets.
- **Browser support:** latest Chrome, Edge, Firefox, Safari (desktop + iOS/Android).

## 13. REPO STRUCTURE
```
nitro-gravity/
├─ DESIGN.md                 # design direction, tokens, components, motion
├─ README.md                 # pitch, screenshots/GIF, run/build/deploy, controls, credits
├─ docs/{DECISIONS.md, PHYSICS.md, A11Y.md, PLAYTEST.md, ROADMAP.md}
├─ src/
│  ├─ data/{parts.json, planets.json, levels.json}
│  ├─ domain/{derive.ts, validate.ts, score.ts, advice.ts}   # pure, tested
│  ├─ sim/{loop.ts, flight.ts, stateMachine.ts, outcomes.ts}
│  ├─ render/{app.ts, rocket.ts, starfield.ts, particles.ts, camera.ts, pad.ts}
│  ├─ ui/{BuildScreen, Catalog, Gauges, Debrief, Tutorial, Settings, Title}/…
│  ├─ state/{buildStore.ts, flightStore.ts, settingsStore.ts}
│  ├─ audio/  ├─ i18n/  ├─ styles/  └─ main.tsx
├─ tests/{unit, e2e}
└─ .github/workflows/ci.yml
```

## 14. DELIVERY PHASES (commit after each; keep `main` always runnable)

1. **Foundations:** scaffold, tooling, tokens, `DESIGN.md`, CI, empty shell with layout. *Exit:* `npm run dev/build/test/lint` all green.
2. **Domain core (TDD):** parts data, derive/validate, golden builds, advice engine. *Exit:* coverage gate met.
3. **Build experience:** catalog, drag/click equip, snapping, live gauges, undo/redo, reset, examples. *Exit:* a user can assemble Build B in < 30 s using mouse, touch, or keyboard.
4. **Flight simulation & renderer:** state machine, ascent, booster jettison, shake-and-crash, orbit, particles, audio. *Exit:* A crashes, B reaches orbit, C shows budget/power failure, deterministically.
5. **Telemetry & debrief:** root-cause cards, charts, fix suggestions, build diff, scoring. *Exit:* every violated gate has a specific, correct suggestion (unit-tested).
6. **Guided levels, settings, i18n, a11y pass:** levels 1–3, accessibility settings, axe clean, keyboard and SR walkthrough.
7. **Polish & ship:** performance pass, PWA, README with GIF, deploy to static host, optional Capacitor APK, 3-minute demo script (`docs/DEMO.md`: build A → crash → read debrief → fix → orbit → show roadmap).

### v2 phases (after Phase 7 core ship; each ends with tests, screenshots, and a commit)
8. **Materials & efficiency engine:** `materials.json`, combination rules, build-time/cost model, Efficiency Index, Pareto chart, Combination Codex, Optimizer advisor; Agency Creator. *Exit:* no dominated materials (test), the three golden builds unchanged under `al-standard`, the optimizer's suggestion improves the chosen metric when applied.
9. **Advanced VAB + full flight HUD + Orbit & Docking mode.** *Exit:* build a two-stage rocket on the grid, stage it in flight, dock with the station, with a logged "Vessels docked".
10. **Landing and re-entry modes, planet configs (Moon/Mars/Jupiter g values), parachute and heat-shield logic, cinematics.** *Exit:* each mode has a win and a failure case with a specific debrief.
11. **Optional Android build** (Capacitor), touch-control tuning, performance pass on a mid-range phone.

## 15. ACCEPTANCE CRITERIA (definition of done)

**v2 criteria (in addition to the list below):**
- [ ] At least 7 materials, 4 propellant types and 4 coatings with synergy/conflict rules; no option dominates all axes (unit-tested).
- [ ] Build days, total cost, $/kg and Efficiency Index update live in the builder and match the formulas in 5A.3/5A.4 (unit-tested).
- [ ] A player can demonstrably cut cost or build time of a design by ≥ 30 % through material, reuse, and automation choices while still passing all four gates.
- [ ] Agency flag creator, ROCKET/CRAFT/LAUNCH tabs, part inspector with an adjustable parameter, staging, throttle and the event log all work on desktop and touch.
- [ ] Docking, landing and re-entry modes each have a success path, a failure path and a debrief naming the cause.
- [ ] The UI states clearly that orbital/atmospheric physics is simplified for learning.

- [ ] All four constraints enforced exactly as in Section 2 (TWR ≥ 1.2, ≤ $1.0M, ≤ 5,000 kg, net power > 0), including boundary cases (TWR exactly 1.20, cost exactly $1,000,000, mass exactly 5,000, power exactly 0).
- [ ] Modules visibly snap onto the rocket instantly; side boosters, solar wings, and RTG are visually distinct.
- [ ] Low-TWR launch shows violent shake and pad crash; valid build shows smooth orbital ascent with booster separation.
- [ ] Debrief names every failing cause with numbers and a fix; fix suggestions verified by re-running validation.
- [ ] One-click Reset (with undo) works at any time, including after a crash.
- [ ] Fully playable on desktop, tablet and phone; keyboard-only and touch-only.
- [ ] axe: 0 critical/serious; Lighthouse ≥ 90 (Perf/A11y/Best Practices); no console errors.
- [ ] Golden builds A/B/C pass in unit **and** E2E tests; screenshots captured at 1440×900, 768×1024, 390×844.
- [ ] Repo contains README with live demo link, GIF, controls, architecture, and credits; no NASA branding used beyond the event name.

## 16. FINAL REPORT FORMAT (what to return when done)

1. What was built (≤ 5 lines) and how to run it.
2. Checklist of Section 15 with evidence (test output, screenshots).
3. Decisions/assumptions made (link to `docs/DECISIONS.md`).
4. Known limitations and the next-step roadmap (Phases 01–04 from the deck: multi-planet gravity, orbital transfer plotting and fuel-burn curves, solar flares & micrometeoroid shielding, open STEM release).

*Begin with Phase 1 now. Show a one-paragraph plan, then execute.*
