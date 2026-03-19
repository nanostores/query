# Autoresearch Ideas

## Potentially promising
- Combine INVALIDATE_KEYS + REVALIDATE_KEYS events into one parameterized event (saves 1 event constant + simplifies handler)
- Replace `events.emit(SET_CACHE, keySelector, data)` in mutateCache to always emit full FetcherValue (removes ternary in handler)
- Try making `iterOverCache` take an event type parameter to combine invalidate/revalidate/mutateCache
- Explore if `_errorInvalidateTimeouts` can be stored on cache entries to eliminate the Map
- Try `Object.assign` in specific patterns where multiple spreads are used
- See if the `firstRun` check in onStart can be eliminated
- Investigate if any nanostores APIs can be used differently for smaller code (e.g., `computed` vs `batched`)
