#!/usr/bin/env node

"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const ROYALE_API_ORIGIN = "https://royaleapi.com";
const VALID_DAYS = new Set([1, 3, 7]);

function buildPopularDecksUrl({ days = 1, size = 20 } = {}) {
  if (!VALID_DAYS.has(days)) {
    throw new Error(`Date range must be 1, 3, or 7 days; received ${days}.`);
  }

  if (!Number.isInteger(size) || size < 1 || size > 30) {
    throw new Error(`Size must be an integer from 1 to 30; received ${size}.`);
  }

  const url = new URL("/decks/popular", ROYALE_API_ORIGIN);
  url.search = new URLSearchParams({
    time: `${days}d`,
    sort: "rating",
    size: String(size),
    players: "PvP",
    min_ranked_trophies: "0",
    max_ranked_trophies: "4400",
    min_elixir: "1",
    max_elixir: "9",
    evo: "None",
    min_cycle_elixir: "4",
    max_cycle_elixir: "28",
    mode: "detail",
    type: "TopRanked",
    global_exclude: "false",
  }).toString();

  return url.toString();
}

function normalizeCardSlug(slug) {
  return slug.replace(/-(?:ev\d+|hero)$/u, "");
}

function parseDeckStatsHref(href) {
  const url = new URL(href, ROYALE_API_ORIGIN);
  const prefix = "/decks/stats/";

  if (!url.pathname.startsWith(prefix)) {
    throw new Error(`Not a RoyaleAPI deck stats URL: ${href}`);
  }

  const cards = decodeURIComponent(url.pathname.slice(prefix.length))
    .split(",")
    .map((card) => card.trim())
    .filter(Boolean);

  if (cards.length !== 8 || new Set(cards).size !== 8) {
    throw new Error(`Expected 8 unique cards in deck stats URL: ${href}`);
  }

  const baseCards = cards.map(normalizeCardSlug);
  if (new Set(baseCards).size !== 8) {
    throw new Error(`Deck contains overlapping base cards after variant normalization: ${href}`);
  }

  return { cards, baseCards, statsUrl: url.toString() };
}

async function extractDecksFromPage(page) {
  return page.locator("#decksContainer .deck_segment").evaluateAll((segments) =>
    segments.map((segment, index) => {
      const statsAnchors = [...segment.querySelectorAll('a[href^="/decks/stats/"]')];
      const statsHref = statsAnchors[0]?.getAttribute("href") ?? null;
      const name = segment.querySelector("h4")?.textContent?.trim() ?? null;
      const cardNames = [
        ...new Set(
          statsAnchors
            .map((anchor) => anchor.querySelector("img[alt]")?.getAttribute("alt")?.trim())
            .filter(Boolean),
        ),
      ];

      return { rank: index + 1, name, statsHref, cardNames };
    }),
  );
}

function parseDecksFromMarkdown(markdown) {
  const headingPattern = /^#### (.+)$/gmu;
  const headings = [...markdown.matchAll(headingPattern)];
  const decks = [];

  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    const sectionStart = heading.index + heading[0].length;
    const sectionEnd = headings[index + 1]?.index ?? markdown.length;
    const section = markdown.slice(sectionStart, sectionEnd);
    const statsUrls = [
      ...new Set(
        [...section.matchAll(/https:\/\/royaleapi\.com\/decks\/stats\/[^)\s]+/gu)].map(
          (match) => match[0],
        ),
      ),
    ];

    if (statsUrls.length !== 1) {
      continue;
    }

    const cardNames = [
      ...new Set(
        [...section.matchAll(/\[!\[Image \d+:\s*([^\]]+)\]/gu)].map((match) =>
          match[1].trim(),
        ),
      ),
    ];

    decks.push({
      rank: decks.length + 1,
      name: heading[1].trim(),
      cardNames,
      ...parseDeckStatsHref(statsUrls[0]),
    });
  }

  if (decks.length === 0) {
    throw new Error("The rendered RoyaleAPI document contained no valid decks.");
  }

  return decks;
}

function createResult({ days, size, sourceUrl, decks, retrievalMethod }) {
  if (decks.length > size) {
    throw new Error(`RoyaleAPI returned ${decks.length} decks when at most ${size} were requested.`);
  }

  return {
    source: "RoyaleAPI",
    sourceUrl,
    retrievalMethod,
    timeRange: `${days}d`,
    requestedSize: size,
    deckCount: decks.length,
    extractedAt: new Date().toISOString(),
    decks,
  };
}

