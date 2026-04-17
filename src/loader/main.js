const APP_ID = "kinopoisk-enhanced";
const FEATURE_BUTTON_ID = `${APP_ID}-watch`;
const FEATURE_BUTTON_WRAPPER_ID = `${APP_ID}-watch-wrapper`;
const CORE_HOSTS_STORAGE_KEY = `${APP_ID}:core-hosts`;
const CORE_RESOURCE_NAME = "KinopoiskEnhancedCore";
const CORE_CSS_RESOURCE_NAME = "KinopoiskEnhancedCoreCss";
const CORE_SCRIPT_URL = "https://raw.githubusercontent.com/EnterBrain/kinopoisk_enhanced/main/dist/kinopoisk-enhanced-core.js";
const CORE_CSS_URL = "https://raw.githubusercontent.com/EnterBrain/kinopoisk_enhanced/main/dist/kinopoisk-enhanced-core.css";
const DEFAULT_CORE_HOSTS = ["fbsite.fun", "fbsite.top", "kinopoisk.net"];
const KINOBOX_API_ORIGIN = "https://fbphdplay.top";
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
let coreLoadPromise;
const playerAvailabilityByKinopoiskId = new Map();

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

function isEmbeddedFrame() {
  return window.top !== window;
}

function getReferrerHost() {
  if (!document.referrer) {
    return "";
  }

  try {
    return normalizeHost(new URL(document.referrer).hostname);
  } catch (error) {
    return "";
  }
}

function isEmbeddedFrameFromCoreHost() {
  const referrerHost = getReferrerHost();
  return isEmbeddedFrame() && !!referrerHost && getCoreHosts().includes(referrerHost);
}

function getMirrorUrl() {
  const url = new URL(window.location.href);
  url.hostname = url.hostname.replace(/kinopoisk\.ru$/i, "kinopoisk.net");

  return url.href;
}

