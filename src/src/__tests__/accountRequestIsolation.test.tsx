// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ user: { id: "A" } as { id: string } | null,
  requests: [] as Array<{ table: string; user: string; resolve: (value: { data: unknown; error: null }) => void }>,
  mint: vi.fn(), purchase: vi.fn() }));
vi.mock("../auth", () => ({ useAuth: () => ({ user: fixture.user }) }));
vi.mock("../TopupModal", () => ({ default: () => null }));
vi.mock("../supabase", () => ({ supabase: {
  from: (table: string) => {
    let user = "";
    const request = new Promise<{ data: unknown; error: null }>((resolve) => {
      fixture.requests.push({ table, get user() { return user; }, resolve });
    });
    const query = { select: () => query, eq: (key: string, value: string) => {
      if (key === "id" || key === "user_id") user = value;
      return query;
    }, maybeSingle: () => request, gte: () => request, order: () => query, limit: () => query, lt: () => query,
    abortSignal: () => request, upsert: (row: { id: string }) => { user = row.id; return request; }, then: request.then.bind(request) };
    return query;
  }, functions: { invoke: fixture.mint }, rpc: fixture.purchase,
  channel: () => { const channel = { on: () => channel, subscribe: () => channel }; return channel; },
  removeChannel: vi.fn(),
} }));

import { useProfile } from "../profile";
import { useWallet } from "../wallet";
import StorePage from "../StorePage";

let root: Root;
let element: HTMLDivElement;
let profile: ReturnType<typeof useProfile>;
let wallet: ReturnType<typeof useWallet>;
let renders: Array<{ user: string | null; name: string; balance: number }>;
function Account() {
  profile = useProfile(); wallet = useWallet();
  renders.push({ user: fixture.user?.id ?? null, name: profile.displayName, balance: wallet.shardBalance });
  return <StorePage />;
}
async function render(user: string | null) {
  fixture.user = user ? { id: user } : null;
  await act(async () => root.render(<Account />));
}
async function respond(user: string, table: string, data: unknown) {
  const pending = fixture.requests.filter((request) => request.user === user && request.table === table);
  expect(pending.length).toBeGreaterThan(0);
  fixture.requests = fixture.requests.filter((request) => !pending.includes(request));
  await act(async () => pending.forEach((request) => request.resolve({ data, error: null })));
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  fixture.requests = [];
  renders = [];
  fixture.mint.mockReset().mockResolvedValue({ data: { gid_code: "minted" } });
  fixture.purchase.mockReset().mockResolvedValue({ error: null });
  element = document.createElement("div"); root = createRoot(element);
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });

it.each([null, "B"])("rejects delayed A profile, wallet and inventory after changing to %s", async (next) => {
  await render("A");
  await respond("", "catalog_items", [{ id: "pack", title: "Pack", currency: "shard", price: 1 }]);
  await respond("", "economy_config", { value: 100 });
  await render(next);
  await respond("A", "profiles", { display_name: "A private", gid_code: "A-GID", generation: "G" });
  await respond("A", "wallets", { shard_balance: 999 });
  await respond("A", "wallet_ledger", [{ amount: 999 }]);
  await respond("A", "inventory", [{ item_id: "pack" }]);
  expect(profile.displayName).toBe("");
  expect(profile.gidCode).toBe("");
  expect(wallet.shardBalance).toBe(0);
  expect(element.textContent).not.toContain("เป็นเจ้าของ");
});

it("does not mint a GID for a delayed old profile or publish an old save", async () => {
  await render("A");
  let saving!: Promise<string | null>;
  await act(async () => { saving = profile.save("old saved name"); });
  await render("B");
  await respond("A", "profiles", { display_name: "A private", gid_code: null });
  await saving;
  expect(fixture.mint).not.toHaveBeenCalled();
  expect(profile.displayName).toBe("");
});

it("clears a loaded old account immediately while the new account waits", async () => {
  await render("A");
  await respond("A", "profiles", { display_name: "A private", gid_code: "A-GID" });
  await respond("", "economy_config", { value: 100 });
  await respond("A", "wallets", { shard_balance: 999 });
  await respond("A", "wallet_ledger", []);
  expect(profile.displayName).toBe("A private"); expect(wallet.shardBalance).toBe(999);
  await render("B");
  expect(profile.displayName).toBe(""); expect(profile.gidCode).toBe("");
  expect(wallet.shardBalance).toBe(0);
  expect(renders.filter((render) => render.user === "B").every((render) => render.name === "" && render.balance === 0)).toBe(true);
});

it("does not return an old ledger or topup result to the switched account", async () => {
  await render("A");
  let finishTopup!: (value: unknown) => void;
  fixture.mint.mockReturnValueOnce(new Promise((resolve) => { finishTopup = resolve; }));
  const topup = wallet.topup("synthetic-package", "promptpay").then(() => "leaked", () => "discarded");
  const ledger = wallet.ledger().then(() => "leaked", () => "discarded");
  expect(fixture.requests.filter((request) => request.user === "A" && request.table === "wallet_ledger")).toHaveLength(3);
  await render("B");
  await respond("A", "wallet_ledger", [{ id: 1, currency: "wallet", entry_type: "topup", amount: 9 }]);
  await act(async () => finishTopup({ data: { order_id: "old-order", expires_at: "never" }, error: null }));
  expect(await topup).toBe("discarded");
  expect(await ledger).toBe("discarded");
});

it("does not refresh old ownership or show old purchase success after switching accounts", async () => {
  await render("A");
  await respond("", "catalog_items", [{ id: "pack", title: "Pack", currency: "shard", price: 1 }]);
  await respond("", "economy_config", { value: 100 });
  await respond("A", "wallets", { shard_balance: 999 });
  await respond("A", "wallet_ledger", []);
  await respond("A", "inventory", []);
  let finish!: (value: unknown) => void;
  fixture.purchase.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
  const buy = element.querySelector<HTMLButtonElement>(".store-buy-btn")!;
  await act(async () => buy.click());
  await act(async () => element.querySelector<HTMLButtonElement>(".store-confirm-ok")!.click());
  await render("B");
  const aRequests = fixture.requests.filter((request) => request.user === "A").length;
  await act(async () => finish({ error: null }));
  expect(fixture.requests.filter((request) => request.user === "A")).toHaveLength(aRequests);
  expect(element.textContent).not.toContain("สำเร็จ");
  expect(element.querySelector(".store-confirm-sheet")).toBeNull();
  await respond("", "economy_config", { value: 100 });
  await respond("B", "wallets", { shard_balance: 333 });
  await respond("B", "wallet_ledger", []);
  expect(wallet.shardBalance).toBe(333);
});
