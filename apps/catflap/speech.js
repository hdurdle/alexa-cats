// Speech formatting. Pure functions: no I/O, so they can be tested directly.
const moment = require("moment");

const insidePurr =
  " <audio src='soundbank://soundlibrary/animals/amzn_sfx_cat_purr_01'/>";
const outsidePurr =
  "<audio src='soundbank://soundlibrary/animals/amzn_sfx_cat_purr_02'/>";

// "A", "A and B", "A, B and C"
function formatList(names) {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
}

function formatCatList(cats) {
  return formatList(cats.map((x) => x.name));
}

// "Felix is inside." / "Felix and Tom are inside." / "" for nobody
function describeGroup(cats, phrase) {
  if (cats.length === 0) return "";
  return formatCatList(cats) + (cats.length > 1 ? " are " : " is ") + phrase + ".";
}

// one sentence per non-empty group, e.g. "Felix is inside. Tom is outside."
function describeGroups(groups) {
  const speech = groups
    .map(([cats, phrase]) => describeGroup(cats, phrase))
    .filter(Boolean)
    .join(" ");
  return speech || "No cats found.";
}

function getAgeSpeechForCat(catDetail, now = moment()) {
  var dob = moment(catDetail["dob"]);
  now = moment(now);
  var years = now.diff(dob, "year");
  dob.add(years, "years");
  var months = now.diff(dob, "months");
  dob.add(months, "months");
  var days = now.diff(dob, "days");

  var birthday = false;

  var speech = catDetail.name + " is ";

  if (years > 0) {
    if (months < 1 && days < 1) {
      speech += "exactly ";
      birthday = true;
    }
    if (years === 1) {
      speech += years + " year";
    } else {
      speech += years + " years";
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
      speech += months + " month";
    } else {
      speech += months + " months";
    }
  }
  if (days > 0) {
    if (months > 0 || years > 0) {
      speech += " and ";
    }
    if (days === 1) {
      speech += days + " day";
    } else {
      speech += days + " days";
    }
  }

  speech += " old.";
  if (birthday) {
    speech += " Happy Birthday " + catDetail.name + "!";
  }

  return speech;
}

function getSpeechForCat(cat, shouldPurr = false, now = moment()) {
  let purr = "";
  let inThe = " has been in the ";
  const since = moment(cat.since).from(now, true);

  if (cat.location === "outside" || cat.location === "inside") {
    inThe = " has been ";
  }
  if (shouldPurr && cat.location === "outside") {
    purr = outsidePurr;
  }
  if (shouldPurr && cat.location === "inside") {
    purr = insidePurr;
  }
  return purr + cat.name + inThe + cat.location + " for " + since + ".";
}

module.exports = {
  formatList,
  formatCatList,
  describeGroup,
  describeGroups,
  getAgeSpeechForCat,
  getSpeechForCat,
};
