# Nano Stores Query

<img align="right" width="92" height="92" title="Nano Stores logo"
     src="https://nanostores.github.io/nanostores/logo.svg">

A tiny data fetcher for [Nano Stores](https://github.com/nanostores/nanostores).

- **Small**. 1.65 Kb (minified and gzipped).
- **Familiar DX**. If you've used [`swr`](https://swr.vercel.app/) or
[`react-query`](https://react-query-v3.tanstack.com/), you'll get the same treatment,
but for 10-20% of the size.
- **Built-in cache**. `stale-while-revalidate` caching from 
[HTTP RFC 5861](https://tools.ietf.org/html/rfc5861). User rarely sees unnecessary
loaders or stale data.
- **Revalidate cache**. Automaticallty revalidate on interval, refocus, network 
recovery. Or just revalidate it manually.
- **Nano Stores first**. Finally, fetching logic *outside* of components. Plays nicely
with [store events](https://github.com/nanostores/nanostores#store-events),
[computed stores](https://github.com/nanostores/nanostores#computed-stores),
[router](https://github.com/nanostores/router), and the rest.
- **Transport agnostic**. Use GraphQL, REST codegen, plain fetch or anything,
that returns Promises.

<a href="https://evilmartians.com/?utm_source=nanostores-query">
  <img src="https://evilmartians.com/badges/sponsored-by-evil-martians.svg"
       alt="Sponsored by Evil Martians" width="236" height="54">
</a>

## Install

```sh
npm install nanostores @nanostores/query
```

## Usage

See [Nano Stores docs](https://github.com/nanostores/nanostores#guide)
about using the store and subscribing to store’s changes in UI frameworks.

### Query

First, we define the context. It allows us to share the default fetcher
implementation between all fetcher stores, refetching settings, and allows for
simple mocking in tests and stories.

```ts
// store/fetcher.ts
import { nanoquery } from '@nanostores/query';

export const [createFetcherStore, createMutatorStore] = nanoquery({
  fetcher: (...keys: string[]) => fetch(keys.join('')).then((r) => r.json()),
});
```

Second, we create the fetcher store. `createFetcherStore` returns the usual `atom()`
from Nano Stores, that is reactively connected to all stores passed as keys. Whenever
the `$currentPostId` updates, `$currentPost` will call the fetcher once again.

```ts
// store/posts.ts
import { createFetcherStore } from './fetcher';

export const $currentPostId = atom('');
export const $currentPost = createFetcherStore<Post>(['/api/post/', $currentPostId]);
```

Third, just use it in your components. `createFetcherStore` returns the usual
`atom()` from Nano Stores.

```tsx
// components/Post.tsx
const Post = () => {
  const { data, loading } = useStore($currentPost);
  if (loading) return <>Loading...</>;
  if (!data) return <>Error!</>;

  return <div>{data.content}</div>;
};

```

## `createFetcherStore`

```ts
export const $currentPost = createFetcherStore<Post>(['/api/post/', $currentPostId]);
```

It accepts two arguments: **key** and **fetcher options**.

```ts
type KeyParts = undefined | Array<ReadableAtom<string | null | undefined> | string>
```

Under the hood, nanoquery will get the string values and pass them to your fetcher
like this: `fetcher(...keyPartsAsStrings)`. If any atom value is either `null` or
`undefined`, we never call the fetcher—this is the conditional fetching technique we
have.

```ts
type Options = {
  // The async function that actually returns the data
  fetcher?: (...keyParts: string[]) => Promise<unknown>;
  // How much time should pass between running fetcher for the exact same key parts
  // default = 4s
  dedupeTime?: number;
  // If we should revalidate the data when the window focuses
  // default = false
  refetchOnFocus?: boolean;
  // If we should revalidate the data when network connection restores
  // default = false
  refetchOnReconnect?: boolean;
  // If we should run revalidation on an interval, in ms
  // default = 0, no interval
  refetchInterval?: number;
}
```

The same options can be set on the context level where you actually get the
`createFetcherStore`.

## `createMutatorStore`

Mutator basically allows for 2 main things: tell nanoquery **what data should be
revalidated** and **optimistically change data**. From interface point of view it's
essentially a wrapper around your async function with some added functions.

It gets an object with 3 arguments:

- `data` is the data you pass to the `mutate` function;
- `invalidate` allows you to mark other keys as stale so they are refetched next time;
- `getCacheUpdater` allows you to get current cache value by key and update it with
a new value. The key is also invalidated by default.

```ts
export const $addComment = createMutatorStore<Comment>(
  async ({ data: comment, invalidate, getCacheUpdater }) => {
    // You can either invalidate the author…
    invalidate(`/api/users/${comment.authorId}`);

    // …or you can optimistically update current cache.
    const [updateCache, post] = getCacheUpdater(`/api/post/${comment.postId}`);
    updateCache({ ...post, comments: [...post.comments, comment] });

    // Even though `fetch` is called after calling `invalidate`, we will only
    // invalidate the keys after `fetch` resolves
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
