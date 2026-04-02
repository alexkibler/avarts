import express from "express";
import net from "net";
import tls from "tls";
import { URL } from "url";
import { handler } from "./build/handler.js";

const app = express();

app.get("/health-check", (_req, res) => {
  res.send({ message: "Server up", status: 200 });
});

app.use(handler);

const server = app.listen(8080);

// ── WebSocket proxy ──────────────────────────────────────────────────────────
//
// Browsers on HTTPS cannot open plain ws:// connections (mixed content).
// We accept WSS from the browser, then open a new TCP/TLS connection to the
// real AP server and pipe raw bytes in both directions.
//
// Raw piping works because:
//   • The browser sends its Sec-WebSocket-Key to us, we forward it upstream.
//   • The AP server computes Sec-WebSocket-Accept from that key and sends 101.
//   • We pipe the 101 straight back to the browser — it validates correctly.
//   • All subsequent WebSocket frames are opaque binary; piping them unchanged
//     is exactly what a transparent WebSocket proxy should do.

function isPrivate(hostname) {
  const h = hostname.toLowerCase();
  return (
    h === 'localhost' || h === '127.0.0.1' || h === '::1' ||
    /^10\./.test(h) || /^192\.168\./.test(h) ||
    /^172\.(1[6-9]|2[0-9]|3[01])\./.test(h) ||
    /^169\.254\./.test(h)
  );
}

server.on('upgrade', (req, socket, head) => {
  if (!req.url.startsWith('/ap-proxy')) {
    socket.destroy();
    return;
  }

  // Extract target from ?target= query param
  let targetStr;
  try {
    const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    targetStr = u.searchParams.get('target');
  } catch {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
    return;
  }

  if (!targetStr) {
    console.warn('[proxy] No target in upgrade request');
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
    return;
  }

  // Default to wss:// when no protocol given (archipelago.gg hosted rooms require it)
  const targetUrl = /^wss?:\/\//i.test(targetStr) ? targetStr : `wss://${targetStr}`;

  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
    return;
  }

  const hostname = parsed.hostname;
  if (isPrivate(hostname)) {
    console.warn('[proxy] SSRF blocked:', hostname);
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }

  const usesTLS = parsed.protocol === 'wss:';
  const port = parseInt(parsed.port) || (usesTLS ? 443 : 80);

  console.log(`[proxy] upgrade → ${usesTLS ? 'wss' : 'ws'}://${hostname}:${port}`);

  const upstream = usesTLS
    ? tls.connect(port, hostname, { servername: hostname })
    : net.connect(port, hostname);

  const onConnect = () => {
    console.log('[proxy] upstream connected, forwarding WebSocket handshake');

    // Forward the WebSocket upgrade to the AP server.
    // We preserve the browser's Sec-WebSocket-Key so the AP server's
    // Sec-WebSocket-Accept is valid when we pipe the 101 back to the browser.
    const lines = [
      `GET / HTTP/1.1`,
      `Host: ${hostname}:${port}`,
      `Upgrade: websocket`,
      `Connection: Upgrade`,
      `Sec-WebSocket-Key: ${req.headers['sec-websocket-key']}`,
      `Sec-WebSocket-Version: 13`,
    ];
    if (req.headers['sec-websocket-extensions']) {
      lines.push(`Sec-WebSocket-Extensions: ${req.headers['sec-websocket-extensions']}`);
    }
    if (req.headers['sec-websocket-protocol']) {
      lines.push(`Sec-WebSocket-Protocol: ${req.headers['sec-websocket-protocol']}`);
    }
    upstream.write(lines.join('\r\n') + '\r\n\r\n');

    // Manual forwarding instead of pipe() — pipe() can silently drop buffered
    // data if destroy() races with the drain. Manual handlers are more explicit.
    let loggedFirst = false;
    upstream.on('data', (chunk) => {
      if (!loggedFirst) {
        loggedFirst = true;
        // latin1 preserves raw bytes; readable enough to see HTTP headers
        console.log(`[proxy] first upstream chunk (${chunk.length}b):`, chunk.slice(0, 256).toString('latin1'));
      }
      if (!socket.destroyed) socket.write(chunk);
    });
    socket.on('data', (chunk) => {
      if (!upstream.destroyed) upstream.write(chunk);
    });

    // Graceful half-close: when one side finishes, tell the other.
    // Do NOT call destroy() here — that drops unwritten buffer. Use end().
    upstream.on('end', () => {
      console.log('[proxy] upstream ended');
      if (!socket.destroyed) socket.end();
    });
    socket.on('end', () => {
      if (!upstream.destroyed) upstream.end();
    });

    if (head && head.length) upstream.write(head);
  };

  upstream.on(usesTLS ? 'secureConnect' : 'connect', onConnect);

  upstream.on('error', (err) => {
    console.error('[proxy] upstream error:', err.message);
    if (!socket.destroyed) socket.destroy();
  });

  upstream.on('close', () => {
    console.log('[proxy] upstream closed');
    // Don't destroy socket here — buffered data (101+RoomInfo) may not have
    // flushed yet. The 'end' handler above calls socket.end() gracefully.
  });

  socket.on('error', (err) => {
    console.error('[proxy] downstream socket error:', err.message);
    upstream.destroy();
  });

  socket.on('close', () => {
    upstream.destroy();
  });
});
