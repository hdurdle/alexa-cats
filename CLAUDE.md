# CLAUDE.md

Development notes for this repo. See [README.md](README.md) for what the skill does and how to set it up.

## Public repo: keep private data out

This repo is public on GitHub.

- Never commit `apps/catflap/config.json`, SureFlap tokens, household IDs or real device IDs.
  `config.json` is in `.gitignore`. Keep placeholder values in `config-dist.json`.
- Don't add home addresses, network details, hostnames or personal email addresses to source,
  docs or commit messages.
- Commit as the repo owner using the GitHub noreply address
  (`hdurdle@users.noreply.github.com`), not a work address.

## Layout

- `server.js`: boots `alexa-app-server` on port 8080. It loads each folder in `apps/` and serves it at `/alexa/<name>`.
- `public_html/`: static placeholder page.
- `apps/catflap/index.js`: the whole skill. It's a single `alexa-app` module.
- `apps/catflap/interaction_model.json`: Alexa console interaction model, maintained by hand. Keep it in sync with the intents and utterances in `index.js`.
- `apps/catflap/healthcheck.js`: standalone HTTP check. It isn't used by the Dockerfile, which curls `/alexa/catflap?schema` instead.
- There are two `package.json` files. The root one only pulls in `alexa-app-server`. The skill's dependencies live in `apps/catflap/package.json`, and so does `alexa.applicationId`.

## Request flow

1. `alexaApp.pre` runs on every request. It calls the SureFlap API twice (`/household/{id}/pet` and `/device?with=status`) and rebuilds module-level state:
   - `locatedCatsData`: one entry per cat, with location derived from `position.where` (1 = in, 2 = out) and the last flap used, mapped through `config.flaps`.
   - `flapsData`: battery voltage and charge bucket for each device.
2. The intent handler builds speech from that state.
3. `alexaApp.post` turns any exception into "Aw. Badness."

Writes go through `httpPost` (raw `https.request`):
- `SetLocationOfCatIntent`: `POST /api/pet/{id}/position`
- `SetCatPermissionIntent`: `PUT /api/device/{flap}/tag/{tag}` with `profile` 2 (out) or 3 (kept in), for each flap with `curfew: true`

## Running

```sh
npm install && (cd apps/catflap && npm install)
npm start            # http://localhost:8080/alexa/catflap shows the schema
```

You need a valid `apps/catflap/config.json`, because `index.js` requires it at load time. `module.change_code = 1` lets alexa-app-server hot-reload the app.

To exercise an intent without Alexa, POST an Alexa request JSON body to `http://localhost:8080/alexa/catflap`. Signature verification is off, so no signing is needed.

There are no tests, linter or CI. Dependabot raises dependency PRs.

## Known quirks and debt

Check these before changing behaviour:

- Values specific to one household are hardcoded in `index.js`:
  - device IDs `11111` and `22222` are skipped as hubs
  - flap names are mapped to Font Awesome icons
  - `insideLocations`
  - the battery check says "all okay" only when `okayFlaps.length === 3`

  Moving these into config would be a good cleanup.
- `sureflapDeviceData` (lowercase f) is assigned without declaration. The declared `sureFlapDeviceData` is never used. `flapId` in `SetCatPermissionIntent` is an implicit global too.
- `SetCatPermissionIntent` fires requests in `forEach(async …)` without awaiting them. It replies before the writes finish, and failures are unhandled.
- `SetCatPermissionIntent` is registered in code but missing from `interaction_model.json`.
- `getLocation` throws if a pet's `device_id` isn't in `config.flaps`.
- Cats not listed in `config.catdobs` are silently left out of every answer.
- `request` and `request-promise` are deprecated. The Docker base image is `node:10-alpine`, which is end of life.
- The Dockerfile downloads `master` from GitHub instead of using the build context. Local edits aren't in an image until they're pushed.
