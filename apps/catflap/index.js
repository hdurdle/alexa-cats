const winston = require('winston');
const { combine, timestamp, prettyPrint } = winston.format;
const logger = winston.createLogger({
    format: combine(
        timestamp(),
        prettyPrint()
    ),
    transports: [new winston.transports.Console()]
});

var alexa = require('alexa-app');
const https = require('https');
const moment = require('moment');

// populate config.json with your token and IDs
const config = require('./config.json');
const flaps = config.flaps;
const catdobs = config.catdobs;
const authToken = 'Bearer ' + config.token;
const insideLocations = ["house", "garage", "garden room"];

const sureFlapGetOptions = {
    hostname: "app.api.surehub.io",
    path: "/api/household/" + config.household + "/pet?with[]=position&with[]=tag",
    port: 443,
    method: 'GET',
    headers: {
        'Authorization': authToken
    }
};

const sureFlapGetBatteryOptions = {
    hostname: "app.api.surehub.io",
    path: "/api/device?with[]=children&with[]=status&with[]=control",
    port: 443,
    method: 'GET',
    headers: {
        'Authorization': authToken
    }
};

const insidePurr = " <audio src='soundbank://soundlibrary/animals/amzn_sfx_cat_purr_01'/>";
const outsidePurr = "<audio src='soundbank://soundlibrary/animals/amzn_sfx_cat_purr_02'/>";

let sureFlapPetPositionData;
let sureFlapDeviceData;
let locatedCatsData = [];

winston.level = process.env.LOG_LEVEL || config.logLevel || 'info';

var alexaApp = new alexa.app("catflap");

// Allow this module to be reloaded by hotswap when changed
module.change_code = 1;

alexaApp.id = require('./package.json').alexa.applicationId;

alexaApp.launch(function (request, response) {
    logger.info("launch");
    response.say("I know where the cats are!");
    response.shouldEndSession(false);
}); // launch

alexaApp.pre = async function (request, response, type) {
    logger.info("pre");
    var result = await httpGet(sureFlapGetOptions);
    sureFlapPetPositionData = result.data;
    result = await httpGet(sureFlapGetBatteryOptions);
    sureFlapDeviceData = result.data;
    await populateCats();
};

alexaApp.post = function (request, response, type, exception) {
    if (exception) {
        // always turn an exception into a successful response
        logger.info("Ex:" + exception);
        return response.clear().say("Aw. Badness.").send();
    }
};

alexaApp.intent('GetAgeOfCatIntent', {
    "slots": {
        "catname": "PetName"
    },
    "utterances": [
        "how old is {catname}",
        "how old {catname} is"
    ]
},
    async function (req, res) {
        logger.info("GetAgeOfCatIntent");

        const catName = getMatchedCat(req);

        const catDetail = catdobs.find(x => x.name === catName);
        logger.info(catDetail);

        const speech = getAgeSpeechForCat(catDetail);

        logger.info(speech);
        res.say(speech);
        res.send();
    }
); // GetAgeOfCatIntent

function getAgeSpeechForCat(catDetail) {

    var dob = moment(catDetail["dob"]);
    var now = moment();
    var years = now.diff(dob, 'year');
    dob.add(years, 'years');
    var months = now.diff(dob, 'months');
    dob.add(months, 'months');
    var days = now.diff(dob, 'days');

    var birthday = false;

    var speech = catDetail.name + " is ";

    if (years > 0) {
        if (months < 1 && days < 1) {
            speech += "exactly ";
            birthday = true;
        }
        if (years === 1) {
            speech += years + ' year';
        } else {
            speech += years + ' years';
        }
    }
    if (months > 0) {
        if (years > 0) {
            speech += ", ";
        }
        if (years < 1 && days < 1) {
            speech += "exactly ";
        }
        if (months === 1) {
            speech += months + ' month';
        } else {
            speech += months + ' months';
        }
    }
    if (days > 0) {
        if (months > 0 || years > 0) {
            speech += " and ";
        }
        if (days === 1) {
            speech += days + ' day';
        } else {
            speech += days + ' days';
        }
    }

    speech += " old.";
    if (birthday) {
        speech += " Happy Birthday " + catDetail.name + "!";
    }

    return speech;
}


alexaApp.intent('GetDeviceStatusIntent', {
    "utterances": [
        "about battery",
        "about batteries",
        "is the battery okay",
        "how are the batteries",
        "for device status",
        "for status"
    ]
},
    async function (req, res) {
        logger.info("GetDeviceStatusIntent");
        var speech = '';

        const BATTERY_THRESHOLD = 5.2;

        var lowBatteryFlaps = sureFlapDeviceData.filter(x => x.status["battery"] < BATTERY_THRESHOLD);
        var okayFlaps = sureFlapDeviceData.filter(x => x.status["battery"] >= BATTERY_THRESHOLD);

        if (lowBatteryFlaps.length > 1) {

            for (let i = 0; i < lowBatteryFlaps.length - 1; i++) {
                speech += lowBatteryFlaps[i].name + ', ';
            }
            speech = speech.replace(/,\s*$/, "");

            speech += ' and ' + lowBatteryFlaps[lowBatteryFlaps.length - 1].name;
            speech += ' batteries are low.';
        } else if (lowBatteryFlaps.length > 0) {
            speech += lowBatteryFlaps[lowBatteryFlaps.length - 1].name;
            speech += ' battery is low.';
        }

        if (okayFlaps.length === 3) {
            speech = "All the batteries are okay."
        }

        logger.info(speech);
        res.say(speech);
        res.send();
    }
); //GetDeviceStatusIntent

