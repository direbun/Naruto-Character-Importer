import { generatedFeature, generatedJutsu, normalizeName, slug } from "./converter.mjs";

const ABILITY_KEYS = { Str: "str", Dex: "dex", Con: "con", Int: "int", Wis: "wis", Cha: "cha" };
const SKILL_KEYS = {
  acrobatics: "acr",
  "animal handling": "ani",
  athletics: "ath",
  "chakra control": "ccl",
  crafting: "cra",
  deception: "dec",
  history: "his",
  illusions: "ill",
  insight: "ins",
  intimidation: "itm",
  investigation: "inv",
  "martial arts": "mar",
  medicine: "med",
  nature: "nat",
  ninshou: "nsh",
  perception: "prc",
  performance: "prf",
  persuasion: "per",
  "sleight of hand": "slt",
  stealth: "ste",
  survival: "sur",
};
const SIZE_KEYS = { tiny: "tiny", small: "sm", medium: "med", large: "lg", huge: "huge", gargantuan: "grg" };
const TOKEN_SIZES = { tiny: 0.5, sm: 1, med: 1, lg: 2, huge: 3, grg: 4 };

function clamp(value, min, max) {
  const number = Number(value);
  return Math.min(max, Math.max(min, Number.isFinite(number) ? number : min));
}

function levelRow(rules, level) {
  return rules.levels.find((row) => Number(row.level) === Number(level)) || rules.levels.find((row) => Number(row.level) === 1) || rules.levels[0];
}

function roleRow(rules, role) {
  return rules.roles.find((entry) => entry.name === role) || rules.roles.find((entry) => entry.name === "Generalist") || rules.roles[0];
}

function rankRow(rules, rank) {
  return rules.ranks.find((entry) => entry.name === rank) || rules.ranks[0];
}

export function calculateEnemy(rules, enemy) {
  const level = clamp(enemy.level, -3, 30);
  const levelStats = levelRow(rules, level);
  const role = roleRow(rules, enemy.role);
  const rank = rankRow(rules, enemy.rank);
  const enemyClass = rules.classes.includes(enemy.enemyClass) ? enemy.enemyClass : "Standard";
  const baseArray = ["Elite", "Solo"].includes(enemyClass) ? levelStats.eliteArray : levelStats.standardArray;
  const order = Array.isArray(enemy.abilityOrder) && enemy.abilityOrder.length === 6 ? enemy.abilityOrder : Object.keys(ABILITY_KEYS);
  const abilities = {};
  order.forEach((ability, index) => {
    abilities[ability] = Number(baseArray[index] || 0) + Number(enemy.abilityAdjustments?.[ability] || 0);
  });
  for (const ability of Object.keys(ABILITY_KEYS)) abilities[ability] ??= Number(enemy.abilityAdjustments?.[ability] || 0);
  const proficiency = Number(levelStats.proficiency || 0);
  const classHpBonus = enemyClass === "Elite" ? 1 : enemyClass === "Solo" ? 0.75 * clamp(enemy.playerCount, 1, 12) : enemyClass === "Minion" ? 0.0001 : 0;
  const hp = enemyClass === "Minion"
    ? Math.max(1, 10 + level)
    : Math.max(1, Math.floor((10 + abilities.Con * level + Number(rank.hitDieAverage || 0) * level * (1 + Number(role.hp || 0) + classHpBonus)) * Number(enemy.hpMultiplier || 1)));
  const chakra = Math.max(0, Math.floor((10 + abilities.Con * level + Number(rank.chakraDieAverage || 0) * level * (1 + Number(role.chakra || 0) + classHpBonus)) * Number(enemy.chakraMultiplier || 1)));
  const armorBonus = enemy.armor === "Heavy" ? 6
    : enemy.armor === "Medium" ? 4 + Math.floor(abilities.Dex / 2)
      : enemy.armor === "Caster" ? 1 + Number(abilities[enemy.castingAbility] || 0)
        : 1 + abilities.Dex;
  const tierBonus = level < 7 ? 0 : level < 11 ? 1 : level < 14 ? 2 : level < 17 ? 3 : 4;
  const classAc = enemyClass === "Minion" ? -2 : enemyClass === "Elite" ? 2 : enemyClass === "Solo" ? 4 : 0;
  const ac = Math.max(1, 10 + Math.ceil(level / 4) + armorBonus + tierBonus + classAc + Number(role.ac || 0) + Number(enemy.acAdjustment || 0));
  const speed = 30 + Number(role.speed || 0) + Number(enemy.speedAdjustment || 0);
  const tenacity = enemyClass === "Solo" ? Math.max(0, Math.floor(level)) : enemyClass === "Elite" ? Math.max(0, Math.floor(level * 0.5)) : 0;
  return { level, levelStats, role, rank, enemyClass, abilities, proficiency, hp, chakra, ac, speed, tenacity };
}

function html(value = "") {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
}

