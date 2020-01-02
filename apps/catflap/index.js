const winston = require('winston');
const { combine, timestamp, prettyPrint } = winston.format;
const logger = winston.createLogger({
    format: combine(
        timestamp(),
        prettyPrint()
    ),
    transports: [
      new winston.transports.Console()
    ]
});

var alexa = require('alexa-app');
const https = require('https');
const moment = require('moment');

// populate config.json with your token and IDs
const config = require('./config.json');
const flaps = config.flaps;
const catdobs = config.catdobs;
const kittens = config.kittens;
const authToken = 'Bearer ' + config.token;
const insideLocations = ["house"];

const sureFlapGetOptions = {
    hostname: "app.api.surehub.io",
    path: "/api/household/" + config.household + "/pet?with[]=position&with[]=tag",
    port: 443,
    method: 'GET',
    headers: {
        'Authorization': authToken
    }
};

const sureFlapGetDeviceData = {
    hostname: "app.api.surehub.io",
    path: "/api/device?with[]=children&with[]=tags&with[]=status&with[]=control",
    port: 443,
    method: 'GET',
    headers: {
        'Authorization': authToken
    }
};

const angrycat    = "<audio src='soundbank://soundlibrary/animals/amzn_sfx_cat_angry_meow_1x_01'/>";
const insidePurr  = "<audio src='soundbank://soundlibrary/animals/amzn_sfx_cat_purr_01'/>";
const outsidePurr = "<audio src='soundbank://soundlibrary/animals/amzn_sfx_cat_purr_meow_01'/>";

let sureFlapPetPositionData;
let sureFlapDeviceData;
let locatedCatsData = [];

winston.level = process.env.LOG_LEVEL || config.logLevel || 'info';

var alexaApp = new alexa.app("catflap");

// Allow this module to be reloaded by hotswap when changed
module.change_code = 1;

alexaApp.id = require('./package.json').alexa.applicationId;

alexaApp.launch(function (request, response) {
    response.say("I can tell you where the cats are. ");
    
    var speech, catsIn, catsOut;
    const locationIn = "inside. "; // location = "house"
    const locationOut = "outside."; // location = "outside"
    
    catsIn = [];
    catsOut = [];
    speech = '';

    locatedCatsData.forEach(async function (cat) {
        if (cat.location === "house")
        {
            catsIn.push(cat);
        }
        else
        {
            catsOut.push(cat);
        }
    });

    speech = formatCatsInOutSpeech(catsIn, catsOut, locationIn, locationOut);
    response.say(speech);
    
    response.shouldEndSession(false);
}); // launch

alexaApp.pre = async function (request, response, type) {
    logger.info("pre");
    var result = await httpGet(sureFlapGetOptions);
    sureFlapPetPositionData = result.data;
    result = await httpGet(sureFlapGetDeviceData);
    sureFlapDeviceData = result.data;
    await populateCats();
};

alexaApp.post = function (request, response, type, exception) {
    logger.info("post");
    if (exception) {
        // always turn an exception into a successful response
        logger.info("Ex:" + exception);
        return response.clear().say(angrycat).send();
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

        const speech = getAgeSpeechForCat(catDetail);

        res.say(speech);
        res.send();
    }
); // GetAgeOfCatIntent

alexaApp.intent('KeepPetsInOutIntent', {
    "slots": {
        "inout": "InOut"
    },
    "utterances": [
        "to keep all cats {inout}",
        "to keep all pets {inout}",
        "to lock all cats {inout}",
        "to lock all pets {inout}"
    ]
},
    async function (req, res) {
        logger.info("KeepPetsInOutIntent");

        const locationNames = getMatchedLocation(req);
        var speech;
        var where;
        if (locationNames[0] === "inside") {
            where = 1;
            speech = "All pets will be locked in";
        } else if (locationNames[0] === "house") {
            where = 1;
            speech = "All pets will be locked in";
        } else {
            where = 2;
            speech = "All pets will be locked out";
        }
            
        flaps.forEach(async function (flap) {
            var flapId = flap.id;
            
            if (flapId > 0)
            {
                logger.info("Setting permission on " + flap.name);

                var postObject = {
                    "data": {},
                    "options": {}
                }
    
                postObject.data = JSON.stringify({
                    "locking": where
                });

                postObject.options = {
                    host: "app.api.surehub.io",
                    path: "/api/device/" + flapId + "/control",
                    port: 443,
                    method: 'PUT',
                    headers: {
                        'Authorization': authToken,
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(postObject.data)
                    }
                }
                
                var result = await httpPost(postObject);
            }
        });

        res.say(speech);
        res.send();
    }
); // KeepPetsInOutIntent

