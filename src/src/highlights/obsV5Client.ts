/**
 * CR-040: OBS Studio 5.x WebSocket control channel.
 *
 * Source-only OBS-first MVP adapter. This is NOT the CV frame transport and
 * MUST never run on the GSI/G-Signal hot path. Passwords are supplied only for
 * this session and must not be logged, persisted or exposed through Tauri events.
 * The authenticated OBS service must be explicitly enabled by the user.
 *
 * OBS protocol: https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md
 */
export type ObsConnectionState =
  | "disconnected"
  | "connecting"
  | "authenticating"
  | "ready"
  | "error";

export interface ObsReplayReceipt {
  savedReplayPath: string;
  /** Request acknowledgment AND ReplayBufferSaved event both observed. */
  verifiedByEvent: true;
}

export interface ObsSocketOptions {
  endpoint?: string;
  /** Ephemeral; caller owns collection and MUST NOT persist this value. */
  password: string;
  timeoutMs?: number;
  createSocket?: (url: string) => WebSocket;
}

interface ObsEnvelope {
  op: number;
  d?: Record<string, unknown>;
}

interface PendingRequest {
  resolve: (result: Record<string, unknown>) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

interface PendingSave {
  resolve: (result: ObsReplayReceipt) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
  path?: string;
  acknowledged: boolean;
}

const DEFAULT_ENDPOINT = "ws://127.0.0.1:4455";
const DEFAULT_TIMEOUT_MS = 5000;
const OUTPUT_EVENTS = 1 << 6;
const MAX_PENDING_REQUESTS = 8;

export function validateObsEndpoint(input: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("OBS endpoint is invalid");
  }
  if (url.protocol !== "ws:" ||
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      url.username || url.password || url.pathname !== "/" ||
      url.search || url.hash || !url.port) {
    throw new Error("OBS endpoint must be an authenticated loopback WebSocket");
  }
  return url.toString();
}

async function digestBase64(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return btoa(Array.from(hash, (byte) => String.fromCharCode(byte)).join(""));
}

export async function obsAuthentication(
  password: string,
  salt: string,
  challenge: string
): Promise<string> {
  const secret = await digestBase64(password + salt);
  return digestBase64(secret + challenge);
}

/**
 * A source-only noncritical OBS adapter for the Control window.
 * It intentionally does not start OBS, change mic inputs, or change scenes.
 */
export class ObsV5Client {
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly createSocket: (url: string) => WebSocket;
  private password: string;
  private socket: WebSocket | null = null;
  private stateValue: ObsConnectionState = "disconnected";
  private connectResolve: (() => void) | null = null;
  private connectReject: ((error: Error) => void) | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private requests = new Map<string, PendingRequest>();
  private pendingSave: PendingSave | null = null;
  private startedReplayByUs = false;
  private taintedSaveSession = false;

