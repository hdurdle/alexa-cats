// Builds the Alexa interaction model from the skill's own intents and the
// slot values derived from config, so the model can't drift from the code.
const { createApp, WHICH_CAT } = require("./skill");
const { normalizeName, stripAccents } = require("./names");

const INVOCATION_NAME = "cat flap";

const silentLogger = { error() {}, warn() {}, info() {}, debug() {} };

// "Brontë" -> "BRONTE", "keep in" -> "KEEP_IN"
function slotId(value) {
  return normalizeName(value).toUpperCase().replace(/ /g, "_");
}

function buildModel(config) {
  const app = createApp({ config, client: {}, logger: silentLogger });
  const model = JSON.parse(app.schemas.askcli(INVOCATION_NAME));
  const languageModel = model.interactionModel.languageModel;

  // alexa-app runs samples through alexa-utterances, which turns
  // "where is {catname}" into "where is catname". Use the code's utterances
  // as written instead; they don't use any expansion syntax.
  languageModel.intents.forEach((intent) => {
    intent.samples = [...(app.intents[intent.name].utterances || [])];
  });

  // Values keep their configured spelling, and any accented value or synonym
  // also gets its plain spelling as a synonym, so Alexa resolves "bronte" to
  // "Brontë". (Listing only the plain spelling stopped Alexa recognising
  // "where is bronte" at all.) IDs are always plain.
  languageModel.types.forEach((type) =>
    type.values.forEach((value) => {
      const forms = [value.name.value, ...value.name.synonyms];
      const plainForms = forms
        .filter((x) => stripAccents(x) !== x)
        .map(normalizeName);
      const synonyms = [];
      [...value.name.synonyms, ...plainForms].forEach((x) => {
        const seen = [value.name.value, ...synonyms];
        if (!seen.some((y) => y.toLowerCase() === x.toLowerCase())) {
          synonyms.push(x);
        }
      });

      value.id = slotId(value.name.value);
      if (synonyms.length > 0) value.name.synonyms = synonyms;
      else delete value.name.synonyms;
    }),
  );

  // Dialog directives (ConfirmIntent before locking cats out, ElicitSlot when
  // Alexa didn't catch a cat's name) need a dialog model, and Alexa only
  // counts it as one if some slot is required. So catname is marked required
  // with a prompt, as the original hand-made model did. With SKILL_RESPONSE
  // delegation Alexa still sends the request to the skill, which asks for the
  // name itself (see requireCat in skill.js).
  const dialogIntents = languageModel.intents.filter((intent) =>
    (intent.slots || []).some(
      (slot) => slot.name === "catname" || slot.name === "lockmode",
    ),
  );
  const prompts = [];
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
      slots: intent.slots.map((slot) => {
        const dialogSlot = {
          name: slot.name,
          type: slot.type,
          confirmationRequired: false,
          elicitationRequired: false,
          prompts: {},
        };
        if (slot.name === "catname") {
          const id = `Elicit.Slot.${intent.name}.catname`;
          prompts.push({
            id,
            variations: [{ type: "PlainText", value: WHICH_CAT }],
          });
          dialogSlot.elicitationRequired = true;
          dialogSlot.prompts = { elicitation: id };
        }
        return dialogSlot;
      }),
    })),
    delegationStrategy: "SKILL_RESPONSE",
  };
  model.interactionModel.prompts = prompts;

  return model;
}

module.exports = { buildModel, INVOCATION_NAME };
