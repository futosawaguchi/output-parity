# Claude の使い方

Claude を信じきらない作りにしたことで、判定や原因探しを Claude に任せられるようになりました。Claude が書いた計算と引用はプログラムが照らし、直ったかどうかもプログラムが決めます。
ここでは、ツールの中で Claude に何を任せ、何を任せなかったかと、開発で Claude Code をどう使ったかを書きます。

## ツールの中の Claude

### 任せたこと

- 違いの見分け：旧と新の出力の違いを、読む人の判断が変わるかどうかで「無害・要確認・壊れている」に分け、根拠を示します。判定のプロンプトには帳票ごとのルール（「合計欄を探して明細の和と比べよ」など）を書かず、差分だけでなく新しい出力の全文を渡します。そのため、同じ形の差分でも、合計が合う見積書と合わない見積書を分けられます（理由は [design.md](design.md)、プロンプトは [lib/judge/prompt.ts](../lib/judge/prompt.ts)）。根拠には出力のどこを見れば確かめられるか（見る場所）も必ず書かせます。人が数秒で確かめられるようにするためです（[lib/judge/schema.ts](../lib/judge/schema.ts)）
- 原因と直し方：ソースを読み、原因のファイルと行、直し方を示します。渡す道具はファイルの一覧・読む・探すの3つだけです（SDK の Tool Runner で回します。[lib/fix/locate-cause.ts](../lib/fix/locate-cause.ts)）

判定と原因探しには Claude Opus 5.5 を使います。安全のための判定で断られたときは、Anthropic が勧めるモデルで答え直す設定にしていて、答えたモデルを記録に残します。

### 任せなかったこと

- 直ったかどうかの判断：直し方をコピー（`work/`）に当て、新の側を全部の入力で流し直して、当てる前の旧の出力と比べます。差が消えたかどうかはプログラムが決め、ほかの入力の差が増えたり中身が変わったりしたら「直りました」にしません。Claude はこの段では呼びません（[lib/fix/verify.ts](../lib/fix/verify.ts)）
- 元のソースを書き換えること：Claude の直し方を当てるのはコピーだけです。本番のコードに入れるのは人です。保存したパッチを、ふだんコードを変えるときと同じ流れ（ブランチを切ってコミットし、レビューを通すなど）で当てます

### 信じきらないための仕組み

- 判定の計算と引用は機械が確かめます。Claude が根拠に書いた足し算・引き算の式をプログラムが計算し直し、引用した文が出力に本当にあるかを照らします。合わなければ「無害」を「要確認」に上げます。掛け算・割り算を含む式は確かめず、確かめなかったことを画面に出します（[lib/judge/arithmetic.ts](../lib/judge/arithmetic.ts)）
- 原因探しの答えも機械が確かめます。Claude が指した行が実在して引用どおりのコードか、書き換える前の文がソースにちょうど1か所あるかを照らします（[lib/fix/check-cause.ts](../lib/fix/check-cause.ts)）
- Claude に聞いて答えが返らなかった差は「要確認」にします。Claude の返事に含まれなかった差も、API の呼び出しに失敗した入力も、一覧から落とさず「要確認」として出し、「無害」にはしません。Claude に送らなかった差（送らない設定のときなど）は「未判定」と出し、移してよい側には数えません
- ぶれを測りました。Opus 5.5 は temperature を指定できないので、開発の途中で、見積書2件と架空書店7件の判定を、同じ出力のまま5回ずつ判定し直しました。9件とも、5回とも同じ判定でした（測るスクリプトは [scripts/measure-stability.ts](../scripts/measure-stability.ts)。測った結果はリポジトリに入れていません）
- 送ったものは残します。何を送るか（何も送らない／出力だけ／出力とソース）は、使う人が設定で選びます。送る前に鍵らしい値を伏せ、送った全文を画面で読めるようにしました

## 開発での Claude Code

開発の中心は Claude Code でした。

### 進め方

- 作る前に、チャットで案をいくつかとおすすめを出してもらい、どれにするかは私が決めました。決めてから作ってもらいます
- 画面の変更は、動いている画面やスクリーンショットを実際に見ながら決めました
- 設計、決めたこと、つまずいたことを、メモのファイル（このリポジトリには公開していません）に残しました。会話が長くなって前の内容が要約されても、決めたことをやり直さずに引き継げるようにするためです

使ってみて、やり方が3つ変わりました。

### 自分では見つけられない穴が見つかった

経緯を知らない別の Claude（サブエージェント [blank-reviewer](../.claude/agents/blank-reviewer.md)）に、こちらの結論を渡さずにコードを審査させました。

