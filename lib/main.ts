import { atom, map, MapStore, onStart, onStop, ReadableAtom } from "nanostores";
import { createNanoEvents } from "nanoevents";

type Fn = () => void;

export type KeyInput = Array<string | ReadableAtom<string | null>>;

type Key = string;
type KeyParts = Key[];

export type Fetcher<T> = (...args: KeyParts) => Promise<T>;
type RefetchSettings = {
  dedupeTime?: number;
  refetchOnFocus?: boolean;
  refetchOnReconnect?: boolean;
  refetchInterval?: number;
};
type CommonSettings<T = unknown> = {
  fetcher?: Fetcher<T>;
} & RefetchSettings;

type NanofetchArgs = {
  cache?: Map<Key, any>;
} & CommonSettings;

export type FetcherValue<T = any, E = Error> = {
  data?: T;
  error?: E;
  loading: boolean;
};

export type FetcherStore<T = any, E = any> = MapStore<FetcherValue<T, E>>;
export type FetcherStoreCreator<T = any, E = Error> = (
  keys: KeyInput,
  settings?: CommonSettings<T>
) => FetcherStore<T, E>;

export type AutoMutator<T = unknown> = (data: T) => Promise<unknown>;
export type ManualMutator<T = unknown> = (args: {
  data: T;
  invalidate: (keys: Key[]) => void;
  getCacheUpdater: (key: Key) => [(newValue: unknown) => void, unknown?];
}) => Promise<unknown>;
export type MutatorStore<T = unknown, E = Error> = MapStore<{
  mutate: (data: T) => Promise<void>;
  loading?: boolean;
  error?: E;
}>;

