// Entry point: wires the skill to the real config and SureFlap client.
const config = require("./config.json");
const { createClient } = require("./sureflap");
const { createApp } = require("./skill");

// Allow this module to be reloaded by hotswap when changed
module.change_code = 1;

module.exports = createApp({ config, client: createClient(config) });
