const CARD_CATALOG = /*__CARD_CATALOG__*/ [];
const CARD_KEYS = new Set(CARD_CATALOG.map((card) => card.key));
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_IMPORT_BYTES = 64 * 1024;
const ROYALE_API_ORIGIN = "https://royaleapi.com";
const VALID_DAYS = new Set([1, 3, 7]);
const WAR_DECK_SIZE = 4;
const responseCache = new Map();
const inFlight = new Map();

class RequestError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

function withSecurityHeaders(headers = new Headers()) {
  const secured = new Headers(headers);
  secured.set("X-Content-Type-Options", "nosniff");
  secured.set("Referrer-Policy", "no-referrer");
  secured.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; " +
      "media-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  );
  return secured;
}

function jsonResponse(request, value, status = 200) {
  const body = `${JSON.stringify(value)}\n`;
  const headers = withSecurityHeaders({
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  return new Response(request.method === "HEAD" ? null : body, { status, headers });
}

function normalizeCardSlug(slug) {
  return slug.replace(/-(?:ev\d+|hero)$/u, "");
}

function parseDeckStatsHref(href) {
  const url = new URL(href, ROYALE_API_ORIGIN);
  url.protocol = "https:";
  const prefix = "/decks/stats/";
  if (
    !["royaleapi.com", "www.royaleapi.com"].includes(url.hostname) ||
    !url.pathname.startsWith(prefix)
  ) {
    throw new Error(`Not a RoyaleAPI deck stats URL: ${href}`);
  }

  const cards = decodeURIComponent(url.pathname.slice(prefix.length))
    .split(",")
    .map((card) => card.trim())
    .filter(Boolean);
  if (cards.length !== 8 || new Set(cards).size !== 8) {
    throw new Error(`Expected 8 unique cards in deck stats URL: ${href}`);
  }

  const baseCards = cards.map(normalizeCardSlug);
  if (new Set(baseCards).size !== 8) {
    throw new Error(`Deck contains overlapping base cards after variant normalization: ${href}`);
  }
  return { cards, baseCards, statsUrl: url.toString() };
}

function deckDataBucket(env) {
  if (!env.DECK_DATA) {
    throw new Error("Deck snapshot storage is unavailable.");
  }
  return env.DECK_DATA;
}

function snapshotKey(days) {
  return `royaleapi-snapshots/${days}d.json`;
}

function snapshotSummary(snapshot) {
  return {
    timeRange: snapshot.timeRange,
    importedAt: snapshot.importedAt,
    deckCount: snapshot.decks.length,
    sourceUrl: snapshot.sourceUrl,
  };
}

function normalizeImportPayload(
  payload,
  importedAt = payload?.importedAt ?? new Date().toISOString(),
) {
  if (!payload || typeof payload !== "object") {
    throw new RequestError("Imported deck data must be a JSON object.");
  }

  const days = Number.parseInt(String(payload.timeRange).replace(/d$/u, ""), 10);
  if (!VALID_DAYS.has(days) || payload.timeRange !== `${days}d`) {
    throw new RequestError("Imported timeRange must be 1d, 3d, or 7d.");
  }

  let sourceUrl;
  try {
    sourceUrl = new URL(payload.sourceUrl);
  } catch {
    throw new RequestError("Imported data must include its RoyaleAPI source URL.");
  }
  if (
    sourceUrl.protocol !== "https:" ||
    !["royaleapi.com", "www.royaleapi.com"].includes(sourceUrl.hostname) ||
    sourceUrl.pathname !== "/decks/popular"
  ) {
    throw new RequestError("Imported data must come from RoyaleAPI's popular-decks page.");
  }
  if (sourceUrl.searchParams.get("time") !== `${days}d`) {
    throw new RequestError("The imported meta window does not match its RoyaleAPI page.");
  }

  if (!Array.isArray(payload.decks) || payload.decks.length < 4 || payload.decks.length > 30) {
    throw new RequestError("Imported data must contain between 4 and 30 decks.");
  }

  const seenDecks = new Set();
  const decks = payload.decks.map((deck, index) => {
    if (!deck || typeof deck !== "object") {
      throw new RequestError(`Imported deck ${index + 1} is invalid.`);
    }
    let parsed;
    try {
      parsed = parseDeckStatsHref(deck.statsUrl);
    } catch (error) {
      throw new RequestError(`Imported deck ${index + 1} is invalid: ${error.message}`);
    }
    parsed.cards.forEach((card) => {
      if (!CARD_KEYS.has(card)) {
        throw new RequestError(`Imported deck ${index + 1} contains unknown card ${card}.`);
      }
    });
    if (seenDecks.has(parsed.statsUrl)) {
      throw new RequestError(`Imported deck ${index + 1} is duplicated.`);
    }
    seenDecks.add(parsed.statsUrl);

    const name = typeof deck.name === "string" ? deck.name.trim().slice(0, 120) : "";
    const winRate = deck.winRate == null ? null : Number(deck.winRate);
    if (winRate !== null && (!Number.isFinite(winRate) || winRate < 0 || winRate > 100)) {
      throw new RequestError(`Imported deck ${index + 1} has an invalid win rate.`);
    }

    return {
      rank: index + 1,
      name: name || `Deck ${index + 1}`,
      cardNames: [],
      winRate,
      ...parsed,
    };
  });

  return {
    version: 1,
    source: "RoyaleAPI bookmarklet",
    sourceUrl: sourceUrl.toString(),
    timeRange: `${days}d`,
    importedAt,
    decks,
  };
}

async function loadDeckSnapshot(env, days) {
  const object = await deckDataBucket(env).get(snapshotKey(days));
  if (!object) {
    throw new RequestError(
      `No ${days}-day deck data has been imported yet. Open Update data to add it from RoyaleAPI.`,
      404,
    );
  }
  return normalizeImportPayload(await object.json(), object.customMetadata?.importedAt);
}

async function listDeckSnapshots(env) {
  return Promise.all(
    [...VALID_DAYS].map(async (days) => {
      const object = await deckDataBucket(env).get(snapshotKey(days));
      if (!object) return { timeRange: `${days}d`, available: false };
      const snapshot = normalizeImportPayload(await object.json(), object.customMetadata?.importedAt);
      return { ...snapshotSummary(snapshot), available: true };
    }),
  );
}

async function importDeckSnapshot(request, env) {
  if (!request.headers.get("oai-authenticated-user-id")) {
    throw new RequestError("Sign in to update deck data.", 403);
  }
  const contentLength = Number.parseInt(request.headers.get("content-length") ?? "0", 10);
  if (contentLength > MAX_IMPORT_BYTES) {
    throw new RequestError("Imported deck data is too large.", 413);
  }

  let payload;
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_IMPORT_BYTES) {
      throw new RequestError("Imported deck data is too large.", 413);
    }
    payload = JSON.parse(body);
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError("Imported deck data is not valid JSON.");
  }
  const snapshot = normalizeImportPayload(payload);
  const days = Number.parseInt(snapshot.timeRange, 10);
  await deckDataBucket(env).put(snapshotKey(days), JSON.stringify(snapshot), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
    customMetadata: { importedAt: snapshot.importedAt },
  });
  responseCache.clear();
  return snapshotSummary(snapshot);
}

