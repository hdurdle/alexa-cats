// The Alexa skill: intent wiring. API access, data shaping and speech
// formatting live in sureflap.js, model.js and speech.js.
const alexa = require("alexa-app");
const winston = require("winston");

const model = require("./model");
const {
  formatCatList,
  getAgeSpeechForCat,
  getSpeechForCat,
} = require("./speech");

const BATTERY_THRESHOLD = 5.2;
const UNKNOWN_CAT = "Sorry, I don't recognise that cat.";
const HELP =
  "You can ask where a cat is, who is outside, who has been out the longest, " +
  "or how the batteries are.";

function createLogger(config) {
  const { combine, timestamp, prettyPrint } = winston.format;
  return winston.createLogger({
    level: process.env.LOG_LEVEL || config.logLevel || "info",
    format: combine(timestamp(), prettyPrint()),
    transports: [new winston.transports.Console()],
  });
}

// built-in intents and session end don't need SureFlap data
function needsData(request) {
  if (request.type() === "SessionEndedRequest") return false;
  if (request.type() !== "IntentRequest") return true;
  return !request.data.request.intent.name.startsWith("AMAZON.");
}

function byName(a, b) {
  return a.name.localeCompare(b.name);
}

function bySince(a, b) {
  return a.since < b.since ? -1 : a.since > b.since ? 1 : 0;
}

