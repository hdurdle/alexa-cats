const test = require("node:test");
const assert = require("node:assert/strict");

const defaults = require("../apps/catflap/defaults");
const { validateConfig } = require("../apps/catflap/config");
const { fixture } = require("./helpers");

const start = fixture("me-start.json");
const choices = {
  email: "me@example.com",
  password: "secret",
  householdId: 1234,
};

test("dateOnly keeps just the date", () => {
  assert.equal(defaults.dateOnly("2018-06-19T00:00:00+00:00"), "2018-06-19");
  assert.equal(defaults.dateOnly(null), undefined);
  assert.equal(defaults.dateOnly("not a date"), undefined);
});

test("only pet doors and cat flaps in the household count as flaps", () => {
  const { flaps, pets } = defaults.describeHousehold(start, 1234);
  assert.deepEqual(
    flaps.map((x) => x.id),
    [1001, 1002],
  );
  assert.deepEqual(
    pets.map((x) => x.name),
    ["Garfield", "Felix", "Tom"],
  );
});

test("a built config is valid and uses sensible defaults", () => {
  const config = defaults.buildConfig(start, choices);
  validateConfig(structuredClone(config));

  assert.equal(config.household, 1234);
  assert.deepEqual(config.flaps[0], {
    id: 0,
    in: "inside",
    out: "outside",
    name: "",
  });
  assert.deepEqual(config.flaps[1], {
    id: 1001,
    in: "inside",
    out: "outside",
    name: "Back Door",
    curfew: true,
  });
  assert.deepEqual(config.catdobs, [
    { name: "Garfield", dob: "2018-06-19" },
    { name: "Felix" },
    { name: "Tom", dob: "2015-03-01" },
  ]);
});

test("chosen pets and room names are used", () => {
  const config = defaults.buildConfig(start, {
    ...choices,
    petIds: [501, 503],
    rooms: { 1002: "conservatory" },
  });
  assert.deepEqual(
    config.catdobs.map((x) => x.name),
    ["Garfield", "Tom"],
  );
  assert.equal(config.flaps.find((x) => x.id === 1002).in, "conservatory");
});

test("a rebuild keeps earlier settings", () => {
  const previous = {
    applicationId: "amzn1.ask.skill.test",
    alexa: { name: "My Cat Flap", locale: "en-GB" },
    flaps: [
      {
        id: 1001,
        in: "kitchen",
        out: "garden",
        name: "Old Name",
        curfew: false,
        icon: "fa-door",
      },
    ],
    catdobs: [
      { name: "Felix", dob: "2020-01-15", synonyms: ["Fee"] },
      { name: "Tom", dod: "2025-01-01" },
    ],
  };
  const config = defaults.buildConfig(start, choices, previous);

  assert.equal(config.applicationId, "amzn1.ask.skill.test");
  assert.deepEqual(config.alexa, previous.alexa);
  assert.deepEqual(config.flaps[1], {
    id: 1001,
    in: "kitchen",
    out: "garden",
    name: "Back Door",
    curfew: false,
    icon: "fa-door",
  });
  assert.deepEqual(
    config.catdobs.find((x) => x.name === "Felix"),
    { name: "Felix", dob: "2020-01-15", synonyms: ["Fee"] },
  );
  assert.equal(config.catdobs.find((x) => x.name === "Tom").dod, "2025-01-01");
});
