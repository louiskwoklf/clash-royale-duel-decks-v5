"use strict";

const PAGE_SIZE = 8;
const DECK_SLOT_SIZE = 8;

const elements = {
  cardPickerGrid: document.querySelector("#card-picker-grid"),
  clearDeckButton: document.querySelector("#clear-deck-button"),
  deckSlotGrid: document.querySelector("#deck-slot-grid"),
  filterModal: document.querySelector("#filter-modal"),
  filterCloseButton: document.querySelector("#filter-close-button"),
  filterDoneButton: document.querySelector("#filter-done-button"),
  pagination: document.querySelector("#pagination"),
  plannerIncludeButton: document.querySelector("#planner-include-button"),
  plannerExcludeButton: document.querySelector("#planner-exclude-button"),
  plannerExcludeStrip: document.querySelector("#planner-exclude-strip"),
  emptyMessage: document.querySelector("#empty-message"),
  emptyState: document.querySelector("#empty-state"),
  emptyTitle: document.querySelector("#empty-title"),
  excludeStrip: document.querySelector("#exclude-card-strip"),
  filterDeckName: document.querySelector("#filter-deck-name"),
  funPopup: document.querySelector("#fun-popup"),
  funPopupVideo: document.querySelector("#fun-popup-video"),
  funPopupCanvas: document.querySelector("#fun-popup-canvas"),
  pickerModeTabs: [...document.querySelectorAll(".picker-mode-tab")],
  rangeTabs: [...document.querySelectorAll(".range-tab")],
  rangeTabIndicator: document.querySelector(".range-tab-indicator"),
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
  deckFilters: Array.from({ length: 4 }, () => ({ include: [] })),
  globalExclude: [],
  loading: false,
  pickerMode: "include",
  page: 0,
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
  state.page = 0;
  elements.resultsList.replaceChildren();
  elements.emptyState.classList.add("hidden");
  elements.pagination.classList.add("hidden");
  elements.pagination.replaceChildren();
  elements.resultsSummary.textContent = "";
  document.body.classList.remove("results-stale");
  setLoading(false);
}

// Filters changed after a search: keep the results visible but flag them as
// outdated instead of wiping the list.
function markResultsStale() {
  state.controller?.abort();
  state.controller = null;
  if (state.loading) setLoading(false);

  if (!state.data) {
    resetSearchResults();
    return;
  }

  document.body.classList.add("results-stale");
  render();
}

function setActiveDeckFilter(index) {
  state.activeDeckFilter = index;
  renderDeckFilterPanel();
}

function openFilterModal(index) {
  setActiveDeckFilter(index);
  setPickerMode("include");
  elements.filterModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  elements.filterCloseButton.focus();
}

function closeFilterModal() {
  elements.filterModal.classList.add("hidden");
  document.body.classList.remove("modal-open");
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
  if (mode === "exclude") {
    // Exclusions are global: they apply to all four decks.
    if (action === "add") {
      if (!state.globalExclude.includes(cardKey)) {
        state.globalExclude = [...state.globalExclude, cardKey];
      }
      state.deckFilters.forEach((filter) => {
        filter.include = filter.include.filter((key) => key !== cardKey);
      });
    } else {
      state.globalExclude = state.globalExclude.filter((key) => key !== cardKey);
    }
  } else {
    const filter = state.deckFilters[deckIndex];

    if (action === "add") {
      if (filter.include.length >= DECK_SLOT_SIZE) {
        return;
      }

      if (!filter.include.includes(cardKey)) {
        filter.include = [...filter.include, cardKey];
      }
      state.globalExclude = state.globalExclude.filter((key) => key !== cardKey);
    } else {
      filter.include = filter.include.filter((key) => key !== cardKey);
    }
  }

  renderDeckFilterPanel();
  markResultsStale();
}

function togglePickerCard(cardKey) {
  const selected =
    state.pickerMode === "exclude"
      ? state.globalExclude.includes(cardKey)
      : activeDeckFilter().include.includes(cardKey);
  changeDeckFilter(state.activeDeckFilter, state.pickerMode, cardKey, selected ? "remove" : "add");
}

