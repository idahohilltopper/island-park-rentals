// Netlify build plugin: after a production deploy goes live, tell IndexNow
// (Bing, Yandex and others) about pages that are new or changed since the
// last deploy. It never fails the build: any error is logged and skipped.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const CACHE_DIR = ".indexnow-cache";
const KEY = "ecbbb32784f8449c8a5b3ddb804ec7f2"; // public by design; hosted at /<key>.txt
const ENDPOINT = "https://api.indexnow.org/indexnow";

function siteInfo() {
  const site = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "..", "site.json"), "utf8"));
  const base = String(site.url || "").replace(/\/$/, "");
  return { base, host: new URL(base).host };
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name === "index.html") out.push(p);
  }
  return out;
}

function computeManifest(publishDir, base) {
  const manifest = {};
  for (const file of walk(publishDir)) {
    const rel = path.relative(publishDir, path.dirname(file)).split(path.sep).join("/");
    const url = base + "/" + (rel ? rel + "/" : "");
    manifest[url] = crypto.createHash("sha1").update(fs.readFileSync(file)).digest("hex");
  }
  return manifest;
}

function diff(prev, next) {
  return Object.keys(next).filter((u) => prev[u] !== next[u]).sort();
}

async function submit(host, urls) {
  for (let i = 0; i < urls.length; i += 1000) {
    const batch = urls.slice(i, i + 1000);
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host, key: KEY, keyLocation: `https://${host}/${KEY}.txt`, urlList: batch }),
    });
    if (res.status !== 200 && res.status !== 202) throw new Error("IndexNow returned HTTP " + res.status);
  }
}

module.exports = {
  computeManifest,
  diff,
  async onPreBuild({ utils }) {
    try {
      await utils.cache.restore(CACHE_DIR);
    } catch (e) {
      console.log("indexnow: no cache to restore (" + e.message + ")");
    }
  },
  async onPostBuild({ constants }) {
    try {
      const { base } = siteInfo();
      const next = computeManifest(constants.PUBLISH_DIR, base);
      let prev = {};
      try {
        prev = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, "manifest.json"), "utf8"));
      } catch (_) {}
      const changed = diff(prev, next);
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      fs.writeFileSync(path.join(CACHE_DIR, "pending.json"), JSON.stringify({ changed, next }));
      console.log(`indexnow: ${changed.length} new or changed page(s) of ${Object.keys(next).length}`);
    } catch (e) {
      console.log("indexnow: skipped after error: " + e.message);
    }
  },
  async onSuccess({ utils }) {
    try {
      if (process.env.CONTEXT && process.env.CONTEXT !== "production") {
        console.log("indexnow: not a production deploy, skipping");
        return;
      }
      const pending = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, "pending.json"), "utf8"));
      const { host } = siteInfo();
      if (pending.changed.length) {
        if (process.env.INDEXNOW_DRY_RUN) console.log("indexnow (dry run):", pending.changed);
        else await submit(host, pending.changed);
        console.log(`indexnow: submitted ${pending.changed.length} URL(s)`);
      } else {
        console.log("indexnow: nothing changed, nothing to submit");
      }
      // Remember this deploy only after a successful submit, so failures retry next time.
      fs.writeFileSync(path.join(CACHE_DIR, "manifest.json"), JSON.stringify(pending.next));
      fs.unlinkSync(path.join(CACHE_DIR, "pending.json"));
      await utils.cache.save(CACHE_DIR);
    } catch (e) {
      console.log("indexnow: submit skipped after error: " + e.message);
    }
  },
};
