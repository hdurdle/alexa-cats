// Forgiving cat name matching: ignores accents, case and punctuation, and
// accepts near misses, so "bronte" or "brontay" finds "Brontë".

// "Brontë" -> "Bronte"
function stripAccents(text) {
  return String(text)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

// "Brontë" -> "bronte", "Mr. Tibbs" -> "mr tibbs"
function normalizeName(name) {
  return stripAccents(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sameName(a, b) {
  return normalizeName(a) === normalizeName(b);
}

function editDistance(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

// how many letters can be wrong: none for very short names, more for long ones
function allowedMistakes(length) {
  if (length <= 3) return 0;
  if (length <= 5) return 1;
  return 2;
}

// The name of the cat whose name or synonym best matches what was heard, or
// null if nothing is close enough or two cats are equally close.
// cats: [{ name, synonyms }]
function matchName(heard, cats) {
  const spoken = normalizeName(heard || "");
  if (!spoken) return null;

  const candidates = cats.flatMap((cat) =>
    [cat.name, ...(cat.synonyms || [])].map((form) => ({
      name: cat.name,
      distance: editDistance(spoken, normalizeName(form)),
    })),
  );

  const exact = candidates.find((x) => x.distance === 0);
  if (exact) return exact.name;

  const best = Math.min(...candidates.map((x) => x.distance));
  if (best > allowedMistakes(spoken.length)) return null;

  const names = new Set(
    candidates.filter((x) => x.distance === best).map((x) => x.name),
  );
  return names.size === 1 ? [...names][0] : null;
}

module.exports = {
  stripAccents,
  normalizeName,
  sameName,
  editDistance,
  matchName,
};