function clearActiveDeckFilter() {
  state.deckFilters[state.activeDeckFilter] = { include: [] };
  renderDeckFilterPanel();
  markResultsStale();
}

function createCardImage(key, className = "card-art") {
  const image = makeElement("img", className);
  image.src = cardImagePath(key);
  image.alt = cardNameForKey(key);
  image.loading = "lazy";
  // Intrinsic size: reserves correct space before the image decodes
  image.width = 150;
  image.height = 180;
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
  button.addEventListener("click", () => openFilterModal(deckIndex));
  button.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openFilterModal(deckIndex);
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
  const excluded = state.globalExclude;
  const makeTiles = () =>
    excluded.map((cardKey) => createSelectedCardTile(state.activeDeckFilter, "exclude", cardKey));
  elements.excludeStrip.replaceChildren(...makeTiles());
  elements.excludeStrip.classList.toggle("hidden", excluded.length === 0);
  elements.plannerExcludeStrip.replaceChildren(...makeTiles());
  elements.plannerExcludeStrip.classList.toggle("hidden", excluded.length === 0);
}

function createPickerCard(card) {
  const button = makeElement("button", "picker-card");
  button.type = "button";
  button.dataset.cardKey = card.key;
  button.title = card.name;
  const art = createCardImage(card.key, "picker-card-art");
  // Eager: lazy decode inside the scrollable picker grid paints cards partially
  art.loading = "eager";
  button.append(art, makeElement("span", "picker-card-state hidden"));

  button.addEventListener("click", () => togglePickerCard(card.key));
  return button;
}

function updatePickerCardState(button) {
  const cardKey = button.dataset.cardKey;
  const filter = activeDeckFilter();
  const isIncluded = filter.include.includes(cardKey);
  const isExcluded = state.globalExclude.includes(cardKey);
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
  elements.clearDeckButton.hidden = activeDeckFilter().include.length === 0;
  renderDeckSlots();
  renderExcludeStrip();
  updatePickerSelectionState();
}

