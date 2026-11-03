import { redirect } from "next/navigation";

// The tool itself is the first page; README explains what it is.
export default function Home() {
  redirect("/check");
}