  constructor(options: ObsSocketOptions) {
    this.endpoint = validateObsEndpoint(options.endpoint ?? DEFAULT_ENDPOINT);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isSafeInteger(this.timeoutMs) ||
        this.timeoutMs < 100 || this.timeoutMs > 30_000) {
      throw new Error("OBS timeout must be 100–30000 ms");
    }
    if (!options.password) throw new Error("OBS WebSocket password is required");
    this.password = options.password;
    this.createSocket = options.createSocket ?? ((url) => new WebSocket(url));
  }

  get state(): ObsConnectionState {
    return this.stateValue;
  }

  async connect(): Promise<void> {
    if (this.socket || this.stateValue !== "disconnected") {
      throw new Error("OBS connection already used; create a new client");
    }
    this.stateValue = "connecting";
    return new Promise<void>((resolve, reject) => {
      this.connectResolve = resolve;
      this.connectReject = reject;
      this.connectTimer = setTimeout(
        () => this.failConnection(new Error("OBS handshake timeout")),
        this.timeoutMs
      );
      try {
        const socket = this.createSocket(this.endpoint);
        this.socket = socket;
        socket.addEventListener("message", (event) => {
          void this.onMessage(event.data).catch(() => {
            this.failConnection(new Error("Invalid OBS protocol message"));
          });
        });
        socket.addEventListener("error", () => {
          this.failConnection(new Error("OBS socket error"));
        });
        socket.addEventListener("close", () => {
          this.failConnection(new Error("OBS socket disconnected"));
        });
      } catch {
        this.failConnection(new Error("OBS connection unavailable"));
      }
    });
  }

  close(): void {
    this.failConnection(new Error("OBS client closed"), true);
  }

  private resetConnectTimer(): void {
    if (this.connectTimer !== null) clearTimeout(this.connectTimer);
    this.connectTimer = null;
  }

  private failConnection(error: Error, intentional = false): void {
    if (!this.socket && this.stateValue === "disconnected") return;
    this.stateValue = intentional ? "disconnected" : "error";
    this.resetConnectTimer();
    this.connectReject?.(error);
    this.connectResolve = null;
    this.connectReject = null;
    for (const pending of this.requests.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.requests.clear();
    if (this.pendingSave) {
      clearTimeout(this.pendingSave.timeout);
      this.pendingSave.reject(error);
      this.pendingSave = null;
    }
    const socket = this.socket;
    this.socket = null;
    this.startedReplayByUs = false;
    this.password = "";
    if (socket && socket.readyState < 2) socket.close();
  }

  private send(envelope: ObsEnvelope): void {
    if (!this.socket || this.socket.readyState !== 1) {
      throw new Error("OBS socket is not open");
    }
    this.socket.send(JSON.stringify(envelope));
  }

  private async onMessage(raw: unknown): Promise<void> {
    if (typeof raw !== "string") throw new Error("Binary OBS message not accepted");
    const msg: ObsEnvelope = JSON.parse(raw) as ObsEnvelope;
    if (!msg || typeof msg.op !== "number" || !msg.d) {
      throw new Error("Malformed OBS message");
    }
    const data = msg.d;
    if (msg.op === 0) {
      if (this.stateValue !== "connecting" ||
          typeof data.rpcVersion !== "number" || data.rpcVersion < 1) {
        throw new Error("Unsupported OBS handshake");
      }
      const auth = data.authentication as
        | { salt?: unknown; challenge?: unknown }
        | undefined;
      if (!auth || typeof auth.salt !== "string" ||
          typeof auth.challenge !== "string") {
        throw new Error("OBS WebSocket authentication must be enabled");
      }
      this.stateValue = "authenticating";
      const authentication = await obsAuthentication(
        this.password, auth.salt, auth.challenge
      );
      this.password = "";
      this.send({
        op: 1,
        d: { rpcVersion: 1, authentication, eventSubscriptions: OUTPUT_EVENTS }
      });
      return;
    }
    if (msg.op === 2) {
      if (this.stateValue !== "authenticating" ||
          data.negotiatedRpcVersion !== 1) {
        throw new Error("OBS protocol negotiation failed");
      }
      this.stateValue = "ready";
      this.resetConnectTimer();
      this.connectResolve?.();
      this.connectResolve = null;
      this.connectReject = null;
      return;
    }
    if (this.stateValue !== "ready") return;
    if (msg.op === 7) {
      const requestId = data.requestId;
      if (typeof requestId !== "string") return;
      const pending = this.requests.get(requestId);
      if (!pending) return;
      this.requests.delete(requestId);
      clearTimeout(pending.timeout);
      const status = data.requestStatus as
        | { result?: unknown; code?: unknown }
        | undefined;
      if (status?.result !== true) {
        pending.reject(new Error("OBS request rejected"));
      } else {
        const result = data.responseData;
        pending.resolve(result && typeof result === "object"
          ? result as Record<string, unknown> : {});
      }
      return;
    }
    if (msg.op === 5 && data.eventType === "ReplayBufferSaved") {
      const path = (data.eventData as { savedReplayPath?: unknown } | undefined)
        ?.savedReplayPath;
      const pending = this.pendingSave;
      if (!pending || typeof path !== "string" ||
          path.length === 0 || path.length > 4096) return;
      pending.path = path;
      this.finishSave();
    }
  }

  private finishSave(): void {
    const pending = this.pendingSave;
    if (!pending || !pending.acknowledged || !pending.path) return;
    this.pendingSave = null;
    clearTimeout(pending.timeout);
    pending.resolve({ savedReplayPath: pending.path, verifiedByEvent: true });
  }

  private request(type: string): Promise<Record<string, unknown>> {
    if (this.stateValue !== "ready") {
      return Promise.reject(new Error("OBS is not ready"));
    }
    if (this.requests.size >= MAX_PENDING_REQUESTS) {
      return Promise.reject(new Error("OBS request limit reached"));
    }
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.requests.delete(requestId);
        reject(new Error("OBS request timeout"));
      }, this.timeoutMs);
      this.requests.set(requestId, { resolve, reject, timeout });
      try {
        this.send({ op: 6, d: { requestType: type, requestId } });
      } catch {
        clearTimeout(timeout);
        this.requests.delete(requestId);
        reject(new Error("OBS send failed"));
      }
    });
  }

  async isReplayRunning(): Promise<boolean> {
    const response = await this.request("GetReplayBufferStatus");
    if (typeof response.outputActive !== "boolean") {
      throw new Error("OBS status unavailable");
    }
    return response.outputActive;
  }

  async startReplayBuffer(): Promise<"already_running" | "started"> {
    if (await this.isReplayRunning()) return "already_running";
    await this.request("StartReplayBuffer");
    this.startedReplayByUs = true;
    return "started";
  }

  async stopReplayBuffer(): Promise<"not_owned" | "stopped"> {
    if (!this.startedReplayByUs) return "not_owned";
    await this.request("StopReplayBuffer");
    this.startedReplayByUs = false;
    return "stopped";
  }

  async saveReplayBuffer(): Promise<ObsReplayReceipt> {
    if (this.taintedSaveSession) {
      throw new Error("OBS save outcome ambiguous; reconnect before another save");
    }
    if (this.pendingSave) throw new Error("OBS save already pending");
    if (!(await this.isReplayRunning())) {
      throw new Error("OBS replay buffer is not running");
    }
    return new Promise<ObsReplayReceipt>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.taintedSaveSession = true;
        this.pendingSave = null;
        reject(new Error("OBS replay save confirmation timeout; reconnect"));
      }, this.timeoutMs);
      const pending: PendingSave = {
        resolve, reject, timeout, acknowledged: false
      };
      this.pendingSave = pending;
      void this.request("SaveReplayBuffer").then(
        () => {
          if (this.pendingSave !== pending) return;
          pending.acknowledged = true;
          this.finishSave();
        },
        () => {
          if (this.pendingSave !== pending) return;
          this.pendingSave = null;
          this.taintedSaveSession = true;
          clearTimeout(timeout);
          reject(new Error("OBS replay save request failed; reconnect"));
        }
      );
    });
  }
}
