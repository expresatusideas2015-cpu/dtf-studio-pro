<?php
/**
 * Servicio de Eliminación de Fondo usando Photoroom API
 * 
 * Este script actúa como proxy seguro para la API de Photoroom.
 * Recibe una imagen, la envía a Photoroom y devuelve la imagen procesada (PNG transparente).
 */

// Configuración CORS robusta
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Content-Length");

// Manejo de Preflight (OPTIONS)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Configuración de límites
ini_set('memory_limit', '256M');
ini_set('post_max_size', '50M');
ini_set('upload_max_filesize', '50M');

// Validaciones básicas de carga
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    die("Method Not Allowed");
}

if (!isset($_FILES['image']) || $_FILES['image']['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    $errCode = $_FILES['image']['error'] ?? 'No file';
    die("Error en la subida de imagen (Code: $errCode)");
}

$tmpName = $_FILES['image']['tmp_name'];

// Validación de seguridad de tipo MIME
$finfo = new finfo(FILEINFO_MIME_TYPE);
$mime = $finfo->file($tmpName);
$allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

if (!in_array($mime, $allowedTypes)) {
    http_response_code(400);
    die("Tipo de archivo no permitido: $mime");
}

// =================================================================================
// INTEGRACIÓN CON PHOTOROOM API
// =================================================================================

$apiKey = 'sk_pr_expresatusideas_7e9f14aa7128eca2ca5e592f8790fde26ac7f74d';
$apiUrl = 'https://sdk.photoroom.com/v1/segment';

// Preparar la solicitud cURL
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $apiUrl);
curl_setopt($ch, CURLOPT_POST, 1);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);

// Importante: Photoroom espera 'image_file'
curl_setopt($ch, CURLOPT_POSTFIELDS, [
    'image_file' => new CURLFile($tmpName, $mime, $_FILES['image']['name'])
]);

curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'x-api-key: ' . $apiKey
]);

// Ejecutar solicitud
$result = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$error = curl_error($ch);
curl_close($ch);

if ($httpCode === 200) {
    // Éxito: Devolver la imagen PNG generada por Photoroom
    header("Content-Type: image/png");
    echo $result;
} else {
    // Error: Devolver detalles para depuración (o mensaje genérico en producción)
    http_response_code($httpCode ?: 500);
    
    // Intentar decodificar si es JSON (error de API)
    $jsonError = json_decode($result, true);
    $errorMessage = $jsonError['message'] ?? $result ?? $error ?? 'Unknown error';
    
    echo "Error API Photoroom ($httpCode): " . $errorMessage;
}

exit;

// hollaaaa