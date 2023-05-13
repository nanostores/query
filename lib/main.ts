import { atom, map, MapStore, onStart, onStop, ReadableAtom } from "nanostores";
import { createNanoEvents } from "nanoevents";

type Fn = () => void;

export type KeyInput =
  | string
  | Array<string | ReadableAtom<string | null | undefined>>;

type Key = string;
type KeyParts = string[];
type KeySelector = Key | Key[] | ((key: Key) => boolean);

export type Fetcher<T> = (...args: KeyParts) => Promise<T>;

type EventTypes = { onError?: (error: any) => unknown };
type RefetchSettings = {
  dedupeTime?: number;
  refetchOnFocus?: boolean;
  refetchOnReconnect?: boolean;
  refetchInterval?: number;
};
type CommonSettings<T = unknown> = {
  fetcher?: Fetcher<T>;
} & RefetchSettings &
  EventTypes;

type NanoqueryArgs = {
  cache?: Map<Key, any>;
} & CommonSettings;

export type FetcherValue<T = any, E = Error> = {
  data?: T;
  error?: E;
  loading: boolean;

  promise?: Promise<T>;
};

export type FetcherStore<T = any, E = any> = MapStore<FetcherValue<T, E>> & {
  key?: string;
  invalidate: (...args: any[]) => void;
  mutate: (data?: T) => void;
};
type PrivateFetcherStore<T = any, E = any> = FetcherStore<T, E> & {
  value: FetcherValue<T, E>;
};
export type FetcherStoreCreator<T = any, E = Error> = (
  keys: KeyInput,
  settings?: CommonSettings<T>
) => FetcherStore<T, E>;

export type ManualMutator<Data = void, Result = unknown> = (args: {
  data: Data;
  invalidate: (key: Key) => void;
  getCacheUpdater: <T = unknown>(
    key: Key,
    shouldRevalidate?: boolean
  ) => [(newValue?: T) => void, T | undefined];
}) => Promise<Result>;
type MutateCb<Data> = Data extends void
  ? () => Promise<unknown>
  : (data: Data) => Promise<unknown>;
export type MutatorStore<Data = void, Result = unknown, E = Error> = MapStore<{
  mutate: MutateCb<Data>;
  data?: Result;
  loading?: boolean;
  error?: E;
}>;

