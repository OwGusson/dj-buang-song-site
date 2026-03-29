import React, { useEffect, useMemo, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import { supabase } from "./supabase";
import {
  makeSongId,
  autoCleanReplacedFiles,
  autoCleanDeletedSongFiles,
} from "./songs";

const STORAGE_KEYS = {
  songs: "djbuang_songs",
  admin: "djbuang_admin_logged_in",
  resetVersion: "djbuang_reset_version",
};

const PAYPAL_URL = "https://www.paypal.com/donate/?hosted_button_id=DWL7PTXG7BQ9A";
const DEFAULT_SONGS = [];

function getStored(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function clearOldDemoDataOnce() {
  try {
    const currentVersion = "reset-v4";
    const alreadyReset = localStorage.getItem(STORAGE_KEYS.resetVersion);

    if (alreadyReset === currentVersion) return;

    localStorage.removeItem(STORAGE_KEYS.songs);
    localStorage.removeItem("djbuang_requests");
    localStorage.removeItem("djbuang_messages");
    localStorage.removeItem("djbuang_donations");

    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith("liked_")) {
        localStorage.removeItem(key);
      }
    });

    localStorage.setItem(STORAGE_KEYS.resetVersion, currentVersion);
  } catch (error) {
    console.warn("Could not clear old demo data:", error);
  }
}

function normalizeSong(song) {
  const requestedBy = (song.requestedBy || song.genre || "").trim();
  const parsedSortOrder = Number(song.sortOrder);

  return {
    id: song.id || `song-${Date.now()}-${Math.random()}`,
    title: song.title || "Untitled Song",
    artist: song.artist || "DJ-Buang",
    requestedBy,
    coverUrl: song.coverUrl || "",
    audioUrl: song.audioUrl || "",
    lyrics: song.lyrics || "",
    likes: Number(song.likes || 0),
    featured: Boolean(song.featured),
    visibility: song.visibility || "public",
    status: song.status || "published",
    createdAt: song.createdAt || new Date().toISOString(),
    sortOrder: Number.isFinite(parsedSortOrder) ? parsedSortOrder : null,
  };
}

function ensureSongSortOrders(songList) {
  return songList.map((song, index) => {
    const normalized = normalizeSong(song);
    return {
      ...normalized,
      sortOrder: Number.isFinite(normalized.sortOrder) ? normalized.sortOrder : index + 1,
    };
  });
}

function compareSongsForDisplay(a, b) {
  if (!!b.featured !== !!a.featured) {
    return b.featured ? 1 : -1;
  }

  const aOrder = Number.isFinite(Number(a.sortOrder)) ? Number(a.sortOrder) : Number.MAX_SAFE_INTEGER;
  const bOrder = Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : Number.MAX_SAFE_INTEGER;

  if (aOrder !== bOrder) {
    return aOrder - bOrder;
  }

  return new Date(b.createdAt) - new Date(a.createdAt);
}

function isNewSong(song) {
  if (!song?.id) return false;

  const timestamp = Number(String(song.id).replace(/^song-/, "").split("-")[0]);
  if (!Number.isFinite(timestamp)) return false;

  const FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000;
  return Date.now() - timestamp <= FOURTEEN_DAYS;
}

function formatDate(dateString) {
  try {
    const d = new Date(dateString);
    return d.toISOString().slice(0, 10);
  } catch {
    return dateString;
  }
}

function timeAgo(dateString) {
  try {
    const now = new Date();
    const past = new Date(dateString);

    const diffMs = now - past;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return "today";
    if (diffDays === 1) return "1 day ago";

    return `${diffDays} days ago`;
  } catch {
    return "";
  }
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function getFileNameFromUrl(url = "") {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/");
    return decodeURIComponent(parts[parts.length - 1] || "");
  } catch {
    return "";
  }
}

function loadImageAsDataUrl(src) {
  return new Promise((resolve, reject) => {
    if (!src) {
      resolve(null);
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas context not available"));
          return;
        }
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = reject;
    img.src = src;
  });
}

function normalizeAnalyticsRow(row) {
  return {
    song_id: row.song_id,
    opens: Number(row.opens || 0),
    plays: Number(row.plays || 0),
    updated_at: row.updated_at || null,
  };
}

function getSongTypeLabel(song) {
  if ((song.requestedBy || "").trim()) {
    return `Requested by ${song.requestedBy.trim()}`;
  }

  return "DJ-BUANG Original";
}

