import { nanofetch } from "../main";

let makeFetcher: ReturnType<typeof nanofetch>[0],
  makeMutator: ReturnType<typeof nanofetch>[1];

beforeEach(() => {
  [makeFetcher, makeMutator] = nanofetch();
});

test("fetches once for multiple subscriptions", () =>
  new Promise<void>((done, reject) => {
    const fetcher = vi.fn().mockImplementation(async () => ({}));

    const keys = ["/api", "/key"];

    const store = makeFetcher(keys, { fetcher });
    const doFetch = () =>
      store.listen((v) => {
        try {
          expect(v.data).toBeTruthy();
          expect(fetcher).toHaveBeenCalledOnce();
          expect(fetcher).toHaveBeenCalledWith(...keys);
          done();
        } catch (error) {
          reject(error);
        }
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
    store.listen((v) => {
      try {
        expect(v.loading).toBeTruthy();
        expect(fetcher).toHaveBeenCalledOnce();
        expect(fetcher).toHaveBeenCalledWith(...keys);
        done();
      } catch (error) {
        reject(error);
      }
    });
  }));

test("propagates error state", () =>
  new Promise<void>((done, reject) => {
    const keys = ["/api", "/key"];
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() => new Promise((_, r) => r("err")));

    const store = makeFetcher(keys, { fetcher });
    store.listen((v) => {
      try {
        expect(v.error).toBe("err");
        expect(fetcher).toHaveBeenCalledOnce();
        expect(fetcher).toHaveBeenCalledWith(...keys);
        done();
      } catch (error) {
        reject(error);
      }
    });
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

    let updates = 0;
    let hadLoading = false,
      hadData = false;

    store.listen((v) => {
      updates++;
      try {
        if (v.loading) hadLoading = true;
        if (v.data) hadData = true;
      } catch (error) {
        reject(error);
      }

      if (updates === 2) {
        if (hadLoading && hadData) done();
        else reject("Too much updates");
      }
    });
  }));
