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
