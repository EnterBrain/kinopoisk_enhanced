(function (global) {
  "use strict";

  const HIDDEN_SELECTORS = ["div#tgWrapper", "div.topAdPad"];
  const HEADER_ID = "kinopoisk-enhanced-core-header";
  const FOOTER_ID = "kinopoisk-enhanced-core-footer";
  const KINOPOISK_ORIGIN = "https://www.kinopoisk.ru";
  const KINOBOX_API_ORIGIN = "https://fbphdplay.top";
  const STORAGE_PREFIX = "kinopoisk-enhanced-core";
  const CONTROL_BUTTONS_ID = "kinopoisk-enhanced-core-footer-controls";
  const PLAYER_SOURCE_MENU_SELECTOR = "nav.kinobox_menu";
  const PLAYER_SOURCE_ITEM_SELECTOR = "li";
  const PLAYER_SOURCE_ACTIVE_CLASS = "kinobox_menu_active";
  const AUDIO_COMPRESSOR_ENABLED = false;
  const BRIDGE_APP_ID = "kinopoisk-enhanced";
  const BRIDGE_STATUS_TYPE = "kinopoisk-enhanced:compressor-status";
  const BRIDGE_COMMAND_TYPE = "kinopoisk-enhanced:compressor-command";
  const BRIDGE_EFFECTS_STATUS_TYPE = "kinopoisk-enhanced:video-effects-status";
  const BRIDGE_EFFECTS_COMMAND_TYPE = "kinopoisk-enhanced:video-effects-command";
  const BRIDGE_ASPECT_STATUS_TYPE = "kinopoisk-enhanced:aspect-ratio-status";
  const BRIDGE_ASPECT_COMMAND_TYPE = "kinopoisk-enhanced:aspect-ratio-command";
  const BRIDGE_SCALE_STATUS_TYPE = "kinopoisk-enhanced:video-scale-status";
  const BRIDGE_SCALE_COMMAND_TYPE = "kinopoisk-enhanced:video-scale-command";
  const VIDEO_SCALE_DEFAULT = 100;
  const VIDEO_SCALE_MIN = 50;
  const VIDEO_SCALE_MAX = 200;
  const VIDEO_SCALE_STEP = 5;
  const ASPECT_RATIO_OPTIONS = [
    { value: "16:9", label: "16:9", cssValue: "16 / 9" },
    { value: "12:5", label: "12:5", cssValue: "12 / 5" },
    { value: "4:3", label: "4:3", cssValue: "4 / 3" },
    { value: "fit", label: "Fit", cssValue: "" },
  ];
  const COMPRESSOR_PRESETS = Object.freeze({
    soft: Object.freeze({
      label: "Soft",
      settings: Object.freeze({ threshold: -22, knee: 18, ratio: 1.5, attack: 0.08, release: 0.24, outputGain: 1.02 }),
    }),
    night: Object.freeze({
      label: "Night",
      settings: Object.freeze({ threshold: -30, knee: 26, ratio: 2.6, attack: 0.05, release: 0.32, outputGain: 1.1 }),
    }),
    voice_boost: Object.freeze({
      label: "Voice Boost",
      settings: Object.freeze({ threshold: -26, knee: 22, ratio: 2, attack: 0.06, release: 0.24, outputGain: 1.08 }),
    }),
    strong: Object.freeze({
      label: "Strong",
      settings: Object.freeze({ threshold: -34, knee: 30, ratio: 3.5, attack: 0.04, release: 0.34, outputGain: 1.14 }),
    }),
    custom: Object.freeze({
      label: "Custom",
      settings: null,
    }),
  });
  const DEFAULT_COMPRESSOR_PRESET = "soft";
  const COMPRESSOR_PARAMETER_SCHEMA = Object.freeze({
    threshold: Object.freeze({
      label: "Threshold",
      description: "Порог начала компрессии",
      min: -100,
      max: 0,
      step: 1,
      defaultValue: -22,
      formatValue: (value) => `${Math.round(value)} dB`,
    }),
    knee: Object.freeze({
      label: "Knee",
      description: "Плавность входа в компрессию",
      min: 0,
      max: 40,
      step: 1,
      defaultValue: 18,
      formatValue: (value) => `${Math.round(value)} dB`,
    }),
    ratio: Object.freeze({
      label: "Ratio",
      description: "Сила сжатия громкости",
      min: 1,
      max: 20,
      step: 0.1,
      defaultValue: 1.5,
      formatValue: (value) => `${Number(value).toFixed(1).replace(/\.0$/, "")}:1`,
    }),
    attack: Object.freeze({
      label: "Attack",
      description: "Скорость начала сжатия",
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: 0.08,
      formatValue: (value) => `${Number(value).toFixed(2).replace(/0+$/, "").replace(/\.$/, "") || "0"} с`,
    }),
    release: Object.freeze({
      label: "Release",
      description: "Скорость восстановления уровня",
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: 0.24,
      formatValue: (value) => `${Number(value).toFixed(2).replace(/0+$/, "").replace(/\.$/, "") || "0"} с`,
    }),
    outputGain: Object.freeze({
      label: "Output Gain",
      description: "Компенсация громкости после компрессии",
      min: 0.5,
      max: 2,
      step: 0.05,
      defaultValue: 1.02,
      formatValue: (value) => `${Number(value).toFixed(2).replace(/0+$/, "").replace(/\.$/, "") || "1"}x`,
    }),
  });
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
  let videoScaleController;
  let playerSourceSelector;
  let embeddedPlayerCore;

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

function getKinopoiskId() {
  const pathMatch = window.location.pathname.match(/\/(?:film|series)\/(\d+)/);
  if (pathMatch) {
    return pathMatch[1];
  }

  return document.querySelector("[data-kinopoisk]")?.dataset.kinopoisk || "";
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

async function requestJson(url) {
  const text = await requestText(url);
  return JSON.parse(text);
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
  if (["fill", "fill-h", "fill-v", "native"].includes(value)) {
    return ASPECT_RATIO_OPTIONS.find((option) => option.value === "fit") || ASPECT_RATIO_OPTIONS[0];
  }

  return ASPECT_RATIO_OPTIONS.find((option) => option.value === value) || ASPECT_RATIO_OPTIONS[0];
}

function getCurrentVideoElement(root = document) {
  return root.querySelector("video");
}

function isCompressorApiSupported() {
  return !!(
    (window.AudioContext || window.webkitAudioContext) &&
    window.MediaElementAudioSourceNode &&
    window.DynamicsCompressorNode &&
    window.GainNode
  );
}

function disconnectAudioNode(node, target) {
  try {
    node?.disconnect(target);
  } catch (error) {
    // Audio graph nodes can already be disconnected after player swaps.
  }
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeVideoScalePercent(value) {
  const numericValue = Number(value);
  const safeValue = Number.isFinite(numericValue) ? numericValue : VIDEO_SCALE_DEFAULT;
  const steppedValue = roundToStep(safeValue, VIDEO_SCALE_STEP);
  return clampNumber(steppedValue, VIDEO_SCALE_MIN, VIDEO_SCALE_MAX);
}

function getPlayerSourceProvider(item) {
  const title = item?.getAttribute("title") || "";
  const providerMatch = title.match(/\[([^\]]+)\]\s*$/);
  if (providerMatch) {
    return providerMatch[1].trim();
  }

  return item?.textContent?.trim().replace(/^\d+\s*::\s*/, "") || "Плеер";
}

function getPlayerSourceLabel(item, index) {
  const provider = getPlayerSourceProvider(item);
  const text = item?.textContent?.trim().replace(/\s+/g, " ") || "";
  const prefix = Number.isFinite(index) ? `${index + 1}. ` : "";

  return `${prefix}${provider}${text && !text.includes(provider) ? ` - ${text.replace(/^\d+\s*::\s*/, "")}` : ""}`;
}

function roundToStep(value, step) {
  return step ? Math.round(value / step) * step : value;
}

function getDefaultCompressorSettings() {
  return { ...(COMPRESSOR_PRESETS[DEFAULT_COMPRESSOR_PRESET]?.settings || {}) };
}

function normalizeCompressorSettings(rawValue) {
  const defaults = getDefaultCompressorSettings();
  const source = rawValue && typeof rawValue === "object" ? rawValue : {};

  return Object.fromEntries(
    Object.entries(COMPRESSOR_PARAMETER_SCHEMA).map(([key, schema]) => {
      const rawNumber = Number(source[key]);
      const fallbackValue = defaults[key] ?? schema.defaultValue;
      const normalizedValue = Number.isFinite(rawNumber) ? rawNumber : fallbackValue;
      const steppedValue = roundToStep(normalizedValue, schema.step);
      return [key, clampNumber(steppedValue, schema.min, schema.max)];
    }),
  );
}

function areCompressorSettingsEqual(left, right) {
  const normalizedLeft = normalizeCompressorSettings(left);
  const normalizedRight = normalizeCompressorSettings(right);
  return Object.keys(COMPRESSOR_PARAMETER_SCHEMA).every((key) => normalizedLeft[key] === normalizedRight[key]);
}

function detectCompressorPreset(settings) {
  const normalizedSettings = normalizeCompressorSettings(settings);
  const presetEntry = Object.entries(COMPRESSOR_PRESETS).find(([presetKey, preset]) => (
    presetKey !== "custom"
    && preset.settings
    && areCompressorSettingsEqual(normalizedSettings, preset.settings)
  ));

  return presetEntry ? presetEntry[0] : "custom";
}

function normalizeCompressorPreset(value) {
  return Object.prototype.hasOwnProperty.call(COMPRESSOR_PRESETS, value) ? value : DEFAULT_COMPRESSOR_PRESET;
}

function normalizeCompressorState(rawValue) {
  if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
    const settings = normalizeCompressorSettings(rawValue);
    return {
      preset: detectCompressorPreset(settings),
      advancedMode: false,
      settings,
    };
  }

  const rawSettings = rawValue.settings && typeof rawValue.settings === "object" ? rawValue.settings : rawValue;
  const settings = normalizeCompressorSettings(rawSettings);
  const requestedPreset = normalizeCompressorPreset(rawValue.preset);
  const preset = requestedPreset === "custom"
    ? "custom"
    : (areCompressorSettingsEqual(settings, COMPRESSOR_PRESETS[requestedPreset].settings)
      ? requestedPreset
      : detectCompressorPreset(settings));

  return {
    preset,
    advancedMode: !!rawValue.advancedMode,
    settings,
  };
}

function bindPopupClickToggle(wrapper, trigger, popup) {
  if (!wrapper || !trigger || !popup) {
    return { close() {} };
  }

  const openClass = "kinopoisk-enhanced-core-popup-open";
  const triggerOpenClass = "kinopoisk-enhanced-core-popup-trigger-open";
  const close = () => {
    wrapper.classList.remove(openClass);
    trigger.classList.remove(triggerOpenClass);
    trigger.setAttribute("aria-expanded", "false");
  };
  const open = () => {
    document.querySelectorAll(`.${openClass}`).forEach((node) => {
      if (node !== wrapper) {
        node.classList.remove(openClass);
        node.querySelector(".kinopoisk-enhanced-core-popup-trigger-open")?.classList.remove(triggerOpenClass);
      }
    });
    wrapper.classList.add(openClass);
    trigger.classList.add(triggerOpenClass);
    trigger.setAttribute("aria-expanded", "true");
  };

  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.setAttribute("aria-expanded", "false");
  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (wrapper.classList.contains(openClass)) {
      close();
      return;
    }
    open();
  });
  popup.addEventListener("click", (event) => event.stopPropagation());
  document.addEventListener("click", (event) => {
    if (!wrapper.contains(event.target)) {
      close();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      close();
    }
  });

  return { close };
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
    this.remoteWindow = null;
    this.remoteAvailable = false;
    this.remoteStatus = "idle";
    this.blurButton = null;
    this.mirrorButton = null;
    this.messageHandler = (event) => this.handleBridgeMessage(event);
    window.addEventListener("message", this.messageHandler);
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
    this.setRemoteTarget(target instanceof HTMLIFrameElement ? target : null);
    this.apply();
    this.updateButtons();
  }

  setRemoteTarget(iframe) {
    const nextWindow = iframe?.contentWindow || null;
    if (nextWindow === this.remoteWindow) {
      return;
    }

    this.remoteWindow = nextWindow;
    this.remoteAvailable = false;
    this.remoteStatus = nextWindow ? "waiting" : "idle";

    if (this.remoteWindow) {
      this.sendBridgeCommand("set-video-effects");
    }
  }

  handleBridgeMessage(event) {
    if (!this.remoteWindow || event.source !== this.remoteWindow) {
      return;
    }

    const data = event.data;
    if (!data || data.appId !== BRIDGE_APP_ID || data.type !== BRIDGE_EFFECTS_STATUS_TYPE) {
      return;
    }

    this.remoteAvailable = !!data.available;
    this.remoteStatus = data.status || (this.remoteAvailable ? "ready" : "unavailable");
    this.updateButtons();
  }

  sendBridgeCommand(command) {
    if (!this.remoteWindow) {
      return;
    }

    this.remoteWindow.postMessage({
      appId: BRIDGE_APP_ID,
      type: BRIDGE_EFFECTS_COMMAND_TYPE,
      command,
      blurEnabled: this.blurEnabled,
      mirrorEnabled: this.mirrorEnabled,
    }, "*");
  }

  isRemoteMode() {
    return this.target instanceof HTMLIFrameElement && !!this.remoteWindow;
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

    if (this.isRemoteMode()) {
      this.target.classList.remove(
        "kinopoisk-enhanced-core-media--blur",
        "kinopoisk-enhanced-core-media--mirror",
      );
      this.frame?.classList.remove(
        "kinopoisk-enhanced-core-media--blur",
        "kinopoisk-enhanced-core-media--mirror",
      );
      this.sendBridgeCommand("set-video-effects");
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
    const remoteSuffix = this.remoteWindow ? ` (${this.remoteStatus})` : "";
    if (this.blurButton) {
      this.blurButton.disabled = !hasTarget;
      this.blurButton.classList.toggle("kinopoisk-enhanced-core-footer__button--active", this.blurEnabled);
      this.blurButton.title = `Размытие видео: ${this.blurEnabled ? "вкл" : "выкл"}${remoteSuffix}`;
    }

    if (this.mirrorButton) {
      this.mirrorButton.disabled = !hasTarget;
      this.mirrorButton.classList.toggle("kinopoisk-enhanced-core-footer__button--active", this.mirrorEnabled);
      this.mirrorButton.title = `Зеркало видео: ${this.mirrorEnabled ? "вкл" : "выкл"}${remoteSuffix}`;
    }
  }
}

