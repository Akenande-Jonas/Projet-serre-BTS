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
          h1: tcw.h1,
          h2: tcw.h2,
          h3: tcw.h3,
          humiditeSol: tcw.humiditeMoyenne,
          relays,
          timestamp: tcw.timestamp
        });

      } catch (err) {
        socket.end();
        resolve({
          temperature: null,
          h1: null,
          h2: null,
          h3: null,
          humiditeSol: null,
          relays: null
        });
      }
    });

    socket.on('error', () => {
      resolve({
        temperature: null,
        h1: null,
        h2: null,
        h3: null,
        humiditeSol: null,
        relays: null
      });
    });
  });
}



// ========================================
// 🌍 EXPRESS STATIC
// ========================================

// Assure-toi que le chemin est bon par rapport à l'emplacement de server.js
app.use(express.static('/var/www/html/Serre'));

app.get('/', (req, res) => {
    res.sendFile(path.join('/var/www/html/Serre/front', 'index.html'));
});

// ========================================
// 🚀 ROUTE API UNIFIÉE
// ========================================

// Route pour obtenir l'historique 24h pour les graphiques
app.get('/api/historique-24h', authMiddleware, (req, res) => {
  try {
    const sql = `
      SELECT 
        id,
        temperature,
        h1,
        h2,
        h3,
        humidite_moyenne,
        timestamp
      FROM capteurs
      WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      ORDER BY timestamp ASC
    `;

    db.query(sql, (err, results) => {
      if (err) {
        return res.status(500).json({ success: false, error: err.message });
      }

      // Formater les données pour Chart.js
      const historique = results.map(row => ({
        timestamp: new Date(row.timestamp).toLocaleTimeString('fr-FR'),
        temperature: parseFloat(row.temperature),
        h1: parseFloat(row.h1),
        h2: parseFloat(row.h2),
        h3: parseFloat(row.h3),
        humiditeMoyenne: parseFloat(row.humidite_moyenne)
      }));

      res.json({
        success: true,
        data: historique,
        count: historique.length
      });
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});



app.get('/api/info', authMiddleware, async (req, res) => {
  try {
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



app.post('/api/relais/:numRelais', authMiddleware, async (req, res) => {
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


// ========================================
// 🚀 ROUTE API actionneur
// ========================================

// Récupérer tous les actionneurs
app.get('/api/actionneurs', (req, res) => {
    const sql = "SELECT * FROM actionneur";
    db.query(sql, (err, results) => {
        if (err) {
            console.error("Erreur SQL :", err);
            return res.status(500).json({ error: "Erreur serveur" });
        }
        res.json(results);
    });
});

// Ajouter un actionneur
app.post('/api/actionneurs', (req, res) => {
    const { type, etat } = req.body;

    const sql = "INSERT INTO actionneur (type, etat) VALUES (?, ?)";
    db.query(sql, [type, etat], (err, result) => {
        if (err) {
            console.error("Erreur SQL :", err);
            return res.status(500).json({ error: "Erreur serveur" });
        }
        res.json({ message: "Actionneur ajouté", id: result.insertId });
    });
});


async function regulateLoop() {
    const socket = new net.Socket();
    const client = new Modbus.client.TCP(socket);

    socket.connect({ host: process.env.serverIP, port: process.env.portMod });

    socket.on('connect', async () => {
        try {
            const tcw = new TCW241();

            // Lecture capteurs
            const data = await tcw.getAll(client);

            // Lecture consigne BDD
            db.query("SELECT temperature, humidite_moyenne, humidite_air, relai_0, relai_1, relai_2, relai_3 FROM Consigne LIMIT 1", async (err, rows) => {
    if (err || rows.length === 0) {
        console.error('Erreur lecture consigne :', err);
        socket.end();
        return;
    }

    const consigne = {
        temperature: rows[0].temperature,
        humidite: rows[0].humidite_moyenne,
        humiditeair: rows[0].humidite_air,
        relay0: rows[0].relai_0,
        relay1: rows[0].relai_1,
        relay2: rows[0].relai_2,
        relay3: rows[0].relai_3
    };

    console.log('Consigne utilisée :', consigne);

    await tcw.regulate(client, consigne);

    socket.end();
});


        } catch (err) {
            socket.end();
        }
    });
}

setInterval(regulateLoop, 10000);
setInterval(saveLoop, 10000);

// =======================================
// START SERVER
// ========================================

app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur le port ${PORT}`);
});