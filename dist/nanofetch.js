import { atom, onStart, onStop } from "nanostores";
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
    events.emit(1);
  });
  subscribe("blur", () => focus = false);
  subscribe("online", () => events.emit(2));
  const _refetchOnInterval = /* @__PURE__ */ new Map(), _lastFetch = /* @__PURE__ */ new Map(), _runningFetches = /* @__PURE__ */ new Set();
  let rewrittenSettings = {};
  const runFetcher = async ([key, keyParts], store, settings) => {
    if (!focus)
      return;
    const { dedupeTime = 4e3, fetcher } = {
      ...settings,
      ...rewrittenSettings
    };
    const now = getNow();
    if (!cache.has(key)) {
      cache.set(key, loading);
    }
    const setIfNotMatches = (newVal) => {
      if (newVal !== loading || store.get() !== loading) {
        store.set(newVal);
      }
    };
    tick().then(() => {
      const value = cache.get(key);
      setIfNotMatches(value);
    });
    await tick();
    const last = _lastFetch.get(key);
    if (last && last + dedupeTime > now) {
      return;
    }
    if (_runningFetches.has(key)) {
      return;
    }
    _lastFetch.set(key, now);
    _runningFetches.add(key);
    try {
      /* @__PURE__ */ console.log("running fetcher", key);
      const res = { data: await fetcher(...keyParts), loading: false };
      cache.set(key, res);
      /* @__PURE__ */ console.log("setting fetched value", key, res);
      setIfNotMatches(res);
      _lastFetch.set(key, getNow());
    } catch (error) {
      store.set({ error, loading: false });
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
    const fetcherStore = atom({
      loading: true
    }), settings = { ...globalSettings, ...fetcherSettings, fetcher };
    let keysInternalUnsub, prevKey, prevKeyParts, keyUnsub, keyStore;
    const evtUnsubs = [];
    onStart(fetcherStore, () => {
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
        evtUnsubs.push(events.on(1, runRefetcher));
      if (refetchOnReconnect)
        evtUnsubs.push(events.on(2, runRefetcher));
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
    onStop(fetcherStore, () => {
      keysInternalUnsub == null ? void 0 : keysInternalUnsub();
      evtUnsubs.forEach((fn) => fn());
      keyUnsub == null ? void 0 : keyUnsub();
      const int = _refetchOnInterval.get(keyInput);
      if (int)
        clearInterval(int);
    });
    return fetcherStore;
  }, createMutatorStore = (mutator) => {
  };
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
    __unsafeOverruleSettings
  ];
};
const getKeyStore = (keys) => {
  let keyStore = atom(null), keyParts = [];
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
const isServer = typeof window !== "undefined";
const subscribe = (name, fn) => {
  if (!isServer || process.env.NODE_ENV === "test") {
    addEventListener(name, fn);
  }
};
const getNow = () => new Date().getTime();
const tick = () => new Promise((r) => r());
const loading = Object.freeze({ loading: true });
export {
  nanofetch
};