function biography(enemy) {
  const tactics = Object.entries(enemy.tactics || {}).filter(([, value]) => value)
    .map(([key, value]) => `<li><strong>${html(key[0].toUpperCase() + key.slice(1))}:</strong> ${html(value)}</li>`).join("");
  return [
    `<h2>${html(enemy.name || "Imported adversary")}</h2>`,
    `<p><strong>Concept:</strong> ${html(enemy.concept || "")}</p>`,
    `<p><strong>Clan:</strong> ${html(enemy.clan || "Generic")} &nbsp; <strong>Affiliation:</strong> ${html(enemy.affiliation || "Factionless")}</p>`,
    enemy.classModTier && enemy.classModTier !== "None" ? `<p><strong>Class modification:</strong> ${html(enemy.classModTier)}</p>` : "",
    tactics ? `<h3>Tactics</h3><ul>${tactics}</ul>` : "",
    enemy.damageReduction ? `<p><strong>Damage reduction:</strong> ${html(enemy.damageReduction)}</p>` : "",
    enemy.notes ? `<h3>Notes</h3><p>${html(enemy.notes)}</p>` : "",
  ].join("");
}

function adversaryRole(value = "") {
  const normalized = normalizeName(value);
  const caster = normalized.match(/^caster (ninjutsu|genjutsu|taijutsu)$/);
  if (caster) return { role: "caster", discipline: caster[1] };
  return { role: normalized.split(" ")[0] || "generalist", discipline: "" };
}

function abilityScore(modifier) {
  return clamp(10 + (Number(modifier) || 0) * 2, 1, 30);
}

function actorSkills(rules, enemy) {
  const proficient = new Set(enemy.skillProficiencies || []);
  const result = {};
  for (const skill of rules.skills || []) {
    const key = SKILL_KEYS[normalizeName(skill.name)];
    const ability = ABILITY_KEYS[skill.ability];
    if (!key || !ability) continue;
    const mastery = Math.max(0, Number(enemy.skillMasteryRanks?.[skill.name] || 0));
    const bonus = mastery ? String(mastery * 2) : "";
    result[key] = {
      ability,
      value: proficient.has(skill.name) || mastery ? 1 : 0,
      bonuses: { check: bonus, passive: bonus },
    };
  }
  return result;
}

function stripDocumentIdentity(item) {
  const clone = typeof structuredClone === "function" ? structuredClone(item) : JSON.parse(JSON.stringify(item));
  for (const key of ["_id", "folder", "sort", "ownership", "permission", "_stats"]) delete clone[key];
  return clone;
}

async function resolveOrGenerate(resolveItem, request, fallback) {
  const resolved = resolveItem ? await resolveItem(request) : null;
  const item = resolved ? stripDocumentIdentity(resolved) : fallback;
  item.flags ||= {};
  item.flags["shinobi-forge-importer"] = {
    ...(item.flags["shinobi-forge-importer"] || {}),
    sourceId: request.sourceId,
    kind: request.kind,
    generated: !resolved,
  };
  return item;
}

function actionFeature(action, sourceId, kind, sourceName) {
  return generatedFeature({
    name: action.name,
    description: action.detail || action.description || "Imported from Shinobi Enemy Forge.",
    action: action.type || "Action",
    cost: action.damage ? `${action.damage} ${action.damageType || ""}`.trim() : "",
  }, sourceId, kind, sourceName);
}

