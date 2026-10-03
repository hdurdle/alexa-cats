const test = require("node:test");
const assert = require("node:assert/strict");

const { applyEnv, validateConfig } = require("../apps/catflap/config");
const { fixture } = require("./helpers");

test("the test fixture config is valid", () => {
  validateConfig(fixture("config.json"));
});

test("environment variables override the file", () => {
  const config = applyEnv(fixture("config.json"), {
    SUREFLAP_EMAIL: "me@example.com",
    SUREFLAP_PASSWORD: "secret",
    SUREFLAP_HOUSEHOLD: "42",
  });
  assert.equal(config.email, "me@example.com");
  assert.equal(config.household, 42);
});

test("config-dist.json is a valid starting point", () => {
  const config = validateConfig(
    structuredClone(require("../apps/catflap/config-dist.json")),
  );
  assert.equal(config.applicationId, undefined);
});

test("a placeholder skill ID is ignored", () => {
  const config = fixture("config.json");
  config.applicationId = "amzn1.ask.skill.your-skill-id";
  assert.equal(validateConfig(config).applicationId, undefined);
});

test("the placeholder token doesn't count as a token", () => {
  const config = fixture("config.json");
  config.token = "your_sureflap_token_from_their_API";
  assert.throws(() => validateConfig(config), /email and password/);
});

test("all problems are reported together", () => {
  assert.throws(
    () =>
      validateConfig({ household: "x", flaps: [{ id: 5, in: "a", out: "b" }] }),
    (error) => {
      assert.match(error.message, /email and password/);
      assert.match(error.message, /household/);
      assert.match(error.message, /"id": 0/);
      assert.match(error.message, /catdobs/);
      return true;
    },
  );
});

test("duplicate flap ids are reported", () => {
  const config = fixture("config.json");
  config.flaps.push({ ...config.flaps[1] });
  assert.throws(() => validateConfig(config), /duplicate flap ids: 1001/);
});
