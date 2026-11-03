<?php
// 注文の詳細

require __DIR__ . '/../lib/orders.php';
require __DIR__ . '/../lib/layout.php';

$id = isset($_GET['id']) ? (int) $_GET['id'] : 0;
$order = find_order($id);
if (!$order) {
    http_response_code(404);
    page_header('注文が見つかりません');
    echo '<p>注文番号 ' . $id . ' はありません。</p>';
    page_footer();
    exit;
}

count_view($id);
$order = find_order($id);
$items = order_items($id);
$totals = order_totals($order, $items);

page_header('注文 ' . $order['id']);

echo '<dl>';
echo '<dt>注文日</dt><dd>' . h($order['ordered_on']) . '</dd>';
echo '<dt>お客様</dt><dd>' . h($order['customer']) . ' 様</dd>';
echo '<dt>入金</dt><dd>' . ($order['paid_on'] === null ? '未入金' : h($order['paid_on']) . ' に入金済み') . '</dd>';
if ($order['gift'] === '1') {
    echo '<dt>ギフト包装</dt><dd>する（のし付き）</dd>';
}
echo '</dl>';

if (count($items) === 0) {
    echo '<p>明細がありません。</p>';
} else {
    echo '<table><thead><tr><th>書名</th><th>単価</th><th>冊数</th><th>小計</th><th>在庫</th></tr></thead><tbody>';
    foreach ($items as $item) {
        echo '<tr>';
        echo '<td>' . h($item['title']) . '</td>';
        echo '<td>' . yen($item['price']) . '</td>';
        echo '<td>' . $item['qty'] . '</td>';
        echo '<td>' . yen($item['price'] * $item['qty']) . '</td>';
        echo '<td>' . stock_label($item['stock']) . '</td>';
        echo '</tr>';
    }
    echo '</tbody></table>';
}

echo '<table><tbody>';
echo '<tr><th>小計</th><td>' . yen($totals['subtotal']) . '</td></tr>';
if ($order['coupon_rate'] !== null) {
    echo '<tr><th>クーポン割引 ' . $order['coupon_rate'] . '%</th><td>-' . yen($totals['discount']) . '</td></tr>';
}
echo '<tr><th>送料</th><td>' . ($totals['shipping'] === 0 ? '無料' : yen($totals['shipping'])) . '</td></tr>';
echo '<tr><th>合計</th><td>' . yen($totals['total']) . '</td></tr>';
echo '<tr><th>1冊あたり</th><td>' . yen($totals['total'] / $totals['books']) . '</td></tr>';
echo '</tbody></table>';

echo '<p>この注文を開いた回数: ' . $order['views'] . '</p>';

if ($order['paid_on'] === null) {
    echo '<form method="post" action="/record-payment.php">';
    echo '<input type="hidden" name="id" value="' . $order['id'] . '">';
    echo '<input type="hidden" name="token" value="' . bin2hex(random_bytes(8)) . '">';
    echo '<button type="submit">入金を記録する</button>';
    echo '</form>';
}

page_footer();