export async function buildEnemyImportData(payload, rules, { resolveItem } = {}) {
  const wrapped = payload?.format === "threat-forge" ? payload.enemy : payload?.enemy || payload;
  if (!wrapped || typeof wrapped !== "object" || !wrapped.enemyClass || !wrapped.name) {
    throw new Error("This is not a Shinobi Enemy Forge adversary file.");
  }
  const enemy = wrapped;
  const calculated = calculateEnemy(rules, enemy);
  const level = clamp(calculated.level, 1, 30);
  const role = adversaryRole(enemy.role);
  const castingAbility = ABILITY_KEYS[enemy.castingAbility] || "int";
  const size = SIZE_KEYS[normalizeName(enemy.size)] || "med";
  const initiativeBonus = enemy.enemyClass === "Elite" ? 2 : enemy.enemyClass === "Solo" ? 4 : enemy.enemyClass === "Minion" ? -2 : 0;
  const abilities = Object.fromEntries(Object.entries(ABILITY_KEYS).map(([source, key]) => [key, {
    value: abilityScore(calculated.abilities[source]),
    proficient: (enemy.saveProficiencies || []).includes(source) ? 1 : 0.5,
  }]));

  const actor = {
    name: enemy.name,
    type: "npc",
    img: "icons/svg/mystery-man.svg",
    system: {
      abilities,
      skills: actorSkills(rules, enemy),
      attributes: {
        init: { ability: "dex", bonus: initiativeBonus ? String(initiativeBonus) : "" },
        movement: { walk: calculated.speed, units: "ft" },
        senses: { special: enemy.senses || "" },
        ac: { calc: "custom", formula: String(calculated.ac), flat: calculated.ac },
        hp: { value: calculated.hp, max: calculated.hp, temp: 0, tempmax: 0, formula: "" },
        chakra: { value: calculated.chakra, max: calculated.chakra, temp: 0, tempmax: 0 },
        cd: { denomination: String(calculated.rank.chakraDie || "d6").toLowerCase(), max: level, spent: 0 },
        spellcasting: { ninjutsu: castingAbility, genjutsu: "wis", taijutsu: "dex" },
      },
      details: {
        biography: { value: biography(enemy), public: html(enemy.concept || "") },
        type: { value: "humanoid", subtype: enemy.clan && enemy.clan !== "Generic" ? enemy.clan : "", custom: "" },
        cr: level,
        adversary: {
          enabled: true,
          level,
          rank: normalizeName(enemy.rank).slice(0, 1) || "e",
          class: normalizeName(enemy.enemyClass) || "standard",
          role: role.role,
          discipline: role.discipline,
          clan: enemy.clan === "Generic" ? "" : enemy.clan || "",
          affiliation: enemy.affiliation === "Factionless" ? "" : enemy.affiliation || "",
          specialRoles: [],
          suppressedAutoPassives: [],
          fixedJutsuCost: true,
          migrated: false,
        },
      },
      resources: {
        tenacity: { max: calculated.tenacity, spent: 0, softMax: calculated.tenacity },
        eliteact: {
          max: enemy.enemyClass === "Solo" ? Math.max(1, Number(enemy.playerCount || 4) - 1) : enemy.enemyClass === "Elite" ? 1 : 0,
          spent: 0,
        },
      },
      traits: {
        size,
        dr: { value: [], bypasses: [], custom: enemy.resistances || "" },
        di: { value: [], bypasses: [], custom: enemy.immunities || "" },
        dv: { value: [], bypasses: [], custom: enemy.vulnerabilities || "" },
        dm: {
          amount: Number(enemy.damageReduction) > 0 ? { ALL: String(-Math.abs(Number(enemy.damageReduction))) } : {},
          bypasses: [],
        },
        languages: { value: [], custom: enemy.languages || "" },
      },
      source: { book: "Shinobi Enemy Forge" },
    },
    prototypeToken: {
      name: enemy.name,
      actorLink: false,
      disposition: -1,
      width: TOKEN_SIZES[size],
      height: TOKEN_SIZES[size],
      bar1: { attribute: "attributes.hp" },
      bar2: { attribute: "attributes.chakra" },
    },
    flags: {
      "shinobi-forge-importer": {
        sourceType: "enemy",
        format: payload?.format || "threat-forge",
        version: payload?.version || 1,
        importedAt: new Date().toISOString(),
        source: payload,
      },
    },
  };

  const items = [];
  const warnings = [];
  for (const id of enemy.traits || []) {
    const rule = rules.traits.find((entry) => entry.id === id);
    if (!rule) { warnings.push(`Enemy trait not found in bundled rules: ${id}`); continue; }
    const fallback = generatedFeature({ name: rule.name, description: rule.description, action: "None", cost: rule.rank }, rule.id, "enemyTrait", rule.source || "Enemy Forge");
    items.push(await resolveOrGenerate(resolveItem, { name: rule.name, kind: "enemyTrait", sourceId: rule.id, preferredTypes: ["feat"] }, fallback));
  }
  for (const id of enemy.jutsu || []) {
    const rule = rules.jutsu.find((entry) => entry.id === id);
    if (!rule) { warnings.push(`Enemy jutsu not found in bundled rules: ${id}`); continue; }
    const fallback = generatedJutsu({ ...rule, classification: rule.discipline });
    items.push(await resolveOrGenerate(resolveItem, { name: rule.name, kind: "jutsu", sourceId: rule.id, preferredTypes: ["spell"] }, fallback));
  }
  for (const id of enemy.weapons || []) {
    const rule = rules.weapons.find((entry) => entry.id === id);
    if (!rule) { warnings.push(`Enemy weapon not found in bundled rules: ${id}`); continue; }
    const fallback = actionFeature({ ...rule, type: "Action", detail: `${rule.attackType || "Weapon attack"}; ${rule.range || ""}; ${rule.damage || ""} ${rule.damageType || ""}. ${rule.qualities || ""}` }, rule.id, "enemyWeapon", "Enemy Forge");
    items.push(await resolveOrGenerate(resolveItem, { name: rule.name, kind: "enemyWeapon", sourceId: rule.id, preferredTypes: ["weapon"] }, fallback));
  }
  for (const action of enemy.customActions || []) {
    const sourceId = action.id || `custom:${slug(action.name)}`;
    items.push(actionFeature(action, sourceId, "enemyAction", "Enemy Forge"));
  }
  if (calculated.level < 1) warnings.push(`N5eB adversary levels begin at 1; ${enemy.name} was imported at level 1.`);
  return { actor, items, warnings, kind: "enemy" };
}
