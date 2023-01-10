import { nanofetch, FetcherStore } from "../main";

const noop = () => null;

describe("types", () => {
  test(`specific fetcher overrides common fetcher's type`, () => {
    const emptyPromise = () => new Promise<null>(noop);

    const [createFetcher] = nanofetch({
      fetcher: emptyPromise,
    });
    type Res = { data: string };
    const manual = createFetcher([""], {
      fetcher: () => new Promise<Res>(noop),
    });

    expectTypeOf(manual).toEqualTypeOf<FetcherStore<Res, any>>();
    createFetcher<Res>([""], {
      // @ts-expect-error: is limited by Res
      fetcher: emptyPromise,
    });
  });

  test("setting error type", () => {
    const [createFetcher] = nanofetch();

    type Err = { msg: string };
    const manual = createFetcher<null, Err>([""], {
      fetcher: () => null,
    });

    expectTypeOf(manual).toEqualTypeOf<FetcherStore<null, Err>>();
  });
});
