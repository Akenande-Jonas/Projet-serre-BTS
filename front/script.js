// ========================================
// CONFIGURATION & VARIABLES GLOBALES
// ========================================

const CONFIG = {
    // Si tu es sur la VM, vérifie que l'IP ici est la bonne pour accéder au back
    apiUrl: 'http://172.29.16.154/api', // Ou '/api' si le front est servi par node
    updateInterval: 5000,
    chartMaxPoints: 20,
};

const appState = {
    sensors: {
        temperature: null, // TCW241
        humidity: null,    // TCW241
        
        // --- [ETUDIANT 2] Ajouts EAU ---
        consoEau: 0,
        cuvePleine: false,
        reseauPluie: false
    },
    isConnected: false,
    alerts: []
};

const chartData = {
    timestamps: [],
    temperature: [],
    humidity: []
};

let charts = {};

// ========================================
// INITIALISATION
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    initializeEventListeners();
    initializeCharts();
    startDataPolling();
    setupControlsListeners();
});

// ========================================
// EVENT LISTENERS
// ========================================

function initializeEventListeners() {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            e.target.classList.add('active');
        });
    });
}

// Gestion des contrôles automatiques
function setupControlsListeners() {
    // Sliders pour mise à jour des valeurs affichées
    document.getElementById('irrigation-slider')?.addEventListener('input', (e) => {
        document.getElementById('irrigation-threshold').textContent = e.target.value;
    });
    
    document.getElementById('mist-slider')?.addEventListener('input', (e) => {
        document.getElementById('mist-intensity').textContent = e.target.value;
    });
    
    document.getElementById('ventilation-slider')?.addEventListener('input', (e) => {
        document.getElementById('ventilation-speed').textContent = e.target.value;
    });
    
    document.getElementById('heating-slider')?.addEventListener('input', (e) => {
        document.getElementById('heating-target').textContent = e.target.value;
    });
    
    // Bouton Appliquer
    document.getElementById('apply-controls-btn')?.addEventListener('click', applyControls);
}

function applyControls() {
    const controls = {
        irrigation: {
            enabled: document.getElementById('irrigation-toggle')?.checked || false,
            threshold: parseInt(document.getElementById('irrigation-slider')?.value || 30)
        },
        misting: {
            enabled: document.getElementById('mist-toggle')?.checked || false,
            intensity: parseInt(document.getElementById('mist-slider')?.value || 50)
        },
        ventilation: {
            enabled: document.getElementById('ventilation-toggle')?.checked || false,
            speed: parseInt(document.getElementById('ventilation-slider')?.value || 3)
        },
        heating: {
            enabled: document.getElementById('heating-toggle')?.checked || false,
            target: parseInt(document.getElementById('heating-slider')?.value || 20)
        }
    };
    
    console.log('Paramètres appliqués:', controls);
    
    // Afficher une notification de succès
    showApplyNotification();
    
    // Ici tu peux envoyer les données au backend
    // sendControlsToBackend(controls);
}

function showApplyNotification() {
    const btn = document.getElementById('apply-controls-btn');
    if (!btn) return;
    
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="btn-icon">✓</span> Paramètres appliqués!';
    btn.style.background = 'linear-gradient(135deg, #45a049, #357a3f)';
    
    setTimeout(() => {
        btn.innerHTML = originalText;
        btn.style.background = '';
    }, 2000);
}

// ========================================
// COMMUNICATION AVEC LE BACKEND
// ========================================

