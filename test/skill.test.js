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

async function ask(name, slots, clientOverrides, confirmationStatus) {
  const { app, client } = setup(clientOverrides);
  const response = await app.request(
    h.intentRequest(name, slots, confirmationStatus)
  );
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

// regression tests for crash paths that used to end in "Aw. Badness."

test("where is a known cat with no dob entry", async () => {
  const { speech } = await ask("GetLocationOfCatIntent", [cat("Stray")]);
  assert.equal(speech, "Sorry, I don't recognise that cat.");
});

test("how old is an unknown cat", async () => {
  const { speech } = await ask("GetAgeOfCatIntent", [
    h.unmatched("catname", "Rover"),
  ]);
  assert.equal(speech, "Sorry, I don't recognise that cat.");
});

test("how long for an unknown cat", async () => {
  const { speech } = await ask("GetCatInLocationDurationIntent", [
    h.unmatched("catname", "Rover"),
  ]);
  assert.equal(speech, "Sorry, I don't recognise that cat.");
});

test("entity resolution errors don't leak the slot object", async () => {
  const { speech } = await ask("GetLocationOfCatIntent", [
    h.unmatched("catname", "Garfield", "ER_ERROR_TIMEOUT"),
  ]);
  assert.equal(speech, "Sorry, I don't recognise that cat.");
});

test("setting an unknown cat makes no API call", async () => {
  const { speech, client } = await ask("SetLocationOfCatIntent", [
    h.unmatched("catname", "Rover"),
    inOut("in"),
  ]);
  assert.equal(speech, "Sorry, I don't recognise that cat.");
  assert.deepEqual(client.calls, []);
});

test("longest duration with nobody there", async () => {
  const { speech } = await ask("GetLongestDurationIntent", [
    location("conservatory"),
  ]);
  assert.equal(speech, "No kitties are in the conservatory.");
});

test("who is in, with an unresolved slot", async () => {
  const { speech } = await ask("GetCatsInLocationIntent", [
    h.unmatched("inout", "indoors"),
  ]);
  assert.equal(speech, "Garfield is inside.");
});

test("inside doesn't depend on flap order", async () => {
  const config = h.fixture("config.json");
  config.flaps.reverse();
  const client = h.stubClient();
  const app = createApp({ config, client, logger: h.silentLogger });
  const response = await app.request(
    h.intentRequest("SetLocationOfCatIntent", [cat("Felix"), inOut("in")])
  );
  assert.equal(h.speechOf(response), "Okay, Felix is inside.");
  assert.deepEqual(client.calls, [["setPosition", 502, 1]]);
});

test("curfew writes are awaited and failures reported", async () => {
  const config = h.fixture("config.json");
  config.flaps.forEach((x) => (x.curfew = x.id > 0));
  const client = h.stubClient({
    setTagProfile: async (deviceId) => {
      if (deviceId === 1002) throw new Error("500");
      client.calls.push(["setTagProfile", deviceId]);
    },
  });
  const app = createApp({ config, client, logger: h.silentLogger });
  const response = await app.request(
    h.intentRequest("SetCatPermissionIntent", [cat("Garfield"), inOut("out")])
  );
  assert.equal(
    h.speechOf(response),
    "Okay, Garfield is allowed out. But I couldn't update conservatory."
  );
  assert.deepEqual(client.calls, [["setTagProfile", 1001]]);
});

test("each request sees its own data", async () => {
  // the first request's device call is slow, so the second request's pet
  // data arrives while the first is still in flight
  const oldPets = h.fixture("pets.json");
  const newPets = oldPets.map((x) =>
    x.name === "Garfield" ? { ...x, position: { ...x.position, where: 2 } } : x
  );
  const petResponses = [oldPets, newPets];
  const delays = [30, 0];
  const { app } = setup({
    getPets: async () => petResponses.shift(),
    getDevices: () =>
      new Promise((resolve) =>
        setTimeout(() => resolve(h.fixture("devices.json")), delays.shift())
      ),
  });

  const first = app.request(
    h.intentRequest("GetCatsInLocationIntent", [inOut("out")])
  );
  const second = app.request(
    h.intentRequest("GetCatsInLocationIntent", [inOut("out")])
  );

  assert.equal(h.speechOf(await first), "Felix is outside.");
  assert.equal(h.speechOf(await second), "Felix and Garfield are outside.");
});

test("API failure gives a spoken error, not a crash", async () => {
  const { speech } = await ask("GetLocationOfCatIntent", [cat("Garfield")], {
    getPets: async () => {
      throw new Error("timeout");
    },
  });
  assert.equal(speech, "Aw. Badness.");
});

for (const intent of ["AMAZON.StopIntent", "AMAZON.CancelIntent"]) {
  test(intent + " says bye without calling SureFlap", async () => {
    const { response, speech } = await ask(intent, [], {
      getPets: async () => assert.fail("should not fetch"),
    });
    assert.equal(speech, "Bye.");
    assert.equal(response.response.shouldEndSession, true);
  });
}

test("help keeps the session open", async () => {
  const { response, speech } = await ask("AMAZON.HelpIntent");
  assert.match(speech, /^You can ask where the cats are/);
  assert.equal(response.response.shouldEndSession, false);
});

test("launch has a reprompt and doesn't call SureFlap", async () => {
  const { app } = setup({ getPets: async () => assert.fail("should not fetch") });
  const response = await app.request(h.launchRequest());
  assert.ok(response.response.reprompt);
});

test("session end doesn't call SureFlap", async () => {
  const { app } = setup({ getPets: async () => assert.fail("should not fetch") });
  await app.request(h.sessionEndedRequest());
});

// features ported from PR #1

const lockMode = (value) => h.matched("lockmode", value);

test("where are the cats", async () => {
  const { speech } = await ask("GetCatsLocationIntent");
  assert.equal(speech, "Garfield is inside. Felix is outside.");
});

test("who has been out the shortest", async () => {
  const pets = h.fixture("pets.json").map((x) =>
    x.name === "Garfield"
      ? { ...x, position: { ...x.position, where: 2, since: "2026-10-03T07:00:00+00:00" } }
      : x
  );
  const { speech } = await ask("GetShortestDurationIntent", [inOut("out")], {
    getPets: async () => pets,
  });
  assert.match(speech, /^Garfield has been outside/);
});

test("who has been in a room the longest", async () => {
  const { speech } = await ask("GetLongestDurationIntent", [location("house")]);
  assert.match(speech, /^Garfield has been in the house/);
});

test("who is locked in", async () => {
  const { speech } = await ask("GetCatsPermissionIntent");
  assert.equal(speech, "Felix is kept in. Garfield is allowed out.");
});

test("lock status when flaps differ", async () => {
  const { speech } = await ask("GetLockStatusIntent");
  assert.equal(
    speech,
    "Back Door is unlocked. Conservatory is set to keep pets in."
  );
});

test("lock status when flaps agree", async () => {
  const devices = h
    .fixture("devices.json")
    .map((x) => (x.control ? { ...x, control: { locking: 3 } } : x));
  const { speech } = await ask("GetLockStatusIntent", [], {
    getDevices: async () => devices,
  });
  assert.equal(speech, "All the cat flaps are locked both ways.");
});

test("unlock sets every real flap without asking", async () => {
  const { speech, client } = await ask("SetLockModeIntent", [lockMode("unlock")]);
  assert.equal(speech, "Okay, the cat flaps are unlocked.");
  assert.deepEqual(client.calls, [
    ["setLocking", 1001, 0],
    ["setLocking", 1002, 0],
  ]);
});

test("keep in from a synonym that didn't resolve", async () => {
  const { speech, client } = await ask("SetLockModeIntent", [
    h.unmatched("lockmode", "keep the cats in"),
  ]);
  assert.equal(speech, "Okay, the cat flaps are set to keep pets in.");
  assert.equal(client.calls.length, 2);
});

for (const value of ["keep out", "lock"]) {
  test(value + " asks for confirmation first", async () => {
    const { response, speech, client } = await ask("SetLockModeIntent", [
      lockMode(value),
    ]);
    assert.match(speech, /Are you sure\?$/);
    assert.equal(response.response.shouldEndSession, false);
    assert.equal(response.response.directives[0].type, "Dialog.ConfirmIntent");
    assert.deepEqual(client.calls, []);
  });
}

test("confirmed lock goes ahead", async () => {
  const { speech, client } = await ask(
    "SetLockModeIntent",
    [lockMode("lock")],
    {},
    "CONFIRMED"
  );
  assert.equal(speech, "Okay, the cat flaps are locked both ways.");
  assert.equal(client.calls.length, 2);
});

test("denied lock does nothing", async () => {
  const { speech, client } = await ask(
    "SetLockModeIntent",
    [lockMode("lock")],
    {},
    "DENIED"
  );
  assert.equal(speech, "Okay, I won't change the cat flaps.");
  assert.deepEqual(client.calls, []);
});

test("an unknown lock mode", async () => {
  const { speech, client } = await ask("SetLockModeIntent", [
    h.unmatched("lockmode", "wibble"),
  ]);
  assert.equal(speech, "Sorry, I didn't catch how to set the cat flaps.");
  assert.deepEqual(client.calls, []);
});

test("a failed lock write is reported", async () => {
  const { speech } = await ask("SetLockModeIntent", [lockMode("unlock")], {
    setLocking: async (id) => {
      if (id === 1001) throw new Error("500");
    },
  });
  assert.equal(
    speech,
    "Okay, the cat flaps are unlocked. But I couldn't update Back Door."
  );
});
