import {
  atom,
  map,
  MapStore,
  onStart,
  onStop,
  ReadableAtom,
  startTask,
  batched,
  StoreValue,
} from "nanostores";
import { createNanoEvents } from "nanoevents";
import { PlatformCompat } from "./platforms/type";

type Fn = () => void;

type NoKey = null | undefined | void | false;
type SomeKey = string | number | true;
export type KeyInput =
  | SomeKey
  | Array<SomeKey | ReadableAtom<SomeKey | NoKey> | FetcherStore>;

type Key = string;
type KeyParts = SomeKey[];
export type KeySelector = Key | Key[] | ((key: Key) => boolean);

export type Fetcher<T> = (...args: KeyParts) => Promise<T>;

export type OnErrorRetry = (opts: {
  error: unknown;
  key: Key;
  retryCount: number;
}) => number | void | false | null | undefined;

type EventTypes = { onError?: (error: unknown) => void };
type RefetchSettings = {
  dedupeTime?: number;
  revalidateOnFocus?: boolean;
  revalidateOnReconnect?: boolean;
  revalidateInterval?: number;
  cacheLifetime?: number;
  onErrorRetry?: OnErrorRetry | null | false;
};
export type CommonSettings<T = unknown> = {
  fetcher?: Fetcher<T>;
} & RefetchSettings &
  EventTypes;

export type NanoqueryArgs = {
  cache?: Map<
    Key,
    {
      data?: unknown;
      error?: unknown;
      retryCount?: number;
      created?: number;
      expires?: number;
    }
  >;
} & CommonSettings;

export type FetcherValue<T = any, E = Error> = {
  data?: T;
  error?: E;
  loading: boolean;

  promise?: Promise<T>;
};

export type FetcherStore<T = any, E = any> = MapStore<FetcherValue<T, E>> & {
  _: Symbol;
  key?: Key;
  // Signature accepts anything, but doesn't use it. It's a simplification for
  // cases where you pass this function directly to promise resolvers, event handlers, etc.
  invalidate: (...args: any[]) => void;
  revalidate: (...args: any[]) => void;
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
  invalidate: (key: KeySelector) => void;
  revalidate: (key: KeySelector) => void;
  getCacheUpdater: <T = unknown>(
    key: Key,
    shouldRevalidate?: boolean
  ) => [(newValue?: T) => void, T | undefined];
}) => Promise<Result>;
export type MutateCb<Data, Result = unknown> = Data extends void
  ? () => Promise<Result>
  : (data: Data) => Promise<Result>;
export type MutatorStore<Data = void, Result = unknown, E = Error> = MapStore<{
  mutate: MutateCb<Data, Result>;
  data?: Result;
  loading?: boolean;
  error?: E;
}> & { mutate: MutateCb<Data, Result> };

