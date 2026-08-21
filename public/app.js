"use strict";

const PAGE_SIZE = 8;
const DECK_SLOT_SIZE = 8;

const elements = {
  cardPickerGrid: document.querySelector("#card-picker-grid"),
  dataButton: document.querySelector("#data-button"),
  dataCloseButton: document.querySelector("#data-close-button"),
  dataImportMessage: document.querySelector("#data-import-message"),
  dataModal: document.querySelector("#data-modal"),
  deckSlotGrid: document.querySelector("#deck-slot-grid"),
  filterModal: document.querySelector("#filter-modal"),
  filterCloseButton: document.querySelector("#filter-close-button"),
  filterDoneButton: document.querySelector("#filter-done-button"),
  pagination: document.querySelector("#pagination"),
  plannerExcludeButton: document.querySelector("#planner-exclude-button"),
  plannerClearAllButton: document.querySelector("#planner-clear-all-button"),
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
  pickerModeTabsGroup: document.querySelector(".picker-mode-tabs"),
  pickerScopeNote: document.querySelector("#picker-scope-note"),
  rangeTabs: [...document.querySelectorAll(".range-tab")],
  rangeTabIndicator: document.querySelector(".range-tab-indicator"),
  findDecksButton: document.querySelector("#find-decks-button"),
  resultsList: document.querySelector("#results-list"),
  resultsSummary: document.querySelector("#results-summary"),
  bookmarkletLink: document.querySelector("#bookmarklet-link"),
  sourceSearchButton: document.querySelector("#source-search-button"),
};

const state = {
  activeDeckFilter: 0,
  cardLookup: new Map(),
  cards: [],
  controller: null,
  data: null,
  deckImports: Array(4).fill(null),
  days: 7,
  deckFilters: Array.from({ length: 4 }, () => ({ include: [], exclude: [] })),
  globalExclude: [],
  loading: false,
  pickerMode: "include",
  // "deck": Exclude toggles apply only to the active deck. "global": Exclude
  // toggles apply to all four decks. Include is always deck-scoped.
  pickerScope: "deck",
  page: 0,
  pendingSearchTabs: new Map(),
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

function canonicalSearchId(search) {
  const params = new URLSearchParams({ time: `${search.days}d` });
  search.include.forEach((card) => params.append("inc", card));
  search.exclude.forEach((card) => params.append("exc", card));
  return params.toString();
}

function buildPopularDecksUrl(search) {
  const url = new URL("https://royaleapi.com/decks/popular");
  const params = new URLSearchParams({
    time: `${search.days}d`,
    sort: "rating",
    size: "30",
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
  });
  search.include.forEach((card) => params.append("inc", card));
  search.exclude.forEach((card) => params.append("exc", card));
  url.search = params.toString();
  return url.toString();
}

function searchForDeck(deckIndex) {
  const filter = state.deckFilters[deckIndex];
  const search = {
    days: state.days,
    include: [...new Set(filter.include)].sort(),
    exclude: [...new Set([...state.globalExclude, ...filter.exclude])].sort(),
  };
  search.id = canonicalSearchId(search);
  search.sourceUrl = buildPopularDecksUrl(search);
  return search;
}

function uniqueDeckSearches() {
  const searches = new Map();
  state.deckFilters.forEach((_, index) => {
    const search = searchForDeck(index);
    if (!searches.has(search.id)) {
      searches.set(search.id, { ...search, deckSlots: [] });
    }
    searches.get(search.id).deckSlots.push(index + 1);
  });
  return [...searches.values()];
}

// This function is serialized into the Safari bookmarklet, so it must remain
// self-contained: it cannot refer to any variables or helpers from this file.
function collectRoyaleApiDecks(targetOrigin) {
  try {
    const finderWindow = window.opener;
    if (!finderWindow || finderWindow.closed) {
      throw new Error("Return to the Finder and open this search from there first.");
    }

    const pageUrl = new URL(window.location.href);
    const hostname = pageUrl.hostname.replace(/^www\./u, "");
    if (hostname !== "royaleapi.com" || pageUrl.pathname !== "/decks/popular") {
      throw new Error("Open a RoyaleAPI popular-decks page before using this bookmarklet.");
    }

    const timeRange = pageUrl.searchParams.get("time");
    if (!["1d", "3d", "7d"].includes(timeRange)) {
      throw new Error("Open a search page from War Deck Finder first.");
    }

    const deckContainer = document.querySelector("#decksContainer");
    if (!deckContainer) {
      throw new Error("The deck list is not ready. Finish verification and wait for RoyaleAPI to load.");
    }

    const decks = [...deckContainer.querySelectorAll(".deck_segment")]
      .map((segment, index) => {
        const statsAnchor = segment.querySelector('a[href^="/decks/stats/"]');
        const statsText = segment.textContent ?? "";
        const ratingMatch = statsText.match(
          /Rating\s*Usage\s*Wins?\s*Draws?\s*Losses?\s*(\d+(?:\.\d+)?)/iu,
        );
        const winsMatch = statsText.match(/([\d.]+)%\s*[\d.]+%\s*[\d.]+%/u);
        return {
          rank: index + 1,
          name: segment.querySelector("h4")?.textContent?.trim() || `Deck ${index + 1}`,
          statsUrl: statsAnchor?.href ?? null,
          rating: ratingMatch ? Number.parseFloat(ratingMatch[1]) : null,
          winRate: winsMatch ? Number.parseFloat(winsMatch[1]) : null,
        };
      })
      .filter((deck) => deck.statsUrl);

    if (decks.some((deck) => deck.rating === null)) {
      throw new Error("A deck Rating is not ready. Wait for RoyaleAPI to finish loading, then try again.");
    }

    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", receiveResult);
      window.alert("War Deck Finder: The original Finder tab did not acknowledge this data.");
    }, 8000);

    function receiveResult(event) {
      if (
        event.origin !== targetOrigin ||
        event.source !== finderWindow ||
        event.data?.type !== "war-deck-finder:import-result" ||
        event.data?.requestId !== requestId
      ) {
        return;
      }
      window.clearTimeout(timeout);
      window.removeEventListener("message", receiveResult);
      if (!event.data.ok) {
        window.alert(`War Deck Finder: ${event.data.message || "The import was rejected."}`);
        return;
      }
      window.close();
    }

    window.addEventListener("message", receiveResult);
    pageUrl.hash = "";
    finderWindow.postMessage(
      {
        type: "war-deck-finder:import",
        requestId,
        payload: {
          timeRange,
          sourceUrl: pageUrl.toString(),
          decks,
        },
      },
      targetOrigin,
    );
  } catch (error) {
    window.alert(`War Deck Finder: ${error.message}`);
  }
}

function createBookmarklet() {
  return `javascript:(${collectRoyaleApiDecks.toString()})(${JSON.stringify(window.location.origin)})`;
}

function formatImportedAt(value) {
  if (!value) return "Not imported";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Imported";
  return `Updated ${new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)}`;
}

