// Builders for Alexa request JSON and a stub SureFlap client.
const fs = require("fs");
const path = require("path");

const APPLICATION_ID = "amzn1.ask.skill.test";

function fixture(name) {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8")
  );
}

// a slot value that entity resolution matched to `resolved`
function matched(name, value, resolved = value) {
  return {
    name,
    value,
    resolutions: {
      resolutionsPerAuthority: [
        {
          authority: "amzn1.er-authority.test",
          status: { code: "ER_SUCCESS_MATCH" },
          values: [{ value: { name: resolved, id: resolved.toUpperCase() } }],
        },
      ],
    },
  };
}

// a slot value that entity resolution did not match
function unmatched(name, value, code = "ER_SUCCESS_NO_MATCH") {
  return {
    name,
    value,
    resolutions: {
      resolutionsPerAuthority: [
        { authority: "amzn1.er-authority.test", status: { code } },
      ],
    },
  };
}

function envelope(request) {
  const application = { applicationId: APPLICATION_ID };
  const user = { userId: "amzn1.ask.account.test" };
  return {
    version: "1.0",
    session: { new: true, sessionId: "session", application, user },
    context: { System: { application, user } },
    request: {
      requestId: "request",
      timestamp: new Date().toISOString(),
      locale: "en-GB",
      ...request,
    },
  };
}

function intentRequest(name, slots = [], confirmationStatus = "NONE") {
  const slotMap = {};
  slots.forEach((slot) => (slotMap[slot.name] = slot));
  return envelope({
    type: "IntentRequest",
    dialogState: confirmationStatus === "NONE" ? undefined : "IN_PROGRESS",
    intent: { name, confirmationStatus, slots: slotMap },
  });
}

function launchRequest() {
  return envelope({ type: "LaunchRequest" });
}

function sessionEndedRequest() {
  return envelope({ type: "SessionEndedRequest", reason: "USER_INITIATED" });
}

// records writes so tests can assert on them
function stubClient(overrides = {}) {
  const calls = [];
  return {
    calls,
    getPets: async () => fixture("pets.json"),
    getDevices: async () => fixture("devices.json"),
    setPosition: async (...args) => calls.push(["setPosition", ...args]),
    setTagProfile: async (...args) => calls.push(["setTagProfile", ...args]),
    setLocking: async (...args) => calls.push(["setLocking", ...args]),
    ...overrides,
  };
}

const silentLogger = {
  error() {},
  warn() {},
  info() {},
  debug() {},
};

// the plain text of a response, with SSML tags stripped
function speechOf(response) {
  const ssml = response.response.outputSpeech.ssml;
  return ssml
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = {
  APPLICATION_ID,
  fixture,
  matched,
  unmatched,
  intentRequest,
  launchRequest,
  sessionEndedRequest,
  stubClient,
  silentLogger,
  speechOf,
};
