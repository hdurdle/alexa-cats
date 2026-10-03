const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  parseNumbers,
  cleanDomain,
  readEnv,
  addNickname,
} = require("../scripts/setup");
const {
  buildManifest,
  withEndpoint,
  certificateType,
} = require("../scripts/alexa-skill");

test("parseNumbers picks valid list positions", () => {
  assert.deepEqual(parseNumbers("3 5, 7", 6), [3, 5]);
  assert.deepEqual(parseNumbers("", 6), []);
  assert.deepEqual(parseNumbers("2 2 0", 6), [2]);
});

test("cleanDomain strips scheme, path and case", () => {
  assert.equal(
    cleanDomain(" https://Abc-Def.ngrok-free.app/ "),
    "abc-def.ngrok-free.app",
  );
});

test("readEnv reads KEY=value lines", () => {
  const file = path.join(os.tmpdir(), `env-${process.pid}`);
  fs.writeFileSync(
    file,
    "NGROK_AUTHTOKEN=abc\r\nNGROK_DOMAIN = x.ngrok-free.app\n# note\n",
  );
  assert.deepEqual(readEnv(file), {
    NGROK_AUTHTOKEN: "abc",
    NGROK_DOMAIN: "x.ngrok-free.app",
  });
  fs.unlinkSync(file);
  assert.deepEqual(readEnv(file), {});
});

test("ngrok's shared domains need the wildcard certificate type", () => {
  assert.equal(
    certificateType("https://abc.ngrok-free.app/alexa/catflap"),
    "Wildcard",
  );
  assert.equal(
    certificateType("https://cats.example.com/alexa/catflap"),
    "Trusted",
  );
});

test("a new skill's manifest has its name, locale and endpoint", () => {
  const { manifest } = buildManifest({
    name: "My Cat Flap",
    locale: "en-GB",
    endpoint: "https://abc.ngrok-free.app/alexa/catflap",
  });
  assert.equal(
    manifest.publishingInformation.locales["en-GB"].name,
    "My Cat Flap",
  );
  assert.deepEqual(manifest.apis.custom.endpoint, {
    uri: "https://abc.ngrok-free.app/alexa/catflap",
    sslCertificateType: "Wildcard",
  });
});

test("updating an existing skill changes only its endpoint", () => {
  const current = {
    manifest: {
      publishingInformation: { locales: { "en-GB": {}, "en-US": {} } },
      apis: { custom: { endpoint: { uri: "https://old.example.com/x" } } },
      events: { subscriptions: [] },
    },
  };
  const updated = withEndpoint(
    current,
    "https://cats.example.com/alexa/catflap",
  );
  assert.deepEqual(updated.manifest.apis.custom.endpoint, {
    uri: "https://cats.example.com/alexa/catflap",
    sslCertificateType: "Trusted",
  });
  assert.deepEqual(
    Object.keys(updated.manifest.publishingInformation.locales),
    ["en-GB", "en-US"],
  );
  assert.deepEqual(updated.manifest.events, { subscriptions: [] });
  assert.equal(
    current.manifest.apis.custom.endpoint.uri,
    "https://old.example.com/x",
  );
});

test("addNickname adds a synonym once", () => {
  const config = { catdobs: [{ name: "Tilly" }, { name: "Tom" }] };
  addNickname(config, "Tilly", " Fluffy ");
  addNickname(config, "Tilly", "fluffy");
  addNickname(config, "Tilly", "");
  addNickname(config, "Nobody", "Ghost");
  assert.deepEqual(config.catdobs, [
    { name: "Tilly", synonyms: ["Fluffy"] },
    { name: "Tom" },
  ]);
});
