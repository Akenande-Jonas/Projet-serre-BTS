// server.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const mysql = require('mysql');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const Modbus = require('jsmodbus');
const net = require('net');
const bodyParser = require('body-parser');
dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


const PORT = process.env.PORT;
const JWT_SECRET = process.env.CODE;

// ========================================
// 🔌 Connexion MySQL
// ========================================

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

// ========================================
// 🔐 JWT
// ========================================

function extractToken(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}

const revokedTokens = new Set();
function revokeToken(jti) { revokedTokens.add(jti); }
function isRevoked(jti) { return revokedTokens.has(jti); }

function authMiddleware(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ success: false, message: 'Token manquant' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (isRevoked(payload.jti)) {
      return res.status(401).json({ success: false, message: 'Token révoqué' });
    }
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Token invalide ou expiré' });
  }
}

// ========================================
// 🔐 Route LOGIN
// ========================================

app.post('/api/login', (req, res) => {
  const { login, password } = req.body;
  if (!login || !password) {
    return res.status(400).json({ success: false, message: 'Login et mot de passe requis' });
  }

  const query = 'SELECT * FROM Utilisateur WHERE login = ?';
  db.query(query, [login], (err, results) => {
    if (err) {
      console.error('Erreur lors de la requête MySQL :', err.message);
      return res.status(500).json({ success: false, message: 'Erreur serveur' });
    }

    if (results.length === 0) {
      return res.status(401).json({ success: false, message: 'Nom d\'utilisateur inexistant' });
    }

    const user = results[0];
    bcrypt.compare(password, user.mdp, (err, isMatch) => {
      if (err) {
        console.error('Erreur lors de la comparaison des mots de passe :', err.message);
        return res.status(500).json({ success: false, message: 'Erreur serveur' });
      }

      if (!isMatch) {
        return res.status(401).json({ success: false, message: 'Nom d\'utilisateur ou mot de passe incorrect' });
      }

      const jti = uuidv4();
      const payload = { sub: user.Id || user.id || user.ID, login: user.Login, jti };
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '4h' });

      return res.json({ success: true, message: 'Connexion réussie', token });
    });
  });
});

// Route d'inscription
app.post('/api/inscription', (req, res) => {
  const { prenom, nom, email, username, password } = req.body;
  if (!prenom || !nom || !email || !username || !password) {
    return res.status(400).json({ success: false, message: 'Tous les champs sont requis' });
  }

  const checkQuery = 'SELECT * FROM Utilisateur WHERE Login = ? OR Mail = ?';
  db.query(checkQuery, [username, email], (err, results) => {
    if (err) {
      console.error('Erreur lors de la requête MySQL :', err.message);
      return res.status(500).json({ success: false, message: 'Erreur serveur' });
    }

    if (results.length > 0) {
      return res.status(409).json({ success: false, message: 'Nom d\'utilisateur ou email déjà utilisé' });
    }

    bcrypt.hash(password, 10, (err, hashedPassword) => {
      if (err) {
        console.error('Erreur lors du hachage du mot de passe :', err.message);
        return res.status(500).json({ success: false, message: 'Erreur serveur' });
      }

      const insertQuery = 'INSERT INTO Utilisateur (nom, prenom, mail, login, mdp) VALUES (?, ?, ?, ?, ?)';
      db.query(insertQuery, [nom, prenom, email, username, hashedPassword], (err, results) => {
        if (err) {
          console.error('Erreur lors de l\'insertion dans la base de données :', err.message);
          return res.status(500).json({ success: false, message: 'Erreur serveur' });
        }

        // Récupérer l'ID inséré si besoin
        const userId = results.insertId;
        const jti = uuidv4();
        const payload = { sub: userId, login: username, jti };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '4h' });

        return res.json({ success: true, message: 'Inscription réussie', token });
      });
    });
  });
});



// ========================================
// 🌡️ Lecture Modbus : température
// ========================================

function get() {
  return new Promise((resolve, reject) => {
    const serverIP = process.env.serverIP;
    const portMod = process.env.portMod;

    const socket = new net.Socket();
    const client = new Modbus.client.TCP(socket);

    socket.connect({ host: serverIP, port: portMod });

    socket.on('connect', async () => {
      try {
        // === Température 1‑Wire ===
        const tempReg = await client.readHoldingRegisters(19800, 2);
        const bufTemp = Buffer.alloc(4);
        bufTemp.writeUInt16BE(tempReg.response._body.valuesAsArray[0], 0);
        bufTemp.writeUInt16BE(tempReg.response._body.valuesAsArray[1], 2);
        const temperature = bufTemp.readFloatBE(0);

        // === Humidité AI1 ===
        const h1Reg = await client.readHoldingRegisters(17500, 2);
        const bufH1 = Buffer.alloc(4);
        bufH1.writeUInt16BE(h1Reg.response._body.valuesAsArray[0], 0);
        bufH1.writeUInt16BE(h1Reg.response._body.valuesAsArray[1], 2);
        const h1Volt = bufH1.readFloatBE(0);
        const h1 = (h1Volt / 5) * 100;

        // === Humidité AI2 ===
        const h2Reg = await client.readHoldingRegisters(17502, 2);
        const bufH2 = Buffer.alloc(4);
        bufH2.writeUInt16BE(h2Reg.response._body.valuesAsArray[0], 0);
        bufH2.writeUInt16BE(h2Reg.response._body.valuesAsArray[1], 2);
        const h2Volt = bufH2.readFloatBE(0);
        const h2 = (h2Volt / 5) * 100;

        // === Humidité AI3 ===
        const h3Reg = await client.readHoldingRegisters(17504, 2);
        const bufH3 = Buffer.alloc(4);
        bufH3.writeUInt16BE(h3Reg.response._body.valuesAsArray[0], 0);
        bufH3.writeUInt16BE(h3Reg.response._body.valuesAsArray[1], 2);
        const h3Volt = bufH3.readFloatBE(0);
        const h3 = (h3Volt / 5) * 100;

        socket.end();

        // === Moyenne humidité ===
        const humiditeSol = (h1 + h2 + h3) / 3;

        resolve({
          temperature,
          humiditeSol
        });

      } catch (err) {
        socket.end();
        reject(err);
      }
    });

    socket.on('error', reject);
  });
}

// ========================================
// 🌍 EXPRESS
// ========================================

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static('/var/www/html/Serre'));

// Page principale
app.get('/', (req, res) => {
  res.sendFile(path.join('/var/www/html/Serre/front', 'index.html'));
});

// ========================================
// 🌡️ Route API protégée
// ========================================

app.get('/api/info', authMiddleware, async (req, res) => {
  try {
    const data = await get();
    res.json({ success: true, ...data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========================================
// 🚀 START SERVER
// ========================================

app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});
