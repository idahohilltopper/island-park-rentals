#!/usr/bin/env node
// Scaffold a new cabin page:  node scripts/new-cabin.mjs <slug> "<Cabin Name>" [airbnb-url]
// Creates src/cabins/<slug>.html (as a draft) and public/images/cabins/<slug>/ for its photos.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

const [slug, name, airbnb = "https://www.airbnb.com/rooms/TODO"] = process.argv.slice(2);
if (!slug || !name || !/^[a-z0-9-]+$/.test(slug)) {
  console.error('Usage: node scripts/new-cabin.mjs <slug-with-dashes> "<Cabin Name>" [airbnb-url]');
  process.exit(1);
}
const file = `src/cabins/${slug}.html`;
if (existsSync(file)) { console.error(`${file} already exists`); process.exit(1); }

const fm = {
  draft: true,
  path: `/${slug}/`,
  type: "cabin",
  crumb: name,
  title: `${name} TODO: short title with the main features (under 60 characters)`,
  description: "TODO: one or two sentences, 150 to 160 characters, with what the cabin has and where it is.",
  priority: 0.9,
  cabin: {
    name,
    listingTitle: "TODO: the exact Airbnb listing title",
    airbnb,
    guests: 0,
    bedrooms: 0,
    bathrooms: 0,
    petsAllowed: false,
    trailerParking: false,
    amenities: ["TODO"],
    cardImage: `/images/cabins/${slug}/01-TODO.jpg`,
    tagline: "TODO: one short sentence",
    identifier: slug,
    postalCode: "83429",
    geo: [44.5, -111.34],
    order: 10,
    beds: [["Queen", 1]],
  },
};
const body = `<section class="wrap prose">
  <p class="crumbs"><a href="/">Home</a> / <a href="/rentals/">Rentals</a> / ${name}</p>
  <h1>${name}: TODO headline with the main features</h1>
  <p class="answer"><strong>At a glance:</strong> TODO entire cabin, sleeps, bedrooms, bathrooms, main amenities, pets, distance to Yellowstone.</p>
  <p>{{BOOK:cabin-top:Check availability on Airbnb}}</p>
</section>
<div class="mosaic-wrap">{{MOSAIC:1,2,3,4,5}}</div>
<section class="wrap prose" style="padding-top:0">
  <h2>Sleeping arrangements</h2>
  <table>
    <tr><th>Room</th><th>Beds</th></tr>
    <tr><td>TODO Bedroom 1</td><td>TODO</td></tr>
  </table>

  <h2>What is included</h2>
  <ul>
    <li>TODO</li>
  </ul>

  <h2>Location</h2>
  <p>TODO describe the area and distance to Yellowstone. The exact address is shared after booking. See <a href="/yellowstone-lodging/">how Island Park compares with West Yellowstone</a> and <a href="/things-to-do/">what to do nearby</a>.</p>

  <h2>Good to know before you book</h2>
  <ul>
    <li>TODO house rules, parking, trailers, hot tub servicing, fire restrictions</li>
  </ul>
  <p>Please read the full house rules and current policies on the Airbnb listing before booking.</p>
</section>
<section class="gallery-wide"><h2>All photos</h2>
{{GALLERY}}
</section>
{{OTHER_CABINS}}
<section class="cta-band">
  <h2>Ready to book?</h2>
  <p>See live availability and pricing for your dates.</p>
  {{BOOK:cabin-bottom}}
</section>
`;
writeFileSync(file, `---\n${JSON.stringify(fm)}\n---\n${body}`);
mkdirSync(`public/images/cabins/${slug}`, { recursive: true });
writeFileSync(`public/images/cabins/${slug}/README.txt`, "Put this cabin's photos here, named 01-what-it-shows.jpg, 02-... (they show in number order).\n");
console.log(`Created ${file} (a draft) and public/images/cabins/${slug}/\nNext: see docs/ADDING-A-CABIN.md`);
