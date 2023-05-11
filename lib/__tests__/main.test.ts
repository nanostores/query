import { atom } from "nanostores";
import { nanoquery } from "../main";

beforeAll(() => {
  vi.useFakeTimers();
  const eventToCb: Record<string, () => void> = {};
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal(
    "addEventListener",
    (name: string, cb: () => void) => (eventToCb[name] = cb)
  );
  vi.stubGlobal("dispatchEvent", (evt: { type: string }) => {
    eventToCb?.[evt.type]?.();
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe.concurrent("fetcher tests", () => {
  test("fetches once for multiple subscriptions", async () => {
    const fetcher = vi.fn().mockImplementation(async () => true);

    const keys = ["/api", "/key"];

    const [makeFetcher] = nanoquery();
    const store = makeFetcher(keys, { fetcher });
    store.subscribe(noop);
    store.subscribe(noop);
    store.subscribe(noop);

    await advance();
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith(...keys);
  });

  test("works for string-based keys", async () => {
    const fetcher = vi.fn().mockImplementation(async () => true);

    const [makeFetcher] = nanoquery();
    const store = makeFetcher("/api/key", { fetcher });
    store.subscribe(noop);
    store.subscribe(noop);
    store.subscribe(noop);

    await advance();
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith("/api/key");
  });

  test("values are shared between stores with same keys", async () => {
    const fetcher = vi.fn().mockImplementation(async () => true);

    const keys = ["/api", "/key"];

    const [makeFetcher] = nanoquery({ fetcher });
    const store1 = makeFetcher(keys, { fetcher }),
      store2 = makeFetcher(keys);

    store1.subscribe(noop);
    store2.subscribe(noop);

    await advance();
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith(...keys);

    expect(store1.get().data).toBe(true);
    expect(store2.get().data).toBe(true);
  });

  test("propagates loading state", async () => {
    const keys = ["/api", "/key"];
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() => new Promise((r) => setTimeout(r, 10)));

    const [makeFetcher] = nanoquery();
    const store = makeFetcher(keys, { fetcher });
    store.subscribe(noop);

    expect(store.get()).toEqual({ loading: true });
    await advance(20);
    expect(store.get()).toEqual({ loading: false, data: undefined });
  });

  test("propagates error state", async () => {
    const keys = ["/api", "/key"];
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() => new Promise((_, r) => r("err")));

    const [makeFetcher] = nanoquery();
    const store = makeFetcher(keys, { fetcher });
    store.subscribe(noop);

    await advance();

    expect(store.get()).toEqual({ error: "err", loading: false });
  });

  test("transitions through states correctly", async () => {
    const keys = ["/api", "/key"];
    const fetcher = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise((r) => setTimeout(() => r("yo"), 10))
      );

    const [makeFetcher] = nanoquery();
    const store = makeFetcher(keys, { fetcher });
    store.subscribe(noop);

    await advance(20);

    expect(store.get()).toEqual({ data: "yo", loading: false });
  });

  test("accepts stores as keys", async () => {
    const $id = atom<string>("id1");
    const res: Record<string, string> = {
      id1: "id1Value",
      id2: "id2Value",
    };

    const keys = ["/api", "/key/", $id];
    const fetcher = vi
      .fn()
      .mockImplementation(
        (...keys: string[]) =>
          new Promise((r) => setTimeout(() => r(res[keys[2]]), 10))
      );

    const [makeFetcher] = nanoquery();
    const store = makeFetcher(keys, { fetcher });

    store.subscribe(noop);
    expect(store.key).toBe("/api/key/id1");

    await advance();
    expect(store.get()).toEqual({ loading: true });
    await advance(20);
    expect(store.get()).toEqual({ data: "id1Value", loading: false });

    $id.set("id2");
    expect(store.key).toBe("/api/key/id2");
    await advance();
    expect(store.get()).toEqual({ loading: true });
    await advance(20);

    expect(store.get()).toEqual({ data: "id2Value", loading: false });
    $id.set("id1");
    expect(store.key).toBe("/api/key/id1");
    await advance();
    expect(store.get()).toEqual({ data: "id1Value", loading: false });
  });

  test("do not send request if it was sent before dedupe time", async () => {
    const keys = ["/api", "/key"];

    const fetcher = vi
      .fn()
      .mockImplementation(() => new Promise((r) => r("data")));

    const [makeFetcher] = nanoquery();
    const store = makeFetcher(keys, { fetcher, dedupeTime: 20 });
    {
      const unsub = store.subscribe(noop);
      await advance(10);
      expect(store.get()).toEqual({ data: "data", loading: false });
      unsub();
    }
    await advance(10);
    {
      const unsub = store.subscribe(noop);
      await advance();
      expect(store.get()).toEqual({ data: "data", loading: false });
      unsub();
      expect(fetcher).toHaveBeenCalledOnce();
      await advance(30);
    }

    store.subscribe(noop);
    await advance();
    expect(store.get()).toEqual({ data: "data", loading: false });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  test("nullable keys disable network fetching, but enable once are set", async () => {
    const $id = atom<string | null>(null);

    const keys = ["/api", "/key/", $id];
    const fetcher = vi
      .fn()
      .mockImplementation(() => new Promise((r) => r("data")));

    const [makeFetcher] = nanoquery();
    const store = makeFetcher(keys, { fetcher });
    store.subscribe(noop);

    expect(store.get()).toEqual({ loading: false });
    $id.set("id2");
    expect(store.get()).toEqual({ loading: true });
    await advance();
    expect(store.get()).toEqual({ data: "data", loading: false });
  });

  test("__unsafeOverruleSettings overrides everything", async () => {
    const keys = ["/api", "/key"];
    const fetcher1 = vi
      .fn()
      .mockImplementation(() => new Promise((r) => r(null)));
    const fetcher2 = vi
      .fn()
      .mockImplementation(() => new Promise((r) => r(null)));

    const [makeFetcher, , { __unsafeOverruleSettings }] = nanoquery();
    const store = makeFetcher(keys, { fetcher: fetcher1 });
    __unsafeOverruleSettings({ fetcher: fetcher2 });
    store.subscribe(noop);

    await advance();
    expect(store.get()).toEqual({ data: null, loading: false });
    expect(fetcher1).toBeCalledTimes(0);
    expect(fetcher2).toBeCalledTimes(1);
  });

  test("uses stale cache with setting loading state", async () => {
    const $id = atom("id1");
    const res: Record<string, string> = {
      id1: "id1Value",
      id2: "id2Value",
    };

    const keys = ["/api", "/key/", $id];
    let counter = 0;
    const fetcher = vi.fn().mockImplementation(
      (...keys: string[]) =>
        new Promise((r) =>
          setTimeout(() => {
            r(res[keys[2]] + counter);
            counter++;
          }, 10)
        )
    );

    const [makeFetcher] = nanoquery();
    const store = makeFetcher(keys, { fetcher, dedupeTime: 0 });
    store.subscribe(noop);

    expect(store.get()).toEqual({ loading: true });
    await advance(20);
    expect(store.get()).toEqual({ data: "id1Value0", loading: false });

    $id.set("id2");
    await advance();
    expect(store.get()).toEqual({ loading: true });

    await advance(20);
    expect(store.get()).toEqual({ data: "id2Value1", loading: false });

    $id.set("id1");
    await advance();
    expect(store.get()).toEqual({ data: "id1Value0", loading: true });

    await advance(20);
    expect(store.get()).toEqual({ data: "id1Value2", loading: false });
  });

  test("creates interval fetching; disables it once we change key", async () => {
    const $id = atom<string | null>(null);
    const keys = ["/api", "/key/", $id];
    const fetcher = vi
      .fn()
      .mockImplementation(() => new Promise((r) => r(null)));

    const [makeFetcher] = nanoquery();
    const store = makeFetcher(keys, {
      fetcher,
      dedupeTime: 0,
      refetchInterval: 5,
    });
    const unsub = store.subscribe(() => null);
    $id.set("");
    await advance();
    expect(fetcher).toHaveBeenCalledOnce();
    await advance(5);
    await advance(5);
    await advance(5);
    await advance(5);
    expect(fetcher).toHaveBeenCalledTimes(5);
    $id.set(null);
    await advance(5);
    await advance(5);
    await advance(5);
    await advance(5);
    expect(fetcher).toHaveBeenCalledTimes(5);
    unsub();
  });

  test("do not set store state for delayed request if current key has already changed", async () => {
    const $id = atom<string | null>("one");

    const keys = ["/api", "/key", $id];

    // Fetcher executes 500ms the first time and 100ms the second time it's invoked
    let i = 0;
    const fetcher = vi.fn().mockImplementation(async () => {
      await delay(i === 0 ? 500 : 100);
      i++;
      return { counter: i };
    });

    const [makeFetcher] = nanoquery();
    const store = makeFetcher(keys, { fetcher });
    store.subscribe(noop);

    expect(store.get()).toEqual({ loading: true });
    await advance(100);
    $id.set("two");
    for (let i = 0; i < 5; i++) {
      await advance();
    }
    expect(store.get()).toEqual({ loading: true });
    await advance(600);
    await advance(600);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(store.get()).toEqual({ data: { counter: 2 }, loading: false });
    $id.set("one");

    await advance();
    expect(store.get()).toEqual({ data: { counter: 1 }, loading: false });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  test("consecutive error does not wipe cache", async () => {
    const keys = ["/api", "/key"];

    let shouldErr = false;
    const fetcher = vi.fn().mockImplementation(async () => {
      if (shouldErr) throw "err";
      else {
        shouldErr = true;
        return "data";
      }
    });

    const [makeFetcher] = nanoquery();
    const store = makeFetcher(keys, { fetcher, dedupeTime: 0 });
    store.subscribe(noop);

    await advance();
    expect(store.get()).toEqual({ data: "data", loading: false });

    // Getting a new listener to spark a new fetch
    store.subscribe(noop);
    await advance();
    expect(store.get()).toEqual({ error: "err", data: "data", loading: false });
  });

  test("onError handler is called whenever error happens", async () => {
    const keys = ["/api", "/key"];

    const errInstance = new Error();

    const fetcher = vi.fn().mockImplementation(async () => {
      throw errInstance;
    });

    const onErrorContext = vi.fn();

    const [makeFetcher] = nanoquery({ onError: onErrorContext });
    {
      const store = makeFetcher(keys, { fetcher, dedupeTime: 0 });
      store.subscribe(noop);

      await advance();
      expect(onErrorContext).toBeCalledTimes(1);
      expect(onErrorContext.mock.lastCall?.[0]).toBe(errInstance);
    }
    {
      const onError = vi.fn();
      const store = makeFetcher(keys, { fetcher, dedupeTime: 0, onError });
      store.subscribe(noop);

      await advance();
      expect(onErrorContext).toBeCalledTimes(1);
      expect(onError).toBeCalledTimes(1);
      expect(onError.mock.lastCall?.[0]).toBe(errInstance);
    }
  });
});

describe("refetch logic", () => {
  test("refetches on focus and reconnect", async () => {
    const keys = ["/api", "/key"];
    let count = 0;
    const fetcher = vi.fn().mockImplementation(async () => count++);

    const [makeFetcher] = nanoquery();
    const store = makeFetcher(keys, {
      fetcher,
      refetchOnReconnect: true,
      refetchOnFocus: true,
      dedupeTime: 0,
    });
    store.subscribe(noop);
    await advance();
    dispatchEvent(new Event("online"));
    await advance();
    dispatchEvent(new Event("online"));
    await advance();
    dispatchEvent(new Event("focus"));
    await advance();
    dispatchEvent(new Event("focus"));
    await advance();

    expect(fetcher).toHaveBeenCalledTimes(5);
  });

  test(`interval doesn't fire when we're out of focus`, async () => {
    const keys = ["/api", "/key"];
    let count = 0;
    const fetcher = vi.fn().mockImplementation(async () => count++);

    const [makeFetcher] = nanoquery();
    const store = makeFetcher(keys, {
      fetcher,
      refetchInterval: 5,
      dedupeTime: 0,
    });

    store.subscribe(noop);

    await advance(5);
    await advance(5);
    await advance(5);
    expect(fetcher).toHaveBeenCalledTimes(3);
    dispatchEvent(new Event("blur"));
    await advance(5);
    await advance(5);
    await advance(5);
    expect(fetcher).toHaveBeenCalledTimes(3);
    dispatchEvent(new Event("focus"));
    await advance(5);
    await advance(5);
    await advance(5);
    expect(fetcher).toHaveBeenCalledTimes(6);
  });

  test("store isn't updated if data has a stable identity", async () => {
    const keys = ["/api", "/key"];

    let data = {};
    const fetcher = vi.fn().mockImplementation(async () => data);

    const [makeFetcher] = nanoquery();
    const store = makeFetcher(keys, {
      fetcher,
      refetchOnFocus: true,
      refetchInterval: 100,
      dedupeTime: 2e200,
    });

    const listener = vi.fn();
    store.subscribe(listener);

    await advance();
    expect(store.get()).toEqual({ data: {}, loading: false });
    expect(listener).toHaveBeenCalledTimes(2);
    // Forcing lots of events
    for (let i = 0; i < 10; i++) {
      dispatchEvent(new Event("focus"));
      await advance(200);
    }
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe.concurrent("mutator tests", () => {
  describe.concurrent("mutator", () => {
    test("correct transitions", async () => {
      const [, makeMutator] = nanoquery();
      const $mutate = makeMutator<void, string>(async () => "hey");
      $mutate.subscribe(noop);

      const { mutate } = $mutate.get();
      expect($mutate.get().loading).toBeFalsy();
      const pr = mutate();
      expect($mutate.get().loading).toBeTruthy();
      await advance();
      expect($mutate.get().loading).toBeFalsy();
      expect($mutate.get().data).toBe("hey");

      return pr;
    });

    test("invalidates keys; invalidation ignores dedupe; invalidation ignores cache; always invalidates after running mutation", async () => {
      let counter = 0,
        counter2 = 0;
      const fetcher = vi.fn().mockImplementation(async () => counter++);
      const fetcher2 = vi.fn().mockImplementation(async () => counter2++);

      const keyParts = ["/api", "/key"],
        keyParts2 = ["/api", "/key2"];

      const [makeFetcher, makeMutator] = nanoquery();
      const $data = makeFetcher(keyParts, { fetcher, dedupeTime: 2e20 });
      const $data2 = makeFetcher(keyParts2, {
        fetcher: fetcher2,
        dedupeTime: 2e20,
      });
      $data.subscribe(noop);
      $data2.subscribe(noop);

      let fetcherCallCountAfterInvalidation = -1,
        fetcher2CallCountAfterInvalidation = -1;
      const mutator = vi.fn().mockImplementation(({ invalidate }) => {
        invalidate(keyParts.join(""));
        invalidate(keyParts2.join(""));

        fetcherCallCountAfterInvalidation = fetcher.mock.calls.length;
        fetcher2CallCountAfterInvalidation = fetcher2.mock.calls.length;
      });

      const $mutate = makeMutator<string>(mutator);
      $mutate.subscribe(noop);

      await advance();
      const { mutate } = $mutate.get();
      await mutate("hey");
      expect(fetcherCallCountAfterInvalidation).toBe(1);
      expect(fetcher2CallCountAfterInvalidation).toBe(1);
      await advance();

      expect(mutator.mock.calls[0][0].data).toBe("hey");

      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(fetcher2).toHaveBeenCalledTimes(2);
    });

    test("local mutation; invalidation afterwards", async () => {
      let counter = 0;
      const fetcher = vi.fn().mockImplementation(async () => counter++);

      const keyParts = ["/api", "/key"];

      const [makeFetcher, makeMutator] = nanoquery();
      const store = makeFetcher(keyParts, { fetcher, dedupeTime: 2e20 });
      store.subscribe(noop);

      const $mutate = makeMutator<string>(async ({ getCacheUpdater, data }) => {
        try {
          expect(data).toBe("hey");
          const [mutateCache, prevData] = getCacheUpdater(keyParts.join(""));
          expect(prevData).toBe(0);
          mutateCache("mutated manually");
        } catch (error) {
          console.error(error);
        }
      });
      $mutate.subscribe(noop);

      await advance(10);
      expect(store.get()).toEqual({ loading: false, data: 0 });

      const { mutate } = $mutate.get();
      await mutate("hey");
      expect(store.get()).toEqual({ loading: true, data: "mutated manually" });

      await advance();
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(store.get()).toEqual({ loading: false, data: 1 });
    });

    test("onError handler is called whenever error happens", async () => {
      const errInstance = new Error();

      const fetcher = vi.fn().mockImplementation(async () => {
        throw errInstance;
      });

      const onErrorContext = vi.fn();

      const [, makeMutator] = nanoquery({ onError: onErrorContext });
      const store = makeMutator(fetcher);
      store.subscribe(noop);

      const { mutate } = store.get();
      await mutate();

      await advance();
      expect(onErrorContext).toBeCalledTimes(1);
      expect(onErrorContext.mock.lastCall?.[0]).toBe(errInstance);
    });
  });

  test("local mutation; invalidation disabled", async () => {
    let counter = 0;
    const fetcher = vi.fn().mockImplementation(async () => counter++);

    const keyParts = ["/api", "/key"];

    const [makeFetcher, makeMutator] = nanoquery();
    const store = makeFetcher(keyParts, { fetcher, dedupeTime: 2e20 });
    store.subscribe(noop);

    const $mutate = makeMutator<string>(async ({ getCacheUpdater, data }) => {
      try {
        expect(data).toBe("hey");
        const [mutateCache, prevData] = getCacheUpdater(
          keyParts.join(""),
          false
        );
        expect(prevData).toBe(0);
        mutateCache("mutated manually");
      } catch (error) {
        console.error(error);
      }
    });
    $mutate.subscribe(noop);

    await advance(10);
    expect(store.get()).toEqual({ loading: false, data: 0 });

    const { mutate } = $mutate.get();
    await mutate("hey");
    expect(store.get()).toEqual({ loading: false, data: "mutated manually" });

    await advance();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(store.get()).toEqual({ loading: false, data: "mutated manually" });
  });

  test("settings override works for mutators", async () => {
    const fetcher1 = vi.fn().mockImplementation(async () => null);
    const fetcher2 = vi.fn().mockImplementation(async () => null);

    const [, makeMutator, { __unsafeOverruleSettings }] = nanoquery();
    const $mutate = makeMutator(fetcher1);
    __unsafeOverruleSettings({ fetcher: fetcher2 });

    $mutate.subscribe(noop);
    await advance();
    const { mutate } = $mutate.get();
    await mutate();
    await advance();
    expect(fetcher1).toBeCalledTimes(0);
    expect(fetcher2).toBeCalledTimes(1);
  });
});

describe.concurrent("global invalidator and mutator", () => {
  test("global invalidator works", async () => {
    const fetcher = vi.fn().mockImplementation(async () => true);

    const keys = ["/api", "/key"];

    const [makeFetcher, , { invalidateKeys }] = nanoquery();
    const store = makeFetcher(keys, { fetcher });
    store.subscribe(noop);

    await advance();
    expect(fetcher).toBeCalledTimes(1);
    invalidateKeys(keys.join(""));
    await advance();
    expect(fetcher).toBeCalledTimes(2);
    invalidateKeys([keys.join("")]);
    await advance();
    expect(fetcher).toBeCalledTimes(3);
    invalidateKeys((key) => key === "/api/key");
    await advance();
    expect(fetcher).toBeCalledTimes(4);
    invalidateKeys("incorrect");
    invalidateKeys(["incorrect"]);
    invalidateKeys(() => false);
    await advance();
    expect(fetcher).toBeCalledTimes(4);
  });

  test("global mutation works", async () => {
    const fetcher = vi.fn().mockImplementation(async () => true);

    const keys = ["/api", "/key"];

    const [makeFetcher, , { mutateCache }] = nanoquery();
    const store = makeFetcher(keys, { fetcher });
    store.subscribe(noop);

    await advance();
    expect(store.get().data).toBe(true);

    mutateCache(keys.join(""), 1);
    await advance();
    expect(store.get().data).toBe(1);

    mutateCache([keys.join("")], 2);
    await advance();
    expect(store.get().data).toBe(2);

    mutateCache((key) => key === "/api/key", 3);
    await advance();
    expect(store.get().data).toBe(3);

    mutateCache("incorrect", 123);
    mutateCache(["incorrect"], 123);
    mutateCache(() => false, 123);
    await advance();
    expect(store.get().data).toBe(3);
    expect(fetcher).toBeCalledTimes(1);
  });

  test("global mutation treats undefined as an instruction to wipe key", async () => {
    const fetcher = vi.fn().mockImplementation(async () => true);

    const keys = ["/api", "/key"];

    const [makeFetcher, , { mutateCache }] = nanoquery({ dedupeTime: 2e20 });
    const store = makeFetcher(keys, { fetcher });
    store.subscribe(noop);

    await advance();
    expect(store.get().data).toBe(true);

    mutateCache(keys.join(""));
    await advance();
    expect(store.get().data).toBe(void 0);
    store.subscribe(noop);

    await advance();
    expect(store.get().data).toBe(true);

    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

/**
 * We use advance wrapped with promises, because we heavily rely on ticks
 * in the library itself to propagate cached values, set initial values
 * reliably, etc.
 */
async function advance(ms = 0) {
  // I don't know what I'm doing ¯\_(ツ)_/¯
  await new Promise<void>((r) => r());
  await new Promise<void>((r) => r());
  vi.advanceTimersByTime(ms);
  await new Promise<void>((r) => r());
  await new Promise<void>((r) => r());
}

const noop = () => {};
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