class AspectRatioSelector {
  constructor(tracker) {
    this.mode = getAspectRatioOption(storageGet("aspect-ratio-mode", "native")).value;
    this.target = null;
    this.frame = null;
    this.mainContainer = null;
    this.remoteWindow = null;
    this.remoteAvailable = false;
    this.remoteStatus = "idle";
    this.button = null;
    this.messageHandler = (event) => this.handleBridgeMessage(event);
    window.addEventListener("message", this.messageHandler);
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
    this.setRemoteTarget(target instanceof HTMLIFrameElement ? target : null);
    this.apply();
    this.updateButton();
  }

  setRemoteTarget(iframe) {
    const nextWindow = iframe?.contentWindow || null;
    if (nextWindow === this.remoteWindow) {
      return;
    }

    this.remoteWindow = nextWindow;
    this.remoteAvailable = false;
    this.remoteStatus = nextWindow ? "waiting" : "idle";

    if (this.remoteWindow) {
      this.sendBridgeCommand();
    }
  }

  handleBridgeMessage(event) {
    if (!this.remoteWindow || event.source !== this.remoteWindow) {
      return;
    }

    const data = event.data;
    if (!data || data.appId !== BRIDGE_APP_ID || data.type !== BRIDGE_ASPECT_STATUS_TYPE) {
      return;
    }

    this.remoteAvailable = !!data.available;
    this.remoteStatus = data.status || (this.remoteAvailable ? "ready" : "unavailable");
    this.updateButton();
  }

  sendBridgeCommand() {
    if (!this.remoteWindow) {
      return;
    }

    const option = getAspectRatioOption(this.mode);
    this.remoteWindow.postMessage({
      appId: BRIDGE_APP_ID,
      type: BRIDGE_ASPECT_COMMAND_TYPE,
      command: "set-aspect-ratio",
      mode: option.value,
      cssValue: option.cssValue,
    }, "*");
  }

