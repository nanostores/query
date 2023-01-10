import { atom, onStart, onStop, ReadableAtom, WritableAtom } from "nanostores";
import { createNanoEvents } from "nanoevents";

type Fn = () => void;
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
  cache?: Map<Key, any>;
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
  const events = createNanoEvents<Events>();
  let focus = true;
  subscribe("focus", () => {
    focus = true;
    events.emit(1);
  });
  subscribe("blur", () => (focus = false));

  subscribe("online", () => events.emit(2));

  const _refetchOnInterval = new Map<KeyInput, number>(),
    _lastFetch = new Map<Key, number>(),
    _runningFetches = new Set<Key>();

  // Used for testing to have the highest say in settings hierarchy
  let rewrittenSettings: CommonSettings = {};

  const runFetcher = async (
    [key, keyParts]: [Key, KeyParts],
    store: FetcherStore,
    settings: CommonSettings
  ) => {
    if (!focus) return;

    const { dedupeTime = 4000, fetcher } = {
      ...settings,
      ...rewrittenSettings,
    };

    const now = getNow();

    if (!cache.has(key)) {
      cache.set(key, loading);
    }

    const setIfNotMatches = (newVal: any) => {
      if (newVal !== loading || store.get() !== loading) {
        store.set(newVal);
      } else {
        console.log("omiting setting value");
      }
    };

    // Calling it after tick, because otherwise it won't be propagated to .listen
    tick().then(() => {
      const value = cache.get(key);
      setIfNotMatches(value);
    });
    await tick();

    const last = _lastFetch.get(key);
    if (last && last + dedupeTime > now) {
      // Deduping the request: it's been sent not so long ago
      console.log("deduped", key);
      return;
    }
    if (_runningFetches.has(key)) {
      console.log("already runs", key);
      // Do not run the same fetcher if previous one hasn't finished yet
      return;
    }

    _lastFetch.set(key, now);
    _runningFetches.add(key);

    try {
      console.log("running fetcher", key);
      const res = { data: await fetcher!(...keyParts), loading: false };
      cache.set(key, res);
      console.log("setting fetched value", key, res);
      setIfNotMatches(res);
      _lastFetch.set(key, getNow());
    } catch (error: any) {
      store.set({ error, loading: false });
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

      const fetcherStore = atom() as unknown as FetcherStore<T>,
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
        if (refetchOnFocus) evtUnsubs.push(events.on(1, runRefetcher));
        if (refetchOnReconnect) evtUnsubs.push(events.on(2, runRefetcher));
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
        keysInternalUnsub?.();
        evtUnsubs.forEach((fn) => fn());
        keyUnsub();
        const int = _refetchOnInterval.get(keyInput);
        if (int) clearInterval(int);
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

type Events = {
  // Focus
  1: Fn;
  // Reconnect
  2: Fn;
};

const isServer = typeof window !== "undefined";
const subscribe = (name: string, fn: Fn) => {
  if (!isServer || process.env.NODE_ENV === "test") {
    addEventListener(name, fn);
  }
};

const getNow = () => new Date().getTime();

const tick = () => new Promise<void>((r) => r());

const loading = Object.freeze({ loading: true });
