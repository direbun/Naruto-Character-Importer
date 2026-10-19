# Shinobi Forge Importer

This is a self-contained Foundry VTT v14 module for importing JSON exported by both Shinobi Forge builders:

- `.naruto5e.json` player characters from **Shinobi Forge Character Creator**;
- `.json` adversaries from **Shinobi Enemy Forge**.

It targets the **N5eB - Naruto 5e Benni** system. The importer copies exact matches from its native and installed add-on compendiums:

- classes and subclasses;
- class, subclass, and clan features available at the character's level;
- jutsu;
- equipment.

The bundled `data/rules.json` is keyed by the same stable IDs as the character creator. It supplies clan/background records and acts as a fallback whenever a native compendium entry cannot be found. The full original character JSON is retained under `flags.shinobi-forge-importer.source` on the created Actor.

## Install

1. Copy the whole folder into Foundry's `Data/modules/shinobi-forge-importer/` directory. The folder name must match the module ID exactly.
2. Restart Foundry.
3. Enable **Shinobi Forge Importer** in an N5eB world.

This build targets Foundry v14 and N5eB 3.1.1.

## Import a character or enemy

1. Export a character from Shinobi Forge or an adversary from Shinobi Enemy Forge.
2. Open Foundry's **Actors** sidebar.
3. Click **Import Shinobi Forge JSON**.
4. Choose the JSON file. Import begins immediately.

The module creates one character Actor and embeds its class, subclass, clan, background, currently unlocked features, selected jutsu, and recorded equipment. If any embedded item fails validation, it removes the partial Actor instead of leaving a broken import behind.

Enemy Forge files create hostile N5eB adversary NPC Actors. The importer preserves the calculated ability scores, saves, skills and mastery, Armor Class, Hit Points, Chakra, speed, rank, class, battlefield role, tenacity, elite actions, clan, affiliation, defenses, tactics, selected traits, jutsu, weapons, and custom actions. Installed N5eB compendiums are preferred for matching traits, jutsu, and weapons, with generated fallback items when no exact match exists.

Clan-specific hijutsu are imported with their underlying casting type (Ninjutsu, Genjutsu, Taijutsu, or Bukijutsu), the Hijutsu keyword, current N5eB rank levels, components, concentration, and special chakra costs.

## Developer check

From this folder, run:

```powershell
npm test
```

No package installation is required.

## Current boundaries

- Summons and puppets remain in the preserved source flag until their creator data can be mapped safely to N5eB's summon and puppet workflows.
- Hit Points and Chakra receive deterministic average totals from the imported level, Constitution, and class dice; N5eB then tracks the matching Hit Dice and Chakra Dice.
- The creator's Ryo value maps directly to N5eB's `ryo` currency field.
