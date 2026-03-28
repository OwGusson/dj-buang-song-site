import React, { useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEYS = {
  songs: "djbuang_songs",
  requests: "djbuang_requests",
  admin: "djbuang_admin_logged_in",
};

const PAYPAL_URL =
  "https://www.paypal.com/donate/?hosted_button_id=DWL7PTXG7BQ9A";

const DEFAULT_SONGS = [];

function getStored(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function setStored(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function makeSongId() {
  return `song-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatTime(value) {
  if (!Number.isFinite(value)) return "0:00";
  const mins = Math.floor(value / 60);
  const secs = Math.floor(value % 60)
    .toString()
    .padStart(2, "0");
  return `${mins}:${secs}`;
}

function sortSongs(list) {
  return [...list].sort((a, b) => {
    if (!!a.featured !== !!b.featured) return a.featured ? -1 : 1;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
}

export default function App() {
  const audioRef = useRef(null);
  const lyricsRef = useRef(null);

  const [songs, setSongs] = useState(() =>
    getStored(STORAGE_KEYS.songs, DEFAULT_SONGS)
  );
  const [requests, setRequests] = useState(() =>
    getStored(STORAGE_KEYS.requests, [])
  );
  const [adminLoggedIn, setAdminLoggedIn] = useState(() =>
    getStored(STORAGE_KEYS.admin, false)
  );

  const [currentSongId, setCurrentSongId] = useState(
    getStored(STORAGE_KEYS.songs, DEFAULT_SONGS)[0]?.id || null
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExpandedPlayer, setIsExpandedPlayer] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);

  const [requestForm, setRequestForm] = useState({
    name: "",
    email: "",
    songTitle: "",
    artist: "",
    message: "",
  });

  const [songForm, setSongForm] = useState({
    id: null,
    title: "",
    artist: "",
    genre: "",
    requestedBy: "",
    coverUrl: "",
    audioUrl: "",
    lyrics: "",
    featured: false,
  });

  const [requestReviewItem, setRequestReviewItem] = useState(null);

  useEffect(() => {
    setStored(STORAGE_KEYS.songs, songs);
  }, [songs]);

  useEffect(() => {
    setStored(STORAGE_KEYS.requests, requests);
  }, [requests]);

  useEffect(() => {
    setStored(STORAGE_KEYS.admin, adminLoggedIn);
  }, [adminLoggedIn]);

  const sortedSongs = useMemo(() => sortSongs(songs), [songs]);

  const currentSong = useMemo(() => {
    return songs.find((song) => song.id === currentSongId) || sortedSongs[0] || null;
  }, [songs, currentSongId, sortedSongs]);

  useEffect(() => {
    if (!currentSong && sortedSongs[0]) {
      setCurrentSongId(sortedSongs[0].id);
    }
  }, [currentSong, sortedSongs]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentSong?.audioUrl) return;

    const wasPlaying = !audio.paused;
    const previousTime = audio.currentTime || 0;

    audio.src = currentSong.audioUrl;
    audio.load();

    const restorePlayback = async () => {
      try {
        audio.currentTime = 0;
      } catch {
        // ignore
      }

      if (wasPlaying || isPlaying) {
        try {
          await audio.play();
          setIsPlaying(true);
        } catch {
          setIsPlaying(false);
        }
      } else {
        setIsPlaying(false);
      }

      if (previousTime > 0 && currentSong.id === currentSongId) {
        try {
          audio.currentTime = previousTime;
        } catch {
          // ignore
        }
      }
    };

    restorePlayback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSongId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoadedMetadata = () => {
      setDuration(audio.duration || 0);
    };

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime || 0);
    };

    const onEnded = () => {
      handleNext();
    };

    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
    };
  }, [sortedSongs]);

  useEffect(() => {
    const wrap = lyricsRef.current;
    if (!wrap) return;

    const active = wrap.querySelector(".lyrics-line.active");
    if (active) {
      active.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentTime, currentSongId]);

  const handlePlayPause = async () => {
    const audio = audioRef.current;
    if (!audio || !currentSong?.audioUrl) return;

    if (audio.paused) {
      try {
        await audio.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
      }
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  };

  const handleSeek = (value) => {
    const audio = audioRef.current;
    if (!audio) return;
    const nextTime = Number(value);
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  const handlePrev = async () => {
    if (!sortedSongs.length || !currentSong) return;
    const index = sortedSongs.findIndex((song) => song.id === currentSong.id);
    const prevIndex = index <= 0 ? sortedSongs.length - 1 : index - 1;
    const nextSong = sortedSongs[prevIndex];
    setCurrentSongId(nextSong.id);
  };

  const handleNext = async () => {
    if (!sortedSongs.length || !currentSong) return;
    const index = sortedSongs.findIndex((song) => song.id === currentSong.id);
    const nextIndex = index >= sortedSongs.length - 1 ? 0 : index + 1;
    const nextSong = sortedSongs[nextIndex];
    setCurrentSongId(nextSong.id);
  };

  const playSong = async (song) => {
    setCurrentSongId(song.id);
    const audio = audioRef.current;
    if (!audio) return;

    setTimeout(async () => {
      try {
        await audio.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
      }
    }, 0);
  };

  const handleAdminLogin = () => {
    const code = window.prompt("Enter admin password");
    if (code === "djbuang") {
      setAdminLoggedIn(true);
    } else if (code !== null) {
      window.alert("Wrong password.");
    }
  };

  const handleSaveSong = (e) => {
    e.preventDefault();

    if (!songForm.title.trim() || !songForm.artist.trim() || !songForm.audioUrl.trim()) {
      window.alert("Title, artist and audio URL are required.");
      return;
    }

    if (songForm.id) {
      setSongs((prev) =>
        prev.map((song) =>
          song.id === songForm.id
            ? {
                ...song,
                ...songForm,
              }
            : song
        )
      );
    } else {
      const newSong = {
        ...songForm,
        id: makeSongId(),
        createdAt: Date.now(),
      };
      setSongs((prev) => [newSong, ...prev]);
      if (!currentSongId) setCurrentSongId(newSong.id);
    }

    setSongForm({
      id: null,
      title: "",
      artist: "",
      genre: "",
      requestedBy: "",
      coverUrl: "",
      audioUrl: "",
      lyrics: "",
      featured: false,
    });
  };

  const handleEditSong = (song) => {
    setSongForm({
      id: song.id,
      title: song.title || "",
      artist: song.artist || "",
      genre: song.genre || "",
      requestedBy: song.requestedBy || "",
      coverUrl: song.coverUrl || "",
      audioUrl: song.audioUrl || "",
      lyrics: song.lyrics || "",
      featured: !!song.featured,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDeleteSong = (songId) => {
    const confirmed = window.confirm("Delete this song?");
    if (!confirmed) return;

    setSongs((prev) => prev.filter((song) => song.id !== songId));

    if (currentSongId === songId) {
      const nextSong = sortSongs(songs.filter((song) => song.id !== songId))[0] || null;
      setCurrentSongId(nextSong?.id || null);
      setIsPlaying(false);
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.removeAttribute("src");
      }
    }
  };

  const handleToggleFeatured = (songId) => {
    setSongs((prev) =>
      prev.map((song) =>
        song.id === songId ? { ...song, featured: !song.featured } : song
      )
    );
  };

  const handleSubmitRequest = (e) => {
    e.preventDefault();

    if (
      !requestForm.name.trim() ||
      !requestForm.email.trim() ||
      !requestForm.songTitle.trim()
    ) {
      window.alert("Please fill name, email and song title.");
      return;
    }

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestForm.email.trim());
    if (!emailOk) {
      window.alert("This is not a valid email address.");
      return;
    }

    const item = {
      id: `request-${Date.now()}`,
      ...requestForm,
      createdAt: Date.now(),
      status: "new",
    };

    setRequests((prev) => [item, ...prev]);
    setRequestForm({
      name: "",
      email: "",
      songTitle: "",
      artist: "",
      message: "",
    });
    window.alert("Song request sent.");
  };

  const handleUpdateRequestStatus = (id, status) => {
    setRequests((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status } : item))
    );
    if (requestReviewItem?.id === id) {
      setRequestReviewItem((prev) => (prev ? { ...prev, status } : prev));
    }
  };

  const renderLyrics = () => {
    if (!currentSong?.lyrics?.trim()) {
      return <div className="lyrics-empty">No lyrics added yet.</div>;
    }

    const lines = currentSong.lyrics.split("\n");
    return lines.map((line, index) => {
      const clean = line.trim();
      const activeIndex =
        duration > 0 ? Math.floor((currentTime / duration) * lines.length) : -1;

      return (
        <div
          key={`${index}-${clean}`}
          className={`lyrics-line ${index === activeIndex ? "active" : ""}`}
        >
          {clean || "\u00A0"}
        </div>
      );
    });
  };

  return (
    <div className="app-shell">
      <style>{`
        * { box-sizing: border-box; }
        html, body, #root { margin: 0; padding: 0; min-height: 100%; }
        body {
          background: #0b0b11;
          color: #fff;
          font-family: Inter, Arial, sans-serif;
        }

        .app-shell {
          min-height: 100vh;
          background:
            radial-gradient(circle at top, rgba(120, 68, 255, 0.22), transparent 35%),
            linear-gradient(180deg, #11111a 0%, #0a0a10 100%);
          padding-bottom: 110px;
        }

        .container {
          width: min(1200px, calc(100% - 24px));
          margin: 0 auto;
        }

        .hero {
          padding: 26px 0 16px;
        }

        .hero-card {
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
          backdrop-filter: blur(8px);
          border-radius: 24px;
          padding: 24px;
          box-shadow: 0 18px 60px rgba(0,0,0,0.35);
        }

        .hero h1 {
          margin: 0 0 10px;
          font-size: clamp(28px, 4vw, 52px);
          line-height: 1.02;
        }

        .hero p {
          margin: 0 0 18px;
          color: rgba(255,255,255,0.78);
          max-width: 800px;
          line-height: 1.6;
        }

        .hero-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
        }

        .btn, button {
          border: 0;
          border-radius: 999px;
          padding: 11px 16px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
        }

        .btn-primary {
          background: linear-gradient(135deg, #8d5bff, #5f7cff);
          color: white;
        }

        .btn-secondary {
          background: rgba(255,255,255,0.08);
          color: white;
          border: 1px solid rgba(255,255,255,0.12);
        }

        .section-grid {
          display: grid;
          grid-template-columns: 1.5fr 1fr;
          gap: 18px;
          margin-top: 18px;
        }

        .panel {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 22px;
          padding: 18px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        }

        .panel h2 {
          margin: 0 0 14px;
          font-size: 20px;
        }

        .song-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }

        .song-card {
          background: rgba(255,255,255,0.045);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 20px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .song-cover {
          width: 100%;
          aspect-ratio: 1 / 1;
          object-fit: cover;
          background: rgba(255,255,255,0.08);
        }

        .song-body {
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .song-topline {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 10px;
        }

        .song-title {
          font-size: 18px;
          font-weight: 800;
          line-height: 1.2;
        }

        .song-artist {
          color: rgba(255,255,255,0.72);
          font-size: 14px;
        }

        .song-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .pill {
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.08);
          padding: 6px 10px;
          border-radius: 999px;
          font-size: 12px;
          color: rgba(255,255,255,0.82);
        }

        .pill.featured {
          background: rgba(255, 215, 0, 0.12);
          border-color: rgba(255, 215, 0, 0.25);
        }

        .song-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 6px;
        }

        .form-stack {
          display: grid;
          gap: 10px;
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        input, textarea {
          width: 100%;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.06);
          color: white;
          border-radius: 16px;
          padding: 12px 14px;
          font: inherit;
          outline: none;
        }

        textarea {
          resize: vertical;
          min-height: 110px;
        }

        .checkbox-row {
          display: flex;
          align-items: center;
          gap: 10px;
          color: rgba(255,255,255,0.85);
        }

        .checkbox-row input {
          width: 18px;
          height: 18px;
        }

        .admin-topbar {
          position: sticky;
          top: 10px;
          z-index: 10;
          display: flex;
          justify-content: flex-end;
          padding: 12px;
        }

        .admin-login-btn {
          background: rgba(255,255,255,0.1);
          color: #fff;
          border: 1px solid rgba(255,255,255,0.12);
          backdrop-filter: blur(8px);
        }

        .admin-panel {
          margin-top: 18px;
        }

        .admin-song-list,
        .request-list {
          display: grid;
          gap: 12px;
          margin-top: 14px;
        }

        .admin-item,
        .request-item {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 18px;
          padding: 14px;
        }

        .admin-item-head,
        .request-item-head {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          align-items: flex-start;
          margin-bottom: 10px;
        }

        .admin-item-actions,
        .request-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .status {
          padding: 6px 10px;
          border-radius: 999px;
          font-size: 12px;
          border: 1px solid rgba(255,255,255,0.08);
          text-transform: capitalize;
        }

        .status.new { background: rgba(100, 149, 237, 0.14); }
        .status.reviewed { background: rgba(255, 193, 7, 0.14); }
        .status.done { background: rgba(40, 167, 69, 0.14); }

        .mini-player {
          position: fixed;
          left: 12px;
          right: 12px;
          bottom: 12px;
          z-index: 50;
          background: rgba(15,15,22,0.95);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 22px;
          box-shadow: 0 18px 60px rgba(0,0,0,0.45);
          overflow: hidden;
          backdrop-filter: blur(12px);
        }

        .mini-player-inner {
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 12px;
          align-items: center;
          padding: 12px;
        }

        .mini-cover {
          width: 54px;
          height: 54px;
          border-radius: 14px;
          object-fit: cover;
          background: rgba(255,255,255,0.08);
        }

        .mini-meta {
          min-width: 0;
        }

        .mini-title {
          font-weight: 800;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .mini-artist {
          font-size: 13px;
          color: rgba(255,255,255,0.68);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .mini-controls {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .icon-btn {
          width: 42px;
          height: 42px;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: rgba(255,255,255,0.08);
          color: white;
          font-size: 16px;
        }

        .icon-btn.play-main {
          background: linear-gradient(135deg, #8d5bff, #5f7cff);
          font-size: 17px;
        }

        .mini-bottom {
          padding: 0 12px 12px;
        }

        .range {
          width: 100%;
          appearance: none;
          height: 6px;
          border-radius: 999px;
          background: rgba(255,255,255,0.12);
          outline: none;
        }

        .range::-webkit-slider-thumb {
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: white;
          cursor: pointer;
        }

        .player-overlay {
          position: fixed;
          inset: 0;
          z-index: 60;
          background: rgba(7, 7, 12, 0.96);
          backdrop-filter: blur(18px);
          overflow: auto;
        }

        .player-expanded-wrap {
          width: min(1200px, calc(100% - 24px));
          margin: 16px auto;
          min-height: calc(100vh - 32px);
          display: flex;
          flex-direction: column;
        }

        .player-expanded-card {
          flex: 1;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 28px;
          padding: 18px;
          display: grid;
          grid-template-columns: 420px 1fr;
          gap: 22px;
        }

        .player-left {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .player-right {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .player-close-row {
          display: flex;
          justify-content: flex-end;
        }

        .player-cover {
          width: 100%;
          max-width: 420px;
          aspect-ratio: 1 / 1;
          object-fit: cover;
          border-radius: 24px;
          background: rgba(255,255,255,0.08);
        }

        .player-title {
          font-size: clamp(24px, 3vw, 42px);
          font-weight: 900;
          line-height: 1.05;
        }

        .player-artist {
          color: rgba(255,255,255,0.7);
          font-size: 16px;
        }

        .player-controls-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          flex-wrap: wrap;
          padding: 12px 14px;
          border-radius: 18px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
        }

        .player-main-controls {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .player-volume {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 220px;
          max-width: 280px;
          width: 100%;
        }

        .player-progress-card {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 18px;
          padding: 14px;
        }

        .time-row {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
          color: rgba(255,255,255,0.68);
          margin-top: 8px;
        }

        .lyrics-card {
          flex: 1;
          min-height: 0;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 18px;
          padding: 14px;
          display: flex;
          flex-direction: column;
        }

        .lyrics-title {
          font-size: 14px;
          font-weight: 800;
          margin-bottom: 10px;
          color: rgba(255,255,255,0.9);
        }

        .lyrics-scroll {
          flex: 1;
          overflow: auto;
          min-height: 200px;
          max-height: 58vh;
          padding-right: 8px;
        }

        .lyrics-line {
          padding: 7px 0;
          color: rgba(255,255,255,0.58);
          font-size: 15px;
          line-height: 1.65;
          transition: 0.18s ease;
        }

        .lyrics-line.active {
          color: #fff;
          font-weight: 800;
          transform: scale(1.01);
        }

        .lyrics-empty {
          color: rgba(255,255,255,0.56);
          font-style: italic;
        }

        .modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.72);
          z-index: 80;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
        }

        .modal-card {
          width: min(720px, 100%);
          max-height: min(90vh, 900px);
          overflow: auto;
          background: #14141d;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 24px;
          padding: 20px;
          box-shadow: 0 22px 70px rgba(0,0,0,0.55);
        }

        .modal-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          margin-bottom: 14px;
        }

        .review-grid {
          display: grid;
          gap: 12px;
        }

        .review-box {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 16px;
          padding: 14px;
        }

        .review-label {
          font-size: 12px;
          color: rgba(255,255,255,0.58);
          margin-bottom: 6px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .review-value {
          line-height: 1.6;
          white-space: pre-wrap;
          word-break: break-word;
        }

        @media (max-width: 980px) {
          .section-grid {
            grid-template-columns: 1fr;
          }

          .song-grid {
            grid-template-columns: 1fr;
          }

          .player-expanded-card {
            grid-template-columns: 1fr;
          }

          .player-cover {
            max-width: 320px;
            margin: 0 auto;
          }
        }

        @media (max-width: 700px) {
          .hero-card,
          .panel,
          .player-expanded-card {
            padding: 14px;
          }

          .form-row {
            grid-template-columns: 1fr;
          }

          .mini-player-inner {
            grid-template-columns: auto 1fr auto;
          }

          .player-expanded-wrap {
            width: calc(100% - 16px);
            margin: 8px auto;
            min-height: calc(100vh - 16px);
          }

          .player-expanded-card {
            min-height: calc(100vh - 16px);
            border-radius: 22px;
            gap: 14px;
          }

          .player-left {
            gap: 10px;
          }

          .player-controls-top {
            order: 1;
            flex-direction: column;
            align-items: stretch;
            gap: 12px;
          }

          .player-main-controls {
            justify-content: center;
          }

          .player-volume {
            max-width: none;
            min-width: 0;
          }

          .player-cover {
            order: 2;
            max-width: 220px;
          }

          .player-progress-card {
            order: 3;
          }

          .lyrics-card {
            order: 4;
          }

          .lyrics-scroll {
            max-height: 34vh;
          }

          .player-title {
            font-size: 26px;
            text-align: center;
          }

          .player-artist {
            text-align: center;
          }

          .admin-item-head,
          .request-item-head {
            flex-direction: column;
          }
        }
      `}</style>

      <audio ref={audioRef} preload="metadata" />

      <div className="admin-topbar">
        {!adminLoggedIn ? (
          <button className="admin-login-btn btn" onClick={handleAdminLogin}>
            Admin login
          </button>
        ) : (
          <button
            className="admin-login-btn btn"
            onClick={() => setAdminLoggedIn(false)}
          >
            Logout admin
          </button>
        )}
      </div>

      <div className="container hero">
        <div className="hero-card">
          <h1>DJ-BUANG / OwGusson</h1>
          <p>
            From lobby chat to audio streams and beyond — welcome to the home of
            DJ-BUANG. Songs for the Date In Asia community, fun custom tracks,
            and a little chaos in the best way. Donations are never required,
            but always appreciated and help keep the music tools running.
          </p>

          <div className="hero-actions">
            <a href={PAYPAL_URL} target="_blank" rel="noreferrer">
              <button className="btn btn-primary">Donate</button>
            </a>
            <button
              className="btn btn-secondary"
              onClick={() => setIsExpandedPlayer(true)}
              disabled={!currentSong}
            >
              Open player
            </button>
          </div>
        </div>
      </div>

      <div className="container section-grid">
        <section className="panel">
          <h2>Songs</h2>

          <div className="song-grid">
            {sortedSongs.length === 0 ? (
              <div className="song-card">
                <div className="song-body">
                  <div className="song-title">No songs yet</div>
                  <div className="song-artist">
                    Add songs in the admin panel.
                  </div>
                </div>
              </div>
            ) : (
              sortedSongs.map((song) => (
                <div className="song-card" key={song.id}>
                  {song.coverUrl ? (
                    <img
                      className="song-cover"
                      src={song.coverUrl}
                      alt={`${song.title} cover`}
                    />
                  ) : (
                    <div className="song-cover" />
                  )}

                  <div className="song-body">
                    <div className="song-topline">
                      <div>
                        <div className="song-title">{song.title}</div>
                        <div className="song-artist">{song.artist}</div>
                      </div>

                      {song.featured && <div className="pill featured">Featured</div>}
                    </div>

                    <div className="song-meta">
                      {song.genre ? <div className="pill">{song.genre}</div> : null}
                      {song.requestedBy ? (
                        <div className="pill">Requested by {song.requestedBy}</div>
                      ) : null}
                    </div>

                    <div className="song-actions">
                      <button className="btn btn-primary" onClick={() => playSong(song)}>
                        Play
                      </button>
                      <button
                        className="btn btn-secondary"
                        onClick={() => {
                          setCurrentSongId(song.id);
                          setIsExpandedPlayer(true);
                        }}
                      >
                        View player
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <aside className="panel">
          <h2>Song request</h2>

          <form className="form-stack" onSubmit={handleSubmitRequest}>
            <div className="form-row">
              <input
                placeholder="Your name"
                value={requestForm.name}
                onChange={(e) =>
                  setRequestForm((prev) => ({ ...prev, name: e.target.value }))
                }
              />
              <input
                placeholder="Email"
                value={requestForm.email}
                onChange={(e) =>
                  setRequestForm((prev) => ({ ...prev, email: e.target.value }))
                }
              />
            </div>

            <div className="form-row">
              <input
                placeholder="Song title"
                value={requestForm.songTitle}
                onChange={(e) =>
                  setRequestForm((prev) => ({
                    ...prev,
                    songTitle: e.target.value,
                  }))
                }
              />
              <input
                placeholder="Artist"
                value={requestForm.artist}
                onChange={(e) =>
                  setRequestForm((prev) => ({ ...prev, artist: e.target.value }))
                }
              />
            </div>

            <textarea
              placeholder="Extra details"
              value={requestForm.message}
              onChange={(e) =>
                setRequestForm((prev) => ({ ...prev, message: e.target.value }))
              }
            />

            <button className="btn btn-primary" type="submit">
              Send request
            </button>
          </form>
        </aside>
      </div>

      {adminLoggedIn && (
        <div className="container admin-panel">
          <div className="section-grid">
            <section className="panel">
              <h2>{songForm.id ? "Edit song" : "Add song"}</h2>

              <form className="form-stack" onSubmit={handleSaveSong}>
                <div className="form-row">
                  <input
                    placeholder="Title"
                    value={songForm.title}
                    onChange={(e) =>
                      setSongForm((prev) => ({ ...prev, title: e.target.value }))
                    }
                  />
                  <input
                    placeholder="Artist"
                    value={songForm.artist}
                    onChange={(e) =>
                      setSongForm((prev) => ({ ...prev, artist: e.target.value }))
                    }
                  />
                </div>

                <div className="form-row">
                  <input
                    placeholder="Genre"
                    value={songForm.genre}
                    onChange={(e) =>
                      setSongForm((prev) => ({ ...prev, genre: e.target.value }))
                    }
                  />
                  <input
                    placeholder="Requested by"
                    value={songForm.requestedBy}
                    onChange={(e) =>
                      setSongForm((prev) => ({
                        ...prev,
                        requestedBy: e.target.value,
                      }))
                    }
                  />
                </div>

                <input
                  placeholder="Cover image URL"
                  value={songForm.coverUrl}
                  onChange={(e) =>
                    setSongForm((prev) => ({ ...prev, coverUrl: e.target.value }))
                  }
                />

                <input
                  placeholder="Audio URL"
                  value={songForm.audioUrl}
                  onChange={(e) =>
                    setSongForm((prev) => ({ ...prev, audioUrl: e.target.value }))
                  }
                />

                <textarea
                  placeholder="Lyrics"
                  value={songForm.lyrics}
                  onChange={(e) =>
                    setSongForm((prev) => ({ ...prev, lyrics: e.target.value }))
                  }
                />

                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={songForm.featured}
                    onChange={(e) =>
                      setSongForm((prev) => ({
                        ...prev,
                        featured: e.target.checked,
                      }))
                    }
                  />
                  Featured song
                </label>

                <div className="song-actions">
                  <button className="btn btn-primary" type="submit">
                    {songForm.id ? "Save changes" : "Add song"}
                  </button>

                  {songForm.id ? (
                    <button
                      className="btn btn-secondary"
                      type="button"
                      onClick={() =>
                        setSongForm({
                          id: null,
                          title: "",
                          artist: "",
                          genre: "",
                          requestedBy: "",
                          coverUrl: "",
                          audioUrl: "",
                          lyrics: "",
                          featured: false,
                        })
                      }
                    >
                      Cancel edit
                    </button>
                  ) : null}
                </div>
              </form>

              <div className="admin-song-list">
                {sortedSongs.map((song) => (
                  <div key={song.id} className="admin-item">
                    <div className="admin-item-head">
                      <div>
                        <div className="song-title">{song.title}</div>
                        <div className="song-artist">{song.artist}</div>
                      </div>

                      <div className="admin-item-actions">
                        <button
                          className="btn btn-secondary"
                          type="button"
                          onClick={() => handleToggleFeatured(song.id)}
                        >
                          {song.featured ? "Unfeature" : "Feature"}
                        </button>
                        <button
                          className="btn btn-secondary"
                          type="button"
                          onClick={() => handleEditSong(song)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-secondary"
                          type="button"
                          onClick={() => handleDeleteSong(song.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    <div className="song-meta">
                      {song.genre ? <div className="pill">{song.genre}</div> : null}
                      {song.requestedBy ? (
                        <div className="pill">Requested by {song.requestedBy}</div>
                      ) : null}
                      {song.featured ? (
                        <div className="pill featured">Featured</div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel">
              <h2>Request inbox</h2>

              <div className="request-list">
                {requests.length === 0 ? (
                  <div className="request-item">
                    <div className="song-artist">No requests yet.</div>
                  </div>
                ) : (
                  requests.map((item) => (
                    <div className="request-item" key={item.id}>
                      <div className="request-item-head">
                        <div>
                          <div className="song-title">{item.songTitle}</div>
                          <div className="song-artist">
                            {item.artist || "Unknown artist"} · from {item.name}
                          </div>
                        </div>

                        <div className={`status ${item.status || "new"}`}>
                          {item.status || "new"}
                        </div>
                      </div>

                      <div className="song-meta">
                        <div className="pill">{item.email}</div>
                      </div>

                      <div className="request-actions" style={{ marginTop: 12 }}>
                        <button
                          className="btn btn-secondary"
                          type="button"
                          onClick={() => setRequestReviewItem(item)}
                        >
                          Review request
                        </button>
                        <button
                          className="btn btn-secondary"
                          type="button"
                          onClick={() =>
                            handleUpdateRequestStatus(item.id, "reviewed")
                          }
                        >
                          Mark reviewed
                        </button>
                        <button
                          className="btn btn-secondary"
                          type="button"
                          onClick={() => handleUpdateRequestStatus(item.id, "done")}
                        >
                          Mark done
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      )}

      {currentSong && (
        <div className="mini-player">
          <div className="mini-player-inner">
            {currentSong.coverUrl ? (
              <img
                className="mini-cover"
                src={currentSong.coverUrl}
                alt={`${currentSong.title} cover`}
                onClick={() => setIsExpandedPlayer(true)}
              />
            ) : (
              <div className="mini-cover" onClick={() => setIsExpandedPlayer(true)} />
            )}

            <div className="mini-meta" onClick={() => setIsExpandedPlayer(true)}>
              <div className="mini-title">{currentSong.title}</div>
              <div className="mini-artist">{currentSong.artist}</div>
            </div>

            <div className="mini-controls">
              <button className="icon-btn" onClick={handlePrev} title="Previous">
                ⏮
              </button>
              <button
                className="icon-btn play-main"
                onClick={handlePlayPause}
                title="Play/Pause"
              >
                {isPlaying ? "❚❚" : "▶"}
              </button>
              <button className="icon-btn" onClick={handleNext} title="Next">
                ⏭
              </button>
              <button
                className="icon-btn"
                onClick={() => setIsExpandedPlayer(true)}
                title="Expand"
              >
                ⤢
              </button>
            </div>
          </div>

          <div className="mini-bottom">
            <input
              className="range"
              type="range"
              min="0"
              max={duration || 0}
              value={Math.min(currentTime, duration || 0)}
              onChange={(e) => handleSeek(e.target.value)}
            />
          </div>
        </div>
      )}

      {isExpandedPlayer && currentSong && (
        <div className="player-overlay">
          <div className="player-expanded-wrap">
            <div className="player-expanded-card">
              <div className="player-left">
                <div className="player-close-row">
                  <button
                    className="btn btn-secondary"
                    onClick={() => setIsExpandedPlayer(false)}
                  >
                    Close
                  </button>
                </div>

                <div className="player-title">{currentSong.title}</div>
                <div className="player-artist">{currentSong.artist}</div>

                <div className="player-controls-top">
                  <div className="player-main-controls">
                    <button className="icon-btn" onClick={handlePrev}>
                      ⏮
                    </button>
                    <button className="icon-btn play-main" onClick={handlePlayPause}>
                      {isPlaying ? "❚❚" : "▶"}
                    </button>
                    <button className="icon-btn" onClick={handleNext}>
                      ⏭
                    </button>
                  </div>

                  <div className="player-volume">
                    <span style={{ opacity: 0.75 }}>🔊</span>
                    <input
                      className="range"
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={volume}
                      onChange={(e) => setVolume(Number(e.target.value))}
                    />
                  </div>
                </div>

                {currentSong.coverUrl ? (
                  <img
                    className="player-cover"
                    src={currentSong.coverUrl}
                    alt={`${currentSong.title} cover`}
                  />
                ) : (
                  <div className="player-cover" />
                )}

                <div className="player-progress-card">
                  <input
                    className="range"
                    type="range"
                    min="0"
                    max={duration || 0}
                    value={Math.min(currentTime, duration || 0)}
                    onChange={(e) => handleSeek(e.target.value)}
                  />
                  <div className="time-row">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                </div>
              </div>

              <div className="player-right">
                <div className="lyrics-card">
                  <div className="lyrics-title">Lyrics</div>
                  <div className="lyrics-scroll" ref={lyricsRef}>
                    {renderLyrics()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {requestReviewItem && (
        <div className="modal-backdrop" onClick={() => setRequestReviewItem(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 style={{ margin: 0 }}>Request review</h2>
              <button
                className="btn btn-secondary"
                onClick={() => setRequestReviewItem(null)}
              >
                Close
              </button>
            </div>

            <div className="review-grid">
              <div className="review-box">
                <div className="review-label">Requested song</div>
                <div className="review-value">{requestReviewItem.songTitle || "-"}</div>
              </div>

              <div className="review-box">
                <div className="review-label">Artist</div>
                <div className="review-value">{requestReviewItem.artist || "-"}</div>
              </div>

              <div className="review-box">
                <div className="review-label">Requested by</div>
                <div className="review-value">{requestReviewItem.name || "-"}</div>
              </div>

              <div className="review-box">
                <div className="review-label">Email</div>
                <div className="review-value">{requestReviewItem.email || "-"}</div>
              </div>

              <div className="review-box">
                <div className="review-label">Message</div>
                <div className="review-value">
                  {requestReviewItem.message || "No extra message."}
                </div>
              </div>

              <div className="review-box">
                <div className="review-label">Status</div>
                <div className="review-value">
                  <span className={`status ${requestReviewItem.status || "new"}`}>
                    {requestReviewItem.status || "new"}
                  </span>
                </div>
              </div>

              <div className="song-actions">
                <button
                  className="btn btn-secondary"
                  onClick={() =>
                    handleUpdateRequestStatus(requestReviewItem.id, "reviewed")
                  }
                >
                  Mark reviewed
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => handleUpdateRequestStatus(requestReviewItem.id, "done")}
                >
                  Mark done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}