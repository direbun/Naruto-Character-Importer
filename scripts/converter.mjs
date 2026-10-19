const ABILITY_KEYS = {
  strength: "str",
  dexterity: "dex",
  constitution: "con",
  intelligence: "int",
  wisdom: "wis",
  charisma: "cha",
};

const SKILL_KEYS = {
  acrobatics: "acr",
  "animal-handling": "ani",
  athletics: "ath",
  "chakra-control": "ccl",
  crafting: "cra",
  deception: "dec",
  history: "his",
  illusions: "ill",
  insight: "ins",
  intimidation: "itm",
  investigation: "inv",
  "martial-arts": "mar",
  medicine: "med",
  nature: "nat",
  ninshou: "nsh",
  perception: "prc",
  performance: "prf",
  persuasion: "per",
  "sleight-of-hand": "slt",
  stealth: "ste",
  survival: "sur",
};

// N5eB lets Actors override the ability used by each skill. Supplying an empty
// override makes the sheet select its first ability instead of the system's
// normal association, so imports must preserve these defaults explicitly.
const SKILL_ABILITIES = {
  acrobatics: "dex",
  "animal-handling": "wis",
  athletics: "str",
  "chakra-control": "con",
  crafting: "int",
  deception: "cha",
  history: "int",
  illusions: "wis",
  insight: "wis",
  intimidation: "cha",
  investigation: "int",
  "martial-arts": "str",
  medicine: "wis",
  nature: "int",
  ninshou: "int",
  perception: "wis",
  performance: "cha",
  persuasion: "cha",
  "sleight-of-hand": "dex",
  stealth: "dex",
  survival: "wis",
};

const RANK_LEVELS = {
  "e-rank": 0,
  "d-rank": 1,
  "c-rank": 3,
  "b-rank": 5,
  "a-rank": 7,
  "s-rank": 9,
};

const JUTSU_TYPES = new Set(["ninjutsu", "genjutsu", "taijutsu", "bukijutsu"]);
const JUTSU_COMPONENTS = new Set(["hs", "cm", "cs", "m", "w", "nt"]);

export function normalizeName(value = "") {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

export function slug(value = "") {
  return normalizeName(value).replace(/\s+/g, "-") || "imported-item";
}

export function rankToSpellLevel(rank = "") {
  return RANK_LEVELS[normalizeName(rank).replace(" ", "-")] ?? 0;
}

function rankKey(rank = "") {
  const key = normalizeName(rank).match(/^([edcbas])(?: rank)?$/)?.[1];
  return key || "e";
}

function listValues(value = "") {
  return String(value).split(/[,/]+/).map((entry) => normalizeName(entry)).filter(Boolean);
}

function jutsuKeywords(rule) {
  const aliases = {
    "main branch": "main-branch",
    "side branch": "side-branch",
    "any nature": "any-nature",
    "artistic style": "artistic-style",
    "laser style": "laser-style",
    "reckless style": "reckless-style",
    "storm style": "storm-style",
    "fire release": "fire",
    "water release": "water",
    "wind release": "wind",
    "earth release": "earth",
    "lightning release": "lightning",
  };
  return [...new Set(listValues(rule.keywords).map((keyword) => aliases[keyword] || keyword.replace(/\s+/g, "")))];
}

function jutsuType(rule, keywords) {
  const classification = normalizeName(rule.classification || rule.discipline).replace(/\s+/g, "");
  if (JUTSU_TYPES.has(classification)) return classification;
  return keywords.find((keyword) => JUTSU_TYPES.has(keyword)) || "ninjutsu";
}

function jutsuComponents(value = "") {
  const aliases = {
    "hand seals": "hs",
    "chakra molding": "cm",
    "chakra seals": "cs",
    mobility: "m",
    weapon: "w",
    weapons: "w",
    "ninja tool": "nt",
    "ninja tools": "nt",
  };
  return [...new Set(listValues(value).map((component) => aliases[component] || component.replace(/\s+/g, "")).filter((component) => JUTSU_COMPONENTS.has(component)))];
}

export function indexRules(rules) {
  const byId = new Map();
  for (const group of ["classes", "subclasses", "clans", "backgrounds", "jutsu"]) {
    for (const entry of rules[group] || []) byId.set(entry.id, entry);
  }
  return byId;
}

function html(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}

function descriptionBlock(title, rows, body = "") {
  const facts = rows.filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([label, value]) => `<li><strong>${html(label)}:</strong> ${html(value)}</li>`)
    .join("");
  return `<h2>${html(title)}</h2>${facts ? `<ul>${facts}</ul>` : ""}<p>${html(body)}</p>`;
}

