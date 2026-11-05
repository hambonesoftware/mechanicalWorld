# Mechanical World — REDLINE

Mechanical World is a mobile-first, browser-based cantilever-beam test game for [Hambone Arcade](https://hambonesoftware.github.io/arcade/). A procedural 3D hydraulic test rig combines analytical mechanics, FEAScript elastic beam deflection and Rapier rigid-body motion.

## How to play

- **Build** — Adjust the clamped I-beam's material, span, section height, flange width and commanded test load. Use touch drag handles or precise controls.
- **Test** — Apply the complete chosen command rather than automatically stopping at first yield. With sufficient overload observe elastic bending, illustrated yielding, an opening tension-flange crack, web tearing and eventually separation.
- **Break It** — Deliberately overload a design until rupture in the educational demonstration, even if safe under its challenge load.
- **Inspect** — Examine elastic bending stress, deflection, strain, and factors of safety. Revisit results and change the design.
- **Try again** — Reset and re-test the specimen. Three progressive challenges reward beams satisfying stiffness and yield-margin limits without excess mass.

[Play Mechanical World](https://hambonesoftware.github.io/mechanicalWorld/) · [GitHub Actions](https://github.com/hambonesoftware/mechanicalWorld/actions)

## Critical mechanics distinction

**First yield is not fracture.** Ductile metals can permanently deform and still carry load well beyond the elastic limit. Real fracture calculations require material stress–strain curves, plasticity, multiaxial stresses, defects and geometry, fracture energy or cohesive-zone models, suitable loading controls and verified nonlinear FEA.

**What this version actually models:**

1. A linear-elastic fixed-end cantilever using Euler–Bernoulli theory with a tip point force and prismatic I-section.
2. FEAScript linear beam deflections cross-checked against analytical solutions.
3. A separate, deliberately **illustrative** overload/damage envelope in src/engineering/damage.js. Nominal yield/ultimate strength ratios stage visual events. **It does not predict real crack initiation, rupture force, or the actual fracture path.** Visual permanent bending and tearing are animation effects, not nonlinear FE results.
4. A procedural crack on the nominal tension flange and through the web near the fixed clamp, followed by a separated beam portion simulated by Rapier as a dynamic rigid body.
5. The actuator **command** continues to the selected load even after beam separation. The detached beam does **not** carry that force, and readings beyond yield are hypothetical elastic trial extrapolations.

A beam that meets strength and deflection criteria will not crack. **Break It** deliberately drives it beyond the illustrative rupture threshold so the player can see failure.

This game is educational software, **not a certified structural-design, failure-analysis or safety tool**.

## Development

Node.js 22.12 or later is required.

    npm ci
    npm run dev

    npm test
    npm run build
    npx playwright install chromium
    npm run test:e2e

CI checks elastic mechanics, staged damage events, the production build and responsive browser interactions at four device sizes. Browser automation uses Chromium emulation; actual iPhone Safari and ChatGPT in-app browser behavior still requires hands-on testing.

## Architecture

| Code | Purpose |
| --- | --- |
| src/main.js | Build/Test/Inspect state, full force command ramp and results |
| src/engineering/beam.js | Elastic analytical properties, stresses, strains and challenges |
| src/engineering/fem.js | FEAScript elastic deflection adapter with analytic cross-check |
| src/engineering/damage.js | **Illustrative** yield, crack, tear, rupture event model |
| src/scene/lab.js | Procedural machinery, glowing crack, detached Rapier beam fragment |
| src/style.css | Mobile-first full-screen game HUD and controls |
| tests/beam.test.js | Elastic reference tests |
| tests/damage.test.js | Damage and destructive loading tests |
| tests/fem.test.js | FE numerical tests |
| tests/browser/mobile.spec.js | Full and destructive loading mobile UI tests |
| .github/workflows/pages.yml | CI-verified GitHub Pages deployment |

## Future engineering-quality moonshot

A stronger solver stack would include Timoshenko beam/frame models, elastoplasticity with hardening, geometric nonlinearity and local buckling, 3D solid/shell FEA, fracture-energy regularization, cohesive-zone or phase-field crack growth, digital image correlation-style strain maps, and load-displacement curves. Each needs independently verified reference cases, calibrated materials, convergence studies, and clearly declared model limitations before being called predictive.


## Hambone PLAY integration

Mechanical World uses the versioned, framework-free **Hambone PLAY v1** core vendored at \`src/vendor/hambone-play/\`. The authoritative component and API live in [Hambone Arcade](https://github.com/hambonesoftware/arcade/tree/main/play/v1).

The Workbench HUD occupies only compact regions of the screen: live load/tip readouts, a contextual event message and a primary test action. The large title, permanent dock and floating data cards are hidden, but their existing DOM values and handlers remain intact. The HUD passes its available rectangle to the Three.js camera, allowing camera framing to account for opened edit and results panels.

The engine and numerical solvers have not been modified to implement the HUD. The shared core is vendored to avoid a gameplay-breaking network dependency on another repository.
