import React, { useEffect, useMemo, useRef, useState } from "react";
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
    background: "linear-gradient(180deg, rgba(23,33,58,0.92), rgba(16,24,45,0.96))",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 26,
    boxShadow: "0 18px 60px rgba(0,0,0,0.28)",
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
    whiteSpace: "nowrap",
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
  onEdit,
}) {
  const songTypeLabel = getSongTypeLabel(song);

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
          {song.artist} • {songTypeLabel} • Added {formatDate(song.createdAt)}
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
              {song.artist} • {getSongTypeLabel(song)}
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

            <div style={{ marginTop: 14, color: "rgba(255,255,255,0.76)", fontSize: 14 }}>
              {getSongTypeLabel(song)}
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
  onNext,
  onPrevious,
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
          padding: 10,
          borderRadius: 18,
          background: "linear-gradient(180deg, rgba(18,25,46,0.96), rgba(11,17,34,0.98))",
        }),
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: 10,
          alignItems: "center",
        }}
      >
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
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 15,
                  lineHeight: 1.2,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {song.title}
              </div>

              <div
                style={{
                  color: "rgba(255,255,255,0.68)",
                  fontSize: 13,
                  lineHeight: 1.2,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  marginTop: 2,
                }}
              >
                <div
  style={{
    fontWeight: 700,
    fontSize: 15,
    lineHeight: 1.2,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  }}
>
  {song.title}
</div>

<div
  style={{
    color: "rgba(255,255,255,0.68)",
    fontSize: 13,
    lineHeight: 1.2,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    marginTop: 2,
  }}
>
  {song.artist} • {getSongTypeLabel(song)}
</div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Button
                variant="secondary"
                onClick={onPrevious}
                style={{ padding: "7px 10px", fontSize: 13 }}
              >
                ⏮
              </Button>

              <Button
                variant="secondary"
                onClick={onPlayPause}
                style={{ padding: "7px 10px", fontSize: 13 }}
              >
                {isPlaying ? "Pause" : "Play"}
              </Button>

              <Button
                variant="secondary"
                onClick={onNext}
                style={{ padding: "7px 10px", fontSize: 13 }}
              >
                ⏭
              </Button>

              <Button
                variant="secondary"
                onClick={onExpand}
                style={{ padding: "7px 10px", fontSize: 13 }}
              >
                Expand
              </Button>

              <Button
                variant="secondary"
                onClick={onClose}
                style={{ padding: "7px 10px", fontSize: 13 }}
              >
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
}

async function fetchSongsFromCloudflare() {
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

async function loginAdmin(password) {
  const response = await fetch("/api/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password }),
  });

  const text = await response.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error("Login endpoint returned invalid response");
  }

  if (!response.ok) {
    throw new Error(data.error || "Wrong password.");
  }

  return data;
}

