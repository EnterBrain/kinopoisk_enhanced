// ==UserScript==
// @name         Kinopoisk Enhanced Core
// @namespace    https://github.com/enterbrain42/kinopoisk_enhanced
// @version      0.1.0
// @description  Core-модуль Kinopoisk Enhanced для запуска на выбранных сайтах.
// @author       enterbrain42
// @license      Apache-2.0
// @match        *://*/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=kinopoisk.ru
// @grant        GM_xmlhttpRequest
// @connect      www.kinopoisk.ru
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const USERSCRIPT_CSS = ":root[data-kinopoisk-enhanced-core=\"enabled\"] {\n  --kinopoisk-enhanced-core-ready: 1;\n  --kinopoisk-enhanced-core-header-height: 72px;\n  --kinopoisk-enhanced-core-footer-height: 56px;\n}\n\ndiv#tgWrapper,\ndiv.topAdPad {\n  display: none !important;\n}\n\n.kinopoisk-enhanced-core-header {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 18px;\n  box-sizing: border-box;\n  height: var(--kinopoisk-enhanced-core-header-height);\n  margin: 0;\n  padding: 14px 16px;\n  border: 1px solid rgb(255 255 255 / 10%);\n  border-radius: 0;\n  background:\n    radial-gradient(circle at top left, rgb(255 122 0 / 20%), transparent 32%),\n    linear-gradient(135deg, rgb(24 25 30 / 96%), rgb(12 13 16 / 96%));\n  box-shadow: 0 14px 38px rgb(0 0 0 / 24%);\n  color: #fff;\n}\n\n.mainContainer {\n  box-sizing: border-box;\n  height: calc(\n    100vh -\n      var(--kinopoisk-enhanced-core-header-height) -\n      var(--kinopoisk-enhanced-core-footer-height)\n  ) !important;\n  min-height: 0 !important;\n  overflow: auto;\n}\n\n.kinopoisk-enhanced-core-header__info {\n  min-width: 0;\n}\n\n.kinopoisk-enhanced-core-header__title,\n.kinopoisk-enhanced-core-header__path {\n  display: block;\n  overflow: hidden;\n  text-decoration: none;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.kinopoisk-enhanced-core-header__title {\n  color: #fff;\n  font: 700 18px/1.25 Arial, sans-serif;\n}\n\n.kinopoisk-enhanced-core-header__path {\n  margin-top: 4px;\n  color: rgb(255 255 255 / 58%);\n  font: 400 13px/1.35 Arial, sans-serif;\n}\n\n.kinopoisk-enhanced-core-header__actions {\n  display: flex;\n  flex: 0 0 auto;\n  align-items: center;\n  gap: 10px;\n}\n\n.kinopoisk-enhanced-core-header__action {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  min-height: 38px;\n  padding: 0 16px;\n  border-radius: 999px;\n  background: rgb(255 255 255 / 10%);\n  color: #fff;\n  font: 700 14px/1.2 Arial, sans-serif;\n  text-decoration: none;\n}\n\n.kinopoisk-enhanced-core-header__action:hover {\n  background: rgb(255 255 255 / 16%);\n}\n\n.kinopoisk-enhanced-core-header__action--shelter {\n  background: linear-gradient(135deg, #2aabee, #229ed9);\n  color: #fff;\n}\n\n.kinopoisk-enhanced-core-header__action--shelter:hover {\n  background: linear-gradient(135deg, #36b7f5, #2aa7e4);\n}\n\n.kinopoisk-enhanced-core-header__action--return {\n  background: linear-gradient(135deg, #ff7a00, #ffb321);\n  color: #15110a;\n}\n\n.kinopoisk-enhanced-core-header__action--return:hover {\n  background: linear-gradient(135deg, #ff861f, #ffc24d);\n}\n\n.kinopoisk-enhanced-core-footer {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  box-sizing: border-box;\n  height: var(--kinopoisk-enhanced-core-footer-height);\n  margin: 0;\n  padding: 0 16px;\n  border-top: 1px solid rgb(255 255 255 / 10%);\n  background: linear-gradient(135deg, rgb(12 13 16 / 98%), rgb(24 25 30 / 98%));\n  color: rgb(255 255 255 / 70%);\n}\n\n.kinopoisk-enhanced-core-footer__placeholder {\n  overflow: hidden;\n  font: 700 13px/1.2 Arial, sans-serif;\n  letter-spacing: 0.04em;\n  text-overflow: ellipsis;\n  text-transform: uppercase;\n  white-space: nowrap;\n}\n\n@media (max-width: 720px) {\n  :root[data-kinopoisk-enhanced-core=\"enabled\"] {\n    --kinopoisk-enhanced-core-header-height: 116px;\n  }\n\n  .kinopoisk-enhanced-core-header {\n    align-items: stretch;\n    flex-direction: column;\n  }\n\n  .kinopoisk-enhanced-core-header__actions {\n    width: 100%;\n  }\n\n  .kinopoisk-enhanced-core-header__action {\n    flex: 1 1 0;\n  }\n}\n";

  function injectStyles(css) {
    if (!css.trim()) {
      return;
    }

    const style = document.createElement("style");
    style.dataset.kinopoiskEnhanced = "styles";
    style.textContent = css;
    document.head.append(style);
  }

  injectStyles(USERSCRIPT_CSS);

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
})();
