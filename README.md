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


## REDLINE v2 — calculated permanent bending and load-history replay

The original FEAScript / closed-form Euler–Bernoulli elastic checks remain in place. A separate incremental **one-dimensional fiber beam** now integrates bilinear elastoplastic material response through 32 symmetric layers of the I-section across 40 beam stations. It includes isotropic work hardening, path-dependent plastic strains, bending curvature integration and unloading/reloading in the moment-curvature equilibrium solver.

After a non-rupturing test, **Unload** gradually returns the applied force to zero. The beam holds its calculated residual deflection; **Reload** applies the previous commanded load without resetting plastic history. **Curve** opens the inspection display with a color-separated force vs downward-tip-displacement plot and a scrubber to replay any recorded numerical beam shape. Replay uses frozen numerical snapshots and does **not** mutate the active plastic state.

The live Three.js beam uses the calculated displacement, rotation and fiber stress through load/unload/reload; display-only deformation is smoothly compressed at extreme angles. In contrast, crack/tear/rupture thresholds and broken-body Rapier motion remain deliberately *illustrative* and not a validated fracture model. This is a simplified small-rotation, small-deflection bending solver and cannot substitute for material coupon data, geometric-nonlinear shell/solid FEA, buckling analysis, cyclic Bauschinger effects, or real structural design calculations. The force displayed after rupture is the **actuator command**, not the force transmitted by the detached beam.

New tests check elastic agreement, onset of plasticity, unload residual, elastic-direction reloading, replay isolation, and the complete mobile test → unload → reload → scrub workflow.


## REDLINE v2.1 — continuous bending, visible tearing, matched floor clearance

The physical fiber-beam solver still owns the numerical force/deflection
history. The deliberately exaggerated drawing now uses a smooth, differentiable
deformation constraint to ensure its lower flange stays above the actual
machinery top at y = 0.28 m. This constraint is **display-only**; it does not
simulate a new physical reaction force or alter any numerical measurement.

The root-end crack is mapped along the same bent centerline as the I-section,
so it travels with the material rather than appearing as a straight separate
overlay. Break-It loading provides dedicated, readable intervals for first yield,
flange crack growth, web tearing and separation. At the exact separation step,
the intact curved surface is replaced by two matching curved fragments with
coincident world-space boundaries: one remains in the clamp and the other
becomes a Rapier rigid body. The previous straight, pre-rotated replacement and
large fracture impulse are gone.

The visible steel-test platform now matches Rapier's collision plane (0.28 m)
and the detached curved mesh receives a conservative bounding collider.
Without Rapier, its gravity-drop fallback stops at the same platform top.
The numerical specimen geometry is frozen at the illustrative rupture load
even if the actuator's requested force continues increasing, because the broken
piece no longer carries load.

Mobile browser QA now captures an intermediate tearing frame, checks that
yield/crack/tear/rupture were encountered in order, and samples display floor
clearance throughout the ramp. Numerical tests cover visual continuity and
clearance at 20x deformation across multiple section depths.


## REDLINE v2.2 — real visible mesh opening before complete failure

The fracture renderer is now a **layered geometric separation**, not a
decorative line marking a future tear. When the localized damage front crosses
a flange or web layer, that layer becomes two separate watertight meshes with
a physical slit and dark rough exposed faces. Layers not yet reached by the
front remain continuous and carry the visible connection. The fracture begins
in the upper flange, progresses through the web, and finally removes the lower
ligament; the final detached root/free fragments use the same layered seam
and curved centerline, eliminating the previous magic swap.

The force thresholds are still deliberately illustrative and **not**
calibrated crack-growth mechanics; numerical elastoplastic bending remains
a one-dimensional fiber model. The 3D mesh opening is a concrete geometric
animation of that failure model, not a structural prediction.

The default teaching deformation exaggeration is reduced from 8× to 2×,
with an adjustable 1×–3× slider. Legacy values above 3× are clamped in the
renderer only. This avoids folding the specimen unnaturally toward the
machine floor while preserving the computed load, deflection and permanent
set metrics. Mobile regression tests now require actual disconnected
fracture faces and a measurable opening *during* tearing.


### REDLINE v2.2.1 — fracture handoff repair

A rendering regression was found in iPhone screenshots: the progressive tear opened while the beam was loaded, but the final root and falling fragments used legacy left/right identifiers instead of the fracture renderer's root/free sides. This removed the visible slit and the exposed dark fracture faces immediately at rupture. The final fragment builder now uses the same side conventions and opening formula as the live tearing geometry. Invalid fragment names fail explicitly rather than silently closing the crack.

A mobile browser regression test now checks the real distance between opposing rendered mesh face centroids, and requires all 34 exposed fracture faces at separation. It rejects versions that report rupture but display a visually continuous beam.


### REDLINE v2.2.2 — visible separation, not only a mathematical gap

The release renderer now tracks **how far the detached fragment actually falls** and how far apart the two opposing fracture faces appear **on screen**, in addition to the numerical gap at rupture. A zoomed, eased-in fracture camera follows the root region when separation begins, and a compact result card leaves the broken specimen visible. Full numerical result text remains available through the Details control. The mobile browser test fails if the detached fragment has not fallen visibly or the final fracture is too small to discern on a phone. Visual QA PNGs are retained as a GitHub Actions artifact for manual review.


### Rigid fragment collision refinement

The detached section now uses four short Rapier colliders aligned with its curved centerline rather than one enormous enclosing box. The latter could support the beam at a physically incorrect location on the platform. The moving body has explicit gravity and sleep disabled and is woken immediately after collider construction. The browser test checks world stepping, rigid-body mass, awake state, actual downward motion, and a readable final gap before deployment.
