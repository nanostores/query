import { renderHook, act } from "@testing-library/react";
import { useStore } from "@nanostores/react";

import { nanoquery } from "../main";
import { delay } from "./setup";
import { atom } from "nanostores";

test("basic unconditional render", async () => {
  const fetcher = vi.fn().mockImplementation(async () => {
    await delay(20);
    return 1;
  });
  const [makeFetcher] = nanoquery();

  const store = makeFetcher("/api/some-key", { fetcher });

  const { result } = renderHook(() => useStore(store));
  expect(result.current.loading).toBe(true);
  await delay();
  expect(result.current.loading).toBe(true);
  await act(() => delay(25));
  expect(result.current.loading).toBe(false);
  expect(result.current.data).toBe(1);
});

test("basic conditional render", async () => {
  const fetcher = vi.fn().mockImplementation(async () => {
    await delay(20);
    return 1;
  });
  const [makeFetcher] = nanoquery();
  const $key = atom<string | null>(null);

  const store = makeFetcher(["/api/some-key", $key], { fetcher });

  const { result } = renderHook(() => useStore(store));
  expect(result.current.loading).toBe(false);
  await delay();
  expect(result.current.loading).toBe(false);
  act(() => $key.set("123"));
  expect(result.current.loading).toBe(true);
  await act(() => delay(25));
  expect(result.current.loading).toBe(false);
  expect(result.current.data).toBe(1);
});
