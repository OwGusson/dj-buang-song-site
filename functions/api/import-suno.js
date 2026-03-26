function decodeHtml(value = "") {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractMeta(html, key) {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${key}["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+name=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${key}["'][^>]*>`, "i"),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtml(match[1]);
  }

  return "";
}

function extractTitleTag(html) {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match?.[1] ? decodeHtml(match[1].trim()) : "";
}

function cleanTitle(title = "") {
  return title
    .replace(/\s*\|\s*Suno.*$/i, "")
    .replace(/\s*-\s*Suno.*$/i, "")
    .trim();
}

function tryExtractScriptJsonBlocks(html) {
  const blocks = [];
  const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match;
  while ((match = regex.exec(html)) !== null) {
    const parsed = safeJsonParse(match[1]);
    if (parsed) blocks.push(parsed);
  }

  return blocks;
}

function findDeepValue(obj, wantedKeys) {
  if (!obj || typeof obj !== "object") return "";

  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findDeepValue(item, wantedKeys);
      if (found) return found;
    }
    return "";
  }

  for (const [key, value] of Object.entries(obj)) {
    if (
      wantedKeys.some((wanted) => key.toLowerCase() === wanted.toLowerCase()) &&
      typeof value === "string" &&
      value.trim()
    ) {
      return value.trim();
    }
  }

  for (const value of Object.values(obj)) {
    const found = findDeepValue(value, wantedKeys);
    if (found) return found;
  }

  return "";
}

function collectDeepValues(obj, wantedKeys, results = []) {
  if (!obj || typeof obj !== "object") return results;

  if (Array.isArray(obj)) {
    for (const item of obj) collectDeepValues(item, wantedKeys, results);
    return results;
  }

  for (const [key, value] of Object.entries(obj)) {
    if (
      wantedKeys.some((wanted) => key.toLowerCase() === wanted.toLowerCase()) &&
      typeof value === "string" &&
      value.trim()
    ) {
      results.push(value.trim());
    }

    if (value && typeof value === "object") {
      collectDeepValues(value, wantedKeys, results);
    }
  }

  return results;
}

function tryExtractImageFromJson(html) {
  const blocks = tryExtractScriptJsonBlocks(html);

  for (const block of blocks) {
    const image =
      findDeepValue(block, ["image", "imageUrl", "image_url", "coverUrl", "cover_url"]) || "";
    if (image && /^https?:\/\//i.test(image)) return image;
  }

  const urlRegexes = [
    /"imageUrl"\s*:\s*"([^"]+)"/i,
    /"image_url"\s*:\s*"([^"]+)"/i,
    /"coverUrl"\s*:\s*"([^"]+)"/i,
    /"cover_url"\s*:\s*"([^"]+)"/i,
    /"og:image"\s*content=["']([^"']+)["']/i,
  ];

  for (const regex of urlRegexes) {
    const match = html.match(regex);
    if (match?.[1]) {
      const url = decodeHtml(match[1]).replace(/\\\//g, "/");
      if (/^https?:\/\//i.test(url)) return url;
    }
  }

  return "";
}

function normalizeLyricsText(text = "") {
  return decodeHtml(
    text
      .replace(/\\n/g, "\n")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\")
      .replace(/\\u003c/g, "<")
      .replace(/\\u003e/g, ">")
      .replace(/\\u0026/g, "&")
  ).trim();
}

function tryExtractLyrics(html) {
  const directPatterns = [
    /"lyrics"\s*:\s*"([^"]+)"/i,
    /"prompt"\s*:\s*"([^"]+)"/i,
    /"displayLyrics"\s*:\s*"([^"]+)"/i,
    /"description"\s*:\s*"([^"]{40,})"/i,
  ];

  for (const pattern of directPatterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      const text = normalizeLyricsText(match[1]);
      if (text.length >= 20) return text;
    }
  }

  const blocks = tryExtractScriptJsonBlocks(html);

  for (const block of blocks) {
    const candidates = collectDeepValues(block, [
      "lyrics",
      "prompt",
      "description",
      "text",
      "caption",
    ]);

    const best = candidates
      .map(normalizeLyricsText)
      .filter((value) => value.length >= 20)
      .sort((a, b) => b.length - a.length)[0];

    if (best) return best;
  }

  return "";
}

function tryExtractAudioUrl(html) {
  const patterns = [
    /"audioUrl"\s*:\s*"([^"]+)"/i,
    /"audio_url"\s*:\s*"([^"]+)"/i,
    /"song_path"\s*:\s*"([^"]+)"/i,
    /"clip_path"\s*:\s*"([^"]+)"/i,
    /<audio[^>]+src=["']([^"']+)["']/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      const url = decodeHtml(match[1]).replace(/\\\//g, "/");
      if (/^https?:\/\//i.test(url)) return url;
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
        Accept: "text/html,application/xhtml+xml",
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

    const title = cleanTitle(ogTitle || twitterTitle || titleTag || "Imported from Suno");
    const coverUrl = ogImage || twitterImage || tryExtractImageFromJson(html) || "";
    const lyrics = tryExtractLyrics(html);
    const audioUrl = tryExtractAudioUrl(html);

    return new Response(
      JSON.stringify({
        success: true,
        imported: {
          title,
          artist: "DJ-Buang",
          genre: "",
          coverUrl,
          audioUrl,
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