#!/usr/bin/env node

"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const { extractPopularDecks } = require("./extract-decks");

const WAR_DECK_SIZE = 4;

function validateCandidateDeck(deck, index) {
  if (!deck || !Array.isArray(deck.baseCards)) {
    throw new Error(`Candidate deck ${index + 1} has no baseCards array.`);
  }

  if (deck.baseCards.length !== 8 || new Set(deck.baseCards).size !== 8) {
    throw new Error(`Candidate deck ${index + 1} must contain 8 unique base cards.`);
  }
}

function normalizeCardList(cards = []) {
  if (!Array.isArray(cards)) {
    throw new Error("Deck filter card lists must be arrays.");
  }

  return [...new Set(cards)].sort();
}

function normalizeDeckFilters(deckFilters = []) {
  if (!Array.isArray(deckFilters)) {
    throw new Error("Deck filters must be an array.");
  }

  return Array.from({ length: WAR_DECK_SIZE }, (_, index) => {
    const filter = deckFilters[index] ?? {};
    return {
      include: normalizeCardList(filter.include ?? []),
      exclude: normalizeCardList(filter.exclude ?? []),
    };
  });
}

function hasActiveDeckFilters(deckFilters) {
  return deckFilters.some((filter) => filter.include.length > 0 || filter.exclude.length > 0);
}

function deckFilterKey(filter) {
  return JSON.stringify(filter);
}

function deckIdentity(deck) {
  return deck.statsUrl ?? deck.cards?.join(",") ?? deck.baseCards.join(",");
}

function findValidWarDecks(candidateDecks) {
  if (!Array.isArray(candidateDecks)) {
    throw new Error("Candidate decks must be an array.");
  }

  candidateDecks.forEach(validateCandidateDeck);

  const warDecks = [];

  for (let first = 0; first < candidateDecks.length - 3; first += 1) {
    for (let second = first + 1; second < candidateDecks.length - 2; second += 1) {
      for (let third = second + 1; third < candidateDecks.length - 1; third += 1) {
        for (let fourth = third + 1; fourth < candidateDecks.length; fourth += 1) {
          const indexes = [first, second, third, fourth];
          const decks = indexes.map((index) => candidateDecks[index]);
          const baseCards = decks.flatMap((deck) => deck.baseCards);

          if (new Set(baseCards).size !== 32) {
            continue;
          }

          const ranks = decks.map((deck, index) => deck.rank ?? indexes[index] + 1);
          warDecks.push({
            id: indexes.join("-"),
            candidateIndexes: indexes,
            deckRanks: ranks,
            deckNames: decks.map((deck) => deck.name ?? null),
          });
        }
      }
    }
  }

  return warDecks;
}

function findValidWarDecksFromPools(candidateDecks, candidatePools) {
  if (!Array.isArray(candidateDecks) || !Array.isArray(candidatePools)) {
    throw new Error("Candidate decks and pools must be arrays.");
  }

  if (candidatePools.length !== WAR_DECK_SIZE) {
    throw new Error(`Expected ${WAR_DECK_SIZE} candidate pools.`);
  }

  candidateDecks.forEach(validateCandidateDeck);

  const warDecks = [];
  const seenBundles = new Set();

  function visit(poolIndex, indexes) {
    if (poolIndex === candidatePools.length) {
      const decks = indexes.map((index) => candidateDecks[index]);
      const baseCards = decks.flatMap((deck) => deck.baseCards);

      if (new Set(baseCards).size !== WAR_DECK_SIZE * 8) {
        return;
      }

      const bundleKey = decks.map(deckIdentity).sort().join("|");
      if (seenBundles.has(bundleKey)) {
        return;
      }
      seenBundles.add(bundleKey);

      const ranks = decks.map((deck, index) => deck.rank ?? indexes[index] + 1);
      warDecks.push({
        id: indexes.join("-"),
        candidateIndexes: indexes,
        deckRanks: ranks,
        deckNames: decks.map((deck) => deck.name ?? null),
      });
      return;
    }

    candidatePools[poolIndex].forEach((candidateIndex) => {
      if (!indexes.includes(candidateIndex)) {
        visit(poolIndex + 1, [...indexes, candidateIndex]);
      }
    });
  }

  visit(0, []);
  return warDecks;
}

