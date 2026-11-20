# Whitebark Cabin, Island Park Idaho

Static, zero-dependency site that sends search and AI traffic to the Airbnb listing.

## Edit
- `site.json`: name, **domain (`url`)**, Airbnb link, rating, optional Plausible domain, Search Console token.
- `src/pages/*.html`: pages (JSON front matter, then HTML). `{{BOOK:location:Label}}` makes a tracked Airbnb button.
- `public/images/hero.jpg`, `og.jpg` (1200x630), and `public/images/gallery/*.jpg`: photos. Name gallery files for what they show; the name becomes the alt text.

## Build / deploy
`node build.mjs` writes `dist/`. Netlify reads `netlify.toml` (build `node build.mjs`, publish `dist`).

## After launch
1. Set `url` in `site.json` to your real domain.
2. Add the site to Google Search Console and Bing Webmaster Tools, submit `/sitemap.xml`.
3. Set `plausibleDomain` to track Airbnb clicks (event "Airbnb Click").