function baseItem(name, type, description, sourceId, kind) {
  return {
    name,
    type,
    img: "icons/svg/book.svg",
    system: {
      description: { value: description, chat: "", unidentified: "" },
      source: { custom: "Shinobi Forge", rules: "", book: "" },
      identifier: slug(name),
    },
    flags: {
      "shinobi-forge-importer": { sourceId, kind, generated: true },
    },
  };
}

export function generatedJutsu(rule) {
  const keywords = jutsuKeywords(rule);
  const type = jutsuType(rule, keywords);
  const chakraCost = Number.parseInt(rule.cost, 10);
  const concentration = /concentration/i.test(rule.duration || "");
  const item = baseItem(
    rule.name,
    "spell",
    descriptionBlock(rule.name, [
      ["Rank", rule.rank],
      ["Classification", rule.classification],
      ["Casting time", rule.castingTime],
      ["Range", rule.range],
      ["Duration", rule.duration],
      ["Components", rule.components],
      ["Cost", rule.cost],
      ["Keywords", rule.keywords],
    ], `${rule.description || ""}${rule.higherRanks ? `\n\nAt higher ranks: ${rule.higherRanks}` : ""}`),
    rule.id,
    "jutsu",
  );
  item.img = "icons/svg/explosion.svg";
  Object.assign(item.system, {
    level: rankToSpellLevel(rule.rank),
    school: type === "genjutsu" ? "ill" : "trs",
    activation: { type: activationType(rule.castingTime), cost: 1, condition: "" },
    duration: { value: null, units: "inst" },
    target: { value: null, width: null, units: "", type: "" },
    range: { value: null, long: null, units: "spec" },
    uses: { value: null, max: "", per: null, recovery: "" },
    consume: { type: "", target: "", amount: null },
    ability: "",
    actionType: "other",
    attack: { bonus: "", flat: false },
    chatFlavor: `${rule.rank || ""} ${rule.classification || ""}`.trim(),
    critical: { threshold: null, damage: "" },
    damage: { parts: [], versatile: "" },
    formula: "",
    save: { ability: "", dc: null, scaling: "spell" },
    materials: { value: rule.components || "", consumed: false, cost: 0, supply: 0 },
    preparation: { mode: "prepared", prepared: true },
    scaling: { mode: "none", formula: "" },
    properties: concentration ? ["concentration"] : [],
    recharge: { value: null, formula: "1d8", charged: false },
    rank: rankKey(rule.rank),
    chakra: {
      cost: Number.isFinite(chakraCost) ? String(chakraCost) : "",
      scaling: { mode: "none", value: 0 },
      special: Number.isFinite(chakraCost) ? "" : String(rule.cost || ""),
    },
    jutsu: {
      components: jutsuComponents(rule.components),
      keywords,
      countsKnown: true,
      ability: "",
      type,
    },
    method: "spell",
    prepared: 1,
  });
  return item;
}

function activationType(value = "") {
  const text = normalizeName(value);
  if (text.includes("bonus")) return "bonus";
  if (text.includes("reaction")) return "reaction";
  if (text.includes("full turn")) return "fta";
  if (text.includes("minute") || text.includes("hour")) return "minute";
  return "action";
}

export function generatedFeature(feature, sourceId, kind, sourceName) {
  const item = baseItem(
    feature.name,
    "feat",
    descriptionBlock(feature.name, [["Source", sourceName], ["Action", feature.action], ["Cost", feature.cost]], feature.description),
    sourceId,
    kind,
  );
  Object.assign(item.system, {
    activation: { type: activationType(feature.action), cost: feature.action && feature.action !== "None" ? 1 : 0, condition: "" },
    uses: { value: null, max: "", per: null, recovery: "" },
    consume: { type: "", target: "", amount: null },
    ability: "",
    actionType: "other",
    attack: { bonus: "", flat: false },
    chatFlavor: sourceName,
    critical: { threshold: null, damage: "" },
    damage: { parts: [], versatile: "" },
    formula: "",
    save: { ability: "", dc: null, scaling: "" },
    requirements: sourceName,
    recharge: { value: null, charged: false },
  });
  return item;
}

