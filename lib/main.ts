import { nanoqueryFactory } from "./factory";
import { browserCompat } from "./platforms/browser";

export type {
  KeyInput,
  KeySelector,
  Fetcher,
  OnErrorRetry,
  CommonSettings,
  NanoqueryArgs,
  FetcherValue,
  FetcherStore,
  FetcherStoreCreator,
  ManualMutator,
  MutateCb,
  MutatorStore,
} from "./factory";

export const nanoquery = nanoqueryFactory(browserCompat);
