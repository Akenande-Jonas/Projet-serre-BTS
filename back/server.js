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

// --- [IMPORT] Ta classe Poseidon ---
const IOPoseidon = require('./IOPoseidon');

dotenv.config();
const TCW241 = require('./TCW241.js');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;
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
// 🔐 JWT Middleware
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
// 🔐 Routes LOGIN / INSCRIPTION
// ========================================

app.post('/api/login', (req, res) => {
  const { login, password } = req.body;
  if (!login || !password) {
    return res.status(400).json({ success: false, message: 'Login et mot de passe requis' });
  }

  const query = 'SELECT * FROM Utilisateur WHERE login = ?';
  db.query(query, [login], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
    if (results.length === 0) return res.status(401).json({ success: false, message: 'Utilisateur inexistant' });

    const user = results[0];
    bcrypt.compare(password, user.mdp, (err, isMatch) => {
      if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
      if (!isMatch) return res.status(401).json({ success: false, message: 'Mot de passe incorrect' });

      const jti = uuidv4();
      const payload = { sub: user.Id || user.id || user.ID, login: user.Login, jti };
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '4h' });

      return res.json({ success: true, message: 'Connexion réussie', token });
    });
  });
});

app.post('/api/inscription', (req, res) => {
  const { prenom, nom, email, username, password } = req.body;
  if (!prenom || !nom || !email || !username || !password) {
    return res.status(400).json({ success: false, message: 'Tous les champs sont requis' });
  }

  const checkQuery = 'SELECT * FROM Utilisateur WHERE Login = ? OR Mail = ?';
  db.query(checkQuery, [username, email], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
    if (results.length > 0) return res.status(409).json({ success: false, message: 'Utilisateur ou email déjà utilisé' });

    bcrypt.hash(password, 10, (err, hashedPassword) => {
      if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });

      const insertQuery = 'INSERT INTO Utilisateur (nom, prenom, mail, login, mdp) VALUES (?, ?, ?, ?, ?)';
      db.query(insertQuery, [nom, prenom, email, username, hashedPassword], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });

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
// 🌊 GESTION POSEIDON (ETUDIANT 2)
// ========================================

const poseidon = new IOPoseidon('172.29.19.39'); // IP Simulateur
let besoinEauSimule = false;

// Supervision automatique en arrière-plan
async function startWaterSupervision() {
  try {
    await poseidon.connect();
    
    // Boucle infinie toutes les 2 secondes
    setInterval(async () => {
      // 1. Lire les capteurs
      await poseidon.updateAll();
      
      // 2. Exécuter les algorithmes
      await poseidon.gererChoixReseau();
      await poseidon.gererPompe(besoinEauSimule);
      
    }, 2000);
    
    console.log("💧 Supervision Poseidon démarrée");
  } catch (err) {
    console.error("Erreur Supervision Poseidon:", err.message);
  }
}
startWaterSupervision(); // Lancement au démarrage


// ========================================
// 🌡️ GESTION TCW241 (ETUDIANT 1)
// ========================================

async function getAllData() {
async function getTCWData() {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    const client = new Modbus.client.TCP(socket);

    // Utilisation des variables d'env pour le TCW
    socket.connect({ host: process.env.serverIP, port: process.env.portMod });

    socket.on('connect', async () => {
      try {
        const tcw = new TCW241();
        const data = await tcw.getAll(client);

        socket.end();
        resolve(data);
        // Lecture des données
        const temp = await tcw.getTemp(client);
        const h1 = await tcw.getH1(client);
        const h2 = await tcw.getH2(client);
        const h3 = await tcw.getH3(client);

        tcw.setTemperature(temp);
        tcw.setHumidites(h1, h2, h3);

        socket.end();
        resolve(tcw.toJSON()); // Retourne { temperature: X, humiditeSol: Y ... }

      } catch (err) {
        socket.end();
        resolve({ temperature: null, humiditeSol: null }); // Retourne null si erreur
      }
    });

    socket.on('error', (err) => {
        resolve({ temperature: null, humiditeSol: null }); // Pas de crash si TCW éteint
    });
  });
}
// ========================================
// 🌍 EXPRESS STATIC
// ========================================

// Assure-toi que le chemin est bon par rapport à l'emplacement de server.js
app.use(express.static(path.join(__dirname, '../front'))); 

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../front', 'index.html'));
});

// ========================================
// 🚀 ROUTE API UNIFIÉE
// ========================================

app.get('/api/info', authMiddleware, async (req, res) => {
  try {
    const data = await getAllData();
    res.json({ success: true, ...data });
    // 1. Récupérer les données TCW (Etudiant 1)
    const tcwData = await getTCWData();

    // 2. Récupérer les données Poseidon (Etudiant 2 - depuis le cache mémoire)
    const waterData = {
        consoEau: poseidon.getConsommationLitres(),
        cuvePleine: poseidon.isCuvePleine(),
        tempExt: poseidon.getTemperature(),
        reseauPluie: (poseidon.getTemperature() >= 1 && poseidon.isCuvePleine())
    };

    // 3. Fusionner et envoyer le tout
    res.json({ 
        success: true, 
        ...tcwData, 
        ...waterData 
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

async function readTCW241() {
    return new Promise((resolve, reject) => {
        const socket = new net.Socket();
        const client = new Modbus.client.TCP(socket);

        socket.connect({ host: process.env.serverIP, port: process.env.portMod });

        socket.on('connect', async () => {
            try {
                const tcw = new TCW241();

                const temp = await tcw.getTemp(client);
                const h1 = await tcw.getH1(client);
                const h2 = await tcw.getH2(client);
                const h3 = await tcw.getH3(client);

                tcw.setTemperature(temp);
                tcw.setHumidites(h1, h2, h3);

                socket.end();
                resolve(tcw);

            } catch (err) {
                socket.end();
                reject(err);
            }
        });

        socket.on('error', reject);
    });
}

async function saveLoop() {
    try {
        const tcw = await readTCW241();

        const sql = `
            INSERT INTO capteurs (temperature, h1, h2, h3, humidite_moyenne, timestamp)
            VALUES (?, ?, ?, ?, ?, NOW())
        `;

        db.query(sql, [
            tcw.temperature,
            tcw.h1,
            tcw.h2,
            tcw.h3,
            tcw.humiditeMoyenne
        ]);

    } catch (err) {
        console.error("Erreur boucle BDD :", err.message);
    }
}

setInterval(saveLoop, 10000);


// ========================================
// START SERVER
// ========================================

app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
});