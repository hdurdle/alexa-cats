// Writes the Alexa interaction model to paste into the developer console.
//
//   npm run model            from your config.json (CONFIG_PATH, the repo root
//                            or apps/catflap) -> interaction_model.local.json
//                            (git-ignored: it holds your cats' and rooms' names)
//   npm run model:example    from config-dist.json -> interaction_model.json
const fs = require("fs");
const path = require("path");

const { buildModel } = require("../apps/catflap/interaction-model");
const { defaultConfigPath } = require("../apps/catflap/config");

const dir = path.join(__dirname, "..", "apps", "catflap");
const example = process.argv.includes("--example");

const configFile = example
  ? path.join(dir, "config-dist.json")
  : process.env.CONFIG_PATH || defaultConfigPath();
const outFile = path.join(
  dir,
  example ? "interaction_model.json" : "interaction_model.local.json",
);

const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
fs.writeFileSync(outFile, JSON.stringify(buildModel(config), null, 2) + "\n");
console.log("Wrote " + path.relative(process.cwd(), outFile));
