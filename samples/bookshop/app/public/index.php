<?php
// 注文の一覧（注文日の順）

require __DIR__ . '/../lib/orders.php';
require __DIR__ . '/../lib/layout.php';

$orders = all_orders();
usort($orders, function ($a, $b) {
    return strcmp($a['ordered_on'], $b['ordered_on']);
});

page_header('注文の一覧');
echo '<table><thead><tr><th>注文番号</th><th>注文日</th><th>お客様</th><th>冊数</th><th>合計</th></tr></thead><tbody>';
foreach ($orders as $order) {
    $totals = order_totals($order, order_items($order['id']));
    echo '<tr>';
    echo '<td><a href="/order.php?id=' . $order['id'] . '">' . $order['id'] . '</a></td>';
    echo '<td>' . h($order['ordered_on']) . '</td>';
    echo '<td>' . h($order['customer']) . ' 様</td>';
    echo '<td class="num">' . $totals['books'] . '</td>';
    echo '<td class="num">' . yen($totals['total']) . '</td>';
    echo '</tr>';
}
echo '</tbody></table>';
page_footer();
