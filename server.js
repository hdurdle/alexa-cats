var AlexaAppServer = require('alexa-app-server');

AlexaAppServer.start({
  server_root: __dirname,
  public_html: "public_html", // Static content
  app_dir: "apps",            // Location of alexa-app modules
  app_root: "/alexa/",        // Service root
  verify: false,
  port: 8080                  // Port to use
});