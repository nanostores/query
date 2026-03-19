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

### Wins (kept)
- Simplify `testKeyAgainstSelector` with `.call` duck-typing + `[].concat` (-2)
- Shorten error message + console.warn string (-13)
- Remove console.warn in `__unsafeOverruleSettings` + `Error()` without `new` (-13)
- Merge `handleNewListener` and `runRefetcher` into one function (-12)
- Replace `evtUnsubs.forEach` with `for...of` (-2)
- Inline `getCachedValueByKey` at both call sites (-6)
- Simplify `browser.ts` subscribe, then cache `typeof window` in `canSub` (-12)
- Optimize mutator opts destructuring with `??` (-3)
- Remove explicit `void 0` properties in mutator `store.set()` (-5)
- Replace `Symbol()` with `{}` for fetcherSymbol (-1)
- Convert `setKeyStoreValue` if/else to ternary (-5)
- Replace `new Date().getTime()` with `+new Date()` (-3)
- Combine `prevKey = fetcherStore.key = newKey` assignment (-1)
- Replace `keysAsStoresToIndexes` Map with parallel arrays (-4)
- Remove unnecessary `async` from `fetcherStore.fetch` (-1)
- Replace `_revalidateOnInterval` Map with local variable (-6)
- Inline `safeKeySet` in createMutatorStore (-8)

### Dead ends (worse brotli)
- `Date.now()` instead of `new Date().getTime()` — compresses worse
- `withKey` higher-order function for invalidate/revalidate/mutate — adds bytes
- Inline `iterOverCache` loops — repetition compresses worse than shared function
- Cache `getNow()` in variables — variable declarations cost more than saved
- Simplify `setAsLoading` conditional — conditional assignment compresses worse
- `== null` instead of `=== null || === void 0` — the triple `===` pattern compresses better
- `cacheEntry` helper for created/expires — function overhead exceeds savings
- Direct `fetcherStore.key` access instead of destructuring — worse brotli
- Reuse `handleNewListener` in `cacheKeyChangeHandler` — cross-reference compresses worse

### Key insight
Brotli compression favors repetitive patterns (like `typeof key ===`, destructuring). Raw size reduction doesn't always map to brotli reduction. Must always test actual brotli output.
