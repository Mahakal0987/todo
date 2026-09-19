import { useEffect, useRef } from "react";
import { getAccessToken } from "./api";
import type { SyncPush } from "@todo/api/types";

interface RealtimeOpts {
  deviceId: string;
  onSync: (push: SyncPush) => void;
}

export function useRealtime({ deviceId, onSync }: RealtimeOpts) {
  const wsRef = useRef<WebSocket | null>(null);
  const onSyncRef = useRef(onSync);
  onSyncRef.current = onSync;

  useEffect(() => {
    let disposed = false;
    let retry = 0;

    const connect = () => {
      if (disposed) return;
      const token = getAccessToken();
      if (!token) return;

      const proto = location.protocol === "https:" ? "wss" : "ws";
      const url = `${proto}://${location.host}/api/sync/connect?deviceId=${encodeURIComponent(deviceId)}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => { retry = 0; ws.send(JSON.stringify({ type: "ping" })); };
      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(String(evt.data));
          if (msg.type === "sync") onSyncRef.current(msg as SyncPush);
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        if (disposed) return;
        const delay = Math.min(1000 * 2 ** retry, 15000);
        retry++;
        setTimeout(connect, delay);
      };
      ws.onerror = () => ws.close();
    };

    connect();
    return () => { disposed = true; wsRef.current?.close(); };
  }, [deviceId]);
}