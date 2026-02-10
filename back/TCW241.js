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
}

module.exports = TCW241;
