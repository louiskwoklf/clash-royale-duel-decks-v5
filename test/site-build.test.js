"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const ROOT = path.resolve(__dirname, "..");

const CANDIDATE_CARDS = [
  ["arrows", "knight", "goblins", "archers", "minions", "cannon", "fireball", "hog-rider"],
  ["zap", "valkyrie", "musketeer", "skeletons", "ice-spirit", "tesla", "earthquake", "royal-giant"],
  ["poison", "baby-dragon", "tombstone", "graveyard", "barbarian-barrel", "tornado", "ice-wizard", "phoenix"],
  ["lightning", "pekka", "battle-ram", "bandit", "royal-ghost", "electro-wizard", "magic-archer", "heal-spirit"],
];

const ALTERNATE_CARDS = [
  "goblin-barrel", "princess", "inferno-tower", "rocket",
  "goblin-gang", "ice-golem", "the-log", "dart-goblin",
];

async function loadWorker() {
  const url = pathToFileURL(path.join(ROOT, "dist/server/index.js"));
  url.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(url.href)).default;
}

function createEnv() {
  return {
    ASSETS: {
      async fetch(request) {
        const url = new URL(request.url);
        const relativePath = url.pathname.replace(/^\/+/, "");
        try {
          const body = await fs.readFile(path.join(ROOT, "dist/client", relativePath));
          const type = relativePath.endsWith(".html")
            ? "text/html; charset=utf-8"
            : "application/octet-stream";
          return new Response(body, { headers: { "Content-Type": type } });
        } catch {
          return new Response("Not found", { status: 404 });
        }
      },
    },
  };
}

function candidateDeck(index, overrides = {}) {
  const cards = overrides.cards ?? CANDIDATE_CARDS[index];
  return {
    name: `Imported deck ${index + 1}`,
    statsUrl: `https://royaleapi.com/decks/stats/${[...cards].sort().join(",")}`,
    cards: [...cards],
    rating: overrides.rating ?? 60 - index,
    winRate: 50 + index,
  };
}

function importPayload({ include = [], exclude = [], deckIndexes = [0, 1, 2, 3], days = 1, decks } = {}) {
  const sourceUrl = new URL("https://royaleapi.com/decks/popular");
  sourceUrl.searchParams.set("time", `${days}d`);
  sourceUrl.searchParams.set("size", "30");
  include.forEach((card) => sourceUrl.searchParams.append("inc", card));
  exclude.forEach((card) => sourceUrl.searchParams.append("exc", card));
  return {
    timeRange: `${days}d`,
    sourceUrl: sourceUrl.toString(),
    decks: decks ?? deckIndexes.map(candidateDeck),
  };
}

function deckFilters(includes = [[], [], [], []], excludes = [[], [], [], []]) {
  return includes.map((include, index) => ({ include, exclude: excludes[index] ?? [] }));
}

async function findWarDecks(worker, env, payload) {
  return worker.fetch(
    new Request("https://war-decks.example/api/war-decks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
    env,
  );
}

test("Sites worker serves the finished page with absolute social metadata", async () => {
  const worker = await loadWorker();
  const env = createEnv();
  const response = await worker.fetch(new Request("https://war-decks.example/"), env);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /^text\/html/u);
  const html = await response.text();
  assert.match(html, /<title>War Deck Finder<\/title>/u);
  assert.match(html, /<link rel="icon" href="\/favicon\.svg" type="image\/svg\+xml" \/>/u);
  assert.match(html, /class="brand-name">War Deck Finder<\/span>/u);
  assert.match(
    html,
    /class="range-tab active"[^>]+data-days="7"[^>]+aria-pressed="true"/u,
  );
  assert.match(html, /Open all RoyaleAPI searches/u);
  assert.match(html, /id="find-decks-button"/u);
  assert.doesNotMatch(html, /id="deck-search-actions"/u);
  assert.doesNotMatch(html, /id="search-list"/u);
  assert.match(html, /https:\/\/war-decks\.example\/og\.png/u);
  assert.doesNotMatch(html, /__SOCIAL_IMAGE_METADATA__/u);
  assert.doesNotMatch(html, /Update data/u);
});

test("Sites worker exposes the card catalog without a network call", async () => {
  const worker = await loadWorker();
  const env = createEnv();
  const response = await worker.fetch(new Request("https://war-decks.example/api/cards"), env);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.ok(data.cards.length > 100);
  assert.ok(data.cards.some((card) => card.key === "hog-rider"));
});