function validateCardKeys(keys, label) {
  keys.forEach((key) => {
    if (!CARD_KEYS.has(key)) throw new RequestError(`Unknown card key in ${label}: ${key}`);
  });
}

function parseDeckFilters(url) {
  return Array.from({ length: WAR_DECK_SIZE }, (_, index) => {
    const deckNumber = index + 1;
    const include = [...new Set(url.searchParams.getAll(`d${deckNumber}inc`).filter(Boolean))].sort();
    const exclude = [...new Set(url.searchParams.getAll(`d${deckNumber}exc`).filter(Boolean))].sort();
    validateCardKeys(include, `deck ${deckNumber} include cards`);
    validateCardKeys(exclude, `deck ${deckNumber} exclude cards`);

    const overlap = include.find((card) => exclude.includes(card));
    if (overlap) throw new RequestError(`Deck ${deckNumber} cannot include and exclude ${overlap}`);
    if (include.length > 8) {
      throw new RequestError(`Deck ${deckNumber} cannot include more than 8 cards`);
    }
    return { include, exclude };
  });
}

function parseApiOptions(url) {
  const days = Number.parseInt(url.searchParams.get("time") ?? "1", 10);
  if (!VALID_DAYS.has(days)) throw new RequestError("time must be 1, 3, or 7");
  return {
    days,
    refresh: url.searchParams.get("refresh") === "true",
    deckFilters: parseDeckFilters(url),
    size: 30,
  };
}

function validateCandidateDeck(deck, index) {
  if (!deck || !Array.isArray(deck.baseCards)) {
    throw new Error(`Candidate deck ${index + 1} has no baseCards array.`);
  }
  if (deck.baseCards.length !== 8 || new Set(deck.baseCards).size !== 8) {
    throw new Error(`Candidate deck ${index + 1} must contain 8 unique base cards.`);
  }
}

function deckIdentity(deck) {
  return deck.statsUrl ?? deck.cards?.join(",") ?? deck.baseCards.join(",");
}

function findValidWarDecks(candidateDecks) {
  candidateDecks.forEach(validateCandidateDeck);
  const warDecks = [];
  for (let first = 0; first < candidateDecks.length - 3; first += 1) {
    for (let second = first + 1; second < candidateDecks.length - 2; second += 1) {
      for (let third = second + 1; third < candidateDecks.length - 1; third += 1) {
        for (let fourth = third + 1; fourth < candidateDecks.length; fourth += 1) {
          const indexes = [first, second, third, fourth];
          const decks = indexes.map((index) => candidateDecks[index]);
          if (new Set(decks.flatMap((deck) => deck.baseCards)).size !== 32) continue;
          warDecks.push({
            id: indexes.join("-"),
            candidateIndexes: indexes,
            deckRanks: decks.map((deck, index) => deck.rank ?? indexes[index] + 1),
            deckNames: decks.map((deck) => deck.name ?? null),
          });
        }
      }
    }
  }
  return warDecks;
}

