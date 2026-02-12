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
const TCW241 = require('./TCW241.js');

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000; // Fallback port
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
    console.error('❌ Erreur de connexion MySQL :', err.message);
  } else {
    console.log('✅ Connecté à la base de données MySQL');
  }
});

// ========================================
// 🔐 MIDDLEWARES DE SÉCURITÉ
// ========================================

function extractToken(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}

const revokedTokens = new Set();
function revokeToken(jti) { revokedTokens.add(jti); }
function isRevoked(jti) { return revokedTokens.has(jti); }

// Middleware d'authentification standard
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

// Middleware Admin (Vérifie si le token contient le rôle admin)
function adminMiddleware(req, res, next) {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        return res.status(403).json({ success: false, message: 'Accès refusé : Administrateurs uniquement' });
    }
}

// Middleware Anti-Mute (Vérifie en temps réel dans la BDD si l'utilisateur est muet)
// C'est plus sûr que le token pour une action immédiate.
function checkNotMuted(req, res, next) {
    const userId = req.user.sub;
    const query = 'SELECT is_muted FROM Utilisateur WHERE id = ?';
    
    db.query(query, [userId], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'Erreur vérification droits' });
        if (results.length === 0) return res.status(404).json({ success: false, message: 'Utilisateur introuvable' });
        
        if (results[0].is_muted === 1) {
            return res.status(403).json({ success: false, message: '🔒 Vos actions sont restreintes (Muted)' });
        }
        next();
    });
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

    // VERIFICATION BANNISSEMENT
    if (user.is_banned === 1) {
        return res.status(403).json({ success: false, message: '🚫 Ce compte a été banni.' });
    }

    bcrypt.compare(password, user.mdp, (err, isMatch) => {
      if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
      if (!isMatch) return res.status(401).json({ success: false, message: 'Mot de passe incorrect' });

      const jti = uuidv4();
      // On inclut le rôle dans le token pour le front-end
      const payload = { 
          sub: user.Id || user.id || user.ID, 
          login: user.Login, 
          role: user.role, // 'admin' ou 'user'
          jti 
      };
      
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '4h' });

      return res.json({ success: true, message: 'Connexion réussie', token, role: user.role });
    });
  });
});

app.post('/api/inscription', (req, res) => {
  const { prenom, nom, email, username, password } = req.body;
  // Validation basique
  if (!prenom || !nom || !email || !username || !password) {
    return res.status(400).json({ success: false, message: 'Tous les champs sont requis' });
  }

  const checkQuery = 'SELECT * FROM Utilisateur WHERE Login = ? OR Mail = ?';
  db.query(checkQuery, [username, email], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });
    if (results.length > 0) return res.status(409).json({ success: false, message: 'Utilisateur ou email déjà utilisé' });

    bcrypt.hash(password, 10, (err, hashedPassword) => {
      if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });

      // Par défaut, un nouvel inscrit est 'user', non banni, non mute
      const insertQuery = 'INSERT INTO Utilisateur (nom, prenom, mail, login, mdp, role, is_banned, is_muted) VALUES (?, ?, ?, ?, ?, "user", 0, 0)';
      db.query(insertQuery, [nom, prenom, email, username, hashedPassword], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: 'Erreur serveur' });

        const userId = results.insertId;
        const jti = uuidv4();
        const payload = { sub: userId, login: username, role: 'user', jti };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '4h' });

        return res.json({ success: true, message: 'Inscription réussie', token, role: 'user' });
      });
    });
  });
});

// ========================================
// 🛡️ ROUTES ADMIN (NOUVEAU)
// ========================================

// 1. Lister tous les utilisateurs
app.get('/api/admin/users', authMiddleware, adminMiddleware, (req, res) => {
    const query = 'SELECT id, nom, prenom, mail, login, role, is_banned, is_muted FROM Utilisateur';
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        res.json({ success: true, users: results });
    });
});

// 2. Action Bannir/Débannir
app.post('/api/admin/ban', authMiddleware, adminMiddleware, (req, res) => {
    const { userId, status } = req.body; // status: 1 (ban) ou 0 (unban)
    const query = 'UPDATE Utilisateur SET is_banned = ? WHERE id = ?';
    db.query(query, [status, userId], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        res.json({ success: true, message: status ? 'Utilisateur banni' : 'Utilisateur débanni' });
    });
});

// 3. Action Mute/Unmute
app.post('/api/admin/mute', authMiddleware, adminMiddleware, (req, res) => {
    const { userId, status } = req.body; // status: 1 (mute) ou 0 (unmute)
    const query = 'UPDATE Utilisateur SET is_muted = ? WHERE id = ?';
    db.query(query, [status, userId], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        res.json({ success: true, message: status ? 'Utilisateur mis en sourdine' : 'Utilisateur rétabli' });
    });
});