test("client returns bookmarklet data to its opener without persistent storage", async () => {
  const app = await fs.readFile(path.join(ROOT, "dist/client/app.js"), "utf8");
  const html = await fs.readFile(path.join(ROOT, "dist/client/index.html"), "utf8");
  assert.match(app, /const finderWindow = window\.opener;/u);
  assert.match(app, /finderWindow\.postMessage\(/u);
  assert.match(app, /window\.close\(\);/u);
  assert.match(app, /deckImports: Array\(4\)\.fill\(null\)/u);
  assert.match(app, /days: 7,/u);
  assert.match(app, /second: "2-digit"/u);
  assert.match(app, /rating: ratingMatch \? Number\.parseFloat\(ratingMatch\[1\]\) : null/u);
  assert.match(app, /querySelectorAll\("img\.deck_card"\)/u);
  assert.doesNotMatch(app, /function orderDeckCards/u);
  assert.doesNotMatch(app, /bundles found · 4 candidate pools/u);
  assert.doesNotMatch(html, /id="clear-deck-button"/u);
  assert.match(html, /Install the bookmarklet once/u);
  assert.match(html, /class="bookmarklet-icon" src="\/favicon\.svg"/u);
  assert.doesNotMatch(app, /BroadcastChannel|localStorage|sessionStorage|#import=|\/api\/import-decks|\/api\/deck-searches/u);
});

test("four submitted candidate pools stay independent when filters are identical", async () => {
  const worker = await loadWorker();
  const env = createEnv();
  const response = await findWarDecks(worker, env, {
    days: 1,
    deckFilters: deckFilters(),
    imports: CANDIDATE_CARDS.map((_, index) => importPayload({ deckIndexes: [index] })),
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.poolCount, 4);
  assert.equal(result.candidateDecks.length, 4);
  assert.deepEqual(result.candidateDecks[0].cards, CANDIDATE_CARDS[0]);
  assert.equal(result.warDecks.length, 1);
});

test("four exact in-memory searches become four combinatorics pools", async () => {
  const worker = await loadWorker();
  const env = createEnv();
  const filters = ["hog-rider", "royal-giant", "graveyard", "pekka"];
  const response = await findWarDecks(worker, env, {
    days: 1,
    deckFilters: deckFilters(filters.map((card) => [card])),
    imports: filters.map((card, index) =>
      importPayload({ include: [card], deckIndexes: [index] }),
    ),
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.poolCount, 4);
  assert.equal(result.candidateDecks.length, 4);
  assert.equal(result.warDecks.length, 1);
  assert.deepEqual(result.warDecks[0].candidateIndexes, [0, 1, 2, 3]);
});

test("bundles are sorted by weighted average and lowest RoyaleAPI rating", async () => {
  const worker = await loadWorker();
  const env = createEnv();
  const response = await findWarDecks(worker, env, {
    days: 1,
    deckFilters: deckFilters(),
    imports: [
      importPayload({
        decks: [
          candidateDeck(0, { rating: 50 }),
          candidateDeck(4, { cards: ALTERNATE_CARDS, rating: 90 }),
        ],
      }),
      importPayload({ decks: [candidateDeck(1, { rating: 60 })] }),
      importPayload({ decks: [candidateDeck(2, { rating: 60 })] }),
      importPayload({ decks: [candidateDeck(3, { rating: 60 })] }),
    ],
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.warDecks.length, 2);
  assert.deepEqual(result.warDecks[0].candidateIndexes, [1, 2, 3, 4]);
  assert.equal(result.warDecks[0].bundleScore, 65.625);
  assert.equal(result.warDecks[1].bundleScore, 55.625);
});

test("every imported candidate must include a valid RoyaleAPI rating", async () => {
  const worker = await loadWorker();
  const env = createEnv();
  const unratedDeck = candidateDeck(0);
  delete unratedDeck.rating;
  const response = await findWarDecks(worker, env, {
    days: 1,
    deckFilters: deckFilters(),
    imports: [
      importPayload({ decks: [unratedDeck] }),
      importPayload({ deckIndexes: [1] }),
      importPayload({ deckIndexes: [2] }),
      importPayload({ deckIndexes: [3] }),
    ],
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).message, /invalid rating/u);
});

test("missing in-memory pools prevent combinatorics and identify the decks", async () => {
  const worker = await loadWorker();
  const env = createEnv();
  const response = await findWarDecks(worker, env, {
    days: 1,
    deckFilters: deckFilters(),
    imports: [importPayload({ deckIndexes: [0] }), null, null, null],
  });
  assert.equal(response.status, 400);
  const data = await response.json();
  assert.deepEqual(data.missingDecks, [2, 3, 4]);
});

test("submitted candidate pools must match each deck's exact filters", async () => {
  const worker = await loadWorker();
  const env = createEnv();
  const response = await findWarDecks(worker, env, {
    days: 1,
    deckFilters: deckFilters([["pekka"], [], [], []]),
    imports: CANDIDATE_CARDS.map((_, index) =>
      importPayload({ include: index === 0 ? ["hog-rider"] : [], deckIndexes: [index] }),
    ),
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).message, /does not match/u);
});

test("an in-memory pool may validly contain zero candidates", async () => {
  const worker = await loadWorker();
  const env = createEnv();
  const response = await findWarDecks(worker, env, {
    days: 1,
    deckFilters: deckFilters(),
    imports: CANDIDATE_CARDS.map((_, index) =>
      importPayload({ deckIndexes: index === 0 ? [] : [index] }),
    ),
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.warDecks.length, 0);
});

test("legacy persistence endpoints are no longer available", async () => {
  const worker = await loadWorker();
  const env = createEnv();
  const importResponse = await worker.fetch(
    new Request("https://war-decks.example/api/import-decks", { method: "POST" }),
    env,
  );
  assert.equal(importResponse.status, 405);
  const statusResponse = await worker.fetch(
    new Request("https://war-decks.example/api/deck-searches"),
    env,
  );
  assert.equal(statusResponse.status, 404);
});
