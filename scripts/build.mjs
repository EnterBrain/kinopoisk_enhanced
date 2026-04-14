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
    outputFile: path.join(distDir, "kinopoisk-enhanced-core.user.js"),
  },
  {
    name: "loader",
    sourceDir: path.join(rootDir, "src", "loader"),
    outputFile: path.join(distDir, "kinopoisk-enhanced-loader.user.js"),
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

function buildOutput({ metadata, styles, source, embeddedCore }) {
  const banner = toMetadataLines(metadata);
  const wrappedStyles = JSON.stringify(styles);
  const coreBlock = embeddedCore
    ? `
  function loadEmbeddedCore(context) {
    const CORE_CSS = ${JSON.stringify(embeddedCore.styles)};

    function injectCoreStyles(css) {
      if (!css.trim() || document.querySelector("style[data-kinopoisk-enhanced-core-styles]")) {
        return;
      }

      const style = document.createElement("style");
      style.dataset.kinopoiskEnhancedCoreStyles = "true";
      style.textContent = css;
      document.head.append(style);
    }

    injectCoreStyles(CORE_CSS);

${indent(embeddedCore.source)}

    window.KinopoiskEnhancedCore?.run(context);
  }
`
    : "";

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
${coreBlock}
${indent(source)}
})();
`;
}

await mkdir(distDir, { recursive: true });

for (const target of targets) {
  const module = await readModule(target.sourceDir);
  const embeddedCore = target.embeddedCore ? await readModule(target.embeddedCore) : null;
  const output = buildOutput({
    metadata: module.metadata,
    styles: module.styles,
    source: module.source,
    embeddedCore,
  });

  await writeFile(target.outputFile, output);
  console.info(`Built ${path.relative(rootDir, target.outputFile)}`);
}