async function fetchSensorData() {
    try {
        const token = localStorage.getItem("token");
        
        // Utilisation d'une URL relative si possible, sinon garde CONFIG.apiUrl
        const response = await fetch(`${CONFIG.apiUrl}/info`, {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        if (response.status === 401) {
            localStorage.removeItem("token");
            window.location.href = "/front/login.html";
            return;
        }

        const data = await response.json();

        // Mise à jour unifiée (TCW + POSEIDON)
        updateSensorData({
            temperature: parseFloat(data.temperature),
            humidity: parseFloat(data.humiditeSol),
            
            // Récupération de tes données
            consoEau: parseFloat(data.consoEau || 0),
            cuvePleine: data.cuvePleine,
            reseauPluie: data.reseauPluie
        });

        updateConnectionStatus(true);

    } catch (error) {
        console.error("Erreur API :", error);
        updateConnectionStatus(false);
    }
}

function startDataPolling() {
    fetchSensorData();
    fetchHistorique24h(); // Récupérer l'historique au démarrage
    
    // Mise à jour des données temps réel
    setInterval(fetchSensorData, CONFIG.updateInterval);
    
    // Mise à jour des graphiques tous les 5 secondes
    setInterval(fetchHistorique24h, 5000);
}



// ==========================================
// 🔐 GESTION CONNEXION / DECONNEXION
// ==========================================

function updateAuthButton() {
    const token = localStorage.getItem("token");
    const role = localStorage.getItem("role");
    const btn = document.getElementById("btn-auth");
    const btnAdmin = document.getElementById("btn-admin");

    if (token) {
        // --- CAS : UTILISATEUR CONNECTÉ ---
        btn.innerText = "Déconnexion";
        btn.style.backgroundColor = "#e74c3c"; // Rouge
        btn.style.color = "white";
        
        // Afficher le bouton Admin si c'est un admin
        if (role === 'admin' && btnAdmin) {
            btnAdmin.style.display = "inline-block";
        }
    } else {
        // --- CAS : UTILISATEUR NON CONNECTÉ ---
        btn.innerText = "Connexion";
        btn.style.backgroundColor = "#2ecc71"; // Vert
        btn.style.color = "white";
        
        if (btnAdmin) btnAdmin.style.display = "none";
    }
}

function gererConnexion() {
    const token = localStorage.getItem("token");

    if (token) {
        // --- ACTION : SE DÉCONNECTER ---
        // 1. On supprime tout ce qui est stocké
        localStorage.removeItem("token");
        localStorage.removeItem("role");
        
        // 2. On recharge la page ou on redirige vers login
        alert("Vous avez été déconnecté.");
        window.location.href = "/front/login.html"; 
    } else {
        // --- ACTION : ALLER VERS CONNEXION ---
        window.location.href = "/front/login.html";
    }
}

// Lancer la vérification au chargement de la page
document.addEventListener("DOMContentLoaded", updateAuthButton);

// ========================================
// MISE À JOUR DE L'INTERFACE
// ========================================

function updateSensorData(data) {
    // Stockage dans l'état global
    appState.sensors.temperature = data.temperature;
    appState.sensors.humidity = data.humidity;
    appState.sensors.consoEau = data.consoEau;
    appState.sensors.cuvePleine = data.cuvePleine;
    appState.sensors.reseauPluie = data.reseauPluie;

    updateDisplay();
    addToHistory(data);
    updateCharts();
    checkAlerts(data);
}

function updateDisplay() {
    const { temperature, humidity, consoEau, cuvePleine, reseauPluie } = appState.sensors;

    // --- Affichage TCW (Existant) ---
    document.getElementById('hero-temp').textContent =
        temperature !== null ? `${temperature.toFixed(1)}°C` : '--';

    document.getElementById('hero-humidity').textContent =
        humidity !== null ? `${humidity.toFixed(1)}%` : '--';

    updateCard('temp', temperature, '°C', getTemperatureStatus);
    updateCard('humidity', humidity, '%', getHumidityStatus);

    // --- Affichage EAU (Nouveau) ---
    // Vérifie que tu as bien ajouté les balises HTML correspondantes dans index.html
    
    // 1. Consommation
    const elConso = document.getElementById('valeur-conso');
    if (elConso) {
        elConso.textContent = `${consoEau.toFixed(1)} L`;
    }

    // 2. État de la Cuve
    const elCuve = document.getElementById('etat-cuve');
    if (elCuve) {
        elCuve.textContent = cuvePleine ? 'PLEINE' : 'VIDE';
        // Changement de classe CSS pour la couleur (Bootstrap badges)
        elCuve.className = cuvePleine ? 'badge bg-success' : 'badge bg-danger';
    }

    // 3. Réseau Actif
    const elReseau = document.getElementById('etat-reseau');
    if (elReseau) {
        elReseau.textContent = reseauPluie ? 'EAU DE PLUIE' : 'EAU DE VILLE';
        elReseau.style.color = reseauPluie ? 'green' : 'orange';
    }
}

function updateCard(type, value, unit, statusFunction) {
    const valueElement = document.getElementById(`${type}-value`);
    const statusElement = document.getElementById(`${type}-status`);

    if (valueElement && statusElement) {
        if (value !== null) {
            valueElement.textContent = value.toFixed(1) + unit;
            const status = statusFunction(value);
            statusElement.textContent = status.text;
            statusElement.className = `card-status text-${status.level}`;
        } else {
            valueElement.textContent = '--' + unit;
            statusElement.textContent = 'Aucune donnée';
            statusElement.className = 'card-status';
        }
    }
}

function getTemperatureStatus(temp) {
    if (temp < 15) return { text: 'Trop froid', level: 'danger' };
    if (temp < 18) return { text: 'Froid', level: 'warning' };
    if (temp <= 28) return { text: 'Optimal', level: 'success' };
    if (temp <= 32) return { text: 'Chaud', level: 'warning' };
    return { text: 'Trop chaud', level: 'danger' };
}

function getHumidityStatus(h) {
    if (h < 20) return { text: 'Trop sec', level: 'danger' };
    if (h < 40) return { text: 'Sec', level: 'warning' };
    if (h <= 70) return { text: 'Optimal', level: 'success' };
    if (h <= 85) return { text: 'Humide', level: 'warning' };
    return { text: 'Trop humide', level: 'danger' };
}

function updateConnectionStatus(isConnected) {
    appState.isConnected = isConnected;
    const indicator = document.querySelector('.status-indicator');
    const statusText = document.querySelector('.status-text');
    const footerStatus = document.getElementById('footer-status');

    if (indicator && statusText) {
        if (isConnected) {
            indicator.classList.add('online');
            indicator.classList.remove('offline');
            statusText.textContent = 'Connecté';
            if(footerStatus) footerStatus.textContent = 'Tous les systèmes opérationnels';
        } else {
            indicator.classList.remove('online');
            indicator.classList.add('offline');
            statusText.textContent = 'Déconnecté';
            if(footerStatus) footerStatus.textContent = 'Connexion au système en cours...';
        }
    }
}

// ========================================
// ALERTES
// ========================================

function checkAlerts(data) {
    const { temperature, humidity } = data;

    if (temperature !== null) {
        if (temperature > 32) addAlert('danger', 'Température élevée', `${temperature.toFixed(1)}°C`);
        else if (temperature < 15) addAlert('danger', 'Température basse', `${temperature.toFixed(1)}°C`);
    }
    // Tu peux ajouter des alertes pour la cuve ici
    if (data.cuvePleine === false && data.reseauPluie === true) {
         // Exemple d'alerte incohérence (ne devrait pas arriver avec tes algos)
    }
}

function addAlert(type, title, message) {
    const alert = {
        id: Date.now(),
        type,
        title,
        message,
        timestamp: new Date()
    };

    appState.alerts.unshift(alert);
    if (appState.alerts.length > 10) appState.alerts.pop();

    displayAlert(alert);
}

function displayAlert(alert) {
    const container = document.getElementById('alerts-container');
    if (!container) return;

    const alertElement = document.createElement('div');
    alertElement.className = `alert alert-${alert.type}`;
    alertElement.innerHTML = `
        <strong>${alert.title}</strong><br>
        ${alert.message}<br>
        <small>${alert.timestamp.toLocaleTimeString()}</small>
    `;

    container.insertBefore(alertElement, container.firstChild);

    while (container.children.length > 5) {
        container.removeChild(container.lastChild);
    }
}

// ========================================
// GRAPHIQUES DYNAMIQUES
// ========================================

function initializeCharts() {
    const tempCtx = document.getElementById('temp-humidity-chart');
    if (tempCtx && typeof Chart !== 'undefined') {
        charts.temp = new Chart(tempCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    { 
                        label: 'Température (°C)', 
                        data: [], 
                        borderColor: '#F44336', 
                        backgroundColor: 'rgba(244, 67, 54, 0.1)',
                        tension: 0.4,
                        fill: true
                    },
                    { 
                        label: 'Humidité (%)', 
                        data: [], 
                        borderColor: '#2196F3', 
                        backgroundColor: 'rgba(33, 150, 243, 0.1)',
                        tension: 0.4,
                        fill: true
                    }
                ]
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        max: 100
                    }
                }
            }
        });
    }
}

