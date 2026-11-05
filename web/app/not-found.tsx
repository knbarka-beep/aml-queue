import Link from "next/link";
import Footer from "@/components/Footer";

export default function NotFound() {
  return (
    <main className="page">
      <h1>Page not found</h1>
      <p>This page does not exist on the AML alert queue for Lysbro Pay ApS (fictional).</p>
      <p><Link href="/">Back to the alert queue</Link></p>
      <Footer />
    </main>
  );
}
