import { renderToString, renderToStaticMarkup } from "react-dom/server.browser";
import { StaticRouter } from "react-router-dom";
import { AppRouter } from "../src/app/router";
import { PageDataProvider } from "../src/seo/PageData";
import { MetadataTags, jsonForHtml } from "../src/seo/Metadata";
import { pageMetadata, resolvePage, SITE_ORIGIN, type PageSnapshot } from "../src/seo/page";
import { WalletContext, type WalletContextValue } from "../src/wallet/context";

const unavailable = async (): Promise<never> => { throw new Error("Wallet actions are only available in the browser."); };
const disconnectedWallet: WalletContextValue = {
  connection: null, ledgerSelection: null, connecting: false, error: null,
  connectKeplr: unavailable, connectLedger: unavailable, connectLedgerAddress: unavailable,
  nextLedgerAccount: unavailable, previousLedgerAccount: unavailable, nextLedgerPage: unavailable,
  previousLedgerPage: unavailable, cancelLedgerSelection: unavailable, disconnect: () => {},
  sendDsm: unavailable, delegate: unavailable, undelegate: unavailable, redelegate: unavailable,
  withdrawRewards: unavailable, withdrawAllRewards: unavailable, voteOnProposal: unavailable, transferToOsmosis: unavailable
};

export async function renderDocument(request: Request, assets: Fetcher, snapshot: PageSnapshot): Promise<Response> {
  const templateResponse = await assets.fetch(new Request(new URL("/index.html", request.url)));
  if (!templateResponse.ok) return new Response("Application assets unavailable.", { status: 503 });
  const metadata = pageMetadata(resolvePage(snapshot.path), snapshot.resources, snapshot.status);
  const body = renderToString(
    <PageDataProvider snapshot={snapshot}>
      <WalletContext.Provider value={disconnectedWallet}>
        <StaticRouter location={snapshot.path}><AppRouter /></StaticRouter>
      </WalletContext.Provider>
    </PageDataProvider>
  );
  // Only React-escaped markup and script-safe JSON enter the trusted build template.
  const html = (await templateResponse.text())
    .replace(/<!--seo-head-->[\s\S]*?<!--\/seo-head-->/, () => renderToStaticMarkup(<MetadataTags metadata={metadata} />))
    .replace('<div id="root"></div>', () => `<div id="root">${body}</div>`)
    .replace("</body>", () => `<script id="page-data" type="application/json">${jsonForHtml(snapshot)}</script></body>`);
  const status = snapshot.status ?? 200;
  const headers = new Headers({
    "content-type": "text/html; charset=utf-8",
    "cache-control": status >= 500 || resolvePage(snapshot.path).kind === "wallet" ? "no-store" : "public, max-age=0, s-maxage=30",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "content-security-policy": "script-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'; frame-ancestors 'none'",
    "link": `<${SITE_ORIGIN}/llms.txt>; rel="describedby"; type="text/plain"`
  });
  if (metadata.noindex || new URL(request.url).origin !== SITE_ORIGIN) headers.set("x-robots-tag", "noindex, follow");
  if (status >= 500) headers.set("retry-after", "60");
  return new Response(request.method === "HEAD" ? null : html, { status, headers });
}

export function renderSitemap(paths: Array<{ path: string; modified?: string }>): string {
  const escape = (value: string) => value.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]!));
  const unique = [...new Map(paths.map((entry) => [entry.path, entry])).values()];
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    unique.map(({ path, modified }) => `<url><loc>${escape(SITE_ORIGIN + path)}</loc>${modified && Number.isFinite(Date.parse(modified)) ? `<lastmod>${new Date(modified).toISOString()}</lastmod>` : ""}</url>`).join("\n") + "\n</urlset>\n";
}
