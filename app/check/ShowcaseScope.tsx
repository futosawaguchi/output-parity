import styles from "./showcase.module.css";

const SETUP = "https://github.com/futosawaguchi/output-parity/blob/main/guide/setup.md";

/**
 * What the public showcase can and cannot do, and why (DESIGN 7-2 revised). The same words on the
 * sign-in page and on top of the tool, so a judge reads them before and while trying. Two boxes
 * side by side, one under the other on a narrow screen.
 */
export function ShowcaseScope() {
  return (
    <div className={styles.scope}>
      <section className={styles.box}>
        <h2 className={styles.boxTitle}>ここでできること（Claude を実際に呼べます）</h2>
        <ul className={styles.list}>
          <li>架空書店・見積書・作業日報の結果を見る（判定と根拠、PDF や画面の左右の比較、Claude に送った全文）</li>
          <li>「同梱の出力を Claude に判定し直させる」</li>
          <li>壊れている入力の詳細で「原因を探す」</li>
        </ul>
      </section>
      <section className={`${styles.box} ${styles.cannot}`}>
        <h2 className={styles.boxTitle}>ここでできないこと</h2>
        <ul className={styles.list}>
          <li>
            <b>「実行して判定する」と「当てて確かめる」</b>
            <br />
            理由: この公開環境には、旧と新の実行環境（PHP 7.4・8.5、Python 3.10・3.12）を入れていないため。当てて確かめた結果は、開発者のローカル環境で実行した記録で見られます
          </li>
          <li>
            <b>題材「TCPDF 65本」</b>
            <br />
            理由: 実行した結果を同梱していないため。ローカル環境でだけ動きます
          </li>
        </ul>
        <p className={styles.boxNote}>
          全部を動かす手順は <a href={SETUP}>guide/setup.md</a> にあります。
        </p>
      </section>
    </div>
  );
}
