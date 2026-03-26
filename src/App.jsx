import React, { useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEYS = {
  songs: "djbuang_songs",
  requests: "djbuang_requests",
  messages: "djbuang_messages",
  admin: "djbuang_admin_logged_in",
  resetVersion: "djbuang_reset_version",
};

const PAYPAL_URL = "https://paypal.me/owgusson";

const DEFAULT_SONGS = [];
const DEFAULT_REQUESTS = [];
const DEFAULT_MESSAGES = [];

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
    const currentVersion = "reset-v3";
    const alreadyReset = localStorage.getItem(STORAGE_KEYS.resetVersion);

    if (alreadyReset === currentVersion) return;

    localStorage.removeItem(STORAGE_KEYS.songs);
    localStorage.removeItem(STORAGE_KEYS.requests);
    localStorage.removeItem(STORAGE_KEYS.messages);
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
  return {
    id: song.id || `song-${Date.now()}-${Math.random()}`,
    title: song.title || "Untitled Song",
    artist: song.artist || "DJ-Buang",
    genre: song.genre || "",
    coverUrl: song.coverUrl || "",
    audioUrl: song.audioUrl || "",
    lyrics: song.lyrics || "",
    likes: Number(song.likes || 0),
    featured: Boolean(song.featured),
    visibility: song.visibility || "public",
    status: song.status || "published",
    createdAt: song.createdAt || new Date().toISOString(),
  };
}

