// Turns SureFlap API payloads plus config into the shapes the intents use.
// Pure functions: no I/O, so they can be tested with fixture data.
const { sameName } = require("./names");

// locations that take "in the" in speech, e.g. "in the house"
function getInsideLocations(flaps) {
  return flaps.map((x) => x.in).filter((x) => x !== "inside");
}

// lock modes for PUT /device/{id}/control
const LOCK_MODES = {
  0: "unlocked",
  1: "set to keep pets in",
  2: "set to keep pets out",
  3: "locked both ways",
};

// tag profiles for PUT /device/{id}/tag/{tag}
const PROFILE_ALLOWED_OUT = 2;
const PROFILE_KEPT_IN = 3;

function locatePet(pet, config) {
  if (!pet || !pet.position) {
    return null;
  }

  // the position has no device_id when it was set manually in the app, and a
  // flap missing from config is treated the same way
  const deviceId = pet.position.device_id || 0;
  const lastFlapUsed = config.flaps.find((x) => x.id === deviceId) ||
    config.flaps.find((x) => x.id === 0) || { in: "inside", out: "outside" };

  const location =
    pet.position.where === 1 ? lastFlapUsed.in : lastFlapUsed.out;

  return {
    name: pet.name,
    location: location,
    since: pet.position.since,
    id: pet.id,
    tag_id: pet.tag.id,
  };
}

// Only cats listed in catdobs, and not retired with a dod, are reported.
// Names are matched ignoring accents and case, and the config spelling is
// used from then on, so "Bronte" in SureFlap and "Brontë" in config agree.
function locatePets(pets, config) {
  return pets
    .map((pet) => locatePet(pet, config))
    .filter(Boolean)
    .flatMap((cat) => {
      const catDetail = config.catdobs.find((x) => sameName(x.name, cat.name));
      if (!catDetail || Object.hasOwn(catDetail, "dod")) return [];
      return [{ ...cat, name: catDetail.name }];
    });
}

function getCharge(batteryValue) {
  if (batteryValue >= 6.0) return "full";
  if (batteryValue >= 5.8) return "half";
  if (batteryValue >= 5.0) return "quarter";
  return "empty";
}

function summariseDevices(devices, config) {
  return devices
    .filter((device) => device.status && device.status.battery !== undefined) // hubs have no battery
    .map((device) => {
      const batteryValue = parseFloat(device.status.battery);
      const flapConfig = config.flaps.find((x) => x.id === device.id);
      return {
        id: device.id,
        name: device.name,
        icon: (flapConfig && flapConfig.icon) || "fa-home",
        battery: batteryValue.toFixed(2),
        charge: getCharge(batteryValue),
        locking: device.control ? device.control.locking : undefined,
        tags: device.tags || [],
      };
    });
}

// the configured flaps (not the id 0 placeholder) that SureFlap reports
function realFlaps(devices, config) {
  return devices.filter((device) =>
    config.flaps.some((flap) => flap.id === device.id && flap.id > 0),
  );
}

// Splits cats into kept in and allowed out, from their tag profiles on the
// curfew flaps (or every flap, if none is marked for curfew). A cat counts as
// kept in if any of those flaps keeps it in.
function getPermissions(cats, devices, config) {
  const curfewIds = config.flaps.filter((x) => x.curfew).map((x) => x.id);
  const flaps = realFlaps(devices, config).filter(
    (x) => curfewIds.length === 0 || curfewIds.includes(x.id),
  );

  const keptIn = [];
  const allowedOut = [];
  cats.forEach((cat) => {
    const profiles = flaps
      .map((flap) => flap.tags.find((tag) => tag.id === cat.tag_id))
      .filter(Boolean)
      .map((tag) => tag.profile);
    if (profiles.includes(PROFILE_KEPT_IN)) keptIn.push(cat);
    else if (profiles.length > 0) allowedOut.push(cat);
  });
  return { keptIn, allowedOut };
}

module.exports = {
  LOCK_MODES,
  PROFILE_ALLOWED_OUT,
  PROFILE_KEPT_IN,
  realFlaps,
  getPermissions,
  getInsideLocations,
  locatePet,
  locatePets,
  getCharge,
  summariseDevices,
};
