// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

const windowState = vi.hoisted(() => ({ label: "control" }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ label: windowState.label }) }));
vi.mock("../app/settings", () => ({
  StartupSettingsProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../CommandDeck", () => ({ default: () => <main>Command deck</main> }));

let root: Root | undefined;
let container: HTMLDivElement | undefined;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  container = undefined;
  vi.unstubAllEnvs();
});

it("renders the desktop deck on a signed-out release startup", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubEnv("DEV", false);
  windowState.label = "control";
  const { App } = await import("../App");
  container = document.createElement("div");
  root = createRoot(container);

  await act(async () => root!.render(<App />));

  expect(container.textContent).toContain("Command deck");
  expect(container.textContent).not.toContain("ดำเนินการต่อด้วย Google");
});
