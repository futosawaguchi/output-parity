<?php
// 入金を記録して、注文の詳細に戻る

require __DIR__ . '/../lib/orders.php';

session_start();
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    exit;
}
$token = isset($_POST['token']) ? $_POST['token'] : '';
if (!isset($_SESSION['token']) || !hash_equals($_SESSION['token'], $token)) {
    http_response_code(403);
    exit('画面を開き直してから、もう一度記録してください。');
}
$id = isset($_POST['id']) ? (int) $_POST['id'] : 0;
record_payment($id, date('Y-m-d'));
header('Location: /order.php?id=' . $id);
