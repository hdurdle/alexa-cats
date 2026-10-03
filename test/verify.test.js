const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const { createVerifier, VerificationError } = require("../apps/catflap/verify");
const h = require("./helpers");

const pki = (name) =>
  fs.readFileSync(path.join(__dirname, "fixtures", "pki", name), "utf8");
const roots = [new crypto.X509Certificate(pki("root.pem"))];
const leafKey = pki("leaf.key");
const CERT_URL = "https://s3.amazonaws.com/echo.api/echo-api-cert.pem";

function signed(body, { certUrl = CERT_URL } = {}) {
  const raw = Buffer.from(JSON.stringify(body));
  return {
    raw,
    headers: {
      signaturecertchainurl: certUrl,
      "signature-256": crypto.sign("RSA-SHA256", raw, leafKey).toString("base64"),
    },
  };
}

function verifier(chainFile = "chain.pem", extra = {}) {
  const fetched = [];
  const verify = createVerifier({
    roots,
    fetchCert: async (url) => {
      fetched.push(url);
      return pki(chainFile);
    },
    ...extra,
  });
  return { verify, fetched };
}

async function rejects(promise, pattern) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof VerificationError, error.stack);
    assert.match(error.message, pattern);
    return true;
  });
}

test("accepts a correctly signed request", async () => {
  const body = h.launchRequest();
  const { raw, headers } = signed(body);
  assert.deepEqual(await verifier().verify(headers, raw), body);
});

test("caches the certificate chain", async () => {
  const { verify, fetched } = verifier();
  for (let i = 0; i < 2; i++) {
    const { raw, headers } = signed(h.launchRequest());
    await verify(headers, raw);
  }
  assert.equal(fetched.length, 1);
});

test("rejects a tampered body", async () => {
  const { raw, headers } = signed(h.launchRequest());
  const tampered = Buffer.from(
    raw.toString().replace("LaunchRequest", "IntentRequest")
  );
  await rejects(verifier().verify(headers, tampered), /invalid signature/);
});

test("rejects missing headers", async () => {
  const { raw, headers } = signed(h.launchRequest());
  await rejects(
    verifier().verify({ ...headers, "signature-256": undefined }, raw),
    /Signature-256/
  );
  await rejects(
    verifier().verify({ ...headers, signaturecertchainurl: undefined }, raw),
    /SignatureCertChainUrl/
  );
});

test("rejects an old request", async () => {
  const body = h.launchRequest();
  body.request.timestamp = new Date(Date.now() - 151 * 1000).toISOString();
  const { raw, headers } = signed(body);
  await rejects(verifier().verify(headers, raw), /150 seconds/);
});

for (const [url, pattern] of [
  ["http://s3.amazonaws.com/echo.api/cert.pem", /https/],
  ["https://evil.example.com/echo.api/cert.pem", /host/],
  ["https://s3.amazonaws.com:8443/echo.api/cert.pem", /port/],
  ["https://s3.amazonaws.com/other.bucket/cert.pem", /path/],
  ["https://s3.amazonaws.com/echo.api/../other.bucket/cert.pem", /path/],
]) {
  test("rejects certificate URL " + url, async () => {
    const { raw, headers } = signed(h.launchRequest(), { certUrl: url });
    const { verify, fetched } = verifier();
    await rejects(verify(headers, raw), pattern);
    assert.equal(fetched.length, 0);
  });
}

test("accepts certificate URL variants Amazon allows", async () => {
  const url = "https://S3.AMAZONAWS.COM:443/echo.api/../echo.api/cert.pem";
  const { raw, headers } = signed(h.launchRequest(), { certUrl: url });
  await verifier().verify(headers, raw);
});

test("accepts a trust anchor part-way up the chain", async () => {
  const { raw, headers } = signed(h.launchRequest());
  await verifier("extra-cert-chain.pem").verify(headers, raw);
});

test("rejects a certificate for the wrong host", async () => {
  const { raw, headers } = signed(h.launchRequest());
  await rejects(verifier("wronghost-chain.pem").verify(headers, raw), /echo-api/);
});

test("rejects a chain from an untrusted CA", async () => {
  const { raw, headers } = signed(h.launchRequest());
  await rejects(verifier("rogue-chain.pem").verify(headers, raw), /trusted root/);
});

test("rejects an expired certificate", async () => {
  const future = new Date("2127-01-01T00:00:00Z");
  const body = h.launchRequest();
  body.request.timestamp = future.toISOString();
  const { raw, headers } = signed(body);
  await rejects(
    verifier("chain.pem", { clock: () => future }).verify(headers, raw),
    /out of date/
  );
});
