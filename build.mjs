// Zero-dependency static site generator.
// Usage: node build.mjs        -> writes ./dist
// Pages live in src/pages/*.html and start with a JSON front-matter block between --- lines.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, cpSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const site = JSON.parse(readFileSync("site.json", "utf8"));
const OUT = "dist";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const today = new Date().toISOString().slice(0, 10);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
if (existsSync("public")) cpSync("public", OUT, { recursive: true });

// ---------- load pages ----------
const loadDir = (dir) =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith(".html"))
        .map((f) => {
          const raw = readFileSync(join(dir, f), "utf8");
          const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
          if (!m) throw new Error(`${dir}/${f}: missing front matter`);
          return { ...JSON.parse(m[1]), body: m[2], srcFile: join(dir, f) };
        })
    : [];
const pages = [...loadDir("src/pages"), ...loadDir("src/cabins")].filter((p) => !p.draft); // "draft": true in a cabin's front matter keeps it unpublished
const cabins = pages.filter((p) => p.cabin);
cabins.sort((a, b) => (a.cabin.order ?? 99) - (b.cabin.order ?? 99) || String(a.cabin.name).localeCompare(String(b.cabin.name)));
// A published cabin must not still contain scaffold placeholders.
for (const c of cabins) if (/TODO/.test(JSON.stringify(c))) throw new Error(`${c.path}: still contains TODO text. Finish it, or set "draft": true to keep it unpublished.`);
// Each cabin keeps its photos in its own folder. Default: public/images/cabins/<identifier>/
const galleryDir = (k) => k.gallery || (k.identifier ? `images/cabins/${k.identifier}` : "images/gallery");
// Ratings come from src/ratings.json, keyed by Airbnb room ID, so one file holds every listing's stars and review count.
const ratings = existsSync("src/ratings.json") ? JSON.parse(readFileSync("src/ratings.json", "utf8")) : {};
for (const c of cabins) {
  const id = (c.cabin.airbnb || "").match(/rooms\/(\d+)/)?.[1];
  const r = id && ratings[id];
  if (r) { c.cabin.rating = r.rating; c.cabin.reviewCount = r.reviewCount; }
}
if (cabins[0]?.cabin?.rating) { site.rating = cabins[0].cabin.rating; site.reviewCount = cabins[0].cabin.reviewCount; }

// ---------- gallery (auto from a cabin's photo folder) ----------
const altFromName = (f) =>
  f.replace(/\.[^.]+$/, "").replace(/^\d+[-_]?/, "").replace(/[-_]+/g, " ").trim() || "Cabin photo";
function galleryFor(dir, label) {
  const d = join("public", dir);
  const files = existsSync(d)
    ? readdirSync(d).filter((f) => /\.(jpe?g|webp|png|avif)$/i.test(f)).sort()
    : [];
  if (!files.length)
    return `<div class="gallery-empty"><p><strong>Photo gallery coming soon.</strong> Add .jpg or .webp files to <code>public/${esc(dir)}/</code> and they appear here automatically. Name each file for what it shows, for example <code>01-living-room-fireplace.jpg</code>.</p></div>`;
  return `<div class="gallery">${files
    .map((f, i) => {
      const sm = existsSync(join("public", dir, "sm", f));
      const src = sm ? `/${esc(dir)}/sm/${esc(f)}` : `/${esc(dir)}/${esc(f)}`;
      const set = sm ? ` srcset="/${esc(dir)}/sm/${esc(f)} 800w, /${esc(dir)}/${esc(f)} 1440w" sizes="(min-width: 900px) 33vw, (min-width: 600px) 50vw, 100vw"` : "";
      const alt = esc(`${altFromName(f)}, ${label}`);
      const dset = set.replace(" srcset=", " data-srcset=");
      return `<figure><a href="/${esc(dir)}/${esc(f)}" data-lb><img data-src="${src}"${dset} alt="${alt}" decoding="async"><noscript><img src="${src}"${set} alt="${alt}"></noscript></a></figure>`;
    })
    .join("")}</div>`;
}
// Photo mosaic for the top of a cabin page: picks files by number prefix (01-, 02-, ...).
function mosaicFor(dir, label, picks) {
  const d = join("public", dir);
  const files = existsSync(d) ? readdirSync(d).filter((f) => /\.(jpe?g|webp|png|avif)$/i.test(f)).sort() : [];
  const chosen = picks.map((n) => files.find((f) => f.startsWith(String(n).padStart(2, "0") + "-"))).filter(Boolean);
  if (!chosen.length) return "";
  return `<div class="mosaic">${chosen
    .map((f, i) => {
      const sm = existsSync(join("public", dir, "sm", f));
      const src = sm ? `/${esc(dir)}/sm/${esc(f)}` : `/${esc(dir)}/${esc(f)}`;
      const alt = esc(`${altFromName(f)}, ${label}`);
      return `<a${i === 0 ? ' class="big"' : ""} href="/${esc(dir)}/${esc(f)}" data-lb>${i === 0 ? `<img src="${src}" alt="${alt}" loading="eager" decoding="async">` : `<img data-src="${src}" alt="${alt}" decoding="async"><noscript><img src="${src}" alt="${alt}"></noscript>`}</a>`;
    })
    .join("")}</div>`;
}
const css = readFileSync("public/style.css", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\s+/g, " ")
  .replace(/\s*([{};])\s*/g, "$1")
  .trim();