export const nanoquery = ({
  cache = new Map(),
  fetcher: globalFetcher,
  ...globalSettings
}: NanoqueryArgs = {}) => {
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
    _runningFetches = new Set<Key>();

  // Used for testing to have the highest say in settings hierarchy
  let rewrittenSettings: CommonSettings = {};

  const runFetcher = async (
    [key, keyParts]: [Key, KeyParts],
    store: PrivateFetcherStore,
    settings: CommonSettings,
    force?: true
  ) => {
    if (!focus) return;

    const isKeyStillSame = () => store.key === key;

    const set = (v: FetcherValue) => {
        if (isKeyStillSame()) {
          console.log(`setting to ${v}`);
          store.set(v);
          events.emit(SET_CACHE, key, v, true);
        }
      },
      setKey = <K extends keyof FetcherValue>(k: K, v: FetcherValue[K]) => {
        if (isKeyStillSame()) {
          console.log(`setting ${k} to ${v}`);
          store.setKey(k, v);
        }
      };

    const { dedupeTime = 4000, fetcher } = {
      ...settings,
      ...rewrittenSettings,
    };

    const now = getNow();

    if (!force) {
      const cached = cache.get(key);
      // Prevent exessive store updates
      if (store.value.data !== cached)
        set(cached ? { data: cached, ...notLoading } : { ...loading });

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
      const promise = fetcher!(...keyParts);
      setKey("promise", promise);
      const res = await promise;
      cache.set(key, res);
      set({ data: res, ...notLoading });
      _lastFetch.set(key, getNow());
    } catch (error: any) {
      // Possibly preserving previous cache
      settings.onError?.(error);
      set({ data: store.value.data, error, ...notLoading });
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

    const fetcherStore: PrivateFetcherStore<T> = map({
        ...loading,
      }),
      settings = { ...globalSettings, ...fetcherSettings, fetcher };

    fetcherStore.invalidate = () => {
      const { key } = fetcherStore;
      if (key) {
        invalidateKeys(key);
      }
    };
    fetcherStore.mutate = (data) => {
      const { key } = fetcherStore;
      if (key) {
        mutateCache(key, data);
      }
    };

    let keysInternalUnsub: Fn,
      prevKey: Key | undefined,
      prevKeyParts: KeyParts | undefined,
      keyUnsub: Fn,
      keyStore: ReturnType<typeof getKeyStore>[0];

    let evtUnsubs: Fn[] = [];

    onStart(fetcherStore, () => {
      const firstRun = !keysInternalUnsub;
      [keyStore, keysInternalUnsub] = getKeyStore(keyInput);
      keyUnsub = keyStore.subscribe((currentKeys) => {
        if (currentKeys) {
          const [newKey, keyParts] = currentKeys;
          fetcherStore.key = newKey;
          runFetcher([newKey, keyParts], fetcherStore, settings);
          prevKey = newKey;
          prevKeyParts = keyParts;
        } else {
          fetcherStore.key = prevKey = prevKeyParts = void 0;
        }
      });

      const currentKeyValue = keyStore.get();
      if (currentKeyValue) {
        [prevKey, prevKeyParts] = currentKeyValue;
        if (firstRun) handleNewListener();
      } else {
        if (firstRun) fetcherStore.set({ ...notLoading });
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

      evtUnsubs.push(
        events.on(INVALIDATE_KEYS, (keySelector) => {
          if (prevKey && testKeyAgainstSelector(prevKey, keySelector)) {
            runFetcher([prevKey, prevKeyParts!], fetcherStore, settings, true);
          }
        }),
        events.on(SET_CACHE, (keySelector, data, full) => {
          if (
            prevKey &&
            testKeyAgainstSelector(prevKey, keySelector) &&
            fetcherStore.value !== data &&
            fetcherStore.value.data !== data
          ) {
            fetcherStore.set(
              (full ? data : { data, ...notLoading }) as FetcherValue<T>
            );
          }
        })
      );
    });

    const handleNewListener = () => {
      if (prevKey && prevKeyParts)
        runFetcher([prevKey, prevKeyParts], fetcherStore, settings);
    };

    const newImplFactory =
      (origin: typeof fetcherStore.subscribe) => (listener: any) => {
        handleNewListener();
        return origin(listener);
      };
    fetcherStore.listen = newImplFactory(fetcherStore.listen);
    fetcherStore.subscribe = newImplFactory(fetcherStore.subscribe);

    onStop(fetcherStore, () => {
      fetcherStore.value = { ...notLoading };
      keysInternalUnsub?.();
      evtUnsubs.forEach((fn) => fn());
      evtUnsubs = [];
      keyUnsub?.();
      const int = _refetchOnInterval.get(keyInput);
      if (int) clearInterval(int);
    });

    return fetcherStore as FetcherStore<T, E>;
  };

  const nukeKey = (key: string) => {
    cache.delete(key);
    _lastFetch.delete(key);

    console.log("Nuking key", key);
  };
  const iterOverCache = (
    keySelector: KeySelector,
    cb: (key: string) => void
  ) => {
    for (const key of cache.keys()) {
      if (testKeyAgainstSelector(key, keySelector)) cb(key);
    }
  };
  const invalidateKeys = (keySelector: KeySelector) => {
    iterOverCache(keySelector, nukeKey);
    events.emit(INVALIDATE_KEYS, keySelector);
  };
  const mutateCache = (keySelector: KeySelector, data?: unknown) => {
    iterOverCache(keySelector, (key) => {
      if (data === void 0) nukeKey(key);
      else cache.set(key, data);
    });

    events.emit(SET_CACHE, keySelector, data);
  };

  function createMutatorStore<Data = void, Result = unknown, E = any>(
    mutator: ManualMutator<Data, Result>
  ): MutatorStore<Data, Result, E> {
    const mutate = async (data: Data) => {
      const newMutator = (rewrittenSettings.fetcher ??
        mutator) as ManualMutator<Data, Result>;
      const keysToInvalidate: Key[] = [];
      try {
        store.set({
          error: void 0,
          data: void 0,
          mutate: mutate as MutateCb<Data>,
          ...loading,
        });
        const result = await newMutator({
          data,
          invalidate: (key: Key) => {
            // We automatically postpone key invalidation up until mutator is run
            keysToInvalidate.push(key);
          },
          getCacheUpdater: <T = unknown>(key: Key, shouldInvalidate = true) => [
            (newVal?: T) => {
              mutateCache(key, newVal);
              if (shouldInvalidate) {
                keysToInvalidate.push(key);
              }
            },
            cache.get(key) as T | undefined,
          ],
        });
        store.setKey("data", result as Result);
        return result;
      } catch (error) {
        globalSettings?.onError?.(error);
        store.setKey("error", error as E);
      } finally {
        store.setKey("loading", false);
        // We do not catch it because it's caught in `wrapMutator`.
        // But we still invalidate all keys that were invalidated during running manual
        // mutator.
        invalidateKeys(keysToInvalidate);
      }
    };
    const store: MutatorStore<Data, Result, E> = map({
      mutate: mutate as MutateCb<Data>,
      ...notLoading,
    });
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
    { __unsafeOverruleSettings, invalidateKeys, mutateCache },
  ] as const;
};

const getKeyStore = (keys: KeyInput) => {
  if (typeof keys === "string")
    return [atom([keys, [keys] as string[]] as const), () => {}] as const;

  let keyStore = atom<[Key, KeyParts] | null>(null),
    keyParts: Array<string | null | undefined> = [];

  const setKeyStoreValue = () => {
    if (keyParts.some((v) => v === null || v === void 0)) {
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
    unsubs.push(
      key.subscribe((newValue) => {
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
  SET_CACHE = 4;

type Events = {
  [FOCUS]: Fn;
  [RECONNECT]: Fn;
  [INVALIDATE_KEYS]: (keySelector: KeySelector) => void;
  /**
   * @param value The new value. It can either be the full FetcherValue with `loading`, `error` and
   * so on, or it can be the `data` argument only. This is controlled by the `full` argument
   * @returns
   */
  [SET_CACHE]: (
    keySelector: KeySelector,
    value?: unknown,
    full?: boolean
  ) => void;
};

const subscribe = (name: string, fn: Fn) => {
  const isServer = typeof window === "undefined";
  if (!isServer) {
    addEventListener(name, fn);
  }
};

const testKeyAgainstSelector = (key: Key, selector: KeySelector): boolean => {
  if (Array.isArray(selector)) return selector.includes(key);
  else if (typeof selector === "function") return selector(key);
  else return key === selector;
};

const getNow = () => new Date().getTime();

const loading = { loading: true },
  notLoading = { loading: false };
