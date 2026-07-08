# Clash Royale Duel Decks

Local web app and command-line tools for turning current popular Clash Royale decks
into valid four-deck war bundles with no shared cards.

## Setup

Requirements: Node.js 20+, Google Chrome, and npm.

```sh
npm install
```

## Extract decks

```sh
npm run extract -- --time 1 --output data/decks-1d.json
npm run extract -- --time 3 --output data/decks-3d.json
npm run extract -- --time 7 --output data/decks-7d.json
```

By default, the extractor asks the read-only Jina Reader proxy to render RoyaleAPI and
parses the resulting deck-stat links. This avoids RoyaleAPI's Cloudflare 403 response
to plain HTTP clients and headless Chrome. If the proxy is unavailable, `auto` falls
back to a normal Chrome window. You can select a route explicitly with
`--method proxy` or `--method browser`.

This proxy sees only the public RoyaleAPI URL; no local or private data is sent. Each
deck stats URL contains eight canonical RoyaleAPI card slugs, so the extractor reads
those URLs instead of depending on card image markup.

Output includes both the exact RoyaleAPI card variants (`cards`) and normalized base
cards (`baseCards`). For example, `royal-hogs-ev1` becomes `royal-hogs`; this will let
the war-deck search correctly treat normal, evolved, and hero forms as the same card.

## Run the web app

```sh
npm start
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). The server binds only to the local
machine. The dashboard can switch among the 1-, 3-, and 7-day meta windows, manually
refresh data, add per-deck include/exclude card filters, filter valid bundles by deck
or card name, and inspect all four decks in each result.

Results are cached in memory for five minutes. A manual refresh bypasses cached data,
while simultaneous requests for the same meta window share one extraction job.

Run tests with:

```sh
npm test
```

## Find valid war decks

Fetch the current candidates and exhaust every four-deck combination in one command:

```sh
npm run find-war-decks -- --time 1 --output data/war-decks-1d.json
```

Or search a previously extracted result without making another network request:

```sh
npm run find-war-decks -- \
  --input data/decks-1d.json \
  --output data/war-decks-1d.json
```

A combination is included only when the union of its four `baseCards` arrays contains
exactly 32 unique cards. The output keeps the candidate deck list and identifies each
valid war deck by candidate indexes, RoyaleAPI ranks, and deck names.
