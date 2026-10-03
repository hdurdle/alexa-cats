const test = require("node:test");
const assert = require("node:assert/strict");

const { createApp } = require("../apps/catflap/skill");
const h = require("./helpers");

function setup(clientOverrides) {
  const client = h.stubClient(clientOverrides);
  const app = createApp({
    config: h.fixture("config.json"),
    client,
    logger: h.silentLogger,
  });
  return { app, client };
}

async function ask(name, slots, clientOverrides) {
  const { app, client } = setup(clientOverrides);
  const response = await app.request(h.intentRequest(name, slots));
  return { response, speech: h.speechOf(response), client };
}

const cat = (name) => h.matched("catname", name);
const inOut = (value) => h.matched("inout", value);
const location = (value) => h.matched("locationname", value);

test("launch", async () => {
  const { app } = setup();
  const response = await app.request(h.launchRequest());
  assert.equal(h.speechOf(response), "I know where the cats are!");
  assert.equal(response.response.shouldEndSession, false);
});

test("where is a cat", async () => {
  const { speech } = await ask("GetLocationOfCatIntent", [cat("Garfield")]);
  assert.match(speech, /^Garfield has been in the house for .+\.$/);
});

test("where is an unrecognised cat", async () => {
  const { speech } = await ask("GetLocationOfCatIntent", [
    h.unmatched("catname", "Rover"),
  ]);
  assert.equal(speech, "Sorry, I don't recognise that cat.");
});

test("how long has a cat been out", async () => {
  const { speech } = await ask("GetCatInLocationDurationIntent", [
    cat("Felix"),
    inOut("out"),
  ]);
  assert.match(speech, /^Felix has been outside for .+\.$/);
});

test("how old is a cat", async () => {
  const { speech } = await ask("GetAgeOfCatIntent", [cat("Garfield")]);
  assert.match(speech, /^Garfield is .+ old\./);
});

test("who is out", async () => {
  const { speech } = await ask("GetCatsInLocationIntent", [inOut("out")]);
  assert.equal(speech, "Felix is outside.");
});

test("who is in a room", async () => {
  const { speech } = await ask("GetCatsInLocationIntent", [location("house")]);
  assert.equal(speech, "Garfield is in the house.");
});

test("nobody in a room", async () => {
  const { speech } = await ask("GetCatsInLocationIntent", [
    location("conservatory"),
  ]);
  assert.equal(speech, "No kitties are in the conservatory.");
});

test("who has been out the longest", async () => {
  const { speech } = await ask("GetLongestDurationIntent", [inOut("out")]);
  assert.match(speech, /^Felix has been outside for .+\.$/);
});

test("battery status names the low flaps", async () => {
  const { speech } = await ask("GetDeviceStatusIntent");
  assert.equal(speech, "Conservatory battery is low.");
});

test("battery status when all are fine", async () => {
  const devices = h
    .fixture("devices.json")
    .map((x) => (x.status.battery ? { ...x, status: { battery: 6.1 } } : x));
  const { speech } = await ask("GetDeviceStatusIntent", [], {
    getDevices: async () => devices,
  });
  assert.equal(speech, "All the batteries are okay.");
});

test("set a cat's position", async () => {
  const { speech, client } = await ask("SetLocationOfCatIntent", [
    cat("Felix"),
    inOut("in"),
  ]);
  assert.equal(speech, "Okay, Felix is inside.");
  assert.deepEqual(client.calls, [["setPosition", 502, 1]]);
});

test("keep a cat in sets the profile on curfew flaps only", async () => {
  const { speech, client } = await ask("SetCatPermissionIntent", [
    cat("Garfield"),
    inOut("in"),
  ]);
  assert.equal(speech, "Okay, Garfield will be kept in.");
  assert.deepEqual(client.calls, [["setTagProfile", 1001, 9001, 3]]);
});
