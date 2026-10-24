import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMessage, ServerMessage } from '../shared/protocol';

/**
 * WebSocket connection to the host server with automatic reconnect.
 * `hello` is re-sent on every (re)connect so the server always knows who we are.
 */
export function useSocket(hello: () => ClientMessage, onMessage: (message: ServerMessage) => void) {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const handlers = useRef({ hello, onMessage });
  handlers.current = { hello, onMessage };

  useEffect(() => {
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    const open = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const socket = new WebSocket(`${protocol}://${window.location.host}/ws`);
      socketRef.current = socket;
      socket.onopen = () => {
        attempts = 0;
        setConnected(true);
        socket.send(JSON.stringify(handlers.current.hello()));
      };
      socket.onmessage = (event) => {
        try {
          handlers.current.onMessage(JSON.parse(String(event.data)) as ServerMessage);
        } catch {
          /* ignore malformed frames */
        }
      };
      socket.onclose = () => {
        setConnected(false);
        if (!closed) retry = setTimeout(open, Math.min(3000, 400 * ++attempts));
      };
    };
    open();

    return () => {
      closed = true;
      clearTimeout(retry);
      socketRef.current?.close();
    };
  }, []);

  const send = useCallback((message: ClientMessage) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }, []);

  return { connected, send };
}
