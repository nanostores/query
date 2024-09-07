# Nano Stores Query

<img align="right" width="92" height="92" title="Nano Stores logo"
     src="https://nanostores.github.io/nanostores/logo.svg">

A tiny data fetcher for [Nano Stores](https://github.com/nanostores/nanostores).

- **Small**. 1.8 Kb (minified and gzipped).
- **Familiar DX**. If you've used [`swr`](https://swr.vercel.app/) or [`react-query`](https://react-query-v3.tanstack.com/), you'll get the same treatment, but for 10-20% of the size.
- **Built-in cache**. `stale-while-revalidate` caching from  [HTTP RFC 5861](https://tools.ietf.org/html/rfc5861). User rarely sees unnecessary loaders or stale data.
- **Revalidate cache**. Automaticallty revalidate on interval, refocus, network  recovery. Or just revalidate it manually.
- **Nano Stores first**. Finally, fetching logic *outside* of components. Plays nicely with [store events](https://github.com/nanostores/nanostores#store-events), [computed stores](https://github.com/nanostores/nanostores#computed-stores), [router](https://github.com/nanostores/router), and the rest.
- **Transport agnostic**. Use GraphQL, REST codegen, plain fetch or anything, that returns Promises (Web Workers, SubtleCrypto, calls to WASM, etc.).

<a href="https://evilmartians.com/?utm_source=nanostores-query">
  <img src="https://evilmartians.com/badges/sponsored-by-evil-martians.svg"
       alt="Sponsored by Evil Martians" width="236" height="54">
</a>

## Install

```sh
npm install nanostores @nanostores/query
```

## Usage

See [Nano Stores docs](https://github.com/nanostores/nanostores#guide) about using the store and subscribing to store’s changes in UI frameworks.

### Context

First, we define the context. It allows us to share the default fetcher implementation and general settings between all fetcher stores, and allows for simple mocking in tests and stories.

```ts
// store/fetcher.ts
import { nanoquery } from '@nanostores/query';

export const [createFetcherStore, createMutatorStore] = nanoquery({
  fetcher: (...keys: (string | number)[]) => fetch(keys.join('')).then((r) => r.json()),
});
```

Second, we create the fetcher store. `createFetcherStore` returns the usual `atom()` from Nano Stores, that is reactively connected to all stores passed as keys. Whenever the `$currentPostId` updates, `$currentPost` will call the fetcher once again.

```ts
// store/posts.ts
import { createFetcherStore } from './fetcher';

export const $currentPostId = atom('');
export const $currentPost = createFetcherStore<Post>(['/api/post/', $currentPostId]);
```

Third, just use it in your components. `createFetcherStore` returns the usual `atom()` from Nano Stores.

```tsx
// components/Post.tsx
const Post = () => {
  const { data, loading } = useStore($currentPost);

  if (data) return <div>{data.content}</div>;
  if (loading) return <>Loading...</>;
  
  return <>Error!</>;
};

```

## `createFetcherStore`

```ts
export const $currentPost = createFetcherStore<Post>(['/api/post/', $currentPostId]);
```

It accepts two arguments: **key input** and **fetcher options**.

```ts
type NoKey = null | undefined | void | false;
type SomeKey = string | number | true;

type KeyInput = SomeKey | Array<SomeKey | ReadableAtom<SomeKey | NoKey> | FetcherStore>;
```

Under the hood, nanoquery will get the `SomeKey` values and pass them to your fetcher like this: `fetcher(...keyParts)`. Few things to notice:

- if any atom value is either `NoKey`, we never call the fetcher—this is the conditional fetching technique we have;
- if you had `SomeKey` and then transitioned to `NoKey`, store's `data` will be also unset;
- you can, in fact, pass another fetcher store as a dependency! It's extremely useful, when you need to create reactive chains of requests that execute one after another, but only when previous one was successful. In this case, if this fetcher store has loaded its data, its key part will be the concatenated `key` of the store. [See this example](https://stackblitz.com/edit/react-ts-9rr8p8?file=App.tsx).

```ts
type Options = {
  // The async function that actually returns the data
  fetcher?: (...keyParts: SomeKey[]) => Promise<unknown>;
  // How much time should pass between running fetcher for the exact same key parts
  // default = 4000 (=4 seconds; provide all time in milliseconds)
  dedupeTime?: number;
  // Lifetime for the stale cache. It present stale cache will be shown to a user.
  // Cannot be less than `dedupeTime`.
  // default = Infinity
  cacheLifetime?: number;
  // If we should revalidate the data when the window focuses
  // default = false
  revalidateOnFocus?: boolean;
  // If we should revalidate the data when network connection restores
  // default = false
  revalidateOnReconnect?: boolean;
  // If we should run revalidation on an interval
  // default = 0, no interval
  revalidateInterval?: number;
  // Error handling for specific fetcher store. Will get whatever fetcher function threw
  onError?: (error: any) => void;
  // A function that defines a timeout for automatic invalidation in case of an error
  // default — set to exponential backoff strategy
  onErrorRetry?: OnErrorRetry | null;
}
```

The same options can be set on the context level where you actually get the
`createFetcherStore`.

## `createMutatorStore`

Mutator basically allows for 2 main things: tell nanoquery **what data should be revalidated** and **optimistically change data**. From interface point of view it's essentially a wrapper around your async function with some added functions.

It gets an object with 3 arguments:

- `data` is the data you pass to the `mutate` function;
- `invalidate` and `revalidate`; more on them in section [How cache works](#how-cache-works)
- `getCacheUpdater` allows you to get current cache value by key and update it with
a new value. The key is also revalidated by default.

```ts
export const $addComment = createMutatorStore<Comment>(
  async ({ data: comment, revalidate, getCacheUpdater }) => {
    // You can either revalidate the author…
    revalidate(`/api/users/${comment.authorId}`);

    // …or you can optimistically update current cache.
    const [updateCache, post] = getCacheUpdater(`/api/post/${comment.postId}`);
    updateCache({ ...post, comments: [...post.comments, comment] });

    // Even though `fetch` is called after calling `revalidate`, we will only
    // revalidate the keys after `fetch` resolves
    return fetch('…')
  }
);
```

The usage in component is very simple as well:

```tsx
const AddCommentForm = () => {
  const { mutate, loading, error } = useStore($addComment);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        mutate({ postId: "…", text: "…" });
      }}
    >
      <button disabled={loading}>Send comment</button>
      {error && <p>Some error happened!</p>}
    </form>
  );
};
```

`createMutatorStore` accepts an optional second argument with settings: 

```ts
type MutationOptions = {
  // Error handling for specific fetcher store. Will get whatever mutation function threw
  onError?: (error: any) => void;
  // Throttles all subsequent calls to `mutate` function until the first call finishes.
  // default: true
  throttleCalls?: boolean;
}
```

You can also access the mutator function via `$addComment.mutate`—the function is the same.

## _Third returned item_

(we didn't come up with a name for it 😅)

`nanoquery` function returns a third item that gives you a bit more manual control over the behavior of the cache.

```ts
// store/fetcher.ts
import { nanoquery } from '@nanostores/query';

export const [,, { invalidateKeys, revalidateKeys, mutateCache }] = nanoquery();
```

Both `invalidateKeys` and `revalidateKeys` accept one argument—the keys—in 3 different forms, that we call _key selector_. More on them in section [How cache works](#how-cache-works)

```ts
// Single key
invalidateKeys("/api/whoAmI");
// Array of keys
invalidateKeys(["/api/dashboard", "/api/projects"]);
/**
 * A function that will be called against all keys in cache.
 * Must return `true` if key should be invalidated.
 */
invalidateKeys((key) => key.startsWith("/api/job"));
```

`mutateCache` does one thing only: it mutates cache for those keys and refreshes all fetcher stores that have those keys currently.

```ts
/**
 * Accepts key in the same form as `invalidateKeys`: single, array and a function.
 */
mutateCache((key) => key === "/api/whoAmI", { title: "I'm Batman!" });
```

Keep in mind: we're talking about the serialized singular form of keys here. You cannot pass stuff like `['/api', '/v1', $someStore]`, it needs to be the full key in its string form.

## Recipes

### How cache works

All of this is based on [`stale-while-revalidate`](https://tools.ietf.org/html/rfc5861) methodology. The goal is simple:

1. user visits `page 1` that fetches `/api/data/1`;
2. user visits `page 2` that fetches `/api/data/2`;
3. almost immediately user goes back to `page 1`. Instead of showing a spinner and loading data once again, we fetch it from cache.

So, using this example, let's try to explain different cache-related settings the library has:

- `dedupeTime` is the time that user needs to spend on `page 2` before going back for the library to trigger fetch function once again.
- `cacheLifetime` is the maximum possible time between first visit and second visit to `page 1` after which we will stop serving stale cache to user (so they will immediately see a spinner).
- `revalidate` forces the `dedupeTime` for this key to be 0, meaning, the very next time anything can trigger fetch (e.g., `refetchOnInterval`), it will call fetch function. If you were on the page during revalidation, you'd see cached value during loading.
- `invalidate` kills this cache value entirely—it's as if you never were on this page. If you were on the page during invalidation, you'd see a spinner immediately.

So, the best UI, we think, comes from this snippet:

```tsx
// components/Post.tsx
const Post = () => {
  const { data, loading } = useStore($currentPost);

  if (data) return <div>{data.content}</div>;
  if (loading) return <>Loading...</>;
  
  return <>Error!</>;
};
```

This way you actually embrace the stale-while-revalidate concept and only show spinners when there's no cache, but other than that you always fall back to cached state.

### Local state and Pagination

All examples above use module-scoped stores, therefore they can only have a single
data point stored. But what if you need, say, a store that fetches data based on
component state? Nano Stores do not limit you in any way, you can easily achieve
this by creating a store instance limited to a single component:

```tsx
const createStore = (id: string) => () =>
  createFetcherStore<{ avatarUrl: string }>(`/api/user/${id}`);

const UserAvatar: FC<{ id: string }> = ({ id }) => {
  const [$user] = useState(createStore(id));

  const { data } = useStore($user);
  if (!data) return null;

  return <img src={data.avatarUrl} />;
};
```

This way you can leverage all nanoquery features, like cache or refetching, but
not give up the flexibility of component-level data fetching.

### Refetching and manual mutation

We've already walked through all the primitives needed for refetching and mutation, but the interface is rather bizarre with all those string-based keys. Often all we actually want is to refetch _current_ key (say, you have this refresh button in the UI), or mutate _current_ key, right?

For these cases we have 3 additional things on fetcher stores:

1. `fetcherStore.invalidate` and `fetcherStore.revalidate`
2. `fetcherStore.mutate`. It's a function that mutates current key for the fetcher. Accepts the new value.
3. `fetcherStore.key`. Well, it holds current key in serialized form (as a string).

Typically, those 3 are more than enough to make all look very good.

### Lazy fetcher

Sometimes you don't want a store, you just want an async function that's gonna handle the errors and leverage the cache (perform cache lookup, save data in there upon successful execution, etc.).

For that case use `fetcherStore.fetch` function. It will always resolve with the same data type as store itself (`error` and `data` only).

Few gotchas:

- it will execute against currently set keys (no way to customize them for the call);
- it will still leverage deduplication;
- underlying fetcher function cannot resolve or reject with `undefined` as their value. This will lead to hanging promises.

### Dependencies, but not in keys

Let's say, you have a dependency for your fetcher, but you don't want it to be in your fetcher keys. For example, this could be your `userId`—that would be a hassle to put it _everywhere_, but you need it, because once you change your user, you don't want to have stale cache from the previous user.

The idea here is to wipe the cache manually. For something as big as a new refresh token you can go and do a simple "wipe everything you find":

```ts
onSet($refreshToken, () => invalidateKeys(() => true))
```

If your store is somehow dependant on other store, but it shouldn't be reflected in the key, you should do the same, but more targetly:

```ts
onSet($someOutsideFactor, $specificStore.invalidate)
```

### Error handling

`nanoquery`, `createFetcherStore` and `createMutationStore` all accept an optional setting called `onError`. Global `onError` handler is called for all errors thrown from fetcher and mutation calls unless you set a local `onError` handler for a specific store (then it "overwrites" the global one).

`nanoquery` and `createFetcherStore` both accept and argument `onErrorRetry`. It also cascades down from context to each fetcher and can be rewritten by a fetcher. By default it implements an exponential backoff strategy with an element of randomness, but you can set your own according to `OnErrorRetry` signature. If you want to disable automatic revalidation for error responses, set this value to `null`.

This feature is particularly handy for stuff like showing flash notifications for all errors.

`onError` gets a single argument of whatever the fetch or mutate functions threw.

### React Native

React Native is fully supported. For `revalidateOnReconnect` to work, you need to install `@react-native-community/netinfo` package. It's optional: if you don't `reconnect` just won't trigger revalidation. The rest works as usual.

If you use [package exports](https://reactnative.dev/blog/2023/06/21/package-exports-support#enabling-package-exports-beta), you can import the library as usual. Otherwise, do this:

```ts
import { nanoquery } from "@nanostores/query/react-native";
```
