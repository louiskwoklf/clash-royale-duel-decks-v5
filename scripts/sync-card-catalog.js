#!/usr/bin/env node

"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile, spawn } = require("node:child_process");
const { promisify } = require("node:util");
const readline = require("node:readline/promises");

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(__dirname, "..");
const CATALOG_PATH = path.join(ROOT, "src", "card-catalog.js");
const CARD_IMAGE_DIR = path.join(ROOT, "public", "cards");
const CATALOG_PREFIX = "const CARD_CATALOG = Object.freeze(";
const CATALOG_SUFFIX = ".map((card) => Object.freeze(card)));";
const COST_PREFIX = "const ELIXIR_COSTS = Object.freeze(";
const COST_SUFFIX = ");\n\nfunction getCardCatalog";

// Tower Troops appear in RoyaleAPI's shared selector, but they are not part
// of a deck's eight-card list and must not enter overlap calculations.
const EXCLUDED_CARD_KEYS = new Set([
  "tower-princess",
  "cannoneer",
  "dagger-duchess",
  "royal-chef",
]);

function decodeHtmlAttribute(value) {
  return value
    .replace(/&quot;/gu, '"')
    .replace(/&#39;|&apos;/gu, "'")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&amp;/gu, "&")
    .replace(/&#x([0-9a-f]+);/giu, (_, digits) => String.fromCodePoint(Number.parseInt(digits, 16)))
    .replace(/&#([0-9]+);/gu, (_, digits) => String.fromCodePoint(Number.parseInt(digits, 10)));
}

function attributeValue(attributes, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = attributes.match(new RegExp(`(?:^|\\s)${escapedName}="([^"]*)"`, "u"));
  return match ? decodeHtmlAttribute(match[1]) : null;
}

function cardKind(key, evolutionValue) {
  if (evolutionValue === "2" || key.endsWith("-hero")) return "hero";
  if (evolutionValue === "1" || /-ev\d+$/u.test(key)) return "evolution";
  return "normal";
}

function cardBaseKey(key) {
  return key.replace(/-(?:ev\d+|hero)$/u, "");
}

function parseCardSelector(html) {
  if (typeof html !== "string" || !html.includes('id="cardSelectorContent"')) {
    throw new Error('Copy the outer HTML for <div id="cardSelectorContent"> and try again.');
  }

  const openings = [...html.matchAll(/<div\b([^>]*)>/gu)]
    .map((match) => ({ attributes: match[1], index: match.index }))
    .filter(({ attributes }) => {
      const className = attributeValue(attributes, "class") ?? "";
      return className.split(/\s+/u).includes("crcard") && attributeValue(attributes, "data-key");
    });

  const cards = openings.map((opening, index) => {
    const key = attributeValue(opening.attributes, "data-key");
    const name = attributeValue(opening.attributes, "data-title");
    const rarity = attributeValue(opening.attributes, "data-rarity");
    const evolution = attributeValue(opening.attributes, "data-evolution") ?? "";
    const end = openings[index + 1]?.index ?? html.length;
    const block = html.slice(opening.index, end);
    const imageTag = block.match(/<img\b([^>]*)>/u)?.[1] ?? "";
    const imageUrl = attributeValue(imageTag, "src");

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(key)) {
      throw new Error(`RoyaleAPI supplied an invalid card identifier: ${JSON.stringify(key)}.`);
    }
    if (!name || !rarity || !imageUrl) {
      throw new Error(`Card ${key} is missing its title, rarity, or image URL.`);
    }

    return {
      key,
      name,
      rarity,
      kind: cardKind(key, evolution),
      baseKey: cardBaseKey(key),
      imageUrl,
    };
  });

  if (cards.length < 100) {
    throw new Error(`Only ${cards.length} cards were found. Copy the complete selector block.`);
  }

  const duplicates = cards.filter((card, index) =>
    cards.findIndex((candidate) => candidate.key === card.key) !== index,
  );
  if (duplicates.length > 0) {
    throw new Error(`The selector contains duplicate cards: ${[...new Set(duplicates.map((card) => card.key))].join(", ")}.`);
  }

  return cards;
}

function readManagedJson(source, prefix, suffix, label) {
  const start = source.indexOf(prefix);
  const end = source.indexOf(suffix, start + prefix.length);
  if (start < 0 || end < 0) {
    throw new Error(`Could not find the managed ${label} section in src/card-catalog.js.`);
  }
  const jsonStart = start + prefix.length;
  const managedJson = source.slice(jsonStart, end).replace(/,\s*([}\]])/gu, "$1");
  return {
    value: JSON.parse(managedJson),
    start: jsonStart,
    end,
  };
}