  isRemoteMode() {
    return this.target instanceof HTMLIFrameElement && !!this.remoteWindow;
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

    if (this.isRemoteMode()) {
      this.sendBridgeCommand();
      this.mainContainer?.classList.remove("kinopoisk-enhanced-core-main--fit-media");
      return;
    }

    this.target?.classList.add("kinopoisk-enhanced-core-media--aspect-managed");

    if (option.value === "fit") {
      this.mainContainer?.classList.add("kinopoisk-enhanced-core-main--fit-media");
      return;
    }

    frame.classList.add("kinopoisk-enhanced-core-media-frame");
    frame.style.setProperty("--kinopoisk-enhanced-core-player-aspect-ratio", option.cssValue || "16 / 9");
    this.mainContainer?.classList.remove("kinopoisk-enhanced-core-main--fit-media");
  }

  updateButton() {
    if (!this.button) {
      return;
    }

    const option = getAspectRatioOption(this.mode);
    this.button.disabled = !this.target && !this.frame;
    this.button.textContent = option.label;
    this.button.classList.add("kinopoisk-enhanced-core-footer__button--active");
    this.button.title = `Соотношение сторон: ${option.label}${this.remoteWindow ? ` (${this.remoteStatus})` : ""}`;
  }
}

class VideoScaleController {
  constructor(tracker) {
    this.scalePercent = normalizeVideoScalePercent(storageGet("video-scale-percent", VIDEO_SCALE_DEFAULT));
    this.target = null;
    this.frame = null;
    this.mainContainer = null;
    this.remoteWindow = null;
    this.remoteAvailable = false;
    this.remoteStatus = "idle";
    this.button = null;
    this.popup = null;
    this.valueNode = null;
    this.messageHandler = (event) => this.handleBridgeMessage(event);
    window.addEventListener("message", this.messageHandler);
    tracker.subscribe((target, mainContainer, previousTarget) => this.setTarget(target, mainContainer, previousTarget));
  }

  mount(parent) {
    if (this.button?.isConnected) {
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "kinopoisk-enhanced-core-scale-wrap";
    this.popup = this.createPopup();
    this.button = createControlButton({
      className: "kinopoisk-enhanced-core-footer__button--scale",
      label: this.getButtonLabel(),
      title: "Масштаб видео: 100%",
      onClick: () => {},
    });
    wrapper.append(this.popup, this.button);
    parent.append(wrapper);
    bindPopupClickToggle(wrapper, this.button, this.popup);
    this.updateButton();
  }

  setTarget(target, mainContainer, previousTarget) {
    this.clearTargetScale(previousTarget, findMediaFrame(previousTarget, mainContainer));
    this.target = target;
    this.frame = findMediaFrame(target, mainContainer);
    this.mainContainer = mainContainer;
    this.setRemoteTarget(target instanceof HTMLIFrameElement ? target : null);
    this.apply();
    this.updateButton();
  }

  setRemoteTarget(iframe) {
    const nextWindow = iframe?.contentWindow || null;
    if (nextWindow === this.remoteWindow) {
      return;
    }

    this.remoteWindow = nextWindow;
    this.remoteAvailable = false;
    this.remoteStatus = nextWindow ? "waiting" : "idle";

    if (this.remoteWindow) {
      this.sendBridgeCommand();
    }
  }

  handleBridgeMessage(event) {
    if (!this.remoteWindow || event.source !== this.remoteWindow) {
      return;
    }

    const data = event.data;
    if (!data || data.appId !== BRIDGE_APP_ID || data.type !== BRIDGE_SCALE_STATUS_TYPE) {
      return;
    }

    this.remoteAvailable = !!data.available;
    this.remoteStatus = data.status || (this.remoteAvailable ? "ready" : "unavailable");
    if (typeof data.scalePercent === "number") {
      this.scalePercent = normalizeVideoScalePercent(data.scalePercent);
    }
    this.updateButton();
  }

  sendBridgeCommand() {
    if (!this.remoteWindow) {
      return;
    }

    this.remoteWindow.postMessage({
      appId: BRIDGE_APP_ID,
      type: BRIDGE_SCALE_COMMAND_TYPE,
      command: "set-video-scale",
      scalePercent: this.scalePercent,
    }, "*");
  }

  isRemoteMode() {
    return this.target instanceof HTMLIFrameElement && !!this.remoteWindow;
  }

  getButtonLabel() {
    return `${this.scalePercent}%`;
  }

  createPopup() {
    const popup = document.createElement("div");
    popup.className = "kinopoisk-enhanced-core-scale-popup";

    const title = document.createElement("button");
    title.type = "button";
    title.className = "kinopoisk-enhanced-core-scale-popup__title";
    title.addEventListener("click", () => this.setScale(VIDEO_SCALE_DEFAULT));
    const label = document.createElement("span");
    label.textContent = "Масштаб: ";
    this.valueNode = document.createElement("span");
    title.append(label, this.valueNode);
    popup.append(title);

    const controls = document.createElement("div");
    controls.className = "kinopoisk-enhanced-core-scale-popup__controls";
    [
      { label: "+5%", action: () => this.adjustScale(VIDEO_SCALE_STEP) },
      { label: "100%", action: () => this.setScale(VIDEO_SCALE_DEFAULT) },
      { label: "-5%", action: () => this.adjustScale(-VIDEO_SCALE_STEP) },
    ].forEach(({ label: controlLabel, action }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "kinopoisk-enhanced-core-scale-popup__control";
      button.textContent = controlLabel;
      button.addEventListener("click", action);
      controls.append(button);
    });
    popup.append(controls);
    this.updatePopupState();
    return popup;
  }

  updatePopupState() {
    if (this.valueNode) {
      this.valueNode.textContent = this.getButtonLabel();
    }

    this.popup?.querySelectorAll(".kinopoisk-enhanced-core-scale-popup__control").forEach((button) => {
      button.classList.toggle("kinopoisk-enhanced-core-popup-active", button.textContent === this.getButtonLabel());
    });
  }

  clearTargetScale(target, frame = this.frame) {
    [target, frame].filter(Boolean).forEach((element) => {
      element.classList.remove("kinopoisk-enhanced-core-media--scaled");
      element.style.removeProperty("--kinopoisk-enhanced-core-video-scale");
      element.parentElement?.style.removeProperty("overflow");
    });
  }

  apply() {
    if (!this.target) {
      return;
    }

    if (this.isRemoteMode()) {
      this.clearTargetScale(this.target, this.frame);
      this.sendBridgeCommand();
      return;
    }

    const visualTarget = this.frame || this.target;
    const scaleValue = this.scalePercent / 100;
    visualTarget?.classList.toggle("kinopoisk-enhanced-core-media--scaled", this.scalePercent !== VIDEO_SCALE_DEFAULT);
    visualTarget?.style.setProperty("--kinopoisk-enhanced-core-video-scale", String(scaleValue));
    if (this.scalePercent === VIDEO_SCALE_DEFAULT) {
      visualTarget?.parentElement?.style.removeProperty("overflow");
      return;
    }
    visualTarget?.parentElement?.style.setProperty("overflow", "hidden", "important");
  }

  setScale(value) {
    this.scalePercent = normalizeVideoScalePercent(value);
    storageSet("video-scale-percent", this.scalePercent);
    this.apply();
    this.updateButton();
  }

  adjustScale(delta) {
    this.setScale(this.scalePercent + delta);
  }

  updateButton() {
    if (!this.button) {
      return;
    }

    const hasTarget = !!this.target;
    const remoteSuffix = this.remoteWindow ? ` (${this.remoteStatus})` : "";
    this.button.disabled = !hasTarget;
    this.button.textContent = this.getButtonLabel();
    this.button.classList.toggle("kinopoisk-enhanced-core-footer__button--active", this.scalePercent !== VIDEO_SCALE_DEFAULT);
    this.button.title = `Масштаб видео: ${this.getButtonLabel()}${remoteSuffix}`;
    this.updatePopupState();
  }
}

class PlayerSourceSelector {
  constructor() {
    this.menu = null;
    this.items = [];
    this.activeIndex = -1;
    this.button = null;
    this.popup = null;
    this.listNode = null;
    this.observer = null;
    this.syncTimer = null;
    this.players = [];
    this.playersPromise = null;
    this.playerLoadedHandler = (event) => this.handlePlayerLoaded(event);
  }

