<?php
// 注文の読み出しと金額の計算

require_once __DIR__ . '/db.php';

const FREE_SHIPPING_FROM = 3000;
const SHIPPING_FEE = 500;

function all_orders()
{
    return db()->query('SELECT * FROM orders ORDER BY id')->fetchAll();
}

function find_order($id)
{
    $st = db()->prepare('SELECT * FROM orders WHERE id = ?');
    $st->execute(array($id));
    return $st->fetch();
}

function order_items($orderId)
{
    $st = db()->prepare(
        'SELECT books.title, books.price, books.stock, items.qty
           FROM items JOIN books ON books.id = items.book_id
          WHERE items.order_id = ? ORDER BY items.id'
    );
    $st->execute(array($orderId));
    return $st->fetchAll();
}

// 開いた回数を数える
function count_view($orderId)
{
    db()->prepare('UPDATE orders SET views = views + 1 WHERE id = ?')->execute(array($orderId));
}

function record_payment($orderId, $date)
{
    db()->prepare('UPDATE orders SET paid_on = ? WHERE id = ?')->execute(array($date, $orderId));
}

// 小計・割引・送料・合計・冊数
function order_totals($order, $items)
{
    $subtotal = 0;
    $books = 0;
    foreach ($items as $item) {
        $subtotal += $item['price'] * $item['qty'];
        $books += $item['qty'];
    }
    $discount = 0;
    if ($order['coupon_rate'] !== null) {
        $discount = (int) floor($subtotal * $order['coupon_rate'] / 100);
    }
    $shipping = ($subtotal - $discount >= FREE_SHIPPING_FROM) ? 0 : SHIPPING_FEE;
    return array(
        'subtotal' => $subtotal,
        'discount' => $discount,
        'shipping' => $shipping,
        'total' => $subtotal - $discount + $shipping,
        'books' => $books,
    );
}

function stock_label($stock)
{
    if ($stock === '0') {
        return '在庫切れ（お取り寄せ 1〜2週間）';
    }
    if ($stock < 3) {
        return '残りわずか';
    }
    return '在庫あり';
}
