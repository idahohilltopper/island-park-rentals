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
const pages = readdirSync("src/pages")
  .filter((f) => f.endsWith(".html"))
  .map((f) => {
    const raw = readFileSync(join("src/pages", f), "utf8");
    const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!m) throw new Error(`${f}: missing front matter`);
    return { ...JSON.parse(m[1]), body: m[2] };
  });

// ---------- gallery (auto from public/images/gallery) ----------
const galleryDir = "public/images/gallery";
const galleryFiles = existsSync(galleryDir)
  ? readdirSync(galleryDir).filter((f) => /\.(jpe?g|webp|png|avif)$/i.test(f)).sort()
  : [];
const altFromName = (f) =>
  f.replace(/\.[^.]+$/, "").replace(/^\d+[-_]?/, "").replace(/[-_]+/g, " ").trim() || "Cabin photo";
const galleryHtml = galleryFiles.length
  ? `<div class="gallery">${galleryFiles
      .map((f, i) => {
        const alt = `${altFromName(f)}, Island Park Idaho cabin`;
        return `<figure><img src="/images/gallery/${esc(f)}" alt="${esc(alt)}" loading="${i < 2 ? "eager" : "lazy"}" decoding="async"></figure>`;
      })
      .join("")}</div>`
  : `<div class="gallery-empty"><p><strong>Photo gallery coming soon.</strong> Add .jpg or .webp files to <code>public/images/gallery/</code> and they appear here automatically. Name each file for what it shows, for example <code>01-living-room-fireplace.jpg</code>.</p></div>`;
const hasHero = existsSync("public/images/hero.jpg");

// ---------- helpers ----------
const abs = (p) => site.url.replace(/\/$/, "") + p;
const book = (loc, label = "Book on Airbnb") =>
  `<a class="btn" href="${site.airbnb}" target="_blank" rel="noopener" data-airbnb="${loc}">${label}</a>`;
const star = `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3 7 7.5.6-5.7 4.9 1.8 7.3L12 17.8 5.4 21.8l1.8-7.3L1.5 9.6 9 9z" fill="currentColor"/></svg>`;

function render(body) {
  return body
    .replaceAll("{{GALLERY}}", galleryHtml)
    .replace(/\{\{BOOK:([\w-]+)(?::([^}]+))?\}\}/g, (_, loc, label) => book(loc, label))
    .replaceAll("{{RATING}}", String(site.rating))
    .replaceAll("{{REVIEWS}}", String(site.reviewCount))
    .replaceAll("{{AIRBNB}}", site.airbnb)
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
  if (p.type === "cabin") {
    graph.push({
      "@type": "VacationRental",
      "@id": abs("/#cabin"),
      name: site.listingTitle,
      description: p.description,
      url: abs("/whitebark-cabin/"),
      image: [abs("/images/hero.jpg")],
      brand: { "@type": "Brand", name: site.name },
      address: { "@type": "PostalAddress", addressLocality: "Island Park", addressRegion: "ID", addressCountry: "US" },
      containsPlace: {
        "@type": "Accommodation",
        additionalType: "EntirePlace",
        occupancy: { "@type": "QuantitativeValue", maxValue: site.guests },
        numberOfBedrooms: site.bedrooms,
        numberOfBathroomsTotal: site.bathrooms,
        petsAllowed: true,
        amenityFeature: [
          "Private hot tub", "Air conditioning", "Full kitchen", "Wi-Fi", "In-unit washer and dryer",
          "Indoor fireplace", "Backyard fire pit", "BBQ grill", "Free parking on premises",
        ].map((name) => ({ "@type": "LocationFeatureSpecification", name, value: true })),
      },
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: site.rating,
        bestRating: 5,
        reviewCount: site.reviewCount,
      },
      sameAs: [site.airbnb],
    });
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
  const title = p.path === "/" ? p.title : `${p.title} | ${site.name}`;
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
    ${book("header", "Book")}
  </div>
</header>
<main id="main">
${inner}
</main>
<footer class="site-footer">
  <div class="wrap foot">
    <div>
      <strong>${esc(site.name)}</strong>
      <p>Vacation rentals in ${esc(site.region)}, a short drive from Yellowstone National Park.</p>
      <p>${book("footer")}</p>
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
  let inner = render(p.body);
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

> Vacation rentals in ${site.region}, a short drive from Yellowstone National Park. Current rental: the Whitebark Cabin, a pet-friendly cabin with a private hot tub, air conditioning, fireplace and fire pit that sleeps ${site.guests} in ${site.bedrooms} bedrooms with ${site.bathrooms} bathrooms, about 38 miles from Yellowstone. Rated ${site.rating}/5 from ${site.reviewCount} Airbnb reviews. Book on Airbnb: ${site.airbnb}

## Key pages
${pages.map((p) => `- [${p.title}](${abs(p.path)}): ${p.description}`).join("\n")}

## Booking
All reservations, availability and pricing are on Airbnb: ${site.airbnb}
`
);

console.log(`Built ${pages.length} pages + 404 to ${OUT}/ (gallery images: ${galleryFiles.length}, hero: ${hasHero})`);
