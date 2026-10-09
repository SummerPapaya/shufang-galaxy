# AGENTS.md

## Cursor Cloud specific instructions

### What this is
`shufang-galaxy` is a single frontend product: a Vite 7 + React 19 + TypeScript SPA (an immersive 3D "galaxy" showcase for the "一个人的书房" podcast). There is **no backend, no database, and no external service** — all content is loaded client-side from static files under `public/assets/` (`rooms.json`, `books.json`, room images, audio samples).

### Commands (all documented in `README.md` / `package.json`)
- `npm run dev` — Vite dev server. **Port is hardcoded to `3000`** in `vite.config.ts` (not the Vite default of 5173).
- `npm run build` — `tsc -b && vite build` (outputs to `dist/`). Verified passing.
- `npm run lint` — ESLint.
- `npm run preview` — preview a production build.

### Non-obvious caveats
- `npm run lint` currently exits non-zero with ~18 **pre-existing** errors, mostly in shadcn/ui boilerplate (`src/components/ui/*`) and the Three.js view components, from strict `react-hooks`/`react-refresh` rules (immutability, refs-during-render, `set-state-in-effect`, impure `Math.random`/`performance.now`). These are not environment problems — the lint tooling itself runs fine. Do not treat a failing `npm run lint` as a broken setup, and don't "fix" this boilerplate unless asked.
- `npm run build` produces a large (~1.5 MB) JS chunk and prints a chunk-size warning; this is expected (Three.js + many Radix UI deps) and not an error.
- Node 22 works locally; CI (`.github/workflows/deploy.yml`) pins Node 20 and deploys to GitHub Pages on push to `main`.
