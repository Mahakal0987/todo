import { verifyAccessToken } from "@todo/auth";
import type { SyncPush } from "../sync/publish";

interface Client {
  socket: WebSocket;
  deviceId: string;
}

/**
 * RealtimeHub — one Durable Object per user.
 *
 * Internal routes (called by the worker through the DO stub):
 *  - `/ws`        upgrade a WebSocket for a device (token verified here)
 *  - `/publish`   broadcast a SyncPush to all connected sockets
 *  - `/health`    check hub liveness
 */
export class RealtimeHub {
  private clients = new Map<string, Client>();

  constructor(
    private state: DurableObjectState,
    private env: { JWT_SECRET?: string },
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    switch (url.pathname) {
      case "/ws":
        return this.handleUpgrade(request, url);
      case "/publish":
        return this.handlePublish(request);
      case "/health":
        return Response.json({ clients: this.clients.size });
      default:
        return new Response("not found", { status: 404 });
    }
  }

  private async handleUpgrade(request: Request, url: URL): Promise<Response> {
    const token = url.searchParams.get("token") ?? decodeToken(request);
    if (!token) return new Response("missing token", { status: 401 });

    const payload =
      this.env.JWT_SECRET && (await verifyAccessToken(token, { jwtSecret: this.env.JWT_SECRET, refreshSecret: "" }));
    if (!payload) return new Response("invalid token", { status: 401 });

    const pair = new WebSocketPair();
    const [server, client] = Object.values(pair);
    server.accept();

    const deviceId = url.searchParams.get("deviceId") ?? `dev_${Math.random().toString(36).slice(2, 10)}`;
    this.clients.set(deviceId, { socket: server, deviceId });

    this.send(server, { type: "connected", deviceId });

    server.addEventListener("message", (evt) => {
      try {
        const msg = JSON.parse(String(evt.data));
        if (msg.type === "ping") this.send(server, { type: "pong" });
      } catch {
        /* ignore malformed frames */
      }
    });
    server.addEventListener("close", () => this.clients.delete(deviceId));
    server.addEventListener("error", () => this.clients.delete(deviceId));

    return new Response(null, { status: 101, webSocket: client });
  }

  private async handlePublish(request: Request): Promise<Response> {
    if (request.method !== "POST") return new Response("method not allowed", { status: 405 });
    const push = (await request.json()) as SyncPush;
    for (const c of this.clients.values()) {
      this.send(c.socket, { type: "sync", ...push });
    }
    return Response.json({ ok: true });
  }

  private send(ws: WebSocket, data: unknown) {
    try {
      ws.send(JSON.stringify(data));
    } catch {
      /* socket already closed */
    }
  }
}

function decodeToken(request: Request): string | null {
  const h = request.headers.get("authorization");
  return h?.startsWith("Bearer ") ? h.slice(7) : null;
}