// ==UserScript==
// @name         Kinopoisk Enhanced Loader Dev
// @namespace    https://github.com/enterbrain42/kinopoisk_enhanced
// @version      0.1.1
// @description  Добавляет кнопку на Кинопоиск и запускает Kinopoisk Enhanced Core на выбранных сайтах. Dev-монолит с embedded core для локального тестирования.
// @author       enterbrain42
// @license      Apache-2.0
// @match        *://*/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=kinopoisk.ru
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_getResourceText
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_notification
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// @connect      www.kinopoisk.ru
// @connect      raw.githubusercontent.com
// ==/UserScript==

(function () {
  "use strict";

  const USERSCRIPT_CSS = ":root[data-kinopoisk-enhanced-loader=\"enabled\"] {\n  --kinopoisk-enhanced-accent: #ff6b00;\n}\n\n.kinopoisk-enhanced__open-button {\n  cursor: pointer;\n}\n\nbutton.kinopoisk-enhanced__open-button[class*=\"style_button__\"] {\n  background: linear-gradient(135deg, #ff7a00, #ffb321);\n  box-shadow: 0 6px 18px rgb(255 122 0 / 22%);\n  color: #15110a;\n  transition: background 0.2s, box-shadow 0.2s, transform 0.2s;\n}\n\nbutton.kinopoisk-enhanced__open-button[class*=\"style_button__\"]:hover {\n  background: linear-gradient(135deg, #ff861f, #ffc24d);\n  box-shadow: 0 8px 24px rgb(255 122 0 / 28%);\n}\n\nbutton.kinopoisk-enhanced__open-button[class*=\"style_button__\"]:active {\n  background: linear-gradient(135deg, #ed6900, #f5a900);\n  transform: translateY(1px);\n}\n\nbutton.kinopoisk-enhanced__open-button:not([class*=\"style_button__\"]) {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  min-height: 52px;\n  margin: 0;\n  padding: 14px 26px;\n  border: 0;\n  border-radius: 52px;\n  background: linear-gradient(135deg, #ff7a00, #ffb321);\n  box-shadow: 0 6px 18px rgb(255 122 0 / 22%);\n  color: #15110a;\n  font: 600 16px/18px \"Graphik Kinopoisk LC Web\", Tahoma, Arial, Verdana, sans-serif;\n  transition: background 0.2s, box-shadow 0.2s, transform 0.2s;\n}\n\n.kinopoisk-enhanced__open-button:focus-visible {\n  outline: 3px solid rgb(255 107 0 / 45%);\n  outline-offset: 3px;\n}\n";
  const DEV_EMBEDDED_RESOURCES = {"KinopoiskEnhancedCore":"(function (global) {\n  \"use strict\";\n\n  const HIDDEN_SELECTORS = [\"div#tgWrapper\", \"div.topAdPad\"];\n  const HEADER_ID = \"kinopoisk-enhanced-core-header\";\n  const FOOTER_ID = \"kinopoisk-enhanced-core-footer\";\n  const KINOPOISK_ORIGIN = \"https://www.kinopoisk.ru\";\n  const STORAGE_PREFIX = \"kinopoisk-enhanced-core\";\n  const CONTROL_BUTTONS_ID = \"kinopoisk-enhanced-core-footer-controls\";\n  const ASPECT_RATIO_OPTIONS = [\n    { value: \"16:9\", label: \"16:9\", cssValue: \"16 / 9\" },\n    { value: \"12:5\", label: \"12:5\", cssValue: \"12 / 5\" },\n    { value: \"4:3\", label: \"4:3\", cssValue: \"4 / 3\" },\n    { value: \"fill\", label: \"Fill\", cssValue: \"\" },\n  ];\n  const SELECTORS = {\n    mainContainer: \".mainContainer\",\n    telegramLink: \".tgMain[href], .tgMain a[href]\",\n    wrapper: \"div.wrapper\",\n  };\n\n  let observer;\n  let layoutRaf;\n  let titlePromise;\n  let mediaTargetTracker;\n  let audioCompressor;\n  let videoEffects;\n  let aspectRatioSelector;\n\nfunction hideElements() {\n  for (const selector of HIDDEN_SELECTORS) {\n    document.querySelectorAll(selector).forEach((element) => {\n      element.hidden = true;\n      element.style.setProperty(\"display\", \"none\", \"important\");\n    });\n  }\n}\n\nfunction getOriginalUrl() {\n  return new URL(window.location.pathname + window.location.search + window.location.hash, KINOPOISK_ORIGIN).href;\n}\n\nfunction getFallbackTitle() {\n  return document.title.trim() || window.location.pathname;\n}\n\nasync function fetchOriginalTitle() {\n  const html = await requestText(getOriginalUrl());\n  const documentFromHtml = new DOMParser().parseFromString(html, \"text/html\");\n  const heading = documentFromHtml.querySelector(\"h1\")?.textContent?.trim();\n  const title = documentFromHtml.querySelector(\"title\")?.textContent?.trim();\n\n  return heading || title || getFallbackTitle();\n}\n\nfunction requestText(url) {\n  if (typeof GM_xmlhttpRequest === \"function\") {\n    return new Promise((resolve, reject) => {\n      GM_xmlhttpRequest({\n        method: \"GET\",\n        url,\n        onload: (response) => resolve(response.responseText),\n        onerror: reject,\n        ontimeout: reject,\n      });\n    });\n  }\n\n  return fetch(url, { credentials: \"omit\" }).then((response) => response.text());\n}\n\nfunction getOriginalTitle() {\n  titlePromise ??= fetchOriginalTitle().catch((error) => {\n    console.warn(\"[Kinopoisk Enhanced] failed to fetch original title\", error);\n    return getFallbackTitle();\n  });\n\n  return titlePromise;\n}\n\nfunction getTelegramUrl() {\n  return document.querySelector(SELECTORS.telegramLink)?.href || \"\";\n}\n\nfunction storageGet(key, fallbackValue) {\n  try {\n    if (typeof GM_getValue === \"function\") {\n      return GM_getValue(`${STORAGE_PREFIX}:${key}`, fallbackValue);\n    }\n  } catch (error) {\n    console.warn(\"[Kinopoisk Enhanced] GM_getValue failed\", error);\n  }\n\n  try {\n    const rawValue = localStorage.getItem(`${STORAGE_PREFIX}:${key}`);\n    return rawValue === null ? fallbackValue : JSON.parse(rawValue);\n  } catch (error) {\n    return fallbackValue;\n  }\n}\n\nfunction storageSet(key, value) {\n  try {\n    if (typeof GM_setValue === \"function\") {\n      GM_setValue(`${STORAGE_PREFIX}:${key}`, value);\n      return;\n    }\n  } catch (error) {\n    console.warn(\"[Kinopoisk Enhanced] GM_setValue failed\", error);\n  }\n\n  try {\n    localStorage.setItem(`${STORAGE_PREFIX}:${key}`, JSON.stringify(value));\n  } catch (error) {\n    console.warn(\"[Kinopoisk Enhanced] localStorage write failed\", error);\n  }\n}\n\nfunction createControlButton({ className = \"\", label, title, onClick }) {\n  const button = document.createElement(\"button\");\n  button.type = \"button\";\n  button.className = [\"kinopoisk-enhanced-core-footer__button\", className].filter(Boolean).join(\" \");\n  button.textContent = label;\n  button.title = title || label;\n  button.addEventListener(\"click\", onClick);\n\n  return button;\n}\n\nfunction isUsableMediaElement(element) {\n  if (!element) {\n    return false;\n  }\n\n  if (element instanceof HTMLVideoElement) {\n    return true;\n  }\n\n  return element instanceof HTMLIFrameElement;\n}\n\nfunction findMediaElement(root) {\n  if (!root) {\n    return null;\n  }\n\n  const directVideo = root.querySelector(\"video\");\n  if (directVideo) {\n    return directVideo;\n  }\n\n  const iframe = root.querySelector(\"iframe\");\n  const iframeVideo = findVideoInsideIframe(iframe);\n  return iframeVideo || iframe;\n}\n\nfunction findVideoInsideIframe(iframe) {\n  if (!(iframe instanceof HTMLIFrameElement)) {\n    return null;\n  }\n\n  try {\n    return iframe.contentDocument?.querySelector(\"video\") || null;\n  } catch (error) {\n    return null;\n  }\n}\n\nfunction findMediaFrame(target, mainContainer) {\n  if (!target) {\n    return null;\n  }\n\n  if (target.ownerDocument !== document) {\n    const ownerIframe = findOwnerIframeForDocument(target.ownerDocument, mainContainer);\n    return findIframeFrame(ownerIframe) || ownerIframe || target;\n  }\n\n  if (target instanceof HTMLIFrameElement) {\n    return findIframeFrame(target) || target;\n  }\n\n  return target.closest(\"video, iframe, [class*='player'], [id*='player']\")\n    || target.parentElement\n    || target;\n}\n\nfunction findIframeFrame(iframe) {\n  if (!(iframe instanceof HTMLIFrameElement)) {\n    return null;\n  }\n\n  return iframe.closest(\"[class*='iframe_container' i], [class*='player' i], [id*='player' i]\")\n    || iframe.parentElement\n    || iframe;\n}\n\nfunction findOwnerIframeForDocument(targetDocument, mainContainer) {\n  if (!targetDocument || !mainContainer) {\n    return null;\n  }\n\n  return Array.from(mainContainer.querySelectorAll(\"iframe\")).find((iframe) => {\n    try {\n      return iframe.contentDocument === targetDocument;\n    } catch (error) {\n      return false;\n    }\n  }) || null;\n}\n\nfunction getAspectRatioOption(value) {\n  return ASPECT_RATIO_OPTIONS.find((option) => option.value === value) || ASPECT_RATIO_OPTIONS[0];\n}\n\nclass MediaTargetTracker {\n  constructor() {\n    this.mainContainer = null;\n    this.currentTarget = null;\n    this.observer = null;\n    this.iframeObserver = null;\n    this.observedIframe = null;\n    this.observedIframeBody = null;\n    this.subscribers = new Set();\n    this.syncTimer = null;\n    this.initialized = false;\n    this.iframeLoadHandler = () => this.scheduleSync();\n    this.visibilityHandler = () => {\n      if (!document.hidden) {\n        this.scheduleSync();\n      }\n    };\n  }\n\n  subscribe(callback) {\n    this.subscribers.add(callback);\n    callback(this.currentTarget, this.mainContainer);\n\n    return () => this.subscribers.delete(callback);\n  }\n\n  init() {\n    if (this.initialized) {\n      this.scheduleSync();\n      return;\n    }\n\n    this.initialized = true;\n    this.sync();\n    document.addEventListener(\"visibilitychange\", this.visibilityHandler);\n  }\n\n  scheduleSync() {\n    if (this.syncTimer) {\n      return;\n    }\n\n    this.syncTimer = window.setTimeout(() => {\n      this.syncTimer = null;\n      this.sync();\n    }, 80);\n  }\n\n  ensureObserver(mainContainer) {\n    if (this.mainContainer === mainContainer && this.observer) {\n      return;\n    }\n\n    this.observer?.disconnect();\n    this.mainContainer = mainContainer;\n    this.observer = null;\n\n    if (!mainContainer) {\n      return;\n    }\n\n    this.observer = new MutationObserver(() => this.scheduleSync());\n    this.observer.observe(mainContainer, {\n      childList: true,\n      subtree: true,\n    });\n  }\n\n  ensureIframeObserver(mainContainer) {\n    const iframe = mainContainer?.querySelector(\"iframe\") || null;\n\n    if (this.observedIframe && this.observedIframe !== iframe) {\n      this.observedIframe.removeEventListener(\"load\", this.iframeLoadHandler);\n      this.observedIframe = null;\n    }\n\n    if (iframe && this.observedIframe !== iframe) {\n      this.observedIframe = iframe;\n      iframe.addEventListener(\"load\", this.iframeLoadHandler);\n    }\n\n    let iframeBody = null;\n    try {\n      iframeBody = iframe?.contentDocument?.body || null;\n    } catch (error) {\n      iframeBody = null;\n    }\n\n    if (this.observedIframeBody === iframeBody) {\n      return;\n    }\n\n    this.iframeObserver?.disconnect();\n    this.iframeObserver = null;\n    this.observedIframeBody = iframeBody;\n\n    if (!iframeBody) {\n      return;\n    }\n\n    this.iframeObserver = new MutationObserver(() => this.scheduleSync());\n    this.iframeObserver.observe(iframeBody, {\n      childList: true,\n      subtree: true,\n    });\n  }\n\n  sync() {\n    const mainContainer = document.querySelector(SELECTORS.mainContainer);\n    this.ensureObserver(mainContainer);\n    this.ensureIframeObserver(mainContainer);\n\n    const nextTarget = findMediaElement(mainContainer);\n    if (nextTarget === this.currentTarget) {\n      return;\n    }\n\n    const previousTarget = this.currentTarget;\n    this.currentTarget = isUsableMediaElement(nextTarget) ? nextTarget : null;\n    this.subscribers.forEach((callback) => callback(this.currentTarget, mainContainer, previousTarget));\n  }\n}\n\nclass VideoEffects {\n  constructor(tracker) {\n    this.blurEnabled = storageGet(\"video-blur-enabled\", false);\n    this.mirrorEnabled = storageGet(\"video-mirror-enabled\", false);\n    this.target = null;\n    this.blurButton = null;\n    this.mirrorButton = null;\n    tracker.subscribe((target, mainContainer, previousTarget) => this.setTarget(target, mainContainer, previousTarget));\n  }\n\n  mount(parent) {\n    this.blurButton = createControlButton({\n      className: \"kinopoisk-enhanced-core-footer__button--icon\",\n      label: \"Blur\",\n      title: \"Размытие видео: выкл\",\n      onClick: () => this.toggleBlur(),\n    });\n    this.mirrorButton = createControlButton({\n      className: \"kinopoisk-enhanced-core-footer__button--icon\",\n      label: \"Mirror\",\n      title: \"Зеркало видео: выкл\",\n      onClick: () => this.toggleMirror(),\n    });\n    parent.append(this.blurButton, this.mirrorButton);\n    this.updateButtons();\n  }\n\n  setTarget(target, mainContainer, previousTarget) {\n    const previousFrame = findMediaFrame(previousTarget, mainContainer);\n    previousTarget?.classList.remove(\n      \"kinopoisk-enhanced-core-media--blur\",\n      \"kinopoisk-enhanced-core-media--mirror\",\n    );\n    previousFrame?.classList.remove(\n      \"kinopoisk-enhanced-core-media--blur\",\n      \"kinopoisk-enhanced-core-media--mirror\",\n    );\n    this.target = target;\n    this.frame = findMediaFrame(target, mainContainer);\n    this.apply();\n    this.updateButtons();\n  }\n\n  toggleBlur() {\n    this.blurEnabled = !this.blurEnabled;\n    storageSet(\"video-blur-enabled\", this.blurEnabled);\n    this.apply();\n    this.updateButtons();\n  }\n\n  toggleMirror() {\n    this.mirrorEnabled = !this.mirrorEnabled;\n    storageSet(\"video-mirror-enabled\", this.mirrorEnabled);\n    this.apply();\n    this.updateButtons();\n  }\n\n  apply() {\n    if (!this.target) {\n      return;\n    }\n\n    const visualTarget = this.frame || this.target;\n\n    this.target.classList.toggle(\"kinopoisk-enhanced-core-media--blur\", this.blurEnabled && !this.frame);\n    this.target.classList.toggle(\"kinopoisk-enhanced-core-media--mirror\", this.mirrorEnabled && !this.frame);\n    visualTarget?.classList.toggle(\"kinopoisk-enhanced-core-media--blur\", this.blurEnabled);\n    visualTarget?.classList.toggle(\"kinopoisk-enhanced-core-media--mirror\", this.mirrorEnabled);\n  }\n\n  updateButtons() {\n    const hasTarget = !!this.target;\n    if (this.blurButton) {\n      this.blurButton.disabled = !hasTarget;\n      this.blurButton.classList.toggle(\"kinopoisk-enhanced-core-footer__button--active\", this.blurEnabled);\n      this.blurButton.title = `Размытие видео: ${this.blurEnabled ? \"вкл\" : \"выкл\"}`;\n    }\n\n    if (this.mirrorButton) {\n      this.mirrorButton.disabled = !hasTarget;\n      this.mirrorButton.classList.toggle(\"kinopoisk-enhanced-core-footer__button--active\", this.mirrorEnabled);\n      this.mirrorButton.title = `Зеркало видео: ${this.mirrorEnabled ? \"вкл\" : \"выкл\"}`;\n    }\n  }\n}\n\nclass AspectRatioSelector {\n  constructor(tracker) {\n    this.mode = getAspectRatioOption(storageGet(\"aspect-ratio-mode\", \"native\")).value;\n    this.target = null;\n    this.frame = null;\n    this.mainContainer = null;\n    this.button = null;\n    tracker.subscribe((target, mainContainer, previousTarget) => this.setTarget(target, mainContainer, previousTarget));\n  }\n\n  mount(parent) {\n    this.button = createControlButton({\n      className: \"kinopoisk-enhanced-core-footer__button--aspect\",\n      label: getAspectRatioOption(this.mode).label,\n      title: \"Соотношение сторон плеера\",\n      onClick: () => this.nextMode(),\n    });\n    parent.append(this.button);\n    this.updateButton();\n  }\n\n  setTarget(target, mainContainer, previousTarget) {\n    this.cleanupTarget(previousTarget, findMediaFrame(previousTarget, mainContainer));\n    this.target = target;\n    this.frame = findMediaFrame(target, mainContainer);\n    this.mainContainer = mainContainer;\n    this.apply();\n    this.updateButton();\n  }\n\n  nextMode() {\n    const currentIndex = ASPECT_RATIO_OPTIONS.findIndex((option) => option.value === this.mode);\n    const nextOption = ASPECT_RATIO_OPTIONS[(currentIndex + 1) % ASPECT_RATIO_OPTIONS.length];\n    this.mode = nextOption.value;\n    storageSet(\"aspect-ratio-mode\", this.mode);\n    this.apply();\n    this.updateButton();\n  }\n\n  cleanupTarget(target, frame = this.frame) {\n    for (const element of [target, frame].filter(Boolean)) {\n      element.classList.remove(\n        \"kinopoisk-enhanced-core-media--aspect-managed\",\n        \"kinopoisk-enhanced-core-media--aspect-fill\",\n        \"kinopoisk-enhanced-core-media-frame\",\n      );\n      element.style.removeProperty(\"--kinopoisk-enhanced-core-player-aspect-ratio\");\n    }\n  }\n\n  apply() {\n    if (!this.target && !this.frame) {\n      return;\n    }\n\n    const option = getAspectRatioOption(this.mode);\n    const frame = this.frame || this.target;\n    this.cleanupTarget(this.target, frame);\n\n    frame.classList.add(\"kinopoisk-enhanced-core-media-frame\");\n    frame.style.setProperty(\"--kinopoisk-enhanced-core-player-aspect-ratio\", option.cssValue || \"16 / 9\");\n    this.target?.classList.add(\"kinopoisk-enhanced-core-media--aspect-managed\");\n\n    if (option.value === \"fill\") {\n      frame.classList.add(\"kinopoisk-enhanced-core-media--aspect-fill\");\n      this.target?.classList.add(\"kinopoisk-enhanced-core-media--aspect-fill\");\n      this.mainContainer?.classList.add(\"kinopoisk-enhanced-core-main--fill-media\");\n      return;\n    }\n\n    this.mainContainer?.classList.remove(\"kinopoisk-enhanced-core-main--fill-media\");\n  }\n\n  updateButton() {\n    if (!this.button) {\n      return;\n    }\n\n    const option = getAspectRatioOption(this.mode);\n    this.button.disabled = !this.target && !this.frame;\n    this.button.textContent = option.label;\n    this.button.classList.add(\"kinopoisk-enhanced-core-footer__button--active\");\n    this.button.title = `Соотношение сторон: ${option.label}`;\n  }\n}\n\nclass AudioCompressor {\n  constructor(tracker) {\n    this.enabled = storageGet(\"audio-compressor-enabled\", false);\n    this.target = null;\n    this.state = null;\n    this.button = null;\n    tracker.subscribe((target) => this.setTarget(target instanceof HTMLVideoElement ? target : null));\n  }\n\n  mount(parent) {\n    this.button = createControlButton({\n      className: \"kinopoisk-enhanced-core-footer__button--icon\",\n      label: \"Comp\",\n      title: \"Аудио-компрессор: выкл\",\n      onClick: () => this.toggle(true),\n    });\n    parent.append(this.button);\n    this.updateButton();\n  }\n\n  setTarget(target) {\n    if (target === this.target) {\n      return;\n    }\n\n    this.disconnect();\n    this.target = target;\n\n    if (this.enabled) {\n      this.ensureState();\n      void this.apply(false);\n    }\n\n    this.updateButton();\n  }\n\n  isSupported() {\n    return !!(\n      this.target &&\n      (window.AudioContext || window.webkitAudioContext) &&\n      window.MediaElementAudioSourceNode &&\n      window.DynamicsCompressorNode &&\n      window.GainNode\n    );\n  }\n\n  ensureState() {\n    if (this.state || !this.isSupported()) {\n      return this.state;\n    }\n\n    try {\n      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;\n      const context = new AudioContextCtor();\n      const source = new MediaElementAudioSourceNode(context, { mediaElement: this.target });\n      const compressor = new DynamicsCompressorNode(context, {\n        threshold: -28,\n        knee: 24,\n        ratio: 4,\n        attack: 0.006,\n        release: 0.22,\n      });\n      const gain = new GainNode(context, { gain: 1.08 });\n\n      source.connect(context.destination);\n      this.state = { context, source, compressor, gain, active: false };\n    } catch (error) {\n      console.warn(\"[Kinopoisk Enhanced] audio compressor unavailable for this video\", error);\n      this.enabled = false;\n      storageSet(\"audio-compressor-enabled\", false);\n      this.state = null;\n    }\n\n    return this.state;\n  }\n\n  disconnectNodes() {\n    if (!this.state) {\n      return;\n    }\n\n    for (const [node, target] of [\n      [this.state.source, this.state.context.destination],\n      [this.state.source, this.state.compressor],\n      [this.state.compressor, this.state.gain],\n      [this.state.gain, this.state.context.destination],\n    ]) {\n      try {\n        node.disconnect(target);\n      } catch (error) {\n        // Nodes can legitimately be disconnected already after player swaps.\n      }\n    }\n  }\n\n  async apply(fromUserGesture = false) {\n    const state = this.ensureState();\n    if (!state) {\n      this.updateButton();\n      return;\n    }\n\n    this.disconnectNodes();\n\n    if (this.enabled) {\n      state.source.connect(state.compressor);\n      state.compressor.connect(state.gain);\n      state.gain.connect(state.context.destination);\n      state.active = true;\n\n      if (fromUserGesture && state.context.state === \"suspended\") {\n        try {\n          await state.context.resume();\n        } catch (error) {\n          console.warn(\"[Kinopoisk Enhanced] failed to resume AudioContext\", error);\n        }\n      }\n    } else {\n      state.source.connect(state.context.destination);\n      state.active = false;\n    }\n\n    this.updateButton();\n  }\n\n  disconnect() {\n    if (!this.state) {\n      return;\n    }\n\n    this.disconnectNodes();\n    try {\n      this.state.source.connect(this.state.context.destination);\n    } catch (error) {\n      // The old media element can disappear while a player is being replaced.\n    }\n    this.state = null;\n  }\n\n  toggle(fromUserGesture = false) {\n    this.enabled = !this.enabled;\n    storageSet(\"audio-compressor-enabled\", this.enabled);\n    void this.apply(fromUserGesture);\n    this.updateButton();\n  }\n\n  updateButton() {\n    if (!this.button) {\n      return;\n    }\n\n    const available = this.isSupported() || !!this.state;\n    this.button.disabled = !available;\n    this.button.classList.toggle(\"kinopoisk-enhanced-core-footer__button--active\", this.enabled);\n    this.button.title = available\n      ? `Аудио-компрессор: ${this.enabled ? \"вкл\" : \"выкл\"}`\n      : \"Аудио-компрессор доступен только для video в текущем документе\";\n  }\n}\n\nfunction createActionLink({ className = \"\", href, text }) {\n  const link = document.createElement(\"a\");\n  link.className = [\"kinopoisk-enhanced-core-header__action\", className].filter(Boolean).join(\" \");\n  link.href = href;\n  link.textContent = text;\n\n  return link;\n}\n\nfunction createHeader() {\n  const header = document.createElement(\"section\");\n  const info = document.createElement(\"div\");\n  const title = document.createElement(\"a\");\n  const path = document.createElement(\"a\");\n  const actions = document.createElement(\"div\");\n  const shelterLink = createActionLink({\n    className: \"kinopoisk-enhanced-core-header__action--shelter\",\n    href: getTelegramUrl() || \"#\",\n    text: \"убежище\",\n  });\n  const returnLink = createActionLink({\n    className: \"kinopoisk-enhanced-core-header__action--return\",\n    href: getOriginalUrl(),\n    text: \"вернуться\",\n  });\n\n  header.id = HEADER_ID;\n  header.className = \"kinopoisk-enhanced-core-header\";\n  info.className = \"kinopoisk-enhanced-core-header__info\";\n  title.className = \"kinopoisk-enhanced-core-header__title\";\n  title.href = getOriginalUrl();\n  title.textContent = getFallbackTitle();\n  path.className = \"kinopoisk-enhanced-core-header__path\";\n  path.href = getOriginalUrl();\n  path.textContent = getOriginalUrl();\n  actions.className = \"kinopoisk-enhanced-core-header__actions\";\n\n  if (!getTelegramUrl()) {\n    shelterLink.hidden = true;\n  }\n\n  getOriginalTitle().then((originalTitle) => {\n    const currentTitle = header.querySelector(\".kinopoisk-enhanced-core-header__title\");\n\n    if (currentTitle) {\n      currentTitle.textContent = originalTitle;\n    }\n  });\n\n  info.append(title, path);\n  actions.append(shelterLink, returnLink);\n  header.append(info, actions);\n\n  return header;\n}\n\nfunction syncHeader() {\n  const wrapper = document.querySelector(SELECTORS.wrapper);\n\n  if (!wrapper) {\n    return;\n  }\n\n  const existingHeader = document.getElementById(HEADER_ID) || createHeader();\n  const shelterLink = existingHeader.querySelector(\".kinopoisk-enhanced-core-header__action--shelter\");\n  const telegramUrl = getTelegramUrl();\n\n  if (shelterLink) {\n    shelterLink.hidden = !telegramUrl;\n    shelterLink.href = telegramUrl || \"#\";\n  }\n\n  if (wrapper.firstElementChild !== existingHeader) {\n    wrapper.prepend(existingHeader);\n  }\n}\n\nfunction createFooter() {\n  const footer = document.createElement(\"section\");\n  const status = document.createElement(\"span\");\n  const controlsNode = document.createElement(\"div\");\n\n  footer.id = FOOTER_ID;\n  footer.className = \"kinopoisk-enhanced-core-footer\";\n  status.className = \"kinopoisk-enhanced-core-footer__status\";\n  status.textContent = \"Player tools\";\n  controlsNode.id = CONTROL_BUTTONS_ID;\n  controlsNode.className = \"kinopoisk-enhanced-core-footer__controls\";\n  footer.append(status, controlsNode);\n\n  return footer;\n}\n\nfunction syncFooter() {\n  const mainContainer = document.querySelector(SELECTORS.mainContainer);\n\n  if (!mainContainer) {\n    return;\n  }\n\n  const existingFooter = document.getElementById(FOOTER_ID) || createFooter();\n\n  if (mainContainer.nextElementSibling !== existingFooter) {\n    mainContainer.insertAdjacentElement(\"afterend\", existingFooter);\n  }\n\n  mountFooterControls(existingFooter);\n}\n\nfunction mountFooterControls(footer) {\n  const controlsNode = footer.querySelector(`#${CONTROL_BUTTONS_ID}`);\n\n  if (!controlsNode || controlsNode.dataset.mounted === \"true\") {\n    return;\n  }\n\n  controlsNode.dataset.mounted = \"true\";\n  controlsNode.textContent = \"\";\n\n  const primaryGroup = document.createElement(\"div\");\n  const secondaryGroup = document.createElement(\"div\");\n  primaryGroup.className = \"kinopoisk-enhanced-core-footer__group\";\n  secondaryGroup.className = \"kinopoisk-enhanced-core-footer__group\";\n  controlsNode.append(primaryGroup, secondaryGroup);\n\n  mediaTargetTracker ??= new MediaTargetTracker();\n  audioCompressor ??= new AudioCompressor(mediaTargetTracker);\n  videoEffects ??= new VideoEffects(mediaTargetTracker);\n  aspectRatioSelector ??= new AspectRatioSelector(mediaTargetTracker);\n\n  audioCompressor.mount(primaryGroup);\n  videoEffects.mount(primaryGroup);\n  aspectRatioSelector.mount(secondaryGroup);\n  mediaTargetTracker.init();\n}\n\nfunction syncLayout() {\n  syncHeader();\n  syncFooter();\n}\n\nfunction observePageChanges() {\n  observer?.disconnect();\n  observer = new MutationObserver(() => {\n    if (layoutRaf) {\n      return;\n    }\n\n    layoutRaf = requestAnimationFrame(() => {\n      layoutRaf = null;\n      hideElements();\n      syncLayout();\n    });\n  });\n  observer.observe(document.body, {\n    childList: true,\n    subtree: true,\n  });\n}\n\nfunction run(context = {}) {\n  if (document.documentElement.dataset.kinopoiskEnhancedCore === \"enabled\") {\n    return;\n  }\n\n  document.documentElement.dataset.kinopoiskEnhancedCore = \"enabled\";\n  hideElements();\n  syncLayout();\n  mediaTargetTracker?.init();\n  observePageChanges();\n  console.info(\"[Kinopoisk Enhanced] core initialized\", context);\n}\n\n  const api = {\n    run,\n  };\n\n  global.KinopoiskEnhancedCore = api;\n\n  if (typeof window !== \"undefined\") {\n    window.KinopoiskEnhancedCore = api;\n  }\n})(typeof globalThis !== \"undefined\" ? globalThis : window);\n","KinopoiskEnhancedCoreCss":":root[data-kinopoisk-enhanced-core=\"enabled\"] {\n  --kinopoisk-enhanced-core-ready: 1;\n  --kinopoisk-enhanced-core-header-height: 72px;\n  --kinopoisk-enhanced-core-footer-height: 56px;\n}\n\ndiv#tgWrapper,\ndiv.topAdPad {\n  display: none !important;\n}\n\n.kinopoisk-enhanced-core-header {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 18px;\n  box-sizing: border-box;\n  height: var(--kinopoisk-enhanced-core-header-height);\n  margin: 0;\n  padding: 14px 16px;\n  border: 1px solid rgb(255 255 255 / 10%);\n  border-radius: 0;\n  background:\n    radial-gradient(circle at top left, rgb(255 122 0 / 20%), transparent 32%),\n    linear-gradient(135deg, rgb(24 25 30 / 96%), rgb(12 13 16 / 96%));\n  box-shadow: 0 14px 38px rgb(0 0 0 / 24%);\n  color: #fff;\n}\n\n.mainContainer {\n  box-sizing: border-box;\n  height: calc(\n    100vh -\n      var(--kinopoisk-enhanced-core-header-height) -\n      var(--kinopoisk-enhanced-core-footer-height)\n  ) !important;\n  min-height: 0 !important;\n  overflow: auto;\n}\n\n.kinopoisk-enhanced-core-header__info {\n  min-width: 0;\n}\n\n.kinopoisk-enhanced-core-header__title,\n.kinopoisk-enhanced-core-header__path {\n  display: block;\n  overflow: hidden;\n  text-decoration: none;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.kinopoisk-enhanced-core-header__title {\n  color: #fff;\n  font: 700 18px/1.25 Arial, sans-serif;\n}\n\n.kinopoisk-enhanced-core-header__path {\n  margin-top: 4px;\n  color: rgb(255 255 255 / 58%);\n  font: 400 13px/1.35 Arial, sans-serif;\n}\n\n.kinopoisk-enhanced-core-header__actions {\n  display: flex;\n  flex: 0 0 auto;\n  align-items: center;\n  gap: 10px;\n}\n\n.kinopoisk-enhanced-core-header__action {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  min-height: 38px;\n  padding: 0 16px;\n  border-radius: 999px;\n  background: rgb(255 255 255 / 10%);\n  color: #fff;\n  font: 700 14px/1.2 Arial, sans-serif;\n  text-decoration: none;\n}\n\n.kinopoisk-enhanced-core-header__action:hover {\n  background: rgb(255 255 255 / 16%);\n}\n\n.kinopoisk-enhanced-core-header__action--shelter {\n  background: linear-gradient(135deg, #2aabee, #229ed9);\n  color: #fff;\n}\n\n.kinopoisk-enhanced-core-header__action--shelter:hover {\n  background: linear-gradient(135deg, #36b7f5, #2aa7e4);\n}\n\n.kinopoisk-enhanced-core-header__action--return {\n  background: linear-gradient(135deg, #ff7a00, #ffb321);\n  color: #15110a;\n}\n\n.kinopoisk-enhanced-core-header__action--return:hover {\n  background: linear-gradient(135deg, #ff861f, #ffc24d);\n}\n\n.kinopoisk-enhanced-core-footer {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 14px;\n  box-sizing: border-box;\n  height: var(--kinopoisk-enhanced-core-footer-height);\n  margin: 0;\n  padding: 9px 16px;\n  border-top: 1px solid rgb(255 255 255 / 10%);\n  background:\n    radial-gradient(circle at 12% 0, rgb(255 122 0 / 14%), transparent 30%),\n    linear-gradient(135deg, rgb(12 13 16 / 98%), rgb(24 25 30 / 98%));\n  color: rgb(255 255 255 / 70%);\n}\n\n.kinopoisk-enhanced-core-footer__status {\n  flex: 0 1 auto;\n  overflow: hidden;\n  color: rgb(255 255 255 / 58%);\n  font: 800 11px/1.2 Arial, sans-serif;\n  letter-spacing: 0.04em;\n  text-overflow: ellipsis;\n  text-transform: uppercase;\n  white-space: nowrap;\n}\n\n.kinopoisk-enhanced-core-footer__controls {\n  display: flex;\n  flex: 0 0 auto;\n  align-items: center;\n  justify-content: flex-end;\n  gap: 12px;\n  min-width: 0;\n}\n\n.kinopoisk-enhanced-core-footer__group {\n  display: inline-flex;\n  align-items: center;\n  gap: 8px;\n}\n\n.kinopoisk-enhanced-core-footer__group + .kinopoisk-enhanced-core-footer__group {\n  padding-left: 12px;\n  border-left: 1px solid rgb(255 255 255 / 10%);\n}\n\n.kinopoisk-enhanced-core-footer__button {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  box-sizing: border-box;\n  min-width: 58px;\n  height: 36px;\n  padding: 0 12px;\n  border: 1px solid rgb(255 255 255 / 10%);\n  border-radius: 999px;\n  background: rgb(255 255 255 / 8%);\n  color: rgb(255 255 255 / 74%);\n  cursor: pointer;\n  font: 800 12px/1 Arial, sans-serif;\n  letter-spacing: 0.02em;\n  transition:\n    background 0.16s ease,\n    border-color 0.16s ease,\n    color 0.16s ease,\n    transform 0.16s ease;\n}\n\n.kinopoisk-enhanced-core-footer__button:hover {\n  border-color: rgb(255 179 33 / 42%);\n  background: rgb(255 255 255 / 13%);\n  color: #fff;\n}\n\n.kinopoisk-enhanced-core-footer__button:active {\n  transform: translateY(1px);\n}\n\n.kinopoisk-enhanced-core-footer__button:focus-visible {\n  outline: 3px solid rgb(255 122 0 / 34%);\n  outline-offset: 2px;\n}\n\n.kinopoisk-enhanced-core-footer__button:disabled {\n  border-color: rgb(255 255 255 / 6%);\n  background: rgb(255 255 255 / 4%);\n  color: rgb(255 255 255 / 28%);\n  cursor: not-allowed;\n  transform: none;\n}\n\n.kinopoisk-enhanced-core-footer__button--active {\n  border-color: rgb(255 179 33 / 48%);\n  background: linear-gradient(135deg, rgb(255 122 0 / 92%), rgb(255 179 33 / 92%));\n  color: #15110a;\n  box-shadow: 0 8px 22px rgb(255 122 0 / 18%);\n}\n\n.kinopoisk-enhanced-core-footer__button--active:hover {\n  color: #15110a;\n}\n\n.kinopoisk-enhanced-core-footer__button--icon {\n  min-width: 64px;\n}\n\n.kinopoisk-enhanced-core-footer__button--aspect {\n  min-width: 68px;\n  font-variant-numeric: tabular-nums;\n}\n\n.kinopoisk-enhanced-core-media--blur {\n  filter: blur(50px) !important;\n}\n\n.kinopoisk-enhanced-core-media--mirror {\n  transform: scaleX(-1) !important;\n  transform-origin: center !important;\n}\n\n.kinopoisk-enhanced-core-media--blur.kinopoisk-enhanced-core-media--mirror {\n  filter: blur(50px) !important;\n  transform: scaleX(-1) !important;\n  transform-origin: center !important;\n}\n\n.kinopoisk-enhanced-core-media-frame {\n  display: flex !important;\n  align-items: center !important;\n  justify-content: center !important;\n  box-sizing: border-box !important;\n  width: 100% !important;\n  max-width: 100% !important;\n  height: auto !important;\n  max-height: 100% !important;\n  aspect-ratio: var(--kinopoisk-enhanced-core-player-aspect-ratio) !important;\n  margin-inline: auto !important;\n  overflow: hidden !important;\n}\n\n.kinopoisk-enhanced-core-media--aspect-managed {\n  display: block !important;\n  width: 100% !important;\n  height: 100% !important;\n  max-width: 100% !important;\n  max-height: 100% !important;\n  object-fit: contain !important;\n}\n\n.kinopoisk-enhanced-core-media--aspect-fill {\n  width: 100% !important;\n  height: 100% !important;\n  aspect-ratio: auto !important;\n  object-fit: fill !important;\n}\n\n.mainContainer.kinopoisk-enhanced-core-main--fill-media {\n  overflow: hidden;\n}\n\n@media (max-width: 720px) {\n  :root[data-kinopoisk-enhanced-core=\"enabled\"] {\n    --kinopoisk-enhanced-core-header-height: 116px;\n    --kinopoisk-enhanced-core-footer-height: 104px;\n  }\n\n  .kinopoisk-enhanced-core-header {\n    align-items: stretch;\n    flex-direction: column;\n  }\n\n  .kinopoisk-enhanced-core-header__actions {\n    width: 100%;\n  }\n\n  .kinopoisk-enhanced-core-header__action {\n    flex: 1 1 0;\n  }\n\n  .kinopoisk-enhanced-core-footer {\n    align-items: stretch;\n    flex-direction: column;\n    justify-content: center;\n  }\n\n  .kinopoisk-enhanced-core-footer__controls {\n    justify-content: flex-start;\n    overflow-x: auto;\n    padding-bottom: 2px;\n  }\n\n  .kinopoisk-enhanced-core-footer__button {\n    flex: 0 0 auto;\n  }\n}\n"};

  function injectStyles(css) {
    if (!css.trim()) {
      return;
    }

    const style = document.createElement("style");
    style.dataset.kinopoiskEnhanced = "styles";
    style.textContent = css;
    document.head.append(style);
  }

  function getDevResourceText(resourceName) {
    if (Object.prototype.hasOwnProperty.call(DEV_EMBEDDED_RESOURCES, resourceName)) {
      return DEV_EMBEDDED_RESOURCES[resourceName];
    }

    if (typeof GM_getResourceText === "function") {
      return GM_getResourceText(resourceName);
    }

    return "";
  }

  injectStyles(USERSCRIPT_CSS);
  const GM_getResourceText = getDevResourceText;
  const APP_ID = "kinopoisk-enhanced";
  const FEATURE_BUTTON_ID = `${APP_ID}-watch`;
  const FEATURE_BUTTON_WRAPPER_ID = `${APP_ID}-watch-wrapper`;
  const CORE_HOSTS_STORAGE_KEY = `${APP_ID}:core-hosts`;
  const CORE_RESOURCE_NAME = "KinopoiskEnhancedCore";
  const CORE_CSS_RESOURCE_NAME = "KinopoiskEnhancedCoreCss";
  const CORE_SCRIPT_URL = "https://raw.githubusercontent.com/EnterBrain/kinopoisk_enhanced/main/dist/kinopoisk-enhanced-core.js";
  const CORE_CSS_URL = "https://raw.githubusercontent.com/EnterBrain/kinopoisk_enhanced/main/dist/kinopoisk-enhanced-core.css";
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
  let coreLoadPromise;
  
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
    if (!isCoreHost()) {
      return;
    }
  
    void loadCore({
      appId: APP_ID,
      host: normalizeHost(window.location.hostname),
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
})();
