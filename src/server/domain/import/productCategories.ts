// Product → category by name keywords (first match wins; specific before generic).
// The KI/KFM price list has no category rows, so groups are recovered from the
// product names. Originally scripts/recategorize-pilot.mjs.
export type CategoryRule = { label: string; match: RegExp };

export const CATEGORY_RULES: CategoryRule[] = [
  // Grinders (specific before generic)
  { label: "Tilting Wet Grinders", match: /tilting\s*wet\s*grinder/i },
  { label: "Wet Grinders", match: /wet\s*grinder/i },
  { label: "Grinder Coverings", match: /\bcovering\b/i },
  { label: "Stone Grinders", match: /stone\s*grinder/i },

  // Batter / Idly /i Dosa
  { label: "IRG (Idly/Rava Grinders)", match: /\birg\b|kalsi\s*model/i },
  { label: "Batter Machines", match: /batter\s*(filling|mixer|blender)|idly\/?dosa\s*batter/i },
  { label: "Dosa Tawas", match: /dosa\s*tawa/i },

  // Flour / Chapathi /i Idiyappam
  { label: "Atta Kneaders", match: /atta\s*kneader/i },
  { label: "Idiyappam & Sevai Machines", match: /idiyappam|\bsevai\b/i },
  {
    label: "Chapathi & Paratha Machines",
    match: /chapathi|chapati|chappathi|paratha|automatic\s+chapati/i,
  },
  { label: "Samosa & North Indian", match: /samosa\s*sheeter|north\s*indian/i },
  { label: "Pani Poori Machines", match: /pani\s*poori/i },

  // Pulverizers / Mills
  { label: "Hammer Mills", match: /hammer\s*mill/i },
  { label: "Plate Mills", match: /plate\s*mill/i },
  { label: "Pulverizers", match: /pulverizer|pulvarizer|impact\s*302/i },
  { label: "Pellet Mills", match: /pellet\s*mill/i },

  // Mixers / Blenders
  { label: "Commercial Mixies", match: /commercial\s*mixie/i },
  { label: "Planetary Mixers", match: /plan[ei]tary\s*mixer/i },
  { label: "Stone Mixers", match: /stone\s*mixer/i },
  { label: "Ribbon Blenders", match: /ribbon\s*blender/i },

  // Vegetable prep
  {
    label: "Potato Processing",
    match: /potato\s*peeler|potato\s*slicer/i,
  },
  {
    label: "Ginger & Garlic Processing",
    match: /ginger\/?garlic\s*peeler|garlic\s*bulp|garlic\s*bulb/i,
  },
  {
    label: "Vegetable Processing",
    match:
      /vegetable\s*cutter|vegetable\s*washer|vegetable\s*brush|vegetable\s*blanchine|double\s*head\s*vegetable|chilli\s*cutter|coconut\s*shell|urdu\s*dhall|banana\s*slicer|extra\s*blade/i,
  },

  // Meat / Chicken
  { label: "Chicken Processing", match: /chicken\s*(defeather|cutting|defeathering)/i },
  { label: "Meat Mincers", match: /meat\s*mincer/i },

  // Snacks / Sweets
  { label: "Murukku Machines", match: /murukku/i },
  { label: "Laddu Machines", match: /laddu/i },
  { label: "Halwa Machines", match: /halwa/i },
  { label: "Namkeen Machines", match: /namkeen/i },
  { label: "Vada Machines", match: /vada\s*m[ac]cking|vada\s*machine/i },
  { label: "Ball Cutting Machines", match: /ball\s*cutting/i },
  { label: "Pasta Machines", match: /pasta|macroni|macaroni/i },
  { label: "Candy Floss", match: /candy\s*floss/i },
  { label: "Popcorn Machines", match: /popcorn/i },
  { label: "Chocolate Fountains", match: /\bfountain\b|cocolate|chocolate/i },
  { label: "Caramel & Coating", match: /caramel/i },

  // Roasters / Dryers /i Fryers
  { label: "Roasters", match: /drum\s*roaster|uruli\s*roaster/i },
  { label: "Dryers", match: /tray\s*dryer|oil\s*dryer/i },
  { label: "Deep Fryers", match: /deep\s*fryer/i },
  { label: "Steamers", match: /steamer|corn\s*steamer/i },

  // Rice / Grain /i Sifters
  { label: "Rice Washers", match: /rice\s*washer/i },
  { label: "Vibro Shifters", match: /vibro\s*sh[ie]fter/i },

  // Packing
  { label: "Packing Machines", match: /packing\s*machine|augar\s*chute/i },

  // Utilities / support equipment
  { label: "Compressors", match: /compressor/i },
  { label: "Stoves", match: /\bstove\b/i },
  { label: "Sugarcane Machines", match: /sugarcane/i },
  { label: "Tandoori", match: /tandoori/i },
  { label: "Working Tables", match: /working\s*table/i },

  // Gravy (very generic — put near the end so more specific rules win first)
  { label: "Gravy Machines", match: /gravy\s*machine/i },
];

export const OTHER_CATEGORY = "Other Machines";

export function categoryFor(productName: string): string {
  return CATEGORY_RULES.find((r) => r.match.test(productName))?.label ?? OTHER_CATEGORY;
}
