// SureFlap API client.
const rp = require("request-promise");
const https = require("https");

const API_HOST = "app.api.surehub.io";

function createClient(config) {
  const authToken = "Bearer " + config.token;

  function get(path, qs) {
    return rp({
      uri: "https://" + API_HOST + path,
      qs: qs,
      headers: { Authorization: authToken },
      json: true,
    }).then((result) => result.data);
  }

  function send(method, path, body) {
    const data = JSON.stringify(body);
    return httpPost({
      data: data,
      options: {
        host: API_HOST,
        path: path,
        port: 443,
        method: method,
        headers: {
          Authorization: authToken,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
    });
  }

  return {
    getPets: () =>
      get("/api/household/" + config.household + "/pet", {
        with: ["position", "tag"],
      }),
    getDevices: () => get("/api/device/", { with: "status" }),
    // where: 1 = inside, 2 = outside
    setPosition: (petId, where) =>
      send("POST", "/api/pet/" + petId + "/position", {
        since: new Date().toISOString(),
        where: where,
      }),
    // profile: 2 = allowed out, 3 = kept in
    setTagProfile: (deviceId, tagId, profile) =>
      send("PUT", "/api/device/" + deviceId + "/tag/" + tagId, {
        profile: profile,
      }),
  };
}

function httpPost(postObject) {
  return new Promise(function (resolve, reject) {
    var postOptions = postObject.options;
    var postData = postObject.data;

    const postRequest = https.request(postOptions, function (res) {
      res.setEncoding("utf8");
      let returnData = "";

      if (res.statusCode < 200 || res.statusCode >= 300) {
        return reject(
          new Error(
            `${res.statusCode}: ${res.req.getHeader("host")} ${res.req.path}`
          )
        );
      }

      res.on("data", function (chunk) {
        returnData += chunk;
      });

      res.on("end", () => {
        resolve(JSON.parse(returnData));
      });

      res.on("error", (error) => {
        reject(error);
      });
    });

    postRequest.write(postData);
    postRequest.end();
  });
}

module.exports = { createClient };
