# Agents.md - @nanostores/query

## Project Overview

`@nanostores/query` is a tiny (~1.8 KB gzipped) data-fetching library for [Nano Stores](https://github.com/nanostores/nanostores). It provides `stale-while-revalidate` caching (RFC 5861), automatic revalidation (interval, focus, reconnect), and a transport-agnostic design that works with React, Vue, Svelte, Preact, and React Native.

## Architecture

The entire library lives in a single core file (`lib/factory.ts`, ~678 lines) plus thin platform adapters. The design uses a factory pattern: `nanoqueryFactory` accepts a platform compatibility tuple and returns the `nanoquery` function.

### Source Structure

```
lib/
  factory.ts          -- Core implementation: types, nanoqueryFactory, createFetcherStore,
                         createMutatorStore, runFetcher, getKeyStore, cache management
  main.ts             -- Browser entry point: re-exports from factory, binds browser platform
  main-rn.ts          -- React Native entry point: same, binds RN platform
  platforms/
    type.ts           -- PlatformCompat type: [IsAppVisible, VisibilityChangeSub, ReconnectSub]
    browser.ts        -- Browser adapter: document.hidden, visibilitychange, online events
    react-native.ts   -- RN adapter: AppState, optional @react-native-community/netinfo
  __tests__/
    setup.ts          -- Test helpers (noop, delay)
    main.test.ts      -- Main test suite (~1240 lines, fake timers)
    react-integration.test.ts  -- React renderHook tests (real timers)
    real-timer.test.ts         -- Tests without fake timers (event sequences, SSR tasks)
    type.test-d.ts    -- Type-level tests using expectTypeOf
```

### Key Concepts

- **KeyInput**: Keys can be strings, numbers, booleans, atoms, or other FetcherStores (for chaining). Internally transformed into a reactive atom via `getKeyStore()`.
- **FetcherStore**: A nanostores `map()` with `{data, error, loading, promise}` plus helper methods (`invalidate`, `revalidate`, `mutate`, `fetch`).
- **MutatorStore**: Wraps an async function with `invalidate`, `revalidate`, and `getCacheUpdater` helpers. Supports throttling and optimistic updates.
- **Cache**: A plain `Map<Key, {data, error, retryCount, created, expires}>`. Shared across all fetcher stores in a `nanoquery()` context.
- **Events**: Internal event bus (nanoevents) for FOCUS, RECONNECT, INVALIDATE_KEYS, REVALIDATE_KEYS, SET_CACHE coordination.

### Build System

- **Vite** in library mode with Rollup plugins for `process.env.RN` replacement and `console.log` stripping in production.
- **vite-plugin-dts** generates TypeScript declarations.
- **build.sh** runs two Vite builds: browser (ESM + UMD) and React Native (CJS), then merges outputs into `dist/`.
- **Size limit**: 1924 bytes budget enforced via `size-limit`.

### Testing

- **Vitest** with `happy-dom` environment and globals.
- Tests use `vi.useFakeTimers()` extensively for cache/deduplication/retry timing.
- Type tests use `vitest` `expectTypeOf` for compile-time type checking.
- Run tests: `pnpm test` (unit + size check), `pnpm dev:test` (watch mode).

### Dependencies

- **Runtime**: `nanoevents` (^9.0.0)
- **Peer**: `nanostores` (>=0.10)
- **Optional peers**: `react-native` (>=0.70), `@react-native-community/netinfo` (>=11)

### Package Exports

- `.` -- Browser: ESM (`dist/nanoquery.js`), CJS (`dist/nanoquery.umd.cjs`), types (`dist/main.d.ts`)
- `./react-native` -- React Native CJS (`dist/nanoquery.native.cjs`)

## Development Commands

| Command | Purpose |
|---------|---------|
| `pnpm test` | Run unit tests + size check |
| `pnpm test:unit` | Run vitest with typecheck |
| `pnpm test:size` | Check bundle size budget |
| `pnpm dev:test` | Watch mode for tests |
| `pnpm build` | Build all targets (browser + RN) |
| `pnpm pub` | Build, publish to npm, push tags |

## Code Conventions

- No CI/CD pipeline configured; `lefthook` runs `pnpm test` as a pre-commit hook.
- `console.log` calls in `factory.ts` are debug-only, stripped in production builds by `@rollup/plugin-strip`. `console.warn` is intentionally preserved.
- `__unsafeOverruleSettings` is a test-only escape hatch that bypasses all settings hierarchy.
- The library targets `esnext` and supports Node `^14 || ^16 || >=18`.

## Known Patterns

- **Conditional fetching**: Pass `null`/`undefined`/`false` as any key part to disable the fetcher.
- **Chained requests**: Pass a FetcherStore as a key part; the dependent store fetches only when the parent has data.
- **Error retry**: Default exponential backoff (copied from SWR). Customizable via `onErrorRetry`, disable with `null`.
- **Cache invalidation vs revalidation**: `invalidate` deletes cache (shows spinner), `revalidate` marks cache stale (shows cached data during refetch).
