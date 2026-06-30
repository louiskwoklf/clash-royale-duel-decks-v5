"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  countFourDeckCombinations,
  createWarDeckResult,
  findValidWarDecks,
} = require("../src/find-war-decks");

function makeDeck(rank, prefix) {
  return {
    rank,
    name: `Deck ${rank}`,
    baseCards: Array.from({ length: 8 }, (_, index) => `${prefix}${index}`),
  };
}

test("counts every four-deck combination", () => {
  assert.equal(countFourDeckCombinations(3), 0);
  assert.equal(countFourDeckCombinations(4), 1);
  assert.equal(countFourDeckCombinations(5), 5);
  assert.equal(countFourDeckCombinations(20), 4845);
  assert.equal(countFourDeckCombinations(30), 27405);
});

test("accepts four decks only when all 32 base cards are unique", () => {
  const decks = [makeDeck(1, "a"), makeDeck(2, "b"), makeDeck(3, "c"), makeDeck(4, "d")];
  const result = findValidWarDecks(decks);

  assert.equal(result.examinedCombinations, 1);
  assert.equal(result.validWarDeckCount, 1);
  assert.equal(result.warDecks[0].uniqueBaseCards.length, 32);
  assert.equal(new Set(result.warDecks[0].uniqueBaseCards).size, 32);
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
  const result = findValidWarDecks(decks);

  assert.equal(result.totalCombinations, 5);
  assert.equal(result.examinedCombinations, 5);
  assert.equal(result.validWarDeckCount, 1);
  assert.deepEqual(result.warDecks[0].deckRanks, [1, 2, 3, 4]);
});

test("rejects malformed candidate decks", () => {
  assert.throws(
    () => findValidWarDecks([{ baseCards: ["one"] }]),
    /must contain 8 unique base cards/,
  );
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
  assert.equal(result.validWarDeckCount, 1);
  assert.equal(result.timeRange, "1d");
});
