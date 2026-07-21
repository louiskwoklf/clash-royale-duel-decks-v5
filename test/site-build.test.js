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

const env = {
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

test("Sites worker serves the finished page with absolute social metadata", async () => {
  const worker = await loadWorker();
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
  const response = await worker.fetch(new Request("https://war-decks.example/api/cards"), env);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.ok(data.cards.length > 100);
  assert.ok(data.cards.some((card) => card.key === "hog-rider"));
});