// ========================================
// 🌊 GESTION POSEIDON
// ========================================
const poseidon = new IOPoseidon('172.29.19.39'); 
let besoinEauSimule = false;

async function startWaterSupervision() {
  try {
    await poseidon.connect();
    setInterval(async () => {
      await poseidon.updateAll();
      await poseidon.gererChoixReseau();
      await poseidon.gererPompe(besoinEauSimule);
    }, 2000);
    console.log("💧 Supervision Poseidon démarrée");
  } catch (err) {
    console.error("Erreur Supervision Poseidon:", err.message);
  }
}
startWaterSupervision();


// ========================================
// 🌡️ GESTION TCW241
// ========================================
async function getTCWData() {
  return new Promise((resolve) => {
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
        const relays = await tcw.getRelaysState(client);
        tcw.setTemperature(temp);
        tcw.setHumidites(h1, h2, h3);
        socket.end();
        resolve({
          temperature: tcw.temperature,
          h1: tcw.h1, h2: tcw.h2, h3: tcw.h3,
          humiditeSol: tcw.humiditeMoyenne,
          relays, timestamp: tcw.timestamp
        });
      } catch (err) {
        socket.end();
        resolve({ temperature: null, h1: null, h2: null, h3: null, humiditeSol: null, relays: null });
      }
    });
    socket.on('error', () => {
      resolve({ temperature: null, h1: null, h2: null, h3: null, humiditeSol: null, relays: null });
    });
  });
}

// ========================================
// 🌍 EXPRESS STATIC
// ========================================
app.use(express.static('/var/www/html/Serre'));

app.get('/', (req, res) => {
    res.sendFile(path.join('/var/www/html/Serre/front', 'index.html'));
});

// Route temporaire pour check token
app.get('/api/temp', authMiddleware, (req, res) => {
    res.sendStatus(200);
});

// ========================================
// 🚀 ROUTES API METIER
// ========================================

app.get('/api/historique-24h', authMiddleware, (req, res) => {
  try {
    const sql = `SELECT id, temperature, h1, h2, h3, humidite_moyenne, timestamp FROM capteurs WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 24 HOUR) ORDER BY timestamp ASC`;
    db.query(sql, (err, results) => {
      if (err) return res.status(500).json({ success: false, error: err.message });
      const historique = results.map(row => ({
        timestamp: new Date(row.timestamp).toLocaleTimeString('fr-FR'),
        temperature: parseFloat(row.temperature),
        h1: parseFloat(row.h1), h2: parseFloat(row.h2), h3: parseFloat(row.h3),
        humiditeMoyenne: parseFloat(row.humidite_moyenne)
      }));
      res.json({ success: true, data: historique, count: historique.length });
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/info', authMiddleware, async (req, res) => {
  try {
    const tcwData = await getTCWData();
    const waterData = {
        consoEau: poseidon.getConsommationLitres(),
        cuvePleine: poseidon.isCuvePleine(),
        tempExt: poseidon.getTemperature(),
        reseauPluie: (poseidon.getTemperature() >= 1 && poseidon.isCuvePleine())
    };
    res.json({ success: true, ...tcwData, ...waterData });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ACTION MATERIEL : Ajout de checkNotMuted pour sécuriser l'action
app.post('/api/relais/:numRelais', authMiddleware, checkNotMuted, async (req, res) => {
  const num = parseInt(req.params.numRelais, 10);
  if (![1, 2, 3, 4].includes(num)) {
    return res.status(400).json({ success: false, message: "Relais invalide (1 à 4)" });
  }

  const socket = new net.Socket();
  const client = new Modbus.client.TCP(socket);
  socket.connect({ host: process.env.serverIP, port: process.env.portMod });

  socket.on('connect', async () => {
    try {
      const tcw = new TCW241();
      if (num === 1) await tcw.setRelay1(client);
      if (num === 2) await tcw.setRelay2(client);
      if (num === 3) await tcw.setRelay3(client);
      if (num === 4) await tcw.setRelay4(client);
      const relays = await tcw.getRelaysState(client);
      socket.end();
      res.json({ success: true, relays });
    } catch (err) {
      socket.end();
      res.status(500).json({ success: false, error: err.message });
    }
  });
  socket.on('error', err => {
    res.status(500).json({ success: false, error: err.message });
  });
});

// ... (Fonctions regulateLoop, readTCW241 et saveLoop identiques à avant, je les abrège pour la lisibilité) ...
async function readTCW241() { /* Ton code existant */ }
async function saveLoop() { /* Ton code existant avec db.query */ }
async function regulateLoop() { /* Ton code existant */ }

// Lancement des boucles
setInterval(regulateLoop, 10000);
setInterval(saveLoop, 10000);

app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
});