  mount(parent) {
    if (this.button?.isConnected) {
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "kinopoisk-enhanced-core-player-source-wrap";
    this.popup = this.createPopup();
    this.button = createControlButton({
      className: "kinopoisk-enhanced-core-footer__button--source",
      label: "Плеер",
      title: "Выбор плеера",
      onClick: () => {},
    });
    wrapper.append(this.popup, this.button);
    parent.append(wrapper);
    bindPopupClickToggle(wrapper, this.button, this.popup);
    document.addEventListener("KinoboxPlayerLoaded", this.playerLoadedHandler);
    this.ensureObserver();
    this.sync();
  }

  handlePlayerLoaded(event) {
    const players = event.detail?.data?.data;
    if (Array.isArray(players)) {
      this.players = players.filter((player) => player?.iframeUrl);
      this.scheduleSync();
    }
  }

  async ensurePlayersLoaded() {
    if (this.players.length > 0) {
      return this.players;
    }

    if (this.playersPromise) {
      return this.playersPromise;
    }

    const kinopoiskId = getKinopoiskId();
    if (!kinopoiskId) {
      return [];
    }

    const url = new URL("/api/players", KINOBOX_API_ORIGIN);
    url.searchParams.set("kinopoisk", kinopoiskId);
    this.playersPromise = requestJson(url)
      .then((payload) => {
        this.players = Array.isArray(payload?.data)
          ? payload.data.filter((player) => player?.iframeUrl)
          : [];
        this.scheduleSync();
        return this.players;
      })
      .catch((error) => {
        console.warn("[Kinopoisk Enhanced] failed to load Kinobox players", error);
        return [];
      })
      .finally(() => {
        this.playersPromise = null;
      });

    return this.playersPromise;
  }

  createPopup() {
    const popup = document.createElement("div");
    popup.className = "kinopoisk-enhanced-core-player-source-popup";

    const title = document.createElement("div");
    title.className = "kinopoisk-enhanced-core-player-source-popup__title";
    title.textContent = "Плеер";
    this.listNode = document.createElement("div");
    this.listNode.className = "kinopoisk-enhanced-core-player-source-popup__list";
    popup.append(title, this.listNode);
    return popup;
  }

  ensureObserver() {
    if (this.observer || !document.documentElement) {
      return;
    }

    this.observer = new MutationObserver(() => this.scheduleSync());
    this.observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "title"],
      childList: true,
      subtree: true,
    });
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

  getMenu() {
    return document.querySelector(PLAYER_SOURCE_MENU_SELECTOR);
  }

  getItems(menu = this.menu) {
    return Array.from(menu?.querySelectorAll(PLAYER_SOURCE_ITEM_SELECTOR) || [])
      .filter((item) => item instanceof HTMLElement && item.textContent?.trim());
  }

  sync() {
    const nextMenu = this.getMenu();
    if (this.menu && this.menu !== nextMenu) {
      this.menu.classList.remove("kinopoisk-enhanced-core-player-source-menu-hidden");
    }

    this.menu = nextMenu;
    this.items = this.getItems();
    this.activeIndex = this.items.findIndex((item) => item.classList.contains(PLAYER_SOURCE_ACTIVE_CLASS));

    if (this.menu && this.items.length > 0) {
      this.menu.classList.add("kinopoisk-enhanced-core-player-source-menu-hidden");
    }

    this.render();
    this.updateButton();
  }

  getActiveItem() {
    return this.items[this.activeIndex] || this.items[0] || null;
  }

  dispatchTrustedLikeClick(item) {
    const rect = item.getBoundingClientRect();
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;
    const eventOptions = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX,
      clientY,
      button: 0,
      buttons: 1,
    };

    if (typeof PointerEvent === "function") {
      item.dispatchEvent(new PointerEvent("pointerover", { ...eventOptions, pointerId: 1, pointerType: "mouse", isPrimary: true }));
      item.dispatchEvent(new PointerEvent("pointerenter", { ...eventOptions, pointerId: 1, pointerType: "mouse", isPrimary: true }));
      item.dispatchEvent(new PointerEvent("pointerdown", { ...eventOptions, pointerId: 1, pointerType: "mouse", isPrimary: true }));
    }

    item.dispatchEvent(new MouseEvent("mouseover", eventOptions));
    item.dispatchEvent(new MouseEvent("mouseenter", eventOptions));
    item.dispatchEvent(new MouseEvent("mousedown", eventOptions));
    item.dispatchEvent(new MouseEvent("mouseup", { ...eventOptions, buttons: 0 }));

    if (typeof PointerEvent === "function") {
      item.dispatchEvent(new PointerEvent("pointerup", { ...eventOptions, buttons: 0, pointerId: 1, pointerType: "mouse", isPrimary: true }));
    }

    item.dispatchEvent(new MouseEvent("click", { ...eventOptions, buttons: 0 }));
    item.click();
  }

  openOriginalMenuForSelection(item) {
    const menuButton = this.menu?.previousElementSibling;
    const list = item.closest("ul");
    const baseOptions = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
    };

    if (menuButton instanceof HTMLButtonElement) {
      menuButton.dispatchEvent(new MouseEvent("click", baseOptions));
      menuButton.click();
    }

    this.menu?.classList.add("kinobox_menu_open");
    list?.dispatchEvent(new MouseEvent("mouseover", baseOptions));
    list?.dispatchEvent(new MouseEvent("mouseenter", { ...baseOptions, bubbles: false }));
  }

  dispatchKinoboxKeyboardShortcut(index) {
    if (index < 0 || index > 8) {
      return false;
    }

    const key = String(index + 1);
    const keyCode = key.charCodeAt(0);
    const eventOptions = {
      bubbles: true,
      cancelable: true,
      composed: true,
      key,
      code: `Digit${key}`,
      charCode: keyCode,
      keyCode,
      which: keyCode,
    };
    const targets = [
      document.activeElement,
      this.menu,
      this.menu?.closest(".kinobox_section"),
      document.body,
      document,
      window,
    ].filter(Boolean);

    ["keydown", "keypress", "keyup"].forEach((type) => {
      targets.forEach((target) => {
        target.dispatchEvent(new KeyboardEvent(type, eventOptions));
      });
    });
    return true;
  }

  getIframe() {
    return document.querySelector(".kinobox_iframe") || document.querySelector(".kinobox_iframe_container iframe");
  }

  getPlayerTypeFromItem(item) {
    return getPlayerSourceProvider(item);
  }

  getPlayerForItem(item, index) {
    const type = this.getPlayerTypeFromItem(item);
    return this.players[index] || this.players.find((player) => player?.type === type) || null;
  }

  async switchIframeDirectly(item, index) {
    await this.ensurePlayersLoaded();
    const player = this.getPlayerForItem(item, index);
    const iframe = this.getIframe();
    if (!player?.iframeUrl || !(iframe instanceof HTMLIFrameElement)) {
      console.warn("[Kinopoisk Enhanced] cannot switch Kinobox player directly", {
        hasPlayer: !!player,
        hasIframe: iframe instanceof HTMLIFrameElement,
        index,
        players: this.players.length,
      });
      return false;
    }

    console.info("[Kinopoisk Enhanced] switching Kinobox player directly", {
      index,
      type: player.type,
      iframeUrl: player.iframeUrl,
    });
    iframe.src = player.iframeUrl;
    this.items.forEach((sourceItem) => sourceItem.classList.remove(PLAYER_SOURCE_ACTIVE_CLASS));
    item.classList.add(PLAYER_SOURCE_ACTIVE_CLASS);
    this.activeIndex = index;
    this.render();
    this.updateButton();
    return true;
  }

  async selectItem(index) {
    const item = this.items[index];
    if (!item) {
      console.warn("[Kinopoisk Enhanced] player source item is missing", { index, items: this.items.length });
      return;
    }

    if (index === this.activeIndex || item.classList.contains(PLAYER_SOURCE_ACTIVE_CLASS)) {
      this.activeIndex = index;
      this.render();
      this.updateButton();
      return;
    }

    const switchedDirectly = await this.switchIframeDirectly(item, index);
    if (!switchedDirectly) {
      this.dispatchKinoboxKeyboardShortcut(index);
    }

    [80, 180, 420, 900].forEach((delay) => window.setTimeout(() => this.sync(), delay));
  }

  render() {
    if (!this.listNode) {
      return;
    }

    if (!this.items.length) {
      const empty = document.createElement("span");
      empty.className = "kinopoisk-enhanced-core-player-source-popup__empty";
      empty.textContent = "Список плееров не найден";
      this.listNode.replaceChildren(empty);
      return;
    }

    this.listNode.replaceChildren(...this.items.map((item, index) => {
      const button = document.createElement("button");
      const provider = getPlayerSourceProvider(item);
      const title = item.getAttribute("title") || item.textContent?.trim() || provider;
      button.type = "button";
      button.className = "kinopoisk-enhanced-core-player-source-popup__item";
      button.dataset.playerSourceIndex = String(index);
      button.textContent = getPlayerSourceLabel(item, index);
      button.title = title;
      button.classList.toggle("kinopoisk-enhanced-core-popup-active", index === this.activeIndex);
      const select = (event) => {
        event.preventDefault();
        event.stopPropagation();
        void this.selectItem(Number(button.dataset.playerSourceIndex));
      };
      button.addEventListener("pointerdown", select);
      button.addEventListener("click", select);
      return button;
    }));
  }

  updateButton() {
    if (!this.button) {
      return;
    }

    const activeItem = this.getActiveItem();
    const provider = activeItem ? getPlayerSourceProvider(activeItem) : "Плеер";
    this.button.disabled = !this.items.length;
    this.button.textContent = provider;
    this.button.title = activeItem
      ? `Плеер: ${activeItem.getAttribute("title") || activeItem.textContent?.trim() || provider}`
      : "Список плееров не найден";
    this.button.classList.toggle("kinopoisk-enhanced-core-footer__button--active", !!activeItem);
  }
}