export const nanoqueryFactory = ([
  isAppVisible,
  visibilityChangeSubscribe,
  reconnectChangeSubscribe,
]: PlatformCompat) => {
  const nanoquery = ({
    cache = new Map(),
    fetcher: globalFetcher,
    ...globalSettings
  }: NanoqueryArgs = {}) => {
    const events = createNanoEvents<Events>();
    let focus = true;
    visibilityChangeSubscribe(() => {
      focus = isAppVisible();
      focus && events.emit(FOCUS);
    });
    reconnectChangeSubscribe(() => events.emit(RECONNECT));

    // Leaving separate entities for these.
    // Intervals are useless for serializing, promises are not serializable at all
    const _revalidateOnInterval = new Map<KeyInput, number>(),
      _errorInvalidateTimeouts = new Map<Key, number>(),
      _runningFetches = new Map<Key, Promise<any>>();

    // Used for testing to have the highest say in settings hierarchy
    let rewrittenSettings: CommonSettings = {};

    const getCachedValueByKey = (key: Key) => {
      const fromCache = cache.get(key);
      if (!fromCache) return [];

      // Handling cache lifetime
      // Unsetting stale cache or setting fresh cache
      const cacheHit = (fromCache.expires || 0) > getNow();
      return cacheHit ? [fromCache.data, fromCache.error] : [];
    };

    const runFetcher = async (
      [key, keyParts]: [Key, KeyParts],
      store: PrivateFetcherStore,
      settings: CommonSettings
    ) => {
      if (!focus) return;

      const set = (v: FetcherValue) => {
        if (store.key === key) {
          console.log(`[${key}] setting to ${v}`);
          store.set(v);
          events.emit(SET_CACHE, key, v, true);
        }
      };
      const setAsLoading = (prev?: any) => {
        console.log(`[${key}] marking as loading; prev value:`, prev);
        const toSet = prev === undefined ? {} : { data: prev };
        set({
          ...toSet,
          ...loading,
          promise: _runningFetches.get(key),
        });
      };

      let {
        dedupeTime = 4000,
        cacheLifetime = Infinity,
        fetcher,
        onErrorRetry = defaultOnErrorRetry,
      } = {
        ...settings,
        ...rewrittenSettings,
      };
      if (cacheLifetime < dedupeTime) cacheLifetime = dedupeTime;

      const now = getNow();

      if (_runningFetches.has(key)) {
        // Do not run fetcher for the same key if previous one hasn't finished yet
        // Remember: we can have many fetcher stores pointing to the same key
        console.log(`[${key}] already runs, breaking`);
        if (!store.value.loading) setAsLoading(getCachedValueByKey(key)[0]);
        return;
      }

      let cachedValue: any | void, cachedError: any | void;
      const fromCache = cache.get(key);
      console.log(`[${key}] from cache:`, fromCache);

      if (fromCache?.data !== void 0 || fromCache?.error) {
        [cachedValue, cachedError] = getCachedValueByKey(key);

        console.log(`[${key}] cached value:`, cachedValue);
        console.log(`[${key}] cached error:`, cachedError);

        // Handling request deduplication
        if ((fromCache.created || 0) + dedupeTime > now) {
          console.log(`[${key}]: deduped`);
          // Preventing excessive store updates
          if (
            store.value.data != cachedValue ||
            store.value.error != cachedError
          ) {
            set({ ...notLoading, data: cachedValue, error: cachedError });
          }
          return;
        }
      }

      const finishTask = startTask();
      try {
        // Clearing timeout, because this fetcher could have been triggered earlier, say,
        // if you have `revalidateOnInterval` below error retry timeout.
        clearTimeout(_errorInvalidateTimeouts.get(key));

        console.log(`[${key}] running fetcher`);
        const promise = fetcher!(...keyParts);
        _runningFetches.set(key, promise);
        setAsLoading(cachedValue);
        const res = await promise;
        cache.set(key, {
          data: res,
          created: getNow(),
          expires: getNow() + cacheLifetime,
        });
        set({ data: res, ...notLoading });
      } catch (error: any) {
        settings.onError?.(error);

        const retryCount = (cache.get(key)?.retryCount || 0) + 1;
        cache.set(key, {
          error,
          created: getNow(),
          expires: getNow() + cacheLifetime,
          retryCount,
        });

        if (onErrorRetry) {
          const timer = onErrorRetry({
            error,
            key,
            retryCount,
          });
          if (timer)
            _errorInvalidateTimeouts.set(
              key,
              setTimeout(() => invalidateKeys(key), timer) as unknown as number
            );
        }
        set({ data: store.value.data, error, ...notLoading });
      } finally {
        finishTask();
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
          ...notLoading,
        }),
        settings = { ...globalSettings, ...fetcherSettings, fetcher };

      fetcherStore._ = fetcherSymbol;
      fetcherStore.invalidate = () => {
        const { key } = fetcherStore;
        if (key) {
          invalidateKeys(key);
        }
      };
      fetcherStore.revalidate = () => {
        const { key } = fetcherStore;
        if (key) {
          revalidateKeys(key);
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
            fetcherStore.set({ ...notLoading });
          }
        });

        const currentKeyValue = keyStore.get();
        if (currentKeyValue) {
          [prevKey, prevKeyParts] = currentKeyValue;
          if (firstRun) handleNewListener();
        }

        const {
          revalidateInterval = 0,
          revalidateOnFocus,
          revalidateOnReconnect,
        } = settings;
        const runRefetcher = () => {
          console.log(`[${prevKey}] running refetcher`);
          if (prevKey)
            runFetcher([prevKey, prevKeyParts!], fetcherStore, settings);
        };

        if (revalidateInterval > 0) {
          _revalidateOnInterval.set(
            keyInput,
            setInterval(runRefetcher, revalidateInterval) as unknown as number
          );
        }
        if (revalidateOnFocus) evtUnsubs.push(events.on(FOCUS, runRefetcher));
        if (revalidateOnReconnect)
          evtUnsubs.push(events.on(RECONNECT, runRefetcher));

        const cacheKeyChangeHandler = (keySelector: KeySelector) => {
          if (prevKey && testKeyAgainstSelector(prevKey, keySelector)) {
            runFetcher([prevKey, prevKeyParts!], fetcherStore, settings);
          }
        };

        evtUnsubs.push(
          events.on(INVALIDATE_KEYS, cacheKeyChangeHandler),
          events.on(REVALIDATE_KEYS, cacheKeyChangeHandler),
          events.on(SET_CACHE, (keySelector, data, full) => {
            console.log(`[${keySelector}] setting cache: `, data);
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

      // Replicating the behavior of .subscribe
      const originListen = fetcherStore.listen;
      fetcherStore.listen = (listener: any) => {
        const unsub = originListen(listener);
        listener(fetcherStore.value);
        handleNewListener();
        return unsub;
      };

      onStop(fetcherStore, () => {
        fetcherStore.value = { ...notLoading };
        keysInternalUnsub?.();
        evtUnsubs.forEach((fn) => fn());
        evtUnsubs = [];
        keyUnsub?.();
        clearInterval(_revalidateOnInterval.get(keyInput));
      });

      return fetcherStore as FetcherStore<T, E>;
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
      iterOverCache(keySelector, (key) => {
        cache.delete(key);
        console.log(`[${key}] nuking key`);
      });
      events.emit(INVALIDATE_KEYS, keySelector);
    };
    const revalidateKeys = (keySelector: KeySelector) => {
      console.log(`[${keySelector}] revalidating`);
      iterOverCache(keySelector, (key) => {
        const cached = cache.get(key);
        if (cached) {
          cache.set(key, { ...cached, created: -Infinity });
          console.log(`[${key}] setting key to revalidate`);
        }
      });
      events.emit(REVALIDATE_KEYS, keySelector);
    };
    const mutateCache = (keySelector: KeySelector, data?: unknown) => {
      iterOverCache(keySelector, (key) => {
        if (data === void 0) cache.delete(key);
        else {
          cache.set(key, {
            data,
            created: getNow(),
            expires: getNow() + (globalSettings.cacheLifetime ?? 8000),
          });
        }
      });

      events.emit(SET_CACHE, keySelector, data);
    };

    function createMutatorStore<Data = void, Result = unknown, E = any>(
      mutator: ManualMutator<Data, Result>,
      opts?: { throttleCalls?: boolean; onError?: EventTypes["onError"] }
    ): MutatorStore<Data, Result, E> {
      const { throttleCalls, onError } = opts ?? {
        throttleCalls: true,
        onError: globalSettings?.onError,
      };

      const mutate = async (data: Data) => {
        // Adding extremely basic client-side throttling
        // Calling mutate function multiple times before previous call resolved will result
        // in void return.
        if (throttleCalls && store.value?.loading) return;

        const newMutator = (rewrittenSettings.fetcher ??
          mutator) as ManualMutator<Data, Result>;
        const keysToInvalidate: KeySelector[] = [],
          keysToRevalidate: KeySelector[] = [];

        const safeKeySet = <K extends keyof StoreValue<typeof store>>(
          k: K,
          v: StoreValue<typeof store>[K]
        ) => {
          // If you already have unsubscribed from this mutation store, we do not
          // want to overwrite the default unset value. We just let the set values to
          // be forgotten forever.
          if (store.lc) {
            store.setKey(k, v);
          }
        };
        try {
          store.set({
            error: void 0,
            data: void 0,
            mutate: mutate as MutateCb<Data, Result>,
            ...loading,
          });
          const result = await newMutator({
            data,
            invalidate: (key: KeySelector) => {
              // We automatically postpone key invalidation up until mutator is run
              keysToInvalidate.push(key);
            },
            revalidate: (key: KeySelector) => {
              // We automatically postpone key invalidation up until mutator is run
              keysToRevalidate.push(key);
            },
            getCacheUpdater: <T = unknown>(
              key: Key,
              shouldRevalidate = true
            ) => [
              (newVal?: T) => {
                mutateCache(key, newVal);
                if (shouldRevalidate) {
                  keysToRevalidate.push(key);
                }
              },
              cache.get(key)?.data as T | undefined,
            ],
          });
          safeKeySet("data", result as Result);
          return result;
        } catch (error) {
          onError?.(error);
          safeKeySet("error", error as E);
          store.setKey("error", error as E);
        } finally {
          safeKeySet("loading", false);
          // We do not catch it because it's caught in `wrapMutator`.
          // But we still invalidate all keys that were invalidated during running manual
          // mutator.
          keysToInvalidate.forEach(invalidateKeys);
          keysToRevalidate.forEach(revalidateKeys);
        }
      };
      const store: MutatorStore<Data, Result, E> = map({
        mutate: mutate as MutateCb<Data, Result>,
        ...notLoading,
      });
      onStop(store, () =>
        store.set({ mutate: mutate as MutateCb<Data, Result>, ...notLoading })
      );
      store.mutate = mutate as MutateCb<Data, Result>;
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
      { __unsafeOverruleSettings, invalidateKeys, revalidateKeys, mutateCache },
    ] as const;
  };

  function isSomeKey(key: unknown): key is SomeKey {
    return typeof key === "string" || typeof key === "number" || key === true;
  }

  /**
   * Transforming the input keys into a reactive store.
   * Basically creates a single store out of `['/api/v1/', $postId]`.
   */
  const getKeyStore = (keys: KeyInput) => {
    if (isSomeKey(keys))
      return [
        atom(["" + keys, [keys] as SomeKey[]] as const),
        () => {},
      ] as const;

    /*
    Idea is simple:
    1. we split incoming key array into parts. Every "stable" key (not an atom) gets there
    immediately and basically is immutable.
    2. all atom-based keys are fed into a `batched` store. We subscribe to it and push the
    values into appropriate indexes into `keyParts`.
    */
    const keyParts: (SomeKey | NoKey)[] = [];
    const $key = atom<[Key, KeyParts] | null>(null);

    const keysAsStoresToIndexes = new Map<
      ReadableAtom<SomeKey | NoKey> | FetcherStore,
      number
    >();

    const setKeyStoreValue = () => {
      if (keyParts.some((v) => v === null || v === void 0 || v === false)) {
        $key.set(null);
      } else {
        $key.set([keyParts.join(""), keyParts as KeyParts]);
      }
    };

    for (let i = 0; i < keys.length; i++) {
      const keyOrStore = keys[i];
      if (isSomeKey(keyOrStore)) {
        keyParts.push(keyOrStore);
      } else {
        keyParts.push(null);
        keysAsStoresToIndexes.set(keyOrStore, i);
      }
    }

    const storesAsArray = [...keysAsStoresToIndexes.keys()];
    const $storeKeys = batched(storesAsArray, (...storeValues) => {
      for (let i = 0; i < storeValues.length; i++) {
        const store = storesAsArray[i],
          partIndex = keysAsStoresToIndexes.get(store) as number;

        keyParts[partIndex] =
          (store as any)._ === fetcherSymbol
            ? store.value && "data" in (store as FetcherStore).value!
              ? (store as FetcherStore).key
              : null
            : (storeValues[i] as SomeKey | NoKey);
      }

      setKeyStoreValue();
    });

    setKeyStoreValue();

    return [$key, $storeKeys.subscribe(noop)] as const;
  };

  /**
   * This piece of shenanigans is copy-pasted from SWR. God be my witness I don't like
   * all this bitwise shifting operations as they are absolutely unclear, but I'm
   * ok to compact the code a bit.
   */
  function defaultOnErrorRetry({ retryCount }: { retryCount: number }) {
    return (
      ~~((Math.random() + 0.5) * (1 << (retryCount < 8 ? retryCount : 8))) *
      2000
    );
  }

  function noop() {}

  const FOCUS = 1,
    RECONNECT = 2,
    INVALIDATE_KEYS = 3,
    REVALIDATE_KEYS = 4,
    SET_CACHE = 5;

  type Events = {
    [FOCUS]: Fn;
    [RECONNECT]: Fn;
    [INVALIDATE_KEYS]: (keySelector: KeySelector) => void;
    [REVALIDATE_KEYS]: (keySelector: KeySelector) => void;
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

  const testKeyAgainstSelector = (key: Key, selector: KeySelector): boolean => {
    if (Array.isArray(selector)) return selector.includes(key);
    else if (typeof selector === "function") return selector(key);
    else return key === selector;
  };

  const getNow = () => new Date().getTime();

  const fetcherSymbol = Symbol();

  const loading = { loading: true },
    notLoading = { loading: false };

  return nanoquery;
};
