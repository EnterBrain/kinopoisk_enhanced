const APP_ID = "kinopoisk-enhanced";
const FEATURE_BUTTON_ID = `${APP_ID}-watch`;
const FEATURE_BUTTON_WRAPPER_ID = `${APP_ID}-watch-wrapper`;
const CORE_HOSTS_STORAGE_KEY = `${APP_ID}:core-hosts`;
const DEFAULT_CORE_HOSTS = ["fbsite.top", "kinopoisk.net"];
const KINOPOISK_HOSTS = new Set(["kinopoisk.ru", "www.kinopoisk.ru"]);
const FILM_PAGE_PATTERN = /^\/(?:film|series)\/\d+\/?/;
const SELECTORS = {
  actionButtonsContainer: '[class*="styles_buttonsContainer__"]',
  onlineButton: "#sd8tv9online_button_desktop",
  pageTitle: "h1",
  watchlistButton: 'button[title="Буду смотреть"]',
};

let lastHandledUrl = "";
let observer;
let menuCommandIds = [];

function isKinopoiskPage() {
  return KINOPOISK_HOSTS.has(window.location.hostname);
}

function isSupportedKinopoiskCard() {
  return isKinopoiskPage() && FILM_PAGE_PATTERN.test(window.location.pathname);
}

function normalizeHost(hostname) {
  return hostname.trim().toLowerCase().replace(/^www\./, "");
}

function getCoreHosts() {
  const storedHosts = GM_getValue(CORE_HOSTS_STORAGE_KEY, DEFAULT_CORE_HOSTS);
  const hosts = Array.isArray(storedHosts) ? storedHosts : DEFAULT_CORE_HOSTS;

  return [...new Set(hosts.map(normalizeHost).filter(Boolean))].sort();
}

function saveCoreHosts(hosts) {
  GM_setValue(CORE_HOSTS_STORAGE_KEY, [...new Set(hosts.map(normalizeHost).filter(Boolean))].sort());
  refreshMenuCommands();
}

function isCoreHost() {
  return getCoreHosts().includes(normalizeHost(window.location.hostname));
}

function getMirrorUrl() {
  const url = new URL(window.location.href);
  url.hostname = url.hostname.replace(/kinopoisk\.ru$/i, "kinopoisk.net");

  return url.href;
}

function createButton() {
  const button = document.createElement("button");
  button.id = FEATURE_BUTTON_ID;
  button.className = `${APP_ID}__open-button`;
  button.type = "button";
  button.textContent = "Смотреть";
  button.addEventListener("click", openMirrorPage);

  return button;
}

function createNativeLikeButton(referenceButton) {
  const wrapper = document.createElement("div");
  const root = document.createElement("div");
  const button = createButton();

  wrapper.id = FEATURE_BUTTON_WRAPPER_ID;
  syncNativeLikeButtonClasses(wrapper, referenceButton);

  root.append(button);
  wrapper.append(root);

  return wrapper;
}

function syncNativeLikeButtonClasses(wrapper, referenceButton) {
  if (!referenceButton) {
    return;
  }

  const root = wrapper.firstElementChild;
  const button = wrapper.querySelector(`#${FEATURE_BUTTON_ID}`);
  const referenceWrapper = referenceButton.closest('[class*="styles_button__"]');
  const referenceRoot = referenceButton.closest('[class*="style_root__"]');
  const buttonClasses = Array.from(referenceButton.classList).filter(
    (className) =>
      !className.startsWith("style_withIconLeft__") &&
      !className.startsWith("style_onlyIcon__"),
  );

  wrapper.className = referenceWrapper?.className || "";

  if (root) {
    root.className = referenceRoot?.className || "";
  }

  if (button) {
    button.className = [...buttonClasses, `${APP_ID}__open-button`].join(" ");
  }
}

function getDirectChild(container, node) {
  let child = node;

  while (child?.parentElement && child.parentElement !== container) {
    child = child.parentElement;
  }

  return child?.parentElement === container ? child : null;
}

function findActionButtonsTarget() {
  const onlineButton = document.querySelector(SELECTORS.onlineButton);
  const onlineContainer = onlineButton?.closest(SELECTORS.actionButtonsContainer);

  if (onlineButton && onlineContainer) {
    return {
      container: onlineContainer,
      beforeElement: getDirectChild(onlineContainer, onlineButton),
    };
  }

  const watchlistButton = document.querySelector(SELECTORS.watchlistButton);
  const watchlistContainer = watchlistButton?.closest(SELECTORS.actionButtonsContainer);

  if (watchlistButton && watchlistContainer) {
    return {
      container: watchlistContainer,
      beforeElement: getDirectChild(watchlistContainer, watchlistButton),
    };
  }

  const actionButtonsContainer = document.querySelector(SELECTORS.actionButtonsContainer);

  if (actionButtonsContainer) {
    return {
      container: actionButtonsContainer,
      beforeElement: actionButtonsContainer.firstElementChild,
    };
  }

  return null;
}