const hasHero = existsSync("public/images/hero.jpg");
const galleryFiles = cabins.reduce((n, p) => n + (existsSync(join("public", galleryDir(p.cabin))) ? readdirSync(join("public", galleryDir(p.cabin))).length : 0), 0);

// ---------- photo credits (src/photo-credits.json) ----------
const creditsFile = existsSync("src/photo-credits.json") ? JSON.parse(readFileSync("src/photo-credits.json", "utf8")) : [];
const photoCredits = creditsFile.length
  ? `<ul class="credits">${creditsFile
      .filter((c) => c.slug !== "hero-candidate")
      .map((c) => `<li>${esc(c.slug.replace(/-/g, " "))}: <a href="${esc(c.page)}" target="_blank" rel="noopener">${esc(c.author)}</a>, ${esc(c.license)}, via Wikimedia Commons</li>`)
      .join("")}</ul>`
  : "";

// ---------- helpers ----------
const abs = (p) => site.url.replace(/\/$/, "") + p;
const book = (loc, label = "Book on Airbnb", url = site.airbnb) =>
  `<a class="btn" href="${url}" target="_blank" rel="noopener" data-airbnb="${loc}">${label}</a>`;
const star = `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3 7 7.5.6-5.7 4.9 1.8 7.3L12 17.8 5.4 21.8l1.8-7.3L1.5 9.6 9 9z" fill="currentColor"/></svg>`;

const smOf = (p) => {
  const m = p.match(/^(.*)\/([^/]+)$/);
  return m && existsSync(join("public", m[1], "sm", m[2])) ? `${m[1]}/sm/${m[2]}` : p;
};
const cabinFeatureCards = () =>
  `<div class="grid cabins">${cabins
    .map((c) => {
      const k = c.cabin;
      const rating = k.rating ? `<span class="rt">{{STAR}} ${k.rating} (${k.reviewCount} reviews)</span>` : "";
      return `<article class="card cabin-card"><a href="${c.path}"><img src="${smOf(k.cardImage)}" ${smOf(k.cardImage) !== k.cardImage ? `srcset="${smOf(k.cardImage)} 800w, ${k.cardImage} 1440w" sizes="(min-width: 820px) 620px, 100vw" ` : ""}alt="${esc(k.name)}, Island Park Idaho cabin" loading="lazy" fetchpriority="low" decoding="async" width="1280" height="853"></a><div class="cbody"><h3><a href="${c.path}">${esc(k.name)}</a></h3><p>${esc(k.cardBlurb)}${rating}</p><p class="row"><a class="more tl" href="${c.path}">View the cabin &rarr;</a> ${book("card-" + c.path.replace(/\W+/g, ""), "Book on Airbnb", k.airbnb)}</p></div></article>`;
    })
    .join("")}</div>`;

