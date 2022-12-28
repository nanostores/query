import { atom, onStart, onStop, ReadableAtom, WritableAtom } from "nanostores";

export type KeyInput = Array<string | ReadableAtom<string>>;

type KeyParts = string[];
type Key = string;

export type Fetcher = (...args: KeyParts) => Promise<any>;
type RefetchSettings = {
  dedupeTime?: number;
  refetchOnFocus?: boolean;
  refetchOnReconnect?: boolean;
  refetchInterval?: number;
};
type CommonSettings = {
  fetcher?: Fetcher;
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

  const runFetcher = (
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
    } = settings;

    const now = getNow();

    if (refetchOnFocus) _refetchOnFocus.add(key);
    if (refetchOnReconnect) _refetchOnReconnect.add(key);
    if (refetchInterval && !_refetchOnInterval.has(key)) {
      _refetchOnInterval.set(
        key,
        window.setInterval(
          () => runFetcher([key, keyParts], store, settings),
          refetchInterval
        )
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

    fetcher!(...keyParts)
      .then((r: any) => {
        const res = { data: r, loading: false };
        cache.set(key, res);
        store.set(res);
        _lastFetch.set(key, getNow());
      })
      .catch((error: any) => store.set({ error, loading: false }))
      .finally(() => _runningFetches.delete(key));
  };

  const handleRequestUnmount = (key: Key) => {
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
    setTimeout(() => store.set(cache.get(key)));

    runFetcher([key, keyParts], store, settings);
  };

  const createFetcherStore = <T = unknown>(
      keys: KeyInput,
      { fetcher = globalFetcher, ...fetcherSettings }: CommonSettings = {}
    ) => {
      if (process.env.NODE_ENV !== "production" && !fetcher) {
        throw new Error(
          "You need to set up either global fetcher of fetcher in createFetcherStore"
        );
      }

      const fetcherStore = atom() as unknown as FetcherStore<T>,
        settings = { ...globalSettings, ...fetcherSettings, fetcher };

      let keysInternalUnsub: () => void,
        prevKey: Key,
        prevKeyParts: KeyParts,
        keyUnsub: () => void;
      let keyStore: ReturnType<typeof getKeyStore>[0];

      onStart(fetcherStore, () => {
        const firstRun = !keysInternalUnsub;
        [keyStore, keysInternalUnsub] = getKeyStore(keys);
        [prevKey, prevKeyParts] = keyStore.get();
        keyUnsub = keyStore.listen(([newKey, keyParts]) => {
          handleRequestUnmount(prevKey);
          handleStoreKeysChange([newKey, keyParts], fetcherStore, settings);
          prevKey = newKey;
          prevKeyParts = keyParts;
        });
        if (firstRun) handleNewListener();
      });
      const handleNewListener = () => {
        if (prevKeyParts)
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

      return fetcherStore;
    },
    createMutatorStore = (mutator: any) => {
      // TODO
    };

  return [createFetcherStore, createMutatorStore] as const;
};

const getKeyStore = (keys: KeyInput) => {
  let keyStore = atom<[Key, KeyParts]>(void 0 as any),
    keyParts: string[] = [];

  const setKeyStoreValue = () => {
    keyStore.set([keyParts.join(""), keyParts]);
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
