import { MapStore, ReadableAtom } from "nanostores";
export declare type KeyInput = string | Array<string | ReadableAtom<string | null | undefined>>;
declare type Key = string;
declare type KeyParts = string[];
declare type KeySelector = Key | Key[] | ((key: Key) => boolean);
export declare type Fetcher<T> = (...args: KeyParts) => Promise<T>;
declare type EventTypes = {
    onError?: (error: any) => unknown;
};
declare type RefetchSettings = {
    dedupeTime?: number;
    refetchOnFocus?: boolean;
    refetchOnReconnect?: boolean;
    refetchInterval?: number;
};
declare type CommonSettings<T = unknown> = {
    fetcher?: Fetcher<T>;
} & RefetchSettings & EventTypes;
declare type NanofetchArgs = {
    cache?: Map<Key, any>;
} & CommonSettings;
export declare type FetcherValue<T = any, E = Error> = {
    data?: T;
    error?: E;
    loading: boolean;
};
export declare type FetcherStore<T = any, E = any> = MapStore<FetcherValue<T, E>>;
export declare type FetcherStoreCreator<T = any, E = Error> = (keys: KeyInput, settings?: CommonSettings<T>) => FetcherStore<T, E>;
export declare type ManualMutator<Data = void, Result = unknown> = (args: {
    data: Data;
    invalidate: (key: Key) => void;
    getCacheUpdater: <T = unknown>(key: Key, shouldRevalidate?: boolean) => [(newValue?: T) => void, T | undefined];
}) => Promise<Result>;
export declare type MutatorStore<Data = void, Result = unknown, E = Error> = MapStore<{
    mutate: (data: Data) => Promise<Result>;
    data?: Result;
    loading?: boolean;
    error?: E;
}>;
export declare const nanofetch: ({ cache, fetcher, ...globalSettings }?: NanofetchArgs) => readonly [<T = unknown, E = any>(keyInput: KeyInput, { fetcher, ...fetcherSettings }?: CommonSettings<T>) => FetcherStore<T, E>, <Data = void, Result = unknown, E_1 = any>(mutator: ManualMutator<Data, Result>) => MutatorStore<Data, Result, E_1>, {
    readonly __unsafeOverruleSettings: (data: CommonSettings) => void;
    readonly invalidateKeys: (keySelector: KeySelector) => void;
    readonly mutateCache: (keySelector: KeySelector, data?: unknown) => void;
}];
export {};
