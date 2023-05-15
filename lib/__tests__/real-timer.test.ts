import { atom } from "nanostores";
import { nanoquery } from "../main";

beforeAll(() => {
  const eventToCb: Record<string, () => void> = {};
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal(
    "addEventListener",
    (name: string, cb: () => void) => (eventToCb[name] = cb)
  );
  vi.stubGlobal("dispatchEvent", (evt: { type: string }) => {
    eventToCb?.[evt.type]?.();
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

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

  await delay(0);
  $conditional.set("123");
  await delay(30);

  expect(events[0]).toMatchObject({ loading: false });
  expect(events[1]).toMatchObject({ loading: true });
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

  await delay(30);

  expect(events[0]).toMatchObject({ loading: true });
  expect(events[1]).toMatchObject({ loading: false, data: 1 });
});

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
