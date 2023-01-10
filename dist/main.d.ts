import { ReadableAtom, WritableAtom } from "nanostores";
declare type MaybePromise<T> = T | Promise<T>;
export declare type KeyInput = Array<string | ReadableAtom<string | null>>;
declare type Key = string;
declare type KeyParts = Key[];
export declare type Fetcher<T> = (...args: KeyParts) => MaybePromise<T>;
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
    cache?: Map<Key, any>;
} & CommonSettings;
export declare type FetcherValue<T = any, E = Error> = {
    data?: T;
    error?: E;
    loading: boolean;
};
export declare type FetcherStore<T = any, E = Error> = WritableAtom<FetcherValue<T, E>>;
export declare type FetcherStoreCreator<T = any, E = Error> = (keys: KeyInput, settings?: CommonSettings<T>) => FetcherStore<T, E>;
export declare const nanofetch: ({ cache, fetcher, ...globalSettings }?: NanofetchArgs) => readonly [<T = unknown, E = any>(keyInput: KeyInput, { fetcher, ...fetcherSettings }?: CommonSettings<T>) => FetcherStore<T, E>, (mutator: any) => void, (data: CommonSettings) => void];
export {};
