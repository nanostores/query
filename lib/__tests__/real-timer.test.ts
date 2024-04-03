import { allTasks, atom } from "nanostores";
import { nanoquery } from "../main";
import { delay, noop } from "./setup";

test("correct events in conditional fetcher", async () => {
  const fetcher = vi.fn().mockImplementation(async () => {
    await delay(20);
    return 1;
  });
  const [makeFetcher] = nanoquery();
  const $conditional = atom<void | string>();

  const store = makeFetcher(["/api/some-key", $conditional], { fetcher });

  let events: any[] = [];
  store.listen((v) => {
    events.push(v);
  });

  expect(events[0]).toMatchObject({ loading: false });
  $conditional.set("123");
  await delay(0);
  expect(events[1]).toMatchObject({ loading: true });

  await delay(30);

  expect(events[2]).toMatchObject({ loading: false, data: 1 });
});

test("correct events in non-conditional fetcher", async () => {
  const fetcher = vi.fn().mockImplementation(async () => {
    await delay(20);
    return 1;
  });
  const [makeFetcher] = nanoquery();

  const store = makeFetcher("/api/some-key", { fetcher });

  let events: any[] = [];
  store.listen((v) => {
    events.push(v);
  });

  expect(events[0]).toMatchObject({ loading: true });

  await delay(30);
  expect(events[1]).toMatchObject({ loading: false, data: 1 });
});

test("emulating useSyncExternalStore behavior", async () => {
  const fetcher = vi.fn().mockImplementation(async () => {
    await delay(20);
    return 1;
  });
  const [makeFetcher] = nanoquery();

  const store = makeFetcher("/api/some-key", { fetcher });

  /**
   * TODO: bring in real `useSyncExternalStore`/other lib integrations
   */
  let events: any[] = [];
  store.get();
  await delay();
  const unbind = store.listen((v) => {
    events.push(v);
  });
  await delay();
  store.get();
  unbind();
  await delay();
  store.listen((v) => {
    events.push(v);
  });
  await delay(25);

  // 3 items, because 2 subscriptions
  expect(events.length).toBe(3);
  expect(events[0]).toMatchObject({ loading: true });
  expect(events[1]).toMatchObject({ loading: true });
  expect(events[2]).toMatchObject({ loading: false, data: 1 });
});

test("adds a nanostores task when running fetchers", async () => {
  const keys = ["/api", "/key"];
  const fetcher = vi.fn().mockImplementation(async () => {
    await delay(100);
    return "123";
  });

  const [makeFetcher] = nanoquery({ fetcher });
  const $store = makeFetcher(keys);
  $store.subscribe(noop);

  await allTasks();

  expect($store.get().data).toEqual("123");
});
