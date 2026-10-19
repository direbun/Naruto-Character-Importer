import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildEnemyImportData } from "../scripts/enemy-converter.mjs";

const rules = JSON.parse(readFileSync(new URL("../data/enemy-rules.json", import.meta.url), "utf8"));
const hijutsuRule = rules.jutsu.find((entry) => /hijutsu/i.test(entry.keywords || ""));

const enemy = {
  id: "enemy-test",
  name: "Enemy Forge Test",
  concept: "A fast test adversary.",
  size: "Medium",
  level: 5,
  enemyClass: "Elite",
  rank: "C-Rank",
  role: "Caster (Ninjutsu)",
  clan: "Aburame",
  affiliation: "Hidden Leaf",
  classModTier: "None",
  playerCount: 4,
  armor: "Light",
  castingAbility: "Int",
  abilityOrder: ["Str", "Dex", "Con", "Int", "Wis", "Cha"],
  abilityAdjustments: { Str: 0, Dex: 0, Con: 0, Int: 0, Wis: 0, Cha: 0 },
  saveProficiencies: ["Dex", "Int"],
  skillProficiencies: ["Stealth", "Perception"],
  skillMasteryRanks: { Stealth: 1 },
  traits: [rules.traits[0].id],
  jutsu: [rules.jutsu[0].id, hijutsuRule.id],
  weapons: [rules.weapons[0].id],
  customActions: [{ id: "custom-one", name: "Smoke Bomb", type: "Bonus Action", detail: "Create smoke." }],
  speedAdjustment: 5,
  acAdjustment: 1,
  hpMultiplier: 1,
  chakraMultiplier: 1,
  damageReduction: 2,
  resistances: "Fire",
  immunities: "Poison",
  vulnerabilities: "Cold",
  senses: "Chakra sight 30 ft",
  languages: "Common",
  tactics: { opener: "Hide.", action: "Cast.", bonus: "Smoke.", reaction: "Retreat.", bloodied: "Flee." },
  notes: "Unit test.",
};

test("builds an N5eB adversary actor with native defaults and selected content", async () => {
  const result = await buildEnemyImportData({ format: "threat-forge", version: 1, enemy }, rules);
  assert.equal(result.kind, "enemy");
  assert.equal(result.actor.type, "npc");
  assert.equal(result.actor.system.details.adversary.enabled, true);
  assert.equal(result.actor.system.details.adversary.class, "elite");
  assert.equal(result.actor.system.details.adversary.role, "caster");
  assert.equal(result.actor.system.details.adversary.discipline, "ninjutsu");
  assert.equal(result.actor.system.attributes.senses.special, "Chakra sight 30 ft");
  assert.equal(result.actor.system.traits.dm.amount.ALL, "-2");
  assert.equal(result.actor.system.skills.ste.ability, "dex");
  assert.equal(result.actor.system.skills.ste.value, 1);
  assert.equal(result.actor.system.skills.ste.bonuses.check, "2");
  assert.equal(result.actor.system.skills.prc.ability, "wis");
  assert.equal(result.actor.system.resources.tenacity.spent, 0);
  assert.equal(result.actor.prototypeToken.disposition, -1);
  assert.equal(result.items.length, 5);
  assert.ok(result.items.some((item) => item.name === rules.jutsu[0].name));
  const hijutsu = result.items.find((item) => item.name === hijutsuRule.name);
  assert.equal(hijutsu.system.jutsu.type, "ninjutsu");
  assert.ok(hijutsu.system.jutsu.keywords.includes("hijutsu"));
  assert.ok(result.items.some((item) => item.name === "Smoke Bomb"));
});

test("rejects unrelated JSON", async () => {
  await assert.rejects(() => buildEnemyImportData({ hello: "world" }, rules), /not a Shinobi Enemy Forge/i);
});
