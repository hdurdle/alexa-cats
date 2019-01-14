const winston = require('winston');
const {combine, timestamp, prettyPrint} = winston.format;
const logger = winston.createLogger({
    format: combine(
        timestamp(),
        prettyPrint()
    ),
    transports: [new winston.transports.Console()]
});

const express = require("express");
const alexa = require('alexa-app');
const querystring = require('querystring');
const https = require('https');
const moment = require('moment');

// populate config.json with your token and IDs
const config = require('./config.json');
const flaps = config.flaps;
const authToken = 'Bearer ' + config.token;
const insideLocations = ["house", "garage", "garden room"];

const sureFlapGetOptions = {
    hostname: "app.api.surehub.io",
    path: "/api/household/" + config.household + "/pet?with[]=position",
    port: 443,
    method: 'GET',
    headers: {
        'Authorization': authToken
    }
};

const insidePurr = " <audio src='soundbank://soundlibrary/animals/amzn_sfx_cat_purr_01'/>";
const outsidePurr = "<audio src='soundbank://soundlibrary/animals/amzn_sfx_cat_purr_02'/>";

let sureFlapPetPositionData;
let locatedCatsData = [];

winston.level = process.env.LOG_LEVEL || config.logLevel || 'info';
const PORT = process.env.port || config.port || 8080;

const app = express();

const alexaApp = new alexa.app("catflap");

app.set("view engine", "ejs");

if (config.proxyIP) {
    logger.info("Trusting proxy: " + config.proxyIP);
    app.set('trust proxy', config.proxyIP)
}

alexaApp.express({
    expressApp: app,

    // verifies requests come from amazon alexa. Must be enabled for production.
    // You can disable this if you're running a dev environment and want to POST
    // things to test behavior. enabled by default.
    checkCert: true,

    // sets up a GET route when set to true. This is handy for testing in
    // development, but not recommended for production. disabled by default
    debug: true
});


alexaApp.launch(function (request, response) {
    logger.info("launch");
    response.say("I know where the cats are!");
    response.shouldEndSession(false);
}); // launch

alexaApp.pre = async function (request, response, type) {
    logger.info("pre");
    const result = await httpGet(sureFlapGetOptions);
    sureFlapPetPositionData = result.data;
    await populateCats();
};

alexaApp.post = function(request, response, type, exception) {
    if (exception) {
        // always turn an exception into a successful response
        logger.info("Ex:" + exception);
        return response.clear().say("Aw. Badness.").send();
    }
};

alexaApp.intent('GetLocationOfCatIntent', {
        "slots": {
            "catname": "PetName"
        },
        "utterances": [
            "where's {catname}",
            "Is {catname} outside",
            "Is {catname} at home",
            "Is {catname} out",
            "Is {catname} in",
            "where is {catname}",
            "where {catname} is"
        ]
    },
    async function (req, res) {
        logger.info("GetLocationOfCatIntent");

        const catName = getMatchedCat(req);
        const cat = locatedCatsData.find(x => x.name === catName);
        const speech = getSpeechForCat(cat, true);

        logger.info(speech);
        res.say(speech);
        res.send();
    }
); //GetLocationOfCatIntent


alexaApp.intent('GetLongestDurationIntent', {
        "slots": {
            "inout": "InOut"
        },
        "utterances": [
            "who has been {inout} the longest"
        ]
    },
    async function (req, res) {
        logger.info("GetLongestDurationIntent");

        const locationNames = getMatchedLocation(req);

        locatedCatsData = locatedCatsData.sort(function (a, b) {
            const timeA = a.since;
            const timeB = b.since;
            return (timeA < timeB) ? -1 : (timeA > timeB) ? 1 : 0;
        });

        const catsInLocation = locatedCatsData.filter(function (item) {
            return locationNames.includes(item.location);
        });

        const cat = catsInLocation[0];
        logger.info(cat);

        const speech = getSpeechForCat(cat, true);

        logger.info(speech);
        res.say(speech);
        res.send();

    }
); // GetLongestDurationIntent


alexaApp.intent('GetCatsInLocationIntent', {
        "slots": {
            "locationname": "PetLocation",
            "inout": "InOut"
        },
        "utterances": [
            "who is {inout}",
            "who is in the {locationname}",
            "who is at {inout}",
            "who is {locationname}"
        ]
    },
    async function (req, res) {
        logger.info("GetCatsInLocationIntent");

        const locationNames = getMatchedLocation(req);

        locatedCatsData = locatedCatsData.sort(function (a, b) {
            const textA = a.name.toUpperCase();
            const textB = b.name.toUpperCase();
            return (textA < textB) ? -1 : (textA > textB) ? 1 : 0;
        });

        const catsInLocation = locatedCatsData.filter(function (item) {
            return locationNames.includes(item.location);
        });

        let speech = '';
        if (catsInLocation.length > 1) {

            for (let i = 0; i < catsInLocation.length - 1; i++) {
                speech += catsInLocation[i].name + ', ';
            }
            speech = speech.replace(/,\s*$/, "");

            speech += ' and ' + catsInLocation[catsInLocation.length - 1].name;
            speech += ' are ';
        } else if (catsInLocation.length > 0) {
            speech += catsInLocation[catsInLocation.length - 1].name;
            speech += ' is ';
        } else {
            speech = 'No kitties are ';
        }



        let inThe = '';
        if ( insideLocations.includes(locationNames[0])) {
            inThe = "in the ";
        }

        speech += inThe + locationNames[0];
        speech += '.';

        logger.info(speech);
        res.say(speech);
        res.send();
    }
); // GetCatsInLocationIntent


