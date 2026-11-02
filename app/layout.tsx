import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "output-parity",
  description: "移行の前後で出力が同じかを確かめ、違いの意味を判定する",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
