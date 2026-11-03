import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "かわりめ",
  description: "バージョンの変わり目で、見落とさない。上げる前と後の出力を比べ、違いを読む人の判断が変わるかで分ける",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
