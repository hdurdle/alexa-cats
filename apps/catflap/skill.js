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

function createLogger(config) {
  const { combine, timestamp, prettyPrint } = winston.format;
  return winston.createLogger({
    format: combine(timestamp(), prettyPrint()),
    transports: [new winston.transports.Console()],
  });
}

function createApp({ config, client, logger = createLogger(config) }) {
  const flaps = config.flaps;
  const catdobs = config.catdobs;
  const insideLocations = model.getInsideLocations(flaps);

  let locatedCatsData = [];
  let flapsData = [];

  const alexaApp = new alexa.app("catflap");
  alexaApp.id = config.applicationId;

  alexaApp.launch(function (request, response) {
    logger.info("launch");
    response.say("I know where the cats are!");
    response.shouldEndSession(false);
  }); // launch

  alexaApp.pre = async function (request, response, type) {
    logger.info("pre");

    const pets = await client.getPets();
    logger.info(pets);
    locatedCatsData = model.locatePets(pets, config);

    const devices = await client.getDevices();
    logger.info(devices);
    flapsData = model.summariseDevices(devices, config);
    logger.debug(flapsData);
  };

  alexaApp.post = function (request, response, type, exception) {
    if (exception) {
      // always turn an exception into a successful response
      logger.info("Ex:" + exception);
      return response.clear().say("Aw. Badness.").send();
    }
  };

  alexaApp.intent(
    "GetAgeOfCatIntent",
    {
      slots: {
        catname: "PetName",
      },
      utterances: ["how old is {catname}", "how old {catname} is"],
    },
    async function (req, res) {
      logger.info("GetAgeOfCatIntent");

      const catName = getMatchedCat(req);
      const catDetail = catdobs.find((x) => x.name === catName);
      const speech = getAgeSpeechForCat(catDetail);

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
    async function (req, res) {
      logger.info("GetDeviceStatusIntent");

      const lowBatteryFlaps = flapsData.filter(
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
    async function (req, res) {
      logger.info("GetLocationOfCatIntent");

      const catName = getMatchedCat(req);

      var speech;

      if (catName) {
        const cat = locatedCatsData.find((x) => x.name === catName);

        speech = getSpeechForCat(cat, true);
      } else {
        logger.info("Couldn't find that cat.");
        speech = "Sorry, I don't recognise that cat.";
      }

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
    async function (req, res) {
      logger.info("GetLongestDurationIntent");

      const locationNames = getMatchedLocation(req);

      locatedCatsData = locatedCatsData.sort(function (a, b) {
        const timeA = a.since;
        const timeB = b.since;
        return timeA < timeB ? -1 : timeA > timeB ? 1 : 0;
      });

      const catsInLocation = locatedCatsData.filter(function (item) {
        return locationNames.includes(item.location);
      });

      const cat = catsInLocation[0];
      const speech = getSpeechForCat(cat, true);

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
    async function (req, res) {
      logger.info("GetCatsInLocationIntent");

      const locationNames = getMatchedLocation(req);

      locatedCatsData = locatedCatsData.sort(function (a, b) {
        const textA = a.name.toUpperCase();
        const textB = b.name.toUpperCase();
        return textA < textB ? -1 : textA > textB ? 1 : 0;
      });

      const catsInLocation = locatedCatsData.filter(function (item) {
        return locationNames.includes(item.location);
      });

      let speech;
      if (catsInLocation.length > 1) {
        speech = formatCatList(catsInLocation) + " are ";
      } else if (catsInLocation.length > 0) {
        speech = catsInLocation[0].name + " is ";
      } else {
        speech = "No kitties are ";
      }

      let inThe = "";
      if (insideLocations.includes(locationNames[0])) {
        inThe = "in the ";
      }

      speech += inThe + locationNames[0];
      speech += ".";

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
    async function (req, res) {
      logger.info("GetCatInLocationDurationIntent");

      const catName = getMatchedCat(req);
      const cat = locatedCatsData.find((x) => x.name === catName);
      const speech = getSpeechForCat(cat);

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

      const locationNames = getMatchedLocation(req);
      const catName = getMatchedCat(req);

      var speech;

      if (catName) {
        const cat = locatedCatsData.find((x) => x.name === catName);
        const where = locationNames[0] === "inside" ? 1 : 2;

        await client.setPosition(cat.id, where);

        speech = "Okay, " + catName + " is " + locationNames[0] + ".";
      } else {
        logger.info("Couldn't find that cat.");
        speech = "Sorry, I don't recognise that cat.";
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

      const locationNames = getMatchedLocation(req);
      const catName = getMatchedCat(req);

      var speech;

      if (catName) {
        const cat = locatedCatsData.find((x) => x.name === catName);

        var profile, permission;
        if (locationNames[0] === "inside") {
          profile = 3; // kept in
          permission = "will be kept in.";
        } else {
          profile = 2; // allowed out
          permission = "is allowed out.";
        }

        const curfewFlaps = flaps.filter((x) => x.curfew);

        curfewFlaps.forEach(async function (flap) {
          logger.info("Setting permission on " + flap.name);
          await client.setTagProfile(flap.id, cat.tag_id, profile);
        });

        speech = "Okay, " + catName + " " + permission;
      } else {
        logger.info("Couldn't find that cat.");
        speech = "Sorry, I don't recognise that cat.";
      }

      logger.info(speech);
      res.say(speech);
    }
  ); // SetCatPermissionIntent

  function getMatchedCat(request) {
    let catName = request.slots["catname"];

    if (catName) {
      if (catName.resolutions.length > 0) {
        if (catName.resolutions[0].status === "ER_SUCCESS_MATCH") {
          catName = catName.resolutions[0].values[0].name;
        } else if (catName.resolutions[0].status === "ER_SUCCESS_NO_MATCH") {
          catName = null;
        }
      } else {
        catName = catName.value;
      }
    } else {
      catName = null;
    }

    return catName;
  } // getMatchedCat(request)

  function getMatchedLocation(request) {
    const locationName = request.slots["locationname"];
    const inOut = request.slots["inout"];

    const locations = [];

    if (locationName && locationName.resolutions.length > 0) {
      if (locationName.resolutions[0].status === "ER_SUCCESS_MATCH") {
        locations.push(locationName.resolutions[0].values[0].name);
      } else {
        locations.push(locationName.value);
      }
    } else if (inOut && inOut.resolutions.length > 0) {
      if (inOut.resolutions[0].status === "ER_SUCCESS_MATCH") {
        if (inOut.resolutions[0].values[0].name === "out") {
          locations.push("outside");
        } else {
          flaps.forEach((flap) => locations.push(flap.in));
        }
      }
    } else {
      flaps.forEach((flap) => locations.push(flap.in));
    }
    return locations;
  } //getMatchedLocation(request)

  return alexaApp;
}

module.exports = { createApp, createLogger };
