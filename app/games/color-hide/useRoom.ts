"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ClientMessage,
  RoomView,
  ServerMessage,
} from "@/lib/color-hide/types";

type Session = { code: string; playerId: string; token: string };
const KEY = "xarmy-color-hide-session-v1";
type Status = "idle" | "connecting" | "connected" | "reconnecting";

function configuredEndpoint() {
  const configured = process.env.NEXT_PUBLIC_COLOR_HIDE_SERVER_URL?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
      if (
        url.username ||
        url.password ||
        (url.protocol !== "wss:" && !(local && url.protocol === "ws:"))
      )
        return "";
      return url.toString();
    } catch {
      return "";
    }
  }
  if (process.env.NODE_ENV === "development")
    return `ws://${location.hostname}:3001`;
  return "";
}

export function useRoom() {
  const [room, setRoom] = useState<RoomView | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [available, setAvailable] = useState(false);
  const socket = useRef<WebSocket | null>(null);
  const session = useRef<Session | null>(null);
  const connect = useRef<(message?: ClientMessage) => void>(() => undefined);

  useEffect(() => {
    const endpoint = configuredEndpoint();
    setAvailable(Boolean(endpoint));
    if (!endpoint) return;
    let disposed = false;
    let attempts = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    try {
      const parsed = JSON.parse(
        sessionStorage.getItem(KEY) || "null",
      ) as Session | null;
      if (
        parsed &&
        typeof parsed.code === "string" &&
        typeof parsed.token === "string" &&
        typeof parsed.playerId === "string"
      )
        session.current = parsed;
    } catch {
      /* Private storage must not prevent joining a room. */
    }
    const forget = () => {
      session.current = null;
      try {
        sessionStorage.removeItem(KEY);
      } catch {
        /* Optional reconnect persistence. */
      }
      setRoom(null);
    };
    connect.current = (message) => {
      if (disposed) return;
      clearTimeout(retry);
      clearInterval(heartbeat);
      const old = socket.current;
      socket.current = null;
      old?.close();
      setStatus(session.current ? "reconnecting" : "connecting");
      setError("");
      const ws = new WebSocket(endpoint);
      socket.current = ws;
      const current = () => !disposed && socket.current === ws;
      const watchdog = setTimeout(() => {
        if (current() && ws.readyState !== WebSocket.OPEN) ws.close();
      }, 12000);
      ws.onopen = () => {
        if (!current()) return;
        clearTimeout(watchdog);
        attempts = 0;
        const auth =
          message ??
          (session.current
            ? {
                type: "resume",
                code: session.current.code,
                token: session.current.token,
              }
            : null);
        if (auth) ws.send(JSON.stringify(auth));
        heartbeat = setInterval(() => {
          if (current() && ws.readyState === WebSocket.OPEN)
            ws.send(JSON.stringify({ type: "ping" }));
        }, 10000);
      };
      ws.onmessage = (event) => {
        if (!current()) return;
        let data: ServerMessage;
        try {
          data = JSON.parse(String(event.data)) as ServerMessage;
        } catch {
          return;
        }
        if (data.type === "welcome") {
          session.current = {
            code: data.code,
            playerId: data.playerId,
            token: data.token,
          };
          try {
            sessionStorage.setItem(KEY, JSON.stringify(session.current));
          } catch {
            /* Room remains playable without persistence. */
          }
          setStatus("connected");
          setError("");
        } else if (data.type === "snapshot") {
          setRoom(data.room);
          setStatus("connected");
        } else if (data.type === "error") {
          setError(data.message);
          if (
            data.code === "SESSION_EXPIRED" ||
            data.code === "ROOM_NOT_FOUND" ||
            data.code === "INVALID_SESSION" ||
            data.code === "SESSION_REPLACED"
          ) {
            forget();
            ws.close();
          } else if (!session.current) {
            ws.close();
          }
        } else if (data.type === "left") {
          forget();
          socket.current = null;
          clearInterval(heartbeat);
          ws.close();
          setStatus("idle");
        }
      };
      ws.onerror = () => {
        if (current())
          setError(
            "Oyun sunucusuna bağlanılamadı. Bağlantını kontrol edip tekrar dene.",
          );
      };
      ws.onclose = () => {
        clearTimeout(watchdog);
        if (!current()) return;
        socket.current = null;
        clearInterval(heartbeat);
        if (session.current) {
          setStatus("reconnecting");
          retry = setTimeout(
            () => connect.current(),
            Math.min(8000, 1000 * 2 ** attempts++),
          );
        } else setStatus("idle");
      };
    };
    if (session.current) connect.current();
    return () => {
      disposed = true;
      clearTimeout(retry);
      clearInterval(heartbeat);
      socket.current?.close();
      socket.current = null;
    };
  }, []);

  const send = useCallback((message: ClientMessage) => {
    const ws = socket.current;
    if (ws?.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(message));
    return true;
  }, []);
  const enter = useCallback((message: ClientMessage) => {
    if (!configuredEndpoint()) {
      setError("Çevrimiçi oyun sunucusu henüz kullanıma açılmadı.");
      return;
    }
    connect.current(message);
  }, []);
  const leave = useCallback(() => {
    if (!send({ type: "leave" })) {
      session.current = null;
      try {
        sessionStorage.removeItem(KEY);
      } catch {
        /* Optional. */
      }
      socket.current?.close();
      socket.current = null;
      setRoom(null);
      setStatus("idle");
    }
  }, [send]);
  return {
    room,
    status,
    error,
    available,
    send,
    enter,
    leave,
    clearError: () => setError(""),
  };
}
