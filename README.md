# alexa-cats
Node.js Web Service for Alexa Skill to say where cats are based on Sureflap data

The device in question: https://www.surepetcare.com/en-gb/pet-doors/microchip-pet-door-connect

This is the custom Web Service that acts as the endpoint for an Alexa Skill.

### Demo

[![Alexa Cat Flap Demo](https://img.youtube.com/vi/2CwArWuvpXA/0.jpg)](https://www.youtube.com/watch?v=2CwArWuvpXA)

### Getting Started
Create a `config.json` based on the `-dist` copy in the repo, and put your SureFlap token in it.

You'll also need to add your Sureflap household ID, and the topology of your catflaps.

By default it will expose a page on `http://localhost:8080/catflap` which will list the information you need to populate the Alexa Skill (intents, utterances, slots).

#### Cat Flap Topology

If you have multiple cat flaps, you can define the flaps, and where they lead (which rooms/zones they connect).

Edit `config.json` and add items to the flaps array for each pet flap you have.

Format is:

```javascript
  {
      "id": device_id,
      "in": "location-inbound",
      "out": "location-outbound",
      "name": "name-of-catflap"
  },
```

for example:

```javascript
  {
      "id": 123456,
      "in": "garden room",
      "out": "outside",
      "name": "garden room"
  },
```

leave the final `"id": 0` item. This makes sure it works when you've manually set pet's inside/outside state. (When you set state manually through the SureFlap app, the pet object has no device_id for last cat flap they used.)

### Docker

```Dockerfile
  alexa-cats:
    build:
      context: '/alexa-cats/'
    container_name: alexa-cats
    ports:
      - 4040:8080
    volumes:
      - /etc/localtime:/etc/localtime:ro
      - /path/to/alexa-cats/config.json:/app/config.json
```

#### TODO

* Some serious refactoring of duplicated code.
* Set curfew for cats ("Alexa, tell cat flap to keep Ezio in the house")
* Lock/unlock some/all flaps