function createWarDeckResult(extraction) {
  if (!extraction || !Array.isArray(extraction.decks)) {
    throw new Error("Input must be a deck-extraction result containing a decks array.");
  }

  return {
    timeRange: extraction.timeRange ?? null,
    candidateDecks: extraction.decks,
    warDecks: findValidWarDecks(extraction.decks),
  };
}

async function createWarDeckResultFromOptions(options = {}, extractionProvider = extractPopularDecks) {
  const deckFilters = normalizeDeckFilters(options.deckFilters);

  if (!hasActiveDeckFilters(deckFilters)) {
    return createWarDeckResult(await extractionProvider(options));
  }

  const candidateDecks = [];
  const poolCache = new Map();
  const candidatePools = [];
  let timeRange = null;

  for (const filter of deckFilters) {
    const key = deckFilterKey(filter);

    if (!poolCache.has(key)) {
      const extraction = await extractionProvider({
        ...options,
        includeCards: filter.include,
        excludeCards: filter.exclude,
      });
      const indexes = extraction.decks.map((deck) => {
        candidateDecks.push(deck);
        return candidateDecks.length - 1;
      });

      timeRange = timeRange ?? extraction.timeRange ?? null;
      poolCache.set(key, indexes);
    }

    candidatePools.push(poolCache.get(key));
  }

  return {
    timeRange,
    candidateDecks,
    warDecks: findValidWarDecksFromPools(candidateDecks, candidatePools),
  };
}

function parseArguments(argv) {
  const options = {
    days: 1,
    size: 20,
    timeoutMs: 90_000,
    method: "auto",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];

    if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else if (argument === "--input") {
      options.input = value;
      index += 1;
    } else if (argument === "--output") {
      options.output = value;
      index += 1;
    } else if (argument === "--time") {
      options.days = Number.parseInt(value?.replace(/d$/u, ""), 10);
      index += 1;
    } else if (argument === "--size") {
      options.size = Number.parseInt(value, 10);
      index += 1;
    } else if (argument === "--timeout") {
      options.timeoutMs = Number.parseInt(value, 10) * 1000;
      index += 1;
    } else if (argument === "--method") {
      options.method = value;
      index += 1;
    } else if (argument === "--chrome-path") {
      options.chromePath = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (![1, 3, 7].includes(options.days)) {
    throw new Error("--time must be 1, 3, or 7 (optionally followed by d).");
  }

  if (!Number.isInteger(options.size) || options.size < 1 || options.size > 30) {
    throw new Error("--size must be an integer from 1 to 30.");
  }

  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error("--timeout must be a positive number of seconds.");
  }

  if (!["auto", "proxy", "browser"].includes(options.method)) {
    throw new Error("--method must be auto, proxy, or browser.");
  }

  return options;
}

function helpText() {
  return `Usage: npm run find-war-decks -- [options]

Fetch current decks and search them:
  npm run find-war-decks -- --time 1 --output data/war-decks-1d.json

Search a previously extracted file without another network request:
  npm run find-war-decks -- --input data/decks-1d.json --output data/war-decks-1d.json

Options:
  --input FILE        Read a saved extraction result instead of fetching
  --output FILE       Write JSON to a file instead of stdout
  --time 1|3|7        RoyaleAPI date range in days (default: 1)
  --size 1..30        Number of candidate decks (default: 20)
  --timeout SECONDS   Time allowed for page rendering (default: 90)
  --method METHOD     auto, proxy, or browser (default: auto)
  --chrome-path FILE  Use a specific Chrome/Chromium executable
  --help               Show this help
`;
}

async function loadExtraction(options) {
  if (options.input) {
    const contents = await fs.readFile(path.resolve(options.input), "utf8");
    return JSON.parse(contents);
  }

  return extractPopularDecks(options);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(helpText());
    return;
  }

  const extraction = await loadExtraction(options);
  const result = createWarDeckResult(extraction);
  const json = `${JSON.stringify(result, null, 2)}\n`;

  if (options.output) {
    const outputPath = path.resolve(options.output);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, json, "utf8");
    process.stderr.write(
      `Found ${result.warDecks.length} valid war decks; wrote ${outputPath}\n`,
    );
  } else {
    process.stdout.write(json);
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`War-deck search failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  createWarDeckResult,
  createWarDeckResultFromOptions,
  findValidWarDecks,
  findValidWarDecksFromPools,
  normalizeDeckFilters,
  parseArguments,
};
