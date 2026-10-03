// Builds the Alexa interaction model from the skill's own intents and the
// slot values derived from config, so the model can't drift from the code.
const { createApp } = require("./skill");

const INVOCATION_NAME = "cat flap";

const silentLogger = { error() {}, warn() {}, info() {}, debug() {} };

function slotId(value) {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

function buildModel(config) {
  const app = createApp({ config, client: {}, logger: silentLogger });
  const model = JSON.parse(app.schemas.askcli(INVOCATION_NAME));
  const languageModel = model.interactionModel.languageModel;

  languageModel.types.forEach((type) =>
    type.values.forEach((value) => {
      value.id = slotId(value.name.value);
      if (value.name.synonyms.length === 0) delete value.name.synonyms;
    }),
  );

  // Dialog directives (ConfirmIntent before locking cats out, ElicitSlot when
  // Alexa didn't catch a cat's name) need the intent in the dialog model. The
  // skill drives the dialog itself, so nothing is required here.
  const dialogIntents = languageModel.intents.filter((intent) =>
    (intent.slots || []).some(
      (slot) => slot.name === "catname" || slot.name === "lockmode",
    ),
  );
  dialogIntents.forEach((intent) =>
    intent.slots
      .filter((slot) => slot.name === "catname")
      .forEach((slot) => (slot.samples = ["{catname}"])),
  );
  model.interactionModel.dialog = {
    intents: dialogIntents.map((intent) => ({
      name: intent.name,
      delegationStrategy: "SKILL_RESPONSE",
      confirmationRequired: false,
      prompts: {},
      slots: intent.slots.map((slot) => ({
        name: slot.name,
        type: slot.type,
        confirmationRequired: false,
        elicitationRequired: false,
        prompts: {},
      })),
    })),
    delegationStrategy: "SKILL_RESPONSE",
  };

  return model;
}

module.exports = { buildModel, INVOCATION_NAME };
