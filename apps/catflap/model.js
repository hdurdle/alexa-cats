// Turns SureFlap API payloads plus config into the shapes the intents use.
// Pure functions: no I/O, so they can be tested with fixture data.

// locations that take "in the" in speech, e.g. "in the house"
function getInsideLocations(flaps) {
  return flaps.map((x) => x.in).filter((x) => x !== "inside");
}

function locatePet(pet, config) {
  if (!pet || !pet.position) {
    return null;
  }

  // the position has no device_id when it was set manually in the app
  const deviceId = pet.position.device_id || 0;
  const lastFlapUsed = config.flaps.find((x) => x.id === deviceId);

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

// only cats listed in catdobs, and not retired with a dod, are reported
function locatePets(pets, config) {
  return pets
    .map((pet) => locatePet(pet, config))
    .filter((cat) => {
      if (!cat) return false;
      const catDetail = config.catdobs.find((x) => x.name === cat.name);
      return catDetail !== undefined && !catDetail.hasOwnProperty("dod");
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
      };
    });
}

module.exports = {
  getInsideLocations,
  locatePet,
  locatePets,
  getCharge,
  summariseDevices,
};
