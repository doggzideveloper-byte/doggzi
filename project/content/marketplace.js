// Marketplace config (features/marketplace). Seed: docs/reference/marketplace_catalog_seed.csv
// GRIPTOL-N SYRUP (row 27, medicine_check_rules) is excluded until approved.
// Brand = brand_suggested — Abhiyash to confirm. mrp_paise is null until the printed MRP is added.
// stock_qty is a DRAFT placeholder (CSV only says "In-stock").

export const CATEGORIES = [
  { key: 'treats', label: 'Treats' },
  { key: 'toys', label: 'Toys' },
  { key: 'grooming', label: 'Grooming & hygiene' },
  { key: 'walking', label: 'Walking gear' },
  { key: 'health', label: 'Health & supplements' },
];

// DRAFT vendor config — Doggzi's own shop until local vendors are onboarded.
export const VENDORS = [
  {
    id: 'doggzi-store', name: 'Doggzi Store', area: 'Gurgaon', distance_km: 2.1, delivery_fee_paise: 4900,
    serviceable_pincodes: ["122001","122002","122003","122004","122005","122006","122007","122008","122009","122010","122011","122012","122013","122014","122015","122016","122017","122018"],
    is_doggzi: true,
  },
];

export const DELIVERY_ESTIMATE = 'Delivered today if you order before 6 pm (draft)';
export const DELIVERY_COMPARE = 'Same day, from a store near you (draft)';

// "Picked for {pet}" rule table — simple, by pet type and size.
export const PICK_RULES = {
  small: { pet_types: ['dog', 'both'], categories: ['treats', 'toys', 'grooming'], max_price_paise: 50000 },
  large: { pet_types: ['dog', 'both'], categories: ['toys', 'walking', 'treats'], max_price_paise: null },
  cat: { pet_types: ['cat', 'both'], categories: null, max_price_paise: null },
};

export const PRODUCTS = [
  {"sku":"DZ-MKT-001","name":"Twistee Fun toy (round)","brand":"Superfun Twistee","category":"toys","pet_type":"dog","price_paise":22300,"mrp_paise":null,"stock_qty":20,"popularity":0,"flags":[]},
  {"sku":"DZ-MKT-002","name":"Super Fun Toy Twisted Knotted Bone Dog Toy","brand":"Super Fun","category":"toys","pet_type":"dog","price_paise":43600,"mrp_paise":null,"stock_qty":20,"popularity":1,"flags":["brand_mismatch"]},
  {"sku":"DZ-MKT-003","name":"Rope toy","brand":"Super Chewers","category":"toys","pet_type":"dog","price_paise":17500,"mrp_paise":null,"stock_qty":20,"popularity":2,"flags":[]},
  {"sku":"DZ-MKT-004","name":"Cotton slipper rope dog toy","brand":"Super fun toy","category":"toys","pet_type":"dog","price_paise":14000,"mrp_paise":null,"stock_qty":20,"popularity":3,"flags":[]},
  {"sku":"DZ-MKT-005","name":"cat harness Red","brand":"Doggzi Premium","category":"walking","pet_type":"cat","price_paise":31500,"mrp_paise":null,"stock_qty":20,"popularity":4,"flags":[]},
  {"sku":"DZ-MKT-006","name":"FOFOS Tough Plush Dog Toy - Elephant","brand":"FOFOS","category":"toys","pet_type":"dog","price_paise":87500,"mrp_paise":null,"stock_qty":20,"popularity":5,"flags":[]},
  {"sku":"DZ-MKT-007","name":"Fofos Ocean Whale Squeaky Chew Toy for Dogs","brand":"FOFOS","category":"toys","pet_type":"dog","price_paise":66000,"mrp_paise":null,"stock_qty":20,"popularity":6,"flags":["brand_mismatch"]},
  {"sku":"DZ-MKT-008","name":"Pet Nail clipper","brand":"Doggzi Premium","category":"grooming","pet_type":"dog","price_paise":129900,"mrp_paise":null,"stock_qty":20,"popularity":7,"flags":[]},
  {"sku":"DZ-MKT-009","name":"ZippyPaws Jigglerz Duck Dog Toy","brand":"ZippyPaws","category":"toys","pet_type":"dog","price_paise":95000,"mrp_paise":null,"stock_qty":20,"popularity":8,"flags":["brand_mismatch"]},
  {"sku":"DZ-MKT-010","name":"Zippy Paws - Jigglerz banana","brand":"ZippyPaws","category":"toys","pet_type":"dog","price_paise":97500,"mrp_paise":null,"stock_qty":20,"popularity":9,"flags":["brand_mismatch"]},
  {"sku":"DZ-MKT-011","name":"Super Fun Toy Twisted Knotted Bone Dog Toy","brand":"Super Fun","category":"toys","pet_type":"dog","price_paise":97500,"mrp_paise":null,"stock_qty":20,"popularity":10,"flags":["brand_mismatch","duplicate_name_of_row_2"]},
  {"sku":"DZ-MKT-012","name":"FOFOS Tough Plush Dog Toy - Fox","brand":"FOFOS","category":"toys","pet_type":"dog","price_paise":87500,"mrp_paise":null,"stock_qty":20,"popularity":11,"flags":[]},
  {"sku":"DZ-MKT-013","name":"Zippy Paws Carrot Jigglerz Plush Toy for Dogs","brand":"ZippyPaws","category":"toys","pet_type":"dog","price_paise":97500,"mrp_paise":null,"stock_qty":20,"popularity":12,"flags":["brand_mismatch"]},
  {"sku":"DZ-MKT-014","name":"Bone Dog Toy","brand":"Doggzi Premium","category":"toys","pet_type":"dog","price_paise":24900,"mrp_paise":null,"stock_qty":20,"popularity":13,"flags":[]},
  {"sku":"DZ-MKT-015","name":"rubber triangle dog chew toy","brand":"Doggzi Premium","category":"toys","pet_type":"dog","price_paise":21300,"mrp_paise":null,"stock_qty":20,"popularity":14,"flags":[]},
  {"sku":"DZ-MKT-016","name":"super durable nylon chicken leg toy","brand":"Doggzi Premium","category":"toys","pet_type":"dog","price_paise":20500,"mrp_paise":null,"stock_qty":20,"popularity":15,"flags":[]},
  {"sku":"DZ-MKT-017","name":"Super Fun Toy Pear Fruit Dog Toy","brand":"Super Fun","category":"toys","pet_type":"dog","price_paise":31500,"mrp_paise":null,"stock_qty":20,"popularity":16,"flags":["brand_mismatch"]},
  {"sku":"DZ-MKT-018","name":"super tough rope dog leash","brand":"Doggzi Premium","category":"walking","pet_type":"dog","price_paise":31500,"mrp_paise":null,"stock_qty":20,"popularity":17,"flags":[]},
  {"sku":"DZ-MKT-019","name":"Truelove Classic leash for Dogs (Red)","brand":"Truelove","category":"walking","pet_type":"dog","price_paise":150000,"mrp_paise":null,"stock_qty":20,"popularity":18,"flags":["brand_mismatch"]},
  {"sku":"DZ-MKT-020","name":"Truelove Multi Handle Floral Leash – Poppy Red – Premium Control Dog Leash","brand":"Truelove","category":"walking","pet_type":"dog","price_paise":200000,"mrp_paise":null,"stock_qty":20,"popularity":19,"flags":["brand_mismatch"]},
  {"sku":"DZ-MKT-021","name":"Pedigree Dentastix Dog Treats Mono 7 Sticks","brand":"Pedigree","category":"treats","pet_type":"dog","price_paise":21000,"mrp_paise":null,"stock_qty":20,"popularity":20,"flags":["brand_mismatch"]},
  {"sku":"DZ-MKT-022","name":"Lozalo Body Splash Spray for Dogs - 22ml","brand":"Lozalo","category":"grooming","pet_type":"dog","price_paise":9900,"mrp_paise":null,"stock_qty":20,"popularity":21,"flags":["brand_mismatch"]},
  {"sku":"DZ-MKT-023","name":"Lozalo Dog Paw Cleanser Spray","brand":"Lozalo","category":"grooming","pet_type":"dog","price_paise":9900,"mrp_paise":null,"stock_qty":20,"popularity":22,"flags":["brand_mismatch"]},
  {"sku":"DZ-MKT-024","name":"Drools Absolute Milk Bone Jar(40psc)","brand":"Drools","category":"treats","pet_type":"dog","price_paise":45000,"mrp_paise":null,"stock_qty":20,"popularity":23,"flags":[]},
  {"sku":"DZ-MKT-025","name":"Drools Absolute Milk Bone Jar(20psc)","brand":"Drools","category":"treats","pet_type":"dog","price_paise":25000,"mrp_paise":null,"stock_qty":20,"popularity":24,"flags":[]},
  {"sku":"DZ-MKT-026","name":"House fly repelent spray","brand":"Zyaxx","category":"grooming","pet_type":"both","price_paise":59900,"mrp_paise":null,"stock_qty":20,"popularity":25,"flags":[]},
  {"sku":"DZ-MKT-028","name":"For Dogs Keep off spray","brand":"Bioline","category":"grooming","pet_type":"dog","price_paise":55400,"mrp_paise":null,"stock_qty":20,"popularity":26,"flags":[]},
  {"sku":"DZ-MKT-029","name":"Dental Oral kit","brand":"Super breath","category":"health","pet_type":"dog","price_paise":25000,"mrp_paise":null,"stock_qty":20,"popularity":27,"flags":[]},
  {"sku":"DZ-MKT-030","name":"Deodrizing Spray","brand":"Bioline","category":"grooming","pet_type":"dog","price_paise":41600,"mrp_paise":null,"stock_qty":20,"popularity":28,"flags":[]},
  {"sku":"DZ-MKT-031","name":"Flea and Tick collar for cats","brand":"Bioline","category":"health","pet_type":"cat","price_paise":36500,"mrp_paise":null,"stock_qty":20,"popularity":29,"flags":[]},
  {"sku":"DZ-MKT-032","name":"Salglow (Salmon Oil) Supplement with Omega 3 & 6 Fatty Acid for Dogs and Cats 200 ML","brand":"Salglow","category":"health","pet_type":"both","price_paise":97700,"mrp_paise":null,"stock_qty":20,"popularity":30,"flags":[]},
  {"sku":"DZ-MKT-033","name":"Waggie Wag Egg & Cheese Millet Noodles for Dogs","brand":"Waggie Wag","category":"treats","pet_type":"dog","price_paise":13000,"mrp_paise":null,"stock_qty":20,"popularity":31,"flags":[]},
  {"sku":"DZ-MKT-034","name":"Waggie Wag Fish Millet Noodles for Dogs","brand":"Waggie Wag","category":"treats","pet_type":"dog","price_paise":13000,"mrp_paise":null,"stock_qty":20,"popularity":32,"flags":[]},
  {"sku":"DZ-MKT-035","name":"Waggie Wag Chicken Millet Noodles for Dogs","brand":"Waggie Wag","category":"treats","pet_type":"dog","price_paise":13000,"mrp_paise":null,"stock_qty":20,"popularity":33,"flags":[]},
  {"sku":"DZ-MKT-036","name":"JerHigh Chicken Milky Dog Treats","brand":"JerHigh","category":"treats","pet_type":"dog","price_paise":22500,"mrp_paise":null,"stock_qty":20,"popularity":34,"flags":[]},
  {"sku":"DZ-MKT-037","name":"Jerhigh Blueberry Dog Treats","brand":"JerHigh","category":"treats","pet_type":"dog","price_paise":29500,"mrp_paise":null,"stock_qty":20,"popularity":35,"flags":[]},
  {"sku":"DZ-MKT-038","name":"Gnawlers Puppy Snack Stick Bacon Flavoured Dog Treats","brand":"Gnawlers","category":"treats","pet_type":"dog","price_paise":10000,"mrp_paise":null,"stock_qty":20,"popularity":36,"flags":[]},
  {"sku":"DZ-MKT-039","name":"JerHigh Spinach With Cheese Duo Stick Dog Treat","brand":"JerHigh","category":"treats","pet_type":"dog","price_paise":22500,"mrp_paise":null,"stock_qty":20,"popularity":37,"flags":[]},
  {"sku":"DZ-MKT-040","name":"JerHigh Spinach Stix Dog Treats","brand":"JerHigh","category":"treats","pet_type":"dog","price_paise":29500,"mrp_paise":null,"stock_qty":20,"popularity":38,"flags":[]},
  {"sku":"DZ-MKT-041","name":"Hokkaido Milk Flavor Treats","brand":"Doggzi Premium","category":"treats","pet_type":"dog","price_paise":22500,"mrp_paise":null,"stock_qty":20,"popularity":39,"flags":[]},
  {"sku":"DZ-MKT-042","name":"Gnawlers Dog Chicken Chew Bone, 100% Rawhide Free 4.5 inch, 2 in 1, Pack of 2","brand":"Gnawlers","category":"treats","pet_type":"dog","price_paise":11000,"mrp_paise":null,"stock_qty":20,"popularity":40,"flags":[]},
  {"sku":"DZ-MKT-043","name":"Chip Chops Chicken Tenders Treats For Dog","brand":"Chip Chops","category":"treats","pet_type":"dog","price_paise":22500,"mrp_paise":null,"stock_qty":20,"popularity":41,"flags":[]},
  {"sku":"DZ-MKT-044","name":"JerHigh Stix Dog Treats","brand":"JerHigh","category":"treats","pet_type":"dog","price_paise":29500,"mrp_paise":null,"stock_qty":20,"popularity":42,"flags":[]},
  {"sku":"DZ-MKT-045","name":"JerHigh Milk Stix Dog Treats - 100 g","brand":"JerHigh","category":"treats","pet_type":"dog","price_paise":29500,"mrp_paise":null,"stock_qty":20,"popularity":43,"flags":[]},
  {"sku":"DZ-MKT-046","name":"Veg Joy Apple","brand":"Smart dog","category":"treats","pet_type":"dog","price_paise":19900,"mrp_paise":null,"stock_qty":20,"popularity":44,"flags":[]},
  {"sku":"DZ-MKT-047","name":"Chip Chops Chicken & Codfish Sandwich Treats For Dog","brand":"Chip Chops","category":"treats","pet_type":"dog","price_paise":22500,"mrp_paise":null,"stock_qty":20,"popularity":45,"flags":[]},
  {"sku":"DZ-MKT-048","name":"Chip Chops Dog Treats | Snacks & Training Rewards (70gm, Chicken Pasta)","brand":"Chip Chops","category":"treats","pet_type":"dog","price_paise":22500,"mrp_paise":null,"stock_qty":20,"popularity":46,"flags":[]},
  {"sku":"DZ-MKT-049","name":"Chip Chops Sushi Rolls Treats For Dog - 70 g","brand":"Chip Chops","category":"treats","pet_type":"dog","price_paise":22500,"mrp_paise":null,"stock_qty":20,"popularity":47,"flags":[]},
  {"sku":"DZ-MKT-050","name":"Chip Chops Dog Treats | Snacks & Training Rewards (70gm, Diced Chicken)","brand":"Chip Chops","category":"treats","pet_type":"dog","price_paise":22500,"mrp_paise":null,"stock_qty":20,"popularity":48,"flags":[]},
  {"sku":"DZ-MKT-051","name":"JerHigh Collagen Stix Strawberry","brand":"JerHigh","category":"treats","pet_type":"dog","price_paise":29500,"mrp_paise":null,"stock_qty":20,"popularity":49,"flags":[]},
];
