import { atom, ReadableAtom } from "nanostores";
import { nanofetch } from "../main";

let makeFetcher: ReturnType<typeof nanofetch>[0],
  makeMutator: ReturnType<typeof nanofetch>[1],
  __unsafeOverruleSettings: ReturnType<typeof nanofetch>[2];

beforeEach(() => {
  [makeFetcher, makeMutator, __unsafeOverruleSettings] = nanofetch();
});
afterEach(() => {
  vi.restoreAllMocks();
});

test("fetches once for multiple subscriptions", () =>
  new Promise<void>((done, reject) => {
    const fetcher = vi.fn().mockImplementation(async () => ({}));

    const keys = ["/api", "/key"];

    const store = makeFetcher(keys, { fetcher });
    const doFetch = () =>
      listener(reject, store, (v) => {
        expect(v.data).toBeTruthy();
        expect(fetcher).toHaveBeenCalledOnce();
        expect(fetcher).toHaveBeenCalledWith(...keys);
        done();
      });
    doFetch();
    doFetch();
    doFetch();
  }));

test("propagates loading state", () =>
  new Promise<void>((done, reject) => {
    const keys = ["/api", "/key"];
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() => new Promise((r) => setTimeout(r, 1000)));

    const store = makeFetcher(keys, { fetcher });
    storeValueSequence(done, reject, store, [{ loading: true }]);
  }));

test("propagates error state", () =>
  new Promise<void>((done, reject) => {
    const keys = ["/api", "/key"];
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() => new Promise((_, r) => r("err")));

    const store = makeFetcher(keys, { fetcher });
    storeValueSequence(done, reject, store, [{ error: "err", loading: false }]);
  }));

test("transitions through states correctly", () =>
  new Promise<void>((done, reject) => {
    const keys = ["/api", "/key"];
    const fetcher = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise((r) => setTimeout(() => r("yo"), 100))
      );

    const store = makeFetcher(keys, { fetcher });

    storeValueSequence(done, reject, store, [
      { loading: true },
      { data: "yo", loading: false },
    ]);
  }));

test("accepts stores as keys", () =>
  new Promise<void>((done, reject) => {
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

    const store = makeFetcher(keys, { fetcher });
    storeValueSequence(done, reject, store, [
      { loading: true },
      { data: "id1Value", loading: false },
      { loading: true },
      { data: "id2Value", loading: false },
      { data: "id1Value", loading: false },
    ]);
    (async function () {
      await delay(20);
      $id.set("id2");
      await delay(20);
      $id.set("id1");
    })();
  }));

test("do not send request if it was sent before dedupe time", () =>
  new Promise<void>((done, reject) => {
    const keys = ["/api", "/key"];
    const fetcher = vi
      .fn()
      .mockImplementation(() => new Promise((r) => r("data")));

    const store = makeFetcher(keys, { fetcher, dedupeTime: 20 });
    const unsub = listener(reject, store, (v) => {
      expect(v.data).toBe("data");
    });
    (async function () {
      unsub();
      await delay(10);
      const unsubNew = listener(reject, store, (v) => {
        expect(v.data).toBe("data");
      });
      await delay(10);
      try {
        expect(fetcher).toHaveBeenCalledOnce();
        unsubNew();
        await delay(30);
        listener(reject, store, (v) => {
          expect(v.data).toBe("data");
        });
        expect(fetcher).toHaveBeenCalledTimes(2);
        done();
      } catch (error) {
        reject(error);
      }
    })();
  }));

test("nullable keys disable network fetching, but enable once are set", () =>
  new Promise<void>((done, reject) => {
    const $id = atom<string | null>(null);

    const keys = ["/api", "/key/", $id];
    const fetcher = vi
      .fn()
      .mockImplementation(() => new Promise((r) => r("data")));

    const store = makeFetcher(keys, { fetcher });
    storeValueSequence(done, reject, store, [
      { loading: true },
      { data: "data", loading: false },
    ]);
    (async function () {
      await delay(1);
      $id.set("id2");
      done();
    })();
  }));

test("__unsafeOverruleSettings overrides everything", () =>
  new Promise<void>((done, reject) => {
    const keys = ["/api", "/key"];
    const fetcher1 = vi
      .fn()
      .mockImplementation(() => new Promise((r) => r(null)));
    const fetcher2 = vi
      .fn()
      .mockImplementation(() => new Promise((r) => r(null)));

    const store = makeFetcher(keys, { fetcher: fetcher1 });
    __unsafeOverruleSettings({ fetcher: fetcher2 });

    storeValueSequence(() => null, reject, store, [
      { data: null, loading: false },
    ]);
    (async function () {
      await delay(1);
      expect(fetcher1).toBeCalledTimes(0);
      expect(fetcher2).toBeCalledTimes(1);
      done();
    })();
  }));

test("uses stale cache without setting loading state", () =>
  new Promise<void>((done, reject) => {
    const $id = atom<string>("id1");
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

    const store = makeFetcher(keys, { fetcher, dedupeTime: 0 });
    storeValueSequence(done, reject, store, [
      { loading: true },
      { data: "id1Value0", loading: false },
      { loading: true },
      { data: "id2Value1", loading: false },
      { data: "id1Value0", loading: false },
      { data: "id1Value2", loading: false },
    ]);
    (async function () {
      await delay(20);
      $id.set("id2");
      await delay(20);
      $id.set("id1");
    })();
  }));

function storeValueSequence(
  done: () => void,
  reject: (err: unknown) => void,
  store: ReadableAtom<any>,
  values: any[]
) {
  let i = 0;
  listener(reject, store, (v) => {
    expect(v).toEqual(values[i]);
    if (i >= values.length - 1) {
      return done();
    }
    i++;
  });
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function listener<T>(
  reject: (e: unknown) => void,
  store: ReadableAtom<T>,
  fn: (v: T) => void
) {
  return store.listen((v) => {
    try {
      fn(v);
    } catch (error) {
      reject(error);
    }
  });
}