function setLoading(loading) {
  state.loading = loading;
  document.body.classList.toggle("is-loading", loading);
  // Not a native `disabled`: a disabled button stops receiving ALL mouse
  // events (even mousedown), which would swallow the second click of the
  // double-click easter egg. loadWarDecks() already de-dupes via AbortController.
  elements.refreshButton.setAttribute("aria-disabled", String(loading));
  elements.rangeTabs.forEach((tab) => {
    tab.disabled = loading;
  });

  if (loading) {
    elements.resultsList.replaceChildren(createLoadingSkeleton(), createLoadingSkeleton());
    elements.emptyState.classList.add("hidden");
    elements.pagination.classList.add("hidden");
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

function baseCardKey(cardKey) {
  return cardKey.replace(/-(?:ev\d+|hero)$/u, "");
}

// Map a deck to its well-known archetype name (Log Bait, Hog 2.6, Pekka
// Bridge Spam, ...). Checked in order: bait/siege first, then the cards that
// define an archetype outright, then generic fallbacks.
function deckArchetype(baseKeys) {
  const keys = new Set(baseKeys);
  const has = (...cards) => cards.every((card) => keys.has(card));
  const any = (...cards) => cards.some((card) => keys.has(card));

  if (has("goblin-barrel")) {
    if (has("mortar")) return "Mortar Bait";
    if (any("princess", "goblin-gang", "dart-goblin")) return "Log Bait";
    return "Barrel Bait";
  }
  if (has("mortar")) return has("miner") ? "Mortar Miner" : "Mortar Cycle";
  if (has("x-bow")) return "X-Bow";
  if (has("hog-rider")) {
    if (has("earthquake")) return "Hog EQ";
    if (has("executioner", "tornado")) return "Hog Exenado";
    if (has("cannon") && any("musketeer", "ice-golem")) return "Hog 2.6";
    return "Hog Cycle";
  }
  if (has("pekka")) {
    return any("battle-ram", "bandit", "royal-ghost", "ram-rider")
      ? "Pekka Bridge Spam"
      : "Pekka Control";
  }
  if (has("golem")) return "Golem Beatdown";
  if (has("lava-hound")) return has("balloon") ? "LavaLoon" : "Lava Hound";
  if (has("electro-giant")) return "Electro Giant";
  if (has("goblin-giant")) return has("sparky") ? "GobGiant Sparky" : "Goblin Giant";
  if (has("royal-giant")) return "Royal Giant";
  if (has("giant")) return any("prince", "dark-prince") ? "Giant Double Prince" : "Giant Beatdown";
  if (has("elixir-golem")) return has("battle-healer") ? "EGolem Healer" : "Elixir Golem";
  if (has("graveyard")) return has("freeze") ? "GY Freeze" : "Graveyard";
  if (has("three-musketeers")) return "3M";
  if (has("royal-hogs")) return has("royal-recruits") ? "RR Hogs" : "Royal Hogs";
  if (has("ram-rider")) return "Ram Rider";
  if (has("battle-ram")) return "Bridge Spam";
  if (has("balloon")) return has("lumberjack") ? "LumberLoon" : "Balloon Cycle";
  if (has("miner")) {
    if (has("poison")) return "Miner Poison";
    if (has("wall-breakers")) return "Miner WB";
    return "Miner Control";
  }
  if (has("goblin-drill")) return has("wall-breakers") ? "WB Drill" : "Goblin Drill";
  if (has("wall-breakers")) return "Wall Breakers";
  if (has("skeleton-barrel")) return "SkellyBarrel Bait";
  if (has("sparky")) return "Sparky";
  if (has("mega-knight")) {
    return any("battle-ram", "bandit", "ram-rider") ? "MK Bridge Spam" : "Mega Knight";
  }
  if (has("giant-skeleton")) return "Giant Skelly";
  if (has("goblin-machine")) return "Goblin Machine";
  if (has("rocket")) return "Rocket Cycle";
  return "Cycle";
}

// A deck's label is its well-known archetype name.
function deckIdentity(deck) {
  const cardKeys = deck?.cards?.length === 8 ? deck.cards : deck?.baseCards ?? [];
  const baseKeys = cardKeys.map(baseCardKey);
  return deckArchetype(baseKeys);
}

// Groups archetypes into families so bundles are color-scannable at a
// glance, the way players already think of decks ("bait", "beatdown"...).
const FAMILY_COLORS = {
  bait: "#b45309",
  hog: "#0070d1",
  golem: "#7c3aed",
  air: "#0284c7",
  bridge: "#be123c",
  beatdown: "#4338ca",
  control: "#a21caf",
  cycle: "#0f766e",
};

function archetypeFamily(name) {
  const label = name.toLowerCase();
  if (label.includes("bait")) return "bait";
  if (label.includes("hog")) return "hog";
  if (label.includes("golem") || label.includes("sparky") || label.includes("goblin giant")) {
    return "golem";
  }
  if (label.includes("lava") || label.includes("balloon")) return "air";
  if (label.includes("pekka") || label.includes("mega knight") || label.includes("bridge spam")) {
    return "bridge";
  }
  if (label.includes("giant") || label.includes("electro")) return "beatdown";
  if (
    label.includes("graveyard") ||
    label.includes("miner") ||
    label.includes("drill") ||
    label.includes("wall breakers") ||
    label.includes("skelly")
  ) {
    return "control";
  }
  return "cycle";
}

function deckFamilyColor(deck) {
  return FAMILY_COLORS[archetypeFamily(deckIdentity(deck))];
}

function bundleWinConditions(warDeck) {
  return warDeck.candidateIndexes
    .map((candidateIndex) => deckIdentity(candidateForIndex(candidateIndex)))
    .join(" · ");
}

function cardDisplayGroup(cardKey) {
  const card = state.cardLookup.get(cardKey);
  if (card?.kind === "evolution" || /-ev\d+$/u.test(cardKey)) return "evolution";
  if (card?.kind === "hero" || card?.rarity === "Champion" || /-hero$/u.test(cardKey)) {
    return "hero";
  }
  return "normal";
}

// Display order inside a deck: evolution first, hero/champion second, any
// remaining evolutions or heroes next, then the regular cards.
// Names come from the card catalog: the scraped cardNames array is not
// aligned with the cards array, so pairing by index mislabels cards.
function orderDeckCards(cardKeys) {
  const entries = cardKeys.map((key) => ({
    key,
    name: cardNameForKey(key),
  }));
  const evolutions = entries.filter((entry) => cardDisplayGroup(entry.key) === "evolution");
  const heroes = entries.filter((entry) => cardDisplayGroup(entry.key) === "hero");
  const normal = entries.filter((entry) => cardDisplayGroup(entry.key) === "normal");

  const ordered = [];
  if (evolutions.length > 0) ordered.push(evolutions.shift());
  if (heroes.length > 0) ordered.push(heroes.shift());
  ordered.push(...evolutions, ...heroes, ...normal);
  return ordered;
}

function createDeckPanel(deck, rank) {
  const panel = makeElement("section", "deck-panel");
  panel.style.setProperty("--family-color", deckFamilyColor(deck));
  const header = makeElement("div", "deck-panel-header");
  header.append(
    makeElement("span", "rank-badge", `#${rank}`),
    makeElement("h3", "", deck?.name ?? "Unknown deck"),
  );
  panel.append(header);

  const cards = makeElement("div", "result-card-grid");
  const cardKeys = deck?.cards?.length === 8 ? deck.cards : deck?.baseCards ?? [];

  orderDeckCards(cardKeys).forEach((entry) => {
    const figure = makeElement("figure", "result-card-tile");
    figure.title = entry.name;
    figure.append(createCardImage(entry.key, "result-card-art"));
    cards.append(figure);
  });
  panel.append(cards);

  const stats = makeElement("div", "deck-stats-row");
  const elixirCosts = cardKeys.map((key) => state.cardLookup.get(key)?.elixir);
  if (elixirCosts.length === 8 && elixirCosts.every((cost) => typeof cost === "number")) {
    const average = elixirCosts.reduce((sum, cost) => sum + cost, 0) / elixirCosts.length;
    stats.append(makeElement("span", "deck-stat", `Avg Elixir: ${average.toFixed(1)}`));
  }
  if (typeof deck?.winRate === "number") {
    stats.append(makeElement("span", "deck-stat winrate", `Win Rate: ${deck.winRate.toFixed(1)}%`));
  }
  if (stats.children.length > 0) {
    panel.append(stats);
  }

  return panel;
}

function createWarDeckCard(warDeck, index, isFirstOnPage) {
  const details = makeElement("details", "war-card");
  if (isFirstOnPage) details.open = true;

  const summary = makeElement("summary", "war-card-summary");
  const identity = makeElement("div", "bundle-identity");
  identity.append(
    makeElement("span", "bundle-number", String(index + 1).padStart(2, "0")),
    makeElement("span", "bundle-wincons", bundleWinConditions(warDeck)),
  );

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

function createPageButton(label, page, { active = false, disabled = false, ariaLabel } = {}) {
  const button = makeElement("button", "page-button", label);
  button.type = "button";
  if (ariaLabel) button.setAttribute("aria-label", ariaLabel);
  button.classList.toggle("active", active);
  button.disabled = disabled;
  button.addEventListener("click", () => {
    state.page = page;
    renderResults();
    elements.resultsList.scrollIntoView({ block: "start" });
  });
  return button;
}

// Page numbers with gaps, e.g. 1 … 4 [5] 6 … 12
function pageNumbersToShow(totalPages, current) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, page) => page);
  }

  const wanted = [...new Set([0, current - 1, current, current + 1, totalPages - 1])]
    .filter((page) => page >= 0 && page < totalPages)
    .sort((a, b) => a - b);

  const withGaps = [];
  wanted.forEach((page, index) => {
    if (index > 0 && page - wanted[index - 1] > 1) withGaps.push("gap");
    withGaps.push(page);
  });
  return withGaps;
}