function readCatalogSource(source) {
  const catalog = readManagedJson(source, CATALOG_PREFIX, CATALOG_SUFFIX, "catalog");
  const costs = readManagedJson(source, COST_PREFIX, COST_SUFFIX, "elixir costs");
  return { catalog, costs };
}

function catalogEntries(cards) {
  return cards
    .filter((card) => !EXCLUDED_CARD_KEYS.has(card.key))
    .map(({ imageUrl: _imageUrl, ...card }) => card);
}

function replaceManagedJson(source, section, value) {
  return `${source.slice(0, section.start)}${JSON.stringify(value, null, 2)}${source.slice(section.end)}`;
}

function imageDownloadUrl(rawUrl, key) {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" || !/(?:^|\.)royaleapi\.com$/u.test(url.hostname)) {
    throw new Error(`Card ${key} has an unexpected image host: ${url.hostname}.`);
  }
  if (!url.pathname.endsWith(`/${key}.png`)) {
    throw new Error(`Card ${key} has a mismatched image URL.`);
  }
  url.pathname = url.pathname.replace(
    /\/cdn-cgi\/image\/[^/]+\//u,
    "/cdn-cgi/image/q=85,w=150,h=180,format=png/",
  );
  return url.toString();
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function readHtmlInput(fileArgument) {
  if (fileArgument && fileArgument !== "-") {
    return fs.readFile(path.resolve(fileArgument), "utf8");
  }
  if (fileArgument === "-" || !process.stdin.isTTY) return readStdin();
  if (process.platform === "darwin") {
    const { stdout } = await execFileAsync("pbpaste", { maxBuffer: 2 * 1024 * 1024 });
    return stdout;
  }
  throw new Error("Pass the saved HTML file path, or pipe the selector HTML into this command.");
}

async function promptForMissingCosts(cards, costs) {
  const missing = [...new Set(cards.map((card) => card.baseKey))].filter((key) => costs[key] == null);
  if (missing.length === 0) return costs;
  if (!process.stdin.isTTY) {
    throw new Error(
      `These new base cards need an elixir cost: ${missing.join(", ")}. ` +
        "Copy the HTML to the clipboard and run npm run sync-cards so the tool can ask for it.",
    );
  }

  const cardByBaseKey = new Map(cards.map((card) => [card.baseKey, card]));
  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (const key of missing) {
      const card = cardByBaseKey.get(key);
      let value;
      while (!Number.isInteger(value) || value < 1 || value > 10) {
        value = Number.parseInt(await prompt.question(`Elixir cost for ${card.name} (${key}): `), 10);
      }
      costs[key] = value;
    }
  } finally {
    prompt.close();
  }
  return costs;
}

