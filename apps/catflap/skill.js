// The Alexa skill: intent wiring. API access, data shaping and speech
// formatting live in sureflap.js, model.js and speech.js.
const alexa = require("alexa-app");
const winston = require("winston");

const model = require("./model");
const {
  formatCatList,
  describeGroups,
  getAgeSpeechForCat,
  getSpeechForCat,
} = require("./speech");

const BATTERY_THRESHOLD = 5.2;
const UNKNOWN_CAT = "Sorry, I don't recognise that cat.";
const WHICH_CAT = "Which cat do you mean?";
const HELP =
  "You can ask where the cats are, who is outside, who has been out the " +
  "longest, who is locked in, or how the batteries are. You can also lock " +
  "or unlock the cat flaps.";

// LockMode slot values -> SureFlap locking codes
const LOCK_MODE_VALUES = [
  { value: "unlock", locking: 0, synonyms: ["unlocked", "open"] },
  {
    value: "keep in",
    locking: 1,
    synonyms: [
      "lock in",
      "keep pets in",
      "keep the cats in",
      "lock all cats in",
    ],
  },
  {
    value: "keep out",
    locking: 2,
    synonyms: [
      "lock out",
      "keep pets out",
      "keep the cats out",
      "lock all cats out",
    ],
  },
  {
    value: "lock",
    locking: 3,
    synonyms: [
      "lock both ways",
      "lock completely",
      "lock the cat flap both ways",
    ],
  },
];

// lock modes that can strand a cat, so Alexa asks first
const CONFIRM_LOCKING = {
  2: "That will stop the cats getting back in. Are you sure?",
  3: "That will stop the cats going in or out. Are you sure?",
};

function createLogger(config) {
  const { combine, timestamp, prettyPrint } = winston.format;
  return winston.createLogger({
    level: process.env.LOG_LEVEL || config.logLevel || "info",
    format: combine(timestamp(), prettyPrint()),
    transports: [new winston.transports.Console()],
  });
}

