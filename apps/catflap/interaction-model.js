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

  // Dialog.ConfirmIntent (used before locking cats out) needs the intent to
  // be in the dialog model; the skill handles confirmation itself
  model.interactionModel.dialog = {
    intents: [
      {
        name: "SetLockModeIntent",
        delegationStrategy: "SKILL_RESPONSE",
        confirmationRequired: false,
        prompts: {},
        slots: [
          {
            name: "lockmode",
            type: "LockMode",
            confirmationRequired: false,
            elicitationRequired: false,
            prompts: {},
          },
        ],
      },
    ],
    delegationStrategy: "SKILL_RESPONSE",
  };

  return model;
}

module.exports = { buildModel, INVOCATION_NAME };
