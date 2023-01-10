import { atom, ReadableAtom } from "nanostores";
import { nanofetch } from "../main";

beforeAll(() => {
  vi.useFakeTimers();
  const eventToCb: Record<string, () => void> = {};
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

    const [makeFetcher] = nanofetch();
    const store = makeFetcher(keys, { fetcher });
    store.listen(noop);
    store.listen(noop);
    store.listen(noop);

    await advance(10);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith(...keys);
  });

  test("propagates loading state", async () => {
    const keys = ["/api", "/key"];
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() => new Promise((r) => setTimeout(r, 10)));

    const [makeFetcher] = nanofetch();
    const store = makeFetcher(keys, { fetcher });
    const pr = storeValueSequence(store, [
      { loading: true },
      { loading: false, data: undefined },
    ]);
    await advance(20);
    return pr;
  });

  test("propagates error state", () => {
    const keys = ["/api", "/key"];
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() => new Promise((_, r) => r("err")));

    const [makeFetcher] = nanofetch();
    const store = makeFetcher(keys, { fetcher });
    return storeValueSequence(store, [
      { loading: true },
      { error: "err", loading: false },
    ]);
  });

  test("transitions through states correctly", async () => {
    const keys = ["/api", "/key"];
    const fetcher = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise((r) => setTimeout(() => r("yo"), 10))
      );

    const [makeFetcher] = nanofetch();
    const store = makeFetcher(keys, { fetcher });

    const pr = storeValueSequence(store, [
      { loading: true },
      { data: "yo", loading: false },
    ]);
    await advance(20);

    return pr;
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

    const [makeFetcher] = nanofetch();
    const store = makeFetcher(keys, { fetcher });

    const pr = storeValueSequence(store, [
      { loading: true },
      { data: "id1Value", loading: false },
      { loading: true },
      { data: "id2Value", loading: false },
      { data: "id1Value", loading: false },
    ]);
    await advance(20);
    $id.set("id2");
    await advance(20);
    $id.set("id1");

    return pr;
  });

  test("do not send request if it was sent before dedupe time", async () => {
    const keys = ["/api", "/key"];

    const fetcher = vi
      .fn()
      .mockImplementation(() => new Promise((r) => r("data")));

    const [makeFetcher] = nanofetch();
    const store = makeFetcher(keys, { fetcher, dedupeTime: 20 });
    {
      const unsub = storeValueSequence(store, [
        { loading: true },
        { data: "data", loading: false },
      ]);
      await advance(10);
      (await unsub)();
    }
    await advance(10);
    {
      const unsub = storeValueSequence(store, [
        { data: "data", loading: false },
      ]);
      await advance();
      (await unsub)();
      expect(fetcher).toHaveBeenCalledOnce();
      await advance(30);
    }

    const unsub = storeValueSequence(store, [{ data: "data", loading: false }]);
    await advance(0);
    expect(fetcher).toHaveBeenCalledTimes(2);
    return unsub;
  });

  test("nullable keys disable network fetching, but enable once are set", async () => {
    const $id = atom<string | null>(null);

    const keys = ["/api", "/key/", $id];
    const fetcher = vi
      .fn()
      .mockImplementation(() => new Promise((r) => r("data")));

    const [makeFetcher] = nanofetch();
    const store = makeFetcher(keys, { fetcher });
    const pr = storeValueSequence(store, [
      { loading: true },
      { data: "data", loading: false },
    ]);
    await advance(1);
    $id.set("id2");

    return pr;
  });

  test("__unsafeOverruleSettings overrides everything", async () => {
    const keys = ["/api", "/key"];
    const fetcher1 = vi
      .fn()
      .mockImplementation(() => new Promise((r) => r(null)));
    const fetcher2 = vi
      .fn()
      .mockImplementation(() => new Promise((r) => r(null)));

    const [makeFetcher, , __unsafeOverruleSettings] = nanofetch();
    const store = makeFetcher(keys, { fetcher: fetcher1 });
    __unsafeOverruleSettings({ fetcher: fetcher2 });

    const pr = storeValueSequence(store, [
      { loading: true },
      { data: null, loading: false },
    ]);
    await advance();
    expect(fetcher1).toBeCalledTimes(0);
    expect(fetcher2).toBeCalledTimes(1);
    return pr;
  });

  test("uses stale cache without setting loading state", async () => {
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

    const [makeFetcher] = nanofetch();
    const store = makeFetcher(keys, { fetcher, dedupeTime: 0 });
    const pr = storeValueSequence(store, [
      { loading: true },
      { data: "id1Value0", loading: false },
      { loading: true },
      { data: "id2Value1", loading: false },
      { data: "id1Value0", loading: false },
      { data: "id1Value2", loading: false },
    ]);
    await advance(20);
    $id.set("id2");
    await advance(20);
    $id.set("id1");
    await advance(20);
    return pr;
  });

  test("creates interval fetching; disables it once we change key", async () => {
    const $id = atom<string | null>(null);
    const keys = ["/api", "/key/", $id];
    const fetcher = vi
      .fn()
      .mockImplementation(() => new Promise((r) => r(null)));

    const [makeFetcher] = nanofetch();
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
});

describe("refetch logic", () => {
  test("refetches on focus and reconnect", async () => {
    const keys = ["/api", "/key"];
    let count = 0;
    const fetcher = vi.fn().mockImplementation(async () => count++);

    const [makeFetcher] = nanofetch();
    const store = makeFetcher(keys, {
      fetcher,
      refetchOnReconnect: true,
      refetchOnFocus: true,
      dedupeTime: 0,
    });
    const pr = storeValueSequence(store, [
      { loading: true },
      { loading: false, data: 0 },
      { loading: false, data: 0 },
      { loading: false, data: 1 },
      { loading: false, data: 1 },
      { loading: false, data: 2 },
      { loading: false, data: 2 },
      { loading: false, data: 3 },
      { loading: false, data: 3 },
      { loading: false, data: 4 },
    ]);
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

    return pr;
  });

  test(`interval doesn't fire when we're out of focus`, async () => {
    const keys = ["/api", "/key"];
    let count = 0;
    const fetcher = vi.fn().mockImplementation(async () => count++);

    const [makeFetcher] = nanofetch();
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
});

/**
 * 3. interval doesn't work if we're unfocused
 */

function storeValueSequence(store: ReadableAtom<any>, values: any[]) {
  let i = 0;
  let resolve: (arg: () => void) => void, reject: (e: unknown) => void;
  const pr = new Promise<() => void>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  const unsub = store.listen((v) => {
    try {
      expect(v).toEqual(values[i]);
    } catch (error) {
      return reject(error);
    }
    if (i >= values.length - 1) {
      return resolve(unsub);
    }
    i++;
  });

  return pr;
}

/**
 * We use advance wrapped with promises, because we heavily rely on ticks
 * in the library itself to propagate cached values, set initial values
 * reliably, etc.
 */
async function advance(ms = 0) {
  await new Promise<void>((r) => r());
  vi.advanceTimersByTime(ms);
  await new Promise<void>((r) => r());
}

const noop = () => {};