alexaApp.intent('GetCatInLocationDurationIntent', {
        "slots": {
            "catname": "PetName",
            "inout": "InOut"
        },
        "utterances": [
            "when did {catname} come {inout}",
            "when did {catname} go {inout}",
            "how long has {catname} been {inout}"
        ]
    },
    async function (req, res) {
        logger.info("GetCatInLocationDurationIntent");

        const catName = getMatchedCat(req);
        const cat = locatedCatsData.find(x => x.name === catName);
        const speech = getSpeechForCat(cat);

        logger.info(speech);

        res.say(speech);
        res.send();
    }
); // GetCatInLocationDurationIntent


alexaApp.intent('SetLocationOfCatIntent', {
        "slots": {
            "catname": "PetName",
            "inout": "InOut"
        },
        "utterances": [
            "{catname} is {inout}"
        ]
    },
    async function (req, res) {
        logger.info("SetLocationOfCatIntent");

        const locationNames = getMatchedLocation(req);
        const catName = getMatchedCat(req);
        const cat = locatedCatsData.find(x => x.name === catName);

        const petID = cat.id;
        let where = 2;
        if (locationNames[0] === "inside") {
            where = 1;
        }

        await httpPost(petID, where);

        const speech = "Okay, " + catName + " is " + locationNames[0] + '.';
        logger.info(speech);
        res.say(speech);
        res.send();

    }
); // SetLocationOfCatIntent

function getSpeechForCat(cat, shouldPurr = false) {

    let purr = '';
    let inThe = ' has been in the ';
    const since = moment(cat.since).fromNow(true);

    if (cat.location === "outside" || cat.location === "inside") {
        inThe = ' has been ';
    }
    if (shouldPurr && cat.location === "outside") {
        purr = outsidePurr;
    }
    if (shouldPurr && cat.location === "inside") {
        purr = insidePurr;
    }
    return purr + cat.name + inThe + cat.location + ' for ' + since + '.';
}

function populateCats() {
    logger.info("start:populateCats");
    locatedCatsData = [];
    sureFlapPetPositionData.forEach(getLocation);
    logger.info("end:populateCats");
}

function getLocation(pet) {

    if (!pet.position.device_id) {
        pet.position.device_id = 0;
    }
    const lastFlapUsed = flaps.find(x => x.id === pet.position.device_id);

    let location;

    if (pet.position.where === 1) {
        location = lastFlapUsed.in;
    } else {
        location = lastFlapUsed.out;
    }

    const catInfo = {
        "name": pet.name,
        "location": location,
        "since": pet.position.since,
        "id": pet.id
    };

    locatedCatsData.push(catInfo);
} // getLocation(pet)

function getMatchedCat(request) {
    let catName = request.slots["catname"];

    if (catName) {
        if (catName.resolutions[0].status === "ER_SUCCESS_MATCH") {
            catName = catName.resolutions[0].values[0].name;
        } else {
            catName = catName.value;
        }
    } else {
        catName = null
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
    } else if (inOut.resolutions.length > 0) {
        if (inOut.resolutions[0].status === "ER_SUCCESS_MATCH") {
            if (inOut.resolutions[0].values[0].name === "out") {
                locations.push("outside");
            } else {
                locations.push("inside");
                locations.push("house");
                locations.push("garden room");
                // TODO: make generic (probably by allowing tagging of the json for inside/outside)
            }
        }
    }

    return locations;
} //getMatchedLocation(request)


function httpGet(options) {
    return new Promise(((resolve, reject) => {
        const getRequest = https.request(options, (response) => {
            response.setEncoding('utf8');
            let returnData = '';

            if (response.statusCode < 200 || response.statusCode >= 300) {
                return reject(new Error(`${response.statusCode}: ${response.req.getHeader('host')} ${response.req.path}`));
            }

            response.on('data', (chunk) => {
                returnData += chunk;
            });

            response.on('end', () => {
                resolve(JSON.parse(returnData));
            });

            response.on('error', (error) => {
                reject(error);
            });
        });
        getRequest.end();
    }));
}

function httpPost(petID, where) {
    return new Promise(function (resolve, reject) {

        const sureFlapPostData = querystring.stringify({
            "since": new Date().toISOString(),
            "where": where
        });

        const sureFlapPostOptions = {
            host: "app.api.surehub.io",
            path: "/api/pet/" + petID + "/position",
            port: 443,
            method: 'POST',
            headers: {
                'Authorization': authToken,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(sureFlapPostData)
            }
        };

        const postRequest = https.request(sureFlapPostOptions, function (res) {
            res.setEncoding('utf8');
            let returnData = '';

            if (res.statusCode < 200 || res.statusCode >= 300) {
                return reject(new Error(`${res.statusCode}: ${res.req.getHeader('host')} ${res.req.path}`));
            }

            res.on('data', function (chunk) {
                returnData += chunk;
            });

            res.on('end', () => {
                resolve(JSON.parse(returnData));
            });

            res.on('error', (error) => {
                reject(error);
            });

        });

        postRequest.write(sureFlapPostData);
        postRequest.end();
    });
}

app.listen(PORT);
console.log("Listening on port " + PORT + ", try http://localhost:" + PORT + "/catflap");