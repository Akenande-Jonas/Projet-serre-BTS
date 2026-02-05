// ========================================
// CONFIGURATION & VARIABLES GLOBALES
// ========================================

const CONFIG = {
    apiUrl: 'http://172.29.16.154/api', // URL du serveur backend (à adapter)
    updateInterval: 5000, // Intervalle de mise à jour en ms (5 secondes)
    chartMaxPoints: 20, // Nombre maximum de points sur les graphiques
};

// État de l'application
const appState = {
    sensors: {
        temperature: null,
        humidity: null,
        light: null,
        soilMoisture: null,
    },
    controls: {
        irrigation: { enabled: false, threshold: 30 },
        lighting: { enabled: false, intensity: 50 },
        ventilation: { enabled: false, speed: 3 },
        heating: { enabled: false, targetTemp: 20 },
    },
    isConnected: false,
    alerts: [],
};

// Historique pour les graphiques
const chartData = {
    timestamps: [],
    temperature: [],
    humidity: [],
    light: [],
    soilMoisture: [],
};

let charts = {};

// ========================================
// INITIALISATION
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🌱 GreenHouse Connect - Initialisation...');
    
    initializeEventListeners();
    initializeCharts();
    startDataPolling();
    
    // Simulation de données pour le développement (à retirer en production)
    if (!navigator.onLine || true) { // Toujours en mode simulation pour le moment
        console.log('📊 Mode simulation activé');
        startSimulation();
    }
});

// ========================================
// EVENT LISTENERS
// ========================================

function initializeEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            e.target.classList.add('active');
        });
    });

    // Contrôles - Irrigation
    const irrigationToggle = document.getElementById('irrigation-toggle');
    const irrigationSlider = document.getElementById('irrigation-slider');
    const irrigationThreshold = document.getElementById('irrigation-threshold');
    
    irrigationToggle.addEventListener('change', (e) => {
        appState.controls.irrigation.enabled = e.target.checked;
        updateToggleText(e.target, 'Activé', 'Désactivé');
        sendControlUpdate('irrigation', appState.controls.irrigation);
        addAlert(
            e.target.checked ? 'success' : 'info',
            'Arrosage automatique',
            `Le système d'arrosage a été ${e.target.checked ? 'activé' : 'désactivé'}`,
        );
    });
    
    irrigationSlider.addEventListener('input', (e) => {
        irrigationThreshold.textContent = e.target.value;
        appState.controls.irrigation.threshold = parseInt(e.target.value);
        sendControlUpdate('irrigation', appState.controls.irrigation);
    });

    // Contrôles - Éclairage
    const lightingToggle = document.getElementById('lighting-toggle');
    const lightingSlider = document.getElementById('lighting-slider');
    const lightingIntensity = document.getElementById('lighting-intensity');
    
    lightingToggle.addEventListener('change', (e) => {
        appState.controls.lighting.enabled = e.target.checked;
        updateToggleText(e.target, 'Activé', 'Désactivé');
        sendControlUpdate('lighting', appState.controls.lighting);
        addAlert(
            e.target.checked ? 'success' : 'info',
            'Éclairage LED',
            `L'éclairage a été ${e.target.checked ? 'activé' : 'désactivé'}`,
        );
    });
    
    lightingSlider.addEventListener('input', (e) => {
        lightingIntensity.textContent = e.target.value;
        appState.controls.lighting.intensity = parseInt(e.target.value);
        sendControlUpdate('lighting', appState.controls.lighting);
    });

    // Contrôles - Ventilation
    const ventilationToggle = document.getElementById('ventilation-toggle');
    const ventilationSlider = document.getElementById('ventilation-slider');
    const ventilationSpeed = document.getElementById('ventilation-speed');
    
    ventilationToggle.addEventListener('change', (e) => {
        appState.controls.ventilation.enabled = e.target.checked;
        updateToggleText(e.target, 'Activé', 'Désactivé');
        sendControlUpdate('ventilation', appState.controls.ventilation);
        addAlert(
            e.target.checked ? 'success' : 'info',
            'Ventilation',
            `La ventilation a été ${e.target.checked ? 'activée' : 'désactivée'}`,
        );
    });
    
    ventilationSlider.addEventListener('input', (e) => {
        ventilationSpeed.textContent = e.target.value;
        appState.controls.ventilation.speed = parseInt(e.target.value);
        sendControlUpdate('ventilation', appState.controls.ventilation);
    });

    // Contrôles - Chauffage
    const heatingToggle = document.getElementById('heating-toggle');
    const heatingSlider = document.getElementById('heating-slider');
    const heatingTarget = document.getElementById('heating-target');
    
    heatingToggle.addEventListener('change', (e) => {
        appState.controls.heating.enabled = e.target.checked;
        updateToggleText(e.target, 'Activé', 'Désactivé');
        sendControlUpdate('heating', appState.controls.heating);
        addAlert(
            e.target.checked ? 'success' : 'info',
            'Chauffage',
            `Le chauffage a été ${e.target.checked ? 'activé' : 'désactivé'}`,
        );
    });
    
    heatingSlider.addEventListener('input', (e) => {
        heatingTarget.textContent = e.target.value;
        appState.controls.heating.targetTemp = parseInt(e.target.value);
        sendControlUpdate('heating', appState.controls.heating);
    });
}

