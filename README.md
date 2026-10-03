# alexa-cats

A self-hosted Alexa Skill backend that tells you where your cats are, using data from a
[Sure Petcare microchip pet door connect](https://www.surepetcare.com/en-gb/pet-doors/microchip-pet-door-connect)
(SureFlap).

> "Alexa, ask cat flap where Ezio is."
> "Ezio has been outside for 3 hours."

[![Alexa Cat Flap Demo](https://img.youtube.com/vi/2CwArWuvpXA/0.jpg)](https://www.youtube.com/watch?v=2CwArWuvpXA)

## What it can do

| Ask | Intent |
| --- | --- |
| "where's {cat}" / "is {cat} outside" | `GetLocationOfCatIntent` |
| "who is in the {location}" / "who is out" | `GetCatsInLocationIntent` |
| "how long has {cat} been out" | `GetCatInLocationDurationIntent` |
| "who's been out the longest" | `GetLongestDurationIntent` |
| "{cat} is inside" (sets the pet's position) | `SetLocationOfCatIntent` |
| "to keep {cat} in" / "to let {cat} out" | `SetCatPermissionIntent` |
| "how old is {cat}" | `GetAgeOfCatIntent` |
| "how are the batteries" | `GetDeviceStatusIntent` |

Each request fetches current pet positions and device status from the SureFlap API, so answers
are always live.

## How it works

```
Alexa cloud ──HTTPS──▶ reverse proxy ──▶ server.js (alexa-app-server :8080)
                                              │
                                              └─ apps/catflap (alexa-app) ──▶ app.api.surehub.io
```

- [server.js](server.js) starts [alexa-app-server](https://github.com/alexa-js/alexa-app-server),
  which loads every module under [apps/](apps/) and serves it at `/alexa/<app>`.
- [apps/catflap/index.js](apps/catflap/index.js) is the skill itself.
- [apps/catflap/interaction_model.json](apps/catflap/interaction_model.json) is the interaction
  model to paste into the Alexa developer console. Edit the `PetName` and `PetLocation` slot
  values to match your own cats and rooms.

## Setup

### 1. Configure

```sh
cp apps/catflap/config-dist.json apps/catflap/config.json
```

Then edit `config.json` (it is git-ignored):

| Key | Purpose |
| --- | --- |
| `token` | SureFlap API bearer token |
| `household` | SureFlap household ID |
| `applicationId` | Alexa skill ID (optional) |
| `logLevel` | winston log level (overridden by `LOG_LEVEL` env var) |
| `flaps` | Topology of your pet doors (see below) |
| `catdobs` | `{ "name", "dob" }` for each cat. Only cats listed here are reported. Add `"dod"` to retire a cat. |

#### Flap topology

Each pet door connects two places. When a cat last went *in* through a flap they're in the
`in` location, otherwise the `out` location.

```json
{ "id": 123456, "in": "conservatory", "out": "outside", "name": "conservatory" }
```

Keep the `"id": 0` entry. SureFlap omits `device_id` when a pet's position is set manually in the
app, and this entry covers that case.

Optional flap keys:

- `"curfew": true` lets `SetCatPermissionIntent` change who's allowed out through that flap.
- `"icon"` sets a Font Awesome class for the device (default `fa-home`).

Each `in` location other than `inside` is spoken as "in the …", e.g. "in the house".

### 2. Run locally

Requires Node.js.

```sh
npm install
(cd apps/catflap && npm install)
npm start
```

Open `http://localhost:8080/alexa/catflap` to see the generated intents, slots and utterances.

### 3. Run with Docker

The [Dockerfile](Dockerfile) downloads the `master` branch from GitHub rather than copying the
local working tree, so push changes before building. Mount your config into the container:

```yaml
services:
  alexa-cats:
    build: .
    container_name: alexa-cats
    ports:
      - 4040:8080
    volumes:
      - /etc/localtime:/etc/localtime:ro
      - /path/to/config.json:/app/apps/catflap/config.json:ro
```

### 4. Create the Alexa Skill

1. Create a custom skill in the [Alexa developer console](https://developer.amazon.com/alexa/console/ask).
2. Paste [interaction_model.json](apps/catflap/interaction_model.json) into the JSON editor, adjusted
   for your cats and locations.
3. Set the endpoint to an HTTPS URL that reaches `/alexa/catflap` on this server.
4. Optionally put the skill ID in `applicationId` in `config.json`.

## Security notes

- Alexa request signature verification is off (`verify: false` in `server.js`). Anyone who can
  reach the endpoint can call it, including the intents that change pet position and curfew.
  Put it behind a reverse proxy, and turn verification on if you expose it to the internet.
- Never commit `config.json`. It holds your SureFlap token.

## Ideas

- Lock or unlock some or all flaps
- Read the curfew schedule back

## License

[GPL-3.0](apps/catflap/LICENSE)