function getKinopoiskId() {
  return window.location.pathname.match(/^\/(?:film|series)\/(\d+)\/?/)?.[1] || "";
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

function removeOpenButton() {
  document.getElementById(FEATURE_BUTTON_WRAPPER_ID)?.remove();
  document.getElementById(FEATURE_BUTTON_ID)?.remove();
}

function hasAvailablePlayer(payload) {
  return Array.isArray(payload?.data) && payload.data.some((player) => !!player?.iframeUrl);
}

function getPlayerAvailability(kinopoiskId) {
  if (playerAvailabilityByKinopoiskId.has(kinopoiskId)) {
    return playerAvailabilityByKinopoiskId.get(kinopoiskId);
  }

  const url = new URL("/api/players", KINOBOX_API_ORIGIN);
  url.searchParams.set("kinopoisk", kinopoiskId);

  const availabilityPromise = requestJson(url)
    .then((payload) => {
      const isAvailable = hasAvailablePlayer(payload);
      playerAvailabilityByKinopoiskId.set(kinopoiskId, isAvailable);
      return isAvailable;
    })
    .catch((error) => {
      console.warn("[Kinopoisk Enhanced] failed to check player availability", error);
      playerAvailabilityByKinopoiskId.delete(kinopoiskId);
      return true;
    });

  playerAvailabilityByKinopoiskId.set(kinopoiskId, availabilityPromise);
  return availabilityPromise;
}

async function injectOpenButton() {
  if (!isSupportedKinopoiskCard()) {
    return;
  }

  const kinopoiskId = getKinopoiskId();
  const handledUrl = window.location.href;

  if (!kinopoiskId) {
    removeOpenButton();
    return;
  }

  const hasPlayers = await getPlayerAvailability(kinopoiskId);

  if (handledUrl !== window.location.href || kinopoiskId !== getKinopoiskId()) {
    return;
  }

  if (!hasPlayers) {
    removeOpenButton();
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

  removeOpenButton();
}

function handleRouteChange() {
  if (lastHandledUrl === window.location.href) {
    void injectOpenButton();
    return;
  }

  lastHandledUrl = window.location.href;
  cleanupUnsupportedPage();
  void injectOpenButton();
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

function getBundledResourceText(resourceName) {
  if (typeof GM_getResourceText !== "function") {
    return "";
  }

  try {
    return GM_getResourceText(resourceName) || "";
  } catch (error) {
    console.warn(`[Kinopoisk Enhanced] failed to read bundled resource: ${resourceName}`, error);
    return "";
  }
}

function requestText(url) {
  if (typeof GM_xmlhttpRequest === "function") {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url,
        onload: (response) => {
          if (response.status >= 200 && response.status < 300) {
            resolve(response.responseText || "");
            return;
          }

          reject(new Error(`HTTP ${response.status} while loading ${url}`));
        },
        onerror: reject,
        ontimeout: reject,
      });
    });
  }

  return fetch(url, { credentials: "omit" }).then((response) => {
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} while loading ${url}`);
    }

    return response.text();
  });
}

async function requestJson(url) {
  const text = await requestText(url);
  return JSON.parse(text);
}

function getLoadedCoreApi() {
  return globalThis.KinopoiskEnhancedCore
    || window.KinopoiskEnhancedCore
    || (typeof unsafeWindow !== "undefined" ? unsafeWindow.KinopoiskEnhancedCore : null)
    || null;
}

function exposeLoadedCoreApi(core) {
  if (!core?.run) {
    return;
  }

  globalThis.KinopoiskEnhancedCore = core;
  window.KinopoiskEnhancedCore = core;

  if (typeof unsafeWindow !== "undefined") {
    try {
      unsafeWindow.KinopoiskEnhancedCore = core;
    } catch (error) {
      console.warn("[Kinopoisk Enhanced] failed to expose core on unsafeWindow", error);
    }
  }
}

function isLikelyJavaScript(source) {
  const text = String(source || "").trimStart();
  const probe = text.slice(0, 160).toLowerCase();

  if (!text.trim()) {
    return false;
  }

  if (/^(https?:\/\/|file:\/\/)/i.test(text.trim())) {
    return false;
  }

  return !(probe.startsWith("<!doctype") || probe.startsWith("<html") || probe.includes("not found"));
}

function evaluateCoreScript(source) {
  if (!isLikelyJavaScript(source)) {
    throw new Error(`Core script resource is not valid JavaScript. Preview: ${String(source || "").slice(0, 120)}`);
  }

  const gmApi = {
    GM_getValue: typeof GM_getValue === "function" ? GM_getValue : null,
    GM_setValue: typeof GM_setValue === "function" ? GM_setValue : null,
    GM_xmlhttpRequest: typeof GM_xmlhttpRequest === "function" ? GM_xmlhttpRequest : null,
  };

  const core = Function(
    "gmApi",
    `
      const { GM_getValue, GM_setValue, GM_xmlhttpRequest } = gmApi;
      ${source}
      return (typeof globalThis !== "undefined" && globalThis.KinopoiskEnhancedCore)
        || (typeof window !== "undefined" && window.KinopoiskEnhancedCore)
        || null;
      //# sourceURL=${CORE_SCRIPT_URL}
    `,
  )(gmApi);

  exposeLoadedCoreApi(core);
  return core;
}

async function ensureCoreStylesLoaded() {
  if (document.querySelector("style[data-kinopoisk-enhanced-core-styles]")) {
    return;
  }

  const bundledCss = getBundledResourceText(CORE_CSS_RESOURCE_NAME);
  const css = bundledCss.trim() ? bundledCss : await requestText(CORE_CSS_URL);

  if (!css.trim()) {
    return;
  }

  const style = document.createElement("style");
  style.dataset.kinopoiskEnhancedCoreStyles = "true";
  style.textContent = css;
  document.head.append(style);
}

async function ensureCoreLoaded() {
  const loadedCore = getLoadedCoreApi();
  if (loadedCore?.run) {
    return loadedCore;
  }

  coreLoadPromise ??= (async () => {
    const bundledCore = getBundledResourceText(CORE_RESOURCE_NAME);
    const source = bundledCore.trim() ? bundledCore : await requestText(CORE_SCRIPT_URL);

    const core = evaluateCoreScript(source) || getLoadedCoreApi();
    if (!core?.run) {
      throw new Error("Loaded core did not expose KinopoiskEnhancedCore.run");
    }

    return core;
  })();

  return coreLoadPromise;
}

async function loadCore(context) {
  await ensureCoreStylesLoaded();
  const core = await ensureCoreLoaded();
  core.run(context);
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
  const host = normalizeHost(window.location.hostname);
  const shouldRunCore = isCoreHost();
  const shouldRunEmbeddedCore = isEmbeddedFrameFromCoreHost();

  if (!shouldRunCore && !shouldRunEmbeddedCore) {
    return;
  }

  void loadCore({
    appId: APP_ID,
    host,
    embedded: shouldRunEmbeddedCore,
    referrerHost: getReferrerHost(),
    source: "loader",
  }).catch((error) => {
    console.error("[Kinopoisk Enhanced] failed to load core", error);
    notify("Не удалось загрузить Kinopoisk Enhanced Core");
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