function updateToggleText(toggleInput, activeText, inactiveText) {
    const textElement = toggleInput.parentElement.nextElementSibling;
    if (textElement && textElement.classList.contains('toggle-text')) {
        textElement.textContent = toggleInput.checked ? activeText : inactiveText;
    }
}

// ========================================
// COMMUNICATION AVEC LE BACKEND
// ========================================

async function fetchSensorData() {
    try {
        const response = await fetch(`${CONFIG.apiUrl}/sensors`);
        if (!response.ok) throw new Error('Erreur réseau');
        
        const data = await response.json();
        updateSensorData(data);
        updateConnectionStatus(true);
    } catch (error) {
        console.error('Erreur lors de la récupération des données:', error);
        updateConnectionStatus(false);
    }
}

async function sendControlUpdate(controlType, controlData) {
    try {
        const response = await fetch(`${CONFIG.apiUrl}/controls/${controlType}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(controlData),
        });
        
        if (!response.ok) throw new Error('Erreur lors de l\'envoi de la commande');
        
        console.log(`✅ Commande ${controlType} envoyée avec succès`);
    } catch (error) {
        console.error('Erreur lors de l\'envoi de la commande:', error);
        addAlert('danger', 'Erreur de communication', 'Impossible de communiquer avec le système');
    }
}

function startDataPolling() {
    // Première récupération immédiate
    fetchSensorData();
    
    // Récupération périodique
    setInterval(fetchSensorData, CONFIG.updateInterval);
}

// ========================================
// MISE À JOUR DE L'INTERFACE
// ========================================

function updateSensorData(data) {
    // Mise à jour de l'état
    appState.sensors = {
        temperature: data.temperature || appState.sensors.temperature,
        humidity: data.humidity || appState.sensors.humidity,
        light: data.light || appState.sensors.light,
        soilMoisture: data.soilMoisture || appState.sensors.soilMoisture,
    };

    // Mise à jour de l'affichage
    updateDisplay();
    
    // Mise à jour de l'historique et des graphiques
    addToHistory(data);
    updateCharts();
    
    // Vérification des alertes
    checkAlerts(data);
}

function updateDisplay() {
    const { temperature, humidity, light, soilMoisture } = appState.sensors;

    // Hero section
    document.getElementById('hero-temp').textContent = temperature !== null ? `${temperature.toFixed(1)}°C` : '--';
    document.getElementById('hero-humidity').textContent = humidity !== null ? `${humidity.toFixed(0)}%` : '--';
    document.getElementById('hero-light').textContent = light !== null ? `${light.toFixed(0)} lux` : '--';

    // Cards de statut
    updateCard('temp', temperature, '°C', getTemperatureStatus);
    updateCard('humidity', humidity, '%', getHumidityStatus);
    updateCard('light', light, ' lux', getLightStatus);
    updateCard('soil', soilMoisture, '%', getSoilMoistureStatus);
}

function updateCard(type, value, unit, statusFunction) {
    const valueElement = document.getElementById(`${type}-value`);
    const statusElement = document.getElementById(`${type}-status`);
    
    if (value !== null) {
        valueElement.textContent = value.toFixed(type === 'light' ? 0 : 1) + unit;
        const status = statusFunction(value);
        statusElement.textContent = status.text;
        statusElement.className = `card-status text-${status.level}`;
    } else {
        valueElement.textContent = '--' + unit;
        statusElement.textContent = 'Aucune donnée';
        statusElement.className = 'card-status';
    }
}

function getTemperatureStatus(temp) {
    if (temp < 15) return { text: 'Trop froid', level: 'danger' };
    if (temp < 18) return { text: 'Froid', level: 'warning' };
    if (temp <= 28) return { text: 'Optimal', level: 'success' };
    if (temp <= 32) return { text: 'Chaud', level: 'warning' };
    return { text: 'Trop chaud', level: 'danger' };
}

function getHumidityStatus(humidity) {
    if (humidity < 40) return { text: 'Trop sec', level: 'danger' };
    if (humidity < 50) return { text: 'Sec', level: 'warning' };
    if (humidity <= 70) return { text: 'Optimal', level: 'success' };
    if (humidity <= 80) return { text: 'Humide', level: 'warning' };
    return { text: 'Trop humide', level: 'danger' };
}

function getLightStatus(light) {
    if (light < 1000) return { text: 'Faible luminosité', level: 'warning' };
    if (light <= 5000) return { text: 'Optimal', level: 'success' };
    return { text: 'Forte luminosité', level: 'warning' };
}

function getSoilMoistureStatus(moisture) {
    if (moisture < 20) return { text: 'Sol très sec', level: 'danger' };
    if (moisture < 30) return { text: 'Sol sec', level: 'warning' };
    if (moisture <= 60) return { text: 'Optimal', level: 'success' };
    if (moisture <= 75) return { text: 'Sol humide', level: 'warning' };
    return { text: 'Sol saturé', level: 'danger' };
}

function updateConnectionStatus(isConnected) {
    appState.isConnected = isConnected;
    const indicator = document.querySelector('.status-indicator');
    const statusText = document.querySelector('.status-text');
    const footerStatus = document.getElementById('footer-status');
    
    if (isConnected) {
        indicator.classList.add('online');
        indicator.classList.remove('offline');
        statusText.textContent = 'Connecté';
        footerStatus.textContent = 'Tous les systèmes opérationnels';
    } else {
        indicator.classList.remove('online');
        indicator.classList.add('offline');
        statusText.textContent = 'Déconnecté';
        footerStatus.textContent = 'Connexion au système en cours...';
    }
}

// ========================================
// SYSTÈME D'ALERTES
// ========================================

function addAlert(type, title, message) {
    const alert = {
        id: Date.now(),
        type,
        title,
        message,
        timestamp: new Date(),
    };
    
    appState.alerts.unshift(alert);
    if (appState.alerts.length > 10) {
        appState.alerts.pop();
    }
    
    displayAlert(alert);
}

function displayAlert(alert) {
    const container = document.getElementById('alerts-container');
    const alertElement = document.createElement('div');
    alertElement.className = `alert alert-${alert.type}`;
    alertElement.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="2"/>
            <line x1="10" y1="6" x2="10" y2="10" stroke="currentColor" stroke-width="2"/>
            <circle cx="10" cy="13" r="1" fill="currentColor"/>
        </svg>
        <div class="alert-content">
            <h4>${alert.title}</h4>
            <p>${alert.message}</p>
            <span class="alert-time">${getTimeAgo(alert.timestamp)}</span>
        </div>
    `;
    
    container.insertBefore(alertElement, container.firstChild);
    
    // Limiter le nombre d'alertes affichées
    while (container.children.length > 5) {
        container.removeChild(container.lastChild);
    }
}

function checkAlerts(data) {
    const { temperature, humidity, soilMoisture } = data;
    
    // Alerte température
    if (temperature !== null) {
        if (temperature > 32) {
            addAlert('danger', 'Température élevée', `La température est de ${temperature.toFixed(1)}°C. Activez la ventilation.`);
        } else if (temperature < 15) {
            addAlert('danger', 'Température basse', `La température est de ${temperature.toFixed(1)}°C. Activez le chauffage.`);
        }
    }
    
    // Alerte humidité
    if (humidity !== null) {
        if (humidity > 80) {
            addAlert('warning', 'Humidité élevée', `L'humidité est de ${humidity.toFixed(0)}%. Risque de maladies.`);
        } else if (humidity < 40) {
            addAlert('warning', 'Air sec', `L'humidité est de ${humidity.toFixed(0)}%. Les plantes peuvent souffrir.`);
        }
    }
    
    // Alerte arrosage
    if (soilMoisture !== null && appState.controls.irrigation.enabled) {
        if (soilMoisture < appState.controls.irrigation.threshold) {
            addAlert('info', 'Arrosage déclenché', `Le sol est à ${soilMoisture.toFixed(0)}%. Arrosage en cours.`);
        }
    }
}

function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    if (seconds < 60) return 'Il y a quelques instants';
    if (seconds < 3600) return `Il y a ${Math.floor(seconds / 60)} minutes`;
    if (seconds < 86400) return `Il y a ${Math.floor(seconds / 3600)} heures`;
    return `Il y a ${Math.floor(seconds / 86400)} jours`;
}

// ========================================
// GRAPHIQUES (Chart.js)
// ========================================

function initializeCharts() {
    const tempHumidityCtx = document.getElementById('temp-humidity-chart');
    const lightSoilCtx = document.getElementById('light-soil-chart');
    
    if (tempHumidityCtx) {
        charts.tempHumidity = new Chart(tempHumidityCtx, {
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
                        yAxisID: 'y',
                    },
                    {
                        label: 'Humidité (%)',
                        data: [],
                        borderColor: '#2196F3',
                        backgroundColor: 'rgba(33, 150, 243, 0.1)',
                        tension: 0.4,
                        yAxisID: 'y1',
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    legend: {
                        position: 'top',
                    },
                },
                scales: {
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Température (°C)',
                        },
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Humidité (%)',
                        },
                        grid: {
                            drawOnChartArea: false,
                        },
                    },
                },
            },
        });
    }
    
    if (lightSoilCtx) {
        charts.lightSoil = new Chart(lightSoilCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Luminosité (lux)',
                        data: [],
                        borderColor: '#FF9800',
                        backgroundColor: 'rgba(255, 152, 0, 0.1)',
                        tension: 0.4,
                        yAxisID: 'y',
                    },
                    {
                        label: 'Humidité Sol (%)',
                        data: [],
                        borderColor: '#795548',
                        backgroundColor: 'rgba(121, 85, 72, 0.1)',
                        tension: 0.4,
                        yAxisID: 'y1',
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    legend: {
                        position: 'top',
                    },
                },
                scales: {
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Luminosité (lux)',
                        },
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Humidité Sol (%)',
                        },
                        grid: {
                            drawOnChartArea: false,
                        },
                    },
                },
            },
        });
    }
}