alexaApp.intent('LockBothWaysIntent', {
    "utterances": [
        "to stop all the cats going in and out",
        "to stop all cats going in and out",
        "to stop the cats going in and out",
        "to lock both ways",
        "to lock itself both ways",
        "to lock the catflap both ways",
        "to stop cats going in and out"
    ]
},
    async function (req, res) {
        logger.info("LockBothWaysIntent");

        var where = 3;
        var speech = "Cat flap has been locked both ways";

        flaps.forEach(async function (flap) {
            var flapId = flap.id;
            
            if (flapId > 0)
            {            
                logger.info("Setting permission on " + flap.name);

                var postObject = {
                    "data": {},
                    "options": {}
                }
    
                postObject.data = JSON.stringify({
                    "locking": where
                });
    
                postObject.options = {
                    host: "app.api.surehub.io",
                    path: "/api/device/" + flapId + "/control",
                    port: 443,
                    method: 'PUT',
                    headers: {
                        'Authorization': authToken,
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(postObject.data)
                    }
                };
                
                var result = await httpPost(postObject);

            }
        });
        
        res.say(speech);
        res.send();
    }
); // LockBothWaysIntent

alexaApp.intent('UnlockFlapsIntent', {
    "utterances": [
        "to unlock",
        "to unlock both ways",
        "to unlock cat flap",
        "to unlock cat flap both ways",
        "to unlock itself both ways",
        "to unlock the cat flap",
        "to unlock the cat flap both ways",
        "to unlock the door",
        "to unlock the flap"
    ]
},
    async function (req, res) {
        logger.info("UnlockFlapsIntent");

        var where = 0;
        var speech = "Cat flap has been unlocked";

        flaps.forEach(async function (flap) {
            var flapId = flap.id;
            
            if (flapId > 0)
            {            
                logger.info("Setting permission on " + flap.name);
    
                var postObject = {
                    "data": {},
                    "options": {}
                }
    
                postObject.data = JSON.stringify({
                    "locking": where
                });

                postObject.options = {
                    host: "app.api.surehub.io",
                    path: "/api/device/" + flapId + "/control",
                    port: 443,
                    method: 'PUT',
                    headers: {
                        'Authorization': authToken,
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(postObject.data)
                    }
                };
                
                var result = await httpPost(postObject);
            }
        });
        
        res.say(speech);
        res.send();
    }
); // UnlockFlapsIntent

alexaApp.intent('GetDeviceBatteryStatusIntent', {
    "utterances": [
        "about battery",
        "about the battery",
        "about batteries",
        "about the batteries",
        "for battery status",
        "for device status",
        "how are the batteries",
        "is the battery okay",
        "if the battery is okay"
    ]
},
    async function (req, res) {
        logger.info("GetDeviceBatteryStatusIntent");
        var speech = '';

        const BATTERY_THRESHOLD = 5.2;
        
        var lowBatteryFlaps = sureFlapDeviceData.filter(x => x.status["battery"] < BATTERY_THRESHOLD);

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
        else {
            speech = "All the batteries are okay."
        }

        res.say(speech);
        res.send();
    }
); // GetDeviceBatteryStatusIntent

alexaApp.intent('GetDeviceLockedStatusIntent', {
    "utterances": [
        "about the lock status",
        "if it is locked",
        "if it is unlocked",
        "if it's locked",
        "if it's unlocked",
        "if the cat flap is locked",
        "if the cat flap is unlocked",
        "is the cat flap locked",
        "the lock status"
    ]
},
    async function (req, res) {
        logger.info("GetDeviceLockedStatusIntent");
        var speech = '';

        flaps.forEach(async function (flap) {
            logger.info("Getting permission on " + flap.name);

            var flapId = flap.id;

            if (flapId > 0)
            {
                var catflap = sureFlapDeviceData.filter(x => x.id === flapId);
                logger.info(flap);
                logger.info(catflap);
                speech += catflap[0].name;
                speech += getLockStatus(catflap[0].control["locking"]);
            }
        });

        res.say(speech);
        res.send();
    }
); // GetDeviceLockedStatusIntent