class AudioCompressor {
  constructor(tracker) {
    this.enabled = storageGet("audio-compressor-enabled", false);
    const normalizedState = normalizeCompressorState(storageGet("audio-compressor-settings-v1", {
      preset: DEFAULT_COMPRESSOR_PRESET,
      advancedMode: false,
      settings: getDefaultCompressorSettings(),
    }));
    this.settings = normalizedState.settings;
    this.preset = normalizedState.preset;
    this.advancedMode = normalizedState.advancedMode;
    this.target = null;
    this.remoteWindow = null;
    this.remoteAvailable = false;
    this.remoteStatus = "idle";
    this.remoteMessage = "";
    this.state = null;
    this.button = null;
    this.popup = null;
    this.settingsInputs = {};
    this.settingsValueNodes = {};
    this.presetButtons = {};
    this.toggleButton = null;
    this.advancedModeInput = null;
    this.controlsNode = null;
    this.statusNode = null;
    this.meterNode = null;
    this.messageHandler = (event) => this.handleBridgeMessage(event);
    window.addEventListener("message", this.messageHandler);
    tracker.subscribe((target) => this.setTarget(target instanceof HTMLVideoElement ? target : null));
    tracker.subscribe((target) => this.setRemoteTarget(target instanceof HTMLIFrameElement ? target : null));
  }

