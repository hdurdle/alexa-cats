const test = require("node:test");
const assert = require("node:assert/strict");

const { createClient } = require("../apps/catflap/sureflap");

// a fake fetch that answers from a list of [status, body] responses
function fakeFetch(responses) {
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url, ...options });
    const [status, body] = responses.shift();
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => (body === undefined ? "" : JSON.stringify(body)),
    };
  };
  return { fetch, calls };
}

const login = { email: "me@example.com", password: "secret", household: 1234 };

test("logs in once, then uses the token", async () => {
  const { fetch, calls } = fakeFetch([
    [200, { data: { token: "t1" } }],
    [200, { data: [{ id: 1 }] }],
    [200, { data: [] }],
  ]);
  const client = createClient(login, { fetch });

  assert.deepEqual(await client.getPets(), [{ id: 1 }]);
  await client.getDevices();

  assert.match(calls[0].url, /\/api\/auth\/login$/);
  assert.equal(JSON.parse(calls[0].body).email_address, "me@example.com");
  assert.equal(calls[0].headers.Authorization, undefined);
  assert.match(
    calls[1].url,
    /\/household\/1234\/pet\?with\[\]=position&with\[\]=tag$/
  );
  assert.equal(calls[1].headers.Authorization, "Bearer t1");
  assert.equal(calls[2].headers.Authorization, "Bearer t1");
});

test("logs in again once on a 401", async () => {
  const { fetch, calls } = fakeFetch([
    [200, { data: { token: "old" } }],
    [401],
    [200, { data: { token: "new" } }],
    [200, { data: [] }],
  ]);
  await createClient(login, { fetch }).getDevices();
  assert.equal(calls[3].headers.Authorization, "Bearer new");
});

test("concurrent requests share one login", async () => {
  const { fetch, calls } = fakeFetch([
    [200, { data: { token: "t" } }],
    [200, { data: [] }],
    [200, { data: [] }],
  ]);
  const client = createClient(login, { fetch });
  await Promise.all([client.getPets(), client.getDevices()]);
  assert.equal(calls.filter((x) => x.url.endsWith("/auth/login")).length, 1);
});

test("a static token is used without logging in", async () => {
  const { fetch, calls } = fakeFetch([[200, { data: [] }]]);
  await createClient({ token: "static", household: 1 }, { fetch }).getDevices();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].headers.Authorization, "Bearer static");
});

test("a 401 with only a static token is an error", async () => {
  const { fetch } = fakeFetch([[401]]);
  await assert.rejects(
    createClient({ token: "static", household: 1 }, { fetch }).getDevices(),
    /401/
  );
});

test("writes send JSON and accept an empty response", async () => {
  const { fetch, calls } = fakeFetch([[204]]);
  const client = createClient({ token: "t", household: 1 }, { fetch });
  await client.setTagProfile(1001, 9001, 3);
  assert.equal(calls[0].method, "PUT");
  assert.match(calls[0].url, /\/device\/1001\/tag\/9001$/);
  assert.deepEqual(JSON.parse(calls[0].body), { profile: 3 });
});

test("requests time out", async () => {
  const fetch = (url, { signal }) =>
    new Promise((resolve, reject) =>
      signal.addEventListener("abort", () => reject(signal.reason))
    );
  const client = createClient(
    { token: "t", household: 1 },
    { fetch, timeoutMs: 20 }
  );
  await assert.rejects(client.getDevices(), { name: "TimeoutError" });
});

test("devices are fetched with status, control and tags", async () => {
  const { fetch, calls } = fakeFetch([[200, { data: [] }]]);
  await createClient({ token: "t", household: 1 }, { fetch }).getDevices();
  assert.match(calls[0].url, /\/device\?with\[\]=status&with\[\]=control&with\[\]=tags$/);
});

test("setLocking puts the lock mode", async () => {
  const { fetch, calls } = fakeFetch([[200, { data: {} }]]);
  await createClient({ token: "t", household: 1 }, { fetch }).setLocking(1001, 3);
  assert.equal(calls[0].method, "PUT");
  assert.match(calls[0].url, /\/device\/1001\/control$/);
  assert.deepEqual(JSON.parse(calls[0].body), { locking: 3 });
});