function isRequestedSong(song) {
  return Boolean((song.requestedBy || "").trim());
}

function isOriginalSong(song) {
  return !isRequestedSong(song);
}

function shellCardStyle(extra = {}) {
  return {
    background: "linear-gradient(180deg, rgba(13,18,34,0.96), rgba(8,12,24,0.98))",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 26,
    boxShadow: "0 18px 60px rgba(0,0,0,0.34)",
    ...extra,
  };
}

function Button({ children, variant = "secondary", type = "button", ...props }) {
  const variants = {
    primary: {
      background: "#f4f4f5",
      color: "#0b1020",
      border: "1px solid rgba(255,255,255,0.25)",
    },
    secondary: {
      background: "rgba(255,255,255,0.08)",
      color: "white",
      border: "1px solid rgba(255,255,255,0.10)",
    },
    ghost: {
      background: "transparent",
      color: "white",
      border: "1px solid rgba(255,255,255,0.12)",
    },
    danger: {
      background: "rgba(220, 38, 38, 0.18)",
      color: "white",
      border: "1px solid rgba(248,113,113,0.24)",
    },
    success: {
      background: "rgba(34,197,94,0.18)",
      color: "white",
      border: "1px solid rgba(74,222,128,0.24)",
    },
  };

  return (
    <button
      type={type}
      {...props}
      style={{
        padding: "12px 18px",
        borderRadius: 16,
        fontWeight: 600,
        cursor: props.disabled ? "not-allowed" : "pointer",
        fontSize: 16,
        transition: "0.2s ease",
        opacity: props.disabled ? 0.7 : 1,
        ...variants[variant],
        ...props.style,
      }}
    >
      {children}
    </button>
  );
}

function Input({ label, helper, ...props }) {
  return (
    <label style={{ display: "block" }}>
      {label ? (
        <div style={{ marginBottom: 8, fontSize: 14, color: "rgba(255,255,255,0.82)" }}>
          {label}
        </div>
      ) : null}
      <input
        {...props}
        style={{
          width: "100%",
          padding: "14px 16px",
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(8,12,24,0.64)",
          color: "white",
          outline: "none",
          fontSize: 16,
          boxSizing: "border-box",
          ...props.style,
        }}
      />
      {helper ? (
        <div style={{ marginTop: 8, fontSize: 13, color: "rgba(255,255,255,0.62)", lineHeight: 1.45 }}>
          {helper}
        </div>
      ) : null}
    </label>
  );
}

function TextArea({ label, ...props }) {
  return (
    <label style={{ display: "block" }}>
      {label ? (
        <div style={{ marginBottom: 8, fontSize: 14, color: "rgba(255,255,255,0.82)" }}>
          {label}
        </div>
      ) : null}
      <textarea
        {...props}
        style={{
          width: "100%",
          minHeight: 120,
          padding: "14px 16px",
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(8,12,24,0.64)",
          color: "white",
          outline: "none",
          resize: "vertical",
          fontSize: 16,
          fontFamily: "inherit",
          boxSizing: "border-box",
          ...props.style,
        }}
      />
    </label>
  );
}

function Select({ label, children, ...props }) {
  return (
    <label style={{ display: "block" }}>
      {label ? (
        <div style={{ marginBottom: 8, fontSize: 14, color: "rgba(255,255,255,0.82)" }}>
          {label}
        </div>
      ) : null}
      <select
        {...props}
        style={{
          width: "100%",
          padding: "14px 16px",
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(8,12,24,0.64)",
          color: "white",
          fontSize: 16,
          boxSizing: "border-box",
          ...props.style,
        }}
      >
        {children}
      </select>
    </label>
  );
}

function Badge({ children, style = {} }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "7px 12px",
        borderRadius: 999,
        background: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.08)",
        fontSize: 13,
        color: "rgba(255,255,255,0.88)",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

