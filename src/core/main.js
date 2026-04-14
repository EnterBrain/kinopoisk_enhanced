const HIDDEN_SELECTORS = ["div#tgWrapper", "div.topAdPad"];
const HEADER_ID = "kinopoisk-enhanced-core-header";
const FOOTER_ID = "kinopoisk-enhanced-core-footer";
const KINOPOISK_ORIGIN = "https://www.kinopoisk.ru";
const SELECTORS = {
  mainContainer: ".mainContainer",
  telegramLink: ".tgMain[href], .tgMain a[href]",
  wrapper: "div.wrapper",
};

let observer;
let titlePromise;

function hideElements() {
  for (const selector of HIDDEN_SELECTORS) {
    document.querySelectorAll(selector).forEach((element) => {
      element.hidden = true;
      element.style.setProperty("display", "none", "important");
    });
  }
}

function getOriginalUrl() {
  return new URL(window.location.pathname + window.location.search + window.location.hash, KINOPOISK_ORIGIN).href;
}

function getFallbackTitle() {
  return document.title.trim() || window.location.pathname;
}

async function fetchOriginalTitle() {
  const html = await requestText(getOriginalUrl());
  const documentFromHtml = new DOMParser().parseFromString(html, "text/html");
  const heading = documentFromHtml.querySelector("h1")?.textContent?.trim();
  const title = documentFromHtml.querySelector("title")?.textContent?.trim();

  return heading || title || getFallbackTitle();
}

function requestText(url) {
  if (typeof GM_xmlhttpRequest === "function") {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url,
        onload: (response) => resolve(response.responseText),
        onerror: reject,
        ontimeout: reject,
      });
    });
  }

  return fetch(url, { credentials: "omit" }).then((response) => response.text());
}

function getOriginalTitle() {
  titlePromise ??= fetchOriginalTitle().catch((error) => {
    console.warn("[Kinopoisk Enhanced] failed to fetch original title", error);
    return getFallbackTitle();
  });

  return titlePromise;
}

function getTelegramUrl() {
  return document.querySelector(SELECTORS.telegramLink)?.href || "";
}

function createActionLink({ className = "", href, text }) {
  const link = document.createElement("a");
  link.className = ["kinopoisk-enhanced-core-header__action", className].filter(Boolean).join(" ");
  link.href = href;
  link.textContent = text;

  return link;
}

function createHeader() {
  const header = document.createElement("section");
  const info = document.createElement("div");
  const title = document.createElement("a");
  const path = document.createElement("a");
  const actions = document.createElement("div");
  const shelterLink = createActionLink({
    className: "kinopoisk-enhanced-core-header__action--shelter",
    href: getTelegramUrl() || "#",
    text: "убежище",
  });
  const returnLink = createActionLink({
    className: "kinopoisk-enhanced-core-header__action--return",
    href: getOriginalUrl(),
    text: "вернуться",
  });

  header.id = HEADER_ID;
  header.className = "kinopoisk-enhanced-core-header";
  info.className = "kinopoisk-enhanced-core-header__info";
  title.className = "kinopoisk-enhanced-core-header__title";
  title.href = getOriginalUrl();
  title.textContent = getFallbackTitle();
  path.className = "kinopoisk-enhanced-core-header__path";
  path.href = getOriginalUrl();
  path.textContent = getOriginalUrl();
  actions.className = "kinopoisk-enhanced-core-header__actions";

  if (!getTelegramUrl()) {
    shelterLink.hidden = true;
  }

  getOriginalTitle().then((originalTitle) => {
    const currentTitle = header.querySelector(".kinopoisk-enhanced-core-header__title");

    if (currentTitle) {
      currentTitle.textContent = originalTitle;
    }
  });

  info.append(title, path);
  actions.append(shelterLink, returnLink);
  header.append(info, actions);

  return header;
}

function syncHeader() {
  const wrapper = document.querySelector(SELECTORS.wrapper);

  if (!wrapper) {
    return;
  }

  const existingHeader = document.getElementById(HEADER_ID) || createHeader();
  const shelterLink = existingHeader.querySelector(".kinopoisk-enhanced-core-header__action--shelter");
  const telegramUrl = getTelegramUrl();

  if (shelterLink) {
    shelterLink.hidden = !telegramUrl;
    shelterLink.href = telegramUrl || "#";
  }

  if (wrapper.firstElementChild !== existingHeader) {
    wrapper.prepend(existingHeader);
  }
}

function createFooter() {
  const footer = document.createElement("section");
  const text = document.createElement("span");

  footer.id = FOOTER_ID;
  footer.className = "kinopoisk-enhanced-core-footer";
  text.className = "kinopoisk-enhanced-core-footer__placeholder";
  text.textContent = "Нижняя панель Kinopoisk Enhanced";
  footer.append(text);

  return footer;
}

function syncFooter() {
  const mainContainer = document.querySelector(SELECTORS.mainContainer);

  if (!mainContainer) {
    return;
  }

  const existingFooter = document.getElementById(FOOTER_ID) || createFooter();

  if (mainContainer.nextElementSibling !== existingFooter) {
    mainContainer.insertAdjacentElement("afterend", existingFooter);
  }
}

function syncLayout() {
  syncHeader();
  syncFooter();
}

function observePageChanges() {
  observer?.disconnect();
  observer = new MutationObserver(() => {
    hideElements();
    syncLayout();
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

function run(context = {}) {
  if (document.documentElement.dataset.kinopoiskEnhancedCore === "enabled") {
    return;
  }

  document.documentElement.dataset.kinopoiskEnhancedCore = "enabled";
  hideElements();
  syncLayout();
  observePageChanges();
  console.info("[Kinopoisk Enhanced] core initialized", context);
}

window.KinopoiskEnhancedCore = {
  run,
};
