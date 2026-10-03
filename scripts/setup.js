// Setup wizard: signs in to Sure Petcare, finds your household, pets and cat
// flaps, asks a few questions and writes config.json (and .env for the
// public address). Runs in the "setup" container; see DEPLOY.md.
//
//   node scripts/setup.js            full setup
//   node scripts/setup.js --refresh  re-read pets and flaps, keep answers
const fs = require("fs");
const path = require("path");
const readlinePromises = require("readline/promises");
const { Writable } = require("stream");

const { createClient } = require("../apps/catflap/sureflap");
const { describeHousehold, buildConfig } = require("../apps/catflap/defaults");

// where config.json and .env go: the mounted folder in the container
const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(__dirname, "..");
const CONFIG_FILE = path.join(OUTPUT_DIR, "config.json");
const ENV_FILE = path.join(OUTPUT_DIR, ".env");

// "3 5, 7" -> the ids of pets 3, 5 and 7 in the list (1-based)
function parseNumbers(input, count) {
  return [...new Set((input.match(/\d+/g) || []).map(Number))].filter(
    (n) => n >= 1 && n <= count,
  );
}

// "https://abc.ngrok-free.app/" -> "abc.ngrok-free.app"
function cleanDomain(input) {
  return input
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function readEnv(file) {
  const values = {};
  try {
    fs.readFileSync(file, "utf8")
      .split(/\r?\n/)
      .forEach((line) => {
        const match = /^\s*([A-Z_]+)\s*=\s*(.*)\s*$/.exec(line);
        if (match) values[match[1]] = match[2];
      });
  } catch {
    // no .env yet
  }
  return values;
}

// Writes one of our output files. The tools container runs as root, so on
// Linux the file is handed to whoever owns the folder, letting them edit it.
// config.json must stay readable by the skill's container, which runs as an
// ordinary user, so it is 0644; .env is only read by Docker on this computer,
// so it is private.
function writeOutput(file, text, mode) {
  fs.writeFileSync(file, text, { mode });
  fs.chmodSync(file, mode);
  if (process.getuid && process.getuid() === 0) {
    const { uid, gid } = fs.statSync(path.dirname(file));
    if (uid !== 0) {
      try {
        fs.chownSync(file, uid, gid);
      } catch {
        // Docker Desktop shares folders without Linux owners; nothing to do
      }
    }
  }
}

function writeConfig(file, config) {
  writeOutput(file, JSON.stringify(config, null, 2) + "\n", 0o644);
}

function writeEnv(file, values) {
  const text = Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  writeOutput(file, text + "\n", 0o600);
}

// One input reader for the whole wizard. While a secret is typed nothing is
// echoed, like a normal password prompt.
function createPrompt() {
  let muted = false;
  // everything the reader echoes goes through here, so it can be switched off
  const output = new Writable({
    write(chunk, encoding, done) {
      if (!muted) process.stdout.write(chunk, encoding);
      done();
    },
  });
  output.isTTY = process.stdout.isTTY;
  output.columns = process.stdout.columns;
  const rl = readlinePromises.createInterface({
    input: process.stdin,
    output,
    terminal: Boolean(process.stdin.isTTY),
  });
  rl.askHidden = async (question) => {
    process.stdout.write(question);
    muted = true;
    try {
      return await rl.question("");
    } finally {
      muted = false;
      process.stdout.write("\n");
    }
  };
  return rl;
}

async function signIn(rl, previous) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    let email = previous.email;
    let password = previous.password;
    if (!email || !password || attempt > 1) {
      email = (await rl.question("  Sure Petcare email address: ")).trim();
      password = await rl.askHidden("  Sure Petcare password: ");
    }
    try {
      const start = await createClient({ email, password }).getStart();
      return { email, password, start };
    } catch (error) {
      if (error.status === 401 || error.status === 400) {
        console.log("  That email or password wasn't accepted. Try again.\n");
        previous = {};
      } else {
        throw new Error("Couldn't reach Sure Petcare: " + error.message, {
          cause: error,
        });
      }
    }
  }
  throw new Error("Sign-in failed three times.");
}

async function chooseHousehold(rl, households, previousId) {
  if (households.length === 0) {
    throw new Error("Your Sure Petcare account has no households.");
  }
  if (households.some((x) => x.id === previousId)) return previousId;
  if (households.length === 1) return households[0].id;
  console.log("  Your account has more than one household:");
  households.forEach((x, i) => console.log(`    ${i + 1}. ${x.name}`));
  for (;;) {
    const [n] = parseNumbers(
      await rl.question("  Which one is this for? Type its number: "),
      households.length,
    );
    if (n) return households[n - 1].id;
  }
}

async function choosePets(rl, pets, previous, refresh) {
  if (refresh && previous.catdobs) {
    const known = previous.catdobs.map((x) => x.name);
    const kept = pets.filter((pet) => known.includes(pet.name));
    const added = pets.filter((pet) => !known.includes(pet.name));
    for (const pet of added) {
      const answer = await rl.question(
        `  New pet found: ${pet.name}. Include it? [Y/n] `,
      );
      if (!/^n/i.test(answer.trim())) kept.push(pet);
    }
    return kept.map((x) => x.id);
  }

  console.log("  These pets are on your account:");
  pets.forEach((pet, i) =>
    console.log(
      `    ${i + 1}. ${pet.name}` + (pet.dob ? ` (born ${pet.dob})` : ""),
    ),
  );
  const answer = await rl.question(
    "  Press Enter to include them all, or type the numbers of any to leave\n" +
      "  out (for example: 3 5): ",
  );
  const leaveOut = parseNumbers(answer, pets.length).map((n) => pets[n - 1].id);
  return pets.map((x) => x.id).filter((id) => !leaveOut.includes(id));
}

