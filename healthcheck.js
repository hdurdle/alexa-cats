// Exits 0 if the server answers /healthz, for the Docker HEALTHCHECK.
const http = require("http");

const request = http.get(
  {
    host: "localhost",
    port: process.env.PORT || 8080,
    path: "/healthz",
    timeout: 2000,
  },
  (res) => process.exit(res.statusCode === 200 ? 0 : 1),
);
request.on("timeout", () => request.destroy());
request.on("error", () => process.exit(1));
