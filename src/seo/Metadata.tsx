import { useEffect } from "react";
import { SITE_ORIGIN, type PageMetadata } from "./page";

export function jsonForHtml(value: unknown): string {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (character) =>
    `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

export function structuredData(metadata: PageMetadata) {
  return { "@context": "https://schema.org", "@graph": [
    { "@type": "WebSite", "@id": `${SITE_ORIGIN}/#website`, name: "Lite-Dipper", url: SITE_ORIGIN },
    { "@type": "WebPage", "@id": metadata.canonical, url: metadata.canonical,
      name: metadata.title, description: metadata.description, isPartOf: { "@id": `${SITE_ORIGIN}/#website` } }
  ] };
}

export function MetadataTags({ metadata }: { metadata: PageMetadata }) {
  return <>
    <title>{metadata.title}</title>
    <meta name="description" content={metadata.description} />
    <meta name="robots" content={metadata.noindex ? "noindex, follow" : "index, follow"} />
    <link rel="canonical" href={metadata.canonical} />
    <link rel="describedby" href={`${SITE_ORIGIN}/llms.txt`} type="text/plain" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Lite-Dipper" />
    <meta property="og:title" content={metadata.title} />
    <meta property="og:description" content={metadata.description} />
    <meta property="og:url" content={metadata.canonical} />
    <meta property="og:image" content={metadata.image} />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={metadata.title} />
    <meta name="twitter:description" content={metadata.description} />
    <meta name="twitter:image" content={metadata.image} />
    <script id="page-structured-data" type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonForHtml(structuredData(metadata)) }} />
  </>;
}

export function useDocumentMetadata(metadata: PageMetadata) {
  const { title, description, canonical, image, noindex } = metadata;
  useEffect(() => {
    document.title = title;
    const setMeta = (attribute: "name" | "property", key: string, content: string) => {
      let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
      if (!element) { element = document.createElement("meta"); element.setAttribute(attribute, key); document.head.appendChild(element); }
      element.content = content;
    };
    setMeta("name", "description", description);
    setMeta("name", "robots", noindex ? "noindex, follow" : "index, follow");
    for (const [key, value] of Object.entries({ type: "website", site_name: "Lite-Dipper", title, description, url: canonical, image })) {
      setMeta("property", `og:${key}`, value);
    }
    for (const [key, value] of Object.entries({ card: "summary_large_image", title, description, image })) setMeta("name", `twitter:${key}`, value);
    let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) { link = document.createElement("link"); link.rel = "canonical"; document.head.appendChild(link); }
    link.href = canonical;
    let script = document.getElementById("page-structured-data");
    if (!script) { script = document.createElement("script"); script.id = "page-structured-data"; script.setAttribute("type", "application/ld+json"); document.head.appendChild(script); }
    script.textContent = jsonForHtml(structuredData(metadata));
  }, [title, description, canonical, image, noindex]);
}
