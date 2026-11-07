# 設定ファイル

自分のシステムを試すときは、題材ごとに `parity.config.jsonc` を1枚書きます。Claude Code のスキルと一緒に書くこともできます（[README の「自分のシステムで使う」](../README.md#自分のシステムで使う)）。

- 置き場所は `targets/<名前>/parity.config.jsonc` です。`targets/` は `.gitignore` 済みなので、社内のパスや名前を書いても公開されません
- `<名前>` は英小文字・数字・`-` だけで書き、先頭は英小文字か数字にします。ほかの文字を使うと、画面の題材の並びに出ません
- 形式は JSON にコメント（`//` と `/* */`）と末尾のカンマを足したものです
- パスはこの設定ファイルからの相対で書きます（絶対パスでも書けます）
- 例は `samples/estimate/parity.config.jsonc` です。一番近いサンプルを写して直すのが早いです

## キー

| キー | 必須 | 意味 |
|---|---|---|
| `version` | ○ | `1` |
| `name` / `description` | name は ○ | 画面に出す題材の名前と説明 |
| `shortName` | | 画面の一番上の題材の並びに出す短い名前（無ければ `name`） |
| `source` | ○ | プログラムのソース。実行のたびに `work/<名前>/` に写し、そこで動かします（元のソースは書き換えません） |
| `fixes` | | `apply`（既定。直し方を `work/` に当てて確かめる）か `suggest-only`（写さずにその場で動かし、何も書かない。直し方は示すだけ） |
| `workspace.link` | | `work/` に写さずリンクするフォルダ名（既定 `vendor`・`node_modules`） |
| `claude.send` | ○ | Claude に送る範囲。既定はありません（[安全と Claude に送るもの](safety.md#claude-に送るもの)） |
| `claude.neverRead` | | 原因探しで読ませないパス（`.gitignore` と同じ書き方） |
| `run.type` | ○ | `command`（ツールが旧と新のプログラムを動かす）・`files`（出力がもうファイルである。下の「ファイル型」）・`web`（ツールが旧と新のサーバを立てて画面を開く。下の「Web 型」） |
| `run.cwd` | | command と web のとき。動かす場所（source の中。既定 `.`） |
| `run.timeoutMs` | | command と web のとき。打ち切るまでの時間（ミリ秒。既定 30000。web では1回の問い合わせ） |
| `run.needs` | | command と web のとき。動かす前にあるはずのもの（source からの相対。例 `["lib-old/vendor"]`）。無ければ実行せず、依存の取り方を出します |
| `run.parallel` | | command のとき。同時に動かす入力の数（既定 1・最大 16）。古いプログラムは一時ファイルや DB を共有していることがあるので、互いに干渉しないと分かっているときだけ増やします |
| `run.environments.old` / `.new` | ○ | command と web のとき。`label`（画面に出す名前）・`command`（フルパス）・`args`（全入力の前に付ける引数。web ではサーバの起動の引数で、`{port}` を含める）・`env`（その側だけの環境変数） |
| `output.format` | ○ | `pdf`・`text`（ログ・CSV・標準出力など）・`html`（画面に見える文字とフォームの値） |
| `output.from` | ○ | `file`（プログラムが `{output}` に書く）か `stdout`。web では要りません。ファイル型では使いませんが、`file` と書きます |
| `output.encoding` | | テキストと HTML の文字コード（既定 `utf-8`。`shift_jis`・`euc-jp` など）。HTML が `<meta charset>` で宣言していれば、そちらを使います |
| `cases[]` | ※ | 入力。`id`・`label`・`description`・`args`。`args` の `{output}` は出力ファイルのパスに置き換わります。web では `args` の代わりに `request`（開くページ） |
| `caseGroups[]` | ※ | 入力のまとめ書き。`each.file`（例 `"example_*.php"`）に当てはまる `run.cwd` 直下のファイルごとに、入力を1つ作ります。`{file}` はファイル名、`{name}` は拡張子を除いた名前に置き換わります。`each.range`（例 `[1, 30]`）なら番号ごとに作り、`{n}` が番号になります |
| `cases[].output` / `caseGroups[].output` | | その入力だけ形式と文字コードを変える（`format`・`encoding`）。Web アプリの画面（html）の中に CSV の書き出し（text）がある、など |

※ `cases` と `caseGroups` のどちらかに、入力が1つ以上要ります（ファイル型では、書かなければフォルダのファイルが全部入力になります）。

## ファイル型（出力がもうファイルであるとき）

旧の環境の出力が残っていて、新の環境の出力も作れるなら、プログラムをツールから動かさずに比べられます。

```jsonc
"source": "app",  // ソースの場所（必須）。原因探しで読みます
"run": {
  "type": "files",
  "old": { "label": "PHP 5.5（残っていた出力）", "dir": "outputs/old" },
  "new": { "label": "PHP 8.5", "dir": "outputs/new" },
  "baseline": { "dir": "outputs/new2" }  // 任意。新の環境でもう一度出した出力（毎回変わる値を見分ける）
},
"output": { "format": "pdf", "from": "file" }
```

- 同じ入力の出力はそれぞれのフォルダに同じ名前で置きます。片方にしか無いファイルは「出力なし」として結果に出ます
- 見るのはフォルダの直下のファイルだけです
- 比べたファイルは実行の記録（`runs/`）に写して残します
- `caseGroups` は使えません。`cases` を書かなければ、フォルダのファイルが全部入力になります
- プログラムを動かさないので、「当てて確かめる」は使えません（理由つきで止まります）。原因探しは `source` のソースを読んで使えます

## Web 型（ツールがサーバを立てて画面を開く）

ブラウザで開く業務アプリは、ツールが旧と新のサーバをローカル環境に立て、同じページを開いて比べます。例は `samples/bookshop/parity.config.jsonc` です。

```jsonc
"run": {
  "type": "web",
  "environments": {
    "old": { "label": "PHP 7.4", "command": "/path/to/php7.4", "args": ["-S", "127.0.0.1:{port}", "-t", "public"] },
    "new": { "label": "PHP 8.5", "command": "/path/to/php8.5", "args": ["-S", "127.0.0.1:{port}", "-t", "public"] }
  },
  "database": { "file": "data/shop.sqlite" }  // 任意。問い合わせのたびに、この原本から写しへ戻す
},
"output": { "format": "html" },
"cases": [
  { "id": "list", "label": "注文の一覧", "request": { "path": "/" } },
  // CSV を返すページは、この入力だけテキスト（Shift_JIS）として読む
  { "id": "export", "label": "注文の書き出し", "request": { "path": "/export.php" }, "output": { "format": "text", "encoding": "shift_jis" } }
],
"caseGroups": [{ "each": { "range": [1, 30] }, "id": "order-{n}", "label": "注文 {n}", "request": { "path": "/order.php?id={n}" } }]
```

- 問い合わせるのは、ツールが立てたサーバ（`127.0.0.1`）だけです。設定に書けるのはパスだけで、URL やホスト名は書けません。ポートはツールが空いているものを選び、`{port}` に入れます
- リダイレクトは追いません（状態と行き先を結果として残します）。500 番台は「出力なし」として扱い、サーバの記録（エラーの行）を根拠に出します
- `request` は `method`（`GET` か `POST`）・`path`・`form`（POST のときの値）です
- `database` を書くと、問い合わせのたびに原本の DB を `work/` の写しへ戻します。画面を開くと DB に書くアプリでも、前の問い合わせの影響が残りません。SQLite のようなファイルの DB だけです。MySQL などは試す用のものを自分で用意してください。原本は書き換えないので、`fixes: "suggest-only"` とは一緒に使えません
- ログインはしません。ログインが要る画面は、試す環境だけでログインを外してください（環境変数で切り替えるなど。`env` で渡せます）
- 画面は「画面で見る」で左右に描きます。描くときは、スクリプト・外への読み込み（画像・CSS・通信）・フォームの送信をすべて止めます。外の CSS で見た目を作っているアプリは、飾りのない画面になります

## 書くときの注意

- `id`・`label`・`description` は画面に出て、Claude にも渡ります。期待する判定が分かる名前にしないでください
- 設定ファイルと同梱の結果は、`source` の外に置きます（原因探しで Claude に答えを読ませないため）
- PHP の CLI は警告を標準出力に混ぜます。PDF を標準出力に書くプログラムでは、PDF の先頭に警告が入って開けなくなります。`args` に `["-d", "display_errors=0"]` を足してください（例は `samples/tcpdf-examples/parity.config.jsonc`）
- 最初は `claude.send` を `none` にして、何も送らずに比べるところから始められます

## 書いたら動かす

画面を開き直すと、上の題材の並びに出ます（`/check?subject=<名前>` でも開けます）。コマンドなら `npm run samples -- --subject <名前>` です。
