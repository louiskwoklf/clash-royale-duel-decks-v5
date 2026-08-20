"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  catalogEntries,
  imageDownloadUrl,
  parseCardSelector,
  readCatalogSource,
} = require("../scripts/sync-card-catalog");

function selectorCard({ key, title, rarity, evolution = "" }) {
  return `<div id="crcard-${key}" class="crcard " data-title="${title}" ` +
    `data-rarity="${rarity}" data-evolution="${evolution}" data-key="${key}">` +
    `<div class="crcardimage"><img src="https://cdns3.royaleapi.com/cdn-cgi/image/` +
    `q=80,w=75,h=90,format=auto/static/img/cards/v10-test/${key}.png"></div></div>`;
}

function fullSelector(cards) {
  const filler = Array.from({ length: 100 }, (_, index) =>
    selectorCard({ key: `filler-${index}`, title: `Filler ${index}`, rarity: "Common" }),
  );
  return `<div id="cardSelectorContent" class="content">${[...cards, ...filler].join("\n")}</div>`;
}

test("parses metadata and preserves selector order", () => {
  const parsed = parseCardSelector(fullSelector([
    selectorCard({ key: "valkyrie-hero", title: "Hero Valkyrie", rarity: "Rare", evolution: "2" }),
    selectorCard({ key: "elite-barbarians-ev1", title: "Elite Barbarians Evolution", rarity: "Common", evolution: "1" }),
    selectorCard({ key: "valkyrie", title: "Valkyrie", rarity: "Rare" }),
  ]));

  assert.deepEqual(parsed.slice(0, 3).map(({ imageUrl: _imageUrl, ...card }) => card), [
    {
      key: "valkyrie-hero",
      name: "Hero Valkyrie",
      rarity: "Rare",
      kind: "hero",
      baseKey: "valkyrie",
    },
    {
      key: "elite-barbarians-ev1",
      name: "Elite Barbarians Evolution",
      rarity: "Common",
      kind: "evolution",
      baseKey: "elite-barbarians",
    },
    {
      key: "valkyrie",
      name: "Valkyrie",
      rarity: "Rare",
      kind: "normal",
      baseKey: "valkyrie",
    },
  ]);
});

test("omits Tower Troops from the playable catalog", () => {
  const parsed = parseCardSelector(fullSelector([
    selectorCard({ key: "goblins", title: "Goblins", rarity: "Common" }),
    selectorCard({ key: "tower-princess", title: "Tower Princess", rarity: "Common" }),
  ]));

  assert.equal(catalogEntries(parsed).some((card) => card.key === "tower-princess"), false);
  assert.equal(catalogEntries(parsed)[0].key, "goblins");
});

test("requests a 150 by 180 PNG from the supplied RoyaleAPI image", () => {
  const url = imageDownloadUrl(
    "https://cdns3.royaleapi.com/cdn-cgi/image/q=80,w=75,h=90,format=auto/" +
      "static/img/cards/v10-test/valkyrie-hero.png",
    "valkyrie-hero",
  );

  assert.match(url, /q=85,w=150,h=180,format=png/u);
});

test("reads the managed catalog and elixir-cost sections", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "card-catalog.js"), "utf8");
  const sections = readCatalogSource(source);

  assert.ok(sections.catalog.value.length >= 177);
  assert.equal(sections.costs.value.valkyrie, 4);
});