function addToHistory(data) {
    const now = new Date();
    const timeLabel = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    chartData.timestamps.push(timeLabel);
    chartData.temperature.push(data.temperature || null);
    chartData.humidity.push(data.humidity || null);
    chartData.light.push(data.light || null);
    chartData.soilMoisture.push(data.soilMoisture || null);
    
    // Limiter l'historique
    if (chartData.timestamps.length > CONFIG.chartMaxPoints) {
        chartData.timestamps.shift();
        chartData.temperature.shift();
        chartData.humidity.shift();
        chartData.light.shift();
        chartData.soilMoisture.shift();
    }
}

function updateCharts() {
    if (charts.tempHumidity) {
        charts.tempHumidity.data.labels = chartData.timestamps;
        charts.tempHumidity.data.datasets[0].data = chartData.temperature;
        charts.tempHumidity.data.datasets[1].data = chartData.humidity;
        charts.tempHumidity.update('none');
    }
    
    if (charts.lightSoil) {
        charts.lightSoil.data.labels = chartData.timestamps;
        charts.lightSoil.data.datasets[0].data = chartData.light;
        charts.lightSoil.data.datasets[1].data = chartData.soilMoisture;
        charts.lightSoil.update('none');
    }
}

// ========================================
// MODE SIMULATION (pour développement)
// ========================================

