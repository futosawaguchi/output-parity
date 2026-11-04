import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "かわりめ",
  description: "バージョンの変わり目で、見落とさない。バージョンを上げる前と後の出力を比べ、見るべき違いだけを選び出すツール",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
