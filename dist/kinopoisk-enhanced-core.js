(function (global) {
  "use strict";

  const HIDDEN_SELECTORS = ["div#tgWrapper", "div.topAdPad"];
  const HEADER_ID = "kinopoisk-enhanced-core-header";
  const FOOTER_ID = "kinopoisk-enhanced-core-footer";
  const KINOPOISK_ORIGIN = "https://www.kinopoisk.ru";
  const STORAGE_PREFIX = "kinopoisk-enhanced-core";
  const CONTROL_BUTTONS_ID = "kinopoisk-enhanced-core-footer-controls";
  const ASPECT_RATIO_OPTIONS = [
    { value: "16:9", label: "16:9", cssValue: "16 / 9" },
    { value: "12:5", label: "12:5", cssValue: "12 / 5" },
    { value: "4:3", label: "4:3", cssValue: "4 / 3" },
    { value: "fill", label: "Fill", cssValue: "" },
  ];
  const SELECTORS = {
    mainContainer: ".mainContainer",
    telegramLink: ".tgMain[href], .tgMain a[href]",
    wrapper: "div.wrapper",
  };

  let observer;
  let layoutRaf;
  let titlePromise;
  let mediaTargetTracker;
  let audioCompressor;
  let videoEffects;
  let aspectRatioSelector;

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

function storageGet(key, fallbackValue) {
  try {
    if (typeof GM_getValue === "function") {
      return GM_getValue(`${STORAGE_PREFIX}:${key}`, fallbackValue);
    }
  } catch (error) {
    console.warn("[Kinopoisk Enhanced] GM_getValue failed", error);
  }

  try {
    const rawValue = localStorage.getItem(`${STORAGE_PREFIX}:${key}`);
    return rawValue === null ? fallbackValue : JSON.parse(rawValue);
  } catch (error) {
    return fallbackValue;
  }
}

function storageSet(key, value) {
  try {
    if (typeof GM_setValue === "function") {
      GM_setValue(`${STORAGE_PREFIX}:${key}`, value);
      return;
    }
  } catch (error) {
    console.warn("[Kinopoisk Enhanced] GM_setValue failed", error);
  }

  try {
    localStorage.setItem(`${STORAGE_PREFIX}:${key}`, JSON.stringify(value));
  } catch (error) {
    console.warn("[Kinopoisk Enhanced] localStorage write failed", error);
  }
}

function createControlButton({ className = "", label, title, onClick }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = ["kinopoisk-enhanced-core-footer__button", className].filter(Boolean).join(" ");
  button.textContent = label;
  button.title = title || label;
  button.addEventListener("click", onClick);

  return button;
}

function isUsableMediaElement(element) {
  if (!element) {
    return false;
  }

  if (element instanceof HTMLVideoElement) {
    return true;
  }

  return element instanceof HTMLIFrameElement;
}

function findMediaElement(root) {
  if (!root) {
    return null;
  }

  const directVideo = root.querySelector("video");
  if (directVideo) {
    return directVideo;
  }

  const iframe = root.querySelector("iframe");
  const iframeVideo = findVideoInsideIframe(iframe);
  return iframeVideo || iframe;
}

function findVideoInsideIframe(iframe) {
  if (!(iframe instanceof HTMLIFrameElement)) {
    return null;
  }

  try {
    return iframe.contentDocument?.querySelector("video") || null;
  } catch (error) {
    return null;
  }
}

function findMediaFrame(target, mainContainer) {
  if (!target) {
    return null;
  }

  if (target.ownerDocument !== document) {
    const ownerIframe = findOwnerIframeForDocument(target.ownerDocument, mainContainer);
    return findIframeFrame(ownerIframe) || ownerIframe || target;
  }

  if (target instanceof HTMLIFrameElement) {
    return findIframeFrame(target) || target;
  }

  return target.closest("video, iframe, [class*='player'], [id*='player']")
    || target.parentElement
    || target;
}

function findIframeFrame(iframe) {
  if (!(iframe instanceof HTMLIFrameElement)) {
    return null;
  }

  return iframe.closest("[class*='iframe_container' i], [class*='player' i], [id*='player' i]")
    || iframe.parentElement
    || iframe;
}

function findOwnerIframeForDocument(targetDocument, mainContainer) {
  if (!targetDocument || !mainContainer) {
    return null;
  }

  return Array.from(mainContainer.querySelectorAll("iframe")).find((iframe) => {
    try {
      return iframe.contentDocument === targetDocument;
    } catch (error) {
      return false;
    }
  }) || null;
}

function getAspectRatioOption(value) {
  return ASPECT_RATIO_OPTIONS.find((option) => option.value === value) || ASPECT_RATIO_OPTIONS[0];
}

class MediaTargetTracker {
  constructor() {
    this.mainContainer = null;
    this.currentTarget = null;
    this.observer = null;
    this.iframeObserver = null;
    this.observedIframe = null;
    this.observedIframeBody = null;
    this.subscribers = new Set();
    this.syncTimer = null;
    this.initialized = false;
    this.iframeLoadHandler = () => this.scheduleSync();
    this.visibilityHandler = () => {
      if (!document.hidden) {
        this.scheduleSync();
      }
    };
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    callback(this.currentTarget, this.mainContainer);

    return () => this.subscribers.delete(callback);
  }

  init() {
    if (this.initialized) {
      this.scheduleSync();
      return;
    }

    this.initialized = true;
    this.sync();
    document.addEventListener("visibilitychange", this.visibilityHandler);
  }

  scheduleSync() {
    if (this.syncTimer) {
      return;
    }

    this.syncTimer = window.setTimeout(() => {
      this.syncTimer = null;
      this.sync();
    }, 80);
  }

  ensureObserver(mainContainer) {
    if (this.mainContainer === mainContainer && this.observer) {
      return;
    }

    this.observer?.disconnect();
    this.mainContainer = mainContainer;
    this.observer = null;

    if (!mainContainer) {
      return;
    }

    this.observer = new MutationObserver(() => this.scheduleSync());
    this.observer.observe(mainContainer, {
      childList: true,
      subtree: true,
    });
  }

  ensureIframeObserver(mainContainer) {
    const iframe = mainContainer?.querySelector("iframe") || null;

    if (this.observedIframe && this.observedIframe !== iframe) {
      this.observedIframe.removeEventListener("load", this.iframeLoadHandler);
      this.observedIframe = null;
    }

    if (iframe && this.observedIframe !== iframe) {
      this.observedIframe = iframe;
      iframe.addEventListener("load", this.iframeLoadHandler);
    }

    let iframeBody = null;
    try {
      iframeBody = iframe?.contentDocument?.body || null;
    } catch (error) {
      iframeBody = null;
    }

    if (this.observedIframeBody === iframeBody) {
      return;
    }

    this.iframeObserver?.disconnect();
    this.iframeObserver = null;
    this.observedIframeBody = iframeBody;

    if (!iframeBody) {
      return;
    }

    this.iframeObserver = new MutationObserver(() => this.scheduleSync());
    this.iframeObserver.observe(iframeBody, {
      childList: true,
      subtree: true,
    });
  }

  sync() {
    const mainContainer = document.querySelector(SELECTORS.mainContainer);
    this.ensureObserver(mainContainer);
    this.ensureIframeObserver(mainContainer);

    const nextTarget = findMediaElement(mainContainer);
    if (nextTarget === this.currentTarget) {
      return;
    }

    const previousTarget = this.currentTarget;
    this.currentTarget = isUsableMediaElement(nextTarget) ? nextTarget : null;
    this.subscribers.forEach((callback) => callback(this.currentTarget, mainContainer, previousTarget));
  }
}

class VideoEffects {
  constructor(tracker) {
    this.blurEnabled = storageGet("video-blur-enabled", false);
    this.mirrorEnabled = storageGet("video-mirror-enabled", false);
    this.target = null;
    this.blurButton = null;
    this.mirrorButton = null;
    tracker.subscribe((target, mainContainer, previousTarget) => this.setTarget(target, mainContainer, previousTarget));
  }

  mount(parent) {
    this.blurButton = createControlButton({
      className: "kinopoisk-enhanced-core-footer__button--icon",
      label: "Blur",
      title: "Размытие видео: выкл",
      onClick: () => this.toggleBlur(),
    });
    this.mirrorButton = createControlButton({
      className: "kinopoisk-enhanced-core-footer__button--icon",
      label: "Mirror",
      title: "Зеркало видео: выкл",
      onClick: () => this.toggleMirror(),
    });
    parent.append(this.blurButton, this.mirrorButton);
    this.updateButtons();
  }

  setTarget(target, mainContainer, previousTarget) {
    const previousFrame = findMediaFrame(previousTarget, mainContainer);
    previousTarget?.classList.remove(
      "kinopoisk-enhanced-core-media--blur",
      "kinopoisk-enhanced-core-media--mirror",
    );
    previousFrame?.classList.remove(
      "kinopoisk-enhanced-core-media--blur",
      "kinopoisk-enhanced-core-media--mirror",
    );
    this.target = target;
    this.frame = findMediaFrame(target, mainContainer);
    this.apply();
    this.updateButtons();
  }

  toggleBlur() {
    this.blurEnabled = !this.blurEnabled;
    storageSet("video-blur-enabled", this.blurEnabled);
    this.apply();
    this.updateButtons();
  }

  toggleMirror() {
    this.mirrorEnabled = !this.mirrorEnabled;
    storageSet("video-mirror-enabled", this.mirrorEnabled);
    this.apply();
    this.updateButtons();
  }

  apply() {
    if (!this.target) {
      return;
    }

    const visualTarget = this.frame || this.target;

    this.target.classList.toggle("kinopoisk-enhanced-core-media--blur", this.blurEnabled && !this.frame);
    this.target.classList.toggle("kinopoisk-enhanced-core-media--mirror", this.mirrorEnabled && !this.frame);
    visualTarget?.classList.toggle("kinopoisk-enhanced-core-media--blur", this.blurEnabled);
    visualTarget?.classList.toggle("kinopoisk-enhanced-core-media--mirror", this.mirrorEnabled);
  }

  updateButtons() {
    const hasTarget = !!this.target;
    if (this.blurButton) {
      this.blurButton.disabled = !hasTarget;
      this.blurButton.classList.toggle("kinopoisk-enhanced-core-footer__button--active", this.blurEnabled);
      this.blurButton.title = `Размытие видео: ${this.blurEnabled ? "вкл" : "выкл"}`;
    }

    if (this.mirrorButton) {
      this.mirrorButton.disabled = !hasTarget;
      this.mirrorButton.classList.toggle("kinopoisk-enhanced-core-footer__button--active", this.mirrorEnabled);
      this.mirrorButton.title = `Зеркало видео: ${this.mirrorEnabled ? "вкл" : "выкл"}`;
    }
  }
}

class AspectRatioSelector {
  constructor(tracker) {
    this.mode = getAspectRatioOption(storageGet("aspect-ratio-mode", "native")).value;
    this.target = null;
    this.frame = null;
    this.mainContainer = null;
    this.button = null;
    tracker.subscribe((target, mainContainer, previousTarget) => this.setTarget(target, mainContainer, previousTarget));
  }

  mount(parent) {
    this.button = createControlButton({
      className: "kinopoisk-enhanced-core-footer__button--aspect",
      label: getAspectRatioOption(this.mode).label,
      title: "Соотношение сторон плеера",
      onClick: () => this.nextMode(),
    });
    parent.append(this.button);
    this.updateButton();
  }

  setTarget(target, mainContainer, previousTarget) {
    this.cleanupTarget(previousTarget, findMediaFrame(previousTarget, mainContainer));
    this.target = target;
    this.frame = findMediaFrame(target, mainContainer);
    this.mainContainer = mainContainer;
    this.apply();
    this.updateButton();
  }

  nextMode() {
    const currentIndex = ASPECT_RATIO_OPTIONS.findIndex((option) => option.value === this.mode);
    const nextOption = ASPECT_RATIO_OPTIONS[(currentIndex + 1) % ASPECT_RATIO_OPTIONS.length];
    this.mode = nextOption.value;
    storageSet("aspect-ratio-mode", this.mode);
    this.apply();
    this.updateButton();
  }

  cleanupTarget(target, frame = this.frame) {
    for (const element of [target, frame].filter(Boolean)) {
      element.classList.remove(
        "kinopoisk-enhanced-core-media--aspect-managed",
        "kinopoisk-enhanced-core-media--aspect-fill",
        "kinopoisk-enhanced-core-media-frame",
      );
      element.style.removeProperty("--kinopoisk-enhanced-core-player-aspect-ratio");
    }
  }

  apply() {
    if (!this.target && !this.frame) {
      return;
    }

    const option = getAspectRatioOption(this.mode);
    const frame = this.frame || this.target;
    this.cleanupTarget(this.target, frame);

    frame.classList.add("kinopoisk-enhanced-core-media-frame");
    frame.style.setProperty("--kinopoisk-enhanced-core-player-aspect-ratio", option.cssValue || "16 / 9");
    this.target?.classList.add("kinopoisk-enhanced-core-media--aspect-managed");

    if (option.value === "fill") {
      frame.classList.add("kinopoisk-enhanced-core-media--aspect-fill");
      this.target?.classList.add("kinopoisk-enhanced-core-media--aspect-fill");
      this.mainContainer?.classList.add("kinopoisk-enhanced-core-main--fill-media");
      return;
    }

    this.mainContainer?.classList.remove("kinopoisk-enhanced-core-main--fill-media");
  }

  updateButton() {
    if (!this.button) {
      return;
    }

    const option = getAspectRatioOption(this.mode);
    this.button.disabled = !this.target && !this.frame;
    this.button.textContent = option.label;
    this.button.classList.add("kinopoisk-enhanced-core-footer__button--active");
    this.button.title = `Соотношение сторон: ${option.label}`;
  }
}

class AudioCompressor {
  constructor(tracker) {
    this.enabled = storageGet("audio-compressor-enabled", false);
    this.target = null;
    this.state = null;
    this.button = null;
    tracker.subscribe((target) => this.setTarget(target instanceof HTMLVideoElement ? target : null));
  }

  mount(parent) {
    this.button = createControlButton({
      className: "kinopoisk-enhanced-core-footer__button--icon",
      label: "Comp",
      title: "Аудио-компрессор: выкл",
      onClick: () => this.toggle(true),
    });
    parent.append(this.button);
    this.updateButton();
  }

  setTarget(target) {
    if (target === this.target) {
      return;
    }

    this.disconnect();
    this.target = target;

    if (this.enabled) {
      this.ensureState();
      void this.apply(false);
    }

    this.updateButton();
  }

  isSupported() {
    return !!(
      this.target &&
      (window.AudioContext || window.webkitAudioContext) &&
      window.MediaElementAudioSourceNode &&
      window.DynamicsCompressorNode &&
      window.GainNode
    );
  }

  ensureState() {
    if (this.state || !this.isSupported()) {
      return this.state;
    }

    try {
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      const context = new AudioContextCtor();
      const source = new MediaElementAudioSourceNode(context, { mediaElement: this.target });
      const compressor = new DynamicsCompressorNode(context, {
        threshold: -28,
        knee: 24,
        ratio: 4,
        attack: 0.006,
        release: 0.22,
      });
      const gain = new GainNode(context, { gain: 1.08 });

      source.connect(context.destination);
      this.state = { context, source, compressor, gain, active: false };
    } catch (error) {
      console.warn("[Kinopoisk Enhanced] audio compressor unavailable for this video", error);
      this.enabled = false;
      storageSet("audio-compressor-enabled", false);
      this.state = null;
    }

    return this.state;
  }

  disconnectNodes() {
    if (!this.state) {
      return;
    }

    for (const [node, target] of [
      [this.state.source, this.state.context.destination],
      [this.state.source, this.state.compressor],
      [this.state.compressor, this.state.gain],
      [this.state.gain, this.state.context.destination],
    ]) {
      try {
        node.disconnect(target);
      } catch (error) {
        // Nodes can legitimately be disconnected already after player swaps.
      }
    }
  }

  async apply(fromUserGesture = false) {
    const state = this.ensureState();
    if (!state) {
      this.updateButton();
      return;
    }

    this.disconnectNodes();

    if (this.enabled) {
      state.source.connect(state.compressor);
      state.compressor.connect(state.gain);
      state.gain.connect(state.context.destination);
      state.active = true;

      if (fromUserGesture && state.context.state === "suspended") {
        try {
          await state.context.resume();
        } catch (error) {
          console.warn("[Kinopoisk Enhanced] failed to resume AudioContext", error);
        }
      }
    } else {
      state.source.connect(state.context.destination);
      state.active = false;
    }

    this.updateButton();
  }

  disconnect() {
    if (!this.state) {
      return;
    }

    this.disconnectNodes();
    try {
      this.state.source.connect(this.state.context.destination);
    } catch (error) {
      // The old media element can disappear while a player is being replaced.
    }
    this.state = null;
  }

  toggle(fromUserGesture = false) {
    this.enabled = !this.enabled;
    storageSet("audio-compressor-enabled", this.enabled);
    void this.apply(fromUserGesture);
    this.updateButton();
  }

  updateButton() {
    if (!this.button) {
      return;
    }

    const available = this.isSupported() || !!this.state;
    this.button.disabled = !available;
    this.button.classList.toggle("kinopoisk-enhanced-core-footer__button--active", this.enabled);
    this.button.title = available
      ? `Аудио-компрессор: ${this.enabled ? "вкл" : "выкл"}`
      : "Аудио-компрессор доступен только для video в текущем документе";
  }
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
  const status = document.createElement("span");
  const controlsNode = document.createElement("div");

  footer.id = FOOTER_ID;
  footer.className = "kinopoisk-enhanced-core-footer";
  status.className = "kinopoisk-enhanced-core-footer__status";
  status.textContent = "Player tools";
  controlsNode.id = CONTROL_BUTTONS_ID;
  controlsNode.className = "kinopoisk-enhanced-core-footer__controls";
  footer.append(status, controlsNode);

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

  mountFooterControls(existingFooter);
}

function mountFooterControls(footer) {
  const controlsNode = footer.querySelector(`#${CONTROL_BUTTONS_ID}`);

  if (!controlsNode || controlsNode.dataset.mounted === "true") {
    return;
  }

  controlsNode.dataset.mounted = "true";
  controlsNode.textContent = "";

  const primaryGroup = document.createElement("div");
  const secondaryGroup = document.createElement("div");
  primaryGroup.className = "kinopoisk-enhanced-core-footer__group";
  secondaryGroup.className = "kinopoisk-enhanced-core-footer__group";
  controlsNode.append(primaryGroup, secondaryGroup);

  mediaTargetTracker ??= new MediaTargetTracker();
  audioCompressor ??= new AudioCompressor(mediaTargetTracker);
  videoEffects ??= new VideoEffects(mediaTargetTracker);
  aspectRatioSelector ??= new AspectRatioSelector(mediaTargetTracker);

  audioCompressor.mount(primaryGroup);
  videoEffects.mount(primaryGroup);
  aspectRatioSelector.mount(secondaryGroup);
  mediaTargetTracker.init();
}

function syncLayout() {
  syncHeader();
  syncFooter();
}

function observePageChanges() {
  observer?.disconnect();
  observer = new MutationObserver(() => {
    if (layoutRaf) {
      return;
    }

    layoutRaf = requestAnimationFrame(() => {
      layoutRaf = null;
      hideElements();
      syncLayout();
    });
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
  mediaTargetTracker?.init();
  observePageChanges();
  console.info("[Kinopoisk Enhanced] core initialized", context);
}

  const api = {
    run,
  };

  global.KinopoiskEnhancedCore = api;

  if (typeof window !== "undefined") {
    window.KinopoiskEnhancedCore = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
