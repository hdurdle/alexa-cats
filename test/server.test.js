const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const { createServer } = require("../server");
const { createApp } = require("../apps/catflap/skill");
const { createVerifier } = require("../apps/catflap/verify");
const h = require("./helpers");

const pki = (name) =>
  fs.readFileSync(path.join(__dirname, "fixtures", "pki", name), "utf8");

const testVerifier = () =>
  createVerifier({
    roots: [new crypto.X509Certificate(pki("root.pem"))],
    fetchCert: async () => pki("chain.pem"),
  });

// starts a server on a free port and returns its base URL
async function start(t, options = {}) {
  const config = { ...h.fixture("config.json"), ...options.config };
  const alexaApp = createApp({
    config,
    client: h.stubClient(),
    logger: h.silentLogger,
  });
  const server = createServer({
    alexaApp,
    logger: h.silentLogger,
    verify: false,
    ...options,
    config,
  }).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => server.close());
  return "http://localhost:" + server.address().port;
}

function post(base, body, headers = {}) {
  return fetch(base + "/alexa/catflap", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

test("healthz", async (t) => {
  const base = await start(t);
  const res = await fetch(base + "/healthz");
  assert.equal(res.status, 200);
});

test("answers an Alexa request", async (t) => {
  const base = await start(t);
  const res = await post(base, h.launchRequest());
  assert.equal(res.status, 200);
  assert.equal(h.speechOf(await res.json()), "I know where the cats are!");
});

test("rejects an unsigned request when verifying", async (t) => {
  const base = await start(t, { verify: testVerifier() });
  const res = await post(base, h.launchRequest());
  assert.equal(res.status, 400);
});

test("accepts a signed request when verifying", async (t) => {
  const base = await start(t, { verify: testVerifier() });
  const raw = JSON.stringify(h.launchRequest());
  const res = await post(base, raw, {
    signaturecertchainurl: "https://s3.amazonaws.com/echo.api/cert.pem",
    "signature-256": crypto
      .sign("RSA-SHA256", Buffer.from(raw), pki("leaf.key"))
      .toString("base64"),
  });
  assert.equal(res.status, 200);
});

test("rejects another skill's requests", async (t) => {
  const base = await start(t, {
    config: { applicationId: "amzn1.ask.skill.someone-else" },
  });
  const res = await post(base, h.launchRequest());
  assert.equal(res.status, 403);
});

test("accepts this skill's requests", async (t) => {
  const base = await start(t, { config: { applicationId: h.APPLICATION_ID } });
  const res = await post(base, h.launchRequest());
  assert.equal(res.status, 200);
});

test("schema is hidden unless debugging", async (t) => {
  const base = await start(t);
  assert.equal((await fetch(base + "/alexa/catflap?schema")).status, 404);
});

test("schema is served when debugging", async (t) => {
  const base = await start(t, { debug: true });
  const res = await fetch(base + "/alexa/catflap?schema");
  const schema = await res.json();
  assert.equal(
    schema.interactionModel.languageModel.invocationName,
    "cat flap",
  );
});
