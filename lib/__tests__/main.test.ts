import { atom } from "nanostores";
import { nanoquery } from "../main";
import { noop, delay } from "./setup";

beforeAll(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("fetcher tests", () => {
  test("fetches once for multiple subscriptions", async () => {
    const fetcher = vi.fn().mockImplementation(async () => true);

    const keys = ["/api", "/key"];

    const [makeFetcher] = nanoquery();
    const store = makeFetcher(keys, { fetcher });
    store.listen(noop);
    store.listen(noop);
    store.listen(noop);

    await advance();
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith(...keys);
  });

  test("works with numerical keys", async () => {
    const fetcher = vi.fn().mockImplementation(async () => true);

    const keys = ["/api", "/page/", 5];

    const [makeFetcher] = nanoquery();
    const store = makeFetcher(keys, { fetcher });
    store.listen(noop);
    store.listen(noop);
    store.listen(noop);

    await advance();
    expect(store.key).toBe(keys.join(""));
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith(...keys);
  });

  test("works with boolean keys", async () => {
    const fetcher = vi.fn().mockImplementation(async () => true);
    const $conditional = atom(false);

    const keys = ["/api", $conditional];

    const [makeFetcher] = nanoquery();
    const store = makeFetcher(keys, { fetcher });
    store.listen(noop);

    await advance();
    expect(store.value?.loading).toBe(false);

    $conditional.set(true);
    await advance();
    expect(store.value?.data).toBe(true);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith("/api", true);
  });

  test("works for string-based keys", async () => {
    const fetcher = vi.fn().mockImplementation(async () => true);

    const [makeFetcher] = nanoquery();
    const store = makeFetcher("/api/key", { fetcher });
    store.listen(noop);
    store.listen(noop);
    store.listen(noop);

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

    store1.listen(noop);
    store2.listen(noop);

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
    store.listen(noop);

    expect(store.get()).toMatchObject({ loading: true });
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
    store.listen(noop);

    await advance();

    expect(store.get()).toMatchObject({ error: "err", loading: false });
  });

  test("provides a promise as part of the lib", async () => {
    const res = {};
    const originalPromise = new Promise((r) => r(res));

    const fetcher = vi.fn().mockImplementationOnce(() => originalPromise);

    const [makeFetcher] = nanoquery();
    const store = makeFetcher("", { fetcher });
    store.listen(noop);

    const { promise } = store.get();
    expect(promise).toBeInstanceOf(Promise);
    expect(promise).toStrictEqual(originalPromise);

    await advance();

    expect(store.get().data).toStrictEqual(res);
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
    store.listen(noop);

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

    store.listen(noop);
    expect(store.key).toBe("/api/key/id1");

    await advance();
    expect(store.get()).toMatchObject({ loading: true });
    await advance(20);
    expect(store.get()).toEqual({ data: "id1Value", loading: false });

    $id.set("id2");
    expect(store.key).toBe("/api/key/id2");
    await advance();
    expect(store.get()).toMatchObject({ loading: true });
    await advance(20);

    expect(store.get()).toEqual({ data: "id2Value", loading: false });
    $id.set("id1");
    expect(store.key).toBe("/api/key/id1");
    await advance();
    expect(store.get()).toEqual({ data: "id1Value", loading: false });
  });

  test("accepts fetcher stores as keys", async () => {
    const $cond = atom(true);

    const fetcher = vi.fn().mockImplementation(async (...keys: any[]) => {
      await delay(100);
      // explicitly returning undefined
    });

    const [makeFetcher] = nanoquery({ fetcher });

    const $store1 = makeFetcher(["store1", $cond]),
      $store2 = makeFetcher(["store2", $store1]);

    $store2.listen(noop);
    await advance();

    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith("store1", true);
    expect($store1.value).toMatchObject({ loading: true });
    expect($store2.value).toEqual({ loading: false });

    await advance(150);
    await advance();

    expect($store1.value).toMatchObject({ loading: false });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenCalledWith("store2", "store1true");
    expect($store2.value).toMatchObject({ loading: true });

    await advance(150);
    await advance();

    expect($store2.value).toMatchObject({ loading: false });

    $cond.set(false);
    await advance();
    await advance();

    expect($store1.value).toEqual({ loading: false });
    expect($store2.value).toEqual({ loading: false });
  });

  test("do not send request if it was sent before dedupe time", async () => {
    const keys = ["/api", "/key"];

    const fetcher = vi
      .fn()
      .mockImplementation(() => new Promise((r) => r("data")));

    const [makeFetcher] = nanoquery();
    const store = makeFetcher(keys, { fetcher, dedupeTime: 20 });
    {
      const unsub = store.listen(noop);
      await advance(10);
      expect(store.get()).toEqual({ data: "data", loading: false });
      unsub();
    }
    await advance(10);
    {
      const unsub = store.listen(noop);
      await advance();
      expect(store.get()).toEqual({ data: "data", loading: false });
      unsub();
      expect(fetcher).toHaveBeenCalledOnce();
      await advance(30);
    }

    store.listen(noop);
    await advance();
    expect(store.get()).toEqual({ data: "data", loading: false });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  test("nullable keys disable network fetching and unset store value, but enable once are set", async () => {
    const $id = atom<string | null>(null);

    const keys = ["/api", "/key/", $id];
    const fetcher = vi.fn().mockImplementation(async () => {
      await delay(100);
      return "data";
    });

    const [makeFetcher] = nanoquery();
    const store = makeFetcher(keys, { fetcher });
    store.listen(noop);

    expect(store.get()).toEqual({ loading: false });
    $id.set("id2");
    expect(store.get()).toMatchObject({ loading: true });
    await advance(100);
    await advance();
    expect(store.get()).toEqual({ data: "data", loading: false });

    $id.set(null);
    await advance();
    expect(store.get()).toEqual({ loading: false });
    $id.set("id2");
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
    store.listen(noop);

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
    store.listen(noop);

    expect(store.get()).toMatchObject({ loading: true });
    await advance(20);
    expect(store.get()).toEqual({ data: "id1Value0", loading: false });

    $id.set("id2");
    await advance();
    expect(store.get()).toMatchObject({ loading: true });

    await advance(20);
    expect(store.get()).toEqual({ data: "id2Value1", loading: false });

    $id.set("id1");
    await advance();
    expect(store.get()).toMatchObject({ data: "id1Value0", loading: true });

    await advance(20);
    expect(store.get()).toEqual({ data: "id1Value2", loading: false });
  });

  test("invalidator drops cache for inactive stores", async () => {
    let counter = 0;
    const fetcher = async () => {
      await delay(10);
      counter++;
      return counter;
    };

    const [makeFetcher] = nanoquery();
    const store = makeFetcher("/api", { fetcher });

    const unsub = store.listen(noop);
    await advance(20);
    expect(store.get()).toEqual({ loading: false, data: 1 });

    unsub();
    store.invalidate();
    await advance();

    store.listen(noop);
    const storeValue = store.get();
    expect(storeValue.loading).toBe(true);
    expect(storeValue.data).toBeUndefined();

    await advance(20);
    expect(store.get().data).toBe(2);
  });

  test("internal nanostores cache is dropped between key changes", async () => {
    const fetcher = async (...keys: (string | number | boolean)[]) => keys[0];

    const $key = atom<string | void>("1");

    const [makeFetcher] = nanoquery();
    const store = makeFetcher([$key, "/api"], { fetcher });

    const unbind = store.listen(noop);
    await advance();

    expect(store.get().data).toBe("1");
    unbind();

    $key.set();

    const events: any[] = [];
    store.listen((v) => events.push(v));

    $key.set("2");
    await advance();

    expect(events[0]).toMatchObject({ loading: false });
    expect(events[1]).toMatchObject({ loading: true });
    expect(events[1].data).toBeUndefined();
    expect(events[2]).toMatchObject({ data: "2" });
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
    const unsub = store.listen(() => null);
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
    store.listen(noop);

    expect(store.get()).toMatchObject({ loading: true });
    await advance(100);
    $id.set("two");
    for (let i = 0; i < 5; i++) {
      await advance();
    }
    expect(store.get()).toMatchObject({ loading: true });
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

    const fetcher = vi.fn().mockImplementationOnce(async () => {
      console.log("data fetcher");
      return "data";
    });

    const [makeFetcher] = nanoquery();
    const store = makeFetcher(keys, { fetcher, dedupeTime: 0 });
    store.listen(noop);

    await advance();
    expect(store.get()).toEqual({ data: "data", loading: false });
    fetcher.mockImplementationOnce(async () => {
      console.log("err fetcher");
      throw "err";
    });

    // Getting a new listener to spark a new fetch
    store.listen(noop);
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
      store.listen(noop);

      await advance();
      expect(onErrorContext).toBeCalledTimes(1);
      expect(onErrorContext.mock.lastCall?.[0]).toBe(errInstance);
    }
    {
      const onError = vi.fn();
      const store = makeFetcher(keys, { fetcher, dedupeTime: 0, onError });
      store.listen(noop);

      await advance();
      expect(onErrorContext).toBeCalledTimes(1);
      expect(onError).toBeCalledTimes(1);
      expect(onError.mock.lastCall?.[0]).toBe(errInstance);
    }
  });

  test("uses pre-set cache when fetching from a completely new context", async () => {
    const keys = ["/api", "/key"];
    const fetcher = vi.fn().mockImplementation(async () => "new data");

    const cache = new Map(),
      initial = "old data";
    cache.set(keys.join(""), initial);

    const [makeFetcher] = nanoquery({ fetcher, cache });
    const $store = makeFetcher(keys);

    const events: any[] = [];
    $store.subscribe((v) => events.push(v));
    await advance();

    expect(events[0]).toMatchObject({ data: initial, loading: true });
    expect(events[events.length - 1]).toEqual({
      loading: false,
      data: "new data",
    });
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
    store.listen(noop);
    await advance();
    dispatchEvent(new Event("online"));
    await advance();
    dispatchEvent(new Event("online"));
    await advance();
    Object.defineProperty(document, "hidden", {
      value: false,
      writable: true,
    });
    dispatchEvent(new Event("visibilitychange"));
    await advance();
    dispatchEvent(new Event("visibilitychange"));
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

    store.listen(noop);

    await advance(5);
    await advance(5);
    await advance(5);
    expect(fetcher).toHaveBeenCalledTimes(3);
    Object.defineProperty(document, "hidden", {
      value: true,
      writable: true,
    });
    dispatchEvent(new Event("visibilitychange"));
    await advance(5);
    await advance(5);
    await advance(5);
    (document as any).hidden = false;
    expect(fetcher).toHaveBeenCalledTimes(3);
    dispatchEvent(new Event("visibilitychange"));
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
    store.listen(listener);

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

describe("mutator tests", () => {
  describe("mutator", () => {
    test("correct transitions", async () => {
      const [, makeMutator] = nanoquery();
      const $mutate = makeMutator<void, string>(async () => "hey");
      $mutate.listen(noop);

      const { mutate } = $mutate.get();
      expect($mutate.get().loading).toBeFalsy();
      const pr = mutate();
      expect($mutate.get().loading).toBeTruthy();
      await advance();
      expect($mutate.get().loading).toBeFalsy();
      expect($mutate.get().data).toBe("hey");

      return pr;
    });

    test(`transitions work if you're not subscribed to the store`, async () => {
      const [, makeMutator] = nanoquery();
      const $mutate = makeMutator<void, string>(async () => "hey");

      const pr = $mutate.mutate();
      await advance();
      const res = $mutate.get();
      expect(res.loading).toBeFalsy();
      expect(res.data).toBe("hey");

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
      $data.listen(noop);
      $data2.listen(noop);

      let fetcherCallCountAfterInvalidation = -1,
        fetcher2CallCountAfterInvalidation = -1;
      const mutator = vi.fn().mockImplementation(({ invalidate }) => {
        invalidate((key: string) => key === keyParts.join(""));
        invalidate(keyParts2.join(""));

        fetcherCallCountAfterInvalidation = fetcher.mock.calls.length;
        fetcher2CallCountAfterInvalidation = fetcher2.mock.calls.length;
      });

      const $mutate = makeMutator<string>(mutator);
      $mutate.listen(noop);

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
      store.listen(noop);

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
      $mutate.listen(noop);

      await advance(10);
      expect(store.get()).toEqual({ loading: false, data: 0 });

      const { mutate } = $mutate.get();
      await mutate("hey");
      expect(store.get()).toMatchObject({
        loading: true,
        data: "mutated manually",
      });

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
      store.listen(noop);

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
    store.listen(noop);

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
    $mutate.listen(noop);

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

    $mutate.listen(noop);
    await advance();
    const { mutate } = $mutate.get();
    await mutate();
    await advance();
    expect(fetcher1).toBeCalledTimes(0);
    expect(fetcher2).toBeCalledTimes(1);
  });
});

describe("global invalidator and mutator", () => {
  test("global invalidator works", async () => {
    const fetcher = vi.fn().mockImplementation(async () => true);

    const keys = ["/api", "/key"];

    const [makeFetcher, , { invalidateKeys }] = nanoquery();
    const store = makeFetcher(keys, { fetcher });
    store.listen(noop);

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
    store.listen(noop);

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
    store.listen(noop);

    await advance();
    expect(store.get().data).toBe(true);

    mutateCache(keys.join(""));
    await advance();
    expect(store.get().data).toBe(void 0);
    store.listen(noop);

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
