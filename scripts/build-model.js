// Writes the Alexa interaction model to paste into the developer console.
//
//   npm run model            from config.json -> interaction_model.local.json
//                            (git-ignored: it holds your cats' and rooms' names)
//   npm run model:example    from config-dist.json -> interaction_model.json
const fs = require("fs");
const path = require("path");

const { buildModel } = require("../apps/catflap/interaction-model");

const dir = path.join(__dirname, "..", "apps", "catflap");
const example = process.argv.includes("--example");

const configFile = path.join(dir, example ? "config-dist.json" : "config.json");
const outFile = path.join(
  dir,
  example ? "interaction_model.json" : "interaction_model.local.json",
);

const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
fs.writeFileSync(outFile, JSON.stringify(buildModel(config), null, 2) + "\n");
console.log("Wrote " + path.relative(process.cwd(), outFile));
