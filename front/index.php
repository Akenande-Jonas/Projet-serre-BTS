<?php
    header("Content-Type: application/json");

    $endpoint = $_GET['endpoint'] ?? null;

    if (!$endpoint) {
        echo json_encode(["error" => "Aucun endpoint fourni"]);
        exit;
    }

    $path = "api/endpoints/$endpoint.php";

    if (file_exists($path)) {
        require $path;
    }else{
        echo json_encode(["error" => "Endpoint introuvable"]);
    }
?>