alexaApp.intent('GetLocationOfCatIntent', {
    "slots": {
        "catname": "PetName",
        "locationname": "PetLocation",
        "inout": "InOut"      
    },
    "utterances": [
        "is {catname} at {locationname}",
        "is {catname} {inout}",
        "where {catname} is",
        "where is {catname}",
        "where's {catname}"
    ]
},
    async function (req, res) {
        logger.info("GetLocationOfCatIntent");

        const catName = getMatchedCat(req);

        var speech;

        if (catName) {
            const cat = locatedCatsData.find(x => x.name === catName);

            speech = getLocationSpeechForCat(cat, true);
        } else {
            speech = "Sorry, I don't recognise that cat.";
        }

        res.say(speech);
        res.send();
    }
); // GetLocationOfCatIntent

alexaApp.intent('GetCatsLocationIntent', {
    "slots": {},
    "utterances": [
        "where are the cats",
        "where are the kitties",
        "where are the kittens",
        "where is the cat",
        "where the cats are",
        "where the kitties are",
        "where the kitten are",
        "where the cat is"
    ]
},
    async function (req, res) {
        logger.info("GetCatsLocationIntent");

        var speech, catsIn, catsOut;
        const locationIn = "inside. "; // location = "house"
        const locationOut = "outside. "; // location = "outside"
        
        catsIn = [];
        catsOut = [];
        speech = '';

        locatedCatsData.forEach(async function (cat) {
            if (cat.location === "house")
            {
                catsIn.push(cat);
            }
            else
            {
                catsOut.push(cat);
            }
        });

        speech = formatCatsInOutSpeech(catsIn, catsOut, locationIn, locationOut);
        
        res.say(speech);
        res.send();
    }
); // GetCatsLocationIntent

alexaApp.intent('GetLongestDurationIntent', {
    "slots": {
        "inout": "InOut",
        "locationname": "PetLocation"      
    },
    "utterances": [
        "who has been {inout} for the most time",
        "who has been in the {locationname} the longest",
        "who has been {inout} the longest",
        "who's been {inout} for the most time",
        "who's been in the {locationname} the longest",
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
        var speech
        
        if (cat) 
        {
            speech = getLocationSpeechForCat(cat, true);
        }
        else
        {
            let inThe = '';
            if (insideLocations.includes(locationNames[0])) {
                inThe = "in the ";
            }

            speech = "no cats are " + inThe + locationNames[0];
        }
        
        res.say(speech);
        res.send();

    }
); // GetLongestDurationIntent

alexaApp.intent('GetShortestDurationIntent', {
    "slots": {
        "inout": "InOut"
    },
    "utterances": [
        "who has been {inout} for the shortest time",
        "who has been in the {locationname} the shortest",
        "who has been {inout} the shortest",
        "who's been {inout} for the shortest time",
        "who's been in the {locationname} the shortest",
        "who's been {inout} the shortest"
    ]
},
    async function (req, res) {
        logger.info("GetShortestDurationIntent");

        const locationNames = getMatchedLocation(req);
        
        locatedCatsData = locatedCatsData.sort(function (a, b) {
            const timeA = a.since;
            const timeB = b.since;
            return (timeA > timeB) ? -1 : (timeA < timeB) ? 1 : 0;
        });        

        const catsInLocation = locatedCatsData.filter(function (item) {
            return locationNames.includes(item.location);
        });

        const cat = catsInLocation[0];
        logger.info(catsInLocation);
        logger.info(cat);
        var speech
        
        if (cat) 
        {
            speech = getLocationSpeechForCat(cat, true);
        }
        else
        {
            let inThe = '';
            if (insideLocations.includes(locationNames[0])) {
                inThe = "in the ";
            }

            speech = "no cats are " + inThe + locationNames[0];
        }
        
        res.say(speech);
        res.send();

    }
); // GetShortestDurationIntent

alexaApp.intent('GetCatsInLocationIntent', {
    "slots": {
        "locationname": "PetLocation",
        "inout": "InOut"
    },
    "utterances": [
        "who is at {locationname}",
        "who is in the {locationname}",
        "who is {inout}",
        "who is {locationname}",
        "who's at {locationname}",
        "who's in the {locationname}",
        "who's {inout}",
        "who's {locationname}"
    ]
},
    async function (req, res) {
        logger.info("GetCatsInLocationIntent");

        const locationNames = getMatchedLocation(req);

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
            speech = 'No cats are ';
        }

        let inThe = '';
        if (insideLocations.includes(locationNames[0])) {
            inThe = "in the ";
        }

        speech += inThe + locationNames[0];
        speech += '.';

        res.say(speech);
        res.send();
    }
); // GetCatsInLocationIntent

