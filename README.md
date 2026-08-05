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

## Development

Build the Cloudflare Workers-compatible Sites artifact:

```sh
npm run build
```

Run the complete test suite:

```sh
npm test
```
