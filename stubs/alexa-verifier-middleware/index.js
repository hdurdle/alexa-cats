// alexa-app requires this at load time but only uses it in alexaApp.express(),
// which this project doesn't call. Requests are verified by
// apps/catflap/verify.js instead.
module.exports = function alexaVerifierMiddleware() {
  throw new Error("Use apps/catflap/verify.js to verify Alexa requests");
};
