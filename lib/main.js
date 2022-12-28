import { atom, onMount } from "nanostores";

/**
 * TODO:
 * refetch on subsequent subcription (using deduping though)
 * mutator
 *
 * (possibly that will require map/set changes):
 * add document.focus event handler
 * add blur + reconnect event handler + interval
 * conditional fetch on `null` keys?
 *
 * first run in tests?
 *
 * ideas for future:
 * 1. steal some ideas from here: https://swr.vercel.app/docs/api#options
 * 2. events (global and isolated to a single store)
 */

export const fetcherContext = ({
  cache = new Map(),
  fetcher: globalFetcher,
  ...globalSettings
} = {}) => {
  const _refetchOnFocus = new Set(),
    _refetchOnReconnect = new Set(),
    _refetchOnInterval = new Map(),
    _lastFetch = new Map(),
    _runningFetches = new Set();

  const runFetcher = ([key, keyParts], store, settings) => {
    const {
      dedupeTime,
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
        setInterval(
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

    fetcher(...keyParts)
      .then((r) => store.set({ data: r }))
      .catch((error) => store.set({ error }))
      .finally(() => _runningFetches.remove(key));
  };

  const handleRequestUnmount = (key) => {
    _refetchOnFocus.remove(key);
    _refetchOnReconnect.remove(key);
    clearInterval(_refetchOnInterval.get(key));
  };
  const handleStoreKeysChange = ([key, keyParts], store, settings) => {
    if (!cache.has(key)) {
      const loadingState = { loading: true };
      cache.set(key, loadingState);
    }
    store.set(cache.get(key));

    runFetcher([key, keyParts], store, settings);
  };

  const createFetcherStore = (
      keys,
      { fetcher = globalFetcher, ...fetcherSettings }
    ) => {
      if (process.env.NODE_ENV !== "production" && !fetcher) {
        throw new Error(
          "You need to set up either global fetcher of fetcher in createFetcherStore"
        );
      }

      const fetcherStore = atom(),
        settings = { ...globalSettings, ...fetcherSettings };

      onMount(fetcherStore, () => {
        const [keyStore, keyInternalUnsub] = getKeyStore(keys);
        let [prevKey] = keyStore.get();
        handleStoreKeysChange(prevKey, fetcherStore, settings);

        const keyUnsub = keyStore.listen(([newKey, keyParts]) => {
          handleRequestUnmount(prevKey);
          handleStoreKeysChange([newKey, keyParts], fetcherStore, settings);
          prevKey = newKey;
        });

        return () => {
          keyInternalUnsub();
          keyUnsub();
          handleRequestUnmount(prevKey);
        };
      });

      return fetcherStore;
    },
    createMutatorStore = (mutator) => {
      // TODO
    };

  return [createFetcherStore, createMutatorStore];
};

const getKeyStore = (keys) => {
  let keyStore = atom(),
    keyParts = [];

  const setKeyStoreValue = () => {
    keyStore.set([keyParts.join(""), keyParts]);
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

const getNow = () => new Date().getTime();
