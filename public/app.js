"use strict";

const PAGE_SIZE = 8;
const DECK_SLOT_SIZE = 8;

const elements = {
  cardPickerGrid: document.querySelector("#card-picker-grid"),
  clearDeckButton: document.querySelector("#clear-deck-button"),
  deckSlotGrid: document.querySelector("#deck-slot-grid"),
  emptyMessage: document.querySelector("#empty-message"),
  emptyState: document.querySelector("#empty-state"),
  emptyTitle: document.querySelector("#empty-title"),
  excludeStrip: document.querySelector("#exclude-card-strip"),
  filterDeckName: document.querySelector("#filter-deck-name"),
  loadMore: document.querySelector("#load-more"),
  pickerModeTabs: [...document.querySelectorAll(".picker-mode-tab")],
  rangeTabs: [...document.querySelectorAll(".range-tab")],
  refreshButton: document.querySelector("#refresh-button"),
  resultsList: document.querySelector("#results-list"),
  resultsSummary: document.querySelector("#results-summary"),
};

const state = {
  activeDeckFilter: 0,
  cardLookup: new Map(),
  cards: [],
  controller: null,
  data: null,
  days: 1,
  deckFilters: Array.from({ length: 4 }, () => ({ include: [], exclude: [] })),
  loading: false,
  pickerMode: "include",
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

function cardNameForKey(key) {
  return state.cardLookup.get(key)?.name ?? humanizeSlug(key);
}

function cardImagePath(key) {
  return `/cards/${key}.png`;
}

function activeDeckFilter() {
  return state.deckFilters[state.activeDeckFilter];
}

function resetSearchResults() {
  state.controller?.abort();
  state.controller = null;
  state.data = null;
  state.visibleCount = PAGE_SIZE;
  elements.resultsList.replaceChildren();
  elements.emptyState.classList.add("hidden");
  elements.loadMore.classList.add("hidden");
  elements.resultsSummary.textContent = "";
  setLoading(false);
}

function setActiveDeckFilter(index) {
  state.activeDeckFilter = index;
  renderDeckFilterPanel();
}

function setPickerMode(mode) {
  state.pickerMode = mode;
  elements.pickerModeTabs.forEach((tab) => {
    const active = tab.dataset.mode === mode;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-pressed", String(active));
  });
  updatePickerSelectionState();
}

function changeDeckFilter(deckIndex, mode, cardKey, action) {
  const filter = state.deckFilters[deckIndex];
  const oppositeMode = mode === "include" ? "exclude" : "include";

  if (action === "add") {
    if (mode === "include" && filter.include.length >= DECK_SLOT_SIZE) {
      return;
    }

    if (!filter[mode].includes(cardKey)) {
      filter[mode] = [...filter[mode], cardKey];
    }
    filter[oppositeMode] = filter[oppositeMode].filter((key) => key !== cardKey);
  } else {
    filter[mode] = filter[mode].filter((key) => key !== cardKey);
  }

  renderDeckFilterPanel();
  resetSearchResults();
}

function togglePickerCard(cardKey) {
  const filter = activeDeckFilter();
  const selected = filter[state.pickerMode].includes(cardKey);
  changeDeckFilter(state.activeDeckFilter, state.pickerMode, cardKey, selected ? "remove" : "add");
}

function clearActiveDeckFilter() {
  state.deckFilters[state.activeDeckFilter] = { include: [], exclude: [] };
  renderDeckFilterPanel();
  resetSearchResults();
}

function createCardImage(key, className = "card-art") {
  const image = makeElement("img", className);
  image.src = cardImagePath(key);
  image.alt = cardNameForKey(key);
  image.loading = "lazy";
  return image;
}

function createEmptySlot() {
  return makeElement("span", "empty-card-slot");
}

function createSelectedCardTile(deckIndex, mode, cardKey) {
  const button = makeElement("button", `selected-card-tile ${mode}`);
  button.type = "button";
  button.setAttribute("aria-label", `Remove ${cardNameForKey(cardKey)}`);
  button.append(createCardImage(cardKey), makeElement("span", "", "×"));
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    changeDeckFilter(deckIndex, mode, cardKey, "remove");
  });
  return button;
}

