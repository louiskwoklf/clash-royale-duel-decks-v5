"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createServer, createWarDeckService, parseApiOptions } = require("../src/server");

function exampleResult() {
  return {
    source: "RoyaleAPI",
    sourceUrl: "https://royaleapi.com/decks/popular?time=1d",
    retrievalMethod: "test",
    timeRange: "1d",
    extractedAt: "2026-01-01T00:00:00.000Z",
    searchedAt: "2026-01-01T00:00:01.000Z",
    candidateDecks: [],
    candidateDeckCount: 20,
    totalCombinations: 4845,
    examinedCombinations: 4845,
    validWarDeckCount: 2,
    warDecks: [],
  };
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
  const options = parseApiOptions(new URL("http://localhost/api/war-decks?time=3&size=20"));
  assert.deepEqual(options, { days: 3, size: 20, method: "auto", refresh: false });
  assert.throws(
    () => parseApiOptions(new URL("http://localhost/api/war-decks?time=2")),
    /time must be 1, 3, or 7/,
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
  const options = { days: 1, size: 20, method: "auto", refresh: false };
  const first = service.get(options);
  const second = service.get(options);

  assert.equal(calls, 1);
  release();
  const [firstResponse, secondResponse] = await Promise.all([first, second]);
  assert.equal(firstResponse.result.validWarDeckCount, 2);
  assert.equal(secondResponse.cache.sharedRequest, true);
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

    const first = await fetch(`${origin}/api/war-decks?time=1`);
    const firstJson = await first.json();
    assert.equal(first.status, 200);
    assert.equal(firstJson.validWarDeckCount, 2);
    assert.equal(firstJson.request.cache.hit, false);

    const second = await fetch(`${origin}/api/war-decks?time=1`);
    const secondJson = await second.json();
    assert.equal(secondJson.request.cache.hit, true);
    assert.equal(calls, 1);

    await fetch(`${origin}/api/war-decks?time=1&refresh=true`);
    assert.equal(calls, 2);

    const invalid = await fetch(`${origin}/api/war-decks?time=9`);
    assert.equal(invalid.status, 400);
  } finally {
    await close(server);
  }
});