// ---------- multi-cabin helpers (cards, filters, comparison, jump menu, trust strip) ----------
const FILTER_MIN = 3; // the filter bar appears once there are this many cabins
const featOf = (k) => ({
  hot: k.hotTub ?? (k.amenities || []).some((a) => /hot tub/i.test(a)),
  pets: !!k.petsAllowed,
  trailer: !!k.trailerParking,
});
const gridCard = (c) => {
  const k = c.cabin, f = featOf(k);
  const tags = [f.hot && "Hot tub", f.pets && "Pets welcome", f.trailer && "Trailer parking"].filter(Boolean).map((t) => `<span>${t}</span>`).join("");
  const sm = smOf(k.cardImage);
  const img = `<img src="${sm}"${sm !== k.cardImage ? ` srcset="${sm} 800w, ${k.cardImage} 1440w" sizes="(min-width: 1000px) 360px, (min-width: 600px) 50vw, 100vw"` : ""} alt="${esc(k.name)}, Island Park Idaho cabin" loading="lazy" decoding="async" width="1280" height="853">`;
  return `<article class="card ccard" data-sleeps="${k.guests}" data-pets="${f.pets ? 1 : 0}" data-hot="${f.hot ? 1 : 0}" data-trailer="${f.trailer ? 1 : 0}"><a class="cimg" href="${c.path}">${img}</a><div class="cbody"><h3><a href="${c.path}">${esc(k.name)}</a></h3><p class="specs">Sleeps ${k.guests} &middot; ${k.bedrooms} bedroom${k.bedrooms === 1 ? "" : "s"} &middot; ${k.bathrooms} bath${k.bathrooms === 1 ? "" : "s"}</p>${tags ? `<p class="tags">${tags}</p>` : ""}${k.tagline ? `<p>${esc(k.tagline)}</p>` : ""}${k.rating ? `<p class="rate">${star} ${k.rating} (${k.reviewCount} reviews)</p>` : ""}<p class="row"><a class="more tl" href="${c.path}">View the cabin &rarr;</a> ${book("card-" + c.path.replace(/\W+/g, ""), "Book on Airbnb", k.airbnb)}</p></div></article>`;
};
const cabinCards = () =>
  cabins.length === 1
    ? cabinFeatureCards()
    : `<div class="cgrid">${cabins.map(gridCard).join("")}</div>${cabins.length >= FILTER_MIN ? `<p class="fnone" data-fnone hidden>No cabin matches all of those. <a href="/rentals/">Clear the filters</a>.</p>` : ""}`;
const cabinFilters = () => {
  if (cabins.length < FILTER_MIN) return "";
  const gs = cabins.map((c) => c.cabin.guests), min = Math.min(...gs), max = Math.max(...gs);
  const opts = [4, 6, 8, 10, 12, 14, 16].filter((n) => n <= max && n > min);
  const any = (key) => cabins.some((c) => featOf(c.cabin)[key]);
  return `<div class="filters" data-filters><label>Sleeps<select><option value="">Any size</option>${opts.map((n) => `<option value="${n}">${n}+ guests</option>`).join("")}</select></label>${any("pets") ? `<label class="ck"><input type="checkbox" value="pets"> Pets welcome</label>` : ""}${any("hot") ? `<label class="ck"><input type="checkbox" value="hot"> Hot tub</label>` : ""}${any("trailer") ? `<label class="ck"><input type="checkbox" value="trailer"> Trailer parking</label>` : ""}<span class="fcount" data-fcount></span></div>`;
};
const cabinJump = () =>
  cabins.length < 2 ? "" : `<p class="jump"><label>Jump to a cabin <select data-jump><option value="">Choose a cabin</option>${cabins.map((c) => `<option value="${c.path}">${esc(c.cabin.name)}</option>`).join("")}</select></label></p>`;
