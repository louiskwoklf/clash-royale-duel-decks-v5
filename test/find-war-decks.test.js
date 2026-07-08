"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createWarDeckResult,
  createWarDeckResultFromOptions,
  findValidWarDecks,
  findValidWarDecksFromPools,
} = require("../src/find-war-decks");

function makeDeck(rank, prefix) {
  return {
    rank,
    name: `Deck ${rank}`,
    baseCards: Array.from({ length: 8 }, (_, index) => `${prefix}${index}`),
  };
}

test("accepts four decks only when all 32 base cards are unique", () => {
  const decks = [makeDeck(1, "a"), makeDeck(2, "b"), makeDeck(3, "c"), makeDeck(4, "d")];
  const warDecks = findValidWarDecks(decks);

  assert.equal(warDecks.length, 1);
  assert.deepEqual(warDecks[0].candidateIndexes, [0, 1, 2, 3]);
  assert.deepEqual(warDecks[0].deckRanks, [1, 2, 3, 4]);
});

test("exhausts the candidate combinations and rejects overlap", () => {
  const decks = [
    makeDeck(1, "a"),
    makeDeck(2, "b"),
    makeDeck(3, "c"),
    makeDeck(4, "d"),
    {
      rank: 5,
      name: "Overlap deck",
      baseCards: ["a0", "a1", "b0", "b1", "c0", "c1", "d0", "d1"],
    },
  ];
  const warDecks = findValidWarDecks(decks);

  assert.equal(warDecks.length, 1);
  assert.deepEqual(warDecks[0].deckRanks, [1, 2, 3, 4]);
});

test("combines one candidate from each filtered deck pool", () => {
  const decks = [makeDeck(1, "a"), makeDeck(2, "b"), makeDeck(3, "c"), makeDeck(4, "d")];
  const warDecks = findValidWarDecksFromPools(decks, [[0], [1], [2], [3]]);

  assert.equal(warDecks.length, 1);
  assert.deepEqual(warDecks[0].candidateIndexes, [0, 1, 2, 3]);
});

test("rejects malformed candidate decks", () => {
  assert.throws(
    () => findValidWarDecks([{ baseCards: ["one"] }]),
    /must contain 8 unique base cards/,
  );
});

test("creates a result from filtered extraction pools", async () => {
  const calls = [];
  const decks = [makeDeck(1, "a"), makeDeck(1, "b"), makeDeck(1, "c"), makeDeck(1, "d")];
  const extractionProvider = async (options) => {
    calls.push(options);
    return {
      timeRange: "7d",
      decks: [decks[calls.length - 1]],
    };
  };

  const result = await createWarDeckResultFromOptions(
    {
      days: 7,
      deckFilters: [
        { include: ["goblins"], exclude: [] },
        { include: ["valkyrie-ev1"], exclude: [] },
        { include: [], exclude: ["balloon-hero"] },
        { include: [], exclude: ["goblin-barrel-ev1"] },
      ],
    },
    extractionProvider,
  );

  assert.equal(calls.length, 4);
  assert.deepEqual(calls[0].includeCards, ["goblins"]);
  assert.deepEqual(calls[2].excludeCards, ["balloon-hero"]);
  assert.equal(result.candidateDecks.length, 4);
  assert.equal(result.warDecks.length, 1);
});

test("creates a result that retains the candidate deck lookup", () => {
  const decks = [makeDeck(1, "a"), makeDeck(2, "b"), makeDeck(3, "c"), makeDeck(4, "d")];
  const result = createWarDeckResult({
    source: "RoyaleAPI",
    timeRange: "1d",
    extractedAt: "2026-01-01T00:00:00.000Z",
    decks,
  });

  assert.equal(result.candidateDecks, decks);
  assert.equal(result.warDecks.length, 1);
  assert.equal(result.timeRange, "1d");
});
