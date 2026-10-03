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
  const dialogNames = model.dialog.intents.map((x) => x.name);
  assert.ok(dialogNames.includes("SetLockModeIntent"));
  assert.ok(dialogNames.includes("GetLocationOfCatIntent"));
});

test("samples keep their {slot} references", () => {
  const model = buildModel(fixture("config.json")).interactionModel;
  const location = model.languageModel.intents.find(
    (x) => x.name === "GetLocationOfCatIntent",
  );
  assert.ok(location.samples.includes("where is {catname}"));

  model.languageModel.intents.forEach((intent) => {
    const slotNames = (intent.slots || []).map((x) => x.name);
    const referenced = new Set(
      intent.samples.flatMap((x) =>
        [...x.matchAll(/\{(\w+)\}/g)].map((m) => m[1]),
      ),
    );
    slotNames.forEach((name) =>
      assert.ok(referenced.has(name), `${intent.name} never uses {${name}}`),
    );
    referenced.forEach((name) =>
      assert.ok(slotNames.includes(name), `${intent.name} has no slot ${name}`),
    );
    intent.samples.forEach((sample) =>
      slotNames.forEach((name) =>
        assert.doesNotMatch(
          sample,
          new RegExp(`(^|[^{])\\b${name}\\b(?!\\})`),
          `${intent.name}: bare slot name in "${sample}"`,
        ),
      ),
    );
  });
});

test("slot samples come with a dialog model Alexa accepts", () => {
  // Alexa rejects slot samples unless the dialog model has a required slot,
  // and every prompt the dialog refers to must exist
  const model = buildModel(fixture("config.json")).interactionModel;
  const promptIds = model.prompts.map((x) => x.id);
  const dialogSlots = model.dialog.intents.flatMap((x) => x.slots);

  assert.ok(dialogSlots.some((x) => x.elicitationRequired));
  dialogSlots
    .filter((x) => x.elicitationRequired)
    .forEach((x) => assert.ok(promptIds.includes(x.prompts.elicitation)));

  model.languageModel.intents.forEach((intent) =>
    (intent.slots || [])
      .filter((slot) => slot.samples.length > 0)
      .forEach((slot) =>
        assert.ok(
          model.dialog.intents.some(
            (x) =>
              x.name === intent.name &&
              x.slots.some((s) => s.name === slot.name),
          ),
          `${intent.name}.${slot.name} has samples but no dialog entry`,
        ),
      ),
  );
});

test("cat name slots can be elicited", () => {
  const model = buildModel(fixture("config.json")).interactionModel;
  const intent = model.languageModel.intents.find(
    (x) => x.name === "GetLocationOfCatIntent",
  );
  assert.deepEqual(intent.slots[0].samples, ["{catname}"]);
});

test("custom slot types used by intents are all defined", () => {
  const { languageModel } = buildModel(fixture("config.json")).interactionModel;
  const defined = languageModel.types.map((x) => x.name);
  languageModel.intents
    .flatMap((x) => x.slots || [])
    .filter((slot) => !slot.type.startsWith("AMAZON."))
    .forEach((slot) => assert.ok(defined.includes(slot.type), slot.type));
});
