// ========================================
// CONFIGURATION & VARIABLES GLOBALES
// ========================================

const CONFIG = {
    apiUrl: 'http://172.29.16.154/api',
    updateInterval: 5000,
    chartMaxPoints: 20,
};

const appState = {
    sensors: {
        temperature: null
    },
    isConnected: false,
    alerts: []
};

const chartData = {
    timestamps: [],
    temperature: []
};

let charts = {};

// ========================================
// INITIALISATION
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    initializeEventListeners();
    initializeCharts();
    startDataPolling();
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

// ========================================
// COMMUNICATION AVEC LE BACKEND
// ========================================

async function fetchSensorData() {
    try {
        const response = await fetch(`${CONFIG.apiUrl}/temp`);
        if (!response.ok) throw new Error('Erreur réseau');

        const data = await response.json();

        updateSensorData({
            temperature: parseFloat(data.temperature)
        });

        updateConnectionStatus(true);
    } catch (error) {
        console.error('Erreur lors de la récupération des données:', error);
        updateConnectionStatus(false);
    }
}

function startDataPolling() {
    fetchSensorData();
    setInterval(fetchSensorData, CONFIG.updateInterval);
}

// ========================================
// MISE À JOUR DE L'INTERFACE
// ========================================

function updateSensorData(data) {
    appState.sensors.temperature = data.temperature;

    updateDisplay();
    addToHistory(data);
    updateCharts();
    checkAlerts(data);
}

function updateDisplay() {
    const { temperature } = appState.sensors;

    document.getElementById('hero-temp').textContent =
        temperature !== null ? `${temperature.toFixed(1)}°C` : '--';

    updateCard('temp', temperature, '°C', getTemperatureStatus);
}

function updateCard(type, value, unit, statusFunction) {
    const valueElement = document.getElementById(`${type}-value`);
    const statusElement = document.getElementById(`${type}-status`);

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

function getTemperatureStatus(temp) {
    if (temp < 15) return { text: 'Trop froid', level: 'danger' };
    if (temp < 18) return { text: 'Froid', level: 'warning' };
    if (temp <= 28) return { text: 'Optimal', level: 'success' };
    if (temp <= 32) return { text: 'Chaud', level: 'warning' };
    return { text: 'Trop chaud', level: 'danger' };
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
// ALERTES
// ========================================

function checkAlerts(data) {
    const { temperature } = data;

    if (temperature !== null) {
        if (temperature > 32) {
            addAlert('danger', 'Température élevée', `La température est de ${temperature.toFixed(1)}°C.`);
        } else if (temperature < 15) {
            addAlert('danger', 'Température basse', `La température est de ${temperature.toFixed(1)}°C.`);
        }
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
// GRAPHIQUES
// ========================================

function initializeCharts() {
    const tempCtx = document.getElementById('temp-humidity-chart');

    if (tempCtx) {
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
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });
    }
}

function addToHistory(data) {
    const now = new Date();
    const timeLabel = now.toLocaleTimeString();

    chartData.timestamps.push(timeLabel);
    chartData.temperature.push(data.temperature);

    if (chartData.timestamps.length > CONFIG.chartMaxPoints) {
        chartData.timestamps.shift();
        chartData.temperature.shift();
    }
}

function updateCharts() {
    if (charts.temp) {
        charts.temp.data.labels = chartData.timestamps;
        charts.temp.data.datasets[0].data = chartData.temperature;
        charts.temp.update('none');
    }
}

// ========================================
// UTILITAIRES
// ========================================

window.greenhouseApp = {
    getState: () => appState,
    getChartData: () => chartData
};
