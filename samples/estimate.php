<?php
// 見積書を PDF で出力する
// 使い方: php estimate.php <lib-dir> <data.json> <out.pdf>

if ($argc !== 4) {
    fwrite(STDERR, "usage: php estimate.php <lib-dir> <data.json> <out.pdf>\n");
    exit(2);
}
list(, $libDir, $dataPath, $outPath) = $argv;

require $libDir . '/vendor/autoload.php';

$estimate = json_decode(file_get_contents($dataPath), true);

// 削除されていない明細だけ表示する
$visible = array();
foreach ($estimate['rows'] as $r) {
    if ($r['deleted'] == 0) {
        $visible[] = $r;
    }
}

$pdf = new TCPDF('P', 'mm', 'A4', true, 'UTF-8', false);
$pdf->setPrintHeader(false);
$pdf->setPrintFooter(false);
$pdf->AddPage();

$pdf->SetFont('kozminproregular', '', 20);
$pdf->Cell(0, 14, '見積書', 0, 1, 'C');

$pdf->SetFont('kozminproregular', '', 11);
$pdf->Cell(0, 7, '見積番号: ' . $estimate['number'], 0, 1, 'R');
$pdf->Cell(0, 7, '発行日: ' . $estimate['issued'], 0, 1, 'R');
$pdf->Ln(4);
$pdf->Cell(0, 8, '件名: ' . $estimate['subject'], 0, 1);
$pdf->Ln(4);

$pdf->Cell(30, 8, 'コード', 1, 0, 'C');
$pdf->Cell(100, 8, '品名', 1, 0, 'C');
$pdf->Cell(50, 8, '金額（円）', 1, 1, 'C');
foreach ($visible as $r) {
    $pdf->Cell(30, 8, $r['code'], 1, 0);
    $pdf->Cell(100, 8, $r['name'], 1, 0);
    $pdf->Cell(50, 8, number_format($r['amount']), 1, 1, 'R');
}
$pdf->Cell(130, 8, '合計', 1, 0, 'R');
$pdf->Cell(50, 8, number_format($estimate['total']), 1, 1, 'R');

$pdf->Output($outPath, 'F');