function renderPagination(totalPages) {
  if (totalPages <= 1) {
    elements.pagination.classList.add("hidden");
    elements.pagination.replaceChildren();
    return;
  }

  const items = [
    createPageButton("‹", state.page - 1, {
      disabled: state.page === 0,
      ariaLabel: "Previous page",
    }),
  ];

  pageNumbersToShow(totalPages, state.page).forEach((entry) => {
    if (entry === "gap") {
      items.push(makeElement("span", "page-gap", "…"));
    } else {
      items.push(
        createPageButton(String(entry + 1), entry, {
          active: entry === state.page,
          ariaLabel: `Page ${entry + 1}`,
        }),
      );
    }
  });

  items.push(
    createPageButton("›", state.page + 1, {
      disabled: state.page === totalPages - 1,
      ariaLabel: "Next page",
    }),
  );

  elements.pagination.classList.remove("hidden");
  elements.pagination.replaceChildren(...items);
}

function renderResults() {
  if (!state.data) return;
  const results = state.data.warDecks;
  const totalPages = Math.ceil(results.length / PAGE_SIZE);
  state.page = Math.min(Math.max(state.page, 0), Math.max(totalPages - 1, 0));
  const start = state.page * PAGE_SIZE;
  const visible = results.slice(start, start + PAGE_SIZE);

  elements.resultsList.replaceChildren(
    ...visible.map((warDeck, index) => createWarDeckCard(warDeck, start + index, index === 0)),
  );

  elements.resultsSummary.textContent = `${formatNumber(results.length)} bundles found`;

  const isEmpty = results.length === 0;
  elements.emptyState.classList.toggle("hidden", !isEmpty);
  if (isEmpty) {
    elements.emptyTitle.textContent = "No valid duel decks";
    elements.emptyMessage.textContent = "This meta window has no four-deck combinations with 32 unique cards.";
  }

  renderPagination(isEmpty ? 0 : totalPages);
}

