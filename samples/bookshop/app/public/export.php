<?php
// 注文の書き出し（会計ソフトに取り込む CSV。Shift_JIS）

require __DIR__ . '/../lib/orders.php';

$out = fopen('php://temp', 'r+');
fputcsv($out, array('注文番号', '注文日', 'お客様', '入金日', 'クーポン割引率', '小計', '割引', '送料', '合計'));
foreach (all_orders() as $order) {
    $totals = order_totals($order, order_items($order['id']));
    fputcsv($out, array(
        $order['id'],
        $order['ordered_on'],
        $order['customer'],
        $order['paid_on'],
        $order['coupon_rate'],
        $totals['subtotal'],
        $totals['discount'],
        $totals['shipping'],
        $totals['total'],
    ));
}
rewind($out);
$csv = stream_get_contents($out);
fclose($out);

header('Content-Type: text/csv; charset=Shift_JIS');
header('Content-Disposition: attachment; filename="orders.csv"');
echo mb_convert_encoding($csv, 'SJIS-win', 'UTF-8');
