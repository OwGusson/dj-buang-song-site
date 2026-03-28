const SONGS_FILE_KEY = "data/songs.json";

async function loadSongs(env) {
  const object = await env.FILES.get(SONGS_FILE_KEY);

  if (!object) return [];

  const text = await object.text();
  return JSON.parse(text || "[]");
}

async function saveSongs(env, songs) {
  await env.FILES.put(
    SONGS_FILE_KEY,
    JSON.stringify(songs, null, 2),
    {
      httpMetadata: {
        contentType: "application/json",
      },
    }
  );
}

export async function onRequestGet(context) {
  try {
    const songs = await loadSongs(context.env);

    return new Response(JSON.stringify(songs), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500 }
    );
  }
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();

    if (!body?.id) {
      return new Response(
        JSON.stringify({ error: "Song id required" }),
        { status: 400 }
      );
    }

    const songs = await loadSongs(context.env);

    const index = songs.findIndex((s) => s.id === body.id);

    if (index >= 0) {
      songs[index] = {
        ...songs[index],
        ...body,
      };
    } else {
      songs.unshift(body);
    }

    await saveSongs(context.env, songs);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500 }
    );
  }
}

export async function onRequestDelete(context) {
  try {
    const url = new URL(context.request.url);
    const songId = url.searchParams.get("id");

    if (!songId) {
      return new Response(
        JSON.stringify({ error: "Song id required" }),
        { status: 400 }
      );
    }

    const songs = await loadSongs(context.env);

    const filtered = songs.filter((s) => s.id !== songId);

    await saveSongs(context.env, filtered);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500 }
    );
  }
}