function findFallbackInsertionPoint() {
  const title = document.querySelector(SELECTORS.pageTitle);

  if (!title) {
    return null;
  }

  return title.parentElement || title;
}

function openMirrorPage() {
  window.location.assign(getMirrorUrl());
}

function injectOpenButton() {
  if (!isSupportedKinopoiskCard()) {
    return;
  }

  const actionButtonsTarget = findActionButtonsTarget();
  const existingWrapper = document.getElementById(FEATURE_BUTTON_WRAPPER_ID);

  if (actionButtonsTarget) {
    const { container, beforeElement } = actionButtonsTarget;
    const referenceButton = container.querySelector(SELECTORS.watchlistButton);
    const wrapper = existingWrapper || createNativeLikeButton(referenceButton);

    syncNativeLikeButtonClasses(wrapper, referenceButton);

    if (wrapper.parentElement !== container || wrapper.nextElementSibling !== beforeElement) {
      container.insertBefore(wrapper, beforeElement);
    }

    return;
  }

  const button = document.getElementById(FEATURE_BUTTON_ID) || createButton();

  if (button.isConnected) {
    return;
  }

  const fallbackInsertionPoint = findFallbackInsertionPoint();

  if (fallbackInsertionPoint) {
    fallbackInsertionPoint.insertAdjacentElement("afterend", button);
    return;
  }

  document.body.prepend(button);
}

function cleanupUnsupportedPage() {
  if (isSupportedKinopoiskCard()) {
    return;
  }

  document.getElementById(FEATURE_BUTTON_WRAPPER_ID)?.remove();
  document.getElementById(FEATURE_BUTTON_ID)?.remove();
}

function handleRouteChange() {
  if (lastHandledUrl === window.location.href) {
    injectOpenButton();
    return;
  }

  lastHandledUrl = window.location.href;
  cleanupUnsupportedPage();
  injectOpenButton();
}

function observeKinopoiskPageChanges() {
  if (!isKinopoiskPage()) {
    return;
  }

  observer?.disconnect();
  observer = new MutationObserver(handleRouteChange);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

function notify(message) {
  if (typeof GM_notification === "function") {
    GM_notification({
      title: "Kinopoisk Enhanced",
      text: message,
      timeout: 2500,
    });
    return;
  }

  console.info(`[Kinopoisk Enhanced] ${message}`);
}

function addCurrentHostToCoreList() {
  const host = normalizeHost(window.location.hostname);
  const hosts = getCoreHosts();

  if (hosts.includes(host)) {
    notify(`${host} уже есть в списке Core`);
    return;
  }

  saveCoreHosts([...hosts, host]);
  notify(`${host} добавлен в список Core`);
}

function removeCurrentHostFromCoreList() {
  const host = normalizeHost(window.location.hostname);
  const hosts = getCoreHosts();
  const nextHosts = hosts.filter((item) => item !== host);

  saveCoreHosts(nextHosts);
  notify(`${host} удален из списка Core`);
}

function showCoreHosts() {
  const hosts = getCoreHosts();
  const message = hosts.length ? hosts.join("\n") : "Список сайтов Core пуст";

  window.alert(`Kinopoisk Enhanced Core sites:\n\n${message}`);
}

function resetCoreHosts() {
  saveCoreHosts(DEFAULT_CORE_HOSTS);
  notify("Список Core сброшен к значениям по умолчанию");
}

function refreshMenuCommands() {
  for (const commandId of menuCommandIds) {
    GM_unregisterMenuCommand?.(commandId);
  }

  menuCommandIds = [
    GM_registerMenuCommand("Kinopoisk Enhanced: добавить текущий сайт в Core", addCurrentHostToCoreList),
    GM_registerMenuCommand("Kinopoisk Enhanced: удалить текущий сайт из Core", removeCurrentHostFromCoreList),
    GM_registerMenuCommand("Kinopoisk Enhanced: показать сайты Core", showCoreHosts),
    GM_registerMenuCommand("Kinopoisk Enhanced: сбросить сайты Core", resetCoreHosts),
  ].filter(Boolean);
}

function runCoreIfAllowed() {
  if (!isCoreHost()) {
    return;
  }

  loadEmbeddedCore({
    appId: APP_ID,
    host: normalizeHost(window.location.hostname),
    source: "loader",
  });
}

function init() {
  document.documentElement.setAttribute(`data-${APP_ID}-loader`, "enabled");
  refreshMenuCommands();
  observeKinopoiskPageChanges();
  handleRouteChange();
  runCoreIfAllowed();
  console.info("[Kinopoisk Enhanced] loader initialized");
}

init();
