# Nano Stores Fetcher

<img align="right" width="92" height="92" title="Nano Stores logo"
     src="https://nanostores.github.io/nanostores/logo.svg">

A data fetcher for [Nano Stores](https://github.com/nanostores/nanostores).

- **Small**. 1.66 Kb (minified and gzipped).
- **Familiar DX**. If you've used [`swr`](https://swr.vercel.app/) or
[`react-query`](https://react-query-v3.tanstack.com/), you already know how nanofetch
works.
- **Built-in cache**. `stale-while-revalidate` caching from 
[HTTP RFC 5861](https://tools.ietf.org/html/rfc5861). User rarely sees unnecessary
loaders.
- **Revalidate cache**. Automaticallty revalidate on interval, refocus, network 
recovery. Or just revalidate it manually.
- **Nano Stores first**. Finally, fetching logic *outside* of components. Plays nicely
with [store events](https://github.com/nanostores/nanostores#store-events),
[computed stores](https://github.com/nanostores/nanostores#computed-stores),
[router](https://github.com/nanostores/router), and the rest.

---

First, we define the context. It allows us to share the default fetcher
implementation between all fetcher stores, refetching settings, and allows for
simple mocking in tests and stories.

```ts
// store/fetcher.ts
import { nanofetch } from '@nanostores/nanofetch';

export const [createFetcherStore, createMutatorStore] = nanofetch({
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
type KeyParts = Array<ReadableAtom<string | null> | string>
```

Under the hood, nanofetcher will get the string values and pass them to your fetcher
like this: `fetcher(...keyPartsAsStrings)`. If any atom value is `null`, we never call
the fetcher—this is the conditional fetching technique we have.

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

Mutator basically allows for 2 main things: tell nanofetch **what data should be
revalidated** and **optimistically change data**. Two things = two simple interfaces.

**Auto mutator** should be used when you know **ahead of time** what keys need to be 
revalidated. Notice, that we use the *keys* here, so it's *concatenated key parts*.
One auto mutator can revalidate many keys.

```ts
export const $addComment = createMutatorStore<Comment>(
  ["/api/posts", "/api/mainPage"],
  async (comment) => {
    // Send POST request
  }
);
```

**Manual mutator** should be used when the keys you want to revalidate are either
data-dependant, or you want to optimistically update the UI.

```ts
export const $addComment = createMutatorStore<Comment>(
  async ({ data: comment, invalidate, getCacheUpdater }) => {
    // Dynamic invalidation key
    invalidate(`/api/users/${comment.authorId}`);

    // Get previous cache state by key and update it optimistically
    const [updateCache, post] = getCacheUpdater(`/api/post/${comment.postId}`);
    updateCache({ ...post, comments: [...post.comments, comment] });

    // …and send POST request
  }
);
```

The usage is very simple as well:

```tsx
const AddCommentForm = () => {
  const { mutate, loading, error } = useStore($addComment);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        mutate({ postId: "", text: "" });
      }}
    >
      <button disabled={loading}>Send comment</button>
      {error && <p>Some error happened!</p>}
    </form>
  );
};
```

### To Do

- installation instructions
- recipes for popular things: 
  - creating reactive chains (from one store to another)
  - router integration
  - pagination + infinite scroll
  - tests, stories
  - SSR, next/nuxt usage

### Roadmap

Ideas for future:

1. get some ideas from [swr](https://swr.vercel.app/docs/api#options) and
[tanstack-query](https://react-query-v3.tanstack.com/)
2. events (global and isolated to a single store)