function findValidWarDecksFromPools(candidateDecks, candidatePools) {
  candidateDecks.forEach(validateCandidateDeck);
  const warDecks = [];
  const seenBundles = new Set();

  function visit(poolIndex, indexes) {
    if (poolIndex === candidatePools.length) {
      const decks = indexes.map((index) => candidateDecks[index]);
      if (new Set(decks.flatMap((deck) => deck.baseCards)).size !== 32) return;
      const bundleKey = decks.map(deckIdentity).sort().join("|");
      if (seenBundles.has(bundleKey)) return;
      seenBundles.add(bundleKey);
      warDecks.push({
        id: indexes.join("-"),
        candidateIndexes: indexes,
        deckRanks: decks.map((deck, index) => deck.rank ?? indexes[index] + 1),
        deckNames: decks.map((deck) => deck.name ?? null),
      });
      return;
    }

    candidatePools[poolIndex].forEach((candidateIndex) => {
      if (!indexes.includes(candidateIndex)) visit(poolIndex + 1, [...indexes, candidateIndex]);
    });
  }

  visit(0, []);
  return warDecks;
}

function deckMatchesFilter(deck, filter) {
  return (
    filter.include.every((card) => deck.cards.includes(card)) &&
    filter.exclude.every((card) => !deck.cards.includes(card))
  );
}

async function createWarDeckResult(options, env) {
  const snapshot = await loadDeckSnapshot(env, options.days);
  const candidateDecks = snapshot.decks;
  const hasFilters = options.deckFilters.some(
    (filter) => filter.include.length > 0 || filter.exclude.length > 0,
  );
  if (!hasFilters) {
    return {
      timeRange: snapshot.timeRange,
      importedAt: snapshot.importedAt,
      candidateDecks,
      warDecks: findValidWarDecks(candidateDecks),
    };
  }

  const candidatePools = options.deckFilters.map((filter) =>
    candidateDecks.flatMap((deck, index) => (deckMatchesFilter(deck, filter) ? [index] : [])),
  );

  return {
    timeRange: snapshot.timeRange,
    importedAt: snapshot.importedAt,
    candidateDecks,
    warDecks: findValidWarDecksFromPools(candidateDecks, candidatePools),
  };
}

async function getWarDeckResult(options, env) {
  const key = JSON.stringify({ days: options.days, deckFilters: options.deckFilters });
  const cached = responseCache.get(key);
  if (!options.refresh && cached && cached.expiresAt > Date.now()) return cached.result;
  if (inFlight.has(key)) return inFlight.get(key);

  const pending = createWarDeckResult(options, env).then((result) => {
    responseCache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  });
  inFlight.set(key, pending);
  try {
    return await pending;
  } finally {
    inFlight.delete(key);
  }
}

async function serveIndex(request, env, url) {
  const assetUrl = new URL("/index.html", url);
  const asset = await env.ASSETS.fetch(new Request(assetUrl, request));
  if (!asset.ok) return asset;
  const socialMetadata = [
    `<meta property="og:url" content="${url.origin}/" />`,
    `<meta property="og:image" content="${url.origin}/og.png" />`,
    `<meta name="twitter:image" content="${url.origin}/og.png" />`,
  ].join("\n    ");
  const html = (await asset.text()).replace("<!--__SOCIAL_IMAGE_METADATA__-->", socialMetadata);
  const headers = withSecurityHeaders(asset.headers);
  headers.set("Cache-Control", "public, max-age=60");
  headers.set("Content-Type", "text/html; charset=utf-8");
  return new Response(request.method === "HEAD" ? null : html, { status: 200, headers });
}

async function serveAsset(request, env) {
  const asset = await env.ASSETS.fetch(request);
  return new Response(request.method === "HEAD" ? null : asset.body, {
    status: asset.status,
    statusText: asset.statusText,
    headers: withSecurityHeaders(asset.headers),
  });
}

const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/import-decks" && request.method === "POST") {
        return jsonResponse(request, { snapshot: await importDeckSnapshot(request, env) }, 201);
      }
      if (request.method !== "GET" && request.method !== "HEAD") {
        return jsonResponse(request, { error: "Invalid request", message: "Method not allowed" }, 405);
      }
      if (url.pathname === "/api/health") {
        return jsonResponse(request, { status: "ok", service: "war-deck-finder" });
      }
      if (url.pathname === "/api/cards") {
        return jsonResponse(request, { cards: CARD_CATALOG });
      }
      if (url.pathname === "/api/deck-snapshots") {
        return jsonResponse(request, { snapshots: await listDeckSnapshots(env) });
      }
      if (url.pathname === "/api/war-decks") {
        return jsonResponse(request, await getWarDeckResult(parseApiOptions(url), env));
      }
      if (url.pathname === "/" || url.pathname === "/index.html") {
        return serveIndex(request, env, url);
      }
      return serveAsset(request, env);
    } catch (error) {
      const status = error.statusCode ?? 502;
      return jsonResponse(
        request,
        {
          error: status >= 500 ? "Unable to build war decks" : "Invalid request",
          message: error.message,
        },
        status,
      );
    }
  },
};

export default worker;
