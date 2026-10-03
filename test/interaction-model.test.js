const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { buildModel } = require("../apps/catflap/interaction-model");
const { fixture } = require("./helpers");

const dir = path.join(__dirname, "..", "apps", "catflap");
const read = (name) =>
  JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));

test("the committed example model is up to date (run npm run model:example)", () => {
  assert.deepEqual(
    read("interaction_model.json"),
    buildModel(read("config-dist.json")),
  );
});

test("slot values come from config", () => {
  const model = buildModel(fixture("config.json")).interactionModel;
  const types = Object.fromEntries(
    model.languageModel.types.map((x) => [x.name, x.values]),
  );

  assert.deepEqual(types.PetName, [
    { id: "GARFIELD", name: { value: "Garfield", synonyms: ["Garfy"] } },
    { id: "FELIX", name: { value: "Felix" } },
  ]);
  assert.deepEqual(
    types.PetLocation.map((x) => x.name.value),
    ["house", "conservatory", "outside"],
  );
  assert.deepEqual(
    types.LockMode.map((x) => x.id),
    ["UNLOCK", "KEEP_IN", "KEEP_OUT", "LOCK"],
  );
});

test("every intent the skill handles is in the model", () => {
  const model = buildModel(fixture("config.json")).interactionModel;
  const names = model.languageModel.intents.map((x) => x.name);
  for (const name of [
    "AMAZON.StopIntent",
    "AMAZON.NavigateHomeIntent",
    "SetCatPermissionIntent",
    "SetLockModeIntent",
    "GetLockStatusIntent",
  ]) {
    assert.ok(names.includes(name), name);
  }
  assert.equal(model.dialog.intents[0].name, "SetLockModeIntent");
});

test("custom slot types used by intents are all defined", () => {
  const { languageModel } = buildModel(fixture("config.json")).interactionModel;
  const defined = languageModel.types.map((x) => x.name);
  languageModel.intents
    .flatMap((x) => x.slots || [])
    .filter((slot) => !slot.type.startsWith("AMAZON."))
    .forEach((slot) => assert.ok(defined.includes(slot.type), slot.type));
});