export const nanofetch = ({
  cache = new Map(),
  fetcher: globalFetcher,
  ...globalSettings
}: NanofetchArgs = {}) => {
  const events = createNanoEvents<Events>();
  let focus = true;
  subscribe("focus", () => {
    focus = true;
    events.emit(FOCUS);
  });
  subscribe("blur", () => (focus = false));
  subscribe("online", () => events.emit(RECONNECT));

  const _refetchOnInterval = new Map<KeyInput, number>(),
    _lastFetch = new Map<Key, number>(),
    _runningFetches = new Set<Key>(),
    _latestStoreKey = new Map<FetcherStore, Key>();

  // Used for testing to have the highest say in settings hierarchy
  let rewrittenSettings: CommonSettings = {};

  const runFetcher = async (
    [key, keyParts]: [Key, KeyParts],
    store: FetcherStore,
    settings: CommonSettings,
    force?: true
  ) => {
    _latestStoreKey.set(store, key);
    const isKeyStillSame = () => _latestStoreKey.get(store) === key;
    const set = (v: FetcherValue) => {
        if (isKeyStillSame()) {
          console.log(`setting to ${v}`);
          store.set(v);
        }
      },
      setKey = <K extends keyof FetcherValue>(k: K, v: FetcherValue[K]) => {
        if (isKeyStillSame()) {
          console.log(`setting ${k} to ${v}`);
          store.setKey(k, v);
        }
      };

    if (!focus) return;

    const { dedupeTime = 4000, fetcher } = {
      ...settings,
      ...rewrittenSettings,
    };

    const now = getNow();

    if (!force) {
      // Calling it after tick, because otherwise it won't be propagated to .listen
      tick().then(() => {
        const value = cache.get(key) ?? loading;
        set(value);
      });
      await tick();

      const last = _lastFetch.get(key);
      if (last && last + dedupeTime > now) {
        // Deduping the request: it's been sent not so long ago
        console.log("deduped", key);
        return;
      }
    }
    if (_runningFetches.has(key)) {
      console.log("already runs", key);
      // Do not run the same fetcher if previous one hasn't finished yet
      return;
    }

    _lastFetch.set(key, now);
    _runningFetches.add(key);

    setKey("loading", true);

    try {
      console.log("running fetcher", key);
      const res = { data: await fetcher!(...keyParts), loading: false };
      cache.set(key, res);
      set(res);
      _lastFetch.set(key, getNow());
    } catch (error: any) {
      set({ error, loading: false });
    } finally {
      _runningFetches.delete(key);
    }
  };

  const createFetcherStore = <T = unknown, E = any>(
    keyInput: KeyInput,
    {
      fetcher = globalFetcher as Fetcher<T>,
      ...fetcherSettings
    }: CommonSettings<T> = {}
  ): FetcherStore<T, E> => {
    if (process.env.NODE_ENV !== "production" && !fetcher) {
      throw new Error(
        "You need to set up either global fetcher of fetcher in createFetcherStore"
      );
    }

    const fetcherStore: FetcherStore<T> = map({
        loading: true,
      }),
      settings = { ...globalSettings, ...fetcherSettings, fetcher };

    let keysInternalUnsub: Fn,
      prevKey: Key | undefined,
      prevKeyParts: KeyParts | undefined,
      keyUnsub: Fn,
      keyStore: ReturnType<typeof getKeyStore>[0];

    const evtUnsubs: Fn[] = [];

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
        if (firstRun) handleNewListener();
      } else {
        // Initial value when one of the keys is null
        tick().then(() => fetcherStore.set(loading));
      }

      const {
        refetchInterval = 0,
        refetchOnFocus,
        refetchOnReconnect,
      } = settings;
      const runRefetcher = () => {
        console.log("running refetcher", prevKey);
        if (prevKey)
          runFetcher([prevKey, prevKeyParts!], fetcherStore, settings);
      };

      if (refetchInterval > 0) {
        _refetchOnInterval.set(
          keyInput,
          setInterval(runRefetcher, refetchInterval) as unknown as number
        );
      }
      if (refetchOnFocus) evtUnsubs.push(events.on(FOCUS, runRefetcher));
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

    const mutateUnsub = events.on(MUTATE_CACHE, (key, data) => {
      if (key === prevKey) {
        const curr = cache.get(key);
        const newState = { ...curr, data };
        cache.set(key, newState);
        fetcherStore.set(newState);
      }
    });
    const invalidateUnsub = events.on(INVALIDATE_KEYS, (keys) => {
      if (prevKey && keys.includes(prevKey)) {
        runFetcher([prevKey, prevKeyParts!], fetcherStore, settings, true);
      }
    });

    onStop(fetcherStore, () => {
      mutateUnsub();
      invalidateUnsub();
      keysInternalUnsub?.();
      evtUnsubs.forEach((fn) => fn());
      keyUnsub?.();
      const int = _refetchOnInterval.get(keyInput);
      if (int) clearInterval(int);
    });

    return fetcherStore as FetcherStore<T, E>;
  };

  const invalidateKeys = (keys: Key[]) => {
    events.emit(INVALIDATE_KEYS, keys);
  };
  const mutateCache = (key: Key, data: unknown) => {
    events.emit(MUTATE_CACHE, key, data);
  };

  function createMutatorStore<T = unknown, E = Error>(
    keysToInvalidate: Key[],
    mutator: AutoMutator<T>
  ): MutatorStore<T, E>;
  function createMutatorStore<T = unknown, E = Error>(
    mutator: ManualMutator<T>
  ): MutatorStore<T, E>;
  function createMutatorStore<T = unknown, E = Error>(
    ...args: [Key[], AutoMutator<T>] | [ManualMutator<T>]
  ): MutatorStore<T, E> {
    const wrapMutator =
      (innerFn: (data: T) => Promise<unknown>) => async (data: T) => {
        try {
          store.setKey("error", void 0);
          store.setKey("loading", true);
          if (rewrittenSettings.fetcher) {
            await rewrittenSettings.fetcher(data as unknown as any);
          } else {
            await innerFn(data);
          }
        } catch (error) {
          store.setKey("error", error as E);
        } finally {
          store.setKey("loading", false);
        }
      };

    let mutate: (data: T) => Promise<void>;

    if (Array.isArray(args[0])) {
      const [keys, autoMutator] = args;
      mutate = wrapMutator(async (data) => {
        await autoMutator!(data);
        invalidateKeys(keys);
      });
    } else {
      const [manualMutator] = args;
      mutate = wrapMutator(async (data) => {
        const keysToInvalidate: Key[] = [];
        try {
          await manualMutator({
            data,
            invalidate: (keys: Key[]) => {
              // We automatically postpone key invalidation up until mutator is run
              keysToInvalidate.push(...keys);
            },
            getCacheUpdater: (key: Key) => [
              (newVal: unknown) => {
                mutateCache(key, newVal);
                // We always add this key for invalidation after everything runs
                keysToInvalidate.push(key);
              },
              cache.get(key)?.data,
            ],
          });
        } finally {
          // We do not catch it because it's caught in `wrapMutator`.
          // But we still invalidate all keys that were invalidated during running manual
          // mutator.
          invalidateKeys(keysToInvalidate);
        }
      });
    }

    const store: MutatorStore<T, E> = map({ mutate, loading: false });
    return store;
  }

  const __unsafeOverruleSettings = (data: CommonSettings) => {
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
    __unsafeOverruleSettings,
  ] as const;
};

const getKeyStore = (keys: KeyInput) => {
  let keyStore = atom<[Key, KeyParts] | null>(null),
    keyParts: Array<string | null> = [];

  const setKeyStoreValue = () => {
    if (keyParts.some((v) => v === null)) {
      keyStore.set(null);
    } else {
      keyStore.set([keyParts.join(""), keyParts as KeyParts]);
    }
  };

  const unsubs: Array<Fn> = [];

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

  return [keyStore, () => unsubs.forEach((fn) => fn())] as const;
};

const FOCUS = 1,
  RECONNECT = 2,
  INVALIDATE_KEYS = 3,
  MUTATE_CACHE = 4;

type Events = {
  [FOCUS]: Fn;
  [RECONNECT]: Fn;
  [INVALIDATE_KEYS]: (keys: Key[]) => void;
  [MUTATE_CACHE]: (key: Key, value: unknown) => void;
};

const subscribe = (name: string, fn: Fn) => {
  const isServer = typeof window === "undefined";
  if (!isServer) {
    addEventListener(name, fn);
  }
};

const getNow = () => new Date().getTime();

const tick = () => new Promise<void>((r) => r());

const loading = Object.freeze({ loading: true });
