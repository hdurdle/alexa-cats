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
  const names = model
    .locatePets(fixture("pets.json"), config)
    .map((x) => x.name);
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
    [1001, 1002],
  );
});

test("device summary has battery, charge and configured icon", () => {
  const [backDoor, conservatory] = model.summariseDevices(
    fixture("devices.json"),
    config,
  );
  assert.deepEqual(backDoor, {
    id: 1001,
    name: "Back Door",
    icon: "fa-home",
    battery: "5.95",
    charge: "half",
    locking: 0,
    tags: [
      { id: 9001, profile: 2 },
      { id: 9002, profile: 3 },
    ],
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

test("a flap missing from config is treated like a manual position", () => {
  const pet = { ...fixture("pets.json")[0] };
  pet.position = { ...pet.position, device_id: 7777 };
  assert.equal(model.locatePet(pet, config).location, "inside");
});

test("real flaps exclude the id 0 entry and unknown devices", () => {
  const devices = model.summariseDevices(fixture("devices.json"), config);
  assert.deepEqual(
    model
      .realFlaps([...devices, { id: 0 }, { id: 4242 }], config)
      .map((x) => x.id),
    [1001, 1002],
  );
});

test("permissions come from curfew flaps only", () => {
  const cats = model.locatePets(fixture("pets.json"), config);
  const devices = model.summariseDevices(fixture("devices.json"), config);
  const { keptIn, allowedOut } = model.getPermissions(cats, devices, config);
  assert.deepEqual(
    keptIn.map((x) => x.name),
    ["Felix"],
  );
  assert.deepEqual(
    allowedOut.map((x) => x.name),
    ["Garfield"],
  );
});

test("permissions use every flap when none is marked for curfew", () => {
  const noCurfew = fixture("config.json");
  noCurfew.flaps.forEach((x) => delete x.curfew);
  const cats = model.locatePets(fixture("pets.json"), noCurfew);
  const devices = model.summariseDevices(fixture("devices.json"), noCurfew);
  const { keptIn, allowedOut } = model.getPermissions(cats, devices, noCurfew);
  // Felix is kept in by the back door and has no tag on the conservatory
  assert.deepEqual(
    keptIn.map((x) => x.name),
    ["Felix"],
  );
  assert.deepEqual(
    allowedOut.map((x) => x.name),
    ["Garfield"],
  );
});
