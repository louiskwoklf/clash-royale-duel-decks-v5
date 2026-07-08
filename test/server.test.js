"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createServer, createWarDeckService, parseApiOptions } = require("../src/server");

function exampleResult() {
  return {
    timeRange: "1d",
    candidateDecks: [],
    warDecks: [{ id: "1-2-3-4" }, { id: "5-6-7-8" }],
  };
}

function emptyDeckFilters() {
  return Array.from({ length: 4 }, () => ({ include: [], exclude: [] }));
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

async function close(server) {
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

test("validates API query options", () => {
  const options = parseApiOptions(new URL("http://localhost/api/war-decks?time=3"));
  assert.deepEqual(options, { days: 3, refresh: false, deckFilters: emptyDeckFilters() });
  assert.deepEqual(
    parseApiOptions(
      new URL(
        "http://localhost/api/war-decks?time=7&refresh=true&d1inc=goblins&d1inc=goblins&d2exc=balloon-hero",
      ),
    ),
    {
      days: 7,
      refresh: true,
      deckFilters: [
        { include: ["goblins"], exclude: [] },
        { include: [], exclude: ["balloon-hero"] },
        { include: [], exclude: [] },
        { include: [], exclude: [] },
      ],
    },
  );
  assert.throws(
    () => parseApiOptions(new URL("http://localhost/api/war-decks?time=2")),
    /time must be 1, 3, or 7/,
  );
  assert.throws(
    () => parseApiOptions(new URL("http://localhost/api/war-decks?time=1&d1inc=nope")),
    /Unknown card key/,
  );
  assert.throws(
    () =>
      parseApiOptions(
        new URL(
          "http://localhost/api/war-decks?time=1&" +
            [
              "arrows",
              "goblins",
              "knight",
              "archers",
              "minions",
              "zap",
              "cannon",
              "mortar",
              "tesla",
            ]
              .map((card) => `d1inc=${card}`)
              .join("&"),
        ),
      ),
    /cannot include more than 8 cards/,
  );
});

test("coalesces simultaneous searches for the same meta window", async () => {
  let calls = 0;
  let release;
  const resultProvider = () => {
    calls += 1;
    return new Promise((resolve) => {
      release = () => resolve(exampleResult());
    });
  };
  const service = createWarDeckService({ resultProvider });
  const options = { days: 1, refresh: false, deckFilters: emptyDeckFilters() };
  const first = service.get(options);
  const second = service.get(options);

  assert.equal(calls, 1);
  release();
  const [firstResponse, secondResponse] = await Promise.all([first, second]);
  assert.equal(firstResponse.warDecks.length, 2);
  assert.equal(secondResponse.warDecks.length, 2);
});

test("serves the dashboard and caches API results", async () => {
  let calls = 0;
  const server = createServer({
    resultProvider: async () => {
      calls += 1;
      return exampleResult();
    },
  });
  const origin = await listen(server);

  try {
    const home = await fetch(origin);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /War Deck Finder/);

    const cards = await fetch(`${origin}/api/cards`);
    const cardsJson = await cards.json();
    assert.equal(cards.status, 200);
    assert.equal(cardsJson.cards.some((card) => card.key === "goblins"), true);

    const image = await fetch(`${origin}/cards/goblins.png`);
    assert.equal(image.status, 200);
    assert.equal(image.headers.get("content-type"), "image/png");
    assert.ok((await image.arrayBuffer()).byteLength > 0);

    const first = await fetch(`${origin}/api/war-decks?time=1`);
    const firstJson = await first.json();
    assert.equal(first.status, 200);
    assert.equal(firstJson.warDecks.length, 2);
    assert.equal(firstJson.request, undefined);

    const second = await fetch(`${origin}/api/war-decks?time=1`);
    await second.json();
    assert.equal(calls, 1);

    await fetch(`${origin}/api/war-decks?time=1&refresh=true`);
    assert.equal(calls, 2);

    const invalid = await fetch(`${origin}/api/war-decks?time=9`);
    assert.equal(invalid.status, 400);
  } finally {
    await close(server);
  }
});
