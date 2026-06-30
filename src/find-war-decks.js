#!/usr/bin/env node

"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const { extractPopularDecks } = require("./extract-decks");

function countFourDeckCombinations(deckCount) {
  if (!Number.isInteger(deckCount) || deckCount < 0) {
    throw new Error(`Deck count must be a non-negative integer; received ${deckCount}.`);
  }

  return deckCount < 4
    ? 0
    : (deckCount * (deckCount - 1) * (deckCount - 2) * (deckCount - 3)) / 24;
}

function validateCandidateDeck(deck, index) {
  if (!deck || !Array.isArray(deck.baseCards)) {
    throw new Error(`Candidate deck ${index + 1} has no baseCards array.`);
  }

  if (deck.baseCards.length !== 8 || new Set(deck.baseCards).size !== 8) {
    throw new Error(`Candidate deck ${index + 1} must contain 8 unique base cards.`);
  }
}

function findValidWarDecks(candidateDecks) {
  if (!Array.isArray(candidateDecks)) {
    throw new Error("Candidate decks must be an array.");
  }

  candidateDecks.forEach(validateCandidateDeck);

  const warDecks = [];
  let examinedCombinations = 0;

  for (let first = 0; first < candidateDecks.length - 3; first += 1) {
    for (let second = first + 1; second < candidateDecks.length - 2; second += 1) {
      for (let third = second + 1; third < candidateDecks.length - 1; third += 1) {
        for (let fourth = third + 1; fourth < candidateDecks.length; fourth += 1) {
          examinedCombinations += 1;
          const indexes = [first, second, third, fourth];
          const decks = indexes.map((index) => candidateDecks[index]);
          const baseCards = decks.flatMap((deck) => deck.baseCards);

          if (new Set(baseCards).size !== 32) {
            continue;
          }

          const ranks = decks.map((deck, index) => deck.rank ?? indexes[index] + 1);
          warDecks.push({
            id: ranks.join("-"),
            candidateIndexes: indexes,
            deckRanks: ranks,
            deckNames: decks.map((deck) => deck.name ?? null),
            uniqueBaseCards: baseCards,
          });
        }
      }
    }
  }

  return {
    candidateDeckCount: candidateDecks.length,
    totalCombinations: countFourDeckCombinations(candidateDecks.length),
    examinedCombinations,
    validWarDeckCount: warDecks.length,
    warDecks,
  };
}

function createWarDeckResult(extraction) {
  if (!extraction || !Array.isArray(extraction.decks)) {
    throw new Error("Input must be a deck-extraction result containing a decks array.");
  }

  const search = findValidWarDecks(extraction.decks);
  return {
    source: extraction.source ?? "RoyaleAPI",
    sourceUrl: extraction.sourceUrl ?? null,
    retrievalMethod: extraction.retrievalMethod ?? "saved-json",
    timeRange: extraction.timeRange ?? null,
    extractedAt: extraction.extractedAt ?? null,
    searchedAt: new Date().toISOString(),
    candidateDecks: extraction.decks,
    ...search,
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
      `Examined ${result.examinedCombinations} combinations and found ` +
        `${result.validWarDeckCount} valid war decks; wrote ${outputPath}\n`,
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
  countFourDeckCombinations,
  createWarDeckResult,
  findValidWarDecks,
  parseArguments,
};