async function extractPopularDecksThroughProxy({
  days = 1,
  size = 20,
  timeoutMs = 90_000,
} = {}) {
  const sourceUrl = buildPopularDecksUrl({ days, size });
  const source = new URL(sourceUrl);
  const proxyUrl = `https://r.jina.ai/http://royaleapi.com${source.pathname}${source.search}`;
  const response = await fetch(proxyUrl, {
    headers: { Accept: "text/plain" },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Read-only proxy returned HTTP ${response.status}.`);
  }

  const markdown = await response.text();
  const decks = parseDecksFromMarkdown(markdown);
  return createResult({ days, size, sourceUrl, decks, retrievalMethod: "jina-reader" });
}

async function extractPopularDecksThroughBrowser({
  days = 1,
  size = 20,
  timeoutMs = 90_000,
  chromePath,
  profilePath = path.resolve(".cache/royaleapi-browser"),
} = {}) {
  const { chromium } = require("playwright");
  const sourceUrl = buildPopularDecksUrl({ days, size });
  const launchOptions = {
    headless: false,
    viewport: { width: 1280, height: 900 },
  };

  if (chromePath) {
    launchOptions.executablePath = chromePath;
  } else {
    launchOptions.channel = "chrome";
  }

  await fs.mkdir(profilePath, { recursive: true });
  const context = await chromium.launchPersistentContext(profilePath, launchOptions);

  try {
    const page = context.pages()[0] ?? (await context.newPage());
    const response = await page.goto(sourceUrl, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });

    const deckSegments = page.locator("#decksContainer .deck_segment");

    try {
      await deckSegments.first().waitFor({ state: "attached", timeout: timeoutMs });
    } catch {
      const title = await page.title();
      throw new Error(
        `RoyaleAPI deck data did not appear within ${timeoutMs}ms ` +
          `(initial HTTP status ${response?.status() ?? "unknown"}, page title ${JSON.stringify(title)}). ` +
          "Leave the Chrome window open while any automatic Cloudflare check completes.",
      );
    }

    const rawDecks = await extractDecksFromPage(page);
    const decks = rawDecks.map(({ statsHref, ...deck }) => {
      if (!statsHref) {
        throw new Error(`Deck at rank ${deck.rank} has no stats URL.`);
      }

      return { ...deck, ...parseDeckStatsHref(statsHref) };
    });

    return createResult({ days, size, sourceUrl, decks, retrievalMethod: "browser" });
  } finally {
    await context.close();
  }
}

async function extractPopularDecks(options = {}) {
  const method = options.method ?? "auto";

  if (method === "proxy") {
    return extractPopularDecksThroughProxy(options);
  }

  if (method === "browser") {
    return extractPopularDecksThroughBrowser(options);
  }

  if (method !== "auto") {
    throw new Error(`Method must be auto, proxy, or browser; received ${method}.`);
  }

  try {
    return await extractPopularDecksThroughProxy(options);
  } catch (proxyError) {
    try {
      return await extractPopularDecksThroughBrowser(options);
    } catch (browserError) {
      throw new Error(
        `Both extraction routes failed. Proxy: ${proxyError.message} Browser: ${browserError.message}`,
      );
    }
  }
}

function parseArguments(argv) {
  const options = { days: 1, size: 20, timeoutMs: 90_000 };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];

    if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else if (argument === "--time") {
      options.days = Number.parseInt(value?.replace(/d$/u, ""), 10);
      index += 1;
    } else if (argument === "--size") {
      options.size = Number.parseInt(value, 10);
      index += 1;
    } else if (argument === "--timeout") {
      options.timeoutMs = Number.parseInt(value, 10) * 1000;
      index += 1;
    } else if (argument === "--output") {
      options.output = value;
      index += 1;
    } else if (argument === "--chrome-path") {
      options.chromePath = value;
      index += 1;
    } else if (argument === "--method") {
      options.method = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (!VALID_DAYS.has(options.days)) {
    throw new Error("--time must be 1, 3, or 7 (optionally followed by d).");
  }

  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error("--timeout must be a positive number of seconds.");
  }

  return options;
}

function helpText() {
  return `Usage: npm run extract -- [options]

Options:
  --time 1|3|7       RoyaleAPI date range in days (default: 1)
  --size 1..30       Number of decks to request (default: 20)
  --timeout SECONDS  Time allowed for page rendering (default: 90)
  --output FILE      Write JSON to a file instead of stdout
  --method METHOD    auto, proxy, or browser (default: auto)
  --chrome-path FILE Use a specific Chrome/Chromium executable
  --help              Show this help
`;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(helpText());
    return;
  }

  const result = await extractPopularDecks(options);
  const json = `${JSON.stringify(result, null, 2)}\n`;

  if (options.output) {
    const outputPath = path.resolve(options.output);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, json, "utf8");
    process.stderr.write(`Extracted ${result.deckCount} decks to ${outputPath}\n`);
  } else {
    process.stdout.write(json);
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`Extraction failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  buildPopularDecksUrl,
  extractPopularDecks,
  extractPopularDecksThroughBrowser,
  extractPopularDecksThroughProxy,
  normalizeCardSlug,
  parseArguments,
  parseDecksFromMarkdown,
  parseDeckStatsHref,
};
