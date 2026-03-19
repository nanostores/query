# Autoresearch: Bundle Size Optimization

## Objective
Minimize the gzipped bundle size of `@nanostores/query` (the browser entry point). Currently 1908 bytes gzipped. The library exports `nanoquery` and `onErrorRetry` from `dist/nanoquery.js`. Size is measured by `size-limit` which checks gzipped size of the `{ nanoquery }` import.

## Metrics
- **Primary**: `size_bytes` (bytes, lower is better) — gzipped bundle size reported by size-limit
- **Secondary**: `raw_bytes` — uncompressed JS size of `dist/nanoquery.js`

## How to Run
`./autoresearch.sh` — builds, measures size, outputs `METRIC size_bytes=N` and `METRIC raw_bytes=N`.

## Files in Scope
- `lib/factory.ts` — Core implementation (~663 lines). Main optimization target.
- `lib/main.ts` — Browser entry point (re-exports).
- `lib/platforms/browser.ts` — Browser platform adapter.
- `vite.config.ts` — Build config (minify settings, plugins).

## Off Limits
- `lib/__tests__/` — Do NOT modify or delete any tests.
- `lib/platforms/type.ts` — Type definitions for platform compat.
- `lib/platforms/react-native.ts` — RN adapter (not in bundle path).
- `lib/main-rn.ts` — RN entry (not in bundle path).
- Public API types and signatures — must remain compatible.

## Constraints
- All tests must pass (`pnpm test:unit`).
- No API changes — exported types and runtime behavior must be preserved.
- No new dependencies.
- No dropping tests.
- `minify: false` in vite config is intentional for the base build — we can enable minification or use terser but the real wins should come from source-level code reduction.

## What's Been Tried
(Nothing yet — baseline run)