function generatedClass(rule, level) {
  const item = baseItem(
    rule.name,
    "class",
    descriptionBlock(rule.name, [["Hit Die", `d${rule.hitDie}`], ["Chakra Die", `d${rule.chakraDie}`], ["Jutsu known", rule.jutsuKnown]], "Imported class progression. Class features are embedded separately."),
    rule.id,
    "class",
  );
  Object.assign(item.system, {
    levels: level,
    hitDice: `d${rule.hitDie || 8}`,
    hitDiceUsed: 0,
    chakraDice: `d${rule.chakraDie || 8}`,
    chakraDiceUsed: 0,
    advancement: [],
  });
  return item;
}

function generatedSubclass(rule, classRule) {
  const item = baseItem(rule.name, "subclass", descriptionBlock(rule.name, [["Class", rule.className || classRule?.name]], "Subclass features are embedded separately."), rule.id, "subclass");
  Object.assign(item.system, {
    classIdentifier: slug(rule.className || classRule?.name),
    advancement: [],
  });
  return item;
}

function generatedClan(rule) {
  const item = baseItem(rule.name, "race", descriptionBlock(rule.name, [["Speed", rule.speed]], "Clan features are embedded separately."), rule.id, "clan");
  item.img = rule.image || "icons/svg/mystery-man.svg";
  Object.assign(item.system, { advancement: [] });
  return item;
}

function generatedBackground(rule) {
  const item = baseItem(rule.name, "background", descriptionBlock(rule.name, [], rule.feature?.description || "Background imported from Shinobi Forge."), rule.id, "background");
  Object.assign(item.system, { advancement: [] });
  return item;
}

function generatedEquipment(name, sourceId = "") {
  const item = baseItem(name, "loot", descriptionBlock(name, [["Source", "Shinobi Forge inventory"]]), sourceId, "equipment");
  item.img = "icons/svg/item-bag.svg";
  Object.assign(item.system, { quantity: 1, weight: { value: 0, units: "bulk" }, price: { value: 0, denomination: "ryo" } });
  return item;
}

function featuresAtLevel(rule, level, kind) {
  if (!rule?.featuresByLevel) return [];
  return Object.entries(rule.featuresByLevel)
    .filter(([featureLevel]) => Number(featureLevel) <= Number(level))
    .flatMap(([featureLevel, features]) => features.map((feature) => ({
      feature,
      level: Number(featureLevel),
      kind,
      sourceId: `${rule.id}:${featureLevel}:${slug(feature.name)}`,
      sourceName: rule.name,
    })));
}

function savingThrowKeys(classRule) {
  return new Set((classRule?.combatProficiencies?.savingThrows || []).map((name) => ABILITY_KEYS[normalizeName(name)]).filter(Boolean));
}

function averagePool(die, level, constitution) {
  const sides = Number.parseInt(String(die || "8").replace(/\D/g, ""), 10) || 8;
  const safeLevel = Math.max(1, Number(level) || 1);
  const modifier = Math.floor(((Number(constitution) || 10) - 10) / 2);
  return Math.max(1, sides + modifier) + (Math.max(0, safeLevel - 1) * Math.max(1, Math.floor(sides / 2) + 1 + modifier));
}

function grantedSkillIds(character, classRule, backgroundRule) {
  const sources = [
    { key: "class", groups: classRule?.skillGrants || [] },
    { key: "background", groups: backgroundRule?.proficiencyGrants?.skills || [] },
  ];
  const granted = new Set();
  for (const source of sources) {
    for (const group of source.groups) {
      const chosen = group.fixed ? group.options : (character.proficiencies?.grantChoices?.[group.id] || []).slice(0, group.count);
      for (const originalSkillId of chosen) {
        const replacementKey = `overlap-${source.key}-${group.id}-${originalSkillId}`;
        const skillId = granted.has(originalSkillId)
          ? character.proficiencies?.grantChoices?.[replacementKey]?.[0]
          : originalSkillId;
        if (skillId) granted.add(skillId);
      }
    }
  }
  return granted;
}

