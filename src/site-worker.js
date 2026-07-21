const CARD_CATALOG = /*__CARD_CATALOG__*/ [];
const CARD_KEYS = new Set(CARD_CATALOG.map((card) => card.key));
const CACHE_TTL_MS = 5 * 60 * 1000;
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

function appendCardFilters(params, key, cards) {
  cards.forEach((card) => params.append(key, card));
}

function buildPopularDecksUrl({ days = 1, size = 30, includeCards = [], excludeCards = [] }) {
  if (!VALID_DAYS.has(days)) {
    throw new Error(`Date range must be 1, 3, or 7 days; received ${days}.`);
  }

  const url = new URL("/decks/popular", ROYALE_API_ORIGIN);
  const params = new URLSearchParams({
    time: `${days}d`,
    sort: "rating",
    size: String(size),
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
  appendCardFilters(params, "inc", includeCards);
  appendCardFilters(params, "exc", excludeCards);
  url.search = params.toString();
  return url.toString();
}

function normalizeCardSlug(slug) {
  return slug.replace(/-(?:ev\d+|hero)$/u, "");
}

function parseDeckStatsHref(href) {
  const url = new URL(href, ROYALE_API_ORIGIN);
  url.protocol = "https:";
  const prefix = "/decks/stats/";
  if (!url.pathname.startsWith(prefix)) {
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

function parseDecksFromMarkdown(markdown) {
  const headings = [...markdown.matchAll(/^#### (.+)$/gmu)];
  const decks = [];

  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    const sectionStart = heading.index + heading[0].length;
    const sectionEnd = headings[index + 1]?.index ?? markdown.length;
    const section = markdown.slice(sectionStart, sectionEnd);
    const statsUrls = [
      ...new Set(
        [...section.matchAll(/https?:\/\/royaleapi\.com\/decks\/stats\/[^)\s]+/gu)].map(
          (match) => match[0],
        ),
      ),
    ];
    if (statsUrls.length !== 1) continue;

    const cardNames = [
      ...new Set(
        [...section.matchAll(/\[!\[Image \d+:\s*([^\]]+)\]/gu)].map((match) => match[1].trim()),
      ),
    ];
    const statsRow = section.match(
      /\|\s*[\d,]+\s*\|\s*[\d.,%]+\s*\|\s*([\d.]+)%\s*\|\s*[\d.]+%\s*\|\s*[\d.]+%\s*\|/u,
    );
    decks.push({
      rank: decks.length + 1,
      name: heading[1].trim(),
      cardNames,
      winRate: statsRow ? Number.parseFloat(statsRow[1]) : null,
      ...parseDeckStatsHref(statsUrls[0]),
    });
  }

  if (decks.length === 0) {
    throw new Error("The rendered RoyaleAPI document contained no valid decks.");
  }
  return decks;
}

async function extractPopularDecks({
  days = 1,
  size = 30,
  includeCards = [],
  excludeCards = [],
} = {}) {
  const source = new URL(buildPopularDecksUrl({ days, size, includeCards, excludeCards }));
  const proxyUrl = `https://r.jina.ai/http://royaleapi.com${source.pathname}${source.search}`;
  let lastError;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(proxyUrl, { headers: { Accept: "text/plain" } });
      if (!response.ok) {
        throw new Error(`Read-only proxy returned HTTP ${response.status}.`);
      }
      const decks = parseDecksFromMarkdown(await response.text());
      if (decks.length > size) {
        throw new Error(`RoyaleAPI returned ${decks.length} decks when at most ${size} were requested.`);
      }
      return { timeRange: `${days}d`, decks };
    } catch (error) {
      lastError = error;
      if (attempt === 1) await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw lastError;
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

async function createWarDeckResult(options) {
  const hasFilters = options.deckFilters.some(
    (filter) => filter.include.length > 0 || filter.exclude.length > 0,
  );
  if (!hasFilters) {
    const extraction = await extractPopularDecks(options);
    return {
      timeRange: extraction.timeRange,
      candidateDecks: extraction.decks,
      warDecks: findValidWarDecks(extraction.decks),
    };
  }

  const candidateDecks = [];
  const poolCache = new Map();
  const candidatePools = [];
  let timeRange = null;

  for (const filter of options.deckFilters) {
    const key = JSON.stringify(filter);
    if (!poolCache.has(key)) {
      const extraction = await extractPopularDecks({
        ...options,
        includeCards: filter.include,
        excludeCards: filter.exclude,
      });
      const indexes = extraction.decks.map((deck) => {
        candidateDecks.push(deck);
        return candidateDecks.length - 1;
      });
      timeRange ??= extraction.timeRange;
      poolCache.set(key, indexes);
    }
    candidatePools.push(poolCache.get(key));
  }

  return {
    timeRange,
    candidateDecks,
    warDecks: findValidWarDecksFromPools(candidateDecks, candidatePools),
  };
}

async function getWarDeckResult(options) {
  const key = JSON.stringify({ days: options.days, deckFilters: options.deckFilters });
  const cached = responseCache.get(key);
  if (!options.refresh && cached && cached.expiresAt > Date.now()) return cached.result;
  if (inFlight.has(key)) return inFlight.get(key);

  const pending = createWarDeckResult(options).then((result) => {
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
      if (request.method !== "GET" && request.method !== "HEAD") {
        return jsonResponse(request, { error: "Invalid request", message: "Method not allowed" }, 405);
      }
      if (url.pathname === "/api/health") {
        return jsonResponse(request, { status: "ok", service: "war-deck-finder" });
      }
      if (url.pathname === "/api/cards") {
        return jsonResponse(request, { cards: CARD_CATALOG });
      }
      if (url.pathname === "/api/war-decks") {
        return jsonResponse(request, await getWarDeckResult(parseApiOptions(url)));
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