async function downloadImage(card) {
  const url = imageDownloadUrl(card.imageUrl, card.key);
  const response = await fetch(url, {
    headers: {
      Accept: "image/png,image/*;q=0.8",
      "User-Agent": "War-Deck-Finder card catalog sync",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Could not download ${card.name}: HTTP ${response.status}.`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) {
    throw new Error(`RoyaleAPI did not return a PNG image for ${card.name}.`);
  }
  return bytes;
}

async function downloadMissingImages(cards) {
  const missing = [];
  for (const card of cards) {
    try {
      await fs.access(path.join(CARD_IMAGE_DIR, `${card.key}.png`));
    } catch {
      missing.push(card);
    }
  }

  const downloaded = [];
  for (let index = 0; index < missing.length; index += 6) {
    const batch = missing.slice(index, index + 6);
    const images = await Promise.all(batch.map(async (card) => ({ card, bytes: await downloadImage(card) })));
    downloaded.push(...images);
  }
  return downloaded;
}

async function runTests() {
  await new Promise((resolve, reject) => {
    const child = spawn("npm", ["test"], { cwd: ROOT, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Tests failed with exit code ${code}.`));
    });
  });
}

async function syncCardCatalog(html) {
  const selectorCards = parseCardSelector(html);
  const cards = selectorCards.filter((card) => !EXCLUDED_CARD_KEYS.has(card.key));
  const source = await fs.readFile(CATALOG_PATH, "utf8");
  const { catalog: catalogSection, costs: costSection } = readCatalogSource(source);
  const oldCatalog = catalogSection.value;
  const oldKeys = new Set(oldCatalog.map((card) => card.key));
  const newKeys = new Set(cards.map((card) => card.key));
  const missingFromPaste = oldCatalog.filter((card) => !newKeys.has(card.key));
  if (missingFromPaste.length > 0) {
    throw new Error(
      `The pasted block is incomplete; it is missing existing cards: ` +
        `${missingFromPaste.map((card) => card.key).join(", ")}.`,
    );
  }

  const costs = await promptForMissingCosts(cards, costSection.value);
  const downloaded = await downloadMissingImages(cards);
  const nextCatalog = catalogEntries(selectorCards);
  const sortedCosts = Object.fromEntries(Object.entries(costs).sort(([a], [b]) => a.localeCompare(b)));

  let nextSource = replaceManagedJson(source, catalogSection, nextCatalog);
  const nextSections = readCatalogSource(nextSource);
  nextSource = replaceManagedJson(nextSource, nextSections.costs, sortedCosts);

  await fs.mkdir(CARD_IMAGE_DIR, { recursive: true });
  await Promise.all(
    downloaded.map(({ card, bytes }) =>
      fs.writeFile(path.join(CARD_IMAGE_DIR, `${card.key}.png`), bytes),
    ),
  );
  await fs.writeFile(CATALOG_PATH, nextSource, "utf8");

  const added = nextCatalog.filter((card) => !oldKeys.has(card.key));
  return {
    selectorCount: selectorCards.length,
    catalogCount: nextCatalog.length,
    added,
    downloaded: downloaded.map(({ card }) => card),
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.includes("--help") || args.includes("-h")) {
    process.stdout.write(
      "Copy cardSelectorContent outerHTML, then run: npm run sync-cards\n" +
        "Optional file input: npm run sync-cards -- path/to/card-selector.html\n",
    );
    process.exitCode = args.length > 1 ? 1 : 0;
    return;
  }

  const html = await readHtmlInput(args[0]);
  const result = await syncCardCatalog(html);
  process.stdout.write(`\nSynced ${result.catalogCount} playable cards in RoyaleAPI order.\n`);
  if (result.added.length > 0) {
    process.stdout.write(`Added: ${result.added.map((card) => card.name).join(", ")}\n`);
  } else {
    process.stdout.write("No new card metadata was needed.\n");
  }
  process.stdout.write(`Downloaded ${result.downloaded.length} missing image${result.downloaded.length === 1 ? "" : "s"}.\n`);
  process.stdout.write("\nChecking the updated catalog…\n");
  await runTests();
  process.stdout.write("\nCard catalog is ready.\n");
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`Card sync failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  EXCLUDED_CARD_KEYS,
  catalogEntries,
  cardBaseKey,
  cardKind,
  imageDownloadUrl,
  parseCardSelector,
  readCatalogSource,
  replaceManagedJson,
  syncCardCatalog,
};