function formatImportedTime(value) {
  if (!value) return "Ready";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Ready";
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
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

function openDataModal() {
  elements.dataModal.classList.remove("hidden");
  document.body.classList.add("modal-open");
  elements.dataImportMessage.textContent = "";
  elements.dataCloseButton.focus();
}

function closeDataModal() {
  elements.dataModal.classList.add("hidden");
  if (elements.filterModal.classList.contains("hidden")) {
    document.body.classList.remove("modal-open");
  }
}

function prunePendingSearchTabs() {
  let changed = false;
  state.pendingSearchTabs.forEach((pending, tab) => {
    if (tab.closed) {
      state.pendingSearchTabs.delete(tab);
      changed = true;
    }
  });
  if (changed) renderDeckSlots();
}

function openSearchTab(search, deckIndexes) {
  prunePendingSearchTabs();
  const tab = window.open(search.sourceUrl, "_blank");
  if (!tab) return false;
  state.pendingSearchTabs.set(tab, { search, deckIndexes: [...deckIndexes] });
  renderDeckSlots();
  return true;
}

function openDeckSearch(deckIndex) {
  if (!openSearchTab(searchForDeck(deckIndex), [deckIndex])) {
    window.alert(`Safari blocked the Deck ${deckIndex + 1} search. Allow pop-ups, then try again.`);
  }
}

function openCurrentSearches() {
  const searches = uniqueDeckSearches();
  const opened = searches.filter((search) =>
    openSearchTab(search, search.deckSlots.map((deckNumber) => deckNumber - 1)),
  ).length;
  if (opened < searches.length) {
    window.alert(
      `Safari opened ${opened} of ${searches.length} searches. Allow pop-ups and retry the missing decks individually.`,
    );
  }
}

function isDeckSearchPending(deckIndex) {
  return [...state.pendingSearchTabs.values()].some((pending) =>
    pending.deckIndexes.includes(deckIndex),
  );
}

function clearDeckImports(deckIndexes) {
  const affected = new Set(deckIndexes);
  affected.forEach((deckIndex) => {
    state.deckImports[deckIndex] = null;
  });
  state.pendingSearchTabs.forEach((pending, tab) => {
    pending.deckIndexes = pending.deckIndexes.filter((deckIndex) => !affected.has(deckIndex));
    if (pending.deckIndexes.length === 0) state.pendingSearchTabs.delete(tab);
  });
}

function validateReturnedImport(payload, expectedSearch) {
  if (!payload || typeof payload !== "object") {
    throw new Error("RoyaleAPI returned invalid data.");
  }
  let sourceUrl;
  try {
    sourceUrl = new URL(payload.sourceUrl);
  } catch {
    throw new Error("The returned data has no valid RoyaleAPI search URL.");
  }
  if (
    sourceUrl.protocol !== "https:" ||
    !["royaleapi.com", "www.royaleapi.com"].includes(sourceUrl.hostname) ||
    sourceUrl.pathname !== "/decks/popular"
  ) {
    throw new Error("The returned data did not come from a RoyaleAPI search.");
  }
  const timeRange = sourceUrl.searchParams.get("time");
  const days = Number.parseInt(String(timeRange).replace(/d$/u, ""), 10);
  const returnedSearch = {
    days,
    include: [...new Set(sourceUrl.searchParams.getAll("inc"))].sort(),
    exclude: [...new Set(sourceUrl.searchParams.getAll("exc"))].sort(),
  };
  returnedSearch.id = canonicalSearchId(returnedSearch);
  if (payload.timeRange !== `${days}d` || returnedSearch.id !== expectedSearch.id) {
    throw new Error("The returned data no longer matches this deck's filters.");
  }
  if (!Array.isArray(payload.decks) || payload.decks.length > 30) {
    throw new Error("RoyaleAPI returned an invalid candidate list.");
  }
  return {
    payload: {
      timeRange: payload.timeRange,
      sourceUrl: sourceUrl.toString(),
      decks: payload.decks,
    },
    importedAt: new Date().toISOString(),
  };
}

function sendImportResult(event, requestId, ok, message = "") {
  event.source?.postMessage(
    { type: "war-deck-finder:import-result", requestId, ok, message },
    event.origin,
  );
}

function receiveRoyaleApiImport(event) {
  if (
    !["https://royaleapi.com", "https://www.royaleapi.com"].includes(event.origin) ||
    event.data?.type !== "war-deck-finder:import"
  ) {
    return;
  }
  const pending = state.pendingSearchTabs.get(event.source);
  if (!pending) {
    sendImportResult(event, event.data.requestId, false, "The Finder settings changed. Reopen this search.");
    return;
  }
  try {
    const imported = validateReturnedImport(event.data.payload, pending.search);
    pending.deckIndexes.forEach((deckIndex) => {
      state.deckImports[deckIndex] = imported;
    });
    state.pendingSearchTabs.delete(event.source);
    renderDeckSlots();
    markResultsStale();
    sendImportResult(event, event.data.requestId, true);
  } catch (error) {
    sendImportResult(event, event.data.requestId, false, error.message);
  }
}

function setActiveDeckFilter(index) {
  state.activeDeckFilter = index;
  renderDeckFilterPanel();
}

function openFilterModal(index) {
  setActiveDeckFilter(index);
  state.pickerScope = "deck";
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
  // The global-exclude flow only ever excludes -- there's nothing to
  // include, so the Include tab would just be a dead end.
  elements.pickerModeTabsGroup.classList.toggle("hidden", state.pickerScope === "global");
  updateFilterDeckName();
  updatePickerScopeNote();
  updatePickerSelectionState();
  renderExcludeStrip();
}

// "Deck 1-4" when excluding globally -- state.activeDeckFilter is whichever
// deck happened to be selected last, which has nothing to do with a global
// action and would otherwise mislabel it as deck-specific.
function updateFilterDeckName() {
  elements.filterDeckName.textContent =
    state.pickerScope === "global" ? "Deck 1-4" : `Deck ${state.activeDeckFilter + 1}`;
}

// Spells out, in plain words, exactly what clicking a card will do right now
// -- beginners otherwise have no way to tell "Exclude" apart from "Exclude
// from every deck" since they share the same tab.
function updatePickerScopeNote() {
  const isGlobal = state.pickerScope === "global";
  elements.pickerScopeNote.classList.toggle("global", state.pickerMode === "exclude" && isGlobal);
  const showGlobalNote = state.pickerMode === "exclude" && isGlobal;
  elements.pickerScopeNote.textContent = showGlobalNote ? "Excluding cards from all decks." : "";
  elements.pickerScopeNote.classList.toggle("hidden", !showGlobalNote);
}

function changeDeckFilter(deckIndex, mode, cardKey, action) {
  const filter = state.deckFilters[deckIndex];

  if (mode === "exclude-global") {
    // Applies to all four decks.
    if (action === "add") {
      if (!state.globalExclude.includes(cardKey)) {
        state.globalExclude = [...state.globalExclude, cardKey];
      }
      state.deckFilters.forEach((deckFilter) => {
        deckFilter.include = deckFilter.include.filter((key) => key !== cardKey);
        deckFilter.exclude = deckFilter.exclude.filter((key) => key !== cardKey);
      });
    } else {
      state.globalExclude = state.globalExclude.filter((key) => key !== cardKey);
    }
  } else if (mode === "exclude-local") {
    // Applies only to this one deck.
    if (action === "add") {
      if (!filter.exclude.includes(cardKey)) {
        filter.exclude = [...filter.exclude, cardKey];
      }
      filter.include = filter.include.filter((key) => key !== cardKey);
    } else {
      filter.exclude = filter.exclude.filter((key) => key !== cardKey);
    }
  } else {
    if (action === "add") {
      if (filter.include.length >= DECK_SLOT_SIZE) {
        return;
      }

      if (!filter.include.includes(cardKey)) {
        filter.include = [...filter.include, cardKey];
      }
      filter.exclude = filter.exclude.filter((key) => key !== cardKey);
    } else {
      filter.include = filter.include.filter((key) => key !== cardKey);
    }
  }

  clearDeckImports(
    mode === "exclude-global"
      ? state.deckFilters.map((_, index) => index)
      : [deckIndex],
  );
  renderDeckFilterPanel();
  markResultsStale();
}

function togglePickerCard(cardKey) {
  if (state.pickerMode === "include") {
    const selected = activeDeckFilter().include.includes(cardKey);
    changeDeckFilter(state.activeDeckFilter, "include", cardKey, selected ? "remove" : "add");
    return;
  }

  const isGlobal = state.pickerScope === "global";
  const selected = isGlobal
    ? state.globalExclude.includes(cardKey)
    : activeDeckFilter().exclude.includes(cardKey);
  changeDeckFilter(
    state.activeDeckFilter,
    isGlobal ? "exclude-global" : "exclude-local",
    cardKey,
    selected ? "remove" : "add",
  );
}

function clearDeckFilter(deckIndex) {
  state.deckFilters[deckIndex] = { include: [], exclude: [] };
  clearDeckImports([deckIndex]);
  renderDeckFilterPanel();
  markResultsStale();
}

function clearAllFilters() {
  state.deckFilters = Array.from({ length: 4 }, () => ({ include: [], exclude: [] }));
  state.globalExclude = [];
  clearDeckImports(state.deckFilters.map((_, index) => index));
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
  button.setAttribute("aria-label", `Edit filters for Deck ${deckIndex + 1}`);
  button.classList.toggle("active", isActive);
  button.setAttribute("aria-pressed", String(isActive));
  button.addEventListener("click", () => openFilterModal(deckIndex));
  button.addEventListener("keydown", (event) => {
    if (event.target !== button) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openFilterModal(deckIndex);
    }
  });

  const header = makeElement("div", "deck-slot-header");
  const deckNumber = deckIndex + 1;
  const imported = state.deckImports[deckIndex];
  const pending = isDeckSearchPending(deckIndex);
  const dataStatus = makeElement(
    "span",
    `deck-data-status ${pending ? "pending" : imported ? "ready" : "missing"}`,
    pending
      ? "Waiting for RoyaleAPI…"
      : imported
        ? `${imported.payload.decks.length} candidates · ${formatImportedTime(imported.importedAt)}`
        : "No candidate data",
  );
  if (imported) {
    dataStatus.title = `${imported.payload.decks.length} candidates · ${formatImportedAt(imported.importedAt)}`;
  }
  const dataButton = makeElement(
    "button",
    "deck-data-button",
    pending ? "Waiting…" : imported ? "Update data" : "Import data",
  );
  dataButton.type = "button";
  dataButton.disabled = pending;
  dataButton.setAttribute(
    "aria-label",
    `${imported ? "Update" : "Import"} candidate data for Deck ${deckNumber}`,
  );
  dataButton.addEventListener("click", (event) => {
    event.stopPropagation();
    openDeckSearch(deckIndex);
  });
  const clearButton = makeElement("button", "clear-deck-button", "Clear deck");
  clearButton.type = "button";
  clearButton.disabled = filter.include.length === 0 && filter.exclude.length === 0;
  clearButton.setAttribute("aria-label", `Clear filters for Deck ${deckNumber}`);
  clearButton.addEventListener("click", (event) => {
    event.stopPropagation();
    clearDeckFilter(deckIndex);
  });
  const dataControls = makeElement("div", "deck-data-controls");
  dataControls.append(dataStatus, dataButton, clearButton);
  header.append(makeElement("span", "deck-slot-title", `Deck ${deckNumber} filters`), dataControls);

  const slotCards = makeElement("div", "deck-slot-cards");
  filter.include.forEach((cardKey) => {
    slotCards.append(createSelectedCardTile(deckIndex, "include", cardKey));
  });

  for (let index = filter.include.length; index < DECK_SLOT_SIZE; index += 1) {
    slotCards.append(createEmptySlot());
  }

  button.append(header, slotCards);

  if (filter.exclude.length > 0) {
    const excludeRow = makeElement("div", "deck-slot-exclude-row");
    filter.exclude.forEach((cardKey) => {
      excludeRow.append(createSelectedCardTile(deckIndex, "exclude-local", cardKey));
    });
    button.append(excludeRow);
  }

  return button;
}

