// server.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const mysql = require('mysql');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const http = require('http');
const Modbus = require('jsmodbus');
const net = require('net');

dotenv.config();

const PORT = process.env.PORT;
const JWT_SECRET = process.env.CODE;

// ---------------- JWT ----------------

function extractToken(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}

const revokedTokens = new Set();
function revokeToken(jti) { if (jti) revokedTokens.add(jti); }
function isRevoked(jti) { return jti && revokedTokens.has(jti); }

function authMiddleware(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ success: false, message: 'Token manquant' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (isRevoked(payload.jti)) return res.status(401).json({ success: false, message: 'Token révoqué' });
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Token invalide ou expiré' });
  }
}

// ---------------- MODBUS : lecture température ----------------

function getTemp() {
  return new Promise((resolve, reject) => {
    const serverIP = process.env.serverIP;
    const portMod = process.env.portMod;

    const socket = new net.Socket();
    const client = new Modbus.client.TCP(socket);

    socket.connect({ host: serverIP, port: portMod });

    socket.on('connect', async () => {
      try {
        // Lecture float32 → registre 19800 (S11)
        const temp = await client.readHoldingRegisters(19800, 2);

        const buf = Buffer.alloc(4);
        buf.writeUInt16BE(temp.response._body.valuesAsArray[0], 0);
        buf.writeUInt16BE(temp.response._body.valuesAsArray[1], 2);

        const temperature = buf.readFloatBE(0);

        socket.end();
        resolve(temperature);

      } catch (err) {
        socket.end();
        reject(err);
      }
    });

    socket.on('error', reject);
  });
}

// ---------------- EXPRESS ----------------

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Fichiers statiques
app.use(express.static('/var/www/html/Serre'));

// ---------------- MySQL ----------------

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

db.connect(err => {
  if (err) {
    console.error('Erreur de connexion MySQL :', err.message);
  } else {
    console.log('Connecté à la base de données MySQL');
  }
});

// ---------------- ROUTES ----------------

app.get('/', (req, res) => {
  res.sendFile(path.join('/var/www/html/Serre/front', 'index.html'));
});

// 🌡️ Route API température
app.get('/api/temp', async (req, res) => {
  try {
    const temperature = await getTemp();
    res.json({
      success: true,
      temperature: temperature.toFixed(2)
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// ---------------- START SERVER ----------------

app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});
