// Builds a config.json from what the SureFlap account already knows, so
// nobody has to write one by hand. Pure functions: the setup wizard
// (scripts/setup.js) fetches the data and asks the questions.

// product_id values for pet doors and cat flaps; hubs (1) and feeders are
// left out. 6 = Cat Flap Connect, 3 = Pet Door Connect.
const FLAP_PRODUCTS = [3, 6];

function isFlap(device) {
  return FLAP_PRODUCTS.includes(device.product_id);
}

// "2016-05-01T00:00:00+00:00" -> "2016-05-01", or undefined
function dateOnly(value) {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value || "");
  return match ? match[1] : undefined;
}

function householdItems(items, householdId) {
  return (items || []).filter(
    (x) => x.household_id === undefined || x.household_id === householdId,
  );
}

// The pets and flaps in one household, from GET /api/me/start
function describeHousehold(start, householdId) {
  return {
    pets: householdItems(start.pets, householdId).map((pet) => ({
      id: pet.id,
      name: pet.name,
      dob: dateOnly(pet.date_of_birth),
    })),
    flaps: householdItems(start.devices, householdId)
      .filter(isFlap)
      .map((device) => ({ id: device.id, name: device.name })),
  };
}

// choices: { email, password, householdId, petIds, rooms: { flapId: name } }
// previous: an existing config, whose room names, curfew flags, icons,
// synonyms and skill id are kept
function buildConfig(start, choices, previous = {}) {
  const { pets, flaps } = describeHousehold(start, choices.householdId);
  const previousFlap = (id) => (previous.flaps || []).find((x) => x.id === id);
  const previousCat = (name) =>
    (previous.catdobs || []).find((x) => x.name === name);
  const included = choices.petIds
    ? pets.filter((pet) => choices.petIds.includes(pet.id))
    : pets;

  const config = {
    email: choices.email,
    password: choices.password,
    household: choices.householdId,
    applicationId: previous.applicationId || "",
    logLevel: previous.logLevel || "info",
    flaps: [
      { id: 0, in: "inside", out: "outside", name: "" },
      ...flaps.map((flap) => {
        const old = previousFlap(flap.id) || {};
        const room = (choices.rooms || {})[flap.id] || old.in || "inside";
        const entry = {
          id: flap.id,
          in: room,
          out: old.out || "outside",
          name: flap.name,
          curfew: old.curfew === undefined ? true : old.curfew,
        };
        if (old.icon) entry.icon = old.icon;
        return entry;
      }),
    ],
    catdobs: included.map((pet) => {
      const old = previousCat(pet.name) || {};
      const entry = { name: pet.name };
      const dob = pet.dob || old.dob;
      if (dob) entry.dob = dob;
      if (old.synonyms && old.synonyms.length) entry.synonyms = old.synonyms;
      if (old.dod) entry.dod = old.dod;
      return entry;
    }),
  };
  if (previous.alexa) config.alexa = previous.alexa;
  return config;
}

module.exports = {
  FLAP_PRODUCTS,
  isFlap,
  dateOnly,
  describeHousehold,
  buildConfig,
};