function renderDeckSlots() {
  elements.deckSlotGrid.replaceChildren(
    ...state.deckFilters.map((_, index) => createDeckSlot(index)),
  );
}

function renderExcludeStrip() {
  // The strip inside the modal mirrors whatever scope is currently active:
  // this deck's own exclusions, or the global list when excluding globally.
  const isGlobal = state.pickerScope === "global";
  const modalExcluded = isGlobal ? state.globalExclude : activeDeckFilter().exclude;
  const modalMode = isGlobal ? "exclude-global" : "exclude-local";
  elements.excludeStrip.dataset.scope = isGlobal ? "global" : "deck";
  elements.excludeStrip.replaceChildren(
    ...modalExcluded.map((cardKey) => createSelectedCardTile(state.activeDeckFilter, modalMode, cardKey)),
  );
  elements.excludeStrip.classList.toggle("hidden", modalExcluded.length === 0);

  // The main page always summarises the global list only -- per-deck
  // exclusions show inside each deck's own slot instead.
  elements.plannerExcludeStrip.replaceChildren(
    ...state.globalExclude.map((cardKey) =>
      createSelectedCardTile(state.activeDeckFilter, "exclude-global", cardKey),
    ),
  );
  elements.plannerExcludeStrip.classList.toggle("hidden", state.globalExclude.length === 0);
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

// Evolutions ("musketeer-ev1") and hero skins ("musketeer-hero") are the
// same physical card as their base form -- a deck (or the globally-excluded
// list) can't hold two variants of the same card any more than it could
// hold two copies of the plain one.
function includesSameBaseCard(cardKeys, cardKey) {
  const base = baseCardKey(cardKey);
  return cardKeys.some((key) => baseCardKey(key) === base);
}

function updatePickerCardState(button) {
  const cardKey = button.dataset.cardKey;
  const filter = activeDeckFilter();
  const isGlobalScope = state.pickerScope === "global";
  const isIncluded = filter.include.includes(cardKey);
  const isExcluded = isGlobalScope ? state.globalExclude.includes(cardKey) : filter.exclude.includes(cardKey);
  const isGloballyExcluded = state.globalExclude.includes(cardKey);
  const isIncludedInThisDeck = state.pickerMode === "include" && !isIncluded && includesSameBaseCard(filter.include, cardKey);
  const isIncludedInAnotherDeck =
    state.pickerMode === "include" &&
    !isIncluded &&
    state.deckFilters.some(
      (deckFilter, index) => index !== state.activeDeckFilter && includesSameBaseCard(deckFilter.include, cardKey),
    );
  // A globally-excluded card (in any form) can't also be included or locally
  // excluded -- lock it everywhere except the global-exclude view itself,
  // where toggling it off needs to stay possible. Including a card (or one
  // of its other forms) already used anywhere else is blocked too: war
  // decks need 32 unique cards across all four.
  const isLocked = !isGlobalScope && (isGloballyExcluded || isIncludedInThisDeck || isIncludedInAnotherDeck);
  const stateBadge = button.querySelector(".picker-card-state");

  button.classList.toggle("included", isIncluded);
  button.classList.toggle("excluded", isExcluded);
  button.classList.toggle("locked", isLocked);
  button.disabled = isLocked;
  const lockReason = isGloballyExcluded
    ? "excluded from all decks"
    : isIncludedInThisDeck
      ? "already in this deck"
      : "already used in another deck";
  button.setAttribute(
    "aria-label",
    isLocked ? `${cardNameForKey(cardKey)} ${lockReason}` : `${state.pickerMode} ${cardNameForKey(cardKey)}`,
  );
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
  updateFilterDeckName();
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
  elements.findDecksButton.setAttribute("aria-disabled", String(loading));
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
  // "loon" also catches "LumberLoon" -- "balloon" alone misses that abbreviation
  if (label.includes("lava") || label.includes("balloon") || label.includes("loon")) return "air";
  if (label.includes("pekka") || label.includes("mega knight") || label.includes("bridge spam")) {
    return "bridge";
  }
  if (label.includes("giant") || label.includes("electro")) return "beatdown";
  if (
    label.includes("graveyard") ||
    label.includes("gy freeze") || // "GY" abbreviates "graveyard" -- doesn't match the check above
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
    const winRate = makeElement("span", "deck-stat winrate", `Win Rate: ${deck.winRate.toFixed(1)}%`);
    winRate.classList.toggle("negative", deck.winRate < 50);
    stats.append(winRate);
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
    elements.emptyTitle.textContent = "No valid war decks";
    elements.emptyMessage.textContent =
      "These four candidate pools have no combinations with 32 unique cards.";
  }

  renderPagination(isEmpty ? 0 : totalPages);
}

function render() {
  renderResults();
}

function currentDeckFilters() {
  return state.deckFilters.map((filter) => ({
    include: [...filter.include],
    exclude: [...new Set([...state.globalExclude, ...filter.exclude])],
  }));
}

async function loadWarDecks() {
  state.controller?.abort();
  const controller = new AbortController();
  state.controller = controller;
  document.body.classList.remove("results-stale");
  setLoading(true);

  try {
    const missingDecks = state.deckImports
      .map((imported, index) => (imported ? null : index + 1))
      .filter(Boolean);
    if (missingDecks.length > 0) {
      throw new Error(
        `Import candidate data for ${missingDecks.length === 1 ? "Deck" : "Decks"} ${missingDecks.join(" & ")} first.`,
      );
    }
    const response = await fetch("/api/war-decks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        days: state.days,
        deckFilters: currentDeckFilters(),
        imports: state.deckImports.map((imported) => imported.payload),
      }),
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
  elements.bookmarkletLink.href = createBookmarklet();

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

function confirmRangeClick(tab) {
  elements.rangeTabs.forEach((candidate) => candidate.classList.remove("is-confirming"));
  elements.rangeTabIndicator.classList.remove("is-confirming");

  // Restart the confirmation animations even when the active option is
  // clicked again. Reading the indicator width flushes the removed classes.
  void elements.rangeTabIndicator.offsetWidth;
  tab.classList.add("is-confirming");
  elements.rangeTabIndicator.classList.add("is-confirming");
}

elements.rangeTabs.forEach((tab) => {
  tab.addEventListener("mouseenter", () => moveRangeIndicator(tab, { bubble: true }));

  tab.addEventListener("click", () => {
    const days = Number.parseInt(tab.dataset.days, 10);
    moveRangeIndicator(tab, { bubble: true });
    confirmRangeClick(tab);
    if (days === state.days || state.loading) return;
    state.days = days;
    clearDeckImports(state.deckFilters.map((_, index) => index));
    renderDeckSlots();
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
let lastFindDecksClickAt = 0;

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

elements.findDecksButton.addEventListener("click", () => {
  const now = Date.now();
  if (now - lastFindDecksClickAt < DOUBLE_CLICK_WINDOW_MS) {
    lastFindDecksClickAt = 0;
    elements.funPopup.classList.remove("hidden");
    elements.funPopupVideo.currentTime = 0;
    elements.funPopupVideo.muted = false;
    elements.funPopupVideo.play().then(() => requestAnimationFrame(renderChromaFrame)).catch(() => {});
  } else {
    lastFindDecksClickAt = now;
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
    // Include is always this-deck-only. Exclude keeps whatever scope is
    // already active (global if opened via the toolbar's Exclude button,
    // this-deck-only otherwise) -- clicking the tab itself never changes it.
    if (tab.dataset.mode === "include") {
      state.pickerScope = "deck";
    }
    setPickerMode(tab.dataset.mode);
  });
});

elements.filterCloseButton.addEventListener("click", closeFilterModal);

elements.dataButton.addEventListener("click", () => openDataModal());
elements.sourceSearchButton.addEventListener("click", openCurrentSearches);
elements.dataCloseButton.addEventListener("click", closeDataModal);

elements.dataModal.addEventListener("click", (event) => {
  if (event.target === elements.dataModal) closeDataModal();
});

elements.bookmarkletLink.addEventListener("click", (event) => {
  event.preventDefault();
  elements.dataImportMessage.textContent = "Drag the button into Safari's Favorites Bar.";
});

elements.filterModal.addEventListener("click", (event) => {
  if (event.target === elements.filterModal) {
    closeFilterModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !elements.filterModal.classList.contains("hidden")) {
    closeFilterModal();
  }
  if (event.key === "Escape" && !elements.dataModal.classList.contains("hidden")) {
    closeDataModal();
  }
});

elements.filterDoneButton.addEventListener("click", closeFilterModal);

elements.plannerExcludeButton.addEventListener("click", () => {
  openFilterModal(state.activeDeckFilter);
  state.pickerScope = "global";
  setPickerMode("exclude");
});

elements.plannerClearAllButton.addEventListener("click", clearAllFilters);

window.addEventListener("message", receiveRoyaleApiImport);
window.addEventListener("focus", prunePendingSearchTabs);

initialize();