alexaApp.intent('GetCatInLocationDurationIntent', {
    "slots": {
        "catname": "PetName",
        "inout": "InOut",
        "locationname": "PetLocation"
    },
    "utterances": [
        "how long has {catname} been {inout}",
        "how long has {catname} been in the {locationname}",
        "when did {catname} come {inout}",
        "when did {catname} go {inout}"
    ]
},
    async function (req, res) {
        logger.info("GetCatInLocationDurationIntent");

        const catName = getMatchedCat(req);
        const cat = locatedCatsData.find(x => x.name === catName);
        const speech = getLocationSpeechForCat(cat);

        res.say(speech);
        res.send();
    }
); // GetCatInLocationDurationIntent

alexaApp.intent('SetLocationOfCatIntent', {
    "slots": {
        "catname": "PetName",
        "inout": "InOut",
        "locationname": "PetLocation"
    },
    "utterances": [
        "{catname} is in the {locationname}",
        "{catname} is {inout}",
        "{catname} is at {inout}",
        "to set {catname} to be {inout}"
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
            } else if (locationNames[0] === "house") {
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
            
            let inThe = '';
            if (insideLocations.includes(locationNames[0])) {
                inThe = "in the ";
            }

            speech = "Okay, " + catName + " is " + inThe + locationNames[0] + '.';

        } 
        else
        {
            speech = "Sorry, I don't recognise that cat.";
        }

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
        "to allow {catname} {inout}",
        "to keep {catname} {inout}",
        "to let {catname} {inout}",
        "to lock {catname} {inout}"
    ]
},
    async function (req, res) {
        logger.info("SetCatPermissionIntent");

        const locationNames = getMatchedLocation(req);
        const catName = getMatchedCat(req);

        var speech;

        if (catName) {
            const cat = locatedCatsData.find(x => x.name === catName);

            const tagId = cat.tag_id;
            var where, permission;
            if (locationNames[0] === "inside") {
                where = 3; // kept in
                permission = "will be kept in.";
            } else if (locationNames[0] === "house") {
                where = 3; // kept in
                permission = "will be kept in.";                
            } else {
                where = 2; // allowed out
                permission = "is allowed out.";
            }

            flaps.forEach(async function (flap) 
            {
                logger.info("Setting permission on " + flap.name);

                var flapId = flap.id;

                var postObject = {
                    "data": {},
                    "options": {}
                }

                postObject.data = JSON.stringify({
                    "profile": where
                });

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

                var result = await httpPost(postObject);

            });

            speech = "Okay, " + catName + " " + permission;

        } 
        else 
        {
            speech = "Sorry, I don't recognise that cat.";
        }

        res.say(speech);
        res.send();
    }
); // SetCatPermissionIntent

alexaApp.intent('SetKittensPermissionIntent', {
    "slots": {
        "catgroup": "PetGroup",
        "inout": "InOut"
    },
    "utterances": [
        "to allow the {catgroup} {inout}",
        "to allow the {catgroup} to come {inout}",
        "to allow the {catgroup} to go {inout}",
        "to keep the {catgroup} {inout}",
        "to let the {catgroup} {inout}",
        "to lock the {catgroup} {inout}",
        "to allow {catgroup} {inout}",
        "to allow {catgroup} to come {inout}",
        "to allow {catgroup} to go {inout}",
        "to keep {catgroup} {inout}",
        "to let {catgroup} {inout}",
        "to lock {catgroup} {inout}"
    ]
},
    async function (req, res) {
        logger.info("SetKittensPermissionIntent");

        const locationNames = getMatchedLocation(req);

        var speech, catnames, permission, where;
        if (locationNames[0] === "inside") {
            where = 3; // kept in
            permission = "will be kept in.";
        } else if (locationNames[0] === "house") {
            where = 3; // kept in
            permission = "will be kept in.";
        } else {
            where = 2; // allowed out
            permission = "will be allowed out.";
        }
        
        kittens.forEach(async function (kitten) {
            const cat = locatedCatsData.find(x => x.name === kitten.name);
            const tagId = cat.tag_id;

            flaps.forEach(async function (flap) {
                var flapId = flap.id;
            
                if (flapId > 0)
                {
                    logger.info("Setting permission on " + flap.name);

                    var postObject = {
                        "data": {},
                        "options": {}
                    }
    
                    postObject.data = JSON.stringify({
                        "profile": where
                    });
    
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
    
                    var result = await httpPost(postObject);
                }
            });
        });

        speech = formatCatList(kittens);
        
        speech += " " + permission;
        res.say(speech);
        res.send();
    }
); // SetKittensPermissionIntent