// Récupérer l'historique 24h depuis la base de données
async function fetchHistorique24h() {
    try {
        const token = localStorage.getItem("token");
        
        const response = await fetch(`${CONFIG.apiUrl}/historique-24h`, {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        if (response.status === 401) {
            localStorage.removeItem("token");
            window.location.href = "login.html";
            return;
        }

        const result = await response.json();
        if (result.success && result.data) {
            updateChartsWithHistorique(result.data);
        }
    } catch (error) {
        console.error("Erreur récupération historique:", error);
    }
}

// Mettre à jour les graphiques avec les données de l'historique
function updateChartsWithHistorique(data) {
    if (!data || data.length === 0) return;

    // Limiter à 20 derniers points pour une meilleure lisibilité
    const maxPoints = 20;
    const historique = data.slice(-maxPoints);

    // Préparer les labels (timestamps)
    const labels = historique.map(item => {
        const time = item.timestamp;
        // Si c'est déjà formaté, utilise-le sinon formate
        return typeof time === 'string' ? time : new Date(time).toLocaleTimeString('fr-FR');
    });

    // Préparer les données
    const temperatures = historique.map(item => item.temperature);
    const humidites = historique.map(item => item.humiditeMoyenne);

    // Mettre à jour le graphique Température & Humidité
    if (charts.temp) {
        charts.temp.data.labels = labels;
        charts.temp.data.datasets[0].data = temperatures;
        charts.temp.data.datasets[1].data = humidites;
        charts.temp.update('none'); // 'none' = animation rapide sans redessiner tout
    }
}

function addToHistory(data) {
    const now = new Date();
    const timeLabel = now.toLocaleTimeString();

    chartData.timestamps.push(timeLabel);
    chartData.temperature.push(data.temperature);
    chartData.humidity.push(data.humidity);

    if (chartData.timestamps.length > CONFIG.chartMaxPoints) {
        chartData.timestamps.shift();
        chartData.temperature.shift();
        chartData.humidity.shift();
    }
}

function updateCharts() {
    // Cette fonction est appelée par updateSensorData pour garder la compatibilité
    // mais elle ne fait rien car les graphiques sont mis à jour par fetchHistorique24h
}