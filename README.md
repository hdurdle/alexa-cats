# alexa-cats

A self-hosted Alexa skill that tells you where your cats are, using
[Sure Petcare](https://www.surepetcare.com/) Microchip Cat Flap Connect or Pet
Door Connect devices (SureFlap). It can also lock and unlock the flaps and set
curfews.

> "Alexa, ask cat flap where are the cats?"
> "Garfield is inside. Felix is outside."

[![Alexa Cat Flap Demo](https://img.youtube.com/vi/2CwArWuvpXA/0.jpg)](https://www.youtube.com/watch?v=2CwArWuvpXA)

**Not technical?** [DEPLOY.md](DEPLOY.md) walks through setting it up on a
Windows PC or Mac step by step, with double-click setup. This README is for
people comfortable with Docker, a shell and the Alexa developer tools.

## Quick start

You need Docker with Compose, a SureFlap account, and an
[Amazon developer account](https://developer.amazon.com/) on the same Amazon
account as your Echo. No AWS account or Lambda is involved: the skill is an
HTTPS endpoint you host.

```sh
git clone https://github.com/hdurdle/alexa-cats.git && cd alexa-cats

# 1. Write config.json (and .env for the tunnel) from your SureFlap account
docker compose run --rm setup scripts/setup.js

# 2a. Run it behind your own reverse proxy (see "Hosting" below)...
docker compose up -d --build
# 2b. ...or with the bundled ngrok tunnel on a free static domain
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up -d --build

# 3. Create the Alexa skill, upload the model and enable it for testing
docker compose run --rm setup scripts/alexa-skill.js
#    with your own proxy, pass the public base URL:
docker compose run --rm -e SKILL_ENDPOINT=https://alexa.example.com setup scripts/alexa-skill.js
```

Then say "Alexa, ask cat flap where are the cats".

- **Step 1** runs an interactive wizard in a tools container (`Dockerfile.tools`,
  Node and the ASK CLI). It signs in to SureFlap, reads your households, pets
  (with dates of birth) and flaps from `/api/me/start`, asks which pets to
  include, what each flap's room is called and for any nicknames, and writes
  `config.json`. It also asks for ngrok details for 2b; pass `--no-tunnel` to
  skip them.
- **Step 3** uses the [ASK CLI](https://developer.amazon.com/en-US/docs/alexa/smapi/quick-start-alexa-skills-kit-command-line-interface.html).
  The first run signs you in (`ask configure --no-browser`; answer **No** to
  linking an AWS account) and keeps the credentials in the git-ignored `.ask/`
  folder. It creates the skill if `config.json` has no `applicationId`,
  otherwise it updates only the endpoint. It uploads the interaction model
  built from your config, waits for the build, enables the skill for testing on
  your account and saves the skill ID to `config.json`. `--dry-run` prints the
  calls instead.

**Keeping it up to date:**

```sh
git pull
docker compose run --rm setup scripts/setup.js --refresh   # new pets or flaps
docker compose up -d --build                               # add -f files as above
docker compose run --rm setup scripts/alexa-skill.js       # rebuild the model
```

`--refresh` reuses your answers and only asks about pets or flaps it hasn't seen.
`setup.cmd`/`setup.command` and `update.cmd`/`update.command` run these steps in
one go with the tunnel; they are what DEPLOY.md uses.

## What you can ask

Start with "Alexa, ask cat flap…" or open the skill with "Alexa, open cat flap".

| Ask                                            | Does                                                  |
| ---------------------------------------------- | ----------------------------------------------------- |
| where are the cats                             | says who is inside and who is outside                 |
| where's Garfield / is Garfield out             | where one cat is, and for how long                    |
| who is out / who is in the house               | who is in a place                                     |
| who's been out the longest / the shortest      | the cat out (or in) longest or most recently          |
| how long has Garfield been out                 | how long one cat has been where it is                 |
| how old is Garfield                            | the cat's age, with birthday wishes on the day        |
| Garfield is inside                             | corrects a cat's position in the SureFlap app         |
| to keep Garfield in / to let Garfield out      | sets that cat's curfew on the curfew flaps            |
| who is locked in                               | which cats are kept in and which are allowed out      |
| to unlock / to keep in / to keep out / to lock | sets every flap's lock mode (asks first for out/lock) |
| is the cat flap locked                         | each flap's lock mode                                 |
| how are the batteries                          | names any flap with a low battery                     |

Every request reads live data from the SureFlap API. If a cat's name is missed,
the skill asks "Which cat do you mean?".

## How it works

```
Echo -> Alexa cloud --HTTPS--> reverse proxy or ngrok --> server.js (Express, :8080)
                                                            | verify signature + skill ID
                                                            v
                                                          apps/catflap (alexa-app) --> app.api.surehub.io
```

| File                                                                                   | Role                                                            |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| [server.js](server.js)                                                                 | HTTP server: request verification, skill ID check, `/healthz`   |
| [apps/catflap/skill.js](apps/catflap/skill.js)                                         | intents and slot types                                          |
| [apps/catflap/sureflap.js](apps/catflap/sureflap.js)                                   | SureFlap API client (login, token refresh on 401, timeouts)     |
| [apps/catflap/verify.js](apps/catflap/verify.js)                                       | Alexa request verification on Node's built-in crypto            |
| [apps/catflap/interaction-model.js](apps/catflap/interaction-model.js)                 | builds the interaction model from the code and your config      |
| [apps/catflap/defaults.js](apps/catflap/defaults.js)                                   | builds a config from your SureFlap account (used by the wizard) |
| [scripts/setup.js](scripts/setup.js), [scripts/alexa-skill.js](scripts/alexa-skill.js) | the setup wizard and the ASK CLI skill script                   |

## Configuration

The wizard writes `config.json` in the repo root, which is what Compose mounts.
To write it by hand instead, start from
[config-dist.json](apps/catflap/config-dist.json). It holds your SureFlap
password, so keep it private; it is git-ignored and never built into the
image.

| Key             | Purpose                                                                     |
| --------------- | --------------------------------------------------------------------------- |
| `email`         | SureFlap account email                                                      |
| `password`      | SureFlap account password. The skill logs in and refreshes its token itself |
| `token`         | Optional: a fixed SureFlap API token instead of email and password          |
| `household`     | SureFlap household ID                                                       |
| `applicationId` | Your Alexa skill ID. Requests for any other skill are rejected (403)        |
| `logLevel`      | `error`, `warn`, `info` (default) or `debug`                                |
| `flaps`         | Your pet doors (see below)                                                  |
| `catdobs`       | Your cats (see below)                                                       |
| `alexa`         | Skill name and locale, saved by `alexa-skill.js`                            |

### Flaps

Each pet door connects two places. A cat that last went _in_ through a flap is
in its `in` location, otherwise its `out` location.

```json
{
  "id": 123456,
  "in": "conservatory",
  "out": "outside",
  "name": "Garden Door",
  "curfew": true
}
```

| Key         | Purpose                                                         |
| ----------- | --------------------------------------------------------------- |
| `id`        | SureFlap device ID                                              |
| `in`, `out` | the places on each side; `in` places are also spoken "in the …" |
| `name`      | the flap's name                                                 |
| `curfew`    | `true` if "keep Garfield in" should change this flap            |
| `icon`      | optional Font Awesome class for the device                      |

Keep the `"id": 0` entry. SureFlap leaves out the device when a pet's position
is set by hand in the app, and this entry covers that case.

### Cats

```json
{ "name": "Garfield", "dob": "2018-06-19", "synonyms": ["Garfy"] }
```

Only cats listed here are reported. `dob` is optional (without it, Alexa says
it doesn't know the age). `synonyms` are nicknames Alexa should also recognise.
Add `"dod"` to retire a cat without deleting it.

Names are matched ignoring accents and case, and small slips are forgiven, so
"zoe" finds "Zoë". The cat-name slot extends Amazon's built-in
`AMAZON.FirstName` type, which recognises real first names that a custom slot
type sometimes won't. If Alexa still won't catch a name (the skill keeps asking
"Which cat do you mean?"), add a nickname and rebuild the model.

### Environment variables

| Variable                                                                      | Purpose                                                            |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `SUREFLAP_EMAIL`, `SUREFLAP_PASSWORD`, `SUREFLAP_TOKEN`, `SUREFLAP_HOUSEHOLD` | override the matching `config.json` keys                           |
| `ALEXA_APPLICATION_ID`                                                        | overrides `applicationId`                                          |
| `LOG_LEVEL`                                                                   | overrides `logLevel`                                               |
| `CONFIG_PATH`                                                                 | config file to load (default: next to the app, then the repo root) |
| `PORT`                                                                        | listen port (default 8080)                                         |
| `ALEXA_VERIFY=false`                                                          | turn off request verification, for local testing only              |
| `ALEXA_DEBUG=true`                                                            | serve the schema at `GET /alexa/catflap?schema`                    |
| `NGROK_AUTHTOKEN`, `NGROK_DOMAIN`                                             | read from `.env` by the tunnel compose file and `alexa-skill.js`   |
| `SKILL_ENDPOINT`                                                              | public base URL for `alexa-skill.js` when not using the tunnel     |

## Hosting

Alexa needs a public HTTPS endpoint, `https://<host>/alexa/catflap`, with a
trusted certificate. The container listens on 8080 and serves only that path
and `/healthz`.

The stack in [docker-compose.yml](docker-compose.yml) is hardened: read-only
root filesystem, all capabilities dropped, `no-new-privileges`, `init`, log
rotation, running as uid 1000. It mounts `./config.json` read-only, so the file
must be readable by uid 1000 (the wizard writes it `0644`).

**Your own reverse proxy:** put host-specific settings in a
`docker-compose.override.yml` next to the compose file. Compose merges it
automatically and it is git-ignored. For example, behind Traefik, exposing only
the skill's path:

```yaml
services:
  alexa-cats:
    networks: [traefik]
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.alexa-cats.rule=Host(`alexa.example.com`) && Path(`/alexa/catflap`)"
      - "traefik.http.routers.alexa-cats.entrypoints=websecure"
      - "traefik.http.routers.alexa-cats.tls.certresolver=default"
      - "traefik.http.services.alexa-cats.loadbalancer.server.port=8080"
networks:
  traefik:
    external: true
```

**No proxy:** [docker-compose.tunnel.yml](docker-compose.tunnel.yml) adds an
[ngrok](https://ngrok.com/) container on a free static domain
(`*.ngrok-free.app`), reading `NGROK_AUTHTOKEN` and `NGROK_DOMAIN` from `.env`.
`alexa-skill.js` sets the skill's certificate type to wildcard for these
domains. Alexa traffic, including cat names, passes through ngrok.

**Without Docker:** Node.js 22 or later, `npm ci --omit=dev && npm start`.

## Doing the Alexa side by hand

If you'd rather not use the ASK CLI:

1. `npm install && npm run model` writes
   `apps/catflap/interaction_model.local.json` from your config. It is
   git-ignored because it lists your cats and rooms.
2. Create a custom skill in the
   [Alexa developer console](https://developer.amazon.com/alexa/console/ask)
   and paste that file into **Build → Interaction Model → JSON Editor**, then
   **Save** and **Build**.
3. Set the endpoint to `https://<host>/alexa/catflap` with the matching
   certificate option (trusted certificate, or wildcard for ngrok domains).
4. Put the skill ID in `applicationId`.

Rebuild and re-upload the model whenever you add a cat, nickname or room.

## Development

```sh
npm install
npm test               # unit and request-level tests, no network
npm run lint
npm run format
npm run model:example  # after changing intents: regenerate the committed example model
```

To try requests by hand, turn off verification and enable the schema page.
Never do this on an endpoint Alexa can reach:

```sh
ALEXA_VERIFY=false ALEXA_DEBUG=true npm start
curl localhost:8080/alexa/catflap?schema
```

With the ASK CLI signed in, `ask smapi profile-nlu` shows how Alexa interprets
an utterance, and `ask smapi simulate-skill` runs one through your live skill.
CI runs lint, the format check, the tests and both Docker builds.

## Security

- Every request is verified as coming from Alexa: the `Signature-256` header,
  the certificate chain up to a trusted root, and a timestamp within 150
  seconds, using Node's built-in crypto ([verify.js](apps/catflap/verify.js)).
- Set `applicationId` so that only your skill can use the endpoint.
- `config.json` (SureFlap login), `.env` (ngrok token) and `.ask/` (Amazon
  developer credentials, which can manage every skill on your account) are
  git-ignored and kept out of the image. Keep them private.
- The skill uses SureFlap's unofficial API, the same one their app uses. It is
  not affiliated with Sure Petcare.

## License

[GPL-3.0](LICENSE)
