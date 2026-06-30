"use strict";

const PAGE_SIZE = 8;

const elements = {
  candidateCount: document.querySelector("#candidate-count"),
  combinationCount: document.querySelector("#combination-count"),
  conflictCount: document.querySelector("#conflict-count"),
  emptyMessage: document.querySelector("#empty-message"),
  emptyState: document.querySelector("#empty-state"),
  emptyTitle: document.querySelector("#empty-title"),
  filterInput: document.querySelector("#filter-input"),
  loadMore: document.querySelector("#load-more"),
  rangeTabs: [...document.querySelectorAll(".range-tab")],
  refreshButton: document.querySelector("#refresh-button"),
  resultsList: document.querySelector("#results-list"),
  resultsSummary: document.querySelector("#results-summary"),
  sourceSummary: document.querySelector("#source-summary"),
  statusLine: document.querySelector("#status-line"),
  validCount: document.querySelector("#valid-count"),
};

const state = {
  controller: null,
  data: null,
  days: 1,
  filter: "",
  loading: false,
  visibleCount: PAGE_SIZE,
};

function makeElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(value);
}

function humanizeSlug(slug) {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function setLoading(loading) {
  state.loading = loading;
  document.body.classList.toggle("is-loading", loading);
  elements.refreshButton.disabled = loading;
  elements.rangeTabs.forEach((tab) => {
    tab.disabled = loading;
  });

  if (loading) {
    elements.statusLine.textContent = "Scanning popular decks and testing every combination…";
    elements.resultsList.replaceChildren(createLoadingSkeleton(), createLoadingSkeleton());
    elements.emptyState.classList.add("hidden");
    elements.loadMore.classList.add("hidden");
  }
}

function createLoadingSkeleton() {
  const skeleton = makeElement("div", "war-card skeleton-card");
  skeleton.append(
    makeElement("div", "skeleton-line skeleton-short"),
    makeElement("div", "skeleton-line skeleton-long"),
    makeElement("div", "skeleton-grid"),
  );
  return skeleton;
}

function candidateForIndex(index) {
  return state.data?.candidateDecks[index] ?? null;
}

function searchableText(warDeck) {
  const candidates = warDeck.candidateIndexes.map(candidateForIndex).filter(Boolean);
  return candidates
    .flatMap((deck) => [deck.name, ...(deck.cardNames ?? []), ...(deck.baseCards ?? [])])
    .join(" ")
    .toLowerCase();
}

function filteredWarDecks() {
  if (!state.data) return [];
  const query = state.filter.trim().toLowerCase();
  if (!query) return state.data.warDecks;
  return state.data.warDecks.filter((warDeck) => searchableText(warDeck).includes(query));
}

function createDeckPanel(deck, rank) {
  const panel = makeElement("section", "deck-panel");
  const header = makeElement("div", "deck-panel-header");
  header.append(
    makeElement("span", "rank-badge", `#${rank}`),
    makeElement("h3", "", deck?.name ?? "Unknown deck"),
  );
  panel.append(header);

  const cards = makeElement("div", "card-chip-grid");
  const cardNames =
    deck?.cardNames?.length === 8
      ? deck.cardNames
      : (deck?.baseCards ?? []).map(humanizeSlug);

  cardNames.forEach((name, index) => {
    const chip = makeElement("span", "card-chip");
    chip.append(makeElement("b", "", String(index + 1)), document.createTextNode(name));
    cards.append(chip);
  });
  panel.append(cards);

  if (deck?.statsUrl) {
    const link = makeElement("a", "deck-link", "Deck stats ↗");
    link.href = deck.statsUrl;
    link.target = "_blank";
    link.rel = "noreferrer";
    panel.append(link);
  }

  return panel;
}

function createWarDeckCard(warDeck, index) {
  const details = makeElement("details", "war-card");
  if (index === 0 && !state.filter) details.open = true;

  const summary = makeElement("summary", "war-card-summary");
  const identity = makeElement("div", "bundle-identity");
  identity.append(
    makeElement("span", "bundle-number", String(index + 1).padStart(2, "0")),
    makeElement("span", "bundle-title", `Ranks ${warDeck.deckRanks.join(" · ")}`),
  );
  const names = makeElement("span", "bundle-names", warDeck.deckNames.join(" + "));
  identity.append(names);

  const summaryRight = makeElement("div", "summary-right");
  const uniqueBadge = makeElement("span", "unique-badge", "32 / 32 unique");
  const chevron = makeElement("span", "chevron", "⌄");
  chevron.setAttribute("aria-hidden", "true");
  summaryRight.append(uniqueBadge, chevron);
  summary.append(identity, summaryRight);
  details.append(summary);

  const body = makeElement("div", "war-card-body");
  const deckGrid = makeElement("div", "deck-grid");
  warDeck.candidateIndexes.forEach((candidateIndex, deckIndex) => {
    deckGrid.append(createDeckPanel(candidateForIndex(candidateIndex), warDeck.deckRanks[deckIndex]));
  });
  body.append(deckGrid);
  details.append(body);
  return details;
}

function renderStats() {
  const data = state.data;
  elements.candidateCount.textContent = formatNumber(data.candidateDeckCount);
  elements.combinationCount.textContent = formatNumber(data.examinedCombinations);
  elements.validCount.textContent = formatNumber(data.validWarDeckCount);
  elements.conflictCount.textContent = formatNumber(
    data.examinedCombinations - data.validWarDeckCount,
  );
}

function renderResults() {
  if (!state.data) return;
  const results = filteredWarDecks();
  const visible = results.slice(0, state.visibleCount);
  elements.resultsList.replaceChildren(
    ...visible.map((warDeck, index) => createWarDeckCard(warDeck, index)),
  );

  elements.resultsSummary.textContent = state.filter
    ? `${formatNumber(results.length)} matching bundles`
    : `${formatNumber(state.data.validWarDeckCount)} bundles found in the ${state.days}-day meta`;

  const method = state.data.retrievalMethod === "jina-reader" ? "Reader relay" : "Browser fallback";
  const cacheText = state.data.request?.cache?.hit ? "cached result" : "fresh result";
  elements.sourceSummary.textContent = `${method} · ${cacheText}`;

  const isEmpty = results.length === 0;
  elements.emptyState.classList.toggle("hidden", !isEmpty);
  if (isEmpty) {
    elements.emptyTitle.textContent = state.filter ? "No matching bundles" : "No valid war decks";
    elements.emptyMessage.textContent = state.filter
      ? "Try a different deck name, card, or clear the filter."
      : "This meta window has no four-deck bundles with 32 unique cards.";
  }

  elements.loadMore.classList.toggle("hidden", visible.length >= results.length || isEmpty);
  if (visible.length < results.length) {
    elements.loadMore.textContent = `Show ${Math.min(PAGE_SIZE, results.length - visible.length)} more bundles`;
  }
}

function render() {
  renderStats();
  renderResults();
}

async function loadWarDecks({ refresh = false } = {}) {
  state.controller?.abort();
  const controller = new AbortController();
  state.controller = controller;
  setLoading(true);

  try {
    const query = new URLSearchParams({ time: String(state.days) });
    if (refresh) query.set("refresh", "true");
    const response = await fetch(`/api/war-decks?${query}`, {
      signal: controller.signal,
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message ?? "The search could not be completed.");
    }

    state.data = data;
    state.visibleCount = PAGE_SIZE;
    render();
    const time = new Date(data.request.servedAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    elements.statusLine.textContent = `Ready · updated at ${time}`;
  } catch (error) {
    if (error.name === "AbortError") return;
    state.data = null;
    elements.resultsList.replaceChildren();
    elements.emptyState.classList.remove("hidden");
    elements.emptyTitle.textContent = "The arena could not load";
    elements.emptyMessage.textContent = error.message;
    elements.resultsSummary.textContent = "Search unavailable";
    elements.sourceSummary.textContent = "";
    elements.statusLine.textContent = "Could not refresh the meta. Try again.";
  } finally {
    if (state.controller === controller) {
      setLoading(false);
    }
  }
}

elements.rangeTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const days = Number.parseInt(tab.dataset.days, 10);
    if (days === state.days || state.loading) return;
    state.days = days;
    state.filter = "";
    elements.filterInput.value = "";
    elements.rangeTabs.forEach((candidate) => {
      const active = candidate === tab;
      candidate.classList.toggle("active", active);
      candidate.setAttribute("aria-pressed", String(active));
    });
    loadWarDecks();
  });
});

elements.refreshButton.addEventListener("click", () => loadWarDecks({ refresh: true }));

elements.filterInput.addEventListener("input", () => {
  state.filter = elements.filterInput.value;
  state.visibleCount = PAGE_SIZE;
  renderResults();
});

elements.loadMore.addEventListener("click", () => {
  state.visibleCount += PAGE_SIZE;
  renderResults();
});

loadWarDecks();
