# alexa-cats

A self-hosted Alexa skill that tells you where your cats are, using a
[Sure Petcare microchip pet door connect](https://www.surepetcare.com/en-gb/pet-doors/microchip-pet-door-connect)
(SureFlap). It can also lock and unlock the flaps and set curfews.

> "Alexa, ask cat flap where the cats are."
> "Garfield is inside. Felix is outside."

[![Alexa Cat Flap Demo](https://img.youtube.com/vi/2CwArWuvpXA/0.jpg)](https://www.youtube.com/watch?v=2CwArWuvpXA)

**Not technical?** [DEPLOY.md](DEPLOY.md) walks through setting it up on a
Windows PC or Mac step by step, with a guided setup that does the
configuration for you. The rest of this README assumes you know Docker.

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

Every request reads live data from the SureFlap API.

## How it works

```
Alexa cloud --HTTPS--> reverse proxy --> server.js (Express, port 8080)
                                            | verifies the request came from Alexa
                                            v
                                        apps/catflap (alexa-app) --> app.api.surehub.io
```

- [server.js](server.js): HTTP server. Verifies Alexa's request signature,
  checks the skill ID, and hands the request to the skill.
- [apps/catflap/skill.js](apps/catflap/skill.js): the intents.
- [apps/catflap/sureflap.js](apps/catflap/sureflap.js): SureFlap API client.
- [apps/catflap/interaction_model.json](apps/catflap/interaction_model.json): an
  example interaction model. Build your own with `npm run model` (see below).

## Setup

### 1. Configure

```sh
git clone https://github.com/hdurdle/alexa-cats.git && cd alexa-cats
cp apps/catflap/config-dist.json config.json
```

Edit `config.json`. It holds your SureFlap password, so keep it private (it is
git-ignored).

Or let the setup wizard write it: it signs in to SureFlap, finds your
household, pets (with dates of birth) and flaps, and asks which pets to include
and what to call each flap's room. It runs in a tools container, so it needs
nothing but Docker:

```sh
docker compose run --rm setup scripts/setup.js            # first time
docker compose run --rm setup scripts/setup.js --refresh  # pick up new pets or flaps
```

It also asks for ngrok details for the optional tunnel (below); add
`--no-tunnel` to skip that.

| Key             | Purpose                                                                     |
| --------------- | --------------------------------------------------------------------------- |
| `email`         | SureFlap account email                                                      |
| `password`      | SureFlap account password. The skill logs in and refreshes its token itself |
| `token`         | Optional: a fixed SureFlap API token instead of email and password          |
| `household`     | SureFlap household ID                                                       |
| `applicationId` | Optional: your Alexa skill ID. Requests for any other skill are rejected    |
| `logLevel`      | `error`, `warn`, `info` (default) or `debug`                                |
| `flaps`         | Your pet doors (see below)                                                  |
| `catdobs`       | Your cats (see below)                                                       |

These environment variables override the file, if you'd rather keep secrets
out of it: `SUREFLAP_EMAIL`, `SUREFLAP_PASSWORD`, `SUREFLAP_TOKEN`,
`SUREFLAP_HOUSEHOLD`, `ALEXA_APPLICATION_ID`, `LOG_LEVEL`.

#### Flaps

Each pet door connects two places. A cat that last went _in_ through a flap is
in its `in` location, otherwise its `out` location.

```json
{ "id": 123456, "in": "conservatory", "out": "outside", "name": "conservatory" }
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

#### Cats

```json
{ "name": "Garfield", "dob": "2018-06-19", "synonyms": ["Garfy"] }
```

Only cats listed here are reported. `synonyms` are other names Alexa should
recognise. Add `"dod"` to retire a cat without deleting it.

Names are matched ignoring accents and case, and small slips are forgiven, so
"zoe" finds "Zoë". Occasionally Alexa won't recognise a particular name even
though it is listed: the cat-name slot arrives empty and the skill asks "Which
cat do you mean?" every time. If that happens, give the cat a nickname Alexa
does recognise in `synonyms`, then rebuild the model. Replies still use the
cat's real name.

### 2. Run it

With Docker Compose:

```sh
docker compose up -d --build
```

[docker-compose.yml](docker-compose.yml) mounts `./config.json` read-only into
a read-only container running as uid 1000, so the file must be readable by that
user (`chmod 644 config.json`). To update:
`git pull && docker compose up -d --build`.

Alexa needs an HTTPS endpoint with a trusted certificate, so put the container
behind a reverse proxy. Put host-specific settings in a
`docker-compose.override.yml` next to the compose file. Compose merges it
automatically, and it is git-ignored. For example, behind Traefik:

```yaml
services:
  alexa-cats:
    networks: [traefik]
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.alexa-cats.rule=Host(`alexa.example.com`)"
      - "traefik.http.routers.alexa-cats.entrypoints=websecure"
      - "traefik.http.routers.alexa-cats.tls.certresolver=default"
      - "traefik.http.services.alexa-cats.loadbalancer.server.port=8080"
networks:
  traefik:
    external: true
```

No reverse proxy? [docker-compose.tunnel.yml](docker-compose.tunnel.yml) adds
an [ngrok](https://ngrok.com/) container that gives the skill a public HTTPS
address on a free static ngrok domain, reading `NGROK_AUTHTOKEN` and
`NGROK_DOMAIN` from `.env`:

```sh
docker compose -f docker-compose.yml -f docker-compose.tunnel.yml up -d --build
```

Without Docker, use Node.js 22 or later: `npm ci --omit=dev && npm start`.

### 3. Create the Alexa skill

1. Build your interaction model from your config. This needs Node.js and
   `npm install`, and writes `apps/catflap/interaction_model.local.json`
   (git-ignored, because it lists your cats and rooms). It reads
   `apps/catflap/config.json`, so copy or link your config there first:
   ```sh
   npm run model
   ```
2. Create a custom skill in the
   [Alexa developer console](https://developer.amazon.com/alexa/console/ask)
   and paste that file into the JSON editor.
3. Set the endpoint to `https://<your host>/alexa/catflap`, choosing "My
   development endpoint has a certificate from a trusted certificate authority".
4. Put the skill ID in `applicationId` in `config.json`.

Run `npm run model` again whenever you add a cat or a place.

Or script all of it with the [ASK CLI](https://developer.amazon.com/en-US/docs/alexa/smapi/quick-start-alexa-skills-kit-command-line-interface.html),
run from the tools container (it signs you in to Amazon the first time and
keeps the sign-in in the git-ignored `.ask/` folder):

```sh
docker compose run --rm setup scripts/alexa-skill.js            # create or update
docker compose run --rm setup scripts/alexa-skill.js --dry-run  # show the calls
```

It creates the skill if `config.json` has no `applicationId` (otherwise it
updates only the endpoint), uploads the model built from your config, waits for
the build, enables it for testing on your account and saves the skill ID. The
endpoint comes from `NGROK_DOMAIN` in `.env`, or set `SKILL_ENDPOINT` (for
example `https://alexa.example.com`) to use your own host.

`setup.cmd`/`setup.command` and `update.cmd`/`update.command` run the wizard,
start the stack with the tunnel and create or update the skill in one go; they
are what DEPLOY.md uses.

## Development

```sh
npm install
npm test              # unit and request-level tests, no network needed
npm run lint
npm run format
```

To try requests by hand, turn off signature verification and enable the schema
page. Never do this on an endpoint Alexa can reach:

```sh
ALEXA_VERIFY=false ALEXA_DEBUG=true npm start
curl localhost:8080/alexa/catflap?schema
```

`CONFIG_PATH` points the server at a different config file.

## Security

- Every request is verified as coming from Alexa: the `Signature-256` header,
  the certificate chain up to a trusted root, and a timestamp within 150
  seconds. This uses Node's built-in crypto (see
  [verify.js](apps/catflap/verify.js)).
- Set `applicationId` so that only your skill can use the endpoint.
- `config.json` holds your SureFlap login. It is never baked into the image.

## License

[GPL-3.0](LICENSE)