const cabinTable = () => {
  if (cabins.length < 2) return "";
  const yn = (b) => (b ? "Yes" : "No");
  const row = (label, fn) => `<tr><th scope="row">${label}</th>${cabins.map((c) => `<td>${fn(c.cabin, featOf(c.cabin))}</td>`).join("")}</tr>`;
  return `<h2 id="compare" style="margin-top:2em">Compare our cabins</h2><div class="tablewrap"><table class="cmp"><thead><tr><th></th>${cabins.map((c) => `<th><a href="${c.path}">${esc(c.cabin.name)}</a></th>`).join("")}</tr></thead><tbody>${row("Sleeps", (k) => k.guests)}${row("Bedrooms", (k) => k.bedrooms)}${row("Bathrooms", (k) => k.bathrooms)}${row("Pets welcome", (k, f) => yn(f.pets))}${row("Private hot tub", (k, f) => yn(f.hot))}${row("Trailer parking", (k, f) => yn(f.trailer))}${row("Guest rating", (k) => (k.rating ? `${k.rating} (${k.reviewCount})` : "New"))}</tbody></table></div>`;
};
const otherCabins = (p) => {
  const others = cabins.filter((c) => c.path !== p.path);
  return others.length
    ? `<section class="block alt"><div class="wrap"><h2>More cabins in Island Park</h2><div class="cgrid">${others.map(gridCard).join("")}</div><p style="margin-top:1.2em"><a class="more tl" href="/rentals/#compare">Compare all our cabins &rarr;</a></p></div></section>`
    : "";
};
const factsHtml = () => {
  const ks = cabins.map((c) => c.cabin);
  if (!ks.length) return "";
  const rated = ks.filter((k) => k.rating && k.reviewCount);
  const reviews = rated.reduce((n, k) => n + k.reviewCount, 0);
  const avg = reviews ? (rated.reduce((n, k) => n + k.rating * k.reviewCount, 0) / reviews).toFixed(2) : "";
  const stars = reviews ? `<li>&#9733; ${avg} (${reviews} reviews)</li>` : "";
  if (ks.length === 1) return `<li><b>Island Park, Idaho</b></li><li>Near Yellowstone's West Entrance</li><li>Booked securely on Airbnb</li>${stars}`;
  const gs = ks.map((k) => k.guests), pets = ks.filter((k) => featOf(k).pets).length;
  return `<li><b>${ks.length} cabins</b></li><li>Sleeps ${Math.min(...gs)} to ${Math.max(...gs)}</li>${pets ? `<li>${pets === ks.length ? "All pet friendly" : pets + " pet friendly"}</li>` : ""}${stars}`;
};
const heroLead = () => {
  if (cabins.length <= 1) return "Cabin rentals in the forests of Island Park, Idaho, a short drive from Yellowstone's West Entrance.";
  const gs = cabins.map((c) => c.cabin.guests);
  return `Island Park cabins that sleep ${Math.min(...gs)} to ${Math.max(...gs)}, with hot tubs, pets welcome at many, and a short drive to Yellowstone's West Entrance.`;
};
const featureTitle = () => `At the ${cabins[0].cabin.name}`;
const heroChips = () => {
  if (cabins.length < 2) return "";
  const ks = cabins.map((c) => c.cabin), max = Math.max(...ks.map((k) => k.guests));
  const chips = [];
  if (ks.some((k) => featOf(k).hot)) chips.push(["/rentals/?f=hot", "Hot tub"]);
  if (ks.some((k) => featOf(k).pets)) chips.push(["/rentals/?f=pets", "Pets welcome"]);
  if (max >= 8) chips.push([`/rentals/?sleeps=${max >= 10 ? 10 : 8}`, `Sleeps ${max >= 10 ? 10 : 8}+`]);
  if (ks.some((k) => featOf(k).trailer)) chips.push(["/rentals/?f=trailer", "Trailer parking"]);
  return `<p class="chips">${chips.map(([h, l]) => `<a href="${h}">${l}</a>`).join("")}<a href="/rentals/#compare">Compare all cabins</a></p>`;
};

function render(body, p = {}) {
  const k = p.cabin || {};
  return body
    .replace(/\{\{MOSAIC:([\d,]+)\}\}/g, (_, nums) => mosaicFor(galleryDir(k), k.name ? `${k.name}, Island Park Idaho` : "Island Park Idaho cabin", nums.split(",").map(Number)))
    .replaceAll("{{GALLERY}}", galleryFor(galleryDir(k), k.name ? `${k.name}, Island Park Idaho` : "Island Park Idaho cabin"))
    .replaceAll("{{CABIN_CARDS}}", cabinCards())
    .replaceAll("{{CABIN_FILTERS}}", cabinFilters())
    .replaceAll("{{CABIN_JUMP}}", cabinJump())
    .replaceAll("{{CABIN_TABLE}}", cabinTable())
    .replaceAll("{{OTHER_CABINS}}", otherCabins(p))
    .replaceAll("{{FACTS}}", factsHtml())
    .replaceAll("{{HERO_CHIPS}}", heroChips())
    .replaceAll("{{HERO_LEAD}}", heroLead())
    .replaceAll("{{FEATURE_TITLE}}", featureTitle())
    .replaceAll("{{CABIN_COUNT}}", String(cabins.length))
    .replace(/\{\{BOOK:([\w-]+)(?::([^}]+))?\}\}/g, (_, loc, label) => book(loc, label, k.airbnb || site.airbnb))
    .replaceAll("{{RATING}}", String(k.rating ?? site.rating))
    .replaceAll("{{REVIEWS}}", String(k.reviewCount ?? site.reviewCount))
    .replaceAll("{{PHOTO_CREDITS}}", photoCredits)
    .replaceAll("{{AIRBNB}}", k.airbnb || site.airbnb)
    .replaceAll("{{PHONE_DISPLAY}}", site.phoneDisplay)
    .replaceAll("{{PHONE}}", site.phone)
    .replaceAll("{{STAR}}", star);
}

