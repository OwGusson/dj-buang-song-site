export function makeSongId() {
  return `song-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isCloudflareFileUrl(url = "") {
  return url.includes("/files/");
}

async function deleteStorageFileByUrl(url) {
  if (!url || !isCloudflareFileUrl(url)) return;

  try {
    await fetch("/api/upload", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url }),
    });
  } catch (err) {
    console.error("Failed deleting storage file:", err);
  }
}

export async function autoCleanReplacedFiles({
  oldSong,
  newCoverUrl,
  newAudioUrl,
}) {
  const jobs = [];

  if (
    oldSong?.coverUrl &&
    newCoverUrl &&
    oldSong.coverUrl !== newCoverUrl
  ) {
    jobs.push(deleteStorageFileByUrl(oldSong.coverUrl));
  }

  if (
    oldSong?.audioUrl &&
    newAudioUrl &&
    oldSong.audioUrl !== newAudioUrl
  ) {
    jobs.push(deleteStorageFileByUrl(oldSong.audioUrl));
  }

  await Promise.allSettled(jobs);
}

export async function autoCleanDeletedSongFiles(song) {
  const jobs = [];

  if (song?.coverUrl) {
    jobs.push(deleteStorageFileByUrl(song.coverUrl));
  }

  if (song?.audioUrl) {
    jobs.push(deleteStorageFileByUrl(song.audioUrl));
  }

  await Promise.allSettled(jobs);
}