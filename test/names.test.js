const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeName,
  editDistance,
  matchName,
} = require("../apps/catflap/names");

test("normalizeName drops accents, case and punctuation", () => {
  assert.equal(normalizeName("Brontë"), "bronte");
  assert.equal(normalizeName("Zoë-Anne"), "zoe anne");
  assert.equal(normalizeName("  Mr. Tibbs "), "mr tibbs");
});

test("editDistance", () => {
  assert.equal(editDistance("bronte", "bronte"), 0);
  assert.equal(editDistance("bronte", "bronty"), 1);
  assert.equal(editDistance("bronte", "brontay"), 2);
});

const cats = [
  { name: "Brontë" },
  { name: "Garfield", synonyms: ["Garfy"] },
  { name: "Tom" },
  { name: "Tim" },
];

test("exact matches ignore accents and case", () => {
  assert.equal(matchName("BRONTE", cats), "Brontë");
  assert.equal(matchName("garfy", cats), "Garfield");
});

test("near misses match a single close cat", () => {
  assert.equal(matchName("brontay", cats), "Brontë");
  assert.equal(matchName("garfeld", cats), "Garfield");
});

test("short names must match exactly", () => {
  assert.equal(matchName("tom", cats), "Tom");
  assert.equal(matchName("tam", cats), null);
});

test("names that are too different don't match", () => {
  assert.equal(matchName("rover", cats), null);
  assert.equal(matchName("", cats), null);
  assert.equal(matchName(undefined, cats), null);
});

test("a tie between two cats doesn't guess", () => {
  const twins = [{ name: "Bella" }, { name: "Della" }];
  assert.equal(matchName("Kella", twins), null);
});
