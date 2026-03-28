function getFileKeyFromUrl(fileUrl) {
  if (!fileUrl || typeof fileUrl !== "string") return null;

  try {
    const url = new URL(fileUrl);

    const marker = "/files/";
    const index = url.pathname.indexOf(marker);

    if (index === -1) return null;

    const key = url.pathname.slice(index + marker.length);
    return decodeURIComponent(key);
  } catch {
    return null;
  }
}

export async function onRequestGet(context) {
  try {
    const object = await context.env.FILES.get("data/songs.json");

    if (!object) {
      return new Response(JSON.stringify([]), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const text = await object.text();
    const songs = text ? JSON.parse(text) : [];

    return new Response(JSON.stringify(songs), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || "Failed to load songs" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

export async function onRequestPost(context) {
  try {
    const newSong = await context.request.json();

    const object = await context.env.FILES.get("data/songs.json");
    let songs = [];

    if (object) {
      const text = await object.text();
      songs = text ? JSON.parse(text) : [];
    }

    songs.unshift(newSong);

    await context.env.FILES.put(
      "data/songs.json",
      JSON.stringify(songs, null, 2),
      {
        httpMetadata: {
          contentType: "application/json",
        },
      }
    );

    return new Response(JSON.stringify({ success: true, songs }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || "Failed to save song" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

export async function onRequestDelete(context) {
  try {
    const url = new URL(context.request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return new Response(JSON.stringify({ error: "Missing song id" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const object = await context.env.FILES.get("data/songs.json");
    let songs = [];

    if (object) {
      const text = await object.text();
      songs = text ? JSON.parse(text) : [];
    }

    const songToDelete = songs.find((song) => song.id === id);

    if (!songToDelete) {
      return new Response(JSON.stringify({ error: "Song not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const coverKey = getFileKeyFromUrl(songToDelete.coverUrl);
    const audioKey = getFileKeyFromUrl(songToDelete.audioUrl);

    if (coverKey) {
      await context.env.FILES.delete(coverKey);
    }

    if (audioKey) {
      await context.env.FILES.delete(audioKey);
    }

    const updatedSongs = songs.filter((song) => song.id !== id);

    await context.env.FILES.put(
      "data/songs.json",
      JSON.stringify(updatedSongs, null, 2),
      {
        httpMetadata: {
          contentType: "application/json",
        },
      }
    );

    return new Response(
      JSON.stringify({
        success: true,
        deletedSongId: id,
        deletedFiles: {
          coverKey,
          audioKey,
        },
        songs: updatedSongs,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || "Failed to delete song" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}