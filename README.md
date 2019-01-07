# alexa-cats
Node.js Web Service for Alexa Skill to say where cats are based on Sureflap data

The device in question: https://www.surepetcare.com/en-gb/pet-doors/microchip-pet-door-connect

This is the custom Web Service that acts as the endpoint for an Alexa Skill. 

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

leave the final `null` item (this makes sure it works when you've manually set pet's inside/outside state)
