# Repository Refresh Plan

A prioritized list of improvements to modernize and strengthen `@nanostores/query`.

---

## 1. Add GitHub Actions CI (High Priority)

There is no CI pipeline at all. Every PR merges without automated checks.

- Add a workflow that runs `pnpm test` (unit + typecheck + size-limit) on push/PR.
- Add a matrix for Node 18 / 20 / 22.
- Add a size-limit reporting step that comments bundle size diffs on PRs.

## 2. Update Dependencies (High Priority)

Many dev dependencies are 1-2 major versions behind:

| Package | Current | Latest |
|---------|---------|--------|
| `vite` | ^5.2 | 6.x |
| `vitest` | ^1.4 | 3.x |
| `@testing-library/react` | ^14.3 | 16.x |
| `@types/react` / `react` | ^18 | 19.x |
| `@types/node` | ^20 | 22.x |
| `happy-dom` | ^14.7 | 16.x |
| `vite-plugin-dts` | ^3.8 | 4.x |
| `typescript` | ^5.4 | 5.7+ |

This should be done carefully with tests passing at each step.

## 3. Fix the Duplicate `setKey` Bug in `createMutatorStore` (High Priority)

In `factory.ts` lines 531-532, the error handler calls both `safeKeySet("error", error)` and `store.setKey("error", error)`. The second call bypasses the listener-count guard in `safeKeySet`, which means unsubscribed stores get their error value overwritten. Remove the redundant `store.setKey` line.

## 4. Add `nodenext` Module Resolution Compatibility (Medium Priority)

Issue #59 reports that `"module": "nodenext"` in tsconfig doesn't work. This likely requires adding explicit `.js` extensions in the `exports` field and potentially shipping separate `.d.cts` / `.d.mts` declaration files.

## 5. Fix React Native Module Resolution (Medium Priority)

Issue #67 reports `Cannot find module '@nanostores/query/react-native'`. The `exports` field may need adjusting (add `import` condition, or fix the types path for the RN subpath).

## 6. Add a CHANGELOG (Medium Priority)

There is no CHANGELOG. Add one retroactively from git tags/commits (at least for v0.3.x), and adopt a convention (e.g., Keep a Changelog) going forward.

## 7. Modernize Node Engine Requirements (Medium Priority)

The `engines` field lists `^14.0.0 || ^16.0.0 || >=18.0.0`. Node 14 and 16 are EOL. Drop them to simplify maintenance and unlock newer APIs if needed.

## 8. Review and Merge Stale PRs (Medium Priority)

Two PRs have been open for ~10 months:
- **#72**: Use readonly array types for better type compatibility
- **#71**: Add lifecycle tests for unmounted stores

Review, request changes, or merge them.

## 9. Improve Documentation (Medium Priority)

Several open issues point to docs gaps:
- **#75**: Document all store states (loading/data/error transitions)
- **#69**: Clarify that `loading` is `false` on first render (before subscription)
- **#8/#17**: Add examples for initial data and testing

A state diagram or table showing all possible `{data, error, loading}` combinations would be valuable.

## 10. Implement `keepPreviousData` Option (Low Priority)

Issue #56 requests keeping previous data when keys change. This is a common pattern in react-query/SWR. Implementation would store the last successful data and expose it during key transitions.

## 11. Add Debounce Support (Low Priority)

Issue #74 requests debounced fetching for search-as-you-type patterns. Could be a `debounceTime` option on `createFetcherStore` that delays the fetcher call after key changes stabilize.

## 12. Add an `onRetriesExhausted` Callback (Low Priority)

Issue #60 requests a way to know when all retries have been exhausted. Currently the retry loop just stops silently. A callback or event would let users show "permanently failed" UI.

## 13. Fix README Typos and Outdated Info (Low Priority)

- "Automaticallty" typo in README line 11
- Consider updating the size claim (currently says 1.8 KB, budget is 1924 B)
- Review all code examples for accuracy

---

## Suggested Order of Execution

1. Fix the duplicate `setKey` bug (#3) -- quick win, correctness fix
2. Add CI (#1) -- enables everything else
3. Update dependencies (#2) -- with CI to catch regressions
4. Fix module resolution issues (#4, #5) -- unblocks users
5. Review stale PRs (#8)
6. Add CHANGELOG (#6) and fix README (#13)
7. Improve documentation (#9)
8. Feature work (#10, #11, #12) -- after the foundation is solid
