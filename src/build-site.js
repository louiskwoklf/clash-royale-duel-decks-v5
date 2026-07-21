#!/usr/bin/env node

"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const { getCardCatalog } = require("./card-catalog");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const CATALOG_MARKER = "/*__CARD_CATALOG__*/ []";

async function buildSite() {
  const workerTemplate = await fs.readFile(path.join(__dirname, "site-worker.js"), "utf8");
  if (!workerTemplate.includes(CATALOG_MARKER)) {
    throw new Error("The site worker is missing its card-catalog marker.");
  }

  const worker = workerTemplate.replace(CATALOG_MARKER, JSON.stringify(getCardCatalog()));

  await fs.rm(DIST, { recursive: true, force: true });
  await fs.mkdir(path.join(DIST, "server"), { recursive: true });
  await fs.cp(path.join(ROOT, "public"), path.join(DIST, "client"), { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(DIST, "server", "index.js"), worker, "utf8"),
    fs.writeFile(path.join(DIST, "package.json"), '{"type":"module"}\n', "utf8"),
  ]);

  process.stdout.write("Built the Sites worker and static assets.\n");
}

if (require.main === module) {
  buildSite().catch((error) => {
    process.stderr.write(`Site build failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { buildSite };
