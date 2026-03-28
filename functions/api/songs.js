export async function onRequestGet(context) {
  try {
    const { env } = context;

    const existing = await env.DJBUANG_DATA.get("songs");
    const songs = existing ? JSON.parse(existing) : [];

    return new Response(JSON.stringify(songs), {
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || "Failed to load songs" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json();

    if (!body?.id) {
      return new Response(JSON.stringify({ error: "Song id is required" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    const existing = await env.DJBUANG_DATA.get("songs");
    const songs = existing ? JSON.parse(existing) : [];

    const index = songs.findIndex((song) => song.id === body.id);

    if (index >= 0) {
      songs[index] = {
        ...songs[index],
        ...body,
      };
    } else {
      songs.unshift(body);
    }

    await env.DJBUANG_DATA.put("songs", JSON.stringify(songs));

    return new Response(
      JSON.stringify({
        success: true,
        updated: index >= 0,
        song: body,
      }),
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || "Failed to save song" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}

export async function onRequestDelete(context) {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    const songId = url.searchParams.get("id");

    if (!songId) {
      return new Response(JSON.stringify({ error: "Song id is required" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    const existing = await env.DJBUANG_DATA.get("songs");
    const songs = existing ? JSON.parse(existing) : [];

    const filtered = songs.filter((song) => song.id !== songId);

    await env.DJBUANG_DATA.put("songs", JSON.stringify(filtered));

    return new Response(
      JSON.stringify({
        success: true,
      }),
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || "Failed to delete song" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}