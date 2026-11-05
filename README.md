# Mechanical World — REDLINE

A responsive, playable 3D structural-mechanics game for [Hambone Arcade](https://hambonesoftware.github.io/arcade/). The experiment models a clamped I-beam under a tip load and teaches how changing beam geometry and material affects stress, strain, stiffness and mass.

## Mobile game interface (v0.2)

- **One fixed playfield:** The 3D scene stays onscreen; the document never becomes a tall control form.
- **Build:** Tap the specimen or press Build, then drag in-scene length, height and load handles. A compact scrollable panel provides precise material, length, section-height and flange-width controls.
- **Test:** A two-second force ramp animates the hydraulic test and updates the FE-derived deflection and beam stress. The test terminates at the target load or **first yield** and gives actionable pass/fail results.
- **Inspect:** Switch between material and stress rendering, study strain/safety factor, alter display exaggeration, or demonstrate a separate Rapier falling body.
- **Navigation:** Orbit and pinch the scene; use Beam/Full Machine camera presets, cycle levels, and read explanatory feedback without page scrolling.
- **Responsive/PWA:** Viewport-safe overlays, iOS safe-area insets, landscape and tablet variations, and a Home Screen manifest. The game still requires network connectivity for first loading and has no offline service worker.

## Install and play

Requires Node.js 22.12 or newer.

\`\`\`bash
npm ci
npm run dev
\`\`\`

Test the engineering calculations, bundle and mobile browser:

\`\`\`bash
npm test
npm run build
npx playwright install chromium
npm run test:e2e
\`\`\`

CI runs the actual browser smoke tests on four representative layouts—iPhone portrait, small portrait, mobile landscape and tablet—and stores diagnostic screenshots in the Actions artifacts. **These tests emulate devices in Chromium; they do not replace testing in Safari or the ChatGPT in-app browser on an actual iPhone.**

[Live game](https://hambonesoftware.github.io/mechanicalWorld/) · [CI results](https://github.com/hambonesoftware/mechanicalWorld/actions)

## Physics libraries

| Library | Version | Role |
| --- | --- | --- |
| [FEAScript](https://docs.feascript.com/) | 0.3.1 | Numerical Euler–Bernoulli finite-element beam deflection |
| [Rapier 3D compat](https://rapier.rs/) | 0.21.0 | Separate rigid-body block drop and collisions |
| [Three.js](https://threejs.org/) | 0.187.0 | Procedural test fixture, geometry deformation, materials, stress rendering |
| [Vite](https://vite.dev/) | 8.3.5 | Development and GitHub Pages bundling |
| [Playwright](https://playwright.dev/) | 1.56.1 | Mobile viewport and gameplay browser tests |

All dependencies are pinned in package.json and locked in package-lock.json. Do not commit node_modules.

## Model scope and correctness

Mechanical quantities use SI units. The analysis is linear elastic, small-deflection Euler–Bernoulli bending with a perfectly fixed end, a vertical tip point load and a straight prismatic I-section. It ignores shear deformation, self-weight, lateral-torsional buckling, local instability, joint flexibility, nonlinear materials, fatigue and fracture.

- FEAScript beam displacement is checked against the analytical cantilever solution, with a clearly labeled analytical fallback on solver failure.
- Maximum stress is calculated from bending moment and section properties, and strain from the linear elastic material law.
- The game **stops at the first-yield limit** rather than simulating nonexistent plasticity or fracture.
- The deformation scale is a visual multiplier (8× by default).
- Rapier's dropped block is independent from the beam's calculated load.
- Results are educational only and **not suitable for engineering design or safety certification**.

## Architecture

\`\`\`text
index.html                    Game HUD, tool sheets and menu
src/style.css                 Mobile-first responsive styling
src/main.js                   Game modes, controls, test ramp and scoring
src/scene/lab.js              Three.js procedural scene, camera, touch picking, Rapier
src/engineering/beam.js       Analytical mechanics and challenge limits
src/engineering/fem.js        FEAScript adapter and reference cross-check
tests/beam.test.js            Mechanics unit tests
tests/fem.test.js             FE numerical tests
tests/layout.test.js          HUD and accessibility structure checks
tests/browser/mobile.spec.js  Mobile browser gameplay and viewport smoke tests
playwright.config.js          Chromium mobile viewport matrix
.github/workflows/ci.yml     Numerical, build and browser checks
.github/workflows/pages.yml  Verified deploy to GitHub Pages
\`\`\`
