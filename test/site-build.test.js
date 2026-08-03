"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const ROOT = path.resolve(__dirname, "..");

async function loadWorker() {
  const url = pathToFileURL(path.join(ROOT, "dist/server/index.js"));
  url.searchParams.set("test", `${process.pid}-${Date.now()}`);
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

function importPayload() {
  const decks = [
    ["arrows", "knight", "goblins", "archers", "minions", "cannon", "fireball", "hog-rider"],
    ["zap", "valkyrie", "musketeer", "skeletons", "ice-spirit", "tesla", "earthquake", "royal-giant"],
    ["poison", "baby-dragon", "tombstone", "graveyard", "barbarian-barrel", "tornado", "ice-wizard", "phoenix"],
    ["lightning", "pekka", "battle-ram", "bandit", "royal-ghost", "electro-wizard", "magic-archer", "heal-spirit"],
  ].map((cards, index) => ({
    name: `Imported deck ${index + 1}`,
    statsUrl: `https://royaleapi.com/decks/stats/${cards.join(",")}`,
    winRate: 50 + index,
  }));
  return {
    timeRange: "1d",
    sourceUrl: "https://royaleapi.com/decks/popular?time=1d&size=30",
    decks,
  };
}

test("Sites worker serves the finished page with absolute social metadata", async () => {
  const worker = await loadWorker();
  const env = createEnv();
  const response = await worker.fetch(new Request("https://war-decks.example/"), env);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /^text\/html/u);
  const html = await response.text();
  assert.match(html, /<title>War Deck Finder<\/title>/u);
  assert.match(html, /https:\/\/war-decks\.example\/og\.png/u);
  assert.doesNotMatch(html, /__SOCIAL_IMAGE_METADATA__/u);
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

test("Sites worker imports bookmarklet data and builds war decks from storage", async () => {
  const worker = await loadWorker();
  const env = createEnv();
  const importResponse = await worker.fetch(
    new Request("https://war-decks.example/api/import-decks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "oai-authenticated-user-id": "owner-1",
      },
      body: JSON.stringify(importPayload()),
    }),
    env,
  );
  assert.equal(importResponse.status, 201);
  const imported = await importResponse.json();
  assert.equal(imported.snapshot.deckCount, 4);

  const statusResponse = await worker.fetch(
    new Request("https://war-decks.example/api/deck-snapshots"),
    env,
  );
  const statuses = await statusResponse.json();
  assert.equal(statuses.snapshots.find((snapshot) => snapshot.timeRange === "1d").available, true);

  const resultResponse = await worker.fetch(
    new Request(
      "https://war-decks.example/api/war-decks?time=1&" +
        "d1inc=hog-rider&d2inc=royal-giant&d3inc=graveyard&d4inc=pekka",
    ),
    env,
  );
  assert.equal(resultResponse.status, 200);
  const result = await resultResponse.json();
  assert.equal(result.candidateDecks.length, 4);
  assert.equal(result.warDecks.length, 1);
  assert.ok(result.importedAt);
});

test("Sites worker rejects bookmarklet imports without an authenticated owner", async () => {
  const worker = await loadWorker();
  const env = createEnv();
  const response = await worker.fetch(
    new Request("https://war-decks.example/api/import-decks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(importPayload()),
    }),
    env,
  );
  assert.equal(response.status, 403);
});
