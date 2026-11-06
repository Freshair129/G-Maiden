import { describe, expect, it, vi } from "vitest";
import { ObsV5Client, obsAuthentication, validateObsEndpoint } from "./obsV5Client";

type Handler = (event: { data: string }) => void;

class MockObsSocket {
  readyState = 1;
  readonly sent: Array<{ op: number; d: Record<string, unknown> }> = [];
  private handlers = new Map<string, Handler[]>();

  addEventListener(type: string, handler: Handler): void {
    const list = this.handlers.get(type) ?? [];
    list.push(handler);
    this.handlers.set(type, list);
  }

  send(raw: string): void {
    this.sent.push(JSON.parse(raw) as { op: number; d: Record<string, unknown> });
  }

  close(): void {
    this.readyState = 3;
  }

  emit(op: number, d: Record<string, unknown>): void {
    const event = { data: JSON.stringify({ op, d }) };
    for (const handler of this.handlers.get("message") ?? []) handler(event);
  }

  respond(type: string, result: Record<string, unknown> = {}, ok = true): void {
    const request = [...this.sent].reverse().find((item) =>
      item.op === 6 && item.d.requestType === type
    );
    if (!request) throw new Error("Request not seen: " + type);
    this.emit(7, {
      requestId: request.d.requestId,
      requestType: type,
      requestStatus: { result: ok, code: ok ? 100 : 601 },
      responseData: result
    });
  }
}

async function handshake(
  client: ObsV5Client,
  socket: MockObsSocket
): Promise<void> {
  const connected = client.connect();
  socket.emit(0, {
    obsWebSocketVersion: "5.5.0",
    rpcVersion: 1,
    authentication: { challenge: "challenge", salt: "salt" }
  });
  await vi.waitFor(() => {
    expect(socket.sent.some((message) => message.op === 1)).toBe(true);
  });
  const identify = socket.sent.find((message) => message.op === 1);
  expect(identify?.d.eventSubscriptions).toBe(64);
  expect(identify?.d.authentication).toBe(
    await obsAuthentication("password", "salt", "challenge")
  );
  socket.emit(2, { negotiatedRpcVersion: 1 });
  await connected;
}

function makeClient(socket: MockObsSocket): ObsV5Client {
  return new ObsV5Client({
    password: "password",
    timeoutMs: 350,
    createSocket: () => socket as unknown as WebSocket
  });
}


describe("CR-040 OBS v5 local control boundary", () => {
  it("rejects non-loopback, credentialed or non-WebSocket endpoints", () => {
    expect(validateObsEndpoint("ws://127.0.0.1:4455")).toBe("ws://127.0.0.1:4455/");
    for (const bad of [
      "ws://192.168.1.50:4455",
      "wss://example.com:4455",
      "ws://user:secret@localhost:4455",
      "ws://localhost:4455/?password=secret",
      "ws://localhost:4455/capture",
      "http://localhost:4455",
      "ws://localhost"
    ]) {
      expect(() => validateObsEndpoint(bad)).toThrow();
    }
  });

  it("authenticates v5 challenge on localhost and listens only to output events", async () => {
    const socket = new MockObsSocket();
    const client = makeClient(socket);
    await handshake(client, socket);
    expect(client.state).toBe("ready");
    client.close();
    expect(client.state).toBe("disconnected");
  });

  it("fails closed when OBS has authentication disabled", async () => {
    const socket = new MockObsSocket();
    const client = makeClient(socket);
    const connecting = client.connect();
    socket.emit(0, { rpcVersion: 1 });
    await expect(connecting).rejects.toThrow("Invalid OBS protocol message");
    expect(client.state).toBe("error");
  });

  it("does not stop a replay buffer started by another application", async () => {
    const socket = new MockObsSocket();
    const client = makeClient(socket);
    await handshake(client, socket);
    const started = client.startReplayBuffer();
    await vi.waitFor(() => expect(socket.sent.some(
      (request) => request.d.requestType === "GetReplayBufferStatus"
    )).toBe(true));
    socket.respond("GetReplayBufferStatus", { outputActive: true });
    expect(await started).toBe("already_running");
    expect(await client.stopReplayBuffer()).toBe("not_owned");
    expect(socket.sent.some((request) =>
      request.d.requestType === "StopReplayBuffer")).toBe(false);
    client.close();
  });

  it("waits for BOTH SaveReplayBuffer response and ReplayBufferSaved path", async () => {
    const socket = new MockObsSocket();
    const client = makeClient(socket);
    await handshake(client, socket);
    const saving = client.saveReplayBuffer();
    await vi.waitFor(() => expect(socket.sent.some(
      (message) => message.d.requestType === "GetReplayBufferStatus"
    )).toBe(true));
    socket.respond("GetReplayBufferStatus", { outputActive: true });
    await vi.waitFor(() => expect(socket.sent.some(
      (message) => message.d.requestType === "SaveReplayBuffer"
    )).toBe(true));
    let settled = false;
    void saving.then(() => { settled = true; }, () => { settled = true; });
    socket.emit(5, {
      eventType: "ReplayBufferSaved",
      eventData: { savedReplayPath: "C:\\Clips\\replay.mkv" }
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    socket.respond("SaveReplayBuffer");
    await expect(saving).resolves.toEqual({
      savedReplayPath: "C:\\Clips\\replay.mkv",
      verifiedByEvent: true
    });
    client.close();
  });

  it("rejects concurrent save requests and a negative OBS request status", async () => {
    const socket = new MockObsSocket();
    const client = makeClient(socket);
    await handshake(client, socket);
    const saving = client.saveReplayBuffer();
    await vi.waitFor(() => expect(socket.sent.some(
      (message) => message.d.requestType === "GetReplayBufferStatus"
    )).toBe(true));
    socket.respond("GetReplayBufferStatus", { outputActive: true });
    await vi.waitFor(() => expect(socket.sent.some(
      (message) => message.d.requestType === "SaveReplayBuffer"
    )).toBe(true));
    const second = client.saveReplayBuffer();
    await expect(second).rejects.toThrow("already pending");
    socket.respond("SaveReplayBuffer", {}, false);
    await expect(saving).rejects.toThrow("OBS replay save request failed");
    await expect(client.saveReplayBuffer()).rejects.toThrow("outcome ambiguous");
    client.close();
  });

  it("withdraws pending save when OBS disconnects, never reporting success", async () => {
    const socket = new MockObsSocket();
    const client = makeClient(socket);
    await handshake(client, socket);
    const saving = client.saveReplayBuffer();
    await vi.waitFor(() => expect(socket.sent.some(
      (message) => message.d.requestType === "GetReplayBufferStatus"
    )).toBe(true));
    socket.respond("GetReplayBufferStatus", { outputActive: true });
    await vi.waitFor(() => expect(socket.sent.some(
      (message) => message.d.requestType === "SaveReplayBuffer"
    )).toBe(true));
    client.close();
    await expect(saving).rejects.toThrow("OBS client closed");
  });
});