function App() {
  const [songs, setSongs] = useState(() => {
    clearOldDemoDataOnce();
    return [];
  });

  const [editingSongId, setEditingSongId] = useState(null);
  const [hasUnsavedSongChanges, setHasUnsavedSongChanges] = useState(false);
  const [editingOriginalSong, setEditingOriginalSong] = useState(null);

  const [requests, setRequests] = useState([]);
  const [messages, setMessages] = useState([]);
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
  const [requestFilter, setRequestFilter] = useState("all");
  const [adminSongFilter, setAdminSongFilter] = useState("all");
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
    requestedBy: "",
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
    delivery: "public",
  });

  const [requestSent, setRequestSent] = useState(false);

  const [messageForm, setMessageForm] = useState({
    from: "",
    message: "",
  });

  function resetSongForm() {
    setNewSong({
      title: "",
      artist: "DJ-Buang",
      requestedBy: "",
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

    setEditingSongId(null);
    setEditingOriginalSong(null);
    setHasUnsavedSongChanges(false);

    const coverInput = document.getElementById("song-cover-input");
    const audioInput = document.getElementById("song-audio-input");

    if (coverInput) coverInput.value = "";
    if (audioInput) audioInput.value = "";
  }

  function startEditSong(song) {
    if (
      editingSongId &&
      hasUnsavedSongChanges &&
      editingSongId !== song.id
    ) {
      const confirmed = window.confirm(
        "You have unsaved changes. Switch songs and lose those changes?"
      );
      if (!confirmed) return;
    }

    setEditingSongId(song.id);
    setEditingOriginalSong(song);

    setNewSong({
      title: song.title || "",
      artist: song.artist || "DJ-Buang",
      requestedBy: song.requestedBy || "",
      coverUrl: song.coverUrl || "",
      audioUrl: song.audioUrl || "",
      lyrics: song.lyrics || "",
      featured: !!song.featured,
      visibility: song.visibility || "public",
    });

    setNewSongFiles({
      coverFile: null,
      audioFile: null,
    });

    setHasUnsavedSongChanges(false);

    const coverInput = document.getElementById("song-cover-input");
    const audioInput = document.getElementById("song-audio-input");

    if (coverInput) coverInput.value = "";
    if (audioInput) audioInput.value = "";
  }

  function cancelEditSong() {
    resetSongForm();
  }

  useEffect(() => {
    let cancelled = false;

    async function loadSongs() {
      try {
        const cloudSongs = await fetchSongsFromCloudflare();

        if (!cancelled) {
          const normalizedSongs = cloudSongs.map(normalizeSong);

          const { data: likesData, error: likesError } = await supabase
            .from("song_likes")
            .select("*");

          const likesMap = new Map(
            (likesData || []).map((row) => [row.song_id, Number(row.likes || 0)])
          );

          const songsWithLiveLikes = normalizedSongs.map((song) => ({
            ...song,
            likes: likesMap.has(song.id) ? likesMap.get(song.id) : Number(song.likes || 0),
          }));

          if (likesError) {
            console.error("Could not load live likes:", likesError);
          }

          setSongs(songsWithLiveLikes);
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
    async function loadRequestsAndMessages() {
      const { data: requestsData, error: requestsError } = await supabase
        .from("song_requests")
        .select("*")
        .order("created_at", { ascending: false });

      if (!requestsError && requestsData) {
        setRequests(
          requestsData.map((r) => ({
            id: r.id,
            name: r.requester_name,
            title: r.song_name,
            details: r.details,
            email: r.email,
            notify: r.notify,
            delivery: r.delivery,
            linkedSongId: r.linked_song_id,
            status: r.status,
            createdAt: r.created_at,
          }))
        );
      } else if (requestsError) {
        console.error("Could not load requests:", requestsError);
      }

      const { data: messagesData, error: messagesError } = await supabase
        .from("private_messages")
        .select("*")
        .order("created_at", { ascending: false });

      if (!messagesError && messagesData) {
        setMessages(
          messagesData.map((m) => ({
            id: m.id,
            from: m.sender_name,
            message: m.message,
            status: m.status,
            createdAt: m.created_at,
          }))
        );
      } else if (messagesError) {
        console.error("Could not load messages:", messagesError);
      }
    }

    loadRequestsAndMessages();
  }, []);

  useEffect(() => {
    const requestsChannel = supabase
      .channel("live-song-requests")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "song_requests" },
        async () => {
          const { data, error } = await supabase
            .from("song_requests")
            .select("*")
            .order("created_at", { ascending: false });

          if (!error && data) {
            setRequests(
              data.map((r) => ({
                id: r.id,
                name: r.requester_name,
                title: r.song_name,
                details: r.details,
                email: r.email,
                notify: r.notify,
                delivery: r.delivery,
                linkedSongId: r.linked_song_id,
                status: r.status,
                createdAt: r.created_at,
              }))
            );
          }
        }
      )
      .subscribe();

    const messagesChannel = supabase
      .channel("live-private-messages")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "private_messages" },
        async () => {
          const { data, error } = await supabase
            .from("private_messages")
            .select("*")
            .order("created_at", { ascending: false });

          if (!error && data) {
            setMessages(
              data.map((m) => ({
                id: m.id,
                from: m.sender_name,
                message: m.message,
                status: m.status,
                createdAt: m.created_at,
              }))
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(requestsChannel);
      supabase.removeChannel(messagesChannel);
    };
  }, []);

  useEffect(() => {
    const likesChannel = supabase
      .channel("live-song-likes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "song_likes" },
        async () => {
          const { data: likesData, error: likesError } = await supabase
            .from("song_likes")
            .select("*");

          if (likesError) {
            console.error("Could not refresh live likes:", likesError);
            return;
          }

          const likesMap = new Map(
            (likesData || []).map((row) => [row.song_id, Number(row.likes || 0)])
          );

          setSongs((prev) =>
            prev.map((song) => ({
              ...song,
              likes: likesMap.has(song.id) ? likesMap.get(song.id) : Number(song.likes || 0),
            }))
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(likesChannel);
    };
  }, []);

  useEffect(() => {
    try {
      const safeSongs = songs.map((song) => ({
        id: song.id,
        title: song.title,
        artist: song.artist,
        requestedBy: song.requestedBy,
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
        (song.requestedBy || "").toLowerCase().includes(q)
    );
  }

  if (filterMode === "featured") {
    list = list.filter((song) => song.featured);
    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } else if (filterMode === "most-liked") {
    list.sort((a, b) => {
      if (!!b.featured !== !!a.featured) {
        return b.featured ? 1 : -1;
      }
      return (b.likes || 0) - (a.likes || 0);
    });
  } else if (filterMode === "requested") {
    list = list.filter((song) => isRequestedSong(song));
    list.sort((a, b) => {
      if (!!b.featured !== !!a.featured) {
        return b.featured ? 1 : -1;
      }
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  } else if (filterMode === "originals") {
    list = list.filter((song) => isOriginalSong(song));
    list.sort((a, b) => {
      if (!!b.featured !== !!a.featured) {
        return b.featured ? 1 : -1;
      }
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  } else {
    list.sort((a, b) => {
      if (!!b.featured !== !!a.featured) {
        return b.featured ? 1 : -1;
      }
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }

  return list;
}, [publicSongs, search, filterMode]);

  const adminSongs = useMemo(() => {
    let list = [...songs].map(normalizeSong);

    if (adminSongFilter === "public") {
      list = list.filter((song) => song.visibility === "public");
    } else if (adminSongFilter === "private") {
      list = list.filter((song) => song.visibility === "private");
    } else if (adminSongFilter === "requested") {
      list = list.filter((song) => isRequestedSong(song));
    } else if (adminSongFilter === "originals") {
      list = list.filter((song) => isOriginalSong(song));
    }

    return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [songs, adminSongFilter]);

  const topLikedSongs = useMemo(() => {
    return [...publicSongs].sort((a, b) => (b.likes || 0) - (a.likes || 0)).slice(0, 3);
  }, [publicSongs]);

  const filteredRequests = useMemo(() => {
    let list = [...requests];

    if (requestFilter === "pending") {
      list = list.filter((req) => req.status === "pending");
    } else if (requestFilter === "done") {
      list = list.filter((req) => req.status === "done");
    } else if (requestFilter === "public") {
      list = list.filter((req) => (req.delivery || "public") === "public");
    } else if (requestFilter === "private") {
      list = list.filter((req) => req.delivery === "private");
    }

    list.sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === "pending" ? -1 : 1;
      }
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    return list;
  }, [requests, requestFilter]);

  const pendingRequests = requests.filter((r) => r.status === "pending").length;
  const doneRequests = requests.filter((r) => r.status === "done").length;
  const newMessages = messages.filter((m) => m.status === "new").length;
  const totalLikes = songs.reduce((sum, song) => sum + (song.likes || 0), 0);

  const openPayPalDonation = () => {
    window.open(PAYPAL_URL, "_blank", "noopener,noreferrer");
  };

  const handleLikeSong = async (songId) => {
    const likedKey = `liked_${songId}`;
    if (localStorage.getItem(likedKey)) return;

    const currentSong = songs.find((song) => song.id === songId);
    const currentLikes = Number(currentSong?.likes || 0);
    const nextLikes = currentLikes + 1;

    const { error } = await supabase.from("song_likes").upsert(
      {
        song_id: songId,
        likes: nextLikes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "song_id" }
    );

    if (error) {
      alert("Could not save like.");
      console.error(error);
      return;
    }

    const { data: refreshedLikeRow } = await supabase
      .from("song_likes")
      .select("*")
      .eq("song_id", songId)
      .single();

    const finalLikes = Number(refreshedLikeRow?.likes || nextLikes);

    setSongs((prev) =>
      prev.map((song) =>
        song.id === songId ? { ...song, likes: finalLikes } : song
      )
    );

    localStorage.setItem(likedKey, "true");
  };

  const handleAdminLogin = async (e) => {
    e.preventDefault();

    try {
      await loginAdmin(adminPassword);
      setAdminLoggedIn(true);
      setView("admin");
      setLoginError("");
      setAdminPassword("");
    } catch (error) {
      setLoginError(error.message || "Wrong password.");
    }
  };

  const handleLogout = () => {
    setAdminLoggedIn(false);
    setView("home");
  };

  const handleAddSong = async (e) => {
    e.preventDefault();

    if (!newSong.title.trim()) {
      alert("Please enter a song title.");
      return;
    }

    if (!editingSongId && !newSong.audioUrl && !newSongFiles.audioFile) {
      alert("Please upload an audio file for a new song.");
      return;
    }

    try {
      setIsUploading(true);

      let uploadedCoverUrl = editingOriginalSong?.coverUrl || newSong.coverUrl || "";
      let uploadedAudioUrl = editingOriginalSong?.audioUrl || newSong.audioUrl || "";

      if (newSongFiles.coverFile) {
        uploadedCoverUrl = await uploadFileToCloudflare(newSongFiles.coverFile);
      }

      if (newSongFiles.audioFile) {
        uploadedAudioUrl = await uploadFileToCloudflare(newSongFiles.audioFile);
      }

      const item = normalizeSong({
        id: editingSongId || makeSongId(),
        title: newSong.title.trim(),
        artist: newSong.artist.trim() || "DJ-Buang",
        requestedBy: newSong.requestedBy.trim(),
        coverUrl: uploadedCoverUrl,
        audioUrl: uploadedAudioUrl,
        lyrics: newSong.lyrics.trim(),
        likes: editingOriginalSong?.likes || 0,
        featured: !!newSong.featured,
        visibility: newSong.visibility,
        createdAt: editingOriginalSong?.createdAt || new Date().toISOString(),
        status: editingOriginalSong?.status || "published",
      });

      await saveSongToCloudflare(item);

      if (editingSongId) {
        setSongs((prev) =>
          prev.map((song) => (song.id === editingSongId ? item : song))
        );

        await autoCleanReplacedFiles({
          oldSong: editingOriginalSong,
          newCoverUrl: uploadedCoverUrl,
          newAudioUrl: uploadedAudioUrl,
        });

        alert("Song updated!");
      } else {
        setSongs((prev) => [item, ...prev]);
        alert("Song uploaded!");
      }

      setHasUnsavedSongChanges(false);
      resetSongForm();
    } catch (error) {
      alert(error.message || "Save failed");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteSong = async (id) => {
    const songToDelete = songs.find((song) => song.id === id);
    if (!songToDelete) return;

    const confirmed = window.confirm(`Delete "${songToDelete.title}"?`);
    if (!confirmed) return;

    try {
      await deleteSongFromCloudflare(id);
      setSongs((prev) => prev.filter((song) => song.id !== id));
      await autoCleanDeletedSongFiles(songToDelete);

      if (editingSongId === id) {
        resetSongForm();
      }

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

  const handleRequestSubmit = async (e) => {
    e.preventDefault();

    if (!requestForm.name.trim() || !requestForm.title.trim()) return;

    const email = requestForm.email.trim();

    if (requestForm.notify && !email) {
      alert("Please enter your email address if you want notification.");
      return;
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      alert("Please enter a valid email address.");
      return;
    }

    const payload = {
      requester_name: requestForm.name.trim(),
      song_name: requestForm.title.trim(),
      details: requestForm.details.trim(),
      email,
      notify: requestForm.notify,
      delivery: requestForm.delivery || "public",
      linked_song_id: "",
      status: "pending",
    };

    const { data, error } = await supabase
      .from("song_requests")
      .insert([payload])
      .select()
      .single();

    if (error) {
      alert("Could not send request. Please try again.");
      console.error(error);
      return;
    }

    const newRequest = {
      id: data.id,
      name: data.requester_name,
      title: data.song_name,
      details: data.details,
      email: data.email,
      notify: data.notify,
      delivery: data.delivery,
      linkedSongId: data.linked_song_id,
      status: data.status,
      createdAt: data.created_at,
    };

    setRequests((prev) => [newRequest, ...prev]);

    setRequestForm({
      name: "",
      title: "",
      details: "",
      email: "",
      notify: false,
      delivery: "public",
    });

    setRequestSent(true);
  };

  const handleMessageSubmit = async (e) => {
    e.preventDefault();
    if (!messageForm.from.trim() || !messageForm.message.trim()) return;

    const payload = {
      sender_name: messageForm.from.trim(),
      sender_email: "",
      message: messageForm.message.trim(),
      status: "new",
    };

    const { data, error } = await supabase
      .from("private_messages")
      .insert([payload])
      .select()
      .single();

    if (error) {
      alert("Could not send private message. Please try again.");
      console.error(error);
      return;
    }

    const newMessage = {
      id: data.id,
      from: data.sender_name,
      message: data.message,
      status: data.status,
      createdAt: data.created_at,
    };

    setMessages((prev) => [newMessage, ...prev]);
    setMessageForm({ from: "", message: "" });
    alert("Private message sent!");
  };

  const toggleRequestStatus = async (id) => {
    const req = requests.find((item) => item.id === id);
    if (!req) return;

    const nextStatus = req.status === "done" ? "pending" : "done";

    const { error } = await supabase
      .from("song_requests")
      .update({ status: nextStatus })
      .eq("id", id);

    if (error) {
      alert("Could not update request status.");
      console.error(error);
      return;
    }

    setRequests((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status: nextStatus } : item
      )
    );

    if (nextStatus !== "done") return;

    if (!req.email && !req.linkedSongId) {
      alert("Marked done, but no email and no song are attached yet.");
      return;
    }

    if (!req.email) {
      alert("Marked done, but no email was provided.");
      return;
    }

    if (!req.linkedSongId) {
      alert("Marked done, but no song is attached yet.");
      return;
    }

    const songUrl = `${window.location.origin}${window.location.pathname}?song=${req.linkedSongId}`;

    const message =
      req.delivery === "private"
        ? `Hi ${req.name || "there"}!

Your song is ready 🎶

Here is your private song link:
${songUrl}

Thanks for the request!
- DJ-Buang`
        : `Hi ${req.name || "there"}!

Your song is ready 🎶

It has been published on the DJ-Buang site.

Here is the song link:
${songUrl}

Thanks for the request!
- DJ-Buang`;

    try {
      await navigator.clipboard.writeText(message);
      alert("Marked done and reply copied!");
    } catch {
      alert("Marked done, but copy failed. Here is the reply:\n\n" + message);
    }
  };

  const attachSongToRequest = async (requestId, songId) => {
  const req = requests.find((item) => item.id === requestId);
  if (!req) return;

  const selectedSong = songs.find((song) => song.id === songId);

  const { error } = await supabase
    .from("song_requests")
    .update({ linked_song_id: songId })
    .eq("id", requestId);

  if (error) {
    alert("Could not attach song.");
    console.error(error);
    return;
  }

  setRequests((prev) =>
    prev.map((item) =>
      item.id === requestId ? { ...item, linkedSongId: songId } : item
    )
  );

  if (!songId || !selectedSong) return;

  const currentRequestedBy = (selectedSong.requestedBy || "").trim();
  const requesterName = (req.name || "").trim();

  if (currentRequestedBy || !requesterName) return;

  const updatedSong = normalizeSong({
    ...selectedSong,
    requestedBy: requesterName,
  });

  try {
    await saveSongToCloudflare(updatedSong);

    setSongs((prev) =>
      prev.map((song) => (song.id === songId ? updatedSong : song))
    );
  } catch (saveError) {
    console.error("Could not auto-fill requested by:", saveError);
    alert("Song attached, but could not auto-fill Requested by.");
  }
};

  const deleteRequest = async (id) => {
    const confirmed = window.confirm("Are you sure you want to delete this request?");
    if (!confirmed) return;

    const { error } = await supabase
      .from("song_requests")
      .delete()
      .eq("id", id);

    if (error) {
      alert("Could not delete request.");
      console.error(error);
      return;
    }

    setRequests((prev) => prev.filter((req) => req.id !== id));
  };

  const markMessageRead = async (id) => {
    const { error } = await supabase
      .from("private_messages")
      .update({ status: "read" })
      .eq("id", id);

    if (error) {
      alert("Could not mark message as read.");
      console.error(error);
      return;
    }

    setMessages((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: "read" } : item))
    );
  };

  const deleteMessage = async (id) => {
    const { error } = await supabase
      .from("private_messages")
      .delete()
      .eq("id", id);

    if (error) {
      alert("Could not delete message.");
      console.error(error);
      return;
    }

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

  const copyRequestReply = async (req) => {
    const selectedSongId = req.linkedSongId;

    if (!selectedSongId) {
      alert("Please select a song first for this request.");
      return;
    }

    const songUrl = `${window.location.origin}${window.location.pathname}?song=${selectedSongId}`;

    const message =
      req.delivery === "private"
        ? `Hi ${req.name || "there"}!

Your song is ready 🎶

Here is your private song link:
${songUrl}

Thanks for the request!
- DJ-Buang`
        : `Hi ${req.name || "there"}!

Your song is ready 🎶

It has been published on the DJ-Buang site.

Here is the song link:
${songUrl}

Thanks for the request!
- DJ-Buang`;

    try {
      await navigator.clipboard.writeText(message);
      alert("Reply with song link copied!");
    } catch {
      alert(message);
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

  const minimizePlayer = () => setPlayerMinimized(true);
  const expandPlayer = () => setPlayerMinimized(false);

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

const handleNextSong = () => {
  if (!playerSong || filteredSongs.length === 0) return;

  const currentIndex = filteredSongs.findIndex(
    (song) => song.id === playerSong.id
  );

  if (currentIndex === -1) return;

  const nextSong = filteredSongs[(currentIndex + 1) % filteredSongs.length];
  openSongPlayer(nextSong);
};

const handlePreviousSong = () => {
  if (!playerSong || filteredSongs.length === 0) return;

  const currentIndex = filteredSongs.findIndex(
    (song) => song.id === playerSong.id
  );

  if (currentIndex === -1) return;

  const previousSong =
    filteredSongs[
      (currentIndex - 1 + filteredSongs.length) % filteredSongs.length
    ];

  openSongPlayer(previousSong);
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

  const currentAudioName = editingOriginalSong?.audioUrl
    ? getFileNameFromUrl(editingOriginalSong.audioUrl)
    : "";

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
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setRequestSent(false);
                        setView("request");
                      }}
                    >
                      🗒 Song Request
                    </Button>
                    <Button variant="secondary" onClick={() => setView("message")}>
                      ✈ Private Message
                    </Button>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                    gap: 24,
                    marginTop: 6,
                    minWidth: isMobile ? "100%" : 260,
                  }}
                >
                  <Button
                    variant="secondary"
                    onClick={() => setView(adminLoggedIn ? "admin" : "login")}
                    style={{ minWidth: 110 }}
                  >
                    🔒 Admin
                  </Button>

                  <img
                    src="/hero-logo.png"
                    alt="DJ-BUANG logo"
                    style={{
                      width: isMobile ? "100%" : 300,
                      maxWidth: "100%",
                      height: "auto",
                      objectFit: "contain",
                      filter: "drop-shadow(0 10px 30px rgba(123, 92, 255, 0.45))",
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
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: isMobile ? "1fr" : "1fr 220px",
                      gap: 12,
                    }}
                  >
                    <Input
                      placeholder="Search songs, requested by, or artist"
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
                      <option value="requested" style={{ color: "black" }}>
                        Requested songs
                      </option>
                      <option value="originals" style={{ color: "black" }}>
                        DJ-BUANG originals
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
                                {getSongTypeLabel(song)}
                              </div>
                            </div>
                            <Badge>
  <span style={{ whiteSpace: "nowrap" }}>{song.likes} likes</span>
</Badge>
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
                    <Button
                      variant="primary"
                      onClick={() => {
                        setRequestSent(false);
                        setView("request");
                      }}
                    >
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
          <Panel title="Song Request" subtitle="Send a request and it will show up in the admin panel.">
            {requestSent && (
              <div
                style={{
                  padding: 18,
                  borderRadius: 18,
                  background: "rgba(34,197,94,0.15)",
                  border: "1px solid rgba(74,222,128,0.35)",
                  marginBottom: 18,
                  maxWidth: 760,
                }}
              >
                <strong>🎶 Request received!</strong>
                <div style={{ marginTop: 6, lineHeight: 1.5 }}>
                  Thanks for sending a request.
                  <br />
                  I’ll review it and attach your song here when it's ready.
                </div>
              </div>
            )}

            <form onSubmit={handleRequestSubmit} style={{ display: "grid", gap: 16, maxWidth: 760 }}>
              <Input
                label="Name"
                value={requestForm.name}
                onChange={(e) => setRequestForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Your name"
              />

              <Input
                label="Song title / idea"
                value={requestForm.title}
                onChange={(e) => setRequestForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Epic lobby anthem"
              />

              <TextArea
                label="Details"
                value={requestForm.details}
                onChange={(e) => setRequestForm((prev) => ({ ...prev, details: e.target.value }))}
                placeholder="Names, mood, style, references..."
              />

              <Select
                label="Do you want this song to be public on this site or sent to you privately?"
                value={requestForm.delivery}
                onChange={(e) => setRequestForm((prev) => ({ ...prev, delivery: e.target.value }))}
              >
                <option value="public" style={{ color: "black" }}>
                  Public on the site
                </option>
                <option value="private" style={{ color: "black" }}>
                  Send to me privately
                </option>
              </Select>

              <Input
                label="E-mail"
                type="email"
                value={requestForm.email}
                onChange={(e) => setRequestForm((prev) => ({ ...prev, email: e.target.value }))}
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
                  onChange={(e) => setRequestForm((prev) => ({ ...prev, notify: e.target.checked }))}
                />
                Notify me if the song is ready
              </label>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <Button type="submit" variant="primary">
                  Send Request
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setRequestSent(false);
                    setView("home");
                  }}
                >
                  Back Home
                </Button>
              </div>
            </form>
          </Panel>
        )}

        {view === "message" && (
          <Panel title="Private Message" subtitle="This goes to a separate private admin area.">
            <form onSubmit={handleMessageSubmit} style={{ display: "grid", gap: 16, maxWidth: 760 }}>
              <Input
                label="Your name"
                value={messageForm.from}
                onChange={(e) => setMessageForm((prev) => ({ ...prev, from: e.target.value }))}
                placeholder="Your name"
              />
              <TextArea
                label="Message"
                value={messageForm.message}
                onChange={(e) => setMessageForm((prev) => ({ ...prev, message: e.target.value }))}
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
                <StatPill label="Total Likes" value={totalLikes} />
                <StatPill label="Songs Uploaded" value={songs.length} />
                <StatPill label="Pending Requests" value={pendingRequests} />
                <StatPill label="Done Requests" value={doneRequests} />
                <StatPill label="New Messages" value={newMessages} />
              </div>
            </Panel>

            <Panel
              title={editingSongId ? "Edit Song" : "Admin Upload Panel"}
              subtitle={
                editingSongId
                  ? "Update details, keep current files, or replace only what you want."
                  : "Add a new song to the collection."
              }
            >
              {editingSongId && editingOriginalSong ? (
                <div
                  style={{
                    marginBottom: 18,
                    padding: 16,
                    borderRadius: 18,
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    display: "grid",
                    gap: 14,
                  }}
                >
                  <div>
                    <strong>Editing:</strong> {editingOriginalSong.title}
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: isMobile ? "1fr" : "140px 1fr",
                      gap: 14,
                      alignItems: "start",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.68)", marginBottom: 8 }}>
                        Current cover
                      </div>
                      <div
                        style={{
                          width: isMobile ? 120 : 140,
                          height: isMobile ? 120 : 140,
                          borderRadius: 16,
                          overflow: "hidden",
                          background: "rgba(255,255,255,0.05)",
                          border: "1px solid rgba(255,255,255,0.10)",
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        {editingOriginalSong.coverUrl ? (
                          <img
                            src={editingOriginalSong.coverUrl}
                            alt={editingOriginalSong.title}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        ) : (
                          <span style={{ fontSize: 30 }}>🎧</span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: "grid", gap: 10 }}>
                      <div
                        style={{
                          padding: 12,
                          borderRadius: 14,
                          background: "rgba(10,15,28,0.45)",
                          border: "1px solid rgba(255,255,255,0.08)",
                        }}
                      >
                        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.68)", marginBottom: 6 }}>
                          Current cover status
                        </div>
                        <div>{editingOriginalSong.coverUrl ? "✅ Cover uploaded" : "— No cover uploaded"}</div>
                      </div>

                      <div
                        style={{
                          padding: 12,
                          borderRadius: 14,
                          background: "rgba(10,15,28,0.45)",
                          border: "1px solid rgba(255,255,255,0.08)",
                        }}
                      >
                        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.68)", marginBottom: 6 }}>
                          Current audio
                        </div>
                        <div>
                          {editingOriginalSong.audioUrl
                            ? `✅ ${currentAudioName || "Audio uploaded"}`
                            : "— No audio uploaded"}
                        </div>
                      </div>

                      <div
                        style={{
                          padding: 12,
                          borderRadius: 14,
                          background: "rgba(10,15,28,0.45)",
                          border: "1px solid rgba(255,255,255,0.08)",
                        }}
                      >
                        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.68)", marginBottom: 6 }}>
                          Song type
                        </div>
                        <div>{getSongTypeLabel(editingOriginalSong)}</div>
                      </div>

                      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.68)" }}>
                        Leave the file inputs empty to keep the current cover and audio.
                      </div>

                      {hasUnsavedSongChanges ? (
                        <div style={{ marginTop: 6, color: "#facc15", fontSize: 13, fontWeight: 600 }}>
                          ⚠ You have unsaved changes
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}

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
                  onChange={(e) => {
                    setNewSong((p) => ({ ...p, title: e.target.value }));
                    if (editingSongId) setHasUnsavedSongChanges(true);
                  }}
                />

                <Input
                  label="Artist"
                  value={newSong.artist}
                  onChange={(e) => {
                    setNewSong((p) => ({ ...p, artist: e.target.value }));
                    if (editingSongId) setHasUnsavedSongChanges(true);
                  }}
                />

                <Input
                  label="Requested by"
                  value={newSong.requestedBy}
                  onChange={(e) => {
                    setNewSong((p) => ({ ...p, requestedBy: e.target.value }));
                    if (editingSongId) setHasUnsavedSongChanges(true);
                  }}
                  placeholder="Leave empty for DJ-BUANG original"
                />

                <Select
                  label="Collection"
                  value={newSong.visibility}
                  onChange={(e) => {
                    setNewSong((p) => ({ ...p, visibility: e.target.value }));
                    if (editingSongId) setHasUnsavedSongChanges(true);
                  }}
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
                    {editingSongId ? "Replace cover image (optional)" : "Upload cover image"}
                  </div>
                  <input
                    id="song-cover-input"
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      setNewSongFiles((prev) => ({
                        ...prev,
                        coverFile: e.target.files?.[0] || null,
                      }));
                      if (editingSongId) setHasUnsavedSongChanges(true);
                    }}
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
                    {editingSongId
                      ? "Only choose a new image if you want to replace the current cover."
                      : "Image will upload to Cloudflare storage."}
                  </div>
                </div>

                <div>
                  <div style={{ marginBottom: 8, fontSize: 14, color: "rgba(255,255,255,0.82)" }}>
                    {editingSongId ? "Replace MP3 song (optional)" : "Upload MP3 song"}
                  </div>
                  <input
                    id="song-audio-input"
                    type="file"
                    accept="audio/*"
                    onChange={(e) => {
                      setNewSongFiles((prev) => ({
                        ...prev,
                        audioFile: e.target.files?.[0] || null,
                      }));
                      if (editingSongId) setHasUnsavedSongChanges(true);
                    }}
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
                    {editingSongId
                      ? "Only choose a new audio file if you want to replace the current song."
                      : "MP3 will upload to Cloudflare storage."}
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
                    onChange={(e) => {
                      setNewSong((p) => ({ ...p, featured: e.target.checked }));
                      if (editingSongId) setHasUnsavedSongChanges(true);
                    }}
                  />
                  Featured song
                </label>

                <div style={{ gridColumn: "1 / -1" }}>
                  <TextArea
                    label="Lyrics"
                    value={newSong.lyrics}
                    onChange={(e) => {
                      setNewSong((p) => ({ ...p, lyrics: e.target.value }));
                      if (editingSongId) setHasUnsavedSongChanges(true);
                    }}
                    placeholder="Paste lyrics here..."
                    style={{ minHeight: 180 }}
                  />
                </div>

                <div style={{ gridColumn: "1 / -1", display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <Button type="submit" variant="primary" disabled={isUploading}>
                    {isUploading
                      ? editingSongId
                        ? "Saving..."
                        : "Uploading..."
                      : editingSongId
                      ? "Save Changes"
                      : "Upload Song"}
                  </Button>

                  {editingSongId ? (
                    <Button type="button" variant="secondary" onClick={cancelEditSong}>
                      Cancel Edit
                    </Button>
                  ) : null}
                </div>
              </form>
            </Panel>

            <Panel
              title="Song Library"
              subtitle="Compact view of your uploaded songs, including private ones."
              right={
                <div style={{ minWidth: 220 }}>
                  <Select value={adminSongFilter} onChange={(e) => setAdminSongFilter(e.target.value)}>
                    <option value="all" style={{ color: "black" }}>
                      All songs
                    </option>
                    <option value="public" style={{ color: "black" }}>
                      Public songs
                    </option>
                    <option value="private" style={{ color: "black" }}>
                      Private songs
                    </option>
                    <option value="requested" style={{ color: "black" }}>
                      Requested songs
                    </option>
                    <option value="originals" style={{ color: "black" }}>
                      Originals
                    </option>
                  </Select>
                </div>
              }
            >
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
                      onEdit={startEditSong}
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
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                <Button
                  variant={requestFilter === "all" ? "primary" : "secondary"}
                  onClick={() => setRequestFilter("all")}
                >
                  All
                </Button>

                <Button
                  variant={requestFilter === "pending" ? "primary" : "secondary"}
                  onClick={() => setRequestFilter("pending")}
                >
                  Pending
                </Button>

                <Button
                  variant={requestFilter === "done" ? "primary" : "secondary"}
                  onClick={() => setRequestFilter("done")}
                >
                  Done
                </Button>

                <Button
                  variant={requestFilter === "public" ? "primary" : "secondary"}
                  onClick={() => setRequestFilter("public")}
                >
                  Public
                </Button>

                <Button
                  variant={requestFilter === "private" ? "primary" : "secondary"}
                  onClick={() => setRequestFilter("private")}
                >
                  Private
                </Button>
              </div>

              <div style={{ display: "grid", gap: 14 }}>
                {filteredRequests.length === 0 ? (
                  <div style={{ color: "rgba(255,255,255,0.72)" }}>No requests yet.</div>
                ) : (
                  filteredRequests.map((req) => {
                    const isReady = req.status !== "done" && req.linkedSongId && req.email;

                    return (
                      <div
                        key={req.id}
                        style={{
                          padding: 16,
                          borderRadius: 18,
                          background: isReady
                            ? "rgba(20,83,45,0.28)"
                            : "rgba(10,15,28,0.52)",
                          border: isReady
                            ? "1px solid rgba(134,239,172,0.35)"
                            : "1px solid rgba(255,255,255,0.08)",
                          boxShadow: isReady
                            ? "0 0 0 1px rgba(134,239,172,0.08), 0 12px 30px rgba(34,197,94,0.10)"
                            : "none",
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
                              by {req.name} • {timeAgo(req.createdAt)}
                            </div>

                            <div
                              style={{
                                color: req.status === "done" ? "#86efac" : "#facc15",
                                marginTop: 6,
                                fontSize: 14,
                                fontWeight: 700,
                              }}
                            >
                              Status: {req.status === "done" ? "Done" : "Pending"}
                            </div>

                            <div
                              style={{
                                color: "rgba(255,255,255,0.72)",
                                marginTop: 4,
                                fontSize: 14,
                                fontWeight: 600,
                              }}
                            >
                              Delivery: {req.delivery === "private" ? "Private" : "Public"}
                            </div>

                            <div
                              style={{
                                color: req.linkedSongId ? "#86efac" : "#f87171",
                                marginTop: 4,
                                fontSize: 14,
                                fontWeight: 600,
                              }}
                            >
                              Linked song{" "}
                              {req.linkedSongId ? (
                                <span
                                  onClick={() => {
                                    const song = songs.find((s) => s.id === req.linkedSongId);
                                    if (song) openSongPlayer(song);
                                  }}
                                  style={{
                                    cursor: "pointer",
                                    textDecoration: "underline",
                                  }}
                                >
                                  {songs.find((song) => song.id === req.linkedSongId)?.title || "Unknown song"}
                                </span>
                              ) : (
                                "No song attached yet"
                              )}
                            </div>

                            {req.status !== "done" && (!req.linkedSongId || !req.email) && (
                              <div
                                style={{
                                  color: "#facc15",
                                  marginTop: 4,
                                  fontSize: 13,
                                  fontWeight: 600,
                                }}
                              >
                                ⚠ Missing:{" "}
                                {[!req.linkedSongId && "song", !req.email && "email"]
                                  .filter(Boolean)
                                  .join(" + ")}
                              </div>
                            )}

                            {req.status !== "done" && req.linkedSongId && req.email && (
                              <div
                                style={{
                                  color: "#86efac",
                                  marginTop: 4,
                                  fontSize: 13,
                                  fontWeight: 600,
                                }}
                              >
                                ✅ Ready to send reply
                              </div>
                            )}

                            <div style={{ marginTop: 12, maxWidth: 320 }}>
                              <Select
                                label="Attach uploaded song"
                                value={req.linkedSongId || ""}
                                onChange={(e) => attachSongToRequest(req.id, e.target.value)}
                              >
                                <option value="" style={{ color: "black" }}>
                                  Select a song
                                </option>

                                {songs
                                  .map(normalizeSong)
                                  .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                                  .map((song) => (
                                    <option key={song.id} value={song.id} style={{ color: "black" }}>
                                      {song.title} — {song.artist}
                                    </option>
                                  ))}
                              </Select>
                            </div>

                            {req.email ? (
                              <div
                                style={{
                                  color: "rgba(255,255,255,0.58)",
                                  marginTop: 4,
                                  fontSize: 14,
                                }}
                              >
                                {req.email} {req.notify ? "• wants notification" : ""}
                              </div>
                            ) : null}
                          </div>

                          <div style={{ display: "grid", gap: 10 }}>
                            <Button
                              variant={req.status === "done" ? "secondary" : "success"}
                              onClick={() => toggleRequestStatus(req.id)}
                            >
                              {req.status === "done" ? "Mark Pending" : "Mark Done"}
                            </Button>

                            {req.email ? (
                              <Button
                                variant="secondary"
                                onClick={() => copyRequestReply(req)}
                              >
                                Copy Reply With Link
                              </Button>
                            ) : null}

                            <Button
                              variant="danger"
                              onClick={() => deleteRequest(req.id)}
                            >
                              Delete
                            </Button>
                          </div>
                        </div>

                        {req.details ? (
                          <p style={{ margin: "14px 0 0", lineHeight: 1.55 }}>{req.details}</p>
                        ) : null}
                      </div>
                    );
                  })
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
  onNext={handleNextSong}
  onPrevious={handlePreviousSong}
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