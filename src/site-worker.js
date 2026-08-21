const CARD_CATALOG = /*__CARD_CATALOG__*/ [];
const CARD_KEYS = new Set(CARD_CATALOG.map((card) => card.key));
const MAX_REQUEST_BYTES = 512 * 1024;
const ROYALE_API_ORIGIN = "https://royaleapi.com";
const VALID_DAYS = new Set([1, 3, 7]);
const WAR_DECK_SIZE = 4;

class RequestError extends Error {
  constructor(message, statusCode = 400, details = {}) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
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

function validateCardKeys(keys, label) {
  keys.forEach((key) => {
    if (!CARD_KEYS.has(key)) throw new RequestError(`Unknown card key in ${label}: ${key}`);
  });
}

function normalizeSearch(days, include = [], exclude = []) {
  if (!VALID_DAYS.has(days)) throw new RequestError("time must be 1, 3, or 7");
  if (!Array.isArray(include) || !Array.isArray(exclude)) {
    throw new RequestError("Search include and exclude filters must be arrays");
  }

  const normalizedInclude = [...new Set(include.filter(Boolean))].sort();
  const normalizedExclude = [...new Set(exclude.filter(Boolean))].sort();
  validateCardKeys(normalizedInclude, "include cards");
  validateCardKeys(normalizedExclude, "exclude cards");

  const overlap = normalizedInclude.find((card) => normalizedExclude.includes(card));
  if (overlap) throw new RequestError(`A search cannot include and exclude ${overlap}`);
  if (normalizedInclude.length > 8) {
    throw new RequestError("A deck search cannot include more than 8 cards");
  }

  const search = { days, include: normalizedInclude, exclude: normalizedExclude };
  search.id = searchId(search);
  return search;
}

function searchId(search) {
  const params = new URLSearchParams({ time: `${search.days}d` });
  search.include.forEach((card) => params.append("inc", card));
  search.exclude.forEach((card) => params.append("exc", card));
  return params.toString();
}

function searchFromSourceUrl(sourceUrl) {
  let url;
  try {
    url = new URL(sourceUrl);
  } catch {
    throw new RequestError("Imported data must include its RoyaleAPI source URL.");
  }
  if (
    url.protocol !== "https:" ||
    !["royaleapi.com", "www.royaleapi.com"].includes(url.hostname) ||
    url.pathname !== "/decks/popular"
  ) {
    throw new RequestError("Imported data must come from RoyaleAPI's popular-decks page.");
  }

  const timeRange = url.searchParams.get("time");
  const days = Number.parseInt(String(timeRange).replace(/d$/u, ""), 10);
  if (!VALID_DAYS.has(days) || timeRange !== `${days}d`) {
    throw new RequestError("The RoyaleAPI search must use a 1d, 3d, or 7d meta window.");
  }

  return normalizeSearch(days, url.searchParams.getAll("inc"), url.searchParams.getAll("exc"));
}

function deckMatchesSearch(deck, search) {
  return (
    search.include.every((card) => deck.cards.includes(card)) &&
    search.exclude.every((card) => !deck.cards.includes(card))
  );
}

function normalizeImportPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new RequestError("Imported deck data must be a JSON object.");
  }

  const search = searchFromSourceUrl(payload.sourceUrl);
  if (payload.timeRange !== `${search.days}d`) {
    throw new RequestError("The imported meta window does not match its RoyaleAPI page.");
  }
  if (!Array.isArray(payload.decks) || payload.decks.length > 30) {
    throw new RequestError("Imported data must contain no more than 30 decks.");
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
    if (!deckMatchesSearch(parsed, search)) {
      throw new RequestError(`Imported deck ${index + 1} does not match the RoyaleAPI search.`);
    }
    if (seenDecks.has(parsed.statsUrl)) {
      throw new RequestError(`Imported deck ${index + 1} is duplicated.`);
    }
    seenDecks.add(parsed.statsUrl);

    const name = typeof deck.name === "string" ? deck.name.trim().slice(0, 120) : "";
    const rating = deck.rating;
    if (typeof rating !== "number" || !Number.isFinite(rating) || rating < 0 || rating > 100) {
      throw new RequestError(`Imported deck ${index + 1} has an invalid rating.`);
    }
    const winRate = deck.winRate == null ? null : Number(deck.winRate);
    if (winRate !== null && (!Number.isFinite(winRate) || winRate < 0 || winRate > 100)) {
      throw new RequestError(`Imported deck ${index + 1} has an invalid win rate.`);
    }

    return {
      rank: index + 1,
      name: name || `Deck ${index + 1}`,
      cardNames: [],
      rating,
      winRate,
      ...parsed,
    };
  });

  return { search, decks };
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
      const ratings = decks.map((deck) => deck.rating);
      const averageRating = ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
      const lowestRating = Math.min(...ratings);
      warDecks.push({
        id: indexes.join("-"),
        bundleScore: averageRating * 0.75 + lowestRating * 0.25,
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
  warDecks.sort((a, b) => b.bundleScore - a.bundleScore);
  return warDecks;
}

function createWarDeckResult(options) {
  const candidateDecks = [];
  const candidatePools = options.imports.map((record) => {
    const indexes = record.decks.map((deck) => {
      candidateDecks.push(deck);
      return candidateDecks.length - 1;
    });
    return indexes;
  });

  return {
    timeRange: `${options.days}d`,
    poolCount: candidatePools.length,
    candidateDecks,
    warDecks: findValidWarDecksFromPools(candidateDecks, candidatePools),
  };
}

async function parseWarDeckRequest(request) {
  const contentLength = Number.parseInt(request.headers.get("content-length") ?? "0", 10);
  if (contentLength > MAX_REQUEST_BYTES) {
    throw new RequestError("Candidate data is too large.", 413);
  }

  let payload;
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_REQUEST_BYTES) {
      throw new RequestError("Candidate data is too large.", 413);
    }
    payload = JSON.parse(body);
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError("Candidate data is not valid JSON.");
  }

  const days = Number(payload?.days);
  if (!VALID_DAYS.has(days)) throw new RequestError("days must be 1, 3, or 7");
  if (!Array.isArray(payload.deckFilters) || payload.deckFilters.length !== WAR_DECK_SIZE) {
    throw new RequestError("Exactly four deck filters are required.");
  }
  if (!Array.isArray(payload.imports) || payload.imports.length !== WAR_DECK_SIZE) {
    throw new RequestError("Exactly four candidate pools are required.");
  }

  const missingDecks = payload.imports
    .map((value, index) => (value ? null : index + 1))
    .filter(Boolean);
  if (missingDecks.length > 0) {
    throw new RequestError(
      `Import candidate data for ${missingDecks.length === 1 ? "Deck" : "Decks"} ${missingDecks.join(" & ")} first.`,
      400,
      { missingDecks },
    );
  }

  const deckFilters = payload.deckFilters.map((filter, index) => {
    try {
      return normalizeSearch(days, filter?.include, filter?.exclude);
    } catch (error) {
      if (error instanceof RequestError) {
        throw new RequestError(error.message.replace(/^A search/u, `Deck ${index + 1}`));
      }
      throw error;
    }
  });
  const imports = payload.imports.map((value, index) => {
    const record = normalizeImportPayload(value);
    if (record.search.id !== deckFilters[index].id) {
      throw new RequestError(`Deck ${index + 1} candidate data does not match its current filters.`);
    }
    return record;
  });

  return { days, deckFilters, imports };
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
      if (url.pathname === "/api/war-decks" && request.method === "POST") {
        return jsonResponse(request, createWarDeckResult(await parseWarDeckRequest(request)));
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
          ...(error.details ?? {}),
        },
        status,
      );
    }
  },
};

export default worker;
