import { nanofetch, FetcherStore } from "../main";

const noop = () => null;

describe("types", () => {
  test(`specific fetcher overrides common fetcher's type`, () => {
    const emptyPromise = () => new Promise<null>(noop);

    const [createFetcher] = nanofetch({
      fetcher: emptyPromise,
    });
    type Res = { data: string };
    const $manual = createFetcher([""], {
      fetcher: () => new Promise<Res>(noop),
    });
    const { data } = $manual.get();
    expectTypeOf(data).toEqualTypeOf<Res | undefined>();

    createFetcher<Res>([""], {
      // @ts-expect-error: is limited by Res
      fetcher: emptyPromise,
    });
  });

  test("setting error type", () => {
    const [createFetcher] = nanofetch();

    type Err = { msg: string };
    const $manual = createFetcher<null, Err>([""], {
      fetcher: async () => null,
    });
    const { error } = $manual.get();
    expectTypeOf(error).toEqualTypeOf<Err | undefined>();
  });

  test("mutator accepts auto signature", () => {
    const [, createMutator] = nanofetch();

    type Data = { msg: string };
    type Error = { text: string };
    const $mutate = createMutator<Data, Error>(["keys"], async (data) => {
      expectTypeOf(data).toEqualTypeOf<Data>();
    });
    const { mutate, error } = $mutate.get();

    expectTypeOf(mutate({ msg: "" })).resolves.toEqualTypeOf<void>();
    expectTypeOf(error).toEqualTypeOf<Error | undefined>();
  });

  test("mutator accepts manual signature", () => {
    const [, createMutator] = nanofetch();

    type Data = { msg: string };
    type Error = { text: string };
    const $mutate = createMutator<Data, Error>(async ({ data, getMutator }) => {
      expectTypeOf(data).toEqualTypeOf<Data>();
      const [mutateCache, prevState] = getMutator("some-key");
      expectTypeOf(prevState).toEqualTypeOf<unknown>();
      expectTypeOf(mutateCache).parameter(0).toEqualTypeOf<unknown>();
    });
    const { mutate, error } = $mutate.get();

    expectTypeOf(mutate({ msg: "" })).resolves.toEqualTypeOf<void>();
    expectTypeOf(error).toEqualTypeOf<Error | undefined>();
  });
});
