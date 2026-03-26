function extractMeta(html, key) {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${key}["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+name=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${key}["'][^>]*>`, "i"),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return decodeHtml(match[1]);
    }
  }

  return "";
}

function extractTitleTag(html) {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match?.[1] ? decodeHtml(match[1].trim()) : "";
}

function decodeHtml(value = "") {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function cleanTitle(title = "") {
  return title
    .replace(/\s*\|\s*Suno.*$/i, "")
    .replace(/\s*-\s*Suno.*$/i, "")
    .trim();
}

function tryExtractLyrics(html) {
  const patterns = [
    /"lyrics"\s*:\s*"([^"]+)"/i,
    /"prompt"\s*:\s*"([^"]+)"/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return decodeHtml(
        match[1]
          .replace(/\\n/g, "\n")
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, "\\")
      ).trim();
    }
  }

  return "";
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const url = String(body?.url || "").trim();

    if (!url) {
      return new Response(JSON.stringify({ error: "Missing Suno URL" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid URL" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!parsedUrl.hostname.includes("suno.com")) {
      return new Response(JSON.stringify({ error: "URL must be from suno.com" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const response = await fetch(parsedUrl.toString(), {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: `Could not fetch Suno page (${response.status})` }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const html = await response.text();

    const ogTitle = extractMeta(html, "og:title");
    const twitterTitle = extractMeta(html, "twitter:title");
    const ogImage = extractMeta(html, "og:image");
    const twitterImage = extractMeta(html, "twitter:image");
    const description = extractMeta(html, "description");
    const titleTag = extractTitleTag(html);
    const lyrics = tryExtractLyrics(html);

    const title = cleanTitle(ogTitle || twitterTitle || titleTag || "Imported from Suno");
    const coverUrl = ogImage || twitterImage || "";
    const genre = "";
    const artist = "DJ-Buang";

    return new Response(
      JSON.stringify({
        success: true,
        imported: {
          title,
          artist,
          genre,
          coverUrl,
          audioUrl: "",
          lyrics,
          description,
          sourceUrl: parsedUrl.toString(),
        },
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || "Failed to import Suno URL" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}