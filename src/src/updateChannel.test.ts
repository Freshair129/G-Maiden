import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

describe("stable desktop updater", () => {
  beforeEach(() => { invokeMock.mockReset().mockResolvedValue(null); });

  it("checks through the native stable-channel command without renderer channel input", async () => {
    const { checkChannelUpdate } = await import("./updateChannel");

    await expect(checkChannelUpdate()).resolves.toBeNull();
    expect(invokeMock).toHaveBeenCalledOnce();
    expect(invokeMock).toHaveBeenCalledWith("check_channel_update");
  });
});
