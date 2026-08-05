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

async function loadWorker() {
  const url = pathToFileURL(path.join(ROOT, "dist/server/index.js"));
  url.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(url.href)).default;
}

function createMemoryBucket() {
  const objects = new Map();
  return {
    async get(key) {
      const stored = objects.get(key);
      if (!stored) return null;
      return {
        customMetadata: stored.customMetadata,
        async json() {
          return JSON.parse(stored.body);
        },
      };
    },
    async put(key, body, options = {}) {
      objects.set(key, { body, customMetadata: options.customMetadata });
    },
  };
}

function createEnv() {
  return {
    DECK_DATA: createMemoryBucket(),
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

function candidateDeck(index) {
  const cards = CANDIDATE_CARDS[index];
  return {
    name: `Imported deck ${index + 1}`,
    statsUrl: `https://royaleapi.com/decks/stats/${cards.join(",")}`,
    winRate: 50 + index,
  };
}

function importPayload({ include = [], exclude = [], deckIndexes = [0, 1, 2, 3], days = 1 } = {}) {
  const sourceUrl = new URL("https://royaleapi.com/decks/popular");
  sourceUrl.searchParams.set("time", `${days}d`);
  sourceUrl.searchParams.set("size", "30");
  include.forEach((card) => sourceUrl.searchParams.append("inc", card));
  exclude.forEach((card) => sourceUrl.searchParams.append("exc", card));
  return {
    timeRange: `${days}d`,
    sourceUrl: sourceUrl.toString(),
    decks: deckIndexes.map(candidateDeck),
  };
}

async function importSearch(worker, env, payload, { authenticated = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (authenticated) headers["oai-authenticated-user-id"] = "owner-1";
  return worker.fetch(
    new Request("https://war-decks.example/api/import-decks", {
      method: "POST",
      headers,
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
  assert.match(html, /Open RoyaleAPI searches/u);
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

test("identical deck filters share one stored candidate search", async () => {
  const worker = await loadWorker();
  const env = createEnv();
  const imported = await importSearch(worker, env, importPayload());
  assert.equal(imported.status, 201);
  assert.equal((await imported.json()).search.deckCount, 4);

  const statusResponse = await worker.fetch(
    new Request("https://war-decks.example/api/deck-searches?time=1"),
    env,
  );
  const statuses = await statusResponse.json();
  assert.equal(statuses.searches.length, 1);
  assert.deepEqual(statuses.searches[0].deckSlots, [1, 2, 3, 4]);
  assert.equal(statuses.searches[0].available, true);

  const resultResponse = await worker.fetch(
    new Request("https://war-decks.example/api/war-decks?time=1"),
    env,
  );
  assert.equal(resultResponse.status, 200);
  const result = await resultResponse.json();
  assert.equal(result.searches.length, 1);
  assert.equal(result.candidateDecks.length, 4);
  assert.equal(result.warDecks.length, 1);
});

test("four exact RoyaleAPI searches become four combinatorics pools", async () => {
  const worker = await loadWorker();
  const env = createEnv();
  const filters = ["hog-rider", "royal-giant", "graveyard", "pekka"];

  for (let index = 0; index < filters.length; index += 1) {
    const response = await importSearch(
      worker,
      env,
      importPayload({ include: [filters[index]], deckIndexes: [index] }),
    );
    assert.equal(response.status, 201);
  }

  const query = new URLSearchParams({ time: "1" });
  filters.forEach((card, index) => query.append(`d${index + 1}inc`, card));

  const statusResponse = await worker.fetch(
    new Request(`https://war-decks.example/api/deck-searches?${query}`),
    env,
  );
  const status = await statusResponse.json();
  assert.equal(status.searches.length, 4);
  assert.ok(status.searches.every((search) => search.available));

  const resultResponse = await worker.fetch(
    new Request(`https://war-decks.example/api/war-decks?${query}`),
    env,
  );
  assert.equal(resultResponse.status, 200);
  const result = await resultResponse.json();
  assert.equal(result.searches.length, 4);
  assert.equal(result.candidateDecks.length, 4);
  assert.equal(result.warDecks.length, 1);
  assert.deepEqual(result.warDecks[0].candidateIndexes, [0, 1, 2, 3]);
});

test("missing exact searches prevent combinatorics and identify the missing slots", async () => {
  const worker = await loadWorker();
  const env = createEnv();
  await importSearch(worker, env, importPayload({ include: ["hog-rider"], deckIndexes: [0] }));

  const response = await worker.fetch(
    new Request(
      "https://war-decks.example/api/war-decks?time=1&" +
        "d1inc=hog-rider&d2inc=royal-giant&d3inc=graveyard&d4inc=pekka",
    ),
    env,
  );
  assert.equal(response.status, 404);
  const data = await response.json();
  assert.equal(data.missingSearches.length, 3);
  assert.deepEqual(data.missingSearches.map((search) => search.deckSlots), [[2], [3], [4]]);
});

test("bookmarklet imports must match the exact RoyaleAPI filters", async () => {
  const worker = await loadWorker();
  const env = createEnv();
  const response = await importSearch(
    worker,
    env,
    importPayload({ include: ["pekka"], deckIndexes: [0] }),
  );
  assert.equal(response.status, 400);
  assert.match((await response.json()).message, /does not match/u);
});

test("an exact search may validly return zero candidates", async () => {
  const worker = await loadWorker();
  const env = createEnv();
  const response = await importSearch(
    worker,
    env,
    importPayload({ include: ["hog-rider"], deckIndexes: [] }),
  );
  assert.equal(response.status, 201);
  assert.equal((await response.json()).search.deckCount, 0);
});

test("Sites worker rejects bookmarklet imports without an authenticated owner", async () => {
  const worker = await loadWorker();
  const env = createEnv();
  const response = await importSearch(worker, env, importPayload(), { authenticated: false });
  assert.equal(response.status, 403);
});
