const test = require("node:test");
const assert = require("node:assert/strict");

const speech = require("../apps/catflap/speech");

test("formatList joins names naturally", () => {
  assert.equal(speech.formatList([]), "");
  assert.equal(speech.formatList(["A"]), "A");
  assert.equal(speech.formatList(["A", "B"]), "A and B");
  assert.equal(speech.formatList(["A", "B", "C"]), "A, B and C");
});

test("age in years, months and days", () => {
  assert.equal(
    speech.getAgeSpeechForCat(
      { name: "Garfield", dob: "2018-06-19" },
      "2026-10-03"
    ),
    "Garfield is 8 years, 3 months and 14 days old."
  );
});

test("age on a birthday", () => {
  assert.equal(
    speech.getAgeSpeechForCat(
      { name: "Garfield", dob: "2018-06-19" },
      "2026-06-19"
    ),
    "Garfield is exactly 8 years old. Happy Birthday Garfield!"
  );
});

test("age of a young cat", () => {
  assert.equal(
    speech.getAgeSpeechForCat({ name: "Kit", dob: "2026-08-03" }, "2026-10-03"),
    "Kit is exactly 2 months old."
  );
});

test("location speech for a room", () => {
  assert.equal(
    speech.getSpeechForCat(
      { name: "Garfield", location: "house", since: "2026-10-03T08:00:00Z" },
      false,
      "2026-10-03T11:00:00Z"
    ),
    "Garfield has been in the house for 3 hours."
  );
});

test("location speech outside purrs when asked", () => {
  const text = speech.getSpeechForCat(
    { name: "Felix", location: "outside", since: "2026-10-03T08:00:00Z" },
    true,
    "2026-10-03T08:30:00Z"
  );
  assert.match(text, /^<audio [^>]+\/>Felix has been outside for 30 minutes\.$/);
});
