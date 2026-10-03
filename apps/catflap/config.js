// Loads config.json, applies environment overrides and checks it is usable.
const fs = require("fs");
const path = require("path");

// The container mounts config.json next to this file; when running from a
// checkout, the setup wizard writes it to the repo root instead.
const DEFAULT_PATHS = [
  path.join(__dirname, "config.json"),
  path.join(__dirname, "..", "..", "config.json"),
];

function defaultConfigPath() {
  return DEFAULT_PATHS.find((x) => fs.existsSync(x)) || DEFAULT_PATHS[0];
}

// environment variable -> config key
const ENV_OVERRIDES = {
  SUREFLAP_TOKEN: "token",
  SUREFLAP_EMAIL: "email",
  SUREFLAP_PASSWORD: "password",
  SUREFLAP_HOUSEHOLD: "household",
  ALEXA_APPLICATION_ID: "applicationId",
};

function applyEnv(config, env) {
  for (const [name, key] of Object.entries(ENV_OVERRIDES)) {
    if (env[name]) config[key] = env[name];
  }
  if (config.household !== undefined)
    config.household = Number(config.household);
  return config;
}

// the placeholder from config-dist.json counts as no token
function hasToken(config) {
  return Boolean(config.token) && !config.token.startsWith("your_");
}

function validateConfig(config) {
  const problems = [];

  if (!hasToken(config) && !(config.email && config.password)) {
    problems.push("set email and password (or token) for the SureFlap API");
  }
  if (!Number.isInteger(config.household) || config.household <= 0) {
    problems.push("household must be your SureFlap household ID");
  }
  if (!Array.isArray(config.flaps) || !config.flaps.some((x) => x.id === 0)) {
    problems.push('flaps must include the { "id": 0 } entry');
  } else {
    const ids = config.flaps.map((x) => x.id);
    const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (duplicates.length > 0) {
      problems.push(
        "duplicate flap ids: " + [...new Set(duplicates)].join(", "),
      );
    }
    config.flaps.forEach((flap) => {
      if (!flap.in || !flap.out) {
        problems.push("flap " + flap.id + " needs both 'in' and 'out'");
      }
    });
  }
  if (!Array.isArray(config.catdobs)) {
    problems.push("catdobs must list your cats");
  }

  if (problems.length > 0) {
    throw new Error("Invalid config:\n  - " + problems.join("\n  - "));
  }
  if (!hasToken(config)) delete config.token;
  // an empty or placeholder skill ID means don't check it
  if (!config.applicationId || config.applicationId.includes("your-skill-id")) {
    delete config.applicationId;
  }
  return config;
}

function loadConfig(
  file = process.env.CONFIG_PATH || defaultConfigPath(),
  env = process.env,
) {
  const config = JSON.parse(fs.readFileSync(file, "utf8"));
  return validateConfig(applyEnv(config, env));
}

module.exports = { loadConfig, defaultConfigPath, applyEnv, validateConfig };