function render() {
  renderResults();
}

function appendDeckFilters(query) {
  state.deckFilters.forEach((filter, index) => {
    const deckNumber = index + 1;
    filter.include.forEach((cardKey) => query.append(`d${deckNumber}inc`, cardKey));
    state.globalExclude.forEach((cardKey) => query.append(`d${deckNumber}exc`, cardKey));
  });
}

async function loadWarDecks({ refresh = false } = {}) {
  state.controller?.abort();
  const controller = new AbortController();
  state.controller = controller;
  document.body.classList.remove("results-stale");
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
    state.page = 0;
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
  if (!state.loading && !state.data) {
    resetSearchResults();
  }
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

// The bubble indicator slides + grows to whichever tab is hovered, and
// settles back on the active tab once the pointer leaves the group.
function moveRangeIndicator(tab, { bubble = false } = {}) {
  if (!tab) return;
  const expand = bubble ? 4 : 0;
  elements.rangeTabIndicator.style.width = `${tab.offsetWidth + expand * 2}px`;
  elements.rangeTabIndicator.style.height = `${tab.offsetHeight + expand * 2}px`;
  elements.rangeTabIndicator.style.transform =
    `translate(${tab.offsetLeft - expand}px, ${tab.offsetTop - expand}px)`;
}

function activeRangeTab() {
  return elements.rangeTabs.find((tab) => tab.classList.contains("active"));
}

elements.rangeTabs.forEach((tab) => {
  tab.addEventListener("mouseenter", () => moveRangeIndicator(tab, { bubble: true }));

  tab.addEventListener("click", () => {
    const days = Number.parseInt(tab.dataset.days, 10);
    moveRangeIndicator(tab, { bubble: true });
    if (days === state.days || state.loading) return;
    state.days = days;
    elements.rangeTabs.forEach((candidate) => {
      const active = candidate === tab;
      candidate.classList.toggle("active", active);
      candidate.setAttribute("aria-pressed", String(active));
    });
    markResultsStale();
  });
});

elements.rangeTabIndicator.parentElement.addEventListener("mouseleave", () => {
  moveRangeIndicator(activeRangeTab());
});

moveRangeIndicator(activeRangeTab());

// Easter egg: double-clicking the CTA pops out a little autoplaying clip.
// Tracked manually (rather than relying on the native "dblclick" event)
// since OS/trackpad double-click timing varies and can miss the native event.
const DOUBLE_CLICK_WINDOW_MS = 450;
let lastRefreshClickAt = 0;

const funPopupCtx = elements.funPopupCanvas.getContext("2d", { willReadFrequently: true });
elements.funPopupCanvas.width = 480;
elements.funPopupCanvas.height = Math.round((480 * elements.funPopupVideo.videoHeight) / elements.funPopupVideo.videoWidth) || 427;

// Removes the clip's flat blue backdrop frame-by-frame: blue pixels have a
// much higher blue channel than red/green, everything in the character
// (skin, gold, white, outlines) does not. Ramped between LOW/HIGH for a
// soft antialiased edge instead of a jagged cutout.
const CHROMA_LOW = 12;
const CHROMA_HIGH = 28;

function renderChromaFrame() {
  const video = elements.funPopupVideo;
  if (video.paused || video.ended) return;

  funPopupCtx.drawImage(video, 0, 0, elements.funPopupCanvas.width, elements.funPopupCanvas.height);
  const frame = funPopupCtx.getImageData(0, 0, elements.funPopupCanvas.width, elements.funPopupCanvas.height);
  const data = frame.data;

  for (let i = 0; i < data.length; i += 4) {
    const blueness = Math.min(data[i + 2] - data[i], data[i + 2] - data[i + 1]);
    if (blueness >= CHROMA_HIGH) {
      data[i + 3] = 0;
    } else if (blueness > CHROMA_LOW) {
      data[i + 3] = Math.round(255 * (1 - (blueness - CHROMA_LOW) / (CHROMA_HIGH - CHROMA_LOW)));
    }
  }

  funPopupCtx.putImageData(frame, 0, 0);
  requestAnimationFrame(renderChromaFrame);
}

elements.refreshButton.addEventListener("click", () => {
  const now = Date.now();
  if (now - lastRefreshClickAt < DOUBLE_CLICK_WINDOW_MS) {
    lastRefreshClickAt = 0;
    elements.funPopup.classList.remove("hidden");
    elements.funPopupVideo.currentTime = 0;
    elements.funPopupVideo.muted = false;
    elements.funPopupVideo.play().then(() => requestAnimationFrame(renderChromaFrame)).catch(() => {});
  } else {
    lastRefreshClickAt = now;
  }
  loadWarDecks();
});

elements.funPopupVideo.addEventListener("ended", () => {
  elements.funPopup.classList.add("hidden");
});

elements.funPopup.addEventListener("click", () => {
  elements.funPopupVideo.pause();
  elements.funPopup.classList.add("hidden");
});

elements.pickerModeTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    setPickerMode(tab.dataset.mode);
  });
});

elements.clearDeckButton.addEventListener("click", clearActiveDeckFilter);

elements.filterCloseButton.addEventListener("click", closeFilterModal);

elements.filterModal.addEventListener("click", (event) => {
  if (event.target === elements.filterModal) {
    closeFilterModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !elements.filterModal.classList.contains("hidden")) {
    closeFilterModal();
  }
});

elements.filterDoneButton.addEventListener("click", closeFilterModal);

elements.plannerIncludeButton.addEventListener("click", () => {
  openFilterModal(state.activeDeckFilter);
  setPickerMode("include");
});

elements.plannerExcludeButton.addEventListener("click", () => {
  openFilterModal(state.activeDeckFilter);
  setPickerMode("exclude");
});

initialize();
