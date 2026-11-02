import Link from "next/link";

// The landing page comes later (PROGRESS 6.5). For now it only leads to the tool.
export default function Home() {
  return (
    <main style={{ padding: "40px 32px" }}>
      <h1>output-parity</h1>
      <p>
        <Link href="/check">比較の画面へ</Link>
      </p>
    </main>
  );
}
