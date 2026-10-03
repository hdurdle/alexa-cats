const test = require("node:test");
const assert = require("node:assert/strict");

const model = require("../apps/catflap/model");
const { fixture } = require("./helpers");

const config = fixture("config.json");

test("inside locations are the flap 'in' values except 'inside'", () => {
  assert.deepEqual(model.getInsideLocations(config.flaps), [
    "house",
    "conservatory",
  ]);
});

test("pets are located from the last flap used", () => {
  const cats = model.locatePets(fixture("pets.json"), config);
  const byName = Object.fromEntries(cats.map((x) => [x.name, x]));

  assert.equal(byName.Garfield.location, "house");
  assert.equal(byName.Garfield.tag_id, 9001);
  assert.equal(byName.Felix.location, "outside");
});

test("retired cats and cats without a dob entry are left out", () => {
  const names = model.locatePets(fixture("pets.json"), config).map((x) => x.name);
  assert.deepEqual(names, ["Garfield", "Felix"]);
});

test("a manually set position uses the id 0 flap", () => {
  const pet = fixture("pets.json").find((x) => x.name === "Tom");
  assert.equal(model.locatePet(pet, config).location, "inside");
});

test("devices without a battery reading are skipped", () => {
  const devices = model.summariseDevices(fixture("devices.json"), config);
  assert.deepEqual(
    devices.map((x) => x.id),
    [1001, 1002]
  );
});

test("device summary has battery, charge and configured icon", () => {
  const [backDoor, conservatory] = model.summariseDevices(
    fixture("devices.json"),
    config
  );
  assert.deepEqual(backDoor, {
    id: 1001,
    name: "Back Door",
    icon: "fa-home",
    battery: "5.95",
    charge: "half",
  });
  assert.equal(conservatory.icon, "fa-couch");
  assert.equal(conservatory.charge, "quarter");
});

test("charge buckets", () => {
  assert.equal(model.getCharge(4.9), "empty");
  assert.equal(model.getCharge(5.0), "quarter");
  assert.equal(model.getCharge(5.8), "half");
  assert.equal(model.getCharge(6.0), "full");
});