function createDeckSlot(deckIndex) {
  const filter = state.deckFilters[deckIndex];
  const button = makeElement("section", "deck-slot");
  const isActive = deckIndex === state.activeDeckFilter;
  button.tabIndex = 0;
  button.setAttribute("role", "button");
  button.classList.toggle("active", isActive);
  button.setAttribute("aria-pressed", String(isActive));
  button.addEventListener("click", () => setActiveDeckFilter(deckIndex));
  button.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setActiveDeckFilter(deckIndex);
    }
  });

  const header = makeElement("div", "deck-slot-header");
  header.append(makeElement("span", "", `Deck ${deckIndex + 1}`));

  const slotCards = makeElement("div", "deck-slot-cards");
  filter.include.forEach((cardKey) => {
    slotCards.append(createSelectedCardTile(deckIndex, "include", cardKey));
  });

  for (let index = filter.include.length; index < DECK_SLOT_SIZE; index += 1) {
    slotCards.append(createEmptySlot());
  }

  button.append(header, slotCards);
  return button;
}

function renderDeckSlots() {
  elements.deckSlotGrid.replaceChildren(
    ...state.deckFilters.map((_, index) => createDeckSlot(index)),
  );
}

function renderExcludeStrip() {
  const excluded = activeDeckFilter().exclude;
  elements.excludeStrip.replaceChildren(
    ...excluded.map((cardKey) => createSelectedCardTile(state.activeDeckFilter, "exclude", cardKey)),
  );
  elements.excludeStrip.classList.toggle("hidden", excluded.length === 0);
}

function createPickerCard(card) {
  const button = makeElement("button", "picker-card");
  button.type = "button";
  button.dataset.cardKey = card.key;
  button.title = card.name;
  button.append(
    createCardImage(card.key, "picker-card-art"),
    makeElement("span", "picker-card-state hidden"),
  );

  button.addEventListener("click", () => togglePickerCard(card.key));
  return button;
}

function updatePickerCardState(button) {
  const cardKey = button.dataset.cardKey;
  const filter = activeDeckFilter();
  const isIncluded = filter.include.includes(cardKey);
  const isExcluded = filter.exclude.includes(cardKey);
  const stateBadge = button.querySelector(".picker-card-state");

  button.classList.toggle("included", isIncluded);
  button.classList.toggle("excluded", isExcluded);
  button.setAttribute("aria-label", `${state.pickerMode} ${cardNameForKey(cardKey)}`);
  button.setAttribute("aria-pressed", String(state.pickerMode === "include" ? isIncluded : isExcluded));

  if (stateBadge) {
    stateBadge.textContent = isIncluded ? "+" : "−";
    stateBadge.classList.toggle("hidden", !isIncluded && !isExcluded);
  }
}

function updatePickerSelectionState() {
  elements.cardPickerGrid.querySelectorAll(".picker-card").forEach(updatePickerCardState);
}

function renderCardPicker() {
  if (elements.cardPickerGrid.children.length !== state.cards.length) {
    elements.cardPickerGrid.replaceChildren(...state.cards.map(createPickerCard));
  }

  updatePickerSelectionState();
}

function renderDeckFilterPanel() {
  elements.filterDeckName.textContent = `Deck ${state.activeDeckFilter + 1}`;
  elements.clearDeckButton.hidden =
    activeDeckFilter().include.length === 0 && activeDeckFilter().exclude.length === 0;
  renderDeckSlots();
  renderExcludeStrip();
  updatePickerSelectionState();
}

