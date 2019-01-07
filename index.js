var fs = require('fs');
var express = require("express");
var alexa = require('alexa-app');
const https = require('https');
const moment = require('moment');

const config = require('./config.json');

// populate with your Sureflap API token
const sureflapToken = config.token; // fs.readFileSync('sureflap.token', 'utf8');

// populate with JSON to define your cat flap/room topology
// see README for the format of this
const flaps = config.flaps; // JSON.parse(fs.readFileSync('sureflap.flaps', 'utf8'));

const sureflapURI = "/api/household/" + config.household + "/pet?with[]=position";
const authToken = 'Bearer ' + sureflapToken;

var catdata;
var cats = [];

const sureFlapOptions = {
  hostname: "app.api.surehub.io",
  path: sureflapURI,
  port: 443,
  method: 'GET',
  headers: {
    'Authorization': authToken
  }
};

var sureFlapPostOptions = {
  hostname: "app.api.surehub.io",
  path: "/api/pet/<petid>/position",
  port: 443,
  method: 'POST',
  headers: {
    'Authorization': authToken
  }
};

var PORT = process.env.port || 8080;
var app = express();

var alexaApp = new alexa.app("catflap");

app.set("view engine", "ejs");
app.set('trust proxy', '192.168.1.232') // specify a single subnet

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

//

