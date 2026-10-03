const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  { ignores: ["node_modules/"] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "commonjs",
      globals: globals.node,
    },
    rules: {
      "no-unused-vars": ["error", { args: "none" }],
    },
  },
];
