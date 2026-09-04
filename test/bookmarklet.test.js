"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");

async function loadBookmarkletFunction(context) {
  const source = await fs.readFile(path.join(ROOT, "public/app.js"), "utf8");
  const start = source.indexOf("function collectRoyaleApiDecks(");
  const end = source.indexOf("\nfunction createBookmarklet()", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return vm.runInNewContext(`(${source.slice(start, end)})`, context);
}

function deckContainer() {
  const cards = Array.from({ length: 8 }, (_, index) => ({
    classList: ["deck_card", `deck_card_key_card-${index + 1}`],
  }));
  const segment = {
    textContent: "Rating Usage Wins Draws Losses 72.5 54.3% 0.0% 45.7%",
    querySelector(selector) {
      if (selector === 'a[href^="/decks/stats/"]') {
        return { href: "https://royaleapi.com/decks/stats/card-1,card-2,card-3,card-4,card-5,card-6,card-7,card-8" };
      }
      if (selector === "h4") return { textContent: "Test deck" };
      return null;
    },
    querySelectorAll(selector) {
      return selector === "img.deck_card" ? cards : [];
    },
  };
  return { querySelectorAll: () => [segment] };
}

function bookmarkletContext(href, opener = null) {
  const assigned = [];
  const alerts = [];
  const listeners = new Map();
  const window = {
    opener,
    location: {
      href,
      assign(url) {
        assigned.push(url);
      },
    },
    alert(message) {
      alerts.push(message);
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
    setTimeout(listener) {
      window.timeout = listener;
      return 1;
    },
    clearTimeout() {},
    close() {
      window.didClose = true;
    },
  };
  return {
    assigned,
    alerts,
    context: {
      URL,
      TextEncoder,
      btoa: (value) => Buffer.from(value, "binary").toString("base64"),
      document: { querySelector: () => deckContainer() },
      window,
    },
    listeners,
    window,
  };
}

function decodeRelay(url) {
  const encoded = url.split("#import=")[1];
  return JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
}

test("bookmarklet falls back to a Finder relay when Cloudflare detached the opener", async () => {
  const transferId = "6df12cae-0d19-47d6-b88e-a6e08485687b";
  const harness = bookmarkletContext(
    `https://royaleapi.com/decks/popular?time=7d&inc=hog-rider&wdf_import=${transferId}`,
  );
  const collect = await loadBookmarkletFunction(harness.context);

  collect("https://war-decks.example");

  assert.equal(harness.alerts.length, 0);
  assert.equal(harness.assigned.length, 1);
  const envelope = decodeRelay(harness.assigned[0]);
  assert.equal(envelope.transferId, transferId);
  assert.equal(envelope.payload.timeRange, "7d");
  assert.match(envelope.payload.sourceUrl, /inc=hog-rider/u);
  assert.doesNotMatch(envelope.payload.sourceUrl, /wdf_import/u);
  assert.equal(envelope.payload.decks[0].cards.length, 8);
});

test("bookmarklet uses the fast opener path when it is still connected", async () => {
  const sent = [];
  const opener = {
    closed: false,
    postMessage(message, origin) {
      sent.push({ message, origin });
    },
  };
  const harness = bookmarkletContext(
    "https://royaleapi.com/decks/popular?time=3d&wdf_import=transfer-123",
    opener,
  );
  const collect = await loadBookmarkletFunction(harness.context);

  collect("https://war-decks.example");

  assert.equal(harness.assigned.length, 0);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].origin, "https://war-decks.example");
  assert.equal(sent[0].message.transferId, "transfer-123");
  harness.listeners.get("message")({
    origin: "https://war-decks.example",
    source: opener,
    data: {
      type: "war-deck-finder:import-result",
      requestId: sent[0].message.requestId,
      ok: true,
    },
  });
  assert.equal(harness.window.didClose, true);
});
