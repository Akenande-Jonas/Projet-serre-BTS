<?php
header("Content-Type: application/json");

// Charger l'autoload de Composer (pour Dotenv)
require_once __DIR__ . '/vendor/autoload.php';

// Charger le .env
$dotenv = Dotenv\Dotenv::createImmutable(__DIR__);
$dotenv->load();

// Charger la connexion PDO sécurisée
require_once __DIR__ . '/config/database.php';

// Récupérer l'endpoint
$endpoint = $_GET['endpoint'] ?? null;

if (!$endpoint) {
    echo json_encode(["error" => "Aucun endpoint fourni"]);
    exit;
}

// Construire le chemin du fichier endpoint
$path = __DIR__ . "/api/endpoints/$endpoint.php";

if (file_exists($path)) {
    require $path;
} else {
    http_response_code(404);
    echo json_encode(["error" => "Endpoint introuvable"]);
}
