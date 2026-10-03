// SureFlap API client.
//
// Authenticates with email and password when they are configured, caching the
// token and logging in again once if a request gets a 401. A static token is
// used as-is when no login details are set.
const crypto = require("crypto");

const API_URL = "https://app.api.surehub.io/api";

function createClient(config, { fetch = globalThis.fetch, timeoutMs = 5000 } = {}) {
  const canLogin = Boolean(config.email && config.password);
  const deviceId = String(crypto.randomInt(1e9, 1e10));
  let token = config.token || null;
  let pendingLogin = null;

  async function call(method, path, body, auth = true) {
    const headers = { Accept: "application/json" };
    if (body) headers["Content-Type"] = "application/json";
    if (auth) headers.Authorization = "Bearer " + token;

    const res = await fetch(API_URL + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const error = new Error(`SureFlap ${method} ${path}: ${res.status}`);
      error.status = res.status;
      throw error;
    }
    const text = await res.text();
    return text ? JSON.parse(text) : {};
  }

  // concurrent requests share one login
  function login() {
    if (!pendingLogin) {
      pendingLogin = call(
        "POST",
        "/auth/login",
        {
          email_address: config.email,
          password: config.password,
          device_id: deviceId,
        },
        false
      )
        .then((result) => {
          token = result.data.token;
        })
        .finally(() => {
          pendingLogin = null;
        });
    }
    return pendingLogin;
  }

  async function request(method, path, body) {
    if (!token && canLogin) await login();
    try {
      return await call(method, path, body);
    } catch (error) {
      if (error.status !== 401 || !canLogin) throw error;
      await login();
      return call(method, path, body);
    }
  }

  return {
    getPets: async () =>
      (
        await request(
          "GET",
          `/household/${config.household}/pet?with[]=position&with[]=tag`
        )
      ).data,
    getDevices: async () =>
      (await request("GET", "/device?with[]=status")).data,
    // where: 1 = inside, 2 = outside
    setPosition: (petId, where) =>
      request("POST", `/pet/${petId}/position`, {
        since: new Date().toISOString(),
        where,
      }),
    // profile: 2 = allowed out, 3 = kept in
    setTagProfile: (deviceId, tagId, profile) =>
      request("PUT", `/device/${deviceId}/tag/${tagId}`, { profile }),
  };
}

module.exports = { createClient };