async function chooseRooms(rl, flaps, previous, refresh) {
  const rooms = {};
  const previousRoom = (id) =>
    ((previous.flaps || []).find((x) => x.id === id) || {}).in;
  const newFlaps = flaps.filter((flap) => !previousRoom(flap.id));
  const toAsk = refresh ? newFlaps : flaps;
  if (toAsk.length === 0) return rooms;

  console.log(
    "  Each cat flap leads from outside into a room. You can name the room\n" +
      '  (like "kitchen" or "garage") or press Enter to just call it "inside".',
  );
  for (const flap of toAsk) {
    const current = previousRoom(flap.id) || "inside";
    const answer = (
      await rl.question(`    Room behind "${flap.name}" [${current}]: `)
    ).trim();
    rooms[flap.id] = answer || current;
  }
  return rooms;
}

// Adds a nickname Alexa should also recognise for one cat in a config
function addNickname(config, catName, nickname) {
  const cat = config.catdobs.find((x) => x.name === catName);
  const clean = nickname.trim();
  if (!cat || !clean) return config;
  cat.synonyms = cat.synonyms || [];
  if (!cat.synonyms.some((x) => x.toLowerCase() === clean.toLowerCase())) {
    cat.synonyms.push(clean);
  }
  return config;
}

async function chooseNicknames(rl, config) {
  console.log(
    "  If Alexa ever doesn't understand a cat's name, you can give it a\n" +
      "  nickname here. Most people can just press Enter.",
  );
  for (;;) {
    const [n] = parseNumbers(
      await rl.question(
        "  Type a pet's number from the list to add a nickname, or press\n" +
          "  Enter to carry on: ",
      ),
      config.catdobs.length,
    );
    if (!n) return config;
    const cat = config.catdobs[n - 1];
    const nickname = await rl.question(`    Nickname for ${cat.name}: `);
    addNickname(config, cat.name, nickname);
  }
}

async function chooseTunnel(rl, env) {
  const hasTunnel = env.NGROK_AUTHTOKEN && env.NGROK_DOMAIN;
  if (hasTunnel) {
    const answer = await rl.question(
      `  Keep the public address ${env.NGROK_DOMAIN}? [Y/n] `,
    );
    if (!/^n/i.test(answer.trim())) return env;
  }
  console.log(
    "  Paste the two things from your ngrok account (see DEPLOY.md step 3).",
  );
  let token = "";
  while (!token) {
    token = (await rl.askHidden("  ngrok authtoken: ")).trim();
  }
  let domain = "";
  while (!domain.includes(".")) {
    domain = cleanDomain(
      await rl.question("  ngrok domain (like abc-def.ngrok-free.app): "),
    );
  }
  return { ...env, NGROK_AUTHTOKEN: token, NGROK_DOMAIN: domain };
}

async function main() {
  const refresh = process.argv.includes("--refresh");
  const previous = readJson(CONFIG_FILE) || {};
  const rl = createPrompt();

  try {
    console.log("\nCat flap setup\n");

    console.log("Step 1 of 4: sign in to Sure Petcare");
    console.log(
      "  Your password is saved only in config.json on this computer, so the\n" +
        "  skill can sign in by itself.",
    );
    const { email, password, start } = await signIn(
      rl,
      refresh ? previous : {},
    );
    console.log("  Signed in.\n");

    console.log("Step 2 of 4: your household");
    const householdId = await chooseHousehold(
      rl,
      start.households || [],
      previous.household,
    );
    const { pets, flaps } = describeHousehold(start, householdId);
    console.log(
      `  Found ${pets.length} pet(s) and ${flaps.length} cat flap(s).\n`,
    );
    if (flaps.length === 0) {
      throw new Error(
        "No cat flaps or pet doors were found in that household.",
      );
    }

    console.log("Step 3 of 4: pets and rooms");
    const petIds = await choosePets(rl, pets, previous, refresh);
    const rooms = await chooseRooms(rl, flaps, previous, refresh);
    const config = buildConfig(
      start,
      { email, password, householdId, petIds, rooms },
      previous,
    );
    console.log("  Pets included:");
    config.catdobs.forEach((cat, i) =>
      console.log(
        `    ${i + 1}. ${cat.name}` +
          (cat.synonyms ? ` (also "${cat.synonyms.join('", "')}")` : ""),
      ),
    );
    await chooseNicknames(rl, config);
    writeConfig(CONFIG_FILE, config);
    console.log(
      `  Saved config.json with ${config.catdobs.length} pet(s) and ${flaps.length} cat flap(s).\n`,
    );

    console.log("Step 4 of 4: public address");
    if (process.argv.includes("--no-tunnel")) {
      console.log("  Skipped (--no-tunnel).\n");
    } else {
      const env = await chooseTunnel(rl, readEnv(ENV_FILE));
      writeEnv(ENV_FILE, env);
      console.log("  Saved.\n");
    }

    console.log("Setup finished.");
  } finally {
    rl.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("\nSetup stopped: " + error.message);
    process.exit(1);
  });
}

module.exports = {
  parseNumbers,
  cleanDomain,
  readEnv,
  addNickname,
  writeConfig,
};
