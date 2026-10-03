// Creates or updates your Alexa skill with the ASK CLI: the skill itself,
// its web address, and the interaction model built from config.json. Runs in
// the "setup" container; see DEPLOY.md.
//
//   node scripts/alexa-skill.js            create or update
//   node scripts/alexa-skill.js --dry-run  show what would be sent
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const readlinePromises = require("readline/promises");

const { buildModel } = require("../apps/catflap/interaction-model");
const { readEnv, writeConfig } = require("./setup");

const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(__dirname, "..");
const CONFIG_FILE = path.join(OUTPUT_DIR, "config.json");
const ENV_FILE = path.join(OUTPUT_DIR, ".env");

const LOCALES = ["en-GB", "en-US", "en-AU", "en-CA", "en-IN"];
const WILDCARD_DOMAINS = [".ngrok-free.app", ".ngrok-free.dev", ".ngrok.app"];

// ngrok's free domains share a wildcard certificate; Alexa needs to know
function certificateType(endpoint) {
  const host = new URL(endpoint).hostname;
  return WILDCARD_DOMAINS.some((x) => host.endsWith(x))
    ? "Wildcard"
    : "Trusted";
}

function buildManifest({ name, locale, endpoint }) {
  return {
    manifest: {
      manifestVersion: "1.0",
      publishingInformation: {
        locales: {
          [locale]: {
            name,
            summary: "Says where your cats are, using your SureFlap cat flaps.",
            description:
              "A private skill for your own SureFlap cat flaps. Not affiliated with Sure Petcare.",
            examplePhrases: [
              "Alexa, ask cat flap where are the cats",
              "Alexa, ask cat flap who is outside",
              "Alexa, ask cat flap how are the batteries",
            ],
            keywords: [],
          },
        },
      },
      apis: {
        custom: {
          endpoint: {
            uri: endpoint,
            sslCertificateType: certificateType(endpoint),
          },
        },
      },
      privacyAndCompliance: {
        allowsPurchases: false,
        usesPersonalInfo: false,
        isChildDirected: false,
        isExportCompliant: true,
        containsAds: false,
        locales: { [locale]: {} },
      },
    },
  };
}

// An existing manifest with its custom endpoint set to this address
function withEndpoint(current, endpoint) {
  const manifest = JSON.parse(JSON.stringify(current));
  manifest.manifest.apis = manifest.manifest.apis || {};
  manifest.manifest.apis.custom = manifest.manifest.apis.custom || {};
  manifest.manifest.apis.custom.endpoint = {
    uri: endpoint,
    sslCertificateType: certificateType(endpoint),
  };
  return manifest;
}

// Runs an ASK CLI command; returns parsed JSON output, or throws
function ask(args, { dryRun = false, inherit = false } = {}) {
  if (dryRun) {
    console.log("  would run: ask " + args.join(" "));
    return {};
  }
  // On Windows the ASK CLI is a .cmd file, which needs a shell, so quote the
  // arguments ourselves (temp file paths can contain spaces)
  const windows = process.platform === "win32";
  const result = windows
    ? spawnSync(["ask", ...args.map((x) => `"${x}"`)].join(" "), {
        encoding: "utf8",
        stdio: inherit ? "inherit" : "pipe",
        shell: true,
      })
    : spawnSync("ask", args, {
        encoding: "utf8",
        stdio: inherit ? "inherit" : "pipe",
      });
  if (result.error) {
    throw new Error("The ASK CLI isn't installed: " + result.error.message);
  }
  if (inherit) {
    if (result.status !== 0) throw new Error("ask " + args[0] + " failed");
    return {};
  }
  if (result.status !== 0) {
    const error = new Error((result.stderr || result.stdout).trim());
    error.output = result.stderr + result.stdout;
    throw error;
  }
  const text = result.stdout.trim();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { text };
  }
}

