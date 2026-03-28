// songs.js

export const STORAGE_KEYS = {
  songs: "djbuang_songs",
};

export function getStoredSongs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.songs);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function setStoredSongs(songs) {
  localStorage.setItem(STORAGE_KEYS.songs, JSON.stringify(songs));
}

export function makeSongId() {
  return `song-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isCloudflareFileUrl(url = "") {
  if (!url) return false;
  return (
    url.includes("dj-buang.com/files/") ||
    url.includes("/files/")
  );
}

export function extractFilePathFromUrl(url = "") {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return parsed.pathname || "";
  } catch {
    return "";
  }
}

export async function uploadFile(file) {
  if (!file) return "";

  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch("/api/upload", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    throw new Error("Upload failed");
  }

  const data = await res.json();
  return data?.url || "";
}

export async function deleteStorageFileByUrl(url) {
  if (!url || !isCloudflareFileUrl(url)) return;

  try {
    await fetch("/api/delete-file", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url }),
    });
  } catch (error) {
    console.error("Failed to delete file:", url, error);
  }
}

export async function autoCleanReplacedFiles({
  oldSong,
  newCoverUrl,
  newAudioUrl,
}) {
  const deleteJobs = [];

  if (
    oldSong?.coverUrl &&
    newCoverUrl &&
    oldSong.coverUrl !== newCoverUrl &&
    isCloudflareFileUrl(oldSong.coverUrl)
  ) {
    deleteJobs.push(deleteStorageFileByUrl(oldSong.coverUrl));
  }

  if (
    oldSong?.audioUrl &&
    newAudioUrl &&
    oldSong.audioUrl !== newAudioUrl &&
    isCloudflareFileUrl(oldSong.audioUrl)
  ) {
    deleteJobs.push(deleteStorageFileByUrl(oldSong.audioUrl));
  }

  await Promise.allSettled(deleteJobs);
}

export async function autoCleanDeletedSongFiles(song) {
  const deleteJobs = [];

  if (song?.coverUrl && isCloudflareFileUrl(song.coverUrl)) {
    deleteJobs.push(deleteStorageFileByUrl(song.coverUrl));
  }

  if (song?.audioUrl && isCloudflareFileUrl(song.audioUrl)) {
    deleteJobs.push(deleteStorageFileByUrl(song.audioUrl));
  }

  await Promise.allSettled(deleteJobs);
}