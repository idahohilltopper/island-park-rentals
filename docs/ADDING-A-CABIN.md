# Adding a cabin

The site is set up for many cabins. Adding a cabin adds it to the home page, the Rentals page (cards, filters, comparison table and "jump to a cabin" menu), the sitemap, the search markup, the monthly rating update and the "More cabins" section on every other cabin page. Nothing else needs editing.

## Steps for each new cabin

1. Make the page: `node scripts/new-cabin.mjs <slug> "<Cabin Name>" <airbnb-url>`
   This creates `src/cabins/<slug>.html` as a draft and the photo folder `public/images/cabins/<slug>/`.
2. Fill in every `TODO` in the page. The build refuses to publish a cabin that still has `TODO` text. Only state facts from the cabin's Airbnb listing. Never publish the address.
   The `cabin` block drives the cards and filters: `guests`, `bedrooms`, `bathrooms`, `petsAllowed`, `trailerParking`, an `amenities` list (include "Private hot tub" if it has one), a one-sentence `tagline`, and `order` (the lower number shows first).
3. Add the photos to `public/images/cabins/<slug>/`. Name each file for what it shows: `01-exterior.jpg`, `02-hot-tub.jpg`. The name becomes the alt text and the order. The top mosaic uses photos 1 to 5 (`{{MOSAIC:1,2,3,4,5}}`); the full gallery shows all of them. Point `cardImage` at the best exterior photo.
4. Optional banner photo: add the page's path to `src/banners.json`, then run `python3 scripts/make-banner-sizes.py`.
5. Add the listing to `src/ratings.json` (key = the number in the Airbnb URL) if it has reviews.
6. Remove `"draft": true` from the page's front matter, run `node build.mjs`, and look at the Rentals page and the new cabin page.
7. Push to `main`. Netlify rebuilds, IndexNow tells Bing and others, and you request indexing for the new URL in Google Search Console.

## What changes by itself as cabins are added

- 1 cabin: a large feature card, no filters.
- 2 cabins: a card grid, a "Jump to a cabin" menu, a comparison table, hero chips on the home page, and a "More cabins" section on each cabin page. The header **Book** button switches from the Airbnb listing to the Rentals page.
- 3 or more cabins: the filter bar (guests, pets, hot tub, trailer parking) also appears.
- The home trust strip counts the cabins, the sleeping range, the pet-friendly count and a review-weighted average rating.

Review the static text on `/rentals/` and the home page's "At the <first cabin>" section when you add cabins, since both describe the first cabin.

Omit `rating` / `reviewCount` for a cabin with no reviews yet so no rating markup is published.

## Ratings and review counts (monthly)

Each cabin's star rating and review count live in one file, `src/ratings.json`, keyed by the Airbnb room ID (the number in the listing URL). Add an entry when you add a cabin. Use the listing's own rating and review count, not the host profile totals. The build copies those numbers onto the cards, the cabin pages, the schema markup, llms.txt and the text on the Island Park and Airbnb guides. A monthly scheduled task checks each listing and updates the file.

## Map coordinates (geo)

Google's rental markup needs coordinates. We use town-level coordinates for Island Park (about 44.50, -111.34) in each cabin's front matter as `"geo": [44.5, -111.34]`. Never use the cabin's real location; the address stays private.

## Banner photos on phones

After adding or changing a banner photo in `src/banners.json` (or a cabin gallery photo used as a banner), run:

    python3 scripts/make-banner-sizes.py

It makes smaller copies under `public/images/sized/` so phones download less, and updates `src/banner-sizes.json`. Commit those files with the change.