alexaApp.intent('GetLocationOfCatIntent', {
    "slots": {
        "catname": "PetName"
    },
    "utterances": [
        "where's {catname}",
        "is {catname} outside",
        "is {catname} at home",
        "is {catname} out",
        "is {catname} in",
        "where is {catname}",
        "where {catname} is"
    ]
},
    async function (req, res) {
        logger.info("GetLocationOfCatIntent");

        const catName = getMatchedCat(req);

        var speech;

        if (catName) {
            const cat = locatedCatsData.find(x => x.name === catName);

            speech = getSpeechForCat(cat, true);
        } else {
            logger.info("Couldn't find that cat.")
            speech = "Sorry, I don't recognise that cat.";
        }

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
        "who has been {inout} the longest",
        "who's been {inout} the longest"
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
        "who's in the {locationname}",
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
        if (insideLocations.includes(locationNames[0])) {
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

        var speech;

        if (catName) {
            const cat = locatedCatsData.find(x => x.name === catName);

            const petID = cat.id;
            var where;
            if (locationNames[0] === "inside") {
                where = 1;
            } else {
                where = 2;
            }

            var postObject = {
                "data": {},
                "options": {}
            }

            postObject.data = JSON.stringify({
                "since": new Date().toISOString(),
                "where": where
            });

            postObject.options = {
                host: "app.api.surehub.io",
                path: "/api/pet/" + petID + "/position",
                port: 443,
                method: 'POST',
                headers: {
                    'Authorization': authToken,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postObject.data)
                }
            };

            await httpPost(postObject);

            speech = "Okay, " + catName + " is " + locationNames[0] + '.';

        } else {
            logger.info("Couldn't find that cat.")
            speech = "Sorry, I don't recognise that cat.";
        }


        logger.info(speech);
        res.say(speech);
        res.send();

    }
); // SetLocationOfCatIntent



alexaApp.intent('SetCatPermissionIntent', {
    "slots": {
        "catname": "PetName",
        "inout": "InOut"
    },
    "utterances": [
        "to keep {catname} {inout}",
        "to let {catname} {inout}"
    ]
},
    async function (req, res) {
        logger.info("SetCatPermissionIntent");

        const locationNames = getMatchedLocation(req);
        logger.info(locationNames[0]);
        const catName = getMatchedCat(req);

        var speech;

        if (catName) {
            const cat = locatedCatsData.find(x => x.name === catName);

            const tagId = cat.tag_id;
            var where, permission;
            if (locationNames[0] === "inside") {
                where = 3; // kept in
                permission = "will be kept in.";
            } else {
                where = 2; // allowed out
                permission = "is allowed out.";
            }

            const curfewFlaps = flaps.filter(function (el) {
                return el.curfew;
            });

            logger.info(curfewFlaps)

            curfewFlaps.forEach(async function (flap) {

                logger.info(flap)
                logger.info("Setting permission on " + flap.name);

                flapId = flap.id;

                var postObject = {
                    "data": {},
                    "options": {}
                }

                postObject.data = JSON.stringify({
                    "profile": where
                });

                logger.info(postObject.data);

                postObject.options = {
                    host: "app.api.surehub.io",
                    path: "/api/device/" + flapId + "/tag/" + tagId,
                    port: 443,
                    method: 'PUT',
                    headers: {
                        'Authorization': authToken,
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(postObject.data)
                    }
                };

                logger.info(postObject.options.path);

                var result = await httpPost(postObject);
                logger.info(result);

            });

            speech = "Okay, " + catName + " " + permission;

        } else {
            logger.info("Couldn't find that cat.")
            speech = "Sorry, I don't recognise that cat.";
        }

        logger.info(speech);
        res.say(speech);
        res.send();
    }
); // SetCatPermissionIntent



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
    logger.info(sureFlapPetPositionData)
}

function getLocation(pet) {
    if (!pet || !pet.position) {
        logger.info("No pet to getLocation for");
        return;
    };
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
        "id": pet.id,
        "tag_id": pet.tag.id
    };

    const catDetail = catdobs.find(x => x.name === pet.name);
    if (catDetail.dod) {
        // don't add
    }
    else {
        locatedCatsData.push(catInfo);
    }


} // getLocation(pet)

function getMatchedCat(request) {
    logger.info("getMatchedCat");
    let catName = request.slots["catname"];

    logger.info(catName);

    if (catName) {
        if (catName.resolutions[0].status === "ER_SUCCESS_MATCH") {
            catName = catName.resolutions[0].values[0].name;
        } else if (catName.resolutions[0].status === "ER_SUCCESS_NO_MATCH") {
            catName = null;
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
                flaps.forEach(function (flap) {
                    locations.push(flap["in"]);
                });
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

function httpPost(postObject) {
    return new Promise(function (resolve, reject) {

        var postOptions = postObject.options;
        var postData = postObject.data;

        const postRequest = https.request(postOptions, function (res) {
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

        postRequest.write(postData);
        postRequest.end();
    });
}

module.exports = alexaApp;