# Clash Royale War Deck Finder

Hosted tool for building four Clash Royale decks with 32 unique cards from exact
RoyaleAPI searches.

## Safari workflow

1. Open **Safari setup**, remove any older Finder bookmarklet, and drag
   **Send search to Finder** into Safari's Favorites Bar.
2. Choose the meta window and configure the include/exclude cards for all four deck slots.
3. Click **Open RoyaleAPI searches**. The Finder opens one page for every unique search,
   so identical deck filters share a single page.
4. Wait for each RoyaleAPI result page to load, then click the saved favorite in every tab.
5. Return to the original Finder tab and click **Find decks**.

Each import is validated and stored against its exact meta window, include cards, and
exclude cards. The Finder then evaluates the Cartesian product of the four candidate
pools and keeps only bundles whose 32 normalized cards are all unique.

## Monthly card update

1. On RoyaleAPI, open the card selector in **Filter + Sort**.
2. In Safari or Chrome's developer tools, find `<div id="cardSelectorContent">`,
   right-click it, and choose **Copy → Copy outerHTML**.
3. In this project folder, run:

```sh
npm run sync-cards
```

That one command reads the copied HTML from the Mac clipboard, keeps RoyaleAPI's card
order, skips Tower Troops, adds or updates card information, downloads missing images,
and runs the test suite. If Clash Royale added a completely new base card, the command
will ask once for its elixir cost. To use a saved HTML file instead, run
`npm run sync-cards -- path/to/card-selector.html`.

## Development

Build the Cloudflare Workers-compatible Sites artifact:

```sh
npm run build
```

Run the complete test suite:

```sh
npm test
```
