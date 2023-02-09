(function(global, factory) {
  typeof exports === "object" && typeof module !== "undefined" ? factory(exports, require("nanostores")) : typeof define === "function" && define.amd ? define(["exports", "nanostores"], factory) : (global = typeof globalThis !== "undefined" ? globalThis : global || self, factory(global.nanofetch = {}, global.nanostores));
})(this, function(exports2, nanostores) {
  "use strict";
  let createNanoEvents = () => ({
    events: {},
    emit(event, ...args) {
      let callbacks = this.events[event] || [];
      for (let i = 0, length = callbacks.length; i < length; i++) {
        callbacks[i](...args);
      }
    },
    on(event, cb) {
      var _a;
      ((_a = this.events[event]) == null ? void 0 : _a.push(cb)) || (this.events[event] = [cb]);
      return () => {
        var _a2;
        this.events[event] = (_a2 = this.events[event]) == null ? void 0 : _a2.filter((i) => cb !== i);
      };
    }
  });
  const nanofetch = ({
    cache = /* @__PURE__ */ new Map(),
    fetcher: globalFetcher,
    ...globalSettings
  } = {}) => {
    const events = createNanoEvents();
    let focus = true;
    subscribe("focus", () => {
      focus = true;
      events.emit(FOCUS);
    });
    subscribe("blur", () => focus = false);
    subscribe("online", () => events.emit(RECONNECT));
    const _refetchOnInterval = /* @__PURE__ */ new Map(), _lastFetch = /* @__PURE__ */ new Map(), _runningFetches = /* @__PURE__ */ new Set(), _latestStoreKey = /* @__PURE__ */ new Map();
    let rewrittenSettings = {};
    const runFetcher = async ([key, keyParts], store, settings, force) => {
      var _a;
      _latestStoreKey.set(store, key);
      const isKeyStillSame = () => _latestStoreKey.get(store) === key;
      const set = (v) => {
        if (isKeyStillSame()) {
          store.set(v);
        }
      }, setKey = (k, v) => {
        if (isKeyStillSame()) {
          store.setKey(k, v);
        }
      };
      if (!focus)
        return;
      const { dedupeTime = 4e3, fetcher } = {
        ...settings,
        ...rewrittenSettings
      };
      const now = getNow();
      if (!force) {
        tick().then(() => {
          const cached = cache.get(key);
          set(cached ? { data: cached, loading: false } : loading);
        });
        await tick();
        const last = _lastFetch.get(key);
        if (last && last + dedupeTime > now) {
          return;
        }
      }
      if (_runningFetches.has(key)) {
        return;
      }
      _lastFetch.set(key, now);
      _runningFetches.add(key);
      setKey("loading", true);
      try {
        const res = await fetcher(...keyParts);
        cache.set(key, res);
        set({ data: res, loading: false });
        _lastFetch.set(key, getNow());
      } catch (error) {
        (_a = settings.onError) == null ? void 0 : _a.call(settings, error);
        setKey("error", error);
        setKey("loading", false);
      } finally {
        _runningFetches.delete(key);
      }
    };
    const createFetcherStore = (keyInput, {
      fetcher = globalFetcher,
      ...fetcherSettings
    } = {}) => {
      if (process.env.NODE_ENV !== "production" && !fetcher) {
        throw new Error(
          "You need to set up either global fetcher of fetcher in createFetcherStore"
        );
      }
      const fetcherStore = nanostores.map({
        loading: true
      }), settings = { ...globalSettings, ...fetcherSettings, fetcher };
      let keysInternalUnsub, prevKey, prevKeyParts, keyUnsub, keyStore;
      const evtUnsubs = [];
      nanostores.onStart(fetcherStore, () => {
        const firstRun = !keysInternalUnsub;
        [keyStore, keysInternalUnsub] = getKeyStore(keyInput);
        keyUnsub = keyStore.listen((currentKeys) => {
          if (currentKeys) {
            const [newKey, keyParts] = currentKeys;
            runFetcher([newKey, keyParts], fetcherStore, settings);
            prevKey = newKey;
            prevKeyParts = keyParts;
          } else {
            prevKey = prevKeyParts = void 0;
          }
        });
        const currentKeyValue = keyStore.get();
        if (currentKeyValue) {
          [prevKey, prevKeyParts] = currentKeyValue;
          if (firstRun)
            handleNewListener();
        } else {
          tick().then(() => fetcherStore.set(loading));
        }
        const {
          refetchInterval = 0,
          refetchOnFocus,
          refetchOnReconnect
        } = settings;
        const runRefetcher = () => {
          if (prevKey)
            runFetcher([prevKey, prevKeyParts], fetcherStore, settings);
        };
        if (refetchInterval > 0) {
          _refetchOnInterval.set(
            keyInput,
            setInterval(runRefetcher, refetchInterval)
          );
        }
        if (refetchOnFocus)
          evtUnsubs.push(events.on(FOCUS, runRefetcher));
        if (refetchOnReconnect)
          evtUnsubs.push(events.on(RECONNECT, runRefetcher));
      });
      const handleNewListener = () => {
        if (prevKey && prevKeyParts)
          runFetcher([prevKey, prevKeyParts], fetcherStore, settings);
      };
      const originListen = fetcherStore.listen;
      fetcherStore.listen = (listener) => {
        handleNewListener();
        return originListen(listener);
      };
      const mutateUnsub = events.on(MUTATE_CACHE, (keySelector, data) => {
        if (prevKey && testKeyAgainstSelector(prevKey, keySelector)) {
          if (data === void 0) {
            cache.delete(prevKey);
            _lastFetch.delete(prevKey);
          } else {
            cache.set(prevKey, data);
          }
          fetcherStore.setKey("data", data);
        }
      });
      const invalidateUnsub = events.on(INVALIDATE_KEYS, (keySelector) => {
        if (prevKey && testKeyAgainstSelector(prevKey, keySelector)) {
          runFetcher([prevKey, prevKeyParts], fetcherStore, settings, true);
        }
      });
      nanostores.onStop(fetcherStore, () => {
        mutateUnsub();
        invalidateUnsub();
        keysInternalUnsub == null ? void 0 : keysInternalUnsub();
        evtUnsubs.forEach((fn) => fn());
        keyUnsub == null ? void 0 : keyUnsub();
        const int = _refetchOnInterval.get(keyInput);
        if (int)
          clearInterval(int);
      });
      return fetcherStore;
    };
    const invalidateKeys = (keySelector) => {
      events.emit(INVALIDATE_KEYS, keySelector);
    };
    const mutateCache = (keySelector, data) => {
      events.emit(MUTATE_CACHE, keySelector, data);
    };
    function createMutatorStore(...args) {
      const wrapMutator = (innerFn) => async (data) => {
        var _a;
        const settings = {
          ...globalSettings,
          fetcher: innerFn,
          ...rewrittenSettings
        };
        try {
          store.setKey("error", void 0);
          store.setKey("loading", true);
          await settings.fetcher(data);
        } catch (error) {
          (_a = settings.onError) == null ? void 0 : _a.call(settings, error);
          store.setKey("error", error);
        } finally {
          store.setKey("loading", false);
        }
      };
      let mutate;
      if (Array.isArray(args[0])) {
        const [keys, autoMutator] = args;
        mutate = wrapMutator(async (data) => {
          await autoMutator(data);
          invalidateKeys(keys);
        });
      } else {
        const [manualMutator] = args;
        mutate = wrapMutator(async (data) => {
          const keysToInvalidate = [];
          try {
            await manualMutator({
              data,
              invalidate: (keys) => {
                keysToInvalidate.push(...Array.isArray(keys) ? keys : [keys]);
              },
              getCacheUpdater: (key, shouldInvalidate = true) => [
                (newVal) => {
                  mutateCache(key, newVal);
                  if (shouldInvalidate) {
                    keysToInvalidate.push(key);
                  }
                },
                cache.get(key)
              ]
            });
          } finally {
            invalidateKeys(keysToInvalidate);
          }
        });
      }
      const store = nanostores.map({ mutate, loading: false });
      return store;
    }
    const __unsafeOverruleSettings = (data) => {
      if (process.env.NODE_ENV !== "test") {
        console.warn(
          `You should only use __unsafeOverruleSettings in test environment`
        );
      }
      rewrittenSettings = data;
    };
    return [
      createFetcherStore,
      createMutatorStore,
      { __unsafeOverruleSettings, invalidateKeys, mutateCache }
    ];
  };
  const getKeyStore = (keys) => {
    let keyStore = nanostores.atom(null), keyParts = [];
    const setKeyStoreValue = () => {
      if (keyParts.some((v) => v === null)) {
        keyStore.set(null);
      } else {
        keyStore.set([keyParts.join(""), keyParts]);
      }
    };
    const unsubs = [];
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (typeof key === "string") {
        keyParts.push(key);
        continue;
      }
      keyParts.push(key.get());
      unsubs.push(
        key.listen((newValue) => {
          keyParts[i] = newValue;
          setKeyStoreValue();
        })
      );
    }
    setKeyStoreValue();
    return [keyStore, () => unsubs.forEach((fn) => fn())];
  };
  const FOCUS = 1, RECONNECT = 2, INVALIDATE_KEYS = 3, MUTATE_CACHE = 4;
  const subscribe = (name, fn) => {
    const isServer = typeof window === "undefined";
    if (!isServer) {
      addEventListener(name, fn);
    }
  };
  const testKeyAgainstSelector = (key, selector) => {
    if (Array.isArray(selector))
      return selector.includes(key);
    else if (typeof selector === "function")
      return selector(key);
    else
      return key === selector;
  };
  const getNow = () => new Date().getTime();
  const tick = () => new Promise((r) => r());
  const loading = Object.freeze({ loading: true });
  exports2.nanofetch = nanofetch;
  Object.defineProperties(exports2, { __esModule: { value: true }, [Symbol.toStringTag]: { value: "Module" } });
});
