# Development Environment & Setup Guide

## 1. Prerequisites

- **Node.js**: `v20.x` or higher (tested on `v24.14.1`)
- **Package Manager**: `pnpm` (`v10.x` or higher, recommended) or `npm`
- **Modern Browser**: Chrome, Edge, or Firefox with WebGL2 support.

---

## 2. Installation

Clone the repository and install dependencies using `pnpm`:

```bash
git clone <repo-url>
cd diplom
pnpm install
```

---

## 3. Available Scripts

| Script Command | Description |
| :--- | :--- |
| `pnpm run dev` | Starts Vite local development server on `http://localhost:5173` |
| `pnpm run build` | Compiles TypeScript and creates optimized production bundle in `dist/` |
| `pnpm run preview` | Previews production build locally |
| `pnpm test` | Runs all unit and integration test suites via Vitest |
| `pnpm run test:watch` | Runs Vitest in interactive watch mode |
| `pnpm run build:wasm` | Compiles WebAssembly DSP kernels (`.wat` -> `.wasm`) and generates binary TypeScript loader via WABT |
| `pnpm run typecheck` | Validates TypeScript types across the entire codebase (`tsc --noEmit`) |
| `pnpm run check:boundaries` | Enforces architectural boundary rules (no React/Three.js in domain) |

---

## 4. Environment Variables

Currently, the digital twin operates in local-first client-side mode and does not require third-party API keys or secret credentials. All configuration is governed by performance tiers (`HIGH`, `MEDIUM`, `LOW`) selectable at runtime.