alexaApp.launch(function(request, response) {
  console.log("launch");
  response.say("I know where the cats are!");
  response.shouldEndSession(false);
}) // launch


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
  async function(req, res) {
    console.log("GetLocationOfCatIntent");
    var catname = get_matched_cat(req);

    // get catflap data
    const result = await httpGet(sureFlapOptions);
    catdata = result.data;

    // populate location data for each cat
    cats = [];
    catdata.forEach(getLocation);

    var cat = cats.find(x => x.name === catname);
    var since = moment(cat.since).fromNow(true);

    var purr = " <audio src='soundbank://soundlibrary/animals/amzn_sfx_cat_purr_01'/>";

    var inThe = ' has been in the ';
    if (cat.location === "outside") {
      inThe = ' has been ';
      purr = "<audio src='soundbank://soundlibrary/animals/amzn_sfx_cat_purr_02'/>";
    }
    var speech = purr + ' ' + cat.name + inThe + cat.location + ' for ' + since + '.';

    console.log(speech);
    res.say(speech);
    res.send();

    return;
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
  async function(req, res) {
    console.log("GetLongestDurationIntent");

    var locationnames = get_matched_location(req);
    console.log(locationnames);

    // get catflap data
    const result = await httpGet(sureFlapOptions);
    catdata = result.data;

    catdata = catdata.sort(function(a, b) {
      var timeA = a.position.since;
      var timeB = b.position.since;
      return (timeA < timeB) ? -1 : (timeA > timeB) ? 1 : 0;
    });

    cats = [];
    catdata.forEach(getLocation);

    var cats_in_location = cats.filter(function(item) {
      return locationnames.includes(item.location);
    })

    var cat = cats_in_location[0];
    console.log(cat);

    var since = moment(cat.since).fromNow(true);

    var purr = " <audio src='soundbank://soundlibrary/animals/amzn_sfx_cat_purr_01'/>";

    var inThe = ' has been in the ';
    if (cat.location === "outside") {
      inThe = ' has been ';
      purr = "<audio src='soundbank://soundlibrary/animals/amzn_sfx_cat_purr_02'/>";
    }
    var speech = purr + ' ' + cat.name + inThe + cat.location + ' for ' + since + '.';

    console.log(speech);
    res.say(speech);
    res.send();

    return;
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
  async function(req, res) {
    console.log("GetCatsInLocationIntent");

    var locationnames = get_matched_location(req);
    console.log(locationnames);

    // get catflap data
    const result = await httpGet(sureFlapOptions);
    catdata = result.data;

    catdata = catdata.sort(function(a, b) {
      var textA = a.name.toUpperCase();
      var textB = b.name.toUpperCase();
      return (textA < textB) ? -1 : (textA > textB) ? 1 : 0;
    });

    // populate location data for each cat
    cats = [];
    catdata.forEach(getLocation);

    var cats_in_location = cats.filter(function(item) {
      return locationnames.includes(item.location);
    })

    var speech = '';
    if (cats_in_location.length > 1) {

      for (i = 0; i < cats_in_location.length - 1; i++) {
        speech += cats_in_location[i].name + ', ';
      }
      speech += 'and ' + cats_in_location[cats_in_location.length - 1].name

    } else if (cats_in_location.length > 0) {
      speech += cats_in_location[cats_in_location.length - 1].name

    } else {
      speech = 'No kitties';
    }

    var inThe = '';
    if (locationnames[0] == "house" ||
      locationnames[0] == "garage" ||
      locationnames[0] == "garden room") {
      inThe = "in the ";
    }

    speech += " are " + inThe + locationnames[0];
    speech += '.';

    console.log(speech);
    res.say(speech);
    res.send();

    return;
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
  async function(req, res) {
    console.log("GetCatInLocationDurationIntent");
    var catname = get_matched_cat(req);

    // get catflap data
    const result = await httpGet(sureFlapOptions);
    catdata = result.data;

    // populate location data for each cat
    cats = [];
    catdata.forEach(getLocation);

    var cat = cats.find(x => x.name === catname);
    var since = moment(cat.since).fromNow(true);

    var inThe = ' has been in the ';
    if (cat.location === "outside") {
      inThe = ' has been ';
    }
    var speech = cat.name + inThe + cat.location + ' for ' + since + '.';
    speech += " <audio src='soundbank://soundlibrary/animals/amzn_sfx_cat_purr_01'/>";
    console.log(speech);
    res.say(speech);
    res.send();

    return;
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
  async function(req, res) {
    console.log("SetLocationOfCatIntent");

    var locationnames = get_matched_location(req);
    var catname = get_matched_cat(req);

    // post data to set cat's location
    const result = await httpPost(sureFlapOptions);
    //catdata = result.data;

    var speech = "I've set " + catname + "'s status to " + locationnames[0] + '.';
    console.log(speech);
    res.say(speech);
    res.send();

    return;
  }
); // SetLocationOfCatIntent

function getLocation(pet) {
  let name = pet.name;
  var last_flap = flaps.find(x => x.id === pet.position.device_id);
  var location;

  if (pet.position.where == 1) {
    location = last_flap.in;
  } else {
    location = last_flap.out;
  }

  var catInfo = {
    "name": pet.name,
    "location": location,
    "since": pet.position.since
  }

  cats.push(catInfo);
} // getLocation(pet)

function get_matched_cat(request) {
  var catname = request.slots.catname;

  if (catname) {
    if (catname.resolutions[0].status === "ER_SUCCESS_MATCH") {
      catname = catname.resolutions[0].values[0].name;
    } else {
      catname = catname.value;
    }
  } else {
    catname = null
  }

  return catname;
}

function get_matched_location(request) {
  var locationname = request.slots.locationname;
  var inout = request.slots.inout;
  //console.log(locationname);
  //console.log(inout);
  var locations = [];

  if (locationname && locationname.resolutions.length > 0) {
    if (locationname.resolutions[0].status === "ER_SUCCESS_MATCH") {
      locations.push(locationname.resolutions[0].values[0].name);
    } else {
      locations.push(locationname.value);
    }
  } else if (inout.resolutions.length > 0) {
    if (inout.resolutions[0].status === "ER_SUCCESS_MATCH") {
      if (inout.resolutions[0].values[0].name === "out") {
        locations.push("outside");
      } else {
        locations.push("inside");
        locations.push("house");
        locations.push("garden room");
        // TODO: make generic
      }
    }
  }

  return locations;
} //get_matched_cat(request)


function httpGet(options) {
  return new Promise(((resolve, reject) => {
    const request = https.request(options, (response) => {
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
    request.end();
  }));
}


function httpPost(options) {
  return new Promise(((resolve, reject) => {
    const request = https.request(options, (response) => {
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
    request.end();
  }));
}


app.listen(PORT);
console.log("Listening on port " + PORT + ", try http://localhost:" + PORT + "/catflap");