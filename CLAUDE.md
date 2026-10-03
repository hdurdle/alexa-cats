# CLAUDE.md

Development notes for this repo. See [README.md](README.md) for what the skill
does and how to set it up.

## Public repo: keep private data out

This repo is public on GitHub.

- Never commit `config.json`, `interaction_model.local.json`,
  `docker-compose.override.yml`, SureFlap credentials or tokens, household IDs,
  real device IDs, the Alexa skill ID, real cat or room names, hostnames,
  addresses or personal email addresses. Anything specific to one household
  belongs in config.
- Test fixtures use made-up names and IDs. `test/fixtures/pki` holds throwaway
  test certificates only.
- Commit as `Howard Durdle <hdurdle@users.noreply.github.com>`, not a work
  address.

## Layout

- `server.js`: Express server. `createServer()` wires request verification,
  the skill ID check and the skill; `main()` loads config and listens on 8080.
- `apps/catflap/skill.js`: `createApp({ config, client, logger })` builds the
  alexa-app skill. Intents, slot types and the location/cat matching helpers
  live here.
- `apps/catflap/model.js`: pure functions turning SureFlap payloads plus config
  into cats, devices and curfew permissions.
- `apps/catflap/speech.js`: pure speech formatting.
- `apps/catflap/sureflap.js`: SureFlap API client on built-in `fetch`, with
  login, token refresh on 401 and timeouts.
- `apps/catflap/verify.js`: Alexa request verification on Node's built-in
  crypto.
- `apps/catflap/config.js`: loads `config.json`, applies env overrides,
  validates.
- `apps/catflap/interaction-model.js` and `scripts/build-model.js`: generate the
  interaction model from the code.
- `apps/catflap/defaults.js`: pure functions that build a config from SureFlap's
  `GET /api/me/start` (households, devices, pets). Flaps are `product_id` 3
  (Pet Door Connect) and 6 (Cat Flap Connect); 1 is the hub. Pet
  `date_of_birth` is ISO with a time and offset, and may be missing.
- `scripts/setup.js`: interactive setup wizard (sign in, household, pets,
  rooms, nicknames, ngrok details). Writes `config.json` (0644, the skill
  container must read it) and `.env` (0600) to `OUTPUT_DIR`.
- `scripts/alexa-skill.js`: creates or updates the Alexa skill with the ASK
  CLI. Creating sends a minimal manifest; updating fetches the manifest and
  changes only the endpoint, so other locales survive.
- `Dockerfile.tools` and the `setup` compose service (profile `tools`): Node +
  ASK CLI for the two scripts, so non-technical users need only Docker. ASK
  sign-in lives in the git-ignored `.ask/` folder.
- `docker-compose.tunnel.yml`: optional ngrok container for a public HTTPS
  address (free static `*.ngrok-free.app` domain, wildcard certificate).
- `setup.cmd`/`setup.command`, `update.cmd`/`update.command`: double-click
  launchers used by `DEPLOY.md`. `.cmd` files must keep CRLF line endings
  (`.gitattributes`) and `.command` files their executable bit.
- `stubs/alexa-verifier-middleware`: replaces alexa-app's bundled verifier
  (unused, and it pulls in vulnerable dependencies) through npm `overrides`.

## Request flow

1. `server.js` verifies the signature (`verify.js`), checks `applicationId`,
   then calls `alexaApp.request(body)`.
2. `alexaApp.pre` fetches pets and devices in parallel, only for the skill's
   own intents, and puts `{ cats, devices }` on `request.ctx`. Handlers must
   read from `req.ctx`, never module state, so concurrent requests stay apart.
3. The handler builds speech. Exceptions go to `alexaApp.error`, which logs the
   stack and says "Aw. Badness."

SureFlap codes: position `where` 1 = in, 2 = out; tag `profile` 2 = allowed out,
3 = kept in; `locking` 0 = unlocked, 1 = keep in, 2 = keep out, 3 = both ways.

## Working on it

```sh
npm install
npm test             # node:test; no network
npm run lint && npm run format:check
```

- Add tests for any change. `test/helpers.js` builds Alexa requests and a stub
  SureFlap client that records writes; `app.request(json)` runs a request
  without HTTP.
- After changing intents, utterances or slot types, run `npm run model:example`
  and commit `apps/catflap/interaction_model.json`. A test fails if it is stale.
- To try it by hand: `ALEXA_VERIFY=false ALEXA_DEBUG=true npm start`, then POST
  request JSON to `/alexa/catflap`.
- CI (`.github/workflows/ci.yml`) runs lint, format check, tests and a Docker
  build. Dependabot updates npm, Docker and Actions weekly.

## Deployment

The Docker image builds from the checked-out code. On the host, the repo is
cloned, `config.json` sits in the repo root, and host-specific Traefik settings
live in the git-ignored `docker-compose.override.yml`. Update with
`git pull && docker compose up -d --build`.

`DEPLOY.md` is the step-by-step guide for non-technical users (Docker
Desktop on Windows or Mac, ngrok tunnel, launchers). Keep it free of jargon,
and keep the README for technical readers. To test the wizard without a real
account, run it with a preloaded fake `sureflap` module and answer prompts
from a script (piped input to readline loses lines).

## Known limitations

- alexa-app 4.2.3 is the last release and is unmaintained. It is only used for
  routing intents and building the schema, so it would be easy to replace.
- moment is in maintenance mode; it is only used for ages and "for 3 hours".
- Lock and curfew writes change real devices. Test them by hand after changes.
