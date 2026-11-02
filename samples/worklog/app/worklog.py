# 作業日報を集計して CSV で出す。取り込む側の表計算ソフトに合わせて Shift_JIS・CRLF で書く。
import json
import sys
from datetime import datetime


def main(path):
    with open(path, encoding="utf-8") as f:
        log = json.load(f)

    rows = []
    for entry in log["entries"]:
        try:
            day = datetime.fromisoformat(entry["date"])
        except ValueError:
            continue  # 日付が読めない行は飛ばす
        rows.append((day.date(), entry))

    out = sys.stdout
    out.write(f"作業日報 {log['team']},出力 {datetime.now():%Y-%m-%d %H:%M:%S}\n")
    out.write("日付,担当,作業,時間\n")
    for day, e in sorted(rows, key=lambda r: r[0]):
        out.write(f"{day:%Y-%m-%d},{e['who']},{e['task']},{e['hours']}\n")
    out.write(f"合計,,,{sum(e['hours'] for _, e in rows)}\n")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="shift_jis", newline="\r\n")
    main(sys.argv[1])
