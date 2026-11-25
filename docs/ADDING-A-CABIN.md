# Adding a cabin

1. Copy `src/cabins/whitebark.html` to `src/cabins/<new-cabin>.html`.
2. Edit the JSON at the top: `path` (e.g. `/lodgepole-cabin/`), `title`, `description`, and the `cabin` block
   (name, Airbnb URL, rating, reviews, guests, bedrooms, bathrooms, amenities, card blurb).
3. Rewrite the page body below the second `---` with that cabin's real details. Only state facts from its Airbnb listing.
4. Put photos in `public/images/cabins/<new-cabin>/` (name each file for what it shows, e.g. `01-living-room.jpg`; the name becomes the alt text)
   and set `cardImage` and `gallery` (`images/cabins/<new-cabin>`) in the JSON.
5. `git push` to `main`. Netlify rebuilds; the cabin appears on the Rentals and home pages and in the sitemap automatically.
6. Request indexing for the new URL in Google Search Console.

Omit `rating` / `reviewCount` for a cabin with no reviews yet so no rating markup is published.

## Ratings and review counts (monthly)

Each cabin's star rating and review count live in one file, `src/ratings.json`, keyed by the Airbnb room ID (the number in the listing URL). Add an entry when you add a cabin. Use the listing's own rating and review count, not the host profile totals. The build copies those numbers onto the cards, the cabin pages, the schema markup, llms.txt and the text on the Island Park and Airbnb guides. A monthly scheduled task checks each listing and updates the file.

## Map coordinates (geo)

Google's rental markup needs coordinates. We use town-level coordinates for Island Park (about 44.50, -111.34) in each cabin's front matter as `"geo": [44.5, -111.34]`. Never use the cabin's real location; the address stays private.
