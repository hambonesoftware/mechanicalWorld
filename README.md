# Mechanical World — REDLINE

A browser-based, playable 3D engineering arcade laboratory built with procedural Three.js geometry, FEAScript finite-element beam analysis and Rapier rigid-body physics.

### Libraries in this repo

| Library | Version | Use |
| --- | --- | --- |
| [FEAScript](https://docs.feascript.com/) | 0.3.1 | Euler-Bernoulli finite-element beam deflection |
| [Rapier 3D compat](https://rapier.rs/) | 0.21.0 | Gravity, collisions, dynamic dropped test block |
| [Three.js](https://threejs.org/) | 0.187.0 | Procedural industrial models, PBR lighting, stress colors |
| [Vite](https://vite.dev/) | 8.3.5 | Local dev server and GitHub Pages bundling |

All three libraries are pinned in `package.json`. Do not commit `node_modules/`. The project imports the actual packages instead of substituting custom physics approximations for them.

### Run locally

Node.js 22.12 or later is required.

```bash
npm install
npm run dev
```

Build and test:

```bash
npm test
npm run build
```

Vite's GitHub Pages base path is `/mechanicalWorld/` when `GITHUB_PAGES=true`.

### Game

- Three escalating cantilever challenges.
- Material selection: steel or aluminum.
- Adjustable end force, beam length, flange width and section height.
- Real bending stress, strain, mass, yield safety factor and finite-element deflection.
- Procedural 3D I-beam, test clamp, hydraulic press, bolts, platform and workspace.
- Stress colors / physical material toggle, orbit and zoom controls, exaggerated deformation scale.
- Independent Rapier drop-test block for rigid-body collision demonstrations.

### Engineering assumptions

The beam model uses linear-elastic, small-deflection Euler-Bernoulli bending of a straight prismatic I-section subject to a transverse point load at its free end and a perfectly fixed opposite end. It ignores shear deflection, distributed self-weight, lateral torsional buckling, local buckling, connection flexibility, dynamic fatigue, large displacements and plasticity. FEAScript calculates the displacement; analytical equations verify the result and provide a **labeled fallback only if necessary**. Yield utilization is a limit indicator, not a plasticity simulation.

The rigid-body sample does not create or alter the cantilever's FEM load. The displacement display is deliberately magnified unless its scale is set to 1×. This game is **not suitable for real engineering design or safety certification**.

### Project layout

```text
src/main.js                  UI and challenge logic
src/style.css                Responsive graphic system
src/scene/lab.js             Three.js procedural laboratory and Rapier
src/engineering/beam.js      Verified analytical beam model
src/engineering/fem.js       FEAScript numerical beam adapter
tests/beam.test.js           Analytical reference tests
tests/fem.test.js            Real numerical solver tests
.github/workflows/ci.yml    CI physics checks and bundled build
.github/workflows/pages.yml GitHub Pages deployment
```