function StatPill({ label, value }) {
  return (
    <div
      style={{
        padding: 16,
        borderRadius: 18,
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div style={{ fontSize: 13, opacity: 0.74 }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 28, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function Panel({ title, subtitle, right, children }) {
  return (
    <section style={{ ...shellCardStyle(), padding: 22 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "flex-start",
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        <div>
          {typeof title === "string" ? <h2 style={{ margin: 0, fontSize: 22 }}>{title}</h2> : title}
          {subtitle ? (
            <p style={{ margin: "8px 0 0", color: "rgba(255,255,255,0.72)" }}>{subtitle}</p>
          ) : null}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function SectionHeading({ icon, title, tone = "default" }) {
  const tones = {
    featured: {
      color: "#fde68a",
      background: "linear-gradient(135deg, rgba(250,204,21,0.18), rgba(251,191,36,0.08))",
      border: "1px solid rgba(250,204,21,0.28)",
      boxShadow: "0 8px 24px rgba(250,204,21,0.12)",
    },
    new: {
      color: "#93c5fd",
      background: "linear-gradient(135deg, rgba(59,130,246,0.18), rgba(96,165,250,0.08))",
      border: "1px solid rgba(96,165,250,0.26)",
      boxShadow: "0 8px 24px rgba(59,130,246,0.12)",
    },
    default: {
      color: "#d8b4fe",
      background: "linear-gradient(135deg, rgba(168,85,247,0.16), rgba(192,132,252,0.07))",
      border: "1px solid rgba(192,132,252,0.20)",
      boxShadow: "0 8px 24px rgba(168,85,247,0.10)",
    },
  };

  const toneStyle = tones[tone] || tones.default;

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        borderRadius: 16,
        fontSize: 13,
        fontWeight: 800,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        width: "fit-content",
        ...toneStyle,
      }}
    >
      <span style={{ fontSize: 15 }}>{icon}</span>
      <span>{title}</span>
    </div>
  );
}

function SongRow({
  song,
  analytics,
  onLike,
  onOpenPlayer,
  onDownloadSong,
  onDownloadLyrics,
  isAdmin,
  isMobile = false,
  onDelete,
  onCopyLink,
  onEdit,
  onMoveUp,
  onMoveDown,
  canMoveUp = false,
  canMoveDown = false,
}) {
  const songTypeLabel = getSongTypeLabel(song);
  const songAnalytics = analytics || { opens: 0, plays: 0 };
  const isNew = isNewSong(song);
  const isRequested = isRequestedSong(song);
  const isFeatured = !!song.featured;

  return (
    <div
      onClick={() => onOpenPlayer(song)}
      style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "72px 1fr" : "96px 1fr",
        gap: isMobile ? 10 : 14,
        padding: isMobile ? 10 : 14,
        borderRadius: 20,
        background: isFeatured
          ? "linear-gradient(180deg, rgba(33,24,8,0.88), rgba(8,12,24,0.92))"
          : "rgba(8,12,24,0.64)",
        border: isFeatured
          ? "1px solid rgba(250,204,21,0.22)"
          : "1px solid rgba(255,255,255,0.08)",
        boxShadow: isFeatured
          ? "0 10px 28px rgba(250,204,21,0.08)"
          : "none",
        alignItems: "center",
        cursor: "pointer",
      }}
    >
      <div
        style={{
          width: "100%",
          height: isMobile ? 64 : 76,
          borderRadius: isMobile ? 14 : 16,
          overflow: "hidden",
          background: "linear-gradient(135deg, rgba(89,55,150,0.8), rgba(41,73,120,0.8))",
          display: "grid",
          placeItems: "center",
        }}
      >
        {song.coverUrl ? (
          <img
            src={song.coverUrl}
            alt={song.title}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <span style={{ fontSize: 28 }}>🎧</span>
        )}
      </div>

      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 4,
          }}
        >
          <h3 style={{ margin: 0, fontSize: isMobile ? 16 : 19, lineHeight: 1.25 }}>{song.title}</h3>

          {isFeatured ? (
            <Badge
              style={{
                background: "rgba(250,204,21,0.12)",
                border: "1px solid rgba(250,204,21,0.25)",
                color: "#fde68a",
                fontWeight: 700,
                backdropFilter: "blur(4px)",
              }}
            >
              ⭐ FEATURED
            </Badge>
          ) : null}

          {isNew ? (
            <Badge
              style={{
                background: "rgba(96,165,250,0.12)",
                border: "1px solid rgba(96,165,250,0.28)",
                color: "#bfdbfe",
                fontWeight: 700,
                backdropFilter: "blur(4px)",
              }}
            >
              🆕 NEW
            </Badge>
          ) : null}

          {isRequested ? (
            <Badge
              style={{
                background: "rgba(249,115,22,0.12)",
                border: "1px solid rgba(249,115,22,0.28)",
                color: "#fdba74",
                fontWeight: 700,
                backdropFilter: "blur(4px)",
              }}
            >
              🔥 REQUESTED
            </Badge>
          ) : null}

          <Badge
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.10)",
              color: "rgba(255,255,255,0.78)",
            }}
          >
            {song.visibility === "public" ? "Public" : "Private"}
          </Badge>

          {isAdmin ? (
            <Badge
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.10)",
                color: "rgba(255,255,255,0.72)",
              }}
            >
              Order {song.sortOrder}
            </Badge>
          ) : null}
        </div>

        <div
          style={{
            color: "rgba(255,255,255,0.72)",
            marginBottom: isMobile ? 10 : 12,
            fontSize: isMobile ? 13 : 14,
            lineHeight: 1.45,
          }}
        >
          {song.artist} • {songTypeLabel} • Added {formatDate(song.createdAt)}
        </div>

        <div
          style={{
            display: "flex",
            gap: isMobile ? 6 : 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <Badge>{song.likes} 👍</Badge>

          {isAdmin ? (
            <>
              <Badge>{songAnalytics.opens} opens</Badge>
              <Badge>{songAnalytics.plays} plays</Badge>
            </>
          ) : null}

          {!isAdmin ? (
            <Button
              variant="secondary"
              onClick={(e) => {
                e.stopPropagation();
                onLike(song.id);
              }}
              style={{ padding: "9px 14px", fontSize: 14 }}
            >
              ♡ Thumbs Up
            </Button>
          ) : null}

          <Button
            variant="secondary"
            onClick={(e) => {
              e.stopPropagation();
              onDownloadSong(song);
            }}
            style={{ padding: "9px 14px", fontSize: 14 }}
          >
            ⬇ Song
          </Button>

          <Button
            variant="secondary"
            onClick={(e) => {
              e.stopPropagation();
              onDownloadLyrics(song);
            }}
            style={{ padding: "9px 14px", fontSize: 14 }}
          >
            ⬇ Lyrics PDF
          </Button>

          {isAdmin ? (
            <>
              <Button
                variant="secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenPlayer(song);
                }}
                style={{ padding: "9px 14px", fontSize: 14 }}
              >
                Open
              </Button>

              <Button
                variant="secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(song);
                }}
                style={{ padding: "9px 14px", fontSize: 14 }}
              >
                Edit
              </Button>

              <Button
                variant="secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveUp(song.id);
                }}
                disabled={!canMoveUp}
                style={{ padding: "9px 14px", fontSize: 14 }}
              >
                ↑ Up
              </Button>

              <Button
                variant="secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveDown(song.id);
                }}
                disabled={!canMoveDown}
                style={{ padding: "9px 14px", fontSize: 14 }}
              >
                ↓ Down
              </Button>

              <Button
                variant="secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  onCopyLink(song.id);
                }}
                style={{ padding: "9px 14px", fontSize: 14 }}
              >
                Copy Link
              </Button>

              <Button
                variant="danger"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(song.id);
                }}
                style={{ padding: "9px 14px", fontSize: 14 }}
              >
                Delete
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
export default function App() {
  const [songs, setSongs] = useState(() =>
    ensureSongSortOrders(getStored(STORAGE_KEYS.songs, DEFAULT_SONGS))
  );

  const [analytics, setAnalytics] = useState({});
  const [view, setView] = useState("home");

  const [adminLoggedIn, setAdminLoggedIn] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.admin)) || false;
    } catch {
      return false;
    }
  });

  const [playerSong, setPlayerSong] = useState(null);
  const [playerMinimized, setPlayerMinimized] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const [uploadSuccess, setUploadSuccess] = useState("");
  const [messageSuccess, setMessageSuccess] = useState("");

  const [isMobile, setIsMobile] = useState(false);

  const audioRef = useRef(null);

  useEffect(() => {
    clearOldDemoDataOnce();
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    handleResize();

    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.songs, JSON.stringify(songs));
  }, [songs]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.admin, JSON.stringify(adminLoggedIn));
  }, [adminLoggedIn]);

  const visibleSongs = useMemo(() => {
    const base = adminLoggedIn
      ? songs
      : songs.filter((song) => song.visibility === "public");

    return [...base].sort(compareSongsForDisplay);
  }, [songs, adminLoggedIn]);

  const featuredSongs = visibleSongs.filter((song) => song.featured);
  const newestSongs = visibleSongs.filter(
    (song) => !song.featured && isNewSong(song)
  );
  const librarySongs = visibleSongs.filter(
    (song) => !song.featured && !isNewSong(song)
  );

  const recordAnalytics = async (songId, type) => {
    try {
      const existing = analytics[songId] || { opens: 0, plays: 0 };

      const updated =
        type === "open"
          ? { ...existing, opens: existing.opens + 1 }
          : { ...existing, plays: existing.plays + 1 };

      setAnalytics((prev) => ({
        ...prev,
        [songId]: updated,
      }));
    } catch (err) {
      console.warn("Analytics update failed", err);
    }
  };

  const handleOpenPlayer = (song) => {
    setPlayerSong(song);
    setPlayerMinimized(false);

    recordAnalytics(song.id, "open");

    setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.play();
        setIsPlaying(true);

        recordAnalytics(song.id, "play");
      }
    }, 120);
  };

  const togglePlayPause = () => {
    if (!audioRef.current) return;

    if (audioRef.current.paused) {
      audioRef.current.play();
      setIsPlaying(true);
    } else {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleNextSong = () => {
    if (!playerSong) return;

    const index = visibleSongs.findIndex((s) => s.id === playerSong.id);

    if (index >= 0 && index < visibleSongs.length - 1) {
      handleOpenPlayer(visibleSongs[index + 1]);
    }
  };

  const handlePreviousSong = () => {
    if (!playerSong) return;

    const index = visibleSongs.findIndex((s) => s.id === playerSong.id);

    if (index > 0) {
      handleOpenPlayer(visibleSongs[index - 1]);
    }
  };

  const handleLikeSong = (songId) => {
    const alreadyLiked = localStorage.getItem(`liked_${songId}`);

    if (alreadyLiked) return;

    setSongs((prev) =>
      prev.map((song) =>
        song.id === songId ? { ...song, likes: song.likes + 1 } : song
      )
    );

    localStorage.setItem(`liked_${songId}`, "true");
  };

  const handleDownloadSong = (song) => {
    if (!song.audioUrl) return;

    const link = document.createElement("a");
    link.href = song.audioUrl;
    link.download = getFileNameFromUrl(song.audioUrl) || `${song.title}.mp3`;
    link.click();
  };

  const handleDownloadLyrics = async (song) => {
    if (!song.lyrics) return;

    const doc = new jsPDF();

    let y = 20;

    doc.setFontSize(18);
    doc.text(song.title, 20, y);

    y += 10;

    doc.setFontSize(12);

    const lines = doc.splitTextToSize(song.lyrics, 170);

    doc.text(lines, 20, y);

    doc.save(`${song.title}-lyrics.pdf`);
  };

  const handleCopyLink = async (songId) => {
    const link = `${window.location.origin}?song=${songId}`;

    try {
      await navigator.clipboard.writeText(link);
      alert("Song link copied!");
    } catch {
      alert(link);
    }
  };

  const handleDeleteSong = async (songId) => {
    if (!window.confirm("Delete this song permanently?")) return;

    const song = songs.find((s) => s.id === songId);

    if (!song) return;

    await autoCleanDeletedSongFiles(song);

    setSongs((prev) => prev.filter((s) => s.id !== songId));
  };

  const handleMoveSongUp = (songId) => {
    const index = songs.findIndex((s) => s.id === songId);

    if (index <= 0) return;

    const updated = [...songs];

    [updated[index - 1], updated[index]] = [
      updated[index],
      updated[index - 1],
    ];

    setSongs(ensureSongSortOrders(updated));
  };

  const handleMoveSongDown = (songId) => {
    const index = songs.findIndex((s) => s.id === songId);

    if (index === -1 || index >= songs.length - 1) return;

    const updated = [...songs];

    [updated[index + 1], updated[index]] = [
      updated[index],
      updated[index + 1],
    ];

    setSongs(ensureSongSortOrders(updated));
  };
    return (
    <div
      style={{
        minHeight: "100vh",
        color: "white",
        background:
          "radial-gradient(circle at top left, rgba(62,28,96,0.26), transparent 26%), radial-gradient(circle at top right, rgba(70,28,102,0.14), transparent 18%), linear-gradient(180deg, #04070f 0%, #070c18 52%, #090f1d 100%)",
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        paddingBottom: playerSong && playerMinimized ? (isMobile ? 240 : 180) : 0,
      }}
    >
      <audio
        ref={audioRef}
        src={playerSong?.audioUrl || ""}
        preload="metadata"
        style={{ display: "none" }}
        onTimeUpdate={() => {
          if (!audioRef.current) return;
          setCurrentTime(audioRef.current.currentTime || 0);
        }}
        onLoadedMetadata={() => {
          if (!audioRef.current) return;
          setDuration(audioRef.current.duration || 0);
        }}
        onEnded={() => {
          setIsPlaying(false);
        }}
      />

      <div style={{ maxWidth: 1250, margin: "0 auto", padding: "22px 18px 50px" }}>
        {view === "home" && (
          <div style={{ display: "grid", gap: 22 }}>
            <section
              style={{
                ...shellCardStyle({
                  padding: 34,
                  background:
                    "radial-gradient(circle at top right, rgba(92,40,140,0.18), transparent 22%), linear-gradient(180deg, rgba(5,8,18,0.98), rgba(7,11,22,0.98))",
                }),
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) auto",
                  gap: 18,
                  alignItems: "start",
                }}
              >
                <div>
                  <div
  style={{
    display: "flex",
    gap: 10,
    flexWrap: "nowrap",
    marginBottom: 18,
    alignItems: "center",
    justifyContent: "space-between",
  }}
>
  <div
    style={{
      display: "flex",
      gap: 10,
      flexWrap: "nowrap",
      minWidth: 0,
    }}
  >
    <Badge>DJ-Buang Official</Badge>
    <Badge>🎤 Mobile ready</Badge>
  </div>

  <Button
    variant="secondary"
    onClick={() => {
      setMessageSuccess("");
      setUploadSuccess("");
      setView(adminLoggedIn ? "admin" : "login");
    }}
    style={{
      minWidth: "auto",
      padding: isMobile ? "8px 12px" : "10px 14px",
      fontSize: isMobile ? 13 : 14,
      flexShrink: 0,
    }}
  >
    🔒 Admin
  </Button>
</div>

                  <h1
                    style={{
                      margin: 0,
                      fontSize: "clamp(44px, 7vw, 74px)",
                      lineHeight: 0.98,
                      fontWeight: 900,
                      letterSpacing: "-0.03em",
                    }}
                  >
                    DJ-BUANG
                  </h1>

                  <p
                    style={{
                      maxWidth: 820,
                      margin: "18px 0 0",
                      fontSize: 18,
                      lineHeight: 1.45,
                      color: "rgba(255,255,255,0.76)",
                    }}
                  >
                    I’m DJ-BUANG, also known as OwGusson — making songs for the Date In Asia
                    community, friends, and the occasional private request along the way.
                    <br />
                    <br />
                    Feel free to explore the library, give your favorite tracks a thumbs-up, and
                    download songs or lyrics if something speaks to you. If you enjoy the music and
                    want to support what I do, it’s always appreciated — but most of all, I’m just
                    glad you’re here listening.
                  </p>

                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 24 }}>
                    <Button variant="secondary" onClick={() => window.open(PAYPAL_URL, "_blank")}>
                      ♡ Support / Donate
                    </Button>

                    <Button
                      variant="secondary"
                      onClick={() => {
                        setMessageSuccess("");
                        setUploadSuccess("");
                        alert("Request view not included in this compact rebuild yet.");
                      }}
                    >
                      🗒 Song Request
                    </Button>

                    <Button
                      variant="secondary"
                      onClick={() => {
                        setMessageSuccess("");
                        setUploadSuccess("");
                        alert("Private message view not included in this compact rebuild yet.");
                      }}
                    >
                      ✈ Private Message
                    </Button>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: isMobile ? "stretch" : "flex-end",
                    gap: 18,
                    minWidth: isMobile ? "100%" : 260,
                  }}
                >
                  {!isMobile ? (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setMessageSuccess("");
                        setUploadSuccess("");
                        setView(adminLoggedIn ? "admin" : "login");
                      }}
                      style={{
                        padding: "10px 14px",
                        fontSize: 14,
                      }}
                    >
                      🔒 Admin
                    </Button>
                  ) : null}

                  <img
                    src="/hero-logo.png"
                    alt="DJ-BUANG logo"
                    style={{
                      width: isMobile ? "100%" : 300,
                      maxWidth: "100%",
                      height: "auto",
                      objectFit: "contain",
                      filter: "drop-shadow(0 10px 30px rgba(123, 92, 255, 0.35))",
                    }}
                  />
                </div>
              </div>
            </section>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile
                  ? "1fr"
                  : "minmax(0, 1.85fr) minmax(300px, 0.9fr)",
                gap: 22,
                alignItems: "start",
              }}
            >
              <Panel
                title={
                  <div>
                    <div
                      style={{
                        fontSize: 13,
                        letterSpacing: "0.35em",
                        color: "rgba(255,255,255,0.62)",
                        marginBottom: 10,
                      }}
                    >
                      LIBRARY
                    </div>
                    <div style={{ fontSize: 28, fontWeight: 800 }}>Songs</div>
                  </div>
                }
                subtitle="Mobile-friendly browsing with player preview and lyrics view."
              >
                <div style={{ display: "grid", gap: 14 }}>
                  {featuredSongs.length > 0 ? (
                    <div style={{ display: "grid", gap: 12 }}>
                      <SectionHeading icon="⭐" title="Featured Spotlight" tone="featured" />
                      {featuredSongs.map((song) => (
                        <SongRow
                          key={`featured-${song.id}`}
                          song={song}
                          analytics={analytics[song.id]}
                          onLike={handleLikeSong}
                          onOpenPlayer={handleOpenPlayer}
                          onDownloadSong={handleDownloadSong}
                          onDownloadLyrics={handleDownloadLyrics}
                          isMobile={isMobile}
                        />
                      ))}
                    </div>
                  ) : null}

                  {newestSongs.length > 0 ? (
                    <div style={{ display: "grid", gap: 12 }}>
                      <SectionHeading icon="🆕" title="Newest Drops" tone="new" />
                      {newestSongs.map((song) => (
                        <SongRow
                          key={`new-${song.id}`}
                          song={song}
                          analytics={analytics[song.id]}
                          onLike={handleLikeSong}
                          onOpenPlayer={handleOpenPlayer}
                          onDownloadSong={handleDownloadSong}
                          onDownloadLyrics={handleDownloadLyrics}
                          isMobile={isMobile}
                        />
                      ))}
                    </div>
                  ) : null}

                  {librarySongs.length > 0 ? (
                    <div style={{ display: "grid", gap: 12 }}>
                      <SectionHeading icon="🎵" title="More Songs" />
                      {librarySongs.map((song) => (
                        <SongRow
                          key={song.id}
                          song={song}
                          analytics={analytics[song.id]}
                          onLike={handleLikeSong}
                          onOpenPlayer={handleOpenPlayer}
                          onDownloadSong={handleDownloadSong}
                          onDownloadLyrics={handleDownloadLyrics}
                          isMobile={isMobile}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              </Panel>

              <div style={{ display: "grid", gap: 22, alignContent: "start" }}>
                <Panel title="♡ Top 3 Most Liked Songs" subtitle="The crowd favorites as they build up.">
                  <div style={{ display: "grid", gap: 12 }}>
                    {[...visibleSongs]
                      .sort((a, b) => (b.likes || 0) - (a.likes || 0))
                      .slice(0, 3)
                      .map((song, i) => (
                        <div
                          key={song.id}
                          onClick={() => handleOpenPlayer(song)}
                          style={{
                            padding: 18,
                            borderRadius: 20,
                            background:
                              "linear-gradient(180deg, rgba(10,14,28,0.90), rgba(7,11,22,0.94))",
                            border: "1px solid rgba(255,255,255,0.09)",
                            boxShadow: "0 12px 28px rgba(0,0,0,0.22)",
                            cursor: "pointer",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 12,
                              alignItems: "center",
                            }}
                          >
                            <div>
                              <div
                                style={{
                                  color: i === 0 ? "#fde68a" : i === 1 ? "#cbd5e1" : "#fdba74",
                                  marginBottom: 8,
                                  fontWeight: 800,
                                  letterSpacing: "0.08em",
                                }}
                              >
                                #{i + 1}
                              </div>
                              <div style={{ fontSize: 20, fontWeight: 700 }}>{song.title}</div>
                              <div style={{ color: "rgba(255,255,255,0.70)", marginTop: 4 }}>
                                {getSongTypeLabel(song)}
                              </div>
                            </div>
                            <Badge>{song.likes} likes</Badge>
                          </div>
                        </div>
                      ))}
                  </div>
                </Panel>
              </div>
            </div>
          </div>
        )}

        {view === "login" && !adminLoggedIn && (
          <Panel title="Admin Login" subtitle="Use this to open the private admin dashboard.">
            <form
              onSubmit={handleAdminLogin}
              style={{ display: "grid", gap: 16, maxWidth: 460 }}
            >
              <Input
                type="password"
                label="Password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
              />

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <Button type="submit" variant="primary">
                  Login
                </Button>
                <Button type="button" variant="secondary" onClick={() => setView("home")}>
                  Back Home
                </Button>
              </div>
            </form>
          </Panel>
      
        )}

        {view === "admin" && adminLoggedIn && (
          <div style={{ display: "grid", gap: 22 }}>
            <Panel
              title="Admin Dashboard"
              subtitle="Overview of requests, songs, likes, and analytics."
              right={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setAdminLoggedIn(false);
                    setView("home");
                  }}
                >
                  Logout
                </Button>
              }
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile
                    ? "repeat(2, minmax(0, 1fr))"
                    : "repeat(4, minmax(0, 1fr))",
                  gap: 14,
                }}
              >
                <StatPill
                  label="Total Plays"
                  value={Object.values(analytics).reduce((sum, row) => sum + Number(row?.plays || 0), 0)}
                />
                <StatPill
                  label="Total Opens"
                  value={Object.values(analytics).reduce((sum, row) => sum + Number(row?.opens || 0), 0)}
                />
                <StatPill
                  label="Total Likes"
                  value={songs.reduce((sum, song) => sum + Number(song.likes || 0), 0)}
                />
                <StatPill label="Songs Uploaded" value={songs.length} />
              </div>
            </Panel>

            <Panel title="Song Library" subtitle="Compact view of your uploaded songs.">
              <div style={{ display: "grid", gap: 12 }}>
                {songs.map((song, index) => (
                  <SongRow
                    key={song.id}
                    song={song}
                    analytics={analytics[song.id]}
                    isAdmin
                    isMobile={isMobile}
                    onOpenPlayer={handleOpenPlayer}
                    onDownloadSong={handleDownloadSong}
                    onDownloadLyrics={handleDownloadLyrics}
                    onDelete={handleDeleteSong}
                    onCopyLink={handleCopyLink}
                    onEdit={() => {}}
                    onMoveUp={handleMoveSongUp}
                    onMoveDown={handleMoveSongDown}
                    canMoveUp={index > 0}
                    canMoveDown={index < songs.length - 1}
                  />
                ))}
              </div>
            </Panel>
          </div>
        )}
      </div>

      {playerSong && !playerMinimized ? (
        <PlayerModal
          song={playerSong}
          onClose={() => {
            if (audioRef.current) {
              audioRef.current.pause();
            }
            setPlayerSong(null);
            setPlayerMinimized(false);
            setIsPlaying(false);
          }}
          onMinimize={() => setPlayerMinimized(true)}
          onNext={handleNextSong}
          onPrevious={handlePreviousSong}
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={duration}
          volume={audioRef.current?.volume ?? 1}
          isMuted={audioRef.current?.muted ?? false}
          onPlayPause={togglePlayPause}
          onSeek={(time) => {
            if (!audioRef.current) return;
            audioRef.current.currentTime = time;
            setCurrentTime(time);
          }}
          onVolumeChange={(value) => {
            if (!audioRef.current) return;
            audioRef.current.volume = value;
          }}
          onToggleMute={() => {
            if (!audioRef.current) return;
            audioRef.current.muted = !audioRef.current.muted;
          }}
          isMobile={isMobile}
        />
      ) : null}

      {playerSong && playerMinimized ? (
        <MiniPlayer
          song={playerSong}
          onExpand={() => setPlayerMinimized(false)}
          onClose={() => {
            if (audioRef.current) {
              audioRef.current.pause();
            }
            setPlayerSong(null);
            setPlayerMinimized(false);
            setIsPlaying(false);
          }}
          onNext={handleNextSong}
          onPrevious={handlePreviousSong}
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={duration}
          volume={audioRef.current?.volume ?? 1}
          isMuted={audioRef.current?.muted ?? false}
          onPlayPause={togglePlayPause}
          onSeek={(time) => {
            if (!audioRef.current) return;
            audioRef.current.currentTime = time;
            setCurrentTime(time);
          }}
          onVolumeChange={(value) => {
            if (!audioRef.current) return;
            audioRef.current.volume = value;
          }}
          onToggleMute={() => {
            if (!audioRef.current) return;
            audioRef.current.muted = !audioRef.current.muted;
          }}
          isMobile={isMobile}
          showVolumeSlider={showVolumeSlider}
          onToggleVolumeSlider={() => setShowVolumeSlider((prev) => !prev)}
        />
      ) : null}
    </div>
  );
}