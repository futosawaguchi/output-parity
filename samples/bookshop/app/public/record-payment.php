<?php
// 入金を記録して、注文の詳細に戻る

require __DIR__ . '/../lib/orders.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    exit;
}
$id = (int) $_POST['id'];
record_payment($id, date('Y-m-d'));
header('Location: /order.php?id=' . $id);
