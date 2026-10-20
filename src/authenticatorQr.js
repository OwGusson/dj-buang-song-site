// The Auth SDK prefixes raw SVG with a data URI without escaping its contents.
// Encode the SVG so '#' colors and other URI characters cannot truncate the image.
export function authenticatorQrDataUrl(value) {
  if (!value) return "";
  let svg = value;
  if (value.startsWith("data:image/svg+xml")) {
    const comma = value.indexOf(",");
    if (comma < 0) return "";
    if (value.slice(0, comma).includes(";base64")) return value;
    svg = value.slice(comma + 1);
    try { svg = decodeURIComponent(svg); } catch { /* Raw SVG can contain percent signs. */ }
  }
  if (!svg.trimStart().startsWith("<svg") && !svg.trimStart().startsWith("<?xml")) return "";
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