審査は何度か繰り返し、見つかったものを直しました。直したものは、判定が黙って間違う・止まる不具合が8つ、壊れているのに「無害」や「直りました」と言う抜け道が17です。どちらも見つかった順に並べます。

判定が黙って間違う・止まる不具合（8つ）

- 直ったかどうかを、当てる前ではなく書き換えたあとの旧の出力と比べていた（[c48a922](https://github.com/futosawaguchi/output-parity/commit/c48a922)）
- 検算が掛け算の式を「合わない」と誤り、崩れた根拠でも「無害」のまま残っていた（[d03b28d](https://github.com/futosawaguchi/output-parity/commit/d03b28d)）
- 毎回変わる値を行ごと除いていて、同じ行の金額の変化まで消えていた（[bd483cd](https://github.com/futosawaguchi/output-parity/commit/bd483cd)）
- PDF の画像が消えても、文字が同じなら「差なし」になっていた（[8f90407](https://github.com/futosawaguchi/output-parity/commit/8f90407)）
- Claude の返事が途中で切れるなどして読み取れないと、実行全体が止まり、ほかの入力の結果も残らなかった（[1535bc8](https://github.com/futosawaguchi/output-parity/commit/1535bc8)）
- 一部のページが読めない PDF があると、実行全体が止まった（[1ca5b2b](https://github.com/futosawaguchi/output-parity/commit/1ca5b2b)）
- 直し方を確かめるコピーで、シンボリックリンクが消えていた（[ffab97e](https://github.com/futosawaguchi/output-parity/commit/ffab97e)）
- Shift_JIS で書かれたソースに直し方を当てると、日本語が壊れていた（[c0e8032](https://github.com/futosawaguchi/output-parity/commit/c0e8032)）

壊れているのに「無害」や「直りました」と言う抜け道（17）

- プログラムの終わり方（終了コードや HTTP の状態）が変わっても、出力の文字が同じなら「無害」になっていた（[0b4fd83](https://github.com/futosawaguchi/output-parity/commit/0b4fd83)）
- 文字コードで読めない部分があっても「無害」になっていた（同じコミット）
- 新の2回で行の対応が取れないとき、行全体を毎回変わる値として除き、合計の変化まで消えていた（[7da88c0](https://github.com/futosawaguchi/output-parity/commit/7da88c0)）
- 直し方を当てたあと、ほかの入力の差の中身が変わっても、行数が同じなら「直りました」になっていた（[4a59f63](https://github.com/futosawaguchi/output-parity/commit/4a59f63)）
- CSV のように日時・番号・金額がカンマだけでつながった行では、毎回変わる日時と一緒に金額の変化まで除き、「無害」になっていた（[43af82a](https://github.com/futosawaguchi/output-parity/commit/43af82a)）
- 終わり方の違いや読めない文字があっても、差が残っていて Claude が「無害」と答えると、そのまま「無害」になっていた（[47d2a16](https://github.com/futosawaguchi/output-parity/commit/47d2a16)）
- テキストの出力で、改行コード・先頭の BOM・最後の改行が変わっても「差なし」になっていた（[045c5ee](https://github.com/futosawaguchi/output-parity/commit/045c5ee)）
- HTML の alt の無い画像が消えても、PDF の文字が一部だけ左へはみ出しても「差なし」になっていた（[c5c44b6](https://github.com/futosawaguchi/output-parity/commit/c5c44b6)）
- HTML の select で、選べる選択肢が消えても「差なし」になっていた（[5a6f165](https://github.com/futosawaguchi/output-parity/commit/5a6f165)）
- PDF のフォームの欄に書かれた値を比べていなかった（[fa2da87](https://github.com/futosawaguchi/output-parity/commit/fa2da87)）
- 区切りの無い固定長の行で、毎回変わる日時のうしろの金額の変化まで除いていた（[f0ac850](https://github.com/futosawaguchi/output-parity/commit/f0ac850)）
- 鍵らしい値を伏せたあと旧と新が同じに見え、Claude が違いを見ないまま「無害」と答えられた（[d9c63f9](https://github.com/futosawaguchi/output-parity/commit/d9c63f9)）
- 表のセルの中の画像の alt を比べていなかった（[20f1055](https://github.com/futosawaguchi/output-parity/commit/20f1055)）
- Web 型で、ページがファイルの保存に変わっても（Content-Type や Content-Disposition の違い）「差なし」になっていた（[c86e34a](https://github.com/futosawaguchi/output-parity/commit/c86e34a)）
- 全角の数字で書かれた金額や、毎回変わる日時と同じひと続きの文字の中にある金額の変化まで除いていた（[836480e](https://github.com/futosawaguchi/output-parity/commit/836480e)）
- PDF の前に PHP の警告が混ざって、ほかのソフトで開けなくなっても「差なし」になっていた（[7738200](https://github.com/futosawaguchi/output-parity/commit/7738200)）
- 直し方を当てたあと、ほかの入力で合計の行が消えても「変わっていません」と出ていた（[fd975dc](https://github.com/futosawaguchi/output-parity/commit/fd975dc)）

ほかに、旧と新が同じフォルダで動くので、旧が書いたキャッシュを新が読むと違いが見えなくなる、という指摘がありました。キャッシュするシステムは、このツールの対象外として [guide/safety.md](../guide/safety.md) に書きました。

いちばん驚いたのは、抜け道の最初の4つです。どれも自分で読み返しても気づかなかった所でした。審査を繰り返すごとに、見つかる所は、判定の芯から、出力の形式の細部、そして動かす環境の側へと移っていきました。1つを除いて、直したものにはテストも足しています。

### 大きく変えるのが怖くなくなった

大きく変えるたびに手で確かめていたら、1回に30分かかり、開発が止まりました。確かめる手順をスキル（[regression-check](../.claude/skills/regression-check/SKILL.md)）にまとめてスクリプトで流すようにし、約6分になりました。

変えるたびに全部を確かめられるので、画面の作り直しのような大きな変更も、怖がらずにできました。スキルの手順で毎回全部を確かめたことで、検算が式の中の鉤括弧に入れた名前の数字まで計算に読んでいた誤り（[c627225](https://github.com/futosawaguchi/output-parity/commit/c627225)）も見つけられました。

### 1人で進められる範囲が広がった

いちばん大きかったのは、並行して進められたことです。

- 自分がデモ動画の素材を録画している間に、Claude Code には別の作業場所（git worktree）で次の機能を作ってもらいました
- 時間のかかる確かめ（約6分）は裏で流し、その間に次の作業へ進みました
- コードの審査は経緯を知らない別の Claude に任せました

もう1つは、Claude Code で動画まで作れると知ったことです。デモ動画のツールの画面は、Claude Code が書いたスクリプトが、画面を出さない Chrome を動かして録画しました。切り出し、早送り、テロップ、AI 音声のナレーション、BGM をつなぐ編集も、スクリプトで組みました。「シーン3を2秒詰める」のように言葉で頼んで直せます。動画の編集をここまで任せられることも、実際の画面の録画まで任せられることも、作る前は知りませんでした（動画を作ったスクリプトは、このリポジトリには入れていません）。

6日で、題材4つ、出力の形式3つ（PDF・テキスト・HTML）、つなぎ方3つ（コマンド・ファイル・Web）、CI、審査用の公開環境まで作れました。コミットは 200 を超え、テストは 286 件です。

### そのほかに使った機能

- フック：コミットの前に、Anthropic の API キーの先頭に付く文字列を探して止めます（[.claude/hooks/no-key-in-commit.mjs](../.claude/hooks/no-key-in-commit.mjs)）。Claude Code がうっかり鍵をコミットしないための安全網で、回り道（`.gitignore` 済みのファイルを強制的に足すなど）までは止められません。CI でも、リポジトリにこの文字列が無いかを毎回調べています
- MCP（Claude in Chrome）：画面の不具合を、直す前に実際のブラウザで再現しました（PDF がときどき表示されない不具合など）
- スキル（[try-your-system](../.claude/skills/try-your-system/SKILL.md)）：使う人が自分のシステムを試すときに、Claude Code と一緒に設定ファイルを書くためのスキルです。経緯を知らない Claude にこのスキルだけを渡し、初めて見る架空のプログラムで、設定を書いて1回で流せることを確かめました。そのとき迷った所はスキルと guide に直しました

## 使わなかったもの：Managed Agents

エージェントのループと作業環境を Anthropic 側で用意する Managed Agents は、使いませんでした。理由は次のとおりです。

- ループが要るのは原因探しだけです。判定は1件につき1回の呼び出しで済み、原因探しのループは SDK の Tool Runner でローカル環境で回せます
- 外に出るものは出る前に全部通したいと考えました。原因探しの道具はローカル環境で動き、Claude が読んだ内容は鍵を伏せる処理と送った全文の記録を通ってから Claude に渡ります。Managed Agents では、先にソースをクラウドの作業環境に置くことになります
- 比べたい環境は使う人のローカル環境にあります。旧と新の実行環境、試す用の DB、帳票のテンプレートです
- Claude には実行も書き込みもさせません。直し方を当てて流し直すのはツールのコードです。作業環境でコマンドを実行したりファイルを書き換えたりする強みを使う場面がありません
- 使う人の準備を増やしたくありませんでした。いまは API キー1つで動きます

試す環境を決まった時刻に流して比べ続けるような使い方なら、検討の余地があると考えています。
