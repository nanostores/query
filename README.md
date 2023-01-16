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
- **Revalidation**. Automaticallty revalidate on interval, refocus, network recovery.
Or just revalidate it manually.
- **Nano Stores first**. Finally, fetching logic *outside* of components. Plays nicely
with [store events](https://github.com/nanostores/nanostores#store-events),
[computed stores](https://github.com/nanostores/nanostores#computed-stores),
[router](https://github.com/nanostores/router), and the rest. **Framework agnostic**.

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

### To Do

- fetcher options
- what is `key` + сonditional fetching via `null`
- how to use mutator store
- recipes for popular things: 
  - router integration
  - pagination + infinite scroll
  - tests, stories
  - SSR, next/nuxt usage

### Roadmap

Ideas for future:

1. get some ideas from [swr](https://swr.vercel.app/docs/api#options) and
[tanstack-query](https://react-query-v3.tanstack.com/)
2. events (global and isolated to a single store)
