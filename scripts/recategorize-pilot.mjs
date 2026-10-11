// One-shot: re-group pilot products into real categories by name keywords.
// Dry run by default. Add `--commit` to actually move products.
//
// Why: the Excel price-list has no header rows, so the importer dumped
// everything into "Uncategorised". Products ARE grouped in the sheet by
// similar names between blank-row separators — this reproduces that
// grouping programmatically.
import { PrismaClient } from "@prisma/client";

const COMMIT = process.argv.includes("--commit");

// Keyword → category label. ORDER MATTERS — more specific rules first.
// Each rule's `match` is a regex that must hit (case-insensitive) somewhere
// in the product name. Rules are evaluated top-to-bottom; first match wins.
const RULES = [
  // Grinders (specific before generic)
  { label: "Tilting Wet Grinders", match: /tilting\s*wet\s*grinder/ },
  { label: "Wet Grinders", match: /wet\s*grinder/ },
  { label: "Grinder Coverings", match: /\bcovering\b/ },
  { label: "Stone Grinders", match: /stone\s*grinder/ },

  // Batter / Idly / Dosa
  { label: "IRG (Idly/Rava Grinders)", match: /\birg\b|kalsi\s*model/ },
  { label: "Batter Machines", match: /batter\s*(filling|mixer|blender)|idly\/?dosa\s*batter/ },
  { label: "Dosa Tawas", match: /dosa\s*tawa/ },

  // Flour / Chapathi / Idiyappam
  { label: "Atta Kneaders", match: /atta\s*kneader/ },
  { label: "Idiyappam & Sevai Machines", match: /idiyappam|\bsevai\b/ },
  {
    label: "Chapathi & Paratha Machines",
    match: /chapathi|chapati|chappathi|paratha|automatic\s+chapati/,
  },
  { label: "Samosa & North Indian", match: /samosa\s*sheeter|north\s*indian/ },
  { label: "Pani Poori Machines", match: /pani\s*poori/ },

  // Pulverizers / Mills
  { label: "Hammer Mills", match: /hammer\s*mill/ },
  { label: "Plate Mills", match: /plate\s*mill/ },
  { label: "Pulverizers", match: /pulverizer|pulvarizer|impact\s*302/ },
  { label: "Pellet Mills", match: /pellet\s*mill/ },

  // Mixers / Blenders
  { label: "Commercial Mixies", match: /commercial\s*mixie/ },
  { label: "Planetary Mixers", match: /plan[ei]tary\s*mixer/ },
  { label: "Stone Mixers", match: /stone\s*mixer/ },
  { label: "Ribbon Blenders", match: /ribbon\s*blender/ },

  // Vegetable prep
  {
    label: "Potato Processing",
    match: /potato\s*peeler|potato\s*slicer/,
  },
  {
    label: "Ginger & Garlic Processing",
    match: /ginger\/?garlic\s*peeler|garlic\s*bulp|garlic\s*bulb/,
  },
  {
    label: "Vegetable Processing",
    match:
      /vegetable\s*cutter|vegetable\s*washer|vegetable\s*brush|vegetable\s*blanchine|double\s*head\s*vegetable|chilli\s*cutter|coconut\s*shell|urdu\s*dhall|banana\s*slicer|extra\s*blade/,
  },

  // Meat / Chicken
  { label: "Chicken Processing", match: /chicken\s*(defeather|cutting|defeathering)/ },
  { label: "Meat Mincers", match: /meat\s*mincer/ },

  // Snacks / Sweets
  { label: "Murukku Machines", match: /murukku/ },
  { label: "Laddu Machines", match: /laddu/ },
  { label: "Halwa Machines", match: /halwa/ },
  { label: "Namkeen Machines", match: /namkeen/ },
  { label: "Vada Machines", match: /vada\s*m[ac]cking|vada\s*machine/ },
  { label: "Ball Cutting Machines", match: /ball\s*cutting/ },
  { label: "Pasta Machines", match: /pasta|macroni|macaroni/ },
  { label: "Candy Floss", match: /candy\s*floss/ },
  { label: "Popcorn Machines", match: /popcorn/ },
  { label: "Chocolate Fountains", match: /\bfountain\b|cocolate|chocolate/ },
  { label: "Caramel & Coating", match: /caramel/ },

  // Roasters / Dryers / Fryers
  { label: "Roasters", match: /drum\s*roaster|uruli\s*roaster/ },
  { label: "Dryers", match: /tray\s*dryer|oil\s*dryer/ },
  { label: "Deep Fryers", match: /deep\s*fryer/ },
  { label: "Steamers", match: /steamer|corn\s*steamer/ },

  // Rice / Grain / Sifters
  { label: "Rice Washers", match: /rice\s*washer/ },
  { label: "Vibro Shifters", match: /vibro\s*sh[ie]fter/ },

  // Packing
  { label: "Packing Machines", match: /packing\s*machine|augar\s*chute/ },

  // Utilities / support equipment
  { label: "Compressors", match: /compressor/ },
  { label: "Stoves", match: /\bstove\b/ },
  { label: "Sugarcane Machines", match: /sugarcane/ },
  { label: "Tandoori", match: /tandoori/ },
  { label: "Working Tables", match: /working\s*table/ },

  // Gravy (very generic — put near the end so more specific rules win first)
  { label: "Gravy Machines", match: /gravy\s*machine/ },
];

