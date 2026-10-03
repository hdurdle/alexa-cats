// Verifies that a request really comes from Alexa, following Amazon's
// "Verify the request was sent by Alexa" checks for HTTPS endpoints:
//   - the SignatureCertChainUrl is https://s3.amazonaws.com/echo.api/...
//   - the certificate chain is in date, chains to a trusted root, and the
//     signing certificate is for echo-api.amazon.com
//   - the Signature-256 header is an RSA-SHA256 signature of the raw body
//   - the request timestamp is within 150 seconds
// Uses only Node's built-in crypto, so there are no third-party parsers.
const crypto = require("crypto");
const tls = require("tls");

const CERT_HOST = "s3.amazonaws.com";
const CERT_PATH_PREFIX = "/echo.api/";
const SIGNING_HOST = "echo-api.amazon.com";
const TIMESTAMP_TOLERANCE_MS = 150 * 1000;

class VerificationError extends Error {}

function fail(message) {
  throw new VerificationError(message);
}

// WHATWG URL parsing normalises the path, so /echo.api/../x is caught
function checkCertUrl(certUrl) {
  let url;
  try {
    url = new URL(certUrl);
  } catch {
    fail("invalid certificate URL");
  }
  if (url.protocol !== "https:") fail("certificate URL must be https");
  if (url.hostname !== CERT_HOST)
    fail("certificate URL host must be " + CERT_HOST);
  if (url.port && url.port !== "443") fail("certificate URL port must be 443");
  if (!url.pathname.startsWith(CERT_PATH_PREFIX)) {
    fail("certificate URL path must start with " + CERT_PATH_PREFIX);
  }
  return url.href;
}

function parseChain(pem) {
  const blocks = pem.match(
    /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g,
  );
  if (!blocks) fail("no certificates in chain");
  return blocks.map((block) => new crypto.X509Certificate(block));
}

function inDate(cert, now) {
  return new Date(cert.validFrom) <= now && now <= new Date(cert.validTo);
}

function issuedBy(cert, issuer) {
  return cert.checkIssued(issuer) && cert.verify(issuer.publicKey);
}

// Walks up from the signing certificate until it reaches one that is, or was
// issued by, a trusted root. Amazon's chain includes cross-signed
// certificates above its root, so the anchor can be part-way up the chain.
function checkChain(chain, roots, now) {
  if (!chain[0].checkHost(SIGNING_HOST)) {
    fail("certificate is not for " + SIGNING_HOST);
  }

  const anchoredBy = (cert) =>
    roots.some(
      (root) =>
        root.fingerprint256 === cert.fingerprint256 || issuedBy(cert, root),
    );

  for (let i = 0; i < chain.length; i++) {
    const cert = chain[i];
    if (!inDate(cert, now)) fail("certificate in chain is out of date");
    if (anchoredBy(cert)) return;

    const issuer = chain[i + 1];
    if (!issuer) break;
    if (!issuer.ca) fail("certificate issuer is not a CA");
    if (!issuedBy(cert, issuer)) fail("certificate chain is broken");
  }
  fail("certificate chain does not lead to a trusted root");
}

function checkTimestamp(body, now) {
  const timestamp = body && body.request && Date.parse(body.request.timestamp);
  if (!timestamp) fail("request timestamp missing");
  if (Math.abs(now - timestamp) > TIMESTAMP_TOLERANCE_MS) {
    fail("request timestamp is more than 150 seconds out");
  }
}

async function downloadCert(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) fail("could not download certificate: " + res.status);
  return res.text();
}

function defaultRoots() {
  return tls.rootCertificates.map((pem) => new crypto.X509Certificate(pem));
}

// Returns verify(headers, rawBody) which resolves to the parsed body, or
// rejects with a VerificationError. Certificates are cached per URL until
// they expire.
function createVerifier({
  roots = defaultRoots(),
  fetchCert = downloadCert,
  clock = () => new Date(),
} = {}) {
  const cache = new Map();

  async function getChain(url, now) {
    const cached = cache.get(url);
    if (cached && cached.expires > now) return cached.chain;

    const chain = parseChain(await fetchCert(url));
    checkChain(chain, roots, now);
    cache.set(url, { chain, expires: new Date(chain[0].validTo) });
    return chain;
  }

  return async function verify(headers, rawBody) {
    const now = clock();
    const certUrl = headers["signaturecertchainurl"];
    const signature = headers["signature-256"];
    if (!certUrl) fail("missing SignatureCertChainUrl header");
    if (!signature) fail("missing Signature-256 header");
    if (!rawBody || rawBody.length === 0) fail("missing request body");

    let body;
    try {
      body = JSON.parse(rawBody.toString("utf8"));
    } catch {
      fail("request body is not JSON");
    }
    checkTimestamp(body, now);

    const chain = await getChain(checkCertUrl(certUrl), now);
    const valid = crypto.verify(
      "RSA-SHA256",
      rawBody,
      chain[0].publicKey,
      Buffer.from(signature, "base64"),
    );
    if (!valid) fail("invalid signature");

    return body;
  };
}

// Express middleware: reads the raw body, verifies it and sets req.body.
function verifierMiddleware(verify, logger) {
  return async function (req, res, next) {
    try {
      req.body = await verify(req.headers, req.body);
      next();
    } catch (error) {
      if (!(error instanceof VerificationError)) return next(error);
      logger.warn("Rejected unverified request: " + error.message);
      res.status(400).json({ status: "failure", reason: error.message });
    }
  };
}

module.exports = { createVerifier, verifierMiddleware, VerificationError };
