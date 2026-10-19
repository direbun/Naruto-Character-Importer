import test from "node:test";
import assert from "node:assert/strict";
import { buildImportData, generatedJutsu, normalizeName, rankToSpellLevel } from "../scripts/converter.mjs";

const rules = {
  classes: [{ id: "class-1", name: "Medical-Nin", hitDie: "8", chakraDie: "10", combatProficiencies: { savingThrows: ["Wisdom", "Constitution"] }, skillGrants: [{ id: "class-medical-fixed", fixed: true, count: 1, options: ["medicine"] }], featuresByLevel: { 1: [{ name: "First Aid", description: "Heal.", action: "Action", cost: "1 Chakra" }], 3: [{ name: "Late Feature", description: "Later." }] } }],
  subclasses: [{ id: "subclass-1", name: "Combat Medic", className: "Medical-Nin", featuresByLevel: { 2: [{ name: "Field Surgery", description: "Fast treatment." }] } }],
  clans: [{ id: "clan-1", name: "Senju", speed: "+30", featuresByLevel: { 1: [{ name: "Will of Fire", description: "Resolve." }] } }],
  backgrounds: [{ id: "background-1", name: "Healer", feature: { name: "Clinic Access", description: "A clinic." } }],
  jutsu: [{ id: "jutsu-1", name: "Mystical Palm", rank: "C-Rank", classification: "Ninjutsu", castingTime: "1 Action", range: "Touch", duration: "Instant", components: "CM", cost: "4 Chakra", description: "Healing chakra." }],
};

const character = {
  schema: "naruto5e-character",
  schemaVersion: 8,
  appVersion: "0.8.0",
  name: "Sakura",
  level: 2,
  classId: "class-1",
  subclassId: "subclass-1",
  clanId: "clan-1",
  backgroundId: "background-1",
  abilities: { strength: 10, dexterity: 12, constitution: 14, intelligence: 13, wisdom: 16, charisma: 8 },
  proficiencies: { skills: { medicine: { degree: 3 }, "chakra-control": { degree: 1 } }, grantChoices: {} },
  jutsu: [{ id: "jutsu-1", name: "Mystical Palm", level: 2 }],
  equipment: { ryo: 75, startingChoices: {}, startingDetails: {}, items: [{ id: "gear-1", name: "Medicine Kit", quantity: 2 }] },
};

test("normalizes names and maps N5E ranks", () => {
  assert.equal(normalizeName("  Mystical—Palm! "), "mystical palm");
  assert.equal(rankToSpellLevel("C-Rank"), 3);
  assert.equal(rankToSpellLevel("S-Rank"), 9);
});

test("builds a complete fallback actor and level-filtered items", async () => {
  const result = await buildImportData(character, rules);
  assert.equal(result.actor.name, "Sakura");
  assert.equal(result.actor.system.abilities.wis.value, 16);
  assert.equal(result.actor.system.abilities.wis.proficient, 1);
  assert.equal(result.actor.system.currency.ryo, 75);
  assert.equal(result.actor.system.attributes.hp.max, 17);
  assert.equal(result.actor.system.attributes.chakra.max, 20);
  assert.equal(result.actor.system.skills.med.value, 1);
  assert.equal(result.actor.system.skills.med.mastery, 2);
  assert.equal(result.actor.system.skills.med.ability, "wis");
  assert.equal(result.actor.system.skills.ccl.ability, "con");
  assert.equal(result.items.find((item) => item.name === "Medical-Nin").system.levels, 2);
  assert.equal(result.items.find((item) => item.name === "Mystical Palm").system.level, 3);
  assert.equal(result.items.find((item) => item.name === "Medicine Kit").system.quantity, 2);
  assert.ok(result.items.some((item) => item.name === "First Aid"));
  assert.ok(result.items.some((item) => item.name === "Field Surgery"));
  assert.ok(result.items.some((item) => item.name === "Will of Fire"));
  assert.ok(!result.items.some((item) => item.name === "Late Feature"));
});

test("generates current-schema hijutsu fallbacks from clan classifications", () => {
  const item = generatedJutsu({
    id: "jutsu-hijutsu-1",
    name: "Human Cocoon",
    classification: "Aburame",
    rank: "D-Rank",
    castingTime: "1 Action",
    duration: "Concentration, up to 1 minute",
    components: "HS, CM",
    cost: "Special",
    keywords: "Hijutsu, Ninjutsu",
  });
  assert.equal(item.system.jutsu.type, "ninjutsu");
  assert.deepEqual(item.system.jutsu.keywords, ["hijutsu", "ninjutsu"]);
  assert.deepEqual(item.system.jutsu.components, ["hs", "cm"]);
  assert.equal(item.system.school, "trs");
  assert.equal(item.system.rank, "d");
  assert.equal(item.system.level, 1);
  assert.equal(item.system.chakra.cost, "");
  assert.equal(item.system.chakra.special, "Special");
  assert.deepEqual(item.system.properties, ["concentration"]);
});

test("prefers a matching compendium document and annotates provenance", async () => {
  const result = await buildImportData(character, rules, {
    resolveItem: async ({ name, kind }) => name === "Mystical Palm" ? { _id: "source-id", name, type: "spell", system: { level: 2 }, flags: { existing: true }, _stats: {} } : null,
  });
  const jutsu = result.items.find((item) => item.name === "Mystical Palm");
  assert.equal(jutsu._id, undefined);
  assert.equal(jutsu.flags.existing, true);
  assert.equal(jutsu.flags["shinobi-forge-importer"].kind, "jutsu");
  assert.equal(jutsu.flags["shinobi-forge-importer"].generated, false);
});

test("rejects unrelated JSON", async () => {
  await assert.rejects(() => buildImportData({ schema: "other" }, rules), /not a Shinobi Forge/i);
});
