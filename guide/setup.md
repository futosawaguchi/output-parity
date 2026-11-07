# 全部動かす

旧と新のプログラムを実際に動かし、比べて、判定するまでの手順です。同梱の結果を見るだけなら、[README の「ローカル環境」](../README.md#ローカル環境)の手順で足ります。

## 要るもの

- Node.js 22.13 以上
- 比べたい旧と新の実行環境。同梱の題材では、見積書・架空書店・TCPDF の例が PHP 7.4 と 8.5、作業日報が Python 3.10 と 3.12 です
- composer（見積書と TCPDF の例で使う PDF ライブラリを取ってくるため）
- Claude に判定させるなら、Anthropic の API キー

## 手順

1. [README の「ローカル環境」](../README.md#ローカル環境)の手順で、取ってきて起動できるようにします
2. 同梱の設定（`samples/*/parity.config.jsonc`）の `run.environments` には、開発者の Mac での実行ファイルの場所（`/opt/homebrew/...` など）が書いてあります。自分の PC での PHP・Python のフルパスに書き換えてください（`which php` などで分かります）
3. PDF ライブラリを composer で取ってきます。無いと、実行の前に「実行に要るものがありません」と止まります
   ```sh
   composer install -d samples/estimate/app/lib-old   # TCPDF 6.2.26
   composer install -d samples/estimate/app/lib-new   # TCPDF 6.3.0
   composer install -d samples/tcpdf-examples/app     # TCPDF 6.3.0 の公式の例 65 本（題材「TCPDF 65本」）
   ```
4. API キーを `.env` に入れます（[README の「ローカル環境」](../README.md#ローカル環境)の3）
5. 画面の「実行して判定する」を押します。コマンドからも同じ流れを動かせます
   ```sh
   npm run samples                                # 実行と比較だけ（Claude を呼ばない）
   npm run samples -- --judge                     # 判定まで（Claude を呼ぶ）
   npm run samples -- --subject tcpdf-examples    # TCPDF の公式の例 65 本
   npm run samples -- --subject worklog           # 作業日報（Python 3.10 → 3.12・CSV・Shift_JIS）
   npm run samples -- --subject bookshop          # 架空書店の注文管理（Web アプリ・PHP の内蔵サーバ・SQLite）
   ```

## バージョンについて

PHP 7.4・8.5 と Python 3.10・3.12 は、同梱の題材を作ったときのものです。設定の `command`（フルパス）と `label`（画面に出す名前）を変えれば、ほかのバージョンでも動きます。

同梱の題材の壊れ方が出るのは、新の側が次のバージョン以上で、旧の側がそれより前のときです。

| 題材 | 壊れ方が出る新の側 |
|---|---|
| 見積書 | PHP 8.0 以上 |
| 架空書店の注文管理 | PHP 8.1 以上 |
| 作業日報 | Python 3.11 以上 |

確かめた環境は [README の「使った技術と動かすのに要るもの」](../README.md#使った技術と動かすのに要るもの)にあります。

## 壊れていないかの確かめ方（開発する人向け）

```sh
npm run check          # テスト・型・lint と、題材を Claude なしで流して期待値と照らす（約1分）
npm run check:screen   # 組み立てた画面を Google Chrome で動かして確かめる（約1分）
npm run check:all      # 上の全部と、Claude を呼ぶ往復・PHP が無いとき・TCPDF・clone した状態（約5分。Claude を6回ほど呼ぶ）
```
