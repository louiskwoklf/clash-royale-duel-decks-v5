#!/usr/bin/env node

"use strict";

const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const { getCardCatalog, validateCardKeys } = require("./card-catalog");
const { createWarDeckResultFromOptions } = require("./find-war-decks");

const HOST = "127.0.0.1";
const DEFAULT_PORT = 3000;
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const WAR_DECK_SIZE = 4;
const PUBLIC_DIRECTORY = path.resolve(__dirname, "../public");
const CARD_IMAGE_DIRECTORY = path.join(PUBLIC_DIRECTORY, "cards");

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
  const refresh = url.searchParams.get("refresh") === "true";
  const deckFilters = parseDeckFilters(url);

  if (![1, 3, 7].includes(days)) {
    throw new RequestError("time must be 1, 3, or 7");
  }

  // 30 candidate decks (RoyaleAPI's max) — more candidates means far more
  // valid four-deck combinations than the default 20.
  return { days, refresh, deckFilters, size: 30 };
}

function parseDeckFilters(url) {
  return Array.from({ length: WAR_DECK_SIZE }, (_, index) => {
    const deckNumber = index + 1;
    const include = [
      ...new Set(url.searchParams.getAll(`d${deckNumber}inc`).filter(Boolean)),
    ].sort();
    const exclude = [
      ...new Set(url.searchParams.getAll(`d${deckNumber}exc`).filter(Boolean)),
    ].sort();

    try {
      validateCardKeys(include, `deck ${deckNumber} include cards`);
      validateCardKeys(exclude, `deck ${deckNumber} exclude cards`);
    } catch (error) {
      throw new RequestError(error.message);
    }

    const overlap = include.find((card) => exclude.includes(card));
    if (overlap) {
      throw new RequestError(`Deck ${deckNumber} cannot include and exclude ${overlap}`);
    }

    if (include.length > 8) {
      throw new RequestError(`Deck ${deckNumber} cannot include more than 8 cards`);
    }

    return { include, exclude };
  });
}

function createWarDeckService({ resultProvider, cacheTtlMs = DEFAULT_CACHE_TTL_MS } = {}) {
  const provider = resultProvider ?? createWarDeckResultFromOptions;
  const cache = new Map();
  const inFlight = new Map();

  async function get(options) {
    const key = JSON.stringify({
      days: options.days,
      deckFilters: options.deckFilters,
    });
    const now = Date.now();
    const cached = cache.get(key);

    if (!options.refresh && cached && cached.expiresAt > now) {
      return cached.result;
    }

    if (inFlight.has(key)) {
      return inFlight.get(key);
    }

    const pending = (async () => {
      const result = await provider(options);
      const expiresAt = Date.now() + cacheTtlMs;
      cache.set(key, { result, expiresAt });
      return result;
    })();

    inFlight.set(key, pending);

    try {
      return await pending;
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

async function serveCardImage(response, pathname) {
  const match = /^\/cards\/([a-z0-9-]+\.png)$/u.exec(pathname);

  if (!match) {
    throw new RequestError("Not found", 404);
  }

  const body = await fs.readFile(path.join(CARD_IMAGE_DIRECTORY, match[1]));
  response.writeHead(200, {
    "Content-Type": "image/png",
    "Content-Length": body.length,
    "Cache-Control": "public, max-age=604800, immutable",
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

      if (url.pathname === "/api/cards") {
        sendJson(response, 200, { cards: getCardCatalog() });
        return;
      }

      if (url.pathname === "/api/war-decks") {
        const apiOptions = parseApiOptions(url);
        sendJson(response, 200, await service.get(apiOptions));
        return;
      }

      if (url.pathname.startsWith("/cards/")) {
        await serveCardImage(response, url.pathname);
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