function createApp({ config, client, logger = createLogger(config) }) {
  const flaps = config.flaps;
  const catdobs = config.catdobs;
  const insideLocations = model.getInsideLocations(flaps);
  const allInsideLocations = [...new Set(flaps.map((x) => x.in))];

  const alexaApp = new alexa.app("catflap");
  alexaApp.id = config.applicationId;

  // Each request gets its own copy of the SureFlap data, on req.ctx, so
  // concurrent requests can't see each other's state.
  alexaApp.pre = async function (request) {
    if (!needsData(request)) return;

    const pets = await client.getPets();
    logger.debug(pets);
    const devices = await client.getDevices();
    logger.debug(devices);

    request.ctx = {
      cats: model.locatePets(pets, config),
      devices: model.summariseDevices(devices, config),
    };
  };

  alexaApp.error = function (exception, request, response) {
    logger.error((exception && exception.stack) || exception);
    response.clear().say("Aw. Badness.");
  };

  alexaApp.launch(function (request, response) {
    logger.info("launch");
    response.say("I know where the cats are!");
    response.reprompt("Ask me where a cat is.");
    response.shouldEndSession(false);
  }); // launch

  alexaApp.intent("AMAZON.HelpIntent", function (req, res) {
    res.say(HELP).reprompt(HELP).shouldEndSession(false);
  });

  alexaApp.intent("AMAZON.FallbackIntent", function (req, res) {
    res
      .say("Sorry, I didn't get that. " + HELP)
      .reprompt(HELP)
      .shouldEndSession(false);
  });

  alexaApp.intent("AMAZON.StopIntent", function (req, res) {
    res.say("Bye.");
  });

  alexaApp.intent("AMAZON.CancelIntent", function (req, res) {
    res.say("Bye.");
  });

  alexaApp.sessionEnded(function () {
    logger.info("session ended");
  });

  alexaApp.intent(
    "GetAgeOfCatIntent",
    {
      slots: {
        catname: "PetName",
      },
      utterances: ["how old is {catname}", "how old {catname} is"],
    },
    function (req, res) {
      logger.info("GetAgeOfCatIntent");

      const catName = getMatchedCat(req);
      const catDetail = catdobs.find((x) => x.name === catName);
      const speech = catDetail ? getAgeSpeechForCat(catDetail) : UNKNOWN_CAT;

      logger.info(speech);
      res.say(speech);
    }
  ); // GetAgeOfCatIntent

  alexaApp.intent(
    "GetDeviceStatusIntent",
    {
      utterances: [
        "about battery",
        "about batteries",
        "is the battery okay",
        "how are the batteries",
        "for device status",
        "for status",
      ],
    },
    function (req, res) {
      logger.info("GetDeviceStatusIntent");

      const lowBatteryFlaps = req.ctx.devices.filter(
        (x) => x.battery < BATTERY_THRESHOLD
      );

      let speech;
      if (lowBatteryFlaps.length > 1) {
        speech = formatCatList(lowBatteryFlaps) + " batteries are low.";
      } else if (lowBatteryFlaps.length > 0) {
        speech = lowBatteryFlaps[0].name + " battery is low.";
      } else {
        speech = "All the batteries are okay.";
      }

      logger.info(speech);
      res.say(speech);
    }
  ); //GetDeviceStatusIntent

  alexaApp.intent(
    "GetLocationOfCatIntent",
    {
      slots: {
        catname: "PetName",
      },
      utterances: [
        "where's {catname}",
        "is {catname} outside",
        "is {catname} at home",
        "is {catname} out",
        "is {catname} in",
        "where is {catname}",
        "where {catname} is",
      ],
    },
    function (req, res) {
      logger.info("GetLocationOfCatIntent");

      const cat = findCat(req);
      const speech = cat ? getSpeechForCat(cat, true) : UNKNOWN_CAT;

      logger.info(speech);
      res.say(speech);
    }
  ); //GetLocationOfCatIntent

  alexaApp.intent(
    "GetLongestDurationIntent",
    {
      slots: {
        inout: "InOut",
      },
      utterances: [
        "who has been {inout} the longest",
        "who's been {inout} the longest",
      ],
    },
    function (req, res) {
      logger.info("GetLongestDurationIntent");

      const location = getMatchedLocation(req);
      const cat = catsIn(req, location).sort(bySince)[0];
      const speech = cat
        ? getSpeechForCat(cat, true)
        : "No kitties are " + describeLocation(location) + ".";

      logger.info(speech);
      res.say(speech);
    }
  ); // GetLongestDurationIntent

  alexaApp.intent(
    "GetCatsInLocationIntent",
    {
      slots: {
        locationname: "PetLocation",
        inout: "InOut",
      },
      utterances: [
        "who is {inout}",
        "who is in the {locationname}",
        "who's in the {locationname}",
        "who is at {inout}",
        "who is {locationname}",
      ],
    },
    function (req, res) {
      logger.info("GetCatsInLocationIntent");

      const location = getMatchedLocation(req);
      const cats = catsIn(req, location).sort(byName);

      let speech;
      if (cats.length > 1) {
        speech = formatCatList(cats) + " are ";
      } else if (cats.length > 0) {
        speech = cats[0].name + " is ";
      } else {
        speech = "No kitties are ";
      }
      speech += describeLocation(location) + ".";

      logger.info(speech);
      res.say(speech);
    }
  ); // GetCatsInLocationIntent

  alexaApp.intent(
    "GetCatInLocationDurationIntent",
    {
      slots: {
        catname: "PetName",
        inout: "InOut",
      },
      utterances: [
        "when did {catname} come {inout}",
        "when did {catname} go {inout}",
        "how long has {catname} been {inout}",
      ],
    },
    function (req, res) {
      logger.info("GetCatInLocationDurationIntent");

      const cat = findCat(req);
      const speech = cat ? getSpeechForCat(cat) : UNKNOWN_CAT;

      logger.info(speech);
      res.say(speech);
    }
  ); // GetCatInLocationDurationIntent

  alexaApp.intent(
    "SetLocationOfCatIntent",
    {
      slots: {
        catname: "PetName",
        inout: "InOut",
      },
      utterances: ["{catname} is {inout}"],
    },
    async function (req, res) {
      logger.info("SetLocationOfCatIntent");

      const cat = findCat(req);
      let speech;

      if (cat) {
        const location = getMatchedLocation(req);
        // where: 1 = inside, 2 = outside
        await client.setPosition(cat.id, location.inside ? 1 : 2);
        speech = "Okay, " + cat.name + " is " + location.label + ".";
      } else {
        speech = UNKNOWN_CAT;
      }

      logger.info(speech);
      res.say(speech);
    }
  ); // SetLocationOfCatIntent

  alexaApp.intent(
    "SetCatPermissionIntent",
    {
      slots: {
        catname: "PetName",
        inout: "InOut",
      },
      utterances: ["to keep {catname} {inout}", "to let {catname} {inout}"],
    },
    async function (req, res) {
      logger.info("SetCatPermissionIntent");

      const cat = findCat(req);
      const curfewFlaps = flaps.filter((x) => x.curfew);
      let speech;

      if (!cat) {
        speech = UNKNOWN_CAT;
      } else if (curfewFlaps.length === 0) {
        speech = "No cat flaps are set up for curfew.";
      } else {
        const keepIn = getMatchedLocation(req).inside;
        const profile = keepIn ? 3 : 2; // 3 = kept in, 2 = allowed out

        const results = await Promise.allSettled(
          curfewFlaps.map((flap) => {
            logger.info("Setting permission on " + flap.name);
            return client.setTagProfile(flap.id, cat.tag_id, profile);
          })
        );
        const failed = curfewFlaps.filter(
          (flap, i) => results[i].status === "rejected"
        );
        results
          .filter((x) => x.status === "rejected")
          .forEach((x) => logger.error(x.reason));

        if (failed.length === curfewFlaps.length) {
          speech = "Sorry, I couldn't update the cat flaps.";
        } else {
          speech =
            "Okay, " +
            cat.name +
            (keepIn ? " will be kept in." : " is allowed out.");
          if (failed.length > 0) {
            speech += " But I couldn't update " + formatCatList(failed) + ".";
          }
        }
      }

      logger.info(speech);
      res.say(speech);
    }
  ); // SetCatPermissionIntent

  // the located cat named in the catname slot, or null
  function findCat(req) {
    const catName = getMatchedCat(req);
    const cat = req.ctx.cats.find((x) => x.name === catName) || null;
    if (!cat) logger.info("Couldn't find cat: " + catName);
    return cat;
  }

  function catsIn(req, location) {
    return req.ctx.cats.filter((x) => location.names.includes(x.location));
  }

  // "outside", "inside", "in the house"
  function describeLocation(location) {
    return (insideLocations.includes(location.label) ? "in the " : "") +
      location.label;
  }

  // the cat name from the catname slot, or null
  function getMatchedCat(request) {
    const slot = request.slots["catname"];
    if (!slot) return null;

    if (slot.resolutions.length === 0) return slot.value || null;
    if (slot.resolutions[0].status === "ER_SUCCESS_MATCH") {
      return slot.resolutions[0].values[0].name;
    }
    return null;
  } // getMatchedCat(request)

  function resolvedValue(slot) {
    if (!slot || !slot.value) return null;
    const resolution = slot.resolutions[0];
    if (resolution && resolution.status === "ER_SUCCESS_MATCH") {
      return resolution.values[0].name;
    }
    return slot.value;
  }

  // Where the request is asking about, as { names, label, inside }:
  // names are the cat locations that count, label is what to say, and
  // inside says whether it means in (not outside).
  function getMatchedLocation(request) {
    const room = resolvedValue(request.slots["locationname"]);
    if (room) {
      return { names: [room], label: room, inside: room !== "outside" };
    }

    const inOut = resolvedValue(request.slots["inout"]);
    if (inOut && /^out/i.test(inOut)) {
      return { names: ["outside"], label: "outside", inside: false };
    }
    return { names: allInsideLocations, label: "inside", inside: true };
  } //getMatchedLocation(request)

  return alexaApp;
}

module.exports = { createApp, createLogger };
