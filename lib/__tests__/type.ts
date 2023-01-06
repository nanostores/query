import { ReadableAtom } from "nanostores";
import { nanofetch, FetcherStore } from "../main";

type Expect<T extends true> = T;
type Equals<T, S> = [T] extends [S] ? ([S] extends [T] ? true : false) : false;

type IStoreValue<T> = T extends ReadableAtom<infer U> ? U : T;

const noop = () => null;
const emptyPromise = () => new Promise<null>(noop);

{
  // Below usage is not limited by context's typing
  const [createFetcher] = nanofetch({
    fetcher: emptyPromise,
  });

  type Res = { data: string };
  const manual = createFetcher([""], {
    fetcher: () => new Promise<Res>(noop),
  });
  type manualTest = Expect<Equals<typeof manual, FetcherStore<Res>>>;

  createFetcher<Res>([""], {
    // @ts-expect-error: is limited by Res
    fetcher: emptyPromise,
  });
}

{
  const [createFetcher] = nanofetch();

  type Err = { msg: string };
  const manual = createFetcher<null, Err>([""], {
    fetcher: () => null,
  });
  type manualVal = IStoreValue<typeof manual>["error"];
  type manualTest = Expect<Equals<manualVal, Err | undefined>>;
}