function faqHtml(faq) {
  return `<div class="faq">${faq
    .map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${a}</p></details>`)
    .join("")}</div>`;
}
const stripTags = (s) => s.replace(/<[^>]+>/g, "");

function cabinImages(k) {
  const d = join("public", galleryDir(k));
  const files = existsSync(d) ? readdirSync(d).filter((f) => /\.(jpe?g|webp|png)$/i.test(f)).sort() : [];
  return files.length ? files.map((f) => abs(`/${galleryDir(k)}/${f}`)) : [abs(k.cardImage)];
}

function schemaFor(p) {
  const graph = [];
  const url = abs(p.path);
  graph.push({
    "@type": "WebSite",
    "@id": abs("/#website"),
    url: abs("/"),
    name: site.name,
    inLanguage: "en-US",
  });
  if (p.path !== "/") {
    graph.push({
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: abs("/") },
        { "@type": "ListItem", position: 2, name: p.crumb || p.title, item: url },
      ],
    });
  }
  if (p.cabin) {
    const k = p.cabin;
    const v = {
      "@type": "VacationRental",
      "@id": abs(p.path) + "#cabin",
      name: k.listingTitle || k.name,
      description: p.description,
      url: abs(p.path),
      identifier: k.identifier || p.path.replace(/\W+/g, "-").replace(/^-|-$/g, ""),
      image: cabinImages(k),
      brand: { "@type": "Brand", name: site.name },
      telephone: site.phone,
      address: { "@type": "PostalAddress", addressLocality: "Island Park", addressRegion: "ID", ...(k.postalCode ? { postalCode: k.postalCode } : {}), addressCountry: "US" },
      ...(k.geo ? { geo: { "@type": "GeoCoordinates", latitude: k.geo[0], longitude: k.geo[1] } } : {}),
      containsPlace: {
        "@type": "Accommodation",
        additionalType: "EntirePlace",
        occupancy: { "@type": "QuantitativeValue", value: k.guests },
        ...(k.beds ? { bed: k.beds.map(([type, n]) => ({ "@type": "BedDetails", numberOfBeds: n, typeOfBed: type })) } : {}),
        numberOfBedrooms: k.bedrooms,
        numberOfBathroomsTotal: k.bathrooms,
        petsAllowed: !!k.petsAllowed,
        amenityFeature: (k.amenities || []).map((name) => ({ "@type": "LocationFeatureSpecification", name, value: true })),
      },
      sameAs: [k.airbnb],
    };
    if (k.rating && k.reviewCount)
      v.aggregateRating = { "@type": "AggregateRating", ratingValue: k.rating, bestRating: 5, reviewCount: k.reviewCount };
    graph.push(v);
  }
  if (p.path === "/rentals/" && cabins.length > 1) {
    graph.push({ "@type": "ItemList", name: "Cabins", itemListElement: cabins.map((c, i) => ({ "@type": "ListItem", position: i + 1, url: abs(c.path), name: c.cabin.name })) });
  }
  if (p.faq) {
    graph.push({
      "@type": "FAQPage",
      mainEntity: p.faq.map(([q, a]) => ({
        "@type": "Question",
        name: q,
        acceptedAnswer: { "@type": "Answer", text: stripTags(a) },
      })),
    });
  }
  if (p.type === "article") {
    graph.push({
      "@type": "Article",
      headline: p.title,
      description: p.description,
      dateModified: p.lastmod || today,
      mainEntityOfPage: url,
      author: { "@type": "Organization", name: site.name },
      publisher: { "@type": "Organization", name: site.name },
    });
  }
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph });
}

const nav = [
  ["/rentals/", "Rentals"],
  ["/yellowstone-lodging/", "Yellowstone"],
  ["/getting-to-island-park/", "Getting Here"],
  ["/island-park-snowmobiling/", "Snowmobiling"],
  ["/things-to-do/", "Things to Do"],
  ["/guides/", "Guides"],
  ["/faq/", "FAQ"],
];

function layout(p, inner) {
  const url = abs(p.path);
  const withBrand = `${p.title} | ${site.name}`;
  const title = p.path === "/" || withBrand.length > 60 ? p.title : withBrand;
  const ga4 = /^G-[A-Z0-9]{6,}$/.test(site.ga4Id || "")
    ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${site.ga4Id}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag("js",new Date());gtag("config","${site.ga4Id}");</script>`
    : "";
  const analytics =
    (site.plausibleDomain
      ? `<script defer data-domain="${esc(site.plausibleDomain)}" src="https://plausible.io/js/script.tagged-events.js"></script>`
      : "") + ga4;
  const verify = site.googleSiteVerification
    ? `<meta name="google-site-verification" content="${esc(site.googleSiteVerification)}">`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(p.description)}">
<link rel="canonical" href="${url}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<meta name="theme-color" content="#1f3a2e">
${verify}
<meta property="og:type" content="${p.path === "/" ? "website" : "article"}">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(p.description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${abs("/images/og.jpg")}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preload" as="font" type="font/woff2" href="/fonts/zilla-slab-700.woff2" crossorigin>
${p.path === "/" ? `<link rel="preload" as="image" href="/images/hero-m.jpg" media="(max-width: 700px)" fetchpriority="high"><link rel="preload" as="image" href="/images/hero.jpg" media="(min-width: 701px)" fetchpriority="high">` : ""}<style>${css}</style>
<script type="application/ld+json">${schemaFor(p)}</script>
${analytics}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <div class="wrap bar">
    <a class="brand" href="/" aria-label="${esc(site.name)} home"><svg class="mark" viewBox="0 0 56 56" width="40" height="40" aria-hidden="true"><path d="M4 54V27C4 14.3 14.3 4 27 4h2c12.700 0 23 10.300 23 23v27z" fill="#1f3a2e"/><circle cx="40" cy="17" r="4.500" fill="#c9792b"/><path d="M4 54V44l16-18 9 10 11-17 12 14v21z" fill="#f6f1e7"/><path d="M16 33 10.500 42h3L8.500 49h15l-5-7h3z" fill="#1f3a2e"/><rect x="15" y="49" width="2" height="5" fill="#1f3a2e"/></svg><span class="wm"><b>Yellowstone</b><i>Gateway Stays</i></span></a>
    <nav aria-label="Main">${nav.map(([h, l]) => `<a href="${h}"${h === p.path ? ' aria-current="page"' : ""}>${l}</a>`).join("")}</nav>
    <a class="tel" href="tel:${site.phone}" aria-label="Call or text ${esc(site.phoneDisplay)}"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M6.6 10.800a15.100 15.100 0 0 0 6.600 6.600l2.200-2.200a1 1 0 0 1 1-.25c1.100.37 2.300.57 3.600.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.500a1 1 0 0 1 1 1c0 1.300.2 2.500.57 3.600a1 1 0 0 1-.25 1z"/></svg><span>${esc(site.phoneDisplay)}</span></a>
    ${cabins.length === 1 ? book("header", "Book", cabins[0].cabin.airbnb) : '<a class="btn" href="/rentals/">Book</a>'}
  </div>
</header>
<main id="main">
${inner}
</main>
<footer class="site-footer">
  <div class="wrap foot">
    <div>
      <strong>${esc(site.name)}</strong>
      <p>Cabin rentals in ${esc(site.region)}, a short drive from Yellowstone National Park.</p>
      <p><a class="btn" href="/rentals/">See our cabins</a></p>
    </div>
    <div>
      <strong>Explore</strong>
      <ul>${[...nav, ["/about/", "About us"]].map(([h, l]) => `<li><a href="${h}">${l}</a></li>`).join("")}</ul>
    </div>
    <div>
      <strong>Questions?</strong>
      <p>Call or text <a href="tel:${site.phone}">${esc(site.phoneDisplay)}</a></p>
      <p><a class="btn ghost sm" href="sms:${site.phone}">Text us</a></p>
      <strong style="display:block;margin-top:1em">Booking</strong>
      <p>Reservations, pricing and availability are handled securely on Airbnb.</p>
    </div>
  </div>
  <div class="wrap legal">&copy; ${new Date().getFullYear()} ${esc(site.name)}. Independent vacation rental site. Not affiliated with Yellowstone National Park or the National Park Service. All cabin photos are of the actual properties.</div>
</footer>
<script>
(function(){var j=document.querySelector("[data-jump]");if(j)j.addEventListener("change",function(){if(j.value)location.href=j.value;});
var bar=document.querySelector("[data-filters]");if(!bar)return;var cards=[].slice.call(document.querySelectorAll(".ccard")),out=document.querySelector("[data-fcount]"),none=document.querySelector("[data-fnone]"),sel=bar.querySelector("select"),cbs=[].slice.call(bar.querySelectorAll("input[type=checkbox]"));
function apply(){var min=+sel.value||0,need=cbs.filter(function(c){return c.checked;}).map(function(c){return c.value;}),n=0;cards.forEach(function(c){var ok=+c.dataset.sleeps>=min&&need.every(function(k){return c.dataset[k]==="1";});c.hidden=!ok;if(ok)n++;});out.textContent="Showing "+n+" of "+cards.length+" cabins";if(none)none.hidden=n>0;}
var q=new URLSearchParams(location.search),f=(q.get("f")||"").split(",");cbs.forEach(function(c){if(f.indexOf(c.value)>-1)c.checked=true;});if(q.get("sleeps")){sel.value=q.get("sleeps");if(sel.value!==q.get("sleeps"))sel.value="";}
bar.addEventListener("change",apply);apply();})();
</script>
<script>
(function(){var im=[].slice.call(document.querySelectorAll("img[data-src]"));if(!im.length)return;function load(i){if(i.getAttribute("data-srcset"))i.srcset=i.getAttribute("data-srcset");i.src=i.getAttribute("data-src");i.removeAttribute("data-src");}if(!("IntersectionObserver" in window)){im.forEach(load);return;}var o=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){load(e.target);o.unobserve(e.target);}});},{rootMargin:"300px 0px"});im.forEach(function(x){o.observe(x);});})();
</script>
<script>
(function(){var L=[],i=0,d;function open(n){i=(n+L.length)%L.length;if(!d){d=document.createElement("dialog");d.className="lb";d.innerHTML='<button class="x" aria-label="Close">&times;</button><button class="p" aria-label="Previous">&lsaquo;</button><button class="n" aria-label="Next">&rsaquo;</button><img alt="">';document.body.appendChild(d);d.addEventListener("click",function(e){if(e.target===d||e.target.classList.contains("x"))d.close();else if(e.target.classList.contains("p"))open(i-1);else if(e.target.classList.contains("n"))open(i+1);});d.addEventListener("keydown",function(e){if(e.key==="ArrowLeft")open(i-1);if(e.key==="ArrowRight")open(i+1);});}var a=L[i];d.querySelector("img").src=a.href;d.querySelector("img").alt=(a.querySelector("img")||{}).alt||"";if(!d.open)d.showModal();}
document.addEventListener("click",function(e){var a=e.target.closest("a[data-lb]");if(!a||!document.createElement("dialog").showModal)return;e.preventDefault();L=[].slice.call(document.querySelectorAll("a[data-lb]"));open(L.indexOf(a));});})();
</script>
<script>
document.addEventListener("click",function(e){var a=e.target.closest("[data-airbnb]");if(!a)return;var l=a.getAttribute("data-airbnb");
if(window.plausible)plausible("Airbnb Click",{props:{location:l,page:location.pathname}});
if(window.gtag)gtag("event","airbnb_click",{location:l,page:location.pathname});});
</script>
</body>
</html>`;
}

// ---------- page banners (src/banners.json): photo (or gradient) banner behind the breadcrumb and H1 ----------
const banners = existsSync("src/banners.json") ? JSON.parse(readFileSync("src/banners.json", "utf8")) : {};
// Smaller copies of each banner (scripts/make-banner-sizes.py) so phones download less.
const bannerSizes = existsSync("src/banner-sizes.json") ? JSON.parse(readFileSync("src/banner-sizes.json", "utf8")) : {};
function bannerSrcset(img) {
  const s = bannerSizes[img];
  if (!s || !s.variants.length) return "";
  const parts = s.variants.map((v) => `${v.src} ${v.w}w`).concat(`${img} ${s.w}w`);
  return ` srcset="${parts.join(", ")}" sizes="100vw"`;
}
function withBanner(p, inner) {
  if (!(p.path in banners)) return inner;
  const b = banners[p.path];
  const re = /<section class="wrap prose"([^>]*)>\s*(<p class="crumbs">[\s\S]*?<\/p>)\s*(<h1[^>]*>[\s\S]*?<\/h1>)(\s*<img[^>]*fetchpriority="high"[^>]*>)?(\s*<p style="font-size:\.9rem;color:var\(--mute\);margin:0 0 1\.2em">[^<]*<\/p>)?/;
  const m = inner.match(re);
  if (!m) return inner;
  const img = b ? `<img class="ph-img" src="${b.img}"${bannerSrcset(b.img)} alt="${esc(b.alt || "")}" fetchpriority="high" decoding="async"${b.pos ? ` style="object-position:${b.pos}"` : ""}>` : "";
  const hero = `<header class="page-hero${b ? "" : " plain"}">${img}<div class="ph-shade"></div><div class="wrap ph-text">${m[2]}${m[3]}</div></header>\n<section class="wrap prose"${m[1]}>`;
  return inner.replace(re, hero);
}

// ---------- write pages ----------
// lastmod: a page's date only moves when its rendered content changes. src/lastmod.json holds {path: {hash, date}}.
// Run locally, the build updates it (commit it with the change). On Netlify it is read-only, so unchanged pages keep their date.
const lmFile = "src/lastmod.json";
const lmOld = existsSync(lmFile) ? JSON.parse(readFileSync(lmFile, "utf8")) : {};
const lmNew = {};
const gitDate = (f) => { try { return execSync(`git log -1 --format=%cs -- ${f}`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || today; } catch { return today; } };
for (const p of pages) {
  let inner = withBanner(p, render(p.body, p));
  if (p.faq) inner = inner.replace("{{FAQ}}", faqHtml(p.faq));
  const lmHash = createHash("md5").update(inner).digest("hex").slice(0, 12);
  const prev = lmOld[p.path];
  const date = prev ? (prev.hash === lmHash ? prev.date : today) : gitDate(p.srcFile);
  lmNew[p.path] = { hash: lmHash, date };
  if (!p.lastmod) p.lastmod = date;
  const dir = p.path === "/" ? OUT : join(OUT, p.path);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), layout(p, inner));
}
if (!process.env.NETLIFY && !process.env.CI) {
  const sorted = Object.fromEntries(Object.entries(lmNew).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(lmFile, JSON.stringify(sorted, null, 1) + "\n");
}

// ---------- cache-busting: serve images from /assets/ with a content hash in the filename ----------
// Browsers keep /assets/* for a year (immutable). Changing a photo changes its hash, so every visitor gets the new one.
const imgRoot = join(OUT, "images");
const assetMap = new Map();
(function walk(dir, rel = "") {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${name.name}` : name.name;
    if (name.isDirectory()) walk(join(dir, name.name), r);
    else if (/\.(jpe?g|png|webp|avif)$/i.test(name.name)) {
      const data = readFileSync(join(dir, name.name));
      const h = createHash("md5").update(data).digest("hex").slice(0, 8);
      const hashed = r.replace(/(\.[^.]+)$/, `.${h}$1`);
      const dest = join(OUT, "assets", hashed);
      mkdirSync(join(dest, ".."), { recursive: true });
      writeFileSync(dest, data);
      assetMap.set(`/images/${r}`, `/assets/${hashed}`);
    }
  }
})(imgRoot);
const rewrite = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "images" && e.name !== "assets") rewrite(p); }
    else if (e.name.endsWith(".html")) {
      const s = readFileSync(p, "utf8").replace(/\/images\/[^"'()\s,<>]+?\.(?:jpe?g|png|webp|avif)/gi, (m) => assetMap.get(m) || m);
      writeFileSync(p, s);
    }
  }
};
rewrite(OUT);

