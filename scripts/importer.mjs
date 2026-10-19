import { buildImportData, normalizeName } from "./converter.mjs";
import { buildEnemyImportData } from "./enemy-converter.mjs";

const MODULE_ID = "shinobi-forge-importer";
const RULES_URL = `modules/${MODULE_ID}/data/rules.json`;
const ENEMY_RULES_URL = `modules/${MODULE_ID}/data/enemy-rules.json`;

const PACKS_BY_KIND = {
  jutsu: ["n5eb.jutsus", "n5eb.t7-jutsus", "n5eb.hb-jutsus"],
  class: ["n5eb.class", "n5eb.t7-class", "n5eb.hb-class"],
  subclass: ["n5eb.subclass", "n5eb.t7-subclass", "n5eb.hb-subclass"],
  clan: ["n5eb.clan", "n5eb.t7-clan", "n5eb.hb-clan"],
  background: ["n5eb.backgrounds", "n5eb.t7-backgrounds", "n5eb.hb-backgrounds"],
  classFeature: ["n5eb.class", "n5eb.t7-class", "n5eb.hb-class"],
  subclassFeature: ["n5eb.subclass", "n5eb.t7-subclass", "n5eb.hb-subclass"],
  clanFeature: ["n5eb.clan", "n5eb.t7-clan", "n5eb.hb-clan"],
  backgroundFeature: ["n5eb.backgrounds", "n5eb.t7-backgrounds", "n5eb.hb-backgrounds"],
  equipment: ["n5eb.items", "n5eb.t7-items", "n5eb.hb-items"],
  enemyTrait: ["n5eb.adversary-traits", "n5eb.traits-quirks", "n5eb.feats", "n5eb.t7-feats", "n5eb.hb-feats"],
  enemyWeapon: ["n5eb.items", "n5eb.t7-items", "n5eb.hb-items", "n5eb.class", "n5eb.t7-class", "n5eb.hb-class"],
};

let rulesPromise;
let enemyRulesPromise;

function loadRules() {
  rulesPromise ||= fetch(RULES_URL, { cache: "no-store" }).then((response) => {
    if (!response.ok) throw new Error(`Could not load importer rules (${response.status}).`);
    return response.json();
  });
  return rulesPromise;
}

function loadEnemyRules() {
  enemyRulesPromise ||= fetch(ENEMY_RULES_URL, { cache: "no-store" }).then((response) => {
    if (!response.ok) throw new Error(`Could not load enemy importer rules (${response.status}).`);
    return response.json();
  });
  return enemyRulesPromise;
}

function rootElement(html) {
  return html?.[0] || html;
}

function cloneSource(document) {
  return document.toObject ? document.toObject() : foundry.utils.deepClone(document);
}

class CompendiumResolver {
  constructor(enabled) {
    this.enabled = enabled;
    this.indexes = new Map();
  }

  async indexPack(packId) {
    if (this.indexes.has(packId)) return this.indexes.get(packId);
    const pack = game.packs.get(packId);
    if (!pack || pack.documentName !== "Item") {
      this.indexes.set(packId, null);
      return null;
    }
    const index = await pack.getIndex({ fields: ["name", "type"] });
    const lookup = new Map();
    for (const entry of index) {
      const key = normalizeName(entry.name);
      if (!lookup.has(key)) lookup.set(key, []);
      lookup.get(key).push(entry);
    }
    const result = { pack, lookup };
    this.indexes.set(packId, result);
    return result;
  }

  async resolve(request) {
    if (!this.enabled) return null;
    const preferredPackIds = PACKS_BY_KIND[request.kind] || [];
    const otherItemPackIds = [...game.packs]
      .filter((pack) => pack.documentName === "Item" && !preferredPackIds.includes(pack.collection))
      .map((pack) => pack.collection);
    const packIds = [...preferredPackIds, ...otherItemPackIds];
    for (const packId of packIds) {
      const indexed = await this.indexPack(packId);
      if (!indexed) continue;
      const candidates = indexed.lookup.get(normalizeName(request.name)) || [];
      const match = candidates.find((entry) => request.preferredTypes?.includes(entry.type)) || candidates[0];
      if (!match) continue;
      const document = await indexed.pack.getDocument(match._id);
      if (document) return cloneSource(document);
    }
    return null;
  }
}

async function importForgeFile(file, useCompendiums) {
  if (!file) throw new Error("Choose a Shinobi Forge JSON file first.");
  const payload = JSON.parse(await file.text());
  const resolver = new CompendiumResolver(useCompendiums);
  const result = payload?.schema === "naruto5e-character"
    ? await buildImportData(payload, await loadRules(), { resolveItem: (request) => resolver.resolve(request) })
    : await buildEnemyImportData(payload, await loadEnemyRules(), { resolveItem: (request) => resolver.resolve(request) });
  const { actor: actorData, items, warnings } = result;
  const actor = await Actor.create(actorData, { renderSheet: false });
  if (!actor) throw new Error("Foundry did not create the actor.");
  try {
    // N5eB advancement-bearing class, clan, background, and subclass items must
    // be embedded one at a time. Bulk creation is explicitly unsupported by the system.
    for (const item of items) await actor.createEmbeddedDocuments("Item", [item], { keepId: false });
  } catch (error) {
    await actor.delete();
    throw new Error(`Actor items could not be created, so the partial actor was removed. ${error.message}`);
  }
  actor.sheet?.render(true);
  return { actor, items, warnings, kind: result.kind || "character" };
}

function showImportDialog() {
  if (!game.user?.can("ACTOR_CREATE") && !game.user?.isGM) {
    ui.notifications.error("You do not have permission to create Actors.");
    return;
  }
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.hidden = true;
  document.body.append(input);
  const cleanup = () => input.remove();
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) {
      cleanup();
      return;
    }
    ui.notifications.info("Importing Shinobi Forge character…");
    try {
      const result = await importForgeFile(file, true);
      const nativeCount = result.items.filter((item) => !item.flags?.[MODULE_ID]?.generated).length;
      for (const warning of result.warnings) ui.notifications.warn(warning);
      const label = result.kind === "enemy" ? "enemy" : "character";
      ui.notifications.info(`Imported ${label} ${result.actor.name} with ${result.items.length} items (${nativeCount} from N5eB compendiums).`);
    } catch (error) {
      console.error(`${MODULE_ID} | Import failed`, error);
      ui.notifications.error(error.message || "Character import failed.");
    } finally {
      cleanup();
    }
  }, { once: true });
  input.click();
}

Hooks.once("init", () => {
  game.modules.get(MODULE_ID).api = {
    importForgeFile,
    importCharacterFile: importForgeFile,
    showImportDialog,
    loadRules,
    loadEnemyRules,
  };
});

Hooks.once("ready", () => {
  console.log(`${MODULE_ID} | Ready`);
});

Hooks.on("renderActorDirectory", (_application, html) => {
  const root = rootElement(html);
  if (!root || root.querySelector(".shinobi-forge-import-button")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "shinobi-forge-import-button";
  button.innerHTML = '<i class="fas fa-file-import"></i> Import Shinobi Forge JSON';
  button.addEventListener("click", showImportDialog);
  const header = root.querySelector(".directory-header .action-buttons") || root.querySelector(".directory-header");
  (header || root).append(button);
});
