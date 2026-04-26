/**
 * Default Mongo Item _ids for hire-gardener catalog lines.
 * Override via env if your DB uses different ids.
 */
const potBand = {
  "1-10": process.env.GARDENER_SKU_POT_1_10 || "6936b3a7b24bb1fdff97971a",
  "11-20": process.env.GARDENER_SKU_POT_11_20 || "6936b3a7b24bb1fdff97971c",
  "21-30": process.env.GARDENER_SKU_POT_21_30 || "6936b3a7b24bb1fdff97971e",
  "31-40": process.env.GARDENER_SKU_POT_31_40 || "6936b3a7b24bb1fdff979720",
  "41-50": process.env.GARDENER_SKU_POT_41_50 || "6936b3a7b24bb1fdff979722",
};

const repot = {
  upto12: process.env.GARDENER_SKU_REPOT_UPTO || "6936b3a7b24bb1fdff979730",
  above12: process.env.GARDENER_SKU_REPOT_ABOVE || "6936b3a7b24bb1fdff979732",
};

const standalone = {
  villa: process.env.GARDENER_SKU_VILLA_VISIT || "6936b3a7b24bb1fdff979722",
};

/** Lawn sqft bands — order matches web GRASS_AREA_BANDS */
const grassBands = [
  process.env.GARDENER_SKU_GRASS_0_100 || "6936b3a7b24bb1fdff979736",
  process.env.GARDENER_SKU_GRASS_101_200 || "6936b3a7b24bb1fdff97973a",
  process.env.GARDENER_SKU_GRASS_201_500 || "6936b3a7b24bb1fdff97973c",
  process.env.GARDENER_SKU_GRASS_501_1000 || "6936b3a7b24bb1fdff97973e",
  process.env.GARDENER_SKU_GRASS_1000_PLUS || "6936b3a7b24bb1fdff979740",
];

const GRASS_AREA_ORDER = ["0-100", "101-200", "201-500", "501-1000", "1000+"];

module.exports = {
  potBand,
  repot,
  standalone,
  grassBands,
  GRASS_AREA_ORDER,
};
