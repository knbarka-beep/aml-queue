export default function Footer() {
  return (
    <footer>
      <span>Built with Claude Code by Knut Barka</span>
      <span>All data is fictional: Lysbro Pay ApS (fictional) and its customers are invented.</span>
      {/* Plain link: a full page load avoids the RSC prefetch file that a static export does not serve. */}
      <a href="/how-it-works/">How this works</a>
    </footer>
  );
}