// only the skill's own intents need SureFlap data; launch, session end and
// built-in intents don't
function needsData(request) {
  if (request.type() !== "IntentRequest") return false;
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

  // Each request gets its own copy of the SureFlap data, on req.ctx, so
  // concurrent requests can't see each other's state.
  alexaApp.pre = async function (request) {
    if (!needsData(request)) return;

    const [pets, devices] = await Promise.all([
      client.getPets(),
      client.getDevices(),
    ]);
    logger.debug(pets);
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

  // required in every interaction model
  alexaApp.intent("AMAZON.NavigateHomeIntent", function (req, res) {
    res.say("Bye.");
  });

  alexaApp.sessionEnded(function () {
    logger.info("session ended");
  });

  // Slot types for the interaction model (see interaction-model.js). Cat
  // and room names come from config, so the public repo holds none of them.
  alexaApp.customSlot("InOut", [
    { value: "in", synonyms: ["inside", "indoors", "home", "here"] },
    { value: "out", synonyms: ["outside", "outdoors"] },
  ]);
  alexaApp.customSlot(
    "PetName",
    catdobs
      .filter((x) => !Object.hasOwn(x, "dod"))
      .map((x) => ({ value: x.name, synonyms: x.synonyms || [] })),
  );
  alexaApp.customSlot("PetLocation", [
    ...new Set([
      ...flaps.map((x) => x.in).filter((x) => x !== "inside"),
      "outside",
    ]),
  ]);
  alexaApp.customSlot(
    "LockMode",
    LOCK_MODE_VALUES.map(({ value, synonyms }) => ({ value, synonyms })),
  );

  alexaApp.intent(
    "GetCatsLocationIntent",
    {
      utterances: [
        "where are the cats",
        "where are the kitties",
        "where the cats are",
        "where everyone is",
      ],
    },
    function (req, res) {
      logger.info("GetCatsLocationIntent");

      const cats = [...req.ctx.cats].sort(byName);
      const inside = cats.filter((x) =>
        allInsideLocations.includes(x.location),
      );
      const outside = cats.filter(
        (x) => !allInsideLocations.includes(x.location),
      );
      const speech = describeGroups([
        [inside, "inside"],
        [outside, "outside"],
      ]);

      logger.info(speech);
      res.say(speech);
    },
  ); // GetCatsLocationIntent

  alexaApp.intent(
    "GetAgeOfCatIntent",
    {
      slots: {
        catname: "PetName",
      },
      utterances: ["how old is {catname}", "how old {catname} is"],
    },
    requireCat(function (req, res) {
      logger.info("GetAgeOfCatIntent");

      const catName = getMatchedCat(req);
      const catDetail = catdobs.find((x) => x.name === catName);
      const speech = catDetail ? getAgeSpeechForCat(catDetail) : UNKNOWN_CAT;

      logger.info(speech);
      res.say(speech);
    }),
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
        (x) => x.battery < BATTERY_THRESHOLD,
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
    },
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
    requireCat(function (req, res) {
      logger.info("GetLocationOfCatIntent");

      const cat = findCat(req);
      const speech = cat ? getSpeechForCat(cat, true) : UNKNOWN_CAT;

      logger.info(speech);
      res.say(speech);
    }),
  ); //GetLocationOfCatIntent

  // who has been somewhere the longest (earliest since) or shortest
  function durationHandler(name, pick) {
    return function (req, res) {
      logger.info(name);

      const location = getMatchedLocation(req);
      const cat = pick(catsIn(req, location).sort(bySince));
      const speech = cat
        ? getSpeechForCat(cat, true)
        : "No kitties are " + describeLocation(location) + ".";

      logger.info(speech);
      res.say(speech);
    };
  }

  alexaApp.intent(
    "GetLongestDurationIntent",
    {
      slots: {
        inout: "InOut",
        locationname: "PetLocation",
      },
      utterances: [
        "who has been {inout} the longest",
        "who's been {inout} the longest",
        "who has been in the {locationname} the longest",
        "who's been in the {locationname} the longest",
      ],
    },
    durationHandler("GetLongestDurationIntent", (cats) => cats[0]),
  ); // GetLongestDurationIntent

  alexaApp.intent(
    "GetShortestDurationIntent",
    {
      slots: {
        inout: "InOut",
        locationname: "PetLocation",
      },
      utterances: [
        "who has been {inout} the shortest",
        "who's been {inout} the shortest",
        "who has been {inout} for the shortest time",
        "who has been in the {locationname} the shortest",
        "who came {inout} last",
      ],
    },
    durationHandler(
      "GetShortestDurationIntent",
      (cats) => cats[cats.length - 1],
    ),
  ); // GetShortestDurationIntent

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
    },
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
    requireCat(function (req, res) {
      logger.info("GetCatInLocationDurationIntent");

      const cat = findCat(req);
      const speech = cat ? getSpeechForCat(cat) : UNKNOWN_CAT;

      logger.info(speech);
      res.say(speech);
    }),
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
    requireCat(async function (req, res) {
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
    }),
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
    requireCat(async function (req, res) {
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
        const profile = keepIn
          ? model.PROFILE_KEPT_IN
          : model.PROFILE_ALLOWED_OUT;

        const results = await Promise.allSettled(
          curfewFlaps.map((flap) => {
            logger.info("Setting permission on " + flap.name);
            return client.setTagProfile(flap.id, cat.tag_id, profile);
          }),
        );
        const failed = curfewFlaps.filter(
          (flap, i) => results[i].status === "rejected",
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
    }),
  ); // SetCatPermissionIntent

  alexaApp.intent(
    "GetCatsPermissionIntent",
    {
      utterances: [
        "who is locked in",
        "who is kept in",
        "which cats are locked in",
        "which cats are allowed out",
        "if the cats are allowed out",
      ],
    },
    function (req, res) {
      logger.info("GetCatsPermissionIntent");

      const cats = [...req.ctx.cats].sort(byName);
      const { keptIn, allowedOut } = model.getPermissions(
        cats,
        req.ctx.devices,
        config,
      );
      const speech = describeGroups([
        [keptIn, "kept in"],
        [allowedOut, "allowed out"],
      ]);

      logger.info(speech);
      res.say(speech);
    },
  ); // GetCatsPermissionIntent

  alexaApp.intent(
    "GetLockStatusIntent",
    {
      utterances: [
        "is the cat flap locked",
        "are the cat flaps locked",
        "if the cat flap is locked",
        "about the lock status",
        "the lock status",
      ],
    },
    function (req, res) {
      logger.info("GetLockStatusIntent");

      const flapsWithLock = model
        .realFlaps(req.ctx.devices, config)
        .filter((x) => x.locking !== undefined);
      const modes = [...new Set(flapsWithLock.map((x) => x.locking))];

      let speech;
      if (flapsWithLock.length === 0) {
        speech = "I couldn't find any cat flaps.";
      } else if (modes.length === 1) {
        speech =
          describeFlaps(flapsWithLock, "All the cat flaps are ") +
          model.LOCK_MODES[modes[0]] +
          ".";
      } else {
        speech = flapsWithLock
          .map((x) => x.name + " is " + model.LOCK_MODES[x.locking] + ".")
          .join(" ");
      }

      logger.info(speech);
      res.say(speech);
    },
  ); // GetLockStatusIntent

  alexaApp.intent(
    "SetLockModeIntent",
    {
      slots: {
        lockmode: "LockMode",
      },
      utterances: [
        "to {lockmode}",
        "to {lockmode} the cat flap",
        "to {lockmode} the cat flaps",
        "to set the cat flaps to {lockmode}",
      ],
    },
    async function (req, res) {
      logger.info("SetLockModeIntent");

      const mode = getMatchedLockMode(req);
      if (mode === null) {
        res.say("Sorry, I didn't catch how to set the cat flaps.");
        return;
      }

      if (CONFIRM_LOCKING[mode] && req.confirmationStatus !== "CONFIRMED") {
        if (req.confirmationStatus === "DENIED") {
          res.say("Okay, I won't change the cat flaps.");
          return;
        }
        res
          .say(CONFIRM_LOCKING[mode])
          .directive({
            type: "Dialog.ConfirmIntent",
            updatedIntent: req.data.request.intent,
          })
          .shouldEndSession(false);
        return;
      }

      const flapsToSet = model.realFlaps(req.ctx.devices, config);
      const results = await Promise.allSettled(
        flapsToSet.map((flap) => client.setLocking(flap.id, mode)),
      );
      const failed = flapsToSet.filter(
        (x, i) => results[i].status === "rejected",
      );
      results
        .filter((x) => x.status === "rejected")
        .forEach((x) => logger.error(x.reason));

      let speech;
      if (flapsToSet.length === 0) {
        speech = "I couldn't find any cat flaps.";
      } else if (failed.length === flapsToSet.length) {
        speech = "Sorry, I couldn't update the cat flaps.";
      } else {
        speech =
          "Okay, " +
          describeFlaps(flapsToSet, "the cat flaps are ") +
          model.LOCK_MODES[mode] +
          ".";
        if (failed.length > 0) {
          speech += " But I couldn't update " + formatCatList(failed) + ".";
        }
      }

      logger.info(speech);
      res.say(speech);
    },
  ); // SetLockModeIntent

  // "Back Door is " for one flap, otherwise the given phrase
  function describeFlaps(devices, several) {
    return devices.length > 1 ? several : devices[0].name + " is ";
  }

  // the SureFlap locking code for the lockmode slot, or null
  function getMatchedLockMode(request) {
    const spoken = resolvedValue(request.slots["lockmode"]);
    if (!spoken) return null;
    const value = spoken.toLowerCase();
    const mode = LOCK_MODE_VALUES.find(
      (x) => x.value === value || x.synonyms.includes(value),
    );
    return mode ? mode.locking : null;
  }

  // Wraps a handler that needs a cat: if Alexa didn't catch a name, ask
  // "Which cat?" and wait for the answer instead of guessing.
  function requireCat(handler) {
    return function (req, res) {
      const slot = req.slots["catname"];
      if (!slot || !slot.value) {
        logger.info("No cat name; asking which cat");
        res
          .say(WHICH_CAT)
          .reprompt(WHICH_CAT)
          .directive({
            type: "Dialog.ElicitSlot",
            slotToElicit: "catname",
            updatedIntent: req.data.request.intent,
          })
          .shouldEndSession(false);
        return;
      }
      return handler(req, res);
    };
  }

  // the located cat named in the catname slot, or null
  function findCat(req) {
    const catName = getMatchedCat(req);
    const cat = req.ctx.cats.find((x) => x.name === catName) || null;
    if (!cat) {
      const heard = req.slots["catname"] && req.slots["catname"].value;
      logger.info(`Couldn't find cat: heard "${heard}", matched "${catName}"`);
    }
    return cat;
  }

  function catsIn(req, location) {
    return req.ctx.cats.filter((x) => location.names.includes(x.location));
  }

  // "outside", "inside", "in the house"
  function describeLocation(location) {
    return (
      (insideLocations.includes(location.label) ? "in the " : "") +
      location.label
    );
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

module.exports = { createApp, createLogger, WHICH_CAT };
