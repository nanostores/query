import { atom, onStart, onStop, ReadableAtom, WritableAtom } from "nanostores";

type MaybePromise<T> = T | Promise<T>;

export type KeyInput = Array<string | ReadableAtom<string | null>>;

type Key = string;
type KeyParts = Key[];

export type Fetcher<T> = (...args: KeyParts) => MaybePromise<T>;
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
  cache?: Map<string, any>;
} & CommonSettings;

export type FetcherValue<T = any, E = Error> = {
  data?: T;
  error?: E;
  loading: boolean;
};

export type FetcherStore<T = any, E = Error> = WritableAtom<FetcherValue<T, E>>;
export type FetcherStoreCreator<T = any, E = Error> = (
  keys: KeyInput,
  settings?: CommonSettings<T>
) => FetcherStore<T, E>;

export const nanofetch = ({
  cache = new Map(),
  fetcher: globalFetcher,
  ...globalSettings
}: NanofetchArgs = {}) => {
  const _refetchOnFocus = new Set<Key>(),
    _refetchOnReconnect = new Set<Key>(),
    _refetchOnInterval = new Map<Key, number>(),
    _lastFetch = new Map<Key, number>(),
    _runningFetches = new Set<Key>();

  // Used for testing to have the highest say in settings hierarchy
  let rewrittenSettings: CommonSettings = {};

  const runFetcher = async (
    [key, keyParts]: [Key, KeyParts],
    store: FetcherStore,
    settings: CommonSettings
  ) => {
    const {
      dedupeTime = 4000,
      fetcher,
      refetchOnFocus,
      refetchOnReconnect,
      refetchInterval,
    } = { ...settings, ...rewrittenSettings };

    const now = getNow();

    if (refetchOnFocus) _refetchOnFocus.add(key);
    if (refetchOnReconnect) _refetchOnReconnect.add(key);
    if (refetchInterval && !_refetchOnInterval.has(key)) {
      _refetchOnInterval.set(
        key,
        setInterval(
          () => runFetcher([key, keyParts], store, settings),
          refetchInterval
        ) as unknown as number
      );
    }

    const last = _lastFetch.get(key);
    if (last && last + dedupeTime > now) {
      // Deduping the request: it's been sent not so long ago
      return;
    }
    if (_runningFetches.has(key)) {
      // Do not run the same fetcher if previous one hasn't finished yet
      return;
    }

    _lastFetch.set(key, now);
    _runningFetches.add(key);

    try {
      const res = { data: await fetcher!(...keyParts), loading: false };
      cache.set(key, res);
      store.set(res);
      _lastFetch.set(key, getNow());
    } catch (error: any) {
      store.set({ error, loading: false });
    } finally {
      _runningFetches.delete(key);
    }
  };

  const handleRequestUnmount = (key?: Key) => {
    if (!key) return;

    _refetchOnFocus.delete(key);
    _refetchOnReconnect.delete(key);
    clearInterval(_refetchOnInterval.get(key));
  };
  const handleStoreKeysChange = (
    [key, keyParts]: [Key, KeyParts],
    store: FetcherStore,
    settings: CommonSettings
  ) => {
    if (!cache.has(key)) {
      const loadingState = { loading: true };
      cache.set(key, loadingState);
    }
    // Waiting for a tick to happen, otherwise value isn't propagated to `.listen`
    callAfterTick(() => store.set(cache.get(key)));

    runFetcher([key, keyParts], store, settings);
  };

  const createFetcherStore = <T = unknown, E = any>(
      keys: KeyInput,
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

      const fetcherStore: FetcherStore<T> = atom({ loading: true }),
        settings = { ...globalSettings, ...fetcherSettings, fetcher };

      let keysInternalUnsub: () => void,
        prevKey: Key | undefined,
        prevKeyParts: KeyParts | undefined,
        keyUnsub: () => void,
        keyStore: ReturnType<typeof getKeyStore>[0];

      onStart(fetcherStore, () => {
        const firstRun = !keysInternalUnsub;
        [keyStore, keysInternalUnsub] = getKeyStore(keys);
        keyUnsub = keyStore.listen((currentKeys) => {
          handleRequestUnmount(prevKey);

          if (currentKeys) {
            const [newKey, keyParts] = currentKeys;
            handleRequestUnmount(prevKey);
            handleStoreKeysChange([newKey, keyParts], fetcherStore, settings);
            prevKey = newKey;
            prevKeyParts = keyParts;
          }
        });

        const currentKeyValue = keyStore.get();
        if (currentKeyValue) {
          [prevKey, prevKeyParts] = currentKeyValue;
          if (firstRun) handleNewListener();
        } else {
          callAfterTick(() => fetcherStore.set({ loading: true }));
        }
      });

      const handleNewListener = () => {
        if (prevKey && prevKeyParts)
          handleStoreKeysChange(
            [prevKey, prevKeyParts],
            fetcherStore,
            settings
          );
      };

      const originListen = fetcherStore.listen;
      fetcherStore.listen = (listener) => {
        handleNewListener();
        return originListen(listener);
      };

      onStop(fetcherStore, () => {
        keysInternalUnsub();
        keyUnsub();
        handleRequestUnmount(prevKey);
      });

      return fetcherStore as FetcherStore<T, E>;
    },
    createMutatorStore = (mutator: any) => {
      // TODO
    };

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

  const unsubs: Array<() => void> = [];

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

const getNow = () => new Date().getTime();

const callAfterTick = (fn: () => void) => setTimeout(fn);
