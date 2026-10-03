// HTTP server for the skill.
//
// POST /alexa/catflap   Alexa requests (signature-verified unless ALEXA_VERIFY=false)
// GET  /alexa/catflap   ?schema or ?utterances, only when ALEXA_DEBUG=true
// GET  /healthz         liveness check
const express = require("express");

const { loadConfig } = require("./apps/catflap/config");
const { createClient } = require("./apps/catflap/sureflap");
const { createApp, createLogger } = require("./apps/catflap/skill");
const { createVerifier, verifierMiddleware } = require("./apps/catflap/verify");

const ENDPOINT = "/alexa/catflap";

function applicationIdOf(body) {
  const fromContext =
    body && body.context && body.context.System && body.context.System.application;
  const fromSession = body && body.session && body.session.application;
  return (fromContext || fromSession || {}).applicationId;
}

// verify: a function from createVerifier(), or false to skip verification
function createServer({ config, alexaApp, logger, verify, debug = false }) {
  const app = express();
  app.disable("x-powered-by");

  app.get("/healthz", (req, res) => res.send("ok"));

  if (debug) {
    app.get(ENDPOINT, (req, res) => {
      if ("utterances" in req.query) {
        return res.type("text/plain").send(alexaApp.utterances());
      }
      res.type("application/json").send(alexaApp.schemas.askcli("cat flap"));
    });
  }

  if (verify) {
    // the signature covers the raw bytes, so parse JSON only after verifying
    app.post(ENDPOINT, express.raw({ type: "*/*", limit: "256kb" }));
    app.post(ENDPOINT, verifierMiddleware(verify, logger));
  } else {
    app.post(ENDPOINT, express.json({ limit: "256kb" }));
  }

  app.post(ENDPOINT, (req, res, next) => {
    if (config.applicationId && applicationIdOf(req.body) !== config.applicationId) {
      logger.warn("Rejected request for applicationId " + applicationIdOf(req.body));
      return res.status(403).json({ status: "failure", reason: "unknown skill" });
    }
    next();
  });

  app.post(ENDPOINT, async (req, res) => {
    try {
      res.json(await alexaApp.request(req.body));
    } catch (error) {
      logger.error((error && error.stack) || error);
      res.status(500).json({ status: "failure", reason: "server error" });
    }
  });

  return app;
}

function main() {
  const config = loadConfig();
  const logger = createLogger(config);
  const verify = process.env.ALEXA_VERIFY !== "false";
  const debug = process.env.ALEXA_DEBUG === "true";
  const port = Number(process.env.PORT) || 8080;

  if (!verify) logger.warn("Alexa request verification is OFF");

  const alexaApp = createApp({ config, client: createClient(config), logger });
  const server = createServer({
    config,
    alexaApp,
    logger,
    verify: verify && createVerifier(),
    debug,
  }).listen(
    port,
    () => logger.info(`listening on port ${port}`)
  );

  for (const signal of ["SIGTERM", "SIGINT"]) {
    process.on(signal, () => {
      logger.info(`${signal}: shutting down`);
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 5000).unref();
    });
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = { createServer };