function categoryFor(name) {
  const t = name.toLowerCase();
  for (const r of RULES) {
    if (r.match.test(t)) return r.label;
  }
  return "Other";
}

const p = new PrismaClient();

const products = await p.product.findMany({
  where: { active: true },
  select: { id: true, name: true, categoryId: true },
  orderBy: { name: "asc" },
});

const existingCats = await p.productCategory.findMany({
  select: { id: true, name: true },
});
const catByName = new Map(existingCats.map((c) => [c.name.toLowerCase(), c]));

// Compute plan
const plan = new Map(); // label → { needsCreate, products[], existingCategoryId }
const unmatched = [];
for (const prod of products) {
  const label = categoryFor(prod.name);
  if (label === "Other") unmatched.push(prod);
  if (!plan.has(label)) {
    const existing = catByName.get(label.toLowerCase());
    plan.set(label, {
      needsCreate: !existing,
      existingCategoryId: existing?.id,
      products: [],
    });
  }
  plan.get(label).products.push(prod);
}

const sortedLabels = Array.from(plan.keys()).sort(
  (a, b) => plan.get(b).products.length - plan.get(a).products.length,
);

console.log(`\n=== Re-categorization plan ===`);
console.log(`Total products: ${products.length}`);
console.log(`Target categories: ${plan.size}`);
console.log(`Needs new category rows: ${sortedLabels.filter((l) => plan.get(l).needsCreate).length}`);
console.log(`Unmatched (→ "Other"): ${unmatched.length}\n`);

for (const label of sortedLabels) {
  const g = plan.get(label);
  const tag = g.needsCreate ? "NEW" : "existing";
  console.log(`  [${tag.padEnd(8)}] ${label.padEnd(32)} ${g.products.length} products`);
}

if (unmatched.length > 0) {
  console.log(`\n--- Products falling into "Other" (review these!) ---`);
  for (const u of unmatched) console.log(`  · ${u.name}`);
}

if (!COMMIT) {
  console.log(`\nDry run — pass --commit to apply.`);
  await p.$disconnect();
  process.exit(0);
}

console.log(`\n=== Committing ===`);

// We need an actor to attribute the migration to. Prefer the first OWNER user,
// or fall back to the first active user.
const actor =
  (await p.user.findFirst({ where: { role: "OWNER", active: true }, select: { id: true, tenantId: true } })) ??
  (await p.user.findFirst({ where: { active: true }, select: { id: true, tenantId: true } }));
if (!actor) throw new Error("No active user to attribute migration to");

const tenantId = actor.tenantId;

// Create missing categories
for (const label of sortedLabels) {
  const g = plan.get(label);
  if (!g.needsCreate) continue;
  const existingMaxSort = await p.productCategory.aggregate({
    where: { tenantId },
    _max: { sortOrder: true },
  });
  const sortOrder = (existingMaxSort._max.sortOrder ?? 0) + 1;
  const cat = await p.productCategory.create({
    data: { tenantId, name: label, sortOrder },
    select: { id: true, name: true },
  });
  g.existingCategoryId = cat.id;
  console.log(`  Created category: ${cat.name}`);
}

// Reassign products in a single tx per category
let moved = 0;
for (const label of sortedLabels) {
  const g = plan.get(label);
  const ids = g.products.filter((p) => p.categoryId !== g.existingCategoryId).map((p) => p.id);
  if (ids.length === 0) continue;
  await p.product.updateMany({
    where: { id: { in: ids } },
    data: { categoryId: g.existingCategoryId },
  });
  moved += ids.length;
  console.log(`  ${label} ← ${ids.length} products moved`);
}

console.log(`\nDone. ${moved} products re-categorized across ${sortedLabels.length} categories.`);
await p.$disconnect();
