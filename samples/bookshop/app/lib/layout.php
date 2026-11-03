<?php
// 画面の上と下

date_default_timezone_set('Asia/Tokyo');

function h($s)
{
    return htmlspecialchars($s);
}

function yen($n)
{
    return number_format($n) . ' 円';
}

function page_header($title)
{
    echo '<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8">';
    echo '<title>' . h($title) . ' - 架空書店 注文管理</title></head><body>';
    echo '<header><p>架空書店 注文管理</p><nav><a href="/">注文の一覧</a></nav></header>';
    echo '<main><h1>' . h($title) . '</h1>';
}

function page_footer()
{
    echo '</main><footer><p>表示 ' . date('Y-m-d H:i:s') . '</p></footer></body></html>';
}
