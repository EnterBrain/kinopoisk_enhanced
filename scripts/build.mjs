import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");
const distDir = path.join(rootDir, "dist");
const packageJson = JSON.parse(
  await readFile(path.join(rootDir, "package.json"), "utf8"),
);

const targets = [
  {
    name: "core",
    sourceDir: path.join(rootDir, "src", "core"),
    outputFile: path.join(distDir, "kinopoisk-enhanced-core.js"),
    cssOutputFile: path.join(distDir, "kinopoisk-enhanced-core.css"),
    plainScript: true,
  },
  {
    name: "loader",
    sourceDir: path.join(rootDir, "src", "loader"),
    outputFile: path.join(distDir, "kinopoisk-enhanced-loader.user.js"),
  },
  {
    name: "dev",
    sourceDir: path.join(rootDir, "src", "loader"),
    outputFile: path.join(distDir, "kinopoisk-enhanced-dev.user.js"),
    devBundle: true,
    embeddedCore: path.join(rootDir, "src", "core"),
  },
];

function toMetadataLines(meta) {
  const resolvedMeta = {
    ...meta,
    version: packageJson.version,
  };

  const lines = ["// ==UserScript=="];

  for (const [key, value] of Object.entries(resolvedMeta)) {
    const values = Array.isArray(value) ? value : [value];

    for (const item of values) {
      lines.push(`// @${key.padEnd(12)} ${item}`);
    }
  }

  lines.push("// ==/UserScript==");
  return lines.join("\n");
}

function withoutMetadataKeys(meta, keys) {
  const nextMeta = { ...meta };

  for (const key of keys) {
    delete nextMeta[key];
  }

  return nextMeta;
}

function indent(source, size = 2) {
  const prefix = " ".repeat(size);

  return source
    .trim()
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

async function readModule(sourceDir) {
  const metadata = JSON.parse(await readFile(path.join(sourceDir, "meta.json"), "utf8"));
  const styles = await readFile(path.join(sourceDir, "styles.css"), "utf8");
  const source = await readFile(path.join(sourceDir, "main.js"), "utf8");

  return { metadata, styles, source };
}

function buildOutput({ metadata, styles, source }) {
  const banner = toMetadataLines(metadata);
  const wrappedStyles = JSON.stringify(styles);

  return `${banner}

(function () {
  "use strict";

  const USERSCRIPT_CSS = ${wrappedStyles};

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
${indent(source)}
})();
`;
}

function buildPlainScript({ source }) {
  return `${source.trim()}\n`;
}

function buildDevBundle({ metadata, styles, source, embeddedCore }) {
  const devMetadata = {
    ...withoutMetadataKeys(metadata, ["resource", "connect"]),
    name: `${metadata.name} Dev`,
    description: `${metadata.description} Dev-монолит с embedded core для локального тестирования.`,
    connect: metadata.connect,
  };
  const banner = toMetadataLines(devMetadata);
  const wrappedStyles = JSON.stringify(styles);
  const embeddedResources = JSON.stringify({
    KinopoiskEnhancedCore: embeddedCore.source,
    KinopoiskEnhancedCoreCss: embeddedCore.styles,
  });

  return `${banner}

(function () {
  "use strict";

  const USERSCRIPT_CSS = ${wrappedStyles};
  const DEV_EMBEDDED_RESOURCES = ${embeddedResources};

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
${indent(source)}
})();
`;
}

await mkdir(distDir, { recursive: true });

for (const target of targets) {
  const module = await readModule(target.sourceDir);
  const embeddedCore = target.embeddedCore ? await readModule(target.embeddedCore) : null;
  const output = target.plainScript
    ? buildPlainScript({ source: module.source })
    : target.devBundle
      ? buildDevBundle({
          metadata: module.metadata,
          styles: module.styles,
          source: module.source,
          embeddedCore,
        })
    : buildOutput({
        metadata: module.metadata,
        styles: module.styles,
        source: module.source,
      });

  await writeFile(target.outputFile, output);
  console.info(`Built ${path.relative(rootDir, target.outputFile)}`);

  if (target.cssOutputFile) {
    await writeFile(target.cssOutputFile, module.styles);
    console.info(`Built ${path.relative(rootDir, target.cssOutputFile)}`);
  }
}
