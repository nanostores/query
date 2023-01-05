import { nanofetch, FetcherStore } from "../main";

type Expect<T extends true> = T;
type Equals<T, S> = [T] extends [S] ? ([S] extends [T] ? true : false) : false;

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
