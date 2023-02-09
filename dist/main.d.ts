import { MapStore, ReadableAtom } from "nanostores";
export declare type KeyInput = Array<string | ReadableAtom<string | null>>;
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
export declare type AutoMutator<T = unknown> = (data: T) => Promise<unknown>;
export declare type ManualMutator<T = unknown> = (args: {
    data: T;
    invalidate: (keys: Key | Key[]) => void;
    getCacheUpdater: <T = unknown>(key: Key, shouldRevalidate?: boolean) => [(newValue?: T) => void, T | undefined];
}) => Promise<unknown>;
export declare type MutatorStore<T = unknown, E = Error> = MapStore<{
    mutate: (data: T) => Promise<void>;
    loading?: boolean;
    error?: E;
}>;
export declare const nanofetch: ({ cache, fetcher, ...globalSettings }?: NanofetchArgs) => readonly [<T = unknown, E = any>(keyInput: KeyInput, { fetcher, ...fetcherSettings }?: CommonSettings<T>) => FetcherStore<T, E>, {
    <T_1 = unknown, E_1 = Error>(keysToInvalidate: Key[], mutator: AutoMutator<T_1>): MutatorStore<T_1, E_1>;
    <T_2 = unknown, E_2 = Error>(mutator: ManualMutator<T_2>): MutatorStore<T_2, E_2>;
}, {
    readonly __unsafeOverruleSettings: (data: CommonSettings) => void;
    readonly invalidateKeys: (keySelector: KeySelector) => void;
    readonly mutateCache: (keySelector: KeySelector, data?: unknown) => void;
}];
export {};