function setLoading(loading) {
  state.loading = loading;
  document.body.classList.toggle("is-loading", loading);
  elements.refreshButton.disabled = loading;
  elements.rangeTabs.forEach((tab) => {
    tab.disabled = loading;
  });

  if (loading) {
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

function createDeckPanel(deck, rank) {
  const panel = makeElement("section", "deck-panel");
  const header = makeElement("div", "deck-panel-header");
  header.append(
    makeElement("span", "rank-badge", `#${rank}`),
    makeElement("h3", "", deck?.name ?? "Unknown deck"),
  );
  panel.append(header);

  const cards = makeElement("div", "result-card-grid");
  const cardKeys = deck?.cards?.length === 8 ? deck.cards : deck?.baseCards ?? [];
  const cardNames = deck?.cardNames?.length === cardKeys.length
    ? deck.cardNames
    : cardKeys.map((key) => cardNameForKey(key));

  cardKeys.forEach((cardKey, index) => {
    const figure = makeElement("figure", "result-card-tile");
    figure.append(
      createCardImage(cardKey, "result-card-art"),
      makeElement("figcaption", "", cardNames[index] ?? humanizeSlug(cardKey)),
    );
    cards.append(figure);
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
  if (index === 0) details.open = true;

  const summary = makeElement("summary", "war-card-summary");
  const identity = makeElement("div", "bundle-identity");
  identity.append(
    makeElement("span", "bundle-number", String(index + 1).padStart(2, "0")),
    makeElement("span", "bundle-title", `Ranks ${warDeck.deckRanks.join(" · ")}`),
  );
  const names = makeElement("span", "bundle-names", warDeck.deckNames.join(" + "));
  identity.append(names);

  const summaryRight = makeElement("div", "summary-right");
  const chevron = makeElement("span", "chevron", "⌄");
  chevron.setAttribute("aria-hidden", "true");
  summaryRight.append(chevron);
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

function renderResults() {
  if (!state.data) return;
  const results = state.data.warDecks;
  const visible = results.slice(0, state.visibleCount);
  elements.resultsList.replaceChildren(
    ...visible.map((warDeck, index) => createWarDeckCard(warDeck, index)),
  );

  elements.resultsSummary.textContent = `${formatNumber(results.length)} bundles found`;

  const isEmpty = results.length === 0;
  elements.emptyState.classList.toggle("hidden", !isEmpty);
  if (isEmpty) {
    elements.emptyTitle.textContent = "No valid war decks";
    elements.emptyMessage.textContent = "This meta window has no four-deck bundles with 32 unique cards.";
  }

  elements.loadMore.classList.toggle("hidden", visible.length >= results.length || isEmpty);
  if (visible.length < results.length) {
    elements.loadMore.textContent = `Show ${Math.min(PAGE_SIZE, results.length - visible.length)} more bundles`;
  }
}

function render() {
  renderResults();
}

function appendDeckFilters(query) {
  state.deckFilters.forEach((filter, index) => {
    const deckNumber = index + 1;
    filter.include.forEach((cardKey) => query.append(`d${deckNumber}inc`, cardKey));
    filter.exclude.forEach((cardKey) => query.append(`d${deckNumber}exc`, cardKey));
  });
}

async function loadWarDecks({ refresh = false } = {}) {
  state.controller?.abort();
  const controller = new AbortController();
  state.controller = controller;
  setLoading(true);

  try {
    const query = new URLSearchParams({ time: String(state.days) });
    if (refresh) query.set("refresh", "true");
    appendDeckFilters(query);
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
  } catch (error) {
    if (error.name === "AbortError") return;
    state.data = null;
    elements.resultsList.replaceChildren();
    elements.emptyState.classList.remove("hidden");
    elements.emptyTitle.textContent = "Search failed";
    elements.emptyMessage.textContent = error.message;
    elements.resultsSummary.textContent = "Search unavailable";
  } finally {
    if (state.controller === controller) {
      setLoading(false);
    }
  }
}

async function loadCards() {
  const response = await fetch("/api/cards");
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message ?? "Card list unavailable.");
  }

  state.cards = data.cards;
  state.cardLookup = new Map(state.cards.map((card) => [card.key, card]));
  renderDeckFilterPanel();
  renderCardPicker();
  resetSearchResults();
}

async function initialize() {
  try {
    await loadCards();
  } catch (error) {
    elements.emptyState.classList.remove("hidden");
    elements.emptyTitle.textContent = "Cards unavailable";
    elements.emptyMessage.textContent = error.message;
    elements.resultsSummary.textContent = "Search unavailable";
  }
}

elements.rangeTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const days = Number.parseInt(tab.dataset.days, 10);
    if (days === state.days || state.loading) return;
    state.days = days;
    elements.rangeTabs.forEach((candidate) => {
      const active = candidate === tab;
      candidate.classList.toggle("active", active);
      candidate.setAttribute("aria-pressed", String(active));
    });
    resetSearchResults();
  });
});

elements.refreshButton.addEventListener("click", () => loadWarDecks());

elements.pickerModeTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    setPickerMode(tab.dataset.mode);
  });
});

elements.clearDeckButton.addEventListener("click", clearActiveDeckFilter);

elements.loadMore.addEventListener("click", () => {
  state.visibleCount += PAGE_SIZE;
  renderResults();
});

initialize();
