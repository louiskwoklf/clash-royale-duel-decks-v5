"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { getCardCatalog, hasCardKey, validateCardKeys } = require("../src/card-catalog");

test("loads the RoyaleAPI card selector catalog", () => {
  const cards = getCardCatalog();

  assert.equal(cards.length, 180);
  assert.equal(hasCardKey("goblins"), true);
  assert.equal(hasCardKey("valkyrie-ev1"), true);
  assert.equal(hasCardKey("balloon-hero"), true);
  assert.equal(cards.find((card) => card.key === "goblins").baseKey, "goblins");
  assert.equal(cards.find((card) => card.key === "valkyrie-ev1").baseKey, "valkyrie");
});

test("rejects unknown card keys", () => {
  assert.throws(
    () => validateCardKeys(["not-a-card"], "deck 1 include cards"),
    /Unknown card key/,
  );
});
