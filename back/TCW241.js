class TCW241 {
    constructor() {
        this.temperature = null;
        this.h1 = null;
        this.h2 = null;
        this.h3 = null;
        this.humiditeMoyenne = null;
        this.timestamp = new Date();
    }

    async getTemp(client) {
        const reg = await client.readHoldingRegisters(19800, 2);
        const buf = Buffer.alloc(4);
        buf.writeUInt16BE(reg.response._body.valuesAsArray[0], 0);
        buf.writeUInt16BE(reg.response._body.valuesAsArray[1], 2);
        return buf.readFloatBE(0);
    }

    async getH1(client) {
        const reg = await client.readHoldingRegisters(17500, 2);
        const buf = Buffer.alloc(4);
        buf.writeUInt16BE(reg.response._body.valuesAsArray[0], 0);
        buf.writeUInt16BE(reg.response._body.valuesAsArray[1], 2);
        const volts = buf.readFloatBE(0);
        return (volts / 5) * 100;
    }

    async getH2(client) {
        const reg = await client.readHoldingRegisters(17502, 2);
        const buf = Buffer.alloc(4);
        buf.writeUInt16BE(reg.response._body.valuesAsArray[0], 0);
        buf.writeUInt16BE(reg.response._body.valuesAsArray[1], 2);
        const volts = buf.readFloatBE(0);
        return (volts / 5) * 100;
    }

    async getH3(client) {
        const reg = await client.readHoldingRegisters(17504, 2);
        const buf = Buffer.alloc(4);
        buf.writeUInt16BE(reg.response._body.valuesAsArray[0], 0);
        buf.writeUInt16BE(reg.response._body.valuesAsArray[1], 2);
        const volts = buf.readFloatBE(0);
        return (volts / 5) * 100;
    }

async setRelay1(client) {
  const s = await client.readCoils(100, 1);
  await client.writeSingleCoil(100, !s.response._body.valuesAsArray[0]);
}

async setRelay2(client) {
  const s = await client.readCoils(101, 1);
  await client.writeSingleCoil(101, !s.response._body.valuesAsArray[0]);
}

async setRelay3(client) {
  const s = await client.readCoils(102, 1);
  await client.writeSingleCoil(102, !s.response._body.valuesAsArray[0]);
}

async setRelay4(client) {
  const s = await client.readCoils(103, 1);
  await client.writeSingleCoil(103, !s.response._body.valuesAsArray[0]);
}


    async getRelaysState(client) {
    const r1 = await client.readCoils(100, 1);
    const r2 = await client.readCoils(101, 1);
    const r3 = await client.readCoils(102, 1);
    const r4 = await client.readCoils(103, 1);

    return {
        relay1: r1.response._body.valuesAsArray[0],
        relay2: r2.response._body.valuesAsArray[0],
        relay3: r3.response._body.valuesAsArray[0],
        relay4: r4.response._body.valuesAsArray[0]
    };
}


    async getAll(client) {
    const temperature = await this.getTemp(client);
    const h1 = await this.getH1(client);
    const h2 = await this.getH2(client);
    const h3 = await this.getH3(client);
    const relays = await this.getRelaysState(client);

    this.setTemperature(temperature);
    this.setHumidites(h1, h2, h3);

    return {
        temperature: this.temperature,
        h1: this.h1,
        h2: this.h2,
        h3: this.h3,
        humiditeSol: this.humiditeMoyenne,
        relays,
        timestamp: this.timestamp
    };
}

    setTemperature(value) {
        this.temperature = value;
        this.timestamp = new Date();
    }

    setHumidites(h1, h2, h3) {
        this.h1 = h1;
        this.h2 = h2;
        this.h3 = h3;
        this.humiditeMoyenne = (h1 + h2 + h3) / 3;
        this.timestamp = new Date();
    }

    toJSON() {
        return {
            temperature: this.temperature,
            h1: this.h1,
            h2: this.h2,
            h3: this.h3,
            humiditeSol: this.humiditeMoyenne,
            timestamp: this.timestamp
        };
    }
async regulate(client, consigne) {
    const temp = this.temperature;
    const hum = this.humiditeMoyenne;

    const relays = await this.getRelaysState(client);

    console.log("Régulation :", { temp, hum, consigne });

    // ============================
    // 🔥 RÉGULATION TEMPÉRATURE
    // ============================
    if (consigne.temperature !== null && temp !== null) {

        // Trop froid → activer CHAUFFAGE (relay3)
        if (temp < consigne.temperature - 0.5) {
            await client.writeSingleCoil(102, false); // Fenêtre fermée
            await client.writeSingleCoil(103, true);  // Chauffage ON
        }

        // Trop chaud → ouvrir FENÊTRE (relay4)
        if (temp > consigne.temperature + 0.5) {
            await client.writeSingleCoil(103, false); // Chauffage OFF
            await client.writeSingleCoil(102, true);  // Fenêtre ouverte
        }

        // Température OK → tout OFF
        if (temp >= consigne.temperature - 0.2 && temp <= consigne.temperature + 0.2) {
            await client.writeSingleCoil(103, false); // Chauffage OFF
            await client.writeSingleCoil(102, false); // Fenêtre fermée
        }
    }

    // ============================
    // 💧 RÉGULATION HUMIDITÉ
    // ============================
    if (consigne.humidite !== null && hum !== null) {

        // Humidité trop basse → activer BRUMISATION (relay1)
        if (hum < consigne.humidite - 2) {
            await client.writeSingleCoil(100, true);
        }

        // Humidité trop haute → couper brumisation
        if (hum > consigne.humidite + 2) {
            await client.writeSingleCoil(100, false);
        }

        // Humidité OK → OFF
        if (hum >= consigne.humidite - 1 && hum <= consigne.humidite + 1) {
            await client.writeSingleCoil(100, false);
        }
    }

    return true;
}

}



module.exports = TCW241;