  mount(parent) {
    if (this.button?.isConnected) {
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "kinopoisk-enhanced-core-compressor-wrap";
    this.popup = this.createSettingsPopup();
    this.button = createControlButton({
      className: "kinopoisk-enhanced-core-footer__button--icon kinopoisk-enhanced-core-footer__button--compressor",
      label: "Comp",
      title: "Аудио-компрессор: выкл",
      onClick: () => {},
    });
    wrapper.append(this.popup, this.button);
    parent.append(wrapper);
    bindPopupClickToggle(wrapper, this.button, this.popup);
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

  setRemoteTarget(iframe) {
    const nextWindow = iframe?.contentWindow || null;
    if (nextWindow === this.remoteWindow) {
      return;
    }

    this.remoteWindow = nextWindow;
    this.remoteAvailable = false;
    this.remoteStatus = nextWindow ? "waiting" : "idle";

    if (this.remoteWindow) {
      this.sendBridgeCommand({ command: "ping", enabled: this.enabled, settings: this.settings });
    }

    this.updateButton();
  }

  handleBridgeMessage(event) {
    if (!this.remoteWindow || event.source !== this.remoteWindow) {
      return;
    }

    const data = event.data;
    if (!data || data.appId !== BRIDGE_APP_ID || data.type !== BRIDGE_STATUS_TYPE) {
      return;
    }

    this.remoteAvailable = !!data.available;
    this.remoteStatus = data.status || (this.remoteAvailable ? "ready" : "unavailable");
    this.remoteMessage = data.message || "";

    if (typeof data.enabled === "boolean") {
      this.enabled = data.enabled;
      storageSet("audio-compressor-enabled", this.enabled);
    }

    this.updateButton();
  }

  sendBridgeCommand(payload) {
    if (!this.remoteWindow) {
      return;
    }

    this.remoteWindow.postMessage({
      appId: BRIDGE_APP_ID,
      type: BRIDGE_COMMAND_TYPE,
      ...payload,
    }, "*");
  }

  isRemoteMode() {
    return !!this.remoteWindow && !this.target;
  }

  isSupported() {
    return !!(
      this.target &&
      isCompressorApiSupported()
    );
  }

  ensureState() {
    if (this.state || !this.isSupported()) {
      return this.state;
    }

    try {
      this.state = createCompressorState(this.target, this.settings);
    } catch (error) {
      console.warn("[Kinopoisk Enhanced] audio compressor unavailable for this video", error);
      this.enabled = false;
      storageSet("audio-compressor-enabled", false);
      this.state = null;
    }

    return this.state;
  }

  saveCompressorState(nextSettings = this.settings, nextPreset = this.preset) {
    this.settings = normalizeCompressorSettings(nextSettings);
    this.preset = normalizeCompressorPreset(nextPreset);
    storageSet("audio-compressor-settings-v1", {
      preset: this.preset,
      advancedMode: this.advancedMode,
      settings: this.settings,
    });
  }

  formatParameterValue(key, value) {
    const schema = COMPRESSOR_PARAMETER_SCHEMA[key];
    return schema?.formatValue ? schema.formatValue(value) : String(value);
  }

  getCompressionIntensityLabel() {
    const ratio = Number(this.settings.ratio);
    const threshold = Number(this.settings.threshold);

    if (ratio <= 1.5 || threshold >= -18) {
      return "Без компрессии";
    }
    if (ratio <= 3 || threshold >= -30) {
      return "Мягкая компрессия";
    }
    if (ratio <= 6 || threshold >= -42) {
      return "Умеренная компрессия";
    }
    if (ratio <= 10 || threshold >= -54) {
      return "Агрессивная компрессия";
    }
    return "Почти лимитер";
  }

  getStatusText() {
    if (this.remoteWindow) {
      return this.remoteMessage || `iframe: ${this.remoteStatus}`;
    }
    if (!this.target) {
      return "Видео еще не найдено. Настройки сохранятся и применятся позже.";
    }
    if (!isCompressorApiSupported()) {
      return "Браузер не поддерживает AudioContext или компрессор.";
    }
    if (this.enabled && this.state?.context?.state === "suspended") {
      return "Нужен user gesture: клик по плееру или повторное включение компрессора.";
    }
    return "Настройки применяются к текущему видео сразу.";
  }

  createSettingsPopup() {
    const popup = document.createElement("div");
    popup.className = "kinopoisk-enhanced-core-compressor-popup";

    const title = document.createElement("span");
    title.className = "kinopoisk-enhanced-core-compressor-popup__title";
    title.textContent = "Компрессор";
    popup.append(title);

    this.statusNode = document.createElement("div");
    this.statusNode.className = "kinopoisk-enhanced-core-compressor-popup__status";
    popup.append(this.statusNode);

    this.meterNode = document.createElement("div");
    this.meterNode.className = "kinopoisk-enhanced-core-compressor-popup__meter";
    popup.append(this.meterNode);

    const presets = document.createElement("div");
    presets.className = "kinopoisk-enhanced-core-compressor-popup__presets";
    Object.entries(COMPRESSOR_PRESETS).forEach(([presetKey, preset]) => {
      const presetButton = document.createElement("button");
      presetButton.type = "button";
      presetButton.className = "kinopoisk-enhanced-core-compressor-popup__preset";
      presetButton.textContent = preset.label;
      presetButton.addEventListener("click", () => this.applyPreset(presetKey));
      this.presetButtons[presetKey] = presetButton;
      presets.append(presetButton);
    });
    popup.append(presets);

    const advancedLabel = document.createElement("label");
    advancedLabel.className = "kinopoisk-enhanced-core-compressor-popup__advanced";
    this.advancedModeInput = document.createElement("input");
    this.advancedModeInput.type = "checkbox";
    this.advancedModeInput.checked = this.advancedMode;
    this.advancedModeInput.addEventListener("change", () => this.setAdvancedMode(this.advancedModeInput.checked));
    const advancedText = document.createElement("span");
    advancedText.textContent = "Расширенный режим";
    advancedLabel.append(this.advancedModeInput, advancedText);
    popup.append(advancedLabel);

    this.controlsNode = document.createElement("div");
    this.controlsNode.className = "kinopoisk-enhanced-core-compressor-popup__controls";
    Object.entries(COMPRESSOR_PARAMETER_SCHEMA).forEach(([key, schema]) => {
      this.controlsNode.append(this.createParameterControl(key, schema));
    });
    popup.append(this.controlsNode);

    const footer = document.createElement("div");
    footer.className = "kinopoisk-enhanced-core-compressor-popup__footer";
    this.toggleButton = document.createElement("button");
    this.toggleButton.type = "button";
    this.toggleButton.className = "kinopoisk-enhanced-core-compressor-popup__toggle";
    this.toggleButton.addEventListener("click", () => this.setEnabled(!this.enabled, true));
    const resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.className = "kinopoisk-enhanced-core-compressor-popup__reset";
    resetButton.textContent = "Сбросить";
    resetButton.addEventListener("click", () => this.resetSettings());
    footer.append(this.toggleButton, resetButton);
    popup.append(footer);

    this.updatePopupState();
    return popup;
  }

  createParameterControl(key, schema) {
    const row = document.createElement("div");
    row.className = "kinopoisk-enhanced-core-compressor-popup__row";
    const head = document.createElement("div");
    head.className = "kinopoisk-enhanced-core-compressor-popup__row-head";
    const labelWrap = document.createElement("div");
    labelWrap.className = "kinopoisk-enhanced-core-compressor-popup__label-wrap";
    const label = document.createElement("span");
    label.className = "kinopoisk-enhanced-core-compressor-popup__label";
    label.textContent = schema.label;
    labelWrap.append(label);
    if (schema.description) {
      const hint = document.createElement("span");
      hint.className = "kinopoisk-enhanced-core-compressor-popup__hint";
      hint.dataset.hint = schema.description;
      hint.tabIndex = 0;
      labelWrap.append(hint);
    }
    const value = document.createElement("span");
    value.className = "kinopoisk-enhanced-core-compressor-popup__value";
    this.settingsValueNodes[key] = value;
    head.append(labelWrap, value);
    const input = document.createElement("input");
    input.type = "range";
    input.className = "kinopoisk-enhanced-core-compressor-popup__slider";
    input.min = String(schema.min);
    input.max = String(schema.max);
    input.step = String(schema.step);
    input.value = String(this.settings[key]);
    input.addEventListener("input", () => this.updateSettings({ [key]: Number(input.value) }));
    this.settingsInputs[key] = input;
    row.append(head, input);
    return row;
  }

  updateParameterControlValue(key) {
    const input = this.settingsInputs[key];
    const valueNode = this.settingsValueNodes[key];
    if (!input || !valueNode) {
      return;
    }
    input.value = String(this.settings[key]);
    valueNode.textContent = this.formatParameterValue(key, this.settings[key]);
  }

  renderMeterSummary() {
    if (!this.meterNode) {
      return;
    }
    const presetLabel = COMPRESSOR_PRESETS[this.preset]?.label || COMPRESSOR_PRESETS.custom.label;
    const rows = [
      ["Preset", presetLabel],
      ["Профиль", this.getCompressionIntensityLabel()],
      ["Threshold", this.formatParameterValue("threshold", this.settings.threshold)],
      ["Output Gain", this.formatParameterValue("outputGain", this.settings.outputGain)],
    ];
    this.meterNode.replaceChildren(...rows.map(([label, value]) => {
      const line = document.createElement("div");
      line.className = "kinopoisk-enhanced-core-compressor-popup__meter-line";
      const labelNode = document.createElement("span");
      labelNode.className = "kinopoisk-enhanced-core-compressor-popup__meter-label";
      labelNode.textContent = label;
      const valueNode = document.createElement("span");
      valueNode.className = "kinopoisk-enhanced-core-compressor-popup__meter-value";
      valueNode.textContent = value;
      line.append(labelNode, valueNode);
      return line;
    }));
  }

  updatePopupState() {
    Object.entries(this.presetButtons).forEach(([presetKey, button]) => {
      button.classList.toggle("kinopoisk-enhanced-core-popup-active", presetKey === this.preset);
    });
    if (this.advancedModeInput) {
      this.advancedModeInput.checked = this.advancedMode;
    }
    if (this.controlsNode) {
      this.controlsNode.hidden = !this.advancedMode;
    }
    Object.keys(COMPRESSOR_PARAMETER_SCHEMA).forEach((key) => this.updateParameterControlValue(key));
    this.renderMeterSummary();
    if (this.statusNode) {
      this.statusNode.textContent = this.getStatusText();
    }
    if (this.toggleButton) {
      this.toggleButton.classList.toggle("kinopoisk-enhanced-core-popup-active", this.enabled);
      this.toggleButton.textContent = this.enabled ? "Выключить компрессор" : "Включить компрессор";
    }
  }

  setAdvancedMode(enabled) {
    this.advancedMode = !!enabled;
    this.saveCompressorState(this.settings, this.preset);
    this.updateButton();
  }

  updateSettings(partialSettings, source = "manual") {
    const nextSettings = { ...this.settings, ...partialSettings };
    const nextPreset = source === "manual" ? "custom" : this.preset;
    this.saveCompressorState(nextSettings, nextPreset);
    if (this.state) {
      applyCompressorSettingsToState(this.state, this.settings);
    }
    if (this.remoteWindow) {
      this.sendBridgeCommand({ command: "set-settings", settings: this.settings, preset: this.preset, advancedMode: this.advancedMode });
    }
    this.updateButton();
  }

  applyPreset(presetKey) {
    const preset = COMPRESSOR_PRESETS[presetKey];
    if (!preset) {
      return;
    }
    if (presetKey === "custom") {
      this.saveCompressorState(this.settings, "custom");
      this.updateButton();
      return;
    }
    this.saveCompressorState(preset.settings, presetKey);
    this.updateSettings(this.settings, "preset");
  }

  resetSettings() {
    this.saveCompressorState(getDefaultCompressorSettings(), DEFAULT_COMPRESSOR_PRESET);
    this.updateSettings(this.settings, "preset");
  }

  disconnectNodes() {
    if (!this.state) {
      return;
    }

    [
      [this.state.source, this.state.context.destination],
      [this.state.source, this.state.compressor],
      [this.state.compressor, this.state.gain],
      [this.state.gain, this.state.context.destination],
    ].forEach(([node, target]) => disconnectAudioNode(node, target));
  }

  async apply(fromUserGesture = false) {
    if (!this.enabled && !this.state) {
      this.updateButton();
      return;
    }

    const state = this.enabled ? this.ensureState() : this.state;
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
    this.setEnabled(!this.enabled, fromUserGesture);
  }

  setEnabled(enabled, fromUserGesture = false) {
    this.enabled = !!enabled;
    storageSet("audio-compressor-enabled", this.enabled);

    if (this.isRemoteMode()) {
      this.sendBridgeCommand({ command: "set-enabled", enabled: this.enabled, fromUserGesture, settings: this.settings });
      this.updateButton();
      return;
    }

    void this.apply(fromUserGesture);
    this.updateButton();
  }

  updateButton() {
    if (!this.button) {
      return;
    }

    const available = this.isSupported() || !!this.state || this.remoteAvailable;
    this.button.disabled = !available;
    this.button.classList.toggle("kinopoisk-enhanced-core-footer__button--active", this.enabled);
    this.button.title = this.remoteWindow && !this.remoteAvailable
      ? "Аудио-компрессор: ожидаем доступный video внутри iframe"
      : available
        ? `Аудио-компрессор: ${this.enabled ? "вкл" : "выкл"}${this.remoteWindow ? ` (${this.remoteStatus})` : ""}`
      : "Аудио-компрессор доступен только для video в текущем документе";
    this.updatePopupState();
  }
}

function applyCompressorSettingsToState(state, settings) {
  const normalizedSettings = normalizeCompressorSettings(settings);
  Object.entries(normalizedSettings).forEach(([key, value]) => {
    if (key === "outputGain") {
      if (state.gain?.gain && typeof state.gain.gain.value === "number") {
        state.gain.gain.value = value;
      }
      return;
    }

    const param = state.compressor?.[key];
    if (param && typeof param.value === "number") {
      param.value = value;
    }
  });
}

function createCompressorState(video, settings = getDefaultCompressorSettings()) {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  const context = new AudioContextCtor();
  const source = new MediaElementAudioSourceNode(context, { mediaElement: video });
  const compressor = new DynamicsCompressorNode(context);
  const gain = new GainNode(context);

  const state = { context, source, compressor, gain, active: false };
  applyCompressorSettingsToState(state, settings);
  return state;
}

class EmbeddedPlayerCore {
  constructor(context = {}) {
    this.context = context;
    this.enabled = AUDIO_COMPRESSOR_ENABLED && storageGet("audio-compressor-enabled", false);
    this.settings = normalizeCompressorState(storageGet("audio-compressor-settings-v1", {
      preset: DEFAULT_COMPRESSOR_PRESET,
      advancedMode: false,
      settings: getDefaultCompressorSettings(),
    })).settings;
    this.blurEnabled = storageGet("video-blur-enabled", false);
    this.mirrorEnabled = storageGet("video-mirror-enabled", false);
    this.aspectRatioMode = getAspectRatioOption(storageGet("aspect-ratio-mode", "native")).value;
    this.scalePercent = normalizeVideoScalePercent(storageGet("video-scale-percent", VIDEO_SCALE_DEFAULT));
    this.video = null;
    this.state = null;
    this.observer = null;
    this.syncTimer = null;
    this.initialized = false;
    this.messageHandler = (event) => this.handleMessage(event);
    this.videoEventHandler = () => {
      if (this.enabled) {
        void this.apply(true);
      }
      this.postStatus();
    };
  }

  init() {
    if (this.initialized) {
      this.scheduleSync();
      return;
    }

    this.initialized = true;
    window.addEventListener("message", this.messageHandler);
    this.ensureObserver();
    this.sync();
    this.postStatus();
  }

  ensureObserver() {
    if (this.observer || !document.documentElement) {
      return;
    }

    this.observer = new MutationObserver(() => this.scheduleSync());
    this.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  scheduleSync() {
    if (this.syncTimer) {
      return;
    }

    this.syncTimer = window.setTimeout(() => {
      this.syncTimer = null;
      this.sync();
    }, 120);
  }

  sync() {
    const nextVideo = getCurrentVideoElement(document);
    if (nextVideo === this.video) {
      this.postStatus();
      this.postEffectsStatus();
      this.postScaleStatus();
      return;
    }

    this.clearVideoEffects();
    this.clearVideoScale();
    this.clearAspectRatio();
    this.unbindVideo();
    this.disconnect();
    this.video = nextVideo;
    this.bindVideo();
    this.applyVideoEffects();
    this.applyAspectRatio();
    this.applyVideoScale();

    if (this.enabled) {
      void this.apply(false);
    }

    this.postStatus();
    this.postEffectsStatus();
    this.postAspectRatioStatus();
    this.postScaleStatus();
  }

  bindVideo() {
    if (!this.video) {
      return;
    }

    this.video.addEventListener("play", this.videoEventHandler);
    this.video.addEventListener("canplay", this.videoEventHandler);
    this.video.addEventListener("loadedmetadata", this.videoEventHandler);
  }

  unbindVideo() {
    if (!this.video) {
      return;
    }

    this.video.removeEventListener("play", this.videoEventHandler);
    this.video.removeEventListener("canplay", this.videoEventHandler);
    this.video.removeEventListener("loadedmetadata", this.videoEventHandler);
  }

  isAvailable() {
    return AUDIO_COMPRESSOR_ENABLED && !!this.video && isCompressorApiSupported();
  }

  applyVideoEffects() {
    if (!this.video) {
      return;
    }

    this.video.classList.toggle("kinopoisk-enhanced-core-media--blur", this.blurEnabled);
    this.video.classList.toggle("kinopoisk-enhanced-core-media--mirror", this.mirrorEnabled);
  }

  applyVideoScale() {
    if (!this.video) {
      return;
    }

    const scaleValue = this.scalePercent / 100;
    this.video.classList.toggle("kinopoisk-enhanced-core-media--scaled", this.scalePercent !== VIDEO_SCALE_DEFAULT);
    this.video.style.setProperty("--kinopoisk-enhanced-core-video-scale", String(scaleValue));
    if (this.scalePercent === VIDEO_SCALE_DEFAULT) {
      this.video.parentElement?.style.removeProperty("overflow");
      return;
    }
    this.video.parentElement?.style.setProperty("overflow", "hidden", "important");
  }

  clearVideoEffects() {
    this.video?.classList.remove(
      "kinopoisk-enhanced-core-media--blur",
      "kinopoisk-enhanced-core-media--mirror",
    );
  }

  clearVideoScale() {
    this.video?.classList.remove("kinopoisk-enhanced-core-media--scaled");
    this.video?.style.removeProperty("--kinopoisk-enhanced-core-video-scale");
    this.video?.parentElement?.style.removeProperty("overflow");
  }

  applyAspectRatio() {
    if (!this.video) {
      return;
    }

    const option = getAspectRatioOption(this.aspectRatioMode);
    const frame = this.video.parentElement;
    this.video.classList.add("kinopoisk-enhanced-core-media--aspect-managed");

    if (option.value === "fit") {
      frame?.style.removeProperty("display");
      frame?.style.removeProperty("align-items");
      frame?.style.removeProperty("justify-content");
      frame?.style.removeProperty("overflow");
      this.video.style.setProperty("display", "block", "important");
      this.video.style.setProperty("width", "100%", "important");
      this.video.style.setProperty("height", "100%", "important");
      this.video.style.setProperty("max-width", "100%", "important");
      this.video.style.setProperty("max-height", "100%", "important");
      this.video.style.removeProperty("position");
      this.video.style.removeProperty("top");
      this.video.style.removeProperty("left");
      this.video.style.setProperty("margin-inline", "auto", "important");
      this.video.style.setProperty("aspect-ratio", "auto", "important");
      this.video.style.setProperty("object-fit", "contain", "important");
      this.video.style.setProperty("object-position", "center center", "important");
      this.video.style.removeProperty("transform");
      return;
    }

    frame?.style.removeProperty("display");
    frame?.style.removeProperty("align-items");
    frame?.style.removeProperty("justify-content");
    frame?.style.removeProperty("overflow");
    this.video.style.setProperty("display", "block", "important");
    this.video.style.setProperty("width", "100%", "important");
    this.video.style.setProperty("height", "100%", "important");
    this.video.style.setProperty("max-width", "100%", "important");
    this.video.style.setProperty("max-height", "100%", "important");
    this.video.style.removeProperty("position");
    this.video.style.removeProperty("top");
    this.video.style.removeProperty("left");
    this.video.style.setProperty("margin-inline", "auto", "important");
    this.video.style.setProperty("--kinopoisk-enhanced-core-player-aspect-ratio", option.cssValue || "16 / 9");
    this.video.style.setProperty("aspect-ratio", option.cssValue || "16 / 9", "important");
    this.video.style.setProperty("object-fit", "contain", "important");
    this.video.style.setProperty("object-position", "center center", "important");
    this.video.style.removeProperty("transform");
  }

  clearAspectRatio() {
    this.video?.parentElement?.style.removeProperty("display");
    this.video?.parentElement?.style.removeProperty("align-items");
    this.video?.parentElement?.style.removeProperty("justify-content");
    if (this.scalePercent === VIDEO_SCALE_DEFAULT) {
      this.video?.parentElement?.style.removeProperty("overflow");
    }
    this.video?.classList.remove(
      "kinopoisk-enhanced-core-media--aspect-managed",
    );
    this.video?.style.removeProperty("--kinopoisk-enhanced-core-player-aspect-ratio");
    this.video?.style.removeProperty("display");
    this.video?.style.removeProperty("width");
    this.video?.style.removeProperty("height");
    this.video?.style.removeProperty("max-width");
    this.video?.style.removeProperty("max-height");
    this.video?.style.removeProperty("position");
    this.video?.style.removeProperty("top");
    this.video?.style.removeProperty("left");
    this.video?.style.removeProperty("margin-inline");
    this.video?.style.removeProperty("aspect-ratio");
    this.video?.style.removeProperty("object-fit");
    this.video?.style.removeProperty("object-position");
    this.video?.style.removeProperty("transform");
  }

  setAspectRatio({ mode }) {
    this.aspectRatioMode = getAspectRatioOption(mode).value;
    storageSet("aspect-ratio-mode", this.aspectRatioMode);
    this.applyAspectRatio();
    this.applyVideoScale();
    this.postAspectRatioStatus();
  }

  setVideoScale({ scalePercent }) {
    this.scalePercent = normalizeVideoScalePercent(scalePercent);
    storageSet("video-scale-percent", this.scalePercent);
    this.applyVideoScale();
    this.postScaleStatus();
  }

  setVideoEffects({ blurEnabled, mirrorEnabled }) {
    if (typeof blurEnabled === "boolean") {
      this.blurEnabled = blurEnabled;
      storageSet("video-blur-enabled", this.blurEnabled);
    }

    if (typeof mirrorEnabled === "boolean") {
      this.mirrorEnabled = mirrorEnabled;
      storageSet("video-mirror-enabled", this.mirrorEnabled);
    }

    this.applyVideoEffects();
    this.postEffectsStatus();
  }

  ensureState() {
    if (this.state || !this.isAvailable()) {
      return this.state;
    }

    try {
      this.state = createCompressorState(this.video, this.settings);
    } catch (error) {
      console.warn("[Kinopoisk Enhanced] embedded compressor unavailable", error);
      this.state = null;
    }

    return this.state;
  }

  disconnectNodes() {
    if (!this.state) {
      return;
    }

    [
      [this.state.source, this.state.context.destination],
      [this.state.source, this.state.compressor],
      [this.state.compressor, this.state.gain],
      [this.state.gain, this.state.context.destination],
    ].forEach(([node, target]) => disconnectAudioNode(node, target));
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

  async apply(fromUserGesture = false) {
    if (!this.enabled && !this.state) {
      this.postStatus();
      return;
    }

    const state = this.enabled ? this.ensureState() : this.state;
    if (!state) {
      this.postStatus();
      return;
    }

    this.disconnectNodes();

    if (this.enabled) {
      state.source.connect(state.compressor);
      state.compressor.connect(state.gain);
      state.gain.connect(state.context.destination);
      state.active = true;

      if (state.context.state === "suspended" && (fromUserGesture || !document.hidden)) {
        try {
          await state.context.resume();
        } catch (error) {
          console.warn("[Kinopoisk Enhanced] embedded compressor resume failed", error);
        }
      }
    } else {
      state.source.connect(state.context.destination);
      state.active = false;
    }

    this.postStatus();
  }

  getStatus() {
    if (!this.video) {
      return "no-video";
    }

    if (!isCompressorApiSupported()) {
      return "unsupported";
    }

    if (this.enabled && this.state?.context?.state === "suspended") {
      return "blocked";
    }

    return this.enabled ? "enabled" : "ready";
  }

  getStatusMessage() {
    if (!this.video) {
      return "Видео еще не найдено. Настройки сохранятся и применятся позже.";
    }
    if (!isCompressorApiSupported()) {
      return "Браузер не поддерживает AudioContext или компрессор.";
    }
    if (this.enabled && this.state?.context?.state === "suspended") {
      return "Нужен user gesture: клик по плееру или повторное включение компрессора.";
    }
    return "Настройки применяются к video внутри iframe.";
  }

  postStatus() {
    window.parent?.postMessage({
      appId: BRIDGE_APP_ID,
      type: BRIDGE_STATUS_TYPE,
      available: this.isAvailable(),
      enabled: this.enabled,
      status: this.getStatus(),
      message: this.getStatusMessage(),
      href: window.location.href,
    }, "*");
  }

  postEffectsStatus() {
    window.parent?.postMessage({
      appId: BRIDGE_APP_ID,
      type: BRIDGE_EFFECTS_STATUS_TYPE,
      available: !!this.video,
      blurEnabled: this.blurEnabled,
      mirrorEnabled: this.mirrorEnabled,
      status: this.video ? "ready" : "no-video",
      href: window.location.href,
    }, "*");
  }

  postAspectRatioStatus() {
    window.parent?.postMessage({
      appId: BRIDGE_APP_ID,
      type: BRIDGE_ASPECT_STATUS_TYPE,
      available: !!this.video,
      mode: this.aspectRatioMode,
      status: this.video ? "ready" : "no-video",
      href: window.location.href,
    }, "*");
  }

  postScaleStatus() {
    window.parent?.postMessage({
      appId: BRIDGE_APP_ID,
      type: BRIDGE_SCALE_STATUS_TYPE,
      available: !!this.video,
      scalePercent: this.scalePercent,
      status: this.video ? "ready" : "no-video",
      href: window.location.href,
    }, "*");
  }

  handleMessage(event) {
    const data = event.data;
    if (!data || data.appId !== BRIDGE_APP_ID) {
      return;
    }

    if (data.type === BRIDGE_EFFECTS_COMMAND_TYPE) {
      if (data.command === "set-video-effects") {
        this.setVideoEffects(data);
      }

      return;
    }

    if (data.type === BRIDGE_ASPECT_COMMAND_TYPE) {
      if (data.command === "set-aspect-ratio") {
        this.setAspectRatio(data);
      }

      return;
    }

    if (data.type === BRIDGE_SCALE_COMMAND_TYPE) {
      if (data.command === "set-video-scale") {
        this.setVideoScale(data);
      }

      return;
    }

    if (data.type !== BRIDGE_COMMAND_TYPE) {
      return;
    }

    if (!AUDIO_COMPRESSOR_ENABLED) {
      this.enabled = false;
      this.disconnect();
      this.postStatus();
      return;
    }

    if (data.command === "ping") {
      if (data.settings) {
        this.settings = normalizeCompressorSettings(data.settings);
        if (this.state) {
          applyCompressorSettingsToState(this.state, this.settings);
        }
      }
      if (typeof data.enabled === "boolean" && data.enabled !== this.enabled) {
        this.enabled = data.enabled;
        storageSet("audio-compressor-enabled", this.enabled);
        void this.apply(false);
        return;
      }

      this.scheduleSync();
      this.postStatus();
      return;
    }

    if (data.command === "set-settings") {
      this.settings = normalizeCompressorSettings(data.settings);
      storageSet("audio-compressor-settings-v1", {
        preset: normalizeCompressorPreset(data.preset),
        advancedMode: !!data.advancedMode,
        settings: this.settings,
      });
      if (this.state) {
        applyCompressorSettingsToState(this.state, this.settings);
      }
      this.postStatus();
      return;
    }

    if (data.command === "set-enabled") {
      if (data.settings) {
        this.settings = normalizeCompressorSettings(data.settings);
        if (this.state) {
          applyCompressorSettingsToState(this.state, this.settings);
        }
      }
      this.enabled = !!data.enabled;
      storageSet("audio-compressor-enabled", this.enabled);
      void this.apply(!!data.fromUserGesture);
    }
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
    text: "Убежище",
  });
  const returnLink = createActionLink({
    className: "kinopoisk-enhanced-core-header__action--return",
    href: getOriginalUrl(),
    text: "Вернуться",
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
  if (AUDIO_COMPRESSOR_ENABLED) {
    audioCompressor ??= new AudioCompressor(mediaTargetTracker);
  }
  videoEffects ??= new VideoEffects(mediaTargetTracker);
  aspectRatioSelector ??= new AspectRatioSelector(mediaTargetTracker);
  videoScaleController ??= new VideoScaleController(mediaTargetTracker);
  playerSourceSelector ??= new PlayerSourceSelector();

  audioCompressor?.mount(primaryGroup);
  playerSourceSelector.mount(primaryGroup);
  videoEffects.mount(primaryGroup);
  aspectRatioSelector.mount(secondaryGroup);
  videoScaleController.mount(secondaryGroup);
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

  if (context.embedded) {
    embeddedPlayerCore ??= new EmbeddedPlayerCore(context);
    embeddedPlayerCore.init();
    console.info("[Kinopoisk Enhanced] embedded core initialized", context);
    return;
  }

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