// 404
writeFileSync(
  join(OUT, "404.html"),
  layout(
    { path: "/404.html", title: "Page not found", description: "That page does not exist." },
    `<section class="wrap prose"><h1>Page not found</h1><p>Try the <a href="/">home page</a> or <a href="/whitebark-cabin/">the cabin</a>.</p></section>`
  ).replace('content="index, follow', 'content="noindex, follow')
);

// sitemap
const urls = pages.filter((p) => !p.noindex);
writeFileSync(
  join(OUT, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((p) => `  <url><loc>${abs(p.path)}</loc><lastmod>${p.lastmod || today}</lastmod><priority>${p.priority ?? 0.6}</priority></url>`)
    .join("\n")}\n</urlset>\n`
);

// robots: explicitly welcome search + AI crawlers
const bots = ["Googlebot", "Bingbot", "GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "Claude-User", "PerplexityBot", "Perplexity-User", "Google-Extended", "Applebot-Extended", "Amazonbot", "CCBot"];
writeFileSync(
  join(OUT, "robots.txt"),
  `${bots.map((b) => `User-agent: ${b}\nAllow: /\n`).join("\n")}\nUser-agent: *\nAllow: /\n\nSitemap: ${abs("/sitemap.xml")}\n`
);

// llms.txt for AI assistants
writeFileSync(
  join(OUT, "llms.txt"),
  `# ${site.name}

> Cabin rentals in ${site.region}, a short drive from Yellowstone National Park. All reservations, pricing and availability are on Airbnb.

## Cabins
${cabins
  .map((c) => {
    const k = c.cabin;
    return `- [${k.name}](${abs(c.path)}): ${k.cardBlurb}${k.rating ? ` Rated ${k.rating}/5 from ${k.reviewCount} Airbnb reviews.` : ""} Book: ${k.airbnb}`;
  })
  .join("\n")}

## Key pages
${pages.filter((p) => !p.cabin).map((p) => `- [${p.title}](${abs(p.path)}): ${p.description}`).join("\n")}
`
);

console.log(`Built ${pages.length} pages + 404 to ${OUT}/ (gallery images: ${galleryFiles}, hero: ${hasHero})`);
