// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { mockCatalog } = vi.hoisted(() => {
  const state: {
    request: Promise<{ data: unknown; error: unknown }>;
    signal: AbortSignal | null;
  } = {
    request: Promise.resolve({ data: [], error: null }),
    signal: null,
  };
  const query = {} as {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    abortSignal: ReturnType<typeof vi.fn>;
    then: (resolve?: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise<unknown>;
  };
  Object.assign(query, {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    abortSignal: vi.fn((signal: AbortSignal) => { state.signal = signal; return query; }),
    then: (resolve?: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => state.request.then(resolve, reject),
  });
  return { mockCatalog: { state, query } };
});

vi.mock("../supabase", () => ({ supabase: { from: vi.fn(() => mockCatalog.query) } }));
vi.mock("../auth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("../wallet", () => ({ useWallet: () => ({ shardBalance: 0, walletBalance: 0, purchase: vi.fn() }) }));
vi.mock("../TopupModal", () => ({ default: () => null }));

import StorePage from "../StorePage";

let root: ReturnType<typeof createRoot> | null = null;
let element: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    disconnect() {}
  });
  mockCatalog.state.request = Promise.resolve({ data: [], error: null });
  mockCatalog.state.signal = null;
  mockCatalog.query.select.mockClear();
  mockCatalog.query.eq.mockClear();
  mockCatalog.query.order.mockClear();
  mockCatalog.query.abortSignal.mockClear().mockImplementation((signal: AbortSignal) => {
    mockCatalog.state.signal = signal;
    return mockCatalog.query;
  });
  element = document.createElement("div");
  root = createRoot(element);
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("ends a stalled catalog request, shows a retry, and renders the retry result", async () => {
  let rejectRequest!: (error: unknown) => void;
  mockCatalog.state.request = new Promise((_resolve, reject) => { rejectRequest = reject; });
  mockCatalog.query.abortSignal.mockImplementation((signal: AbortSignal) => {
    mockCatalog.state.signal = signal;
    signal.addEventListener("abort", () => rejectRequest(new DOMException("aborted", "AbortError")), { once: true });
    return mockCatalog.query;
  });
  vi.useFakeTimers();

  await act(async () => root?.render(<StorePage />));
  expect(element.textContent).toContain("กำลังโหลดร้านค้า");

  await act(async () => { await vi.advanceTimersByTimeAsync(8_000); });
  expect(mockCatalog.state.signal?.aborted).toBe(true);
  expect(element.textContent).toContain("ร้านค้าตอบกลับช้าเกินไป");
  const retry = [...element.querySelectorAll("button")].find((button) => button.textContent?.includes("ลองอีกครั้ง"));
  expect(retry).toBeDefined();

  mockCatalog.state.request = Promise.resolve({ data: [], error: null });
  await act(async () => { retry!.click(); });
  expect(element.textContent).toContain("ยังไม่มีสินค้าในร้านค้าตอนนี้");
  expect(element.textContent).not.toContain("กำลังโหลดร้านค้า");
});

it("ends loading when the catalog query rejects", async () => {
  mockCatalog.state.request = Promise.reject(new Error("network unavailable"));
  await act(async () => root?.render(<StorePage />));
  expect(element.textContent).toContain("network unavailable");
  expect(element.textContent).toContain("ลองอีกครั้ง");
  expect(element.textContent).not.toContain("กำลังโหลดร้านค้า");
});
