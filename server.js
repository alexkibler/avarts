import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import {handler} from "./build/handler.js"

const app = express();
const PORT = 8080;

app.get("/health-check", (req, res) => {
  res.send({
    message: "Server up",
    status: 200,
  });
});

const apProxy = createProxyMiddleware({
  target: 'http://localhost:8080', // Dummy target, will be overridden by router
  ws: true,
  changeOrigin: true,
  router: (req) => {
    // Extract target from query string
    let target = req.query?.target;
    if (!target) {
      // Sometimes req.query is not parsed correctly for upgrade requests, check url
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      target = url.searchParams.get('target');
    }
    if (target) {
      // Extract hostname for SSRF mitigation (handle optional protocol prefix)
      let hostname;
      try {
        hostname = new URL(target.includes('://') ? target : `wss://${target}`).hostname.toLowerCase();
      } catch {
        hostname = target.split(':')[0].toLowerCase();
      }
      const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
      const isPrivateIP = /^10\./.test(hostname) ||
                          /^192\.168\./.test(hostname) ||
                          /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) ||
                          /^169\.254\./.test(hostname);

      if (isLocalhost || isPrivateIP) {
        console.warn(`Blocked proxy attempt to private/local target: ${target}`);
        return undefined; // Will fallback to dummy target and likely fail, which is safer
      }
      // Use the protocol from the target if explicitly specified, otherwise default to wss://
      // (archipelago.gg hosted rooms require wss; self-hosted plain-ws users can prefix ws://)
      if (/^wss?:\/\//i.test(target)) {
        return target;
      }
      return `wss://${target}`;
    }
    return undefined;
  },
  pathRewrite: {
    '^/ap-proxy': '',
  },
  on: {
    proxyReqWs: (proxyReq, req, socket, options, head) => {
      // console.log('Proxying WS to', options.target.href);
    },
    error: (err, req, res) => {
      console.error('Proxy Error:', err);
    }
  }
});

app.use('/ap-proxy', apProxy);

app.use(handler);

const server = app.listen(8080, () => {
  // console.log("server is running on port: ", PORT)
});

server.on('upgrade', (req, socket, head) => {
  if (req.url.startsWith('/ap-proxy')) {
    apProxy.upgrade(req, socket, head);
  } else {
    // Other websocket upgrades can be handled here or destroyed
  }
});
