import { ReadableAtom, WritableAtom } from "nanostores";
export declare type KeyInput = Array<string | ReadableAtom<string | null>>;
declare type Key = string;
declare type KeyParts = Key[];
export declare type Fetcher<T> = (...args: KeyParts) => Promise<T>;
declare type RefetchSettings = {
    dedupeTime?: number;
    refetchOnFocus?: boolean;
    refetchOnReconnect?: boolean;
    refetchInterval?: number;
};
declare type CommonSettings<T = unknown> = {
    fetcher?: Fetcher<T>;
} & RefetchSettings;
declare type NanofetchArgs = {
    cache?: Map<string, any>;
} & CommonSettings;
export declare type FetcherValue<T = any, E = Error> = {
    data?: T;
    error?: E;
    loading: boolean;
};
export declare type FetcherStore<T = any, E = Error> = WritableAtom<FetcherValue<T, E>>;
export declare const nanofetch: ({ cache, fetcher, ...globalSettings }?: NanofetchArgs) => readonly [<T = unknown>(keys: KeyInput, { fetcher, ...fetcherSettings }?: CommonSettings<T>) => FetcherStore<T, Error>, (mutator: any) => void, (data: CommonSettings) => void];
export {};