function actorSystem(character, classRule, backgroundRule, clanRule) {
  const saves = savingThrowKeys(classRule);
  const abilities = Object.fromEntries(Object.entries(ABILITY_KEYS).map(([longName, key]) => [key, {
    value: Number(character.abilities?.[longName] ?? character.baseAbilities?.[longName]) || 10,
    proficient: saves.has(key) ? 1 : 0.5,
  }]));
  const skills = {};
  const automaticSkills = grantedSkillIds(character, classRule, backgroundRule);
  const skillIds = new Set([
    ...Object.keys(character.proficiencies?.skills || {}),
    ...automaticSkills,
  ]);
  for (const skillId of skillIds) {
    const data = character.proficiencies?.skills?.[skillId];
    const key = SKILL_KEYS[skillId];
    if (!key) continue;
    const manualDegree = Number(typeof data === "number" ? data : data?.degree) || 0;
    const degree = Math.max(manualDegree, automaticSkills.has(skillId) ? 1 : 0);
    // N5eB stores basic proficiency separately from its three mastery ranks.
    skills[key] = {
      value: degree >= 1 ? 1 : 0,
      mastery: Math.min(3, Math.max(0, degree - 1)),
      ability: SKILL_ABILITIES[skillId],
      bonuses: { check: "", passive: "" },
    };
  }
  const constitution = abilities.con.value;
  const hp = averagePool(classRule?.hitDie, character.level, constitution);
  const chakra = averagePool(classRule?.chakraDie, character.level, constitution);
  return {
    abilities,
    skills,
    attributes: {
      inspiration: 0,
      hp: { value: hp, max: hp },
      chakra: { value: chakra, max: chakra },
    },
    details: {
      biography: { value: html(character.notes || ""), public: "" },
      alignment: character.alignment || "",
      originalClass: slug(classRule?.name),
      xp: { value: 0 },
    },
    traits: {
      armorProf: {
        value: [],
        custom: [...(classRule?.combatProficiencies?.armor || []), character.capabilities?.trainingExtras?.armor].filter(Boolean).join("; "),
      },
      weaponProf: {
        value: [],
        custom: [...(classRule?.combatProficiencies?.weapons || []), character.capabilities?.trainingExtras?.weapons].filter(Boolean).join("; "),
      },
      languages: { value: [], custom: "" },
    },
    currency: { ryo: Number(character.equipment?.ryo) || 0 },
  };
}

function equipmentNames(character, backgroundRule) {
  const result = [];
  for (const item of character.equipment?.items || []) {
    if (item?.name) result.push({ name: item.name, quantity: Math.max(1, Number(item.quantity) || 1), sourceId: item.id || "" });
  }
  for (const [groupId, choice] of Object.entries(character.equipment?.startingChoices || {})) {
    const details = character.equipment?.startingDetails?.[groupId];
    const names = Array.isArray(details) && details.length ? details : [choice];
    for (const name of names) if (name) result.push({ name, quantity: 1, sourceId: `starting:${groupId}` });
  }
  for (const toolkit of character.proficiencies?.toolkits || []) {
    if (toolkit?.name) result.push({ name: toolkit.name, quantity: 1, sourceId: toolkit.id || "" });
  }
  for (const toolkit of backgroundRule?.proficiencyGrants?.toolkits || []) {
    if (toolkit) result.push({ name: toolkit, quantity: 1, sourceId: `${backgroundRule.id}:toolkit:${slug(toolkit)}` });
  }
  for (const toolkit of character.proficiencies?.grantChoices?.[`background-toolkit-${backgroundRule?.id}`] || []) {
    if (toolkit) result.push({ name: toolkit, quantity: 1, sourceId: `${backgroundRule.id}:toolkit-choice:${slug(toolkit)}` });
  }
  return result;
}

function stripDocumentIdentity(item) {
  const clone = typeof structuredClone === "function" ? structuredClone(item) : JSON.parse(JSON.stringify(item));
  delete clone._id;
  delete clone.folder;
  delete clone.sort;
  delete clone.ownership;
  delete clone.permission;
  delete clone._stats;
  return clone;
}