function formatDate(dateString) {
  try {
    const d = new Date(dateString);
    return d.toISOString().slice(0, 10);
  } catch {
    return dateString;
  }
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function shellCardStyle(extra = {}) {
  return {
    background: "linear-gradient(180deg, rgba(23,33,58,0.92), rgba(16,24,45,0.96))",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 26,
    boxShadow: "0 18px 60px rgba(0,0,0,0.28)",
    ...extra,
  };
}

function Button({ children, variant = "secondary", ...props }) {
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

function Input({ label, ...props }) {
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
          background: "rgba(10,15,28,0.65)",
          color: "white",
          outline: "none",
          fontSize: 16,
          boxSizing: "border-box",
          ...props.style,
        }}
      />
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
          background: "rgba(10,15,28,0.65)",
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
          background: "rgba(10,15,28,0.65)",
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

function Badge({ children }) {
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

function SongRow({
  song,
  onLike,
  onOpenPlayer,
  onDownloadSong,
  onDownloadLyrics,
  isAdmin,
  onDelete,
  onCopyLink,
}) {
  return (
    <div
      onClick={() => onOpenPlayer(song)}
      style={{
        display: "grid",
        gridTemplateColumns: "96px 1fr",
        gap: 14,
        padding: 14,
        borderRadius: 20,
        background: "rgba(10,15,28,0.50)",
        border: "1px solid rgba(255,255,255,0.08)",
        alignItems: "center",
        cursor: "pointer",
      }}
    >
      <div
        style={{
          width: "100%",
          height: 76,
          borderRadius: 16,
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
          <h3 style={{ margin: 0, fontSize: 19 }}>{song.title}</h3>
          {song.featured ? <Badge>Featured</Badge> : null}
          <Badge>{song.visibility === "public" ? "Public" : "Private"}</Badge>
        </div>

        <div style={{ color: "rgba(255,255,255,0.72)", marginBottom: 12, fontSize: 14 }}>
          {song.artist} • {song.genre || "Uncategorized"} • Added {formatDate(song.createdAt)}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <Badge>{song.likes} 👍</Badge>

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
            ⬇ Lyrics
          </Button>

          {isAdmin ? (
            <>
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

function AudioControls({
  isPlaying,
  currentTime,
  duration,
  volume,
  isMuted,
  onPlayPause,
  onSeek,
  onVolumeChange,
  onToggleMute,
  compact = false,
}) {
  return (
    <div style={{ display: "grid", gap: compact ? 8 : 12 }}>
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <Button
          variant="primary"
          onClick={onPlayPause}
          style={{ padding: compact ? "9px 14px" : undefined }}
        >
          {isPlaying ? "Pause" : "Play"}
        </Button>

        <div style={{ color: "rgba(255,255,255,0.72)", fontSize: compact ? 13 : 14 }}>
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
      </div>

      <input
        type="range"
        min="0"
        max={Number.isFinite(duration) && duration > 0 ? duration : 0}
        step="0.1"
        value={Math.min(currentTime, duration || 0)}
        onChange={(e) => onSeek(Number(e.target.value))}
        style={{ width: "100%" }}
      />

      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <Button
          variant="secondary"
          onClick={onToggleMute}
          style={{ padding: compact ? "8px 12px" : "10px 14px", fontSize: compact ? 14 : 15 }}
        >
          {isMuted || volume === 0 ? "🔇 Muted" : "🔊 Volume"}
        </Button>

        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={isMuted ? 0 : volume}
          onChange={(e) => onVolumeChange(Number(e.target.value))}
          style={{ width: compact ? "120px" : "180px" }}
        />

        <div style={{ minWidth: 42, color: "rgba(255,255,255,0.72)", fontSize: compact ? 13 : 14 }}>
          {Math.round((isMuted ? 0 : volume) * 100)}%
        </div>
      </div>
    </div>
  );
}

function PlayerModal({
  song,
  onClose,
  onMinimize,
  isPlaying,
  currentTime,
  duration,
  volume,
  isMuted,
  onPlayPause,
  onSeek,
  onVolumeChange,
  onToggleMute,
  isMobile,
}) {
  if (!song) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        display: "grid",
        placeItems: "center",
        zIndex: 1000,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(860px, 100%)",
          maxHeight: "88vh",
          overflow: "auto",
          ...shellCardStyle(),
          padding: 24,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
            marginBottom: 18,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2 style={{ margin: 0 }}>{song.title}</h2>
            <div style={{ color: "rgba(255,255,255,0.7)", marginTop: 6 }}>
              {song.artist} • {song.genre || "Uncategorized"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Button variant="secondary" onClick={onMinimize}>
              Minimize
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "280px 1fr",
            gap: 22,
          }}
        >
          <div>
            <div
              style={{
                width: "100%",
                aspectRatio: "1 / 1",
                borderRadius: 22,
                overflow: "hidden",
                background: "linear-gradient(135deg, rgba(89,55,150,0.8), rgba(41,73,120,0.8))",
                display: "grid",
                placeItems: "center",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              {song.coverUrl ? (
                <img
                  src={song.coverUrl}
                  alt={song.title}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <span style={{ fontSize: 70 }}>🎧</span>
              )}
            </div>

            <div style={{ marginTop: 16 }}>
              {song.audioUrl ? (
                <AudioControls
                  isPlaying={isPlaying}
                  currentTime={currentTime}
                  duration={duration}
                  volume={volume}
                  isMuted={isMuted}
                  onPlayPause={onPlayPause}
                  onSeek={onSeek}
                  onVolumeChange={onVolumeChange}
                  onToggleMute={onToggleMute}
                />
              ) : (
                <div style={{ color: "rgba(255,255,255,0.7)" }}>No audio uploaded yet.</div>
              )}
            </div>
          </div>

          <div>
            <h3 style={{ marginTop: 0, marginBottom: 10 }}>Lyrics</h3>
            <div
              style={{
                background: "rgba(10,15,28,0.55)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 18,
                padding: 16,
                minHeight: 300,
              }}
            >
              <pre
                style={{
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.6,
                  fontFamily: "inherit",
                  color: "rgba(255,255,255,0.9)",
                }}
              >
                {song.lyrics || "No lyrics added yet."}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniPlayer({
  song,
  onExpand,
  onClose,
  isPlaying,
  currentTime,
  duration,
  volume,
  isMuted,
  onPlayPause,
  onSeek,
  onVolumeChange,
  onToggleMute,
}) {
  if (!song) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: 18,
        right: 18,
        bottom: 18,
        zIndex: 999,
        ...shellCardStyle({
          padding: 14,
          borderRadius: 20,
          background: "linear-gradient(180deg, rgba(18,25,46,0.96), rgba(11,17,34,0.98))",
        }),
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "58px 1fr",
          gap: 12,
          alignItems: "start",
        }}
      >
        <div
          style={{
            width: 58,
            height: 58,
            borderRadius: 14,
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
            <span style={{ fontSize: 24 }}>🎧</span>
          )}
        </div>

        <div style={{ minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontWeight: 700 }}>{song.title}</div>
              <div style={{ color: "rgba(255,255,255,0.68)", fontSize: 14 }}>{song.artist}</div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button variant="secondary" onClick={onExpand} style={{ padding: "9px 12px", fontSize: 14 }}>
                Expand
              </Button>
              <Button variant="secondary" onClick={onClose} style={{ padding: "9px 12px", fontSize: 14 }}>
                Close
              </Button>
            </div>
          </div>

          {song.audioUrl ? (
            <div style={{ marginTop: 10 }}>
              <AudioControls
                isPlaying={isPlaying}
                currentTime={currentTime}
                duration={duration}
                volume={volume}
                isMuted={isMuted}
                onPlayPause={onPlayPause}
                onSeek={onSeek}
                onVolumeChange={onVolumeChange}
                onToggleMute={onToggleMute}
                compact
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

async function uploadFileToCloudflare(file) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/upload", {
    method: "POST",
    body: formData,
  });

  const text = await response.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error("Upload endpoint returned invalid response");
  }

  if (!response.ok) {
    throw new Error(data.error || "Upload failed");
  }

  return data.fileUrl;
}async function fetchSongsFromCloudflare() {
  const response = await fetch("/api/songs");
  const text = await response.text();

  let data = [];
  try {
    data = text ? JSON.parse(text) : [];
  } catch {
    throw new Error("Songs endpoint returned invalid response");
  }

  if (!response.ok) {
    throw new Error(data.error || "Failed to load songs");
  }

  return Array.isArray(data) ? data : [];
}

async function saveSongToCloudflare(song) {
  const response = await fetch("/api/songs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(song),
  });

  const text = await response.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error("Songs save endpoint returned invalid response");
  }

  if (!response.ok) {
    throw new Error(data.error || "Failed to save song");
  }

  return data;
}

async function deleteSongFromCloudflare(songId) {
  const response = await fetch(`/api/songs?id=${encodeURIComponent(songId)}`, {
    method: "DELETE",
  });

  const text = await response.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error("Songs delete endpoint returned invalid response");
  }

  if (!response.ok) {
    throw new Error(data.error || "Failed to delete song");
  }

  return data;
}

function App() {
const [songs, setSongs] = useState(() => {
  clearOldDemoDataOnce();
  return [];
});

  const [requests, setRequests] = useState(() =>
    getStored(STORAGE_KEYS.requests, DEFAULT_REQUESTS)
  );
  const [messages, setMessages] = useState(() =>
    getStored(STORAGE_KEYS.messages, DEFAULT_MESSAGES)
  );
  const [adminLoggedIn, setAdminLoggedIn] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.admin) || "false");
    } catch {
      return false;
    }
  });

  const [view, setView] = useState("home");
  const [adminPassword, setAdminPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState("all");
  const [playerSong, setPlayerSong] = useState(null);
  const [playerMinimized, setPlayerMinimized] = useState(false);
  const [playerCurrentTime, setPlayerCurrentTime] = useState(0);
  const [playerDuration, setPlayerDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [volume, setVolume] = useState(1);
  const [previousVolume, setPreviousVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [windowWidth, setWindowWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1200
  );

  const isMobile = windowWidth < 900;

  const audioRef = useRef(null);

  const [newSong, setNewSong] = useState({
    title: "",
    artist: "DJ-Buang",
    genre: "",
    coverUrl: "",
    audioUrl: "",
    lyrics: "",
    featured: false,
    visibility: "public",
  });

  const [newSongFiles, setNewSongFiles] = useState({
    coverFile: null,
    audioFile: null,
  });

  const [requestForm, setRequestForm] = useState({
    name: "",
    title: "",
    details: "",
    email: "",
    notify: false,
  });

  const [messageForm, setMessageForm] = useState({
    from: "",
    message: "",
  });
useEffect(() => {
  let cancelled = false;

  async function loadSongs() {
    try {
      const cloudSongs = await fetchSongsFromCloudflare();

      if (!cancelled) {
        setSongs(cloudSongs.map(normalizeSong));
      }
    } catch (error) {
      console.warn("Could not load songs from Cloudflare, falling back to local cache:", error);

      if (!cancelled) {
        const localSongs = getStored(STORAGE_KEYS.songs, DEFAULT_SONGS).map(normalizeSong);
        setSongs(localSongs);
      }
    }
  }

  loadSongs();

  return () => {
    cancelled = true;
  };
}, []);
  useEffect(() => {
    try {
      const safeSongs = songs.map((song) => ({
        id: song.id,
        title: song.title,
        artist: song.artist,
        genre: song.genre,
        coverUrl: song.coverUrl,
        audioUrl: song.audioUrl,
        lyrics: song.lyrics,
        likes: song.likes,
        featured: song.featured,
        visibility: song.visibility,
        status: song.status,
        createdAt: song.createdAt,
      }));
      localStorage.setItem(STORAGE_KEYS.songs, JSON.stringify(safeSongs));
    } catch (error) {
      console.warn("Skipping local song cache:", error);
    }
  }, [songs]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.requests, JSON.stringify(requests));
  }, [requests]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.messages, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.admin, JSON.stringify(adminLoggedIn));
  }, [adminLoggedIn]);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const songId = params.get("song");
    if (!songId) return;

    const foundSong = songs.find((song) => song.id === songId);
    if (foundSong) {
      setView("home");
      setPlayerSong(foundSong);
      setPlayerMinimized(false);
      setPlayerCurrentTime(0);
    }
  }, [songs]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setPlayerCurrentTime(audio.currentTime || 0);
    };

    const handleLoadedMetadata = () => {
      setPlayerDuration(audio.duration || 0);
    };

    const handlePlay = () => {
      setIsPlaying(true);
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setPlayerCurrentTime(0);
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.volume = isMuted ? 0 : volume;
    audio.muted = isMuted;
  }, [volume, isMuted]);

  const publicSongs = useMemo(
    () =>
      songs
        .map(normalizeSong)
        .filter((song) => song.status !== "hidden" && song.visibility === "public"),
    [songs]
  );

  const filteredSongs = useMemo(() => {
    let list = [...publicSongs];

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (song) =>
          song.title.toLowerCase().includes(q) ||
          song.artist.toLowerCase().includes(q) ||
          (song.genre || "").toLowerCase().includes(q)
      );
    }

    if (filterMode === "featured") {
      list = list.filter((song) => song.featured);
    } else if (filterMode === "most-liked") {
      list.sort((a, b) => (b.likes || 0) - (a.likes || 0));
    } else if (filterMode === "newest") {
      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } else {
      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    return list;
  }, [publicSongs, search, filterMode]);

  const adminSongs = useMemo(() => {
    return [...songs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [songs]);

  const topLikedSongs = useMemo(() => {
    return [...publicSongs].sort((a, b) => (b.likes || 0) - (a.likes || 0)).slice(0, 3);
  }, [publicSongs]);

  const pendingRequests = requests.filter((r) => r.status === "pending").length;
  const doneRequests = requests.filter((r) => r.status === "done").length;
  const newMessages = messages.filter((m) => m.status === "new").length;

  const openPayPalDonation = () => {
    window.open(PAYPAL_URL, "_blank", "noopener,noreferrer");
  };

  const handleLikeSong = (songId) => {
    const likedKey = `liked_${songId}`;
    if (localStorage.getItem(likedKey)) return;

    setSongs((prev) =>
      prev.map((song) =>
        song.id === songId ? { ...song, likes: (song.likes || 0) + 1 } : song
      )
    );

    localStorage.setItem(likedKey, "true");
  };

  const handleAdminLogin = (e) => {
    e.preventDefault();
    if (adminPassword === "djbuang") {
      setAdminLoggedIn(true);
      setView("admin");
      setLoginError("");
      setAdminPassword("");
    } else {
      setLoginError("Wrong password.");
    }
  };

  const handleLogout = () => {
    setAdminLoggedIn(false);
    setView("home");
  };

  const handleAddSong = async (e) => {
    e.preventDefault();
    if (!newSong.title.trim()) return;

    try {
      setIsUploading(true);

      let uploadedCoverUrl = newSong.coverUrl;
      let uploadedAudioUrl = newSong.audioUrl;

      if (newSongFiles.coverFile) {
        uploadedCoverUrl = await uploadFileToCloudflare(newSongFiles.coverFile);
      }

      if (newSongFiles.audioFile) {
        uploadedAudioUrl = await uploadFileToCloudflare(newSongFiles.audioFile);
      }

      const item = normalizeSong({
        id: `song-${Date.now()}`,
        title: newSong.title.trim(),
        artist: newSong.artist.trim() || "DJ-Buang",
        genre: newSong.genre.trim(),
        coverUrl: uploadedCoverUrl,
        audioUrl: uploadedAudioUrl,
        lyrics: newSong.lyrics.trim(),
        likes: 0,
        featured: !!newSong.featured,
        visibility: newSong.visibility,
        createdAt: new Date().toISOString(),
        status: "published",
      });

      await saveSongToCloudflare(item);
setSongs((prev) => [item, ...prev]);
      setNewSong({
        title: "",
        artist: "DJ-Buang",
        genre: "",
        coverUrl: "",
        audioUrl: "",
        lyrics: "",
        featured: false,
        visibility: "public",
      });
      setNewSongFiles({
        coverFile: null,
        audioFile: null,
      });

      alert("Song uploaded!");
    } catch (error) {
      alert(error.message || "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteSong = async (id) => {
    try {
      await deleteSongFromCloudflare(id);
      setSongs((prev) => prev.filter((song) => song.id !== id));

      if (playerSong?.id === id) {
        const audio = audioRef.current;
        if (audio) {
          audio.pause();
          audio.removeAttribute("src");
          audio.load();
        }
        setPlayerSong(null);
        setPlayerMinimized(false);
        setPlayerCurrentTime(0);
        setPlayerDuration(0);
        setIsPlaying(false);
      }
    } catch (error) {
      alert(error.message || "Failed to delete song");
    }
  };


  const handleRequestSubmit = (e) => {
    e.preventDefault();
    if (!requestForm.name.trim() || !requestForm.title.trim()) return;

    const item = {
      id: `req-${Date.now()}`,
      name: requestForm.name.trim(),
      title: requestForm.title.trim(),
      details: requestForm.details.trim(),
      email: requestForm.email.trim(),
      notify: requestForm.notify,
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    setRequests((prev) => [item, ...prev]);
    setRequestForm({
      name: "",
      title: "",
      details: "",
      email: "",
      notify: false,
    });
    alert("Song request sent!");
  };

  const handleMessageSubmit = (e) => {
    e.preventDefault();
    if (!messageForm.from.trim() || !messageForm.message.trim()) return;

    const item = {
      id: `msg-${Date.now()}`,
      from: messageForm.from.trim(),
      message: messageForm.message.trim(),
      status: "new",
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [item, ...prev]);
    setMessageForm({ from: "", message: "" });
    alert("Private message sent!");
  };

  const toggleRequestStatus = (id) => {
    setRequests((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, status: item.status === "done" ? "pending" : "done" }
          : item
      )
    );
  };

  const markMessageRead = (id) => {
    setMessages((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: "read" } : item))
    );
  };

  const deleteMessage = (id) => {
    setMessages((prev) => prev.filter((item) => item.id !== id));
  };

  const copySongLink = async (songId) => {
    const url = `${window.location.origin}${window.location.pathname}?song=${songId}`;
    try {
      await navigator.clipboard.writeText(url);
      alert("Song link copied!");
    } catch {
      alert(url);
    }
  };

  const openSongPlayer = async (song) => {
    const audio = audioRef.current;
    if (!audio) return;

    const sameSong = playerSong?.id === song.id;

    setPlayerSong(song);
    setPlayerMinimized(false);

    if (!song.audioUrl) return;

    if (!sameSong) {
      audio.pause();
      audio.src = song.audioUrl;
      audio.load();
      setPlayerCurrentTime(0);
      setPlayerDuration(0);

      try {
        await audio.play();
      } catch (error) {
        console.warn("Autoplay was blocked:", error);
      }
    }
  };

  const closePlayer = () => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }

    setPlayerSong(null);
    setPlayerMinimized(false);
    setPlayerCurrentTime(0);
    setPlayerDuration(0);
    setIsPlaying(false);
  };

  const minimizePlayer = () => {
    setPlayerMinimized(true);
  };

  const expandPlayer = () => {
    setPlayerMinimized(false);
  };

  const handlePlayPause = async () => {
    const audio = audioRef.current;
    if (!audio || !playerSong?.audioUrl) return;

    if (!audio.src) {
      audio.src = playerSong.audioUrl;
      audio.load();
    }

    if (audio.paused) {
      try {
        await audio.play();
      } catch (error) {
        console.warn("Play failed:", error);
      }
    } else {
      audio.pause();
    }
  };

  const handleSeek = (time) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = time;
    setPlayerCurrentTime(time);
  };

  const handleVolumeChange = (newVolume) => {
    const safeVolume = Math.max(0, Math.min(1, newVolume));
    setVolume(safeVolume);
    setIsMuted(safeVolume === 0);
    if (safeVolume > 0) {
      setPreviousVolume(safeVolume);
    }
  };

  const handleToggleMute = () => {
    if (isMuted || volume === 0) {
      const restoreVolume = previousVolume > 0 ? previousVolume : 1;
      setVolume(restoreVolume);
      setIsMuted(false);
    } else {
      setPreviousVolume(volume);
      setIsMuted(true);
    }
  };

  const downloadTextFile = (filename, content) => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadSong = (song) => {
    if (!song.audioUrl) {
      alert("No song file uploaded yet.");
      return;
    }
    const a = document.createElement("a");
    a.href = song.audioUrl;
    a.download = `${song.title}.mp3`;
    a.click();
  };

  const downloadLyrics = (song) => {
    if (!song.lyrics) {
      alert("No lyrics added yet.");
      return;
    }
    downloadTextFile(`${song.title}-lyrics.txt`, song.lyrics);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        color: "white",
        background:
          "radial-gradient(circle at top left, rgba(58,31,102,0.42), transparent 28%), radial-gradient(circle at top right, rgba(93,40,126,0.22), transparent 20%), linear-gradient(180deg, #050a18 0%, #07112a 55%, #081226 100%)",
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        paddingBottom: playerSong && playerMinimized ? 180 : 0,
      }}
    >
      <audio ref={audioRef} preload="metadata" style={{ display: "none" }} />

      <div style={{ maxWidth: 1250, margin: "0 auto", padding: "22px 18px 50px" }}>
        {view === "home" && (
          <div style={{ display: "grid", gap: 22 }}>
            <section
              style={{
                ...shellCardStyle({
                  padding: 34,
                  background:
                    "radial-gradient(circle at top right, rgba(103,48,163,0.25), transparent 22%), linear-gradient(180deg, rgba(4,8,20,0.97), rgba(10,16,34,0.95))",
                }),
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 18,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
                    <Badge>DJ-Buang Official</Badge>
                    <Badge>🎤 Mobile ready</Badge>
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
                    I’m DJ-BUANG, also known as OwGusson — cooking up songs for the Date In Asia
                    community, for friends, and sometimes for private requests too. I’m not doing
                    this to get rich, just because I genuinely love making music and adding a little
                    extra fun to people’s lives. But if you ever feel like throwing a small donation
                    my way, I’d really appreciate it — every bit goes back into the tools and
                    subscriptions that keep this whole thing running.
                  </p>

                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 24 }}>
                    <Button variant="secondary" onClick={openPayPalDonation}>
                      ♡ Support / Donate
                    </Button>
                    <Button variant="secondary" onClick={() => setView("request")}>
                      🗒 Song Request
                    </Button>
                    <Button variant="secondary" onClick={() => setView("message")}>
                      ✈ Private Message
                    </Button>
                  </div>
                </div>

                <Button
                  variant="secondary"
                  onClick={() => setView(adminLoggedIn ? "admin" : "login")}
                  style={{ minWidth: 110 }}
                >
                  🔒 Admin
                </Button>
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
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: isMobile ? "1fr" : "1fr 220px",
                      gap: 12,
                    }}
                  >
                    <Input
                      placeholder="Search songs, genre, or artist"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    <Select value={filterMode} onChange={(e) => setFilterMode(e.target.value)}>
                      <option value="all" style={{ color: "black" }}>
                        All songs
                      </option>
                      <option value="featured" style={{ color: "black" }}>
                        Featured
                      </option>
                      <option value="newest" style={{ color: "black" }}>
                        Newest
                      </option>
                      <option value="most-liked" style={{ color: "black" }}>
                        Most liked
                      </option>
                    </Select>
                  </div>

                  <div style={{ display: "grid", gap: 14 }}>
                    {filteredSongs.length > 0 ? (
                      filteredSongs.map((song) => (
                        <SongRow
                          key={song.id}
                          song={song}
                          onLike={handleLikeSong}
                          onOpenPlayer={openSongPlayer}
                          onDownloadSong={downloadSong}
                          onDownloadLyrics={downloadLyrics}
                        />
                      ))
                    ) : (
                      <div style={{ color: "rgba(255,255,255,0.70)" }}>
                        No songs found yet.
                      </div>
                    )}
                  </div>
                </div>
              </Panel>

              <div style={{ display: "grid", gap: 22, alignContent: "start" }}>
                <Panel
                  title="♡ Top 3 Most Liked Songs"
                  subtitle="The crowd favorites as they build up."
                >
                  <div style={{ display: "grid", gap: 12 }}>
                    {topLikedSongs.length > 0 ? (
                      topLikedSongs.map((song, i) => (
                        <div
                          key={song.id}
                          onClick={() => openSongPlayer(song)}
                          style={{
                            padding: 16,
                            borderRadius: 18,
                            background: "rgba(10,15,28,0.52)",
                            border: "1px solid rgba(255,255,255,0.08)",
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
                              <div style={{ color: "rgba(255,255,255,0.56)", marginBottom: 6 }}>
                                #{i + 1}
                              </div>
                              <div style={{ fontSize: 20, fontWeight: 700 }}>{song.title}</div>
                              <div style={{ color: "rgba(255,255,255,0.70)", marginTop: 4 }}>
                                {song.genre}
                              </div>
                            </div>
                            <Badge>{song.likes} likes</Badge>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div style={{ color: "rgba(255,255,255,0.7)" }}>
                        No likes yet — first listeners get the bragging rights.
                      </div>
                    )}
                  </div>
                </Panel>

                <Panel
                  title="◉ Connect"
                  subtitle="Song requests, private messages, and support are open."
                >
                  <div style={{ display: "grid", gap: 12 }}>
                    <Button variant="primary" onClick={() => setView("request")}>
                      🗒 Open Song Request Form
                    </Button>
                    <Button variant="secondary" onClick={() => setView("message")}>
                      💬 Open Private Message Form
                    </Button>
                    <Button variant="secondary" onClick={openPayPalDonation}>
                      ♡ Support on PayPal
                    </Button>
                  </div>
                </Panel>
              </div>
            </div>
          </div>
        )}

        {view === "request" && (
          <Panel
            title="Song Request"
            subtitle="Send a request and it will show up in the admin panel."
          >
            <form onSubmit={handleRequestSubmit} style={{ display: "grid", gap: 16, maxWidth: 760 }}>
              <Input
                label="Name"
                value={requestForm.name}
                onChange={(e) =>
                  setRequestForm((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="Your name"
              />

              <Input
                label="Song title / idea"
                value={requestForm.title}
                onChange={(e) =>
                  setRequestForm((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder="Epic lobby anthem"
              />

              <TextArea
                label="Details"
                value={requestForm.details}
                onChange={(e) =>
                  setRequestForm((prev) => ({ ...prev, details: e.target.value }))
                }
                placeholder="Names, mood, style, references..."
              />

              <Input
                label="E-mail"
                type="email"
                value={requestForm.email}
                onChange={(e) =>
                  setRequestForm((prev) => ({ ...prev, email: e.target.value }))
                }
                placeholder="Optional if you want to be notified"
              />

              <label
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  color: "rgba(255,255,255,0.85)",
                }}
              >
                <input
                  type="checkbox"
                  checked={requestForm.notify}
                  onChange={(e) =>
                    setRequestForm((prev) => ({ ...prev, notify: e.target.checked }))
                  }
                />
                Notify me if the song is ready
              </label>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <Button type="submit" variant="primary">
                  Send Request
                </Button>
                <Button type="button" variant="secondary" onClick={() => setView("home")}>
                  Back Home
                </Button>
              </div>
            </form>
          </Panel>
        )}

        {view === "message" && (
          <Panel
            title="Private Message"
            subtitle="This goes to a separate private admin area."
          >
            <form onSubmit={handleMessageSubmit} style={{ display: "grid", gap: 16, maxWidth: 760 }}>
              <Input
                label="Your name"
                value={messageForm.from}
                onChange={(e) =>
                  setMessageForm((prev) => ({ ...prev, from: e.target.value }))
                }
                placeholder="Your name"
              />
              <TextArea
                label="Message"
                value={messageForm.message}
                onChange={(e) =>
                  setMessageForm((prev) => ({ ...prev, message: e.target.value }))
                }
                placeholder="Write your message here..."
              />
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <Button type="submit" variant="primary">
                  Send Message
                </Button>
                <Button type="button" variant="secondary" onClick={() => setView("home")}>
                  Back Home
                </Button>
              </div>
            </form>
          </Panel>
        )}

        {view === "login" && !adminLoggedIn && (
          <Panel title="Admin Login" subtitle="Use this to open the private admin dashboard.">
            <form onSubmit={handleAdminLogin} style={{ display: "grid", gap: 16, maxWidth: 460 }}>
              <Input
                type="password"
                label="Password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Enter admin password"
              />
              {loginError ? (
                <div
                  style={{
                    padding: 14,
                    borderRadius: 16,
                    background: "rgba(220,38,38,0.12)",
                    border: "1px solid rgba(248,113,113,0.24)",
                    color: "#fca5a5",
                  }}
                >
                  {loginError}
                </div>
              ) : null}

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
              subtitle="Overview of requests, songs, and messages."
              right={
                <Button variant="secondary" onClick={handleLogout}>
                  Logout
                </Button>
              }
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 14,
                }}
              >
                <StatPill label="Songs Uploaded" value={songs.length} />
                <StatPill label="Pending Requests" value={pendingRequests} />
                <StatPill label="Done Requests" value={doneRequests} />
                <StatPill label="New Messages" value={newMessages} />
              </div>
            </Panel>

            <Panel title="Admin Upload Panel" subtitle="Add a new song to the collection.">
              <form
                onSubmit={handleAddSong}
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                  gap: 16,
                }}
              >
                <Input
                  label="Song title"
                  value={newSong.title}
                  onChange={(e) => setNewSong((p) => ({ ...p, title: e.target.value }))}
                />

                <Input
                  label="Artist"
                  value={newSong.artist}
                  onChange={(e) => setNewSong((p) => ({ ...p, artist: e.target.value }))}
                />

                <Input
                  label="Genre"
                  value={newSong.genre}
                  onChange={(e) => setNewSong((p) => ({ ...p, genre: e.target.value }))}
                />

                <Select
                  label="Collection"
                  value={newSong.visibility}
                  onChange={(e) => setNewSong((p) => ({ ...p, visibility: e.target.value }))}
                >
                  <option value="public" style={{ color: "black" }}>
                    Main website / Public
                  </option>
                  <option value="private" style={{ color: "black" }}>
                    Private collection
                  </option>
                </Select>

                <div>
                  <div style={{ marginBottom: 8, fontSize: 14, color: "rgba(255,255,255,0.82)" }}>
                    Upload cover image
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) =>
                      setNewSongFiles((prev) => ({
                        ...prev,
                        coverFile: e.target.files?.[0] || null,
                      }))
                    }
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      borderRadius: 16,
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: "rgba(10,15,28,0.65)",
                      color: "white",
                      boxSizing: "border-box",
                    }}
                  />
                  <div style={{ marginTop: 6, fontSize: 12, color: "rgba(255,255,255,0.58)" }}>
                    Image will upload to Cloudflare storage.
                  </div>
                </div>

                <div>
                  <div style={{ marginBottom: 8, fontSize: 14, color: "rgba(255,255,255,0.82)" }}>
                    Upload MP3 song
                  </div>
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={(e) =>
                      setNewSongFiles((prev) => ({
                        ...prev,
                        audioFile: e.target.files?.[0] || null,
                      }))
                    }
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      borderRadius: 16,
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: "rgba(10,15,28,0.65)",
                      color: "white",
                      boxSizing: "border-box",
                    }}
                  />
                  <div style={{ marginTop: 6, fontSize: 12, color: "rgba(255,255,255,0.58)" }}>
                    MP3 will upload to Cloudflare storage.
                  </div>
                </div>

                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    paddingTop: 34,
                    color: "rgba(255,255,255,0.85)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={newSong.featured}
                    onChange={(e) =>
                      setNewSong((p) => ({ ...p, featured: e.target.checked }))
                    }
                  />
                  Featured song
                </label>

                <div style={{ gridColumn: "1 / -1" }}>
                  <TextArea
                    label="Lyrics"
                    value={newSong.lyrics}
                    onChange={(e) =>
                      setNewSong((p) => ({ ...p, lyrics: e.target.value }))
                    }
                    placeholder="Paste lyrics here..."
                    style={{ minHeight: 180 }}
                  />
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <Button type="submit" variant="primary" disabled={isUploading}>
                    {isUploading ? "Uploading..." : "Upload Song"}
                  </Button>
                </div>
              </form>
            </Panel>

            <Panel title="Song Library" subtitle="Compact view of your uploaded songs, including private ones.">
              <div style={{ display: "grid", gap: 12 }}>
                {adminSongs.length > 0 ? (
                  adminSongs.map((song) => (
                    <SongRow
                      key={song.id}
                      song={song}
                      isAdmin
                      onOpenPlayer={openSongPlayer}
                      onDownloadSong={downloadSong}
                      onDownloadLyrics={downloadLyrics}
                      onDelete={handleDeleteSong}
                      onCopyLink={copySongLink}
                    />
                  ))
                ) : (
                  <div style={{ color: "rgba(255,255,255,0.72)" }}>No songs uploaded yet.</div>
                )}
              </div>
            </Panel>

            <Panel title="Private Messages" subtitle="Messages sent from the site.">
              <div style={{ display: "grid", gap: 14 }}>
                {messages.length === 0 ? (
                  <div style={{ color: "rgba(255,255,255,0.72)" }}>No messages yet.</div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      style={{
                        padding: 16,
                        borderRadius: 18,
                        background: "rgba(10,15,28,0.52)",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                          flexWrap: "wrap",
                        }}
                      >
                        <div>
                          <strong>{msg.from}</strong>
                          <div style={{ color: "rgba(255,255,255,0.65)", marginTop: 4 }}>
                            {formatDate(msg.createdAt)} • {msg.status}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          {msg.status !== "read" ? (
                            <Button variant="success" onClick={() => markMessageRead(msg.id)}>
                              Mark Read
                            </Button>
                          ) : null}
                          <Button variant="danger" onClick={() => deleteMessage(msg.id)}>
                            Delete
                          </Button>
                        </div>
                      </div>
                      <p style={{ margin: "14px 0 0", lineHeight: 1.55 }}>{msg.message}</p>
                    </div>
                  ))
                )}
              </div>
            </Panel>

            <Panel title="Song Requests" subtitle="Requests submitted from the public page.">
              <div style={{ display: "grid", gap: 14 }}>
                {requests.length === 0 ? (
                  <div style={{ color: "rgba(255,255,255,0.72)" }}>No requests yet.</div>
                ) : (
                  requests.map((req) => (
                    <div
                      key={req.id}
                      style={{
                        padding: 16,
                        borderRadius: 18,
                        background: "rgba(10,15,28,0.52)",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                          flexWrap: "wrap",
                        }}
                      >
                        <div>
                          <strong>{req.title}</strong>
                          <div style={{ color: "rgba(255,255,255,0.65)", marginTop: 4 }}>
                            by {req.name} • {formatDate(req.createdAt)}
                          </div>
                          {req.email ? (
                            <div style={{ color: "rgba(255,255,255,0.58)", marginTop: 4, fontSize: 14 }}>
                              {req.email} {req.notify ? "• wants notification" : ""}
                            </div>
                          ) : null}
                        </div>
                        <Button
                          variant={req.status === "done" ? "secondary" : "success"}
                          onClick={() => toggleRequestStatus(req.id)}
                        >
                          {req.status === "done" ? "Mark Pending" : "Mark Done"}
                        </Button>
                      </div>
                      {req.details ? (
                        <p style={{ margin: "14px 0 0", lineHeight: 1.55 }}>{req.details}</p>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </Panel>
          </div>
        )}

        {view === "admin" && !adminLoggedIn && (
          <Panel title="Admin Locked" subtitle="You need to log in first.">
            <Button variant="primary" onClick={() => setView("login")}>
              Go to Login
            </Button>
          </Panel>
        )}
      </div>

      {playerSong && !playerMinimized ? (
        <PlayerModal
          song={playerSong}
          onClose={closePlayer}
          onMinimize={minimizePlayer}
          isPlaying={isPlaying}
          currentTime={playerCurrentTime}
          duration={playerDuration}
          volume={volume}
          isMuted={isMuted}
          onPlayPause={handlePlayPause}
          onSeek={handleSeek}
          onVolumeChange={handleVolumeChange}
          onToggleMute={handleToggleMute}
          isMobile={isMobile}
        />
      ) : null}

      {playerSong && playerMinimized ? (
        <MiniPlayer
          song={playerSong}
          onExpand={expandPlayer}
          onClose={closePlayer}
          isPlaying={isPlaying}
          currentTime={playerCurrentTime}
          duration={playerDuration}
          volume={volume}
          isMuted={isMuted}
          onPlayPause={handlePlayPause}
          onSeek={handleSeek}
          onVolumeChange={handleVolumeChange}
          onToggleMute={handleToggleMute}
        />
      ) : null}
    </div>
  );
}

export default App;