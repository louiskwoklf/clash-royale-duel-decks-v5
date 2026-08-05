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

function deckDataBucket(env) {
  if (!env.DECK_DATA) {
    throw new Error("Deck search storage is unavailable.");
  }
  return env.DECK_DATA;
}

function validateCardKeys(keys, label) {
  keys.forEach((key) => {
    if (!CARD_KEYS.has(key)) throw new RequestError(`Unknown card key in ${label}: ${key}`);
  });
}

function normalizeSearch(days, include = [], exclude = []) {
  if (!VALID_DAYS.has(days)) throw new RequestError("time must be 1, 3, or 7");

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

function searchStorageKey(search) {
  return `royaleapi-searches/v2/${encodeURIComponent(search.id)}.json`;
}

function buildPopularDecksUrl(search) {
  const url = new URL("/decks/popular", ROYALE_API_ORIGIN);
  const params = new URLSearchParams({
    time: `${search.days}d`,
    sort: "rating",
    size: "30",
    players: "PvP",
    min_ranked_trophies: "0",
    max_ranked_trophies: "4400",
    min_elixir: "1",
    max_elixir: "9",
    evo: "None",
    min_cycle_elixir: "4",
    max_cycle_elixir: "28",
    mode: "detail",
    type: "TopRanked",
    global_exclude: "false",
  });
  search.include.forEach((card) => params.append("inc", card));
  search.exclude.forEach((card) => params.append("exc", card));
  url.search = params.toString();
  return url.toString();
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

  return { url, search: normalizeSearch(days, url.searchParams.getAll("inc"), url.searchParams.getAll("exc")) };
}

function parseDeckFilters(url) {
  return Array.from({ length: WAR_DECK_SIZE }, (_, index) => {
    const deckNumber = index + 1;
    try {
      return normalizeSearch(
        Number.parseInt(url.searchParams.get("time") ?? "1", 10),
        url.searchParams.getAll(`d${deckNumber}inc`),
        url.searchParams.getAll(`d${deckNumber}exc`),
      );
    } catch (error) {
      if (error instanceof RequestError) {
        throw new RequestError(error.message.replace(/^A search/u, `Deck ${deckNumber}`));
      }
      throw error;
    }
  });
}

function parseApiOptions(url) {
  const days = Number.parseInt(url.searchParams.get("time") ?? "1", 10);
  if (!VALID_DAYS.has(days)) throw new RequestError("time must be 1, 3, or 7");
  return {
    days,
    refresh: url.searchParams.get("refresh") === "true",
    deckFilters: parseDeckFilters(url),
  };
}

function groupDeckSearches(options) {
  const groups = new Map();
  options.deckFilters.forEach((filter, index) => {
    const search = normalizeSearch(options.days, filter.include, filter.exclude);
    if (!groups.has(search.id)) {
      groups.set(search.id, {
        ...search,
        deckSlots: [],
        sourceUrl: buildPopularDecksUrl(search),
      });
    }
    groups.get(search.id).deckSlots.push(index + 1);
  });
  return [...groups.values()];
}

function deckMatchesSearch(deck, search) {
  return (
    search.include.every((card) => deck.cards.includes(card)) &&
    search.exclude.every((card) => !deck.cards.includes(card))
  );
}

function normalizeImportPayload(
  payload,
  importedAt = payload?.importedAt ?? new Date().toISOString(),
) {
  if (!payload || typeof payload !== "object") {
    throw new RequestError("Imported deck data must be a JSON object.");
  }

  const { url: sourceUrl, search } = searchFromSourceUrl(payload.sourceUrl);
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
    version: 2,
    source: "RoyaleAPI Safari bookmarklet",
    sourceUrl: sourceUrl.toString(),
    timeRange: `${search.days}d`,
    search,
    importedAt,
    decks,
  };
}

function searchSummary(record, deckSlots = []) {
  return {
    id: record.search.id,
    timeRange: record.timeRange,
    include: record.search.include,
    exclude: record.search.exclude,
    deckSlots,
    importedAt: record.importedAt,
    deckCount: record.decks.length,
    sourceUrl: buildPopularDecksUrl(record.search),
  };
}

async function loadDeckSearch(env, search) {
  const object = await deckDataBucket(env).get(searchStorageKey(search));
  if (!object) return null;
  const record = normalizeImportPayload(await object.json(), object.customMetadata?.importedAt);
  if (record.search.id !== search.id) {
    throw new Error("Stored deck search does not match its storage key.");
  }
  return record;
}

async function listDeckSearches(options, env) {
  return Promise.all(
    groupDeckSearches(options).map(async (group) => {
      const record = await loadDeckSearch(env, group);
      if (!record) return { ...group, available: false };
      return { ...searchSummary(record, group.deckSlots), available: true };
    }),
  );
}

async function importDeckSearch(request, env) {
  if (!request.headers.get("oai-authenticated-user-id")) {
    throw new RequestError("Sign in to import RoyaleAPI search results.", 403);
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

  const record = normalizeImportPayload(payload);
  await deckDataBucket(env).put(searchStorageKey(record.search), JSON.stringify(record), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
    customMetadata: { importedAt: record.importedAt },
  });
  responseCache.clear();
  return searchSummary(record);
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

async function createWarDeckResult(options, env) {
  const groups = groupDeckSearches(options);
  const loaded = await Promise.all(
    groups.map(async (group) => ({ group, record: await loadDeckSearch(env, group) })),
  );
  const missingSearches = loaded
    .filter(({ record }) => !record)
    .map(({ group }) => ({
      id: group.id,
      deckSlots: group.deckSlots,
      sourceUrl: group.sourceUrl,
    }));
  if (missingSearches.length > 0) {
    const noun = missingSearches.length === 1 ? "search needs" : "searches need";
    throw new RequestError(
      `${missingSearches.length} RoyaleAPI ${noun} importing before decks can be combined.`,
      404,
      { missingSearches },
    );
  }

  const candidateDecks = [];
  const poolBySearch = new Map();
  loaded.forEach(({ group, record }) => {
    const indexes = record.decks.map((deck) => {
      candidateDecks.push(deck);
      return candidateDecks.length - 1;
    });
    poolBySearch.set(group.id, indexes);
  });
  const candidatePools = options.deckFilters.map((filter) =>
    poolBySearch.get(normalizeSearch(options.days, filter.include, filter.exclude).id),
  );

  return {
    timeRange: `${options.days}d`,
    searches: loaded.map(({ group, record }) => searchSummary(record, group.deckSlots)),
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
        return jsonResponse(request, { search: await importDeckSearch(request, env) }, 201);
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
      if (url.pathname === "/api/deck-searches") {
        return jsonResponse(request, { searches: await listDeckSearches(parseApiOptions(url), env) });
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
          ...(error.details ?? {}),
        },
        status,
      );
    }
  },
};

export default worker;