async function resolveOrGenerate(resolveItem, request, fallback) {
  const resolved = resolveItem ? await resolveItem(request) : null;
  if (!resolved) return fallback;
  const item = stripDocumentIdentity(resolved);
  item.flags ||= {};
  item.flags["shinobi-forge-importer"] = {
    ...(item.flags["shinobi-forge-importer"] || {}),
    sourceId: request.sourceId,
    kind: request.kind,
    generated: false,
  };
  return item;
}

export async function buildImportData(character, rules, { resolveItem } = {}) {
  if (!character || character.schema !== "naruto5e-character") throw new Error("This is not a Shinobi Forge Naruto 5e character file.");
  const byId = indexRules(rules);
  const classRule = byId.get(character.classId);
  const subclassRule = byId.get(character.subclassId);
  const clanRule = byId.get(character.clanId);
  const backgroundRule = byId.get(character.backgroundId);
  if (!classRule) throw new Error(`The class ID ${character.classId || "(missing)"} is not present in the bundled rules.`);
  if (!clanRule) throw new Error(`The clan ID ${character.clanId || "(missing)"} is not present in the bundled rules.`);

  const items = [];
  const classItem = await resolveOrGenerate(resolveItem, { name: classRule.name, kind: "class", sourceId: classRule.id, preferredTypes: ["class"] }, generatedClass(classRule, character.level));
  classItem.system ||= {};
  classItem.system.levels = Number(character.level) || 1;
  items.push(classItem);
  if (subclassRule) items.push(await resolveOrGenerate(resolveItem, { name: subclassRule.name, kind: "subclass", sourceId: subclassRule.id, preferredTypes: ["subclass"] }, generatedSubclass(subclassRule, classRule)));
  items.push(await resolveOrGenerate(resolveItem, { name: clanRule.name, kind: "clan", sourceId: clanRule.id, preferredTypes: ["race", "feat"] }, generatedClan(clanRule)));
  if (backgroundRule) items.push(await resolveOrGenerate(resolveItem, { name: backgroundRule.name, kind: "background", sourceId: backgroundRule.id, preferredTypes: ["background", "feat"] }, generatedBackground(backgroundRule)));

  const featureSources = [
    ...featuresAtLevel(classRule, character.level, "classFeature"),
    ...featuresAtLevel(subclassRule, character.level, "subclassFeature"),
    ...featuresAtLevel(clanRule, character.level, "clanFeature"),
  ];
  if (backgroundRule?.feature?.name) featureSources.push({ feature: backgroundRule.feature, kind: "backgroundFeature", sourceId: `${backgroundRule.id}:feature`, sourceName: backgroundRule.name });
  for (const entry of featureSources) {
    items.push(await resolveOrGenerate(resolveItem, { name: entry.feature.name, kind: entry.kind, sourceId: entry.sourceId, preferredTypes: ["feat"] }, generatedFeature(entry.feature, entry.sourceId, entry.kind, entry.sourceName)));
  }

  const unresolvedJutsu = [];
  for (const selection of character.jutsu || []) {
    const rule = byId.get(selection.id);
    if (!rule) {
      unresolvedJutsu.push(selection.name || selection.id);
      continue;
    }
    items.push(await resolveOrGenerate(resolveItem, { name: rule.name, kind: "jutsu", sourceId: rule.id, preferredTypes: ["spell"] }, generatedJutsu(rule)));
  }

  for (const entry of equipmentNames(character, backgroundRule)) {
    const fallback = generatedEquipment(entry.name, entry.sourceId);
    fallback.system.quantity = entry.quantity;
    const item = await resolveOrGenerate(resolveItem, { name: entry.name, kind: "equipment", sourceId: entry.sourceId, preferredTypes: ["weapon", "equipment", "consumable", "tool", "loot", "container"] }, fallback);
    if (item.system && "quantity" in item.system) item.system.quantity = entry.quantity;
    items.push(item);
  }

  const actor = {
    name: character.name || "Imported Shinobi",
    type: "character",
    img: "icons/svg/mystery-man.svg",
    system: actorSystem(character, classRule, backgroundRule, clanRule),
    flags: {
      "shinobi-forge-importer": {
        schemaVersion: character.schemaVersion,
        appVersion: character.appVersion,
        importedAt: new Date().toISOString(),
        source: character,
      },
    },
  };
  return { actor, items, warnings: unresolvedJutsu.map((name) => `Jutsu not found in bundled rules: ${name}`) };
}