function startSimulation() {
    // Données initiales
    let simData = {
        temperature: 22,
        humidity: 60,
        light: 3000,
        soilMoisture: 45,
    };
    
    // Mise à jour périodique avec variations aléatoires
    setInterval(() => {
        simData.temperature += (Math.random() - 0.5) * 2;
        simData.humidity += (Math.random() - 0.5) * 5;
        simData.light += (Math.random() - 0.5) * 500;
        simData.soilMoisture += (Math.random() - 0.5) * 3;
        
        // Limites
        simData.temperature = Math.max(15, Math.min(35, simData.temperature));
        simData.humidity = Math.max(30, Math.min(90, simData.humidity));
        simData.light = Math.max(500, Math.min(7000, simData.light));
        simData.soilMoisture = Math.max(10, Math.min(80, simData.soilMoisture));
        
        updateSensorData(simData);
    }, CONFIG.updateInterval);
    
    // Première mise à jour immédiate
    updateSensorData(simData);
    updateConnectionStatus(true);
}

// ========================================
// UTILITAIRES
// ========================================

// Fonction pour exporter les données
function exportData() {
    const dataStr = JSON.stringify({
        timestamp: new Date().toISOString(),
        sensors: appState.sensors,
        controls: appState.controls,
        history: chartData,
    }, null, 2);
    
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `greenhouse-data-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
}

// Exposer certaines fonctions pour l'utilisation dans la console
window.greenhouseApp = {
    exportData,
    getState: () => appState,
    getChartData: () => chartData,
    addAlert,
};

console.log('✅ GreenHouse Connect initialisé avec succès');
console.log('💡 Utilisez window.greenhouseApp pour accéder aux fonctions de débogage');