import Markdown, { type UrlTransform } from "react-markdown";

const BIO_ELEMENTS = [
  "p", "br", "strong", "em", "ul", "ol", "li", "blockquote", "code", "pre",
  "h1", "h2", "h3", "h4", "h5", "h6", "hr", "a", "img"
];

const safeProfileUrl: UrlTransform = (value, key) => {
  // On-chain bios have no application-relative URL base. Only allow explicit
  // web URLs (and email links), with no credentials or control characters.
  if (/[\u0000-\u001f\u007f]/.test(value)) return undefined;

  try {
    const url = new URL(value);
    const allowedProtocols = key === "src" ? ["https:", "http:"] : ["https:", "http:", "mailto:"];
    if (!allowedProtocols.includes(url.protocol) || url.username || url.password) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
};

export function ProfileBio({ bio }: { bio: string }) {
  return (
    <div className="profile-bio mt-2">
      <Markdown
        skipHtml
        allowedElements={BIO_ELEMENTS}
        urlTransform={safeProfileUrl}
        components={{
          a: ({ href, children, title }) => href ? (
            <a href={href} title={title} target="_blank" rel="noopener noreferrer">{children}</a>
          ) : <span>{children}</span>,
          img: ({ src, alt, title }) => src ? (
            <img src={src} alt={alt} title={title} loading="lazy" referrerPolicy="no-referrer" />
          ) : <span>{alt}</span>
        }}
      >
        {bio}
      </Markdown>
    </div>
  );
}
