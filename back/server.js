// server.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const mysql = require('mysql');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

dotenv.config();

const PORT = process.env.PORT;
const JWT_SECRET = process.env.CODE;

function extractToken(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}

// Simple blacklist en mémoire (pour tests). En production, utiliser Redis/DB avec TTL.
const revokedTokens = new Set();
function revokeToken(jti) { if (jti) revokedTokens.add(jti); }
function isRevoked(jti) { return jti && revokedTokens.has(jti); }

// Middleware pour vérifier le token JWT
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

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir les fichiers statiques (front)
app.use(express.static('/var/www/html/Serre'));

// --- Connexion MySQL ---
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

// --- Routes publiques ---
app.get('/', (req, res) => {
    res.sendFile(path.join('/var/www/html/Serre/front', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});