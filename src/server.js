#!/usr/bin/env node

"use strict";

const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const { extractPopularDecks } = require("./extract-decks");
const { createWarDeckResult } = require("./find-war-decks");

const HOST = "127.0.0.1";
const DEFAULT_PORT = 3000;
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const PUBLIC_DIRECTORY = path.resolve(__dirname, "../public");

const STATIC_FILES = new Map([
  ["/", { file: "index.html", type: "text/html; charset=utf-8" }],
  ["/index.html", { file: "index.html", type: "text/html; charset=utf-8" }],
  ["/app.js", { file: "app.js", type: "text/javascript; charset=utf-8" }],
  ["/styles.css", { file: "styles.css", type: "text/css; charset=utf-8" }],
]);

class RequestError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

function parseApiOptions(url) {
  const days = Number.parseInt(url.searchParams.get("time") ?? "1", 10);
  const size = Number.parseInt(url.searchParams.get("size") ?? "20", 10);
  const method = url.searchParams.get("method") ?? "auto";
  const refresh = url.searchParams.get("refresh") === "true";

  if (![1, 3, 7].includes(days)) {
    throw new RequestError("time must be 1, 3, or 7");
  }

  if (!Number.isInteger(size) || size < 4 || size > 30) {
    throw new RequestError("size must be an integer from 4 to 30");
  }

  if (!["auto", "proxy", "browser"].includes(method)) {
    throw new RequestError("method must be auto, proxy, or browser");
  }

  return { days, size, method, refresh };
}

function createWarDeckService({ resultProvider, cacheTtlMs = DEFAULT_CACHE_TTL_MS } = {}) {
  const provider =
    resultProvider ??
    (async (options) => createWarDeckResult(await extractPopularDecks(options)));
  const cache = new Map();
  const inFlight = new Map();

  async function get(options) {
    const key = `${options.days}:${options.size}:${options.method}`;
    const now = Date.now();
    const cached = cache.get(key);

    if (!options.refresh && cached && cached.expiresAt > now) {
      return {
        result: cached.result,
        cache: { hit: true, expiresAt: new Date(cached.expiresAt).toISOString() },
      };
    }

    if (inFlight.has(key)) {
      const pending = await inFlight.get(key);
      return {
        result: pending.result,
        cache: { hit: false, sharedRequest: true, expiresAt: pending.expiresAt },
      };
    }

    const pending = (async () => {
      const result = await provider(options);
      const expiresAt = Date.now() + cacheTtlMs;
      cache.set(key, { result, expiresAt });
      return { result, expiresAt: new Date(expiresAt).toISOString() };
    })();

    inFlight.set(key, pending);

    try {
      const fresh = await pending;
      return { result: fresh.result, cache: { hit: false, expiresAt: fresh.expiresAt } };
    } finally {
      inFlight.delete(key);
    }
  }

  return { get };
}

function setSecurityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; " +
      "connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  );
}

function sendJson(response, statusCode, value) {
  const body = `${JSON.stringify(value)}\n`;
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  response.end(body);
}

async function serveStaticFile(response, route) {
  const body = await fs.readFile(path.join(PUBLIC_DIRECTORY, route.file));
  response.writeHead(200, {
    "Content-Type": route.type,
    "Content-Length": body.length,
    "Cache-Control": "no-cache",
  });
  response.end(body);
}

function createRequestHandler(options = {}) {
  const service = createWarDeckService(options);

  return async function handleRequest(request, response) {
    setSecurityHeaders(response);

    try {
      const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);

      if (request.method !== "GET" && request.method !== "HEAD") {
        response.setHeader("Allow", "GET, HEAD");
        throw new RequestError("Method not allowed", 405);
      }

      if (url.pathname === "/api/health") {
        sendJson(response, 200, { status: "ok", service: "war-deck-finder" });
        return;
      }

      if (url.pathname === "/api/war-decks") {
        const apiOptions = parseApiOptions(url);
        const { result, cache } = await service.get(apiOptions);
        sendJson(response, 200, {
          ...result,
          request: {
            timeRange: `${apiOptions.days}d`,
            size: apiOptions.size,
            method: apiOptions.method,
            cache,
            servedAt: new Date().toISOString(),
          },
        });
        return;
      }

      const route = STATIC_FILES.get(url.pathname);
      if (route) {
        await serveStaticFile(response, route);
        return;
      }

      throw new RequestError("Not found", 404);
    } catch (error) {
      const statusCode = error.statusCode ?? 502;
      sendJson(response, statusCode, {
        error: statusCode >= 500 ? "Unable to build war decks" : "Invalid request",
        message: error.message,
      });
    }
  };
}

function createServer(options) {
  return http.createServer(createRequestHandler(options));
}

function startServer({ port = Number.parseInt(process.env.PORT ?? DEFAULT_PORT, 10) } = {}) {
  const server = createServer();
  server.listen(port, HOST, () => {
    process.stdout.write(`War Deck Finder running at http://${HOST}:${port}\n`);
  });

  const shutdown = () => server.close(() => process.exit(0));
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = {
  createRequestHandler,
  createServer,
  createWarDeckService,
  parseApiOptions,
  startServer,
};