alexaApp.intent('GetCatsPermissionIntent', 
{
    "slots": {},
    "utterances": [
        "if the cats are allowed out",
        "if the cats are locked in",
        "which cats are allowed out",
        "which cats are indoor only",
        "which cats are indoor only pets",
        "which cats are locked in",
        "which cats are set to indoor only",
        "which cats are set to be indoor only",
        "who is locked in"
    ]
},
    async function (req, res) {
        logger.info("GetCatsPermissionIntent");

        var speech, catsIn, catsOut;
        const permissionIn = "locked in. "; // where = 3
        const permissionOut = "allowed out. "; // where = 2
        
        catsIn = [];
        catsOut = [];
        speech = '';

        flaps.forEach(async function (flap) {
            logger.info("Getting permission on " + flap.name);

            var flapId = flap.id;

            if (flapId > 0)
            {
                var catflap = sureFlapDeviceData.filter(x => x.id === flapId);
                var tags = catflap[0].tags;

                locatedCatsData.forEach(async function (cat) {
                    var tagId = cat.tag_id;
                    var tag = tags.filter(x => x.id === tagId);
                    var catTag = tag[0];
                    logger.info(catTag);
                    
                    if (catTag.profile === 3)
                    {
                        catsIn.push(cat);
                    }
                    else if (catTag.profile === 2)
                    {
                        catsOut.push(cat);
                    }
                });
            }
        }); 

        speech = formatCatsInOutSpeech(catsIn, catsOut, permissionIn, permissionOut);
        
        res.say(speech);
        res.send();
    }
); // GetCatsPermissionIntent

function getLockStatus(locking) {
    var status = '';
    
    if (locking === 0)
    {
        status += " is unlocked. ";
    }
    else if (locking === 1)
    {
        status += " is set to keep all pets in. ";
    }
    else if (locking === 2)
    {
        status += " is set to keep all pets out. ";
    }          
    else if (locking === 3)
    {
        status += " is locked both ways. ";
    } 
    
    return status;
}

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

function formatCatsInOutSpeech(catsIn, catsOut, speechIn, speechOut) {
    var speech = '';
    var speechcatsin = '';
    var speechcatsout = '';

    if (catsIn.length > 0)
    {
        speechcatsin = formatCatList(catsIn);
        
        if (catsIn.length > 1)
        {
            speech += speechcatsin + " are " + speechIn;
        }
        else
        {
            speech += speechcatsin + " is " + speechIn;
        }
    }
    
    if (catsOut.length > 0)
    {
        speechcatsout = formatCatList(catsOut);
        
        if (catsOut.length > 1)
        {
            speech += speechcatsout + " are " + speechOut;
        }
        else
        {
            speech += speechcatsout + " is " + speechOut;
        }
    }
    
    if ((catsIn.length <= 0) && (catsOut.length <= 0))
    {
        speech = "No cats found."
    }
    
    return speech;
}
        
function formatCatList(cats) {
    var speech = '';
    
    if (cats.length > 1) 
    {
        for (let i = 0; i < cats.length - 1; i++) 
        {
            speech += cats[i].name + ', ';
        }
        speech = speech.replace(/,\s*$/, "");
        speech += ' and ' + cats[cats.length - 1].name;
    } 
    else if (cats.length > 0) 
    {
        speech += cats[cats.length - 1].name;
    } 
    else 
    {
        speech = 'No cats';
    }
    
    return speech;
}

function getLocationSpeechForCat(cat, shouldPurr = false) {
    let purr = '';
    let inThe = ' has been in the ';
    const since = moment(cat.since).fromNow(true);

    if (cat.location === "outside" || cat.location === "inside") {
        inThe = ' has been ';
    }
    if (shouldPurr && cat.location === "outside") {
        purr = outsidePurr;
    }
    if (shouldPurr && (cat.location === "inside" || cat.location === "house")) {
        purr = insidePurr;
    }
    return purr + cat.name + inThe + cat.location + ' for ' + since + '.';
}

function populateCats() {
    locatedCatsData = [];
    sureFlapPetPositionData.forEach(getLocation);
}

function getLocation(pet) {
    if (!pet || !pet.position) {
        logger.info("No pet to getLocation for");
        return;
    }
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