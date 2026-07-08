(function () {
  "use strict";

  const HERO_BASE = "/heroes";

  const ASSETS = [
    "avatar",
    "square",
    "bust",
    "tool",
    "arms",
    "welcome",
    "thumbsup",
    "sticker"
  ];

  const HERO_PACKS = {
    plomberie: "plomberie",
    electricite: "electricite",
    climatisation: "climatisation",

    serrurerie: "plomberie",
    menuiserie: "plomberie",
    peinture: "plomberie",
    nettoyage: "plomberie",
    jardinage: "plomberie",
    maconnerie: "plomberie",
    carrelage: "plomberie",
    bricolage: "plomberie",
    chauffage: "climatisation",
    toiture: "plomberie",
    vitrerie: "plomberie",
    demenagement: "plomberie",
    securite: "electricite",
    energie_solaire: "electricite",
    corporate: "plomberie"
  };

  const ALIASES = {
    plombier: "plomberie",
    plomberie: "plomberie",
    plumbing: "plomberie",

    electricien: "electricite",
    electricite: "electricite",
    électricité: "electricite",
    electrical: "electricite",

    clim: "climatisation",
    climatisation: "climatisation",
    hvac: "climatisation",
    "air conditioning": "climatisation",
    chauffage: "chauffage",

    serrurier: "serrurerie",
    serrurerie: "serrurerie",

    menuisier: "menuiserie",
    menuiserie: "menuiserie",

    peintre: "peinture",
    peinture: "peinture",

    nettoyage: "nettoyage",
    jardinage: "jardinage",
    maconnerie: "maconnerie",
    maçonnerie: "maconnerie",
    carrelage: "carrelage",
    bricolage: "bricolage",
    toiture: "toiture",
    vitrerie: "vitrerie",
    demenagement: "demenagement",
    déménagement: "demenagement",
    securite: "securite",
    sécurité: "securite",
    surveillance: "securite",
    solaire: "energie_solaire",
    energie: "energie_solaire",
    "energie solaire": "energie_solaire",
    "énergie solaire": "energie_solaire",
    corporate: "corporate"
  };

  function normalizeKey(value) {
    return String(value || "")
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 ]/g, "")
      .replace(/\s+/g, " ");
  }

  function resolveCategory(category) {
    const key = normalizeKey(category);
    return ALIASES[key] || key || "plomberie";
  }

  function resolveAsset(asset) {
    const key = normalizeKey(asset).replace(/\s+/g, "");
    return ASSETS.includes(key) ? key : "avatar";
  }

  function getFixeoHero(category, asset) {
    const resolvedCategory = resolveCategory(category);
    const assetKey = resolveAsset(asset || "avatar");
    const folder = HERO_PACKS[resolvedCategory] || "plomberie";

    return ${HERO_BASE}/${folder}/${assetKey}.webp;
  }

  function hasFixeoHeroPack(category) {
    const resolvedCategory = resolveCategory(category);
    return ["plomberie", "electricite", "climatisation"].includes(
      HERO_PACKS[resolvedCategory]
    );
  }

  window.FIXEO_HEROES = {
    base: HERO_BASE,
    assets: ASSETS,
    packs: HERO_PACKS,
    aliases: ALIASES,
    normalizeKey,
    resolveCategory,
    resolveAsset,
    get: getFixeoHero,
    hasPack: hasFixeoHeroPack
  };

  window.getFixeoHero = getFixeoHero;
})();