function writeTemp(name, data) {
  const file = path.join(os.tmpdir(), name);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  return "file:" + file;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Waits for a manifest or interaction model update to finish
async function waitFor(skillId, resource, locale) {
  for (let i = 0; i < 90; i++) {
    const status = ask([
      "smapi",
      "get-skill-status",
      "--skill-id",
      skillId,
      "--resource",
      resource,
    ]);
    const entry =
      resource === "manifest"
        ? status.manifest
        : status.interactionModel && status.interactionModel[locale];
    const state =
      entry && entry.lastUpdateRequest && entry.lastUpdateRequest.status;
    if (state === "SUCCEEDED") return;
    if (state === "FAILED") {
      throw new Error(
        `Amazon couldn't build the ${resource}:\n` +
          JSON.stringify(entry.lastUpdateRequest, null, 2),
      );
    }
    await sleep(5000);
  }
  throw new Error(`Timed out waiting for the ${resource} to build.`);
}

function signedIn() {
  try {
    ask(["smapi", "list-skills-for-vendor", "--max-results", "1"]);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  const env = readEnv(ENV_FILE);
  const endpointBase =
    process.env.SKILL_ENDPOINT ||
    (env.NGROK_DOMAIN && `https://${env.NGROK_DOMAIN}`);
  if (!endpointBase) {
    throw new Error("No public address yet. Run the setup step first.");
  }
  const endpoint = endpointBase.replace(/\/+$/, "") + "/alexa/catflap";

  const rl = readlinePromises.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    console.log("\nAlexa skill\n");

    if (!dryRun && !signedIn()) {
      console.log(
        "Sign in to your Amazon developer account. A link will appear: open it,\n" +
          "sign in, then copy the code it shows back here. If you're asked about\n" +
          "linking an AWS account, answer No.\n",
      );
      ask(["configure", "--no-browser"], { inherit: true });
      if (!signedIn()) throw new Error("Amazon sign-in didn't work.");
    }

    const alexa = config.alexa || {};
    if (!alexa.name) {
      const name = (
        await rl.question("  Name for your skill [My Cat Flap]: ")
      ).trim();
      alexa.name = name || "My Cat Flap";
    }
    if (!alexa.locale) {
      console.log("  Which English does your Echo use?");
      LOCALES.forEach((x, i) => console.log(`    ${i + 1}. ${x}`));
      const answer = (await rl.question("  Type its number [1]: ")).trim();
      alexa.locale = LOCALES[Number(answer) - 1] || LOCALES[0];
    }

    let skillId = config.applicationId;

    if (skillId) {
      // change only the web address, keeping everything else in the manifest
      console.log("  Updating your skill's web address...");
      const current = dryRun
        ? buildManifest({ ...alexa, endpoint })
        : ask([
            "smapi",
            "get-skill-manifest",
            "--skill-id",
            skillId,
            "--stage",
            "development",
          ]);
      const manifest = withEndpoint(current, endpoint);
      ask(
        [
          "smapi",
          "update-skill-manifest",
          "--skill-id",
          skillId,
          "--stage",
          "development",
          "--manifest",
          writeTemp("manifest.json", manifest),
        ],
        { dryRun },
      );
    } else {
      console.log("  Creating your skill...");
      const manifest = buildManifest({ ...alexa, endpoint });
      const created = ask(
        [
          "smapi",
          "create-skill-for-vendor",
          "--manifest",
          writeTemp("manifest.json", manifest),
        ],
        { dryRun },
      );
      skillId = created.skillId || "amzn1.ask.skill.dry-run";
    }
    if (!dryRun) await waitFor(skillId, "manifest");

    console.log("  Uploading the words your skill understands...");
    ask(
      [
        "smapi",
        "set-interaction-model",
        "--skill-id",
        skillId,
        "--stage",
        "development",
        "--locale",
        alexa.locale,
        "--interaction-model",
        writeTemp("model.json", buildModel(config)),
      ],
      { dryRun },
    );
    if (!dryRun) {
      console.log("  Waiting for Amazon to build it (a minute or two)...");
      await waitFor(skillId, "interactionModel", alexa.locale);
    }

    console.log("  Turning the skill on for your Echo...");
    ask(
      [
        "smapi",
        "set-skill-enablement",
        "--skill-id",
        skillId,
        "--stage",
        "development",
      ],
      { dryRun },
    );

    if (!dryRun) {
      config.applicationId = skillId;
      config.alexa = alexa;
      writeConfig(CONFIG_FILE, config);
    }
    console.log(`\n  Done. Try: "Alexa, ask cat flap where are the cats".\n`);
  } finally {
    rl.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("\nAlexa skill setup stopped: " + error.message);
    process.exit(1);
  });
}

module.exports = { buildManifest, withEndpoint, certificateType };
