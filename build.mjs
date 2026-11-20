// Zero-dependency static site generator.
// Usage: node build.mjs        -> writes ./dist
// Pages live in src/pages/*.html and start with a JSON front-matter block between --- lines.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, cpSync, rmSync } from "node:fs";
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
          return { ...JSON.parse(m[1]), body: m[2] };
        })
    : [];
const pages = [...loadDir("src/pages"), ...loadDir("src/cabins")];
const cabins = pages.filter((p) => p.cabin);

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
    .map((f, i) => `<figure><img src="/${esc(dir)}/${esc(f)}" alt="${esc(`${altFromName(f)}, ${label}`)}" loading="${i < 2 ? "eager" : "lazy"}" decoding="async"></figure>`)
    .join("")}</div>`;
}
const hasHero = existsSync("public/images/hero.jpg");
const galleryFiles = cabins.reduce((n, p) => n + (existsSync(join("public", p.cabin.gallery || "")) ? readdirSync(join("public", p.cabin.gallery)).length : 0), 0);

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

const cabinCards = () =>
  `<div class="grid cabins">${cabins
    .map((c) => {
      const k = c.cabin;
      const rating = k.rating ? ` {{STAR}} ${k.rating} (${k.reviewCount} reviews)` : "";
      return `<article class="card cabin-card"><a href="${c.path}"><img src="${k.cardImage}" alt="${esc(k.name)}, Island Park Idaho cabin" loading="lazy" decoding="async" width="1280" height="853"></a><div class="cbody"><h3><a href="${c.path}">${esc(k.name)}</a></h3><p>${esc(k.cardBlurb)}${rating}</p><p class="row"><a class="btn" href="${c.path}">View details</a> ${book("card-" + c.path.replace(/\W+/g, ""), "Book on Airbnb", k.airbnb)}</p></div></article>`;
    })
    .join("")}</div>`;

function render(body, p = {}) {
  const k = p.cabin || {};
  return body
    .replaceAll("{{GALLERY}}", galleryFor(k.gallery || "images/gallery", k.name ? `${k.name}, Island Park Idaho` : "Island Park Idaho cabin"))
    .replaceAll("{{CABIN_CARDS}}", cabinCards())
    .replaceAll("{{CABIN_COUNT}}", String(cabins.length))
    .replace(/\{\{BOOK:([\w-]+)(?::([^}]+))?\}\}/g, (_, loc, label) => book(loc, label, k.airbnb || site.airbnb))
    .replaceAll("{{RATING}}", String(k.rating ?? site.rating))
    .replaceAll("{{REVIEWS}}", String(k.reviewCount ?? site.reviewCount))
    .replaceAll("{{PHOTO_CREDITS}}", photoCredits)
    .replaceAll("{{AIRBNB}}", k.airbnb || site.airbnb)
    .replaceAll("{{STAR}}", star);
}

function faqHtml(faq) {
  return `<div class="faq">${faq
    .map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${a}</p></details>`)
    .join("")}</div>`;
}
const stripTags = (s) => s.replace(/<[^>]+>/g, "");

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
      image: [abs(k.cardImage)],
      brand: { "@type": "Brand", name: site.name },
      address: { "@type": "PostalAddress", addressLocality: "Island Park", addressRegion: "ID", addressCountry: "US" },
      containsPlace: {
        "@type": "Accommodation",
        additionalType: "EntirePlace",
        occupancy: { "@type": "QuantitativeValue", maxValue: k.guests },
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
  ["/island-park-snowmobiling/", "Snowmobiling"],
  ["/things-to-do/", "Things to Do"],
  ["/faq/", "FAQ"],
];

function layout(p, inner) {
  const url = abs(p.path);
  const withBrand = `${p.title} | ${site.name}`;
  const title = p.path === "/" || withBrand.length > 65 ? p.title : withBrand;
  const analytics = site.plausibleDomain
    ? `<script defer data-domain="${esc(site.plausibleDomain)}" src="https://plausible.io/js/script.tagged-events.js"></script>`
    : "";
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
<link rel="stylesheet" href="/style.css">
<script type="application/ld+json">${schemaFor(p)}</script>
${analytics}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <div class="wrap bar">
    <a class="brand" href="/">${esc(site.name)}</a>
    <nav aria-label="Main">${nav.map(([h, l]) => `<a href="${h}"${h === p.path ? ' aria-current="page"' : ""}>${l}</a>`).join("")}</nav>
    <a class="btn" href="/rentals/">Book</a>
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
      <ul>${nav.map(([h, l]) => `<li><a href="${h}">${l}</a></li>`).join("")}</ul>
    </div>
    <div>
      <strong>Booking</strong>
      <p>Reservations, pricing and availability are handled securely on Airbnb.</p>
    </div>
  </div>
  <div class="wrap legal">&copy; ${new Date().getFullYear()} ${esc(site.name)}. Independent vacation rental site. Not affiliated with Yellowstone National Park or the National Park Service.</div>
</footer>
<script>
document.addEventListener("click",function(e){var a=e.target.closest("[data-airbnb]");if(!a)return;var l=a.getAttribute("data-airbnb");
if(window.plausible)plausible("Airbnb Click",{props:{location:l,page:location.pathname}});
if(window.gtag)gtag("event","airbnb_click",{location:l,page:location.pathname});});
</script>
</body>
</html>`;
}

// ---------- write pages ----------
for (const p of pages) {
  let inner = render(p.body, p);
  if (p.faq) inner = inner.replace("{{FAQ}}", faqHtml(p.faq));
  const dir = p.path === "/" ? OUT : join(OUT, p.path);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), layout(p, inner));
}

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
