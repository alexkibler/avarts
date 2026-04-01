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
      // Basic SSRF mitigation: block local/private IP ranges
      const host = target.split(':')[0].toLowerCase();
      const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '::1';
      const isPrivateIP = /^10\./.test(host) ||
                          /^192\.168\./.test(host) ||
                          /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host) ||
                          /^169\.254\./.test(host);

      if (isLocalhost || isPrivateIP) {
        console.warn(`Blocked proxy attempt to private/local target: ${target}`);
        return undefined; // Will fallback to dummy target and likely fail, which is safer
      }
      return `ws://${target}`;
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
