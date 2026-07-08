"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildPopularDecksUrl,
  normalizeCardSlug,
  parseArguments,
  parseDecksFromMarkdown,
  parseDeckStatsHref,
} = require("../src/extract-decks");

test("buildPopularDecksUrl creates the requested RoyaleAPI query", () => {
  const url = new URL(buildPopularDecksUrl({ days: 3, size: 20 }));

  assert.equal(url.origin, "https://royaleapi.com");
  assert.equal(url.pathname, "/decks/popular");
  assert.equal(url.searchParams.get("time"), "3d");
  assert.equal(url.searchParams.get("size"), "20");
  assert.equal(url.searchParams.get("sort"), "rating");
  assert.equal(url.searchParams.get("type"), "TopRanked");
});

test("buildPopularDecksUrl rejects unsupported date ranges", () => {
  assert.throws(() => buildPopularDecksUrl({ days: 2 }), /1, 3, or 7/);
});

test("buildPopularDecksUrl appends include and exclude card filters", () => {
  const url = new URL(
    buildPopularDecksUrl({
      days: 7,
      size: 20,
      includeCards: ["goblins", "valkyrie-ev1"],
      excludeCards: ["balloon-hero", "goblin-barrel-ev1"],
    }),
  );

  assert.deepEqual(url.searchParams.getAll("inc"), ["goblins", "valkyrie-ev1"]);
  assert.deepEqual(url.searchParams.getAll("exc"), ["balloon-hero", "goblin-barrel-ev1"]);
});

test("normalizes evolution and hero variants to their base card", () => {
  assert.equal(normalizeCardSlug("royal-hogs-ev1"), "royal-hogs");
  assert.equal(normalizeCardSlug("barbarian-barrel-hero"), "barbarian-barrel");
  assert.equal(normalizeCardSlug("skeleton-king"), "skeleton-king");
});

test("parses and validates all eight cards from a stats URL", () => {
  const result = parseDeckStatsHref(
    "/decks/stats/arrows%2Cbarbarian-barrel-hero%2Celectro-spirit%2Cflying-machine%2Cgoblin-cage-ev1%2Croyal-hogs%2Croyal-recruits-ev1%2Czappies",
  );

  assert.equal(result.cards.length, 8);
  assert.equal(result.baseCards.length, 8);
  assert.ok(result.cards.includes("goblin-cage-ev1"));
  assert.ok(result.baseCards.includes("goblin-cage"));
});

test("argument parser accepts all supported time spellings", () => {
  assert.equal(parseArguments(["--time", "7d"]).days, 7);
  assert.equal(parseArguments(["--time", "1"]).days, 1);
  assert.throws(() => parseArguments(["--time", "2"]), /must be 1, 3, or 7/);
});

test("parses deck names, card names, and stats URLs from reader markdown", () => {
  const markdown = `
#### Example Deck

[![Image 181: Royal Hogs Evolution](https://cdn.example/royal-hogs-ev1.png)](https://royaleapi.com/decks/stats/arrows,barbarian-barrel,electro-spirit,flying-machine,goblin-cage-ev1,royal-hogs-ev1,royal-recruits-ev1,zappies)

[![Image 182: Arrows](https://cdn.example/arrows.png)](https://royaleapi.com/decks/stats/arrows,barbarian-barrel,electro-spirit,flying-machine,goblin-cage-ev1,royal-hogs-ev1,royal-recruits-ev1,zappies)

#### Unrelated Section

No deck here.
`;
  const decks = parseDecksFromMarkdown(markdown);

  assert.equal(decks.length, 1);
  assert.equal(decks[0].name, "Example Deck");
  assert.deepEqual(decks[0].cardNames, ["Royal Hogs Evolution", "Arrows"]);
  assert.equal(decks[0].cards.length, 8);
  assert.ok(decks[0].baseCards.includes("royal-hogs"));
});
