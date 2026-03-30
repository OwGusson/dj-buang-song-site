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
      sortOrder: Number.isFinite(normalized.sortOrder)
        ? normalized.sortOrder
        : index + 1,
    };
  });
}

function compareSongsForDisplay(a, b) {
  if (!!b.featured !== !!a.featured) {
    return b.featured ? 1 : -1;
  }

  const aOrder = Number.isFinite(Number(a.sortOrder))
    ? Number(a.sortOrder)
    : Number.MAX_SAFE_INTEGER;
  const bOrder = Number.isFinite(Number(b.sortOrder))
    ? Number(b.sortOrder)
    : Number.MAX_SAFE_INTEGER;

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
    background:
      "linear-gradient(180deg, rgba(13,18,34,0.96), rgba(8,12,24,0.98))",
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
        <div
          style={{ marginBottom: 8, fontSize: 14, color: "rgba(255,255,255,0.82)" }}
        >
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
        <div
          style={{
            marginTop: 8,
            fontSize: 13,
            color: "rgba(255,255,255,0.62)",
            lineHeight: 1.45,
          }}
        >
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
        <div
          style={{ marginBottom: 8, fontSize: 14, color: "rgba(255,255,255,0.82)" }}
        >
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
        <div
          style={{ marginBottom: 8, fontSize: 14, color: "rgba(255,255,255,0.82)" }}
        >
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
      background:
        "linear-gradient(135deg, rgba(250,204,21,0.18), rgba(251,191,36,0.08))",
      border: "1px solid rgba(250,204,21,0.28)",
      boxShadow: "0 8px 24px rgba(250,204,21,0.12)",
    },
    new: {
      color: "#93c5fd",
      background:
        "linear-gradient(135deg, rgba(59,130,246,0.18), rgba(96,165,250,0.08))",
      border: "1px solid rgba(96,165,250,0.26)",
      boxShadow: "0 8px 24px rgba(59,130,246,0.12)",
    },
    default: {
      color: "#d8b4fe",
      background:
        "linear-gradient(135deg, rgba(168,85,247,0.16), rgba(192,132,252,0.07))",
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
        boxShadow: isFeatured ? "0 10px 28px rgba(250,204,21,0.08)" : "none",
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
          background:
            "linear-gradient(135deg, rgba(89,55,150,0.8), rgba(41,73,120,0.8))",
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
          <h3 style={{ margin: 0, fontSize: isMobile ? 16 : 19, lineHeight: 1.25 }}>
            {song.title}
          </h3>

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
  isMobile = false,
  hidePlayButton = false,
  showVolumeSlider = true,
  onToggleVolumeSlider,
}) {
  const volumeIcon = isMuted || volume === 0 ? "🔇" : "🔊";

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
        {!hidePlayButton ? (
          <Button
            variant="primary"
            onClick={onPlayPause}
            style={{
              padding: compact ? "9px 14px" : undefined,
              minWidth: compact && isMobile ? 96 : undefined,
            }}
          >
            {isPlaying ? "Pause" : "Play"}
          </Button>
        ) : null}

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
          onClick={onToggleVolumeSlider || onToggleMute}
          style={{
            padding: compact ? "8px 12px" : "10px 14px",
            fontSize: compact ? 14 : 15,
            minWidth: compact && isMobile ? 54 : undefined,
          }}
        >
          {volumeIcon}
        </Button>

        {showVolumeSlider ? (
          <>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={isMuted ? 0 : volume}
              onChange={(e) => onVolumeChange(Number(e.target.value))}
              style={{ width: compact ? (isMobile ? "150px" : "120px") : "180px" }}
            />
            <div
              style={{
                minWidth: 42,
                color: "rgba(255,255,255,0.72)",
                fontSize: compact ? 13 : 14,
              }}
            >
              {Math.round((isMuted ? 0 : volume) * 100)}%
            </div>
          </>
        ) : null}
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

async function incrementSongAnalytics(songId, field) {
  if (!songId || !field) return null;

  const { data: existingRow, error: selectError } = await supabase
    .from("song_analytics")
    .select("*")
    .eq("song_id", songId)
    .maybeSingle();

  if (selectError) {
    throw selectError;
  }

  const currentOpens = Number(existingRow?.opens || 0);
  const currentPlays = Number(existingRow?.plays || 0);

  const payload = {
    song_id: songId,
    opens: field === "opens" ? currentOpens + 1 : currentOpens,
    plays: field === "plays" ? currentPlays + 1 : currentPlays,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("song_analytics")
    .upsert(payload, { onConflict: "song_id" })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return normalizeAnalyticsRow(data);
}

async function fetchSongsFromSupabaseBackup() {
  const { data, error } = await supabase
    .from("songs_backup")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []).map((row) => ({
    id: row.song_id,
    title: row.title,
    artist: row.artist,
    requestedBy: row.requested_by || "",
    coverUrl: row.cover_url || "",
    audioUrl: row.audio_url || "",
    lyrics: row.lyrics || "",
    likes: Number(row.likes || 0),
    featured: !!row.featured,
    visibility: row.visibility || "public",
    status: row.status || "published",
    createdAt: row.created_at,
    sortOrder: Number(row.sort_order || 0),
  }));
}

async function backupSongToSupabase(song) {
  const payload = {
    song_id: song.id,
    title: song.title,
    artist: song.artist,
    requested_by: song.requestedBy || "",
    cover_url: song.coverUrl || "",
    audio_url: song.audioUrl || "",
    lyrics: song.lyrics || "",
    likes: Number(song.likes || 0),
    featured: !!song.featured,
    visibility: song.visibility || "public",
    status: song.status || "published",
    created_at: song.createdAt,
    sort_order: Number(song.sortOrder || 0),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("songs_backup").upsert(payload, {
    onConflict: "song_id",
  });

  if (error) {
    throw error;
  }
}

async function deleteSongFromSupabaseBackup(songId) {
  const { error } = await supabase.from("songs_backup").delete().eq("song_id", songId);

  if (error) {
    throw error;
  }
}

function RequestReviewModal({ request, onClose, songs, onOpenSong }) {
  if (!request) return null;

  const linkedSong = songs.find((song) => song.id === request.linkedSongId);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        display: "grid",
        placeItems: "center",
        zIndex: 1100,
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(760px, 100%)",
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
            alignItems: "flex-start",
            marginBottom: 18,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2 style={{ margin: 0 }}>Request Review</h2>
            <div style={{ color: "rgba(255,255,255,0.68)", marginTop: 6 }}>
              {request.title || "Untitled request"} • {formatDate(request.createdAt)}
            </div>
          </div>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          <div
            style={{
              padding: 14,
              borderRadius: 16,
              background: "rgba(8,12,24,0.60)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.62)", marginBottom: 6 }}>
              Name
            </div>
            <div>{request.name || "—"}</div>
          </div>

          <div
            style={{
              padding: 14,
              borderRadius: 16,
              background: "rgba(8,12,24,0.60)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.62)", marginBottom: 6 }}>
              Song title / idea
            </div>
            <div>{request.title || "—"}</div>
          </div>

          <div
            style={{
              padding: 14,
              borderRadius: 16,
              background: "rgba(8,12,24,0.60)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.62)", marginBottom: 6 }}>
              Details
            </div>
            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>
              {request.details || "No extra details."}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 14,
            }}
          >
            <div
              style={{
                padding: 14,
                borderRadius: 16,
                background: "rgba(8,12,24,0.60)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.62)", marginBottom: 6 }}>
                Delivery
              </div>
              <div>{request.delivery === "private" ? "Private" : "Public"}</div>
            </div>

            <div
              style={{
                padding: 14,
                borderRadius: 16,
                background: "rgba(8,12,24,0.60)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.62)", marginBottom: 6 }}>
                Status
              </div>
              <div>{request.status === "done" ? "Done" : "Pending"}</div>
            </div>

            <div
              style={{
                padding: 14,
                borderRadius: 16,
                background: "rgba(8,12,24,0.60)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.62)", marginBottom: 6 }}>
                E-mail
              </div>
              <div>{request.email || "No e-mail provided"}</div>
            </div>

            <div
              style={{
                padding: 14,
                borderRadius: 16,
                background: "rgba(8,12,24,0.60)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.62)", marginBottom: 6 }}>
                Notification
              </div>
              <div>{request.notify ? "Wants notification" : "No notification requested"}</div>
            </div>
          </div>

          <div
            style={{
              padding: 14,
              borderRadius: 16,
              background: "rgba(8,12,24,0.60)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.62)", marginBottom: 6 }}>
              Linked song
            </div>
            {linkedSong ? (
              <div>
                <span
                  onClick={() => onOpenSong(linkedSong)}
                  style={{
                    cursor: "pointer",
                    textDecoration: "underline",
                    color: "#86efac",
                  }}
                >
                  {linkedSong.title}
                </span>
              </div>
            ) : (
              <div style={{ color: "#f87171" }}>No song attached yet</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PlayerModal({
  song,
  onClose,
  onMinimize,
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
  isMobile,
}) {
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);

  if (!song) return null;

  const volumeIcon = isMuted || volume === 0 ? "🔇" : "🔊";

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
        padding: isMobile ? 12 : 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(980px, 100%)",
          height: "min(88vh, 860px)",
          ...shellCardStyle(),
          padding: isMobile ? 16 : 24,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "flex-start",
            marginBottom: 16,
            flexWrap: "wrap",
            flexShrink: 0,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h2
              style={{
                margin: 0,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                fontSize: isMobile ? 22 : 28,
              }}
            >
              {song.title}
            </h2>
            <div
              style={{
                color: "rgba(255,255,255,0.7)",
                marginTop: 6,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
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

        {isMobile ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              minHeight: 0,
              flex: 1,
            }}
          >
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flexShrink: 0 }}>
              <Button variant="secondary" onClick={onPrevious} style={{ padding: "8px 12px", fontSize: 14 }}>
                ⏮
              </Button>
              <Button variant="secondary" onClick={onPlayPause} style={{ padding: "8px 16px", fontSize: 14 }}>
                {isPlaying ? "Pause" : "Play"}
              </Button>
              <Button variant="secondary" onClick={onNext} style={{ padding: "8px 12px", fontSize: 14 }}>
                ⏭
              </Button>
              <Button
                variant="secondary"
                onClick={() => setShowVolumeSlider((prev) => !prev)}
                style={{ padding: "8px 12px", fontSize: 14 }}
              >
                {volumeIcon}
              </Button>
            </div>

            <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 14, flexShrink: 0 }}>
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>

            <input
              type="range"
              min="0"
              max={Number.isFinite(duration) && duration > 0 ? duration : 0}
              step="0.1"
              value={Math.min(currentTime, duration || 0)}
              onChange={(e) => onSeek(Number(e.target.value))}
              style={{ width: "100%", flexShrink: 0 }}
            />

            {showVolumeSlider ? (
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  flexWrap: "wrap",
                  flexShrink: 0,
                }}
              >
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={isMuted ? 0 : volume}
                  onChange={(e) => onVolumeChange(Number(e.target.value))}
                  style={{ width: "170px" }}
                />
                <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 14 }}>
                  {Math.round((isMuted ? 0 : volume) * 100)}%
                </div>
              </div>
            ) : null}

            <div style={{ fontSize: 18, fontWeight: 700, flexShrink: 0, marginTop: 4 }}>Lyrics</div>

            <div
              style={{
                background: "rgba(8,12,24,0.60)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 18,
                padding: 16,
                minHeight: 0,
                flex: 1,
                overflowY: "auto",
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
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "280px minmax(0, 1fr)",
              gap: 22,
              minHeight: 0,
              flex: 1,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", minHeight: 0, gap: 14 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flexShrink: 0 }}>
                <Button variant="secondary" onClick={onPrevious} style={{ padding: "8px 12px", fontSize: 14 }}>
                  ⏮
                </Button>
                <Button variant="secondary" onClick={onPlayPause} style={{ padding: "8px 16px", fontSize: 14 }}>
                  {isPlaying ? "Pause" : "Play"}
                </Button>
                <Button variant="secondary" onClick={onNext} style={{ padding: "8px 12px", fontSize: 14 }}>
                  ⏭
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setShowVolumeSlider((prev) => !prev)}
                  style={{ padding: "8px 12px", fontSize: 14 }}
                >
                  {volumeIcon}
                </Button>
              </div>

              <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 14, flexShrink: 0 }}>
                {formatTime(currentTime)} / {formatTime(duration)}
              </div>

              <input
                type="range"
                min="0"
                max={Number.isFinite(duration) && duration > 0 ? duration : 0}
                step="0.1"
                value={Math.min(currentTime, duration || 0)}
                onChange={(e) => onSeek(Number(e.target.value))}
                style={{ width: "100%", flexShrink: 0 }}
              />

              {showVolumeSlider ? (
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    flexWrap: "wrap",
                    flexShrink: 0,
                  }}
                >
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={isMuted ? 0 : volume}
                    onChange={(e) => onVolumeChange(Number(e.target.value))}
                    style={{ width: "170px" }}
                  />
                  <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 14 }}>
                    {Math.round((isMuted ? 0 : volume) * 100)}%
                  </div>
                </div>
              ) : null}

              <div
                style={{
                  width: "100%",
                  aspectRatio: "1 / 1",
                  borderRadius: 22,
                  overflow: "hidden",
                  background:
                    "linear-gradient(135deg, rgba(89,55,150,0.8), rgba(41,73,120,0.8))",
                  display: "grid",
                  placeItems: "center",
                  border: "1px solid rgba(255,255,255,0.08)",
                  flexShrink: 0,
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
            </div>

            <div style={{ minHeight: 0, display: "flex", flexDirection: "column" }}>
              <h3 style={{ marginTop: 0, marginBottom: 10, flexShrink: 0 }}>Lyrics</h3>
              <div
                style={{
                  background: "rgba(8,12,24,0.60)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 18,
                  padding: 16,
                  minHeight: 0,
                  flex: 1,
                  overflowY: "auto",
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
        )}
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
  isMobile,
  showVolumeSlider,
  onToggleVolumeSlider,
}) {
  if (!song) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: isMobile ? 12 : 18,
        right: isMobile ? 12 : 18,
        bottom: isMobile ? 12 : 18,
        zIndex: 999,
        ...shellCardStyle({
          padding: isMobile ? 12 : 10,
          borderRadius: 18,
          background:
            "linear-gradient(180deg, rgba(12,17,31,0.98), rgba(8,11,21,0.99))",
        }),
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontWeight: 700,
            fontSize: isMobile ? 18 : 15,
            lineHeight: 1.2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            marginBottom: 10,
          }}
        >
          {song.title}
        </div>

        {!isMobile ? (
          <div
            style={{
              color: "rgba(255,255,255,0.68)",
              fontSize: 13,
              lineHeight: 1.2,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              marginBottom: 10,
            }}
          >
            {song.artist} • {getSongTypeLabel(song)}
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          <Button
            variant="secondary"
            onClick={onPrevious}
            style={{ padding: "7px 10px", fontSize: 13, minWidth: isMobile ? 44 : undefined }}
          >
            ⏮
          </Button>
          <Button
            variant="secondary"
            onClick={onPlayPause}
            style={{ padding: "7px 10px", fontSize: 13, minWidth: isMobile ? 86 : undefined }}
          >
            {isPlaying ? "Pause" : "Play"}
          </Button>
          <Button
            variant="secondary"
            onClick={onNext}
            style={{ padding: "7px 10px", fontSize: 13, minWidth: isMobile ? 44 : undefined }}
          >
            ⏭
          </Button>
          <Button variant="secondary" onClick={onExpand} style={{ padding: "7px 10px", fontSize: 13 }}>
            Expand
          </Button>
          <Button variant="secondary" onClick={onClose} style={{ padding: "7px 10px", fontSize: 13 }}>
            Close
          </Button>
        </div>

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
            compact
            isMobile={isMobile}
            hidePlayButton
            showVolumeSlider={!isMobile || showVolumeSlider}
            onToggleVolumeSlider={onToggleVolumeSlider}
          />
        ) : null}
      </div>
    </div>
  );
}

function App() {
  const [songs, setSongs] = useState(() => {
    clearOldDemoDataOnce();
    return [];
  });
  const [songAnalytics, setSongAnalytics] = useState({});
  const [editingSongId, setEditingSongId] = useState(null);
  const [hasUnsavedSongChanges, setHasUnsavedSongChanges] = useState(false);
  const [editingOriginalSong, setEditingOriginalSong] = useState(null);
  const [requests, setRequests] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selectedRequest, setSelectedRequest] = useState(null);
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
  const [isReorderingSongs, setIsReorderingSongs] = useState(false);
  const [volume, setVolume] = useState(1);
  const [previousVolume, setPreviousVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [windowWidth, setWindowWidth] = useState(
    () => (typeof window !== "undefined" ? window.innerWidth : 1200)
  );

  const trackedOpenSongIdsRef = useRef(new Set());
  const lastTrackedPlaySongIdRef = useRef(null);
  const shouldAutoplayOnSongChangeRef = useRef(false);
  const audioRef = useRef(null);

  const isMobile = windowWidth < 900;

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
  const [uploadSuccess, setUploadSuccess] = useState("");
  const [messageSuccess, setMessageSuccess] = useState("");
  const [messageForm, setMessageForm] = useState({
    from: "",
    replyPlatform: "",
    replyContact: "",
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
    setNewSongFiles({ coverFile: null, audioFile: null });
    setEditingSongId(null);
    setEditingOriginalSong(null);
    setHasUnsavedSongChanges(false);

    const coverInput = document.getElementById("song-cover-input");
    const audioInput = document.getElementById("song-audio-input");
    if (coverInput) coverInput.value = "";
    if (audioInput) audioInput.value = "";
  }

  function startEditSong(song) {
    if (editingSongId && hasUnsavedSongChanges && editingSongId !== song.id) {
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
    setNewSongFiles({ coverFile: null, audioFile: null });
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
          const normalizedSongs = ensureSongSortOrders(cloudSongs);
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

          for (const song of songsWithLiveLikes) {
            backupSongToSupabase(song).catch((error) => {
              console.warn("Could not back up song to Supabase:", error);
            });
          }
        }
      } catch (error) {
        console.warn("Could not load songs from Cloudflare, trying Supabase backup:", error);

        try {
          const backupSongs = await fetchSongsFromSupabaseBackup();
          if (!cancelled && backupSongs.length > 0) {
            setSongs(ensureSongSortOrders(backupSongs));
            return;
          }
        } catch (backupError) {
          console.warn("Could not load songs from Supabase backup:", backupError);
        }

        if (!cancelled) {
          const localSongs = ensureSongSortOrders(getStored(STORAGE_KEYS.songs, DEFAULT_SONGS));
          setSongs(localSongs);
        }
      }
    }

    async function loadAnalytics() {
      const { data, error } = await supabase.from("song_analytics").select("*");
      if (error) {
        console.error("Could not load analytics:", error);
        return;
      }
      if (cancelled) return;

      const nextMap = {};
      (data || []).forEach((row) => {
        const normalized = normalizeAnalyticsRow(row);
        nextMap[normalized.song_id] = normalized;
      });
      setSongAnalytics(nextMap);
    }

    loadSongs();
    loadAnalytics();

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
            replyContact: m.sender_email || "",
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
                replyContact: m.sender_email || "",
                message: m.message,
                status: m.status,
                createdAt: m.created_at,
              }))
            );
          }
        }
      )
      .subscribe();

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

    const analyticsChannel = supabase
      .channel("live-song-analytics")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "song_analytics" },
        async () => {
          const { data, error } = await supabase.from("song_analytics").select("*");
          if (error) {
            console.error("Could not refresh analytics:", error);
            return;
          }

          const nextMap = {};
          (data || []).forEach((row) => {
            const normalized = normalizeAnalyticsRow(row);
            nextMap[normalized.song_id] = normalized;
          });
          setSongAnalytics(nextMap);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(requestsChannel);
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(likesChannel);
      supabase.removeChannel(analyticsChannel);
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
        sortOrder: song.sortOrder,
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

    const handlePlay = async () => {
      setIsPlaying(true);
      const currentSongId = playerSong?.id;
      if (!currentSongId) return;
      if (lastTrackedPlaySongIdRef.current === currentSongId) return;
      lastTrackedPlaySongIdRef.current = currentSongId;

      try {
        const updatedRow = await incrementSongAnalytics(currentSongId, "plays");
        if (updatedRow) {
          setSongAnalytics((prev) => ({
            ...prev,
            [updatedRow.song_id]: updatedRow,
          }));
        }
      } catch (error) {
        console.error("Could not track play:", error);
      }
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setPlayerCurrentTime(0);
      lastTrackedPlaySongIdRef.current = null;
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
  }, [playerSong]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = isMuted ? 0 : volume;
    audio.muted = isMuted;
  }, [volume, isMuted]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !playerSong?.audioUrl) return;

    audio.load();
    setPlayerCurrentTime(0);
    setPlayerDuration(0);

    if (shouldAutoplayOnSongChangeRef.current) {
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch((error) => {
          console.warn("Autoplay blocked:", error);
        });
      }
    }

    shouldAutoplayOnSongChangeRef.current = false;
  }, [playerSong]);
  const publicSongs = useMemo(
    () =>
      ensureSongSortOrders(songs)
        .filter((song) => song.status !== "hidden" && song.visibility === "public")
        .sort(compareSongsForDisplay),
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
      list.sort(compareSongsForDisplay);
    } else if (filterMode === "most-liked") {
      list.sort((a, b) => {
        if (!!b.featured !== !!a.featured) {
          return b.featured ? 1 : -1;
        }
        if ((b.likes || 0) !== (a.likes || 0)) {
          return (b.likes || 0) - (a.likes || 0);
        }
        return compareSongsForDisplay(a, b);
      });
    } else if (filterMode === "requested") {
      list = list.filter((song) => isRequestedSong(song));
      list.sort(compareSongsForDisplay);
    } else if (filterMode === "originals") {
      list = list.filter((song) => isOriginalSong(song));
      list.sort(compareSongsForDisplay);
    } else if (filterMode === "newest") {
      const newestSongs = list.filter((song) => isNewSong(song));
      if (newestSongs.length > 0) {
        list = newestSongs;
      }
      list.sort((a, b) => {
        if (!!b.featured !== !!a.featured) {
          return b.featured ? 1 : -1;
        }
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
    } else {
      list.sort(compareSongsForDisplay);
    }

    return list;
  }, [publicSongs, search, filterMode]);

  const adminSongs = useMemo(() => {
    let list = ensureSongSortOrders(songs);

    if (adminSongFilter === "public") {
      list = list.filter((song) => song.visibility === "public");
    } else if (adminSongFilter === "private") {
      list = list.filter((song) => song.visibility === "private");
    } else if (adminSongFilter === "requested") {
      list = list.filter((song) => isRequestedSong(song));
    } else if (adminSongFilter === "originals") {
      list = list.filter((song) => isOriginalSong(song));
    }

    return list.sort(compareSongsForDisplay);
  }, [songs, adminSongFilter]);

  const topLikedSongs = useMemo(() => {
    return [...publicSongs].sort((a, b) => (b.likes || 0) - (a.likes || 0)).slice(0, 3);
  }, [publicSongs]);

  const featuredSpotlightSongs = useMemo(() => {
    return [...publicSongs]
      .filter((song) => song.featured)
      .sort(compareSongsForDisplay)
      .slice(0, 2);
  }, [publicSongs]);

  const newestSpotlightSongs = useMemo(() => {
    const featuredIds = new Set(featuredSpotlightSongs.map((song) => song.id));
    return [...publicSongs]
      .filter((song) => isNewSong(song) && !featuredIds.has(song.id))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 2);
  }, [publicSongs, featuredSpotlightSongs]);

  const spotlightSongIds = useMemo(() => {
    return new Set([
      ...featuredSpotlightSongs.map((song) => song.id),
      ...newestSpotlightSongs.map((song) => song.id),
    ]);
  }, [featuredSpotlightSongs, newestSpotlightSongs]);

  const remainingSongs = useMemo(() => {
    if (filterMode !== "all") {
      return filteredSongs;
    }
    return filteredSongs.filter((song) => !spotlightSongIds.has(song.id));
  }, [filteredSongs, spotlightSongIds, filterMode]);

  const showSpotlights = filterMode === "all";

  const topPlayedSongs = useMemo(() => {
    return [...songs]
      .map(normalizeSong)
      .map((song) => ({
        ...song,
        plays: Number(songAnalytics[song.id]?.plays || 0),
        opens: Number(songAnalytics[song.id]?.opens || 0),
      }))
      .sort((a, b) => {
        if (b.plays !== a.plays) return b.plays - a.plays;
        if (b.opens !== a.opens) return b.opens - a.opens;
        return compareSongsForDisplay(a, b);
      })
      .slice(0, 3);
  }, [songs, songAnalytics]);

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
  const totalOpens = Object.values(songAnalytics).reduce(
    (sum, row) => sum + Number(row.opens || 0),
    0
  );
  const totalPlays = Object.values(songAnalytics).reduce(
    (sum, row) => sum + Number(row.plays || 0),
    0
  );

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
      prev.map((song) => (song.id === songId ? { ...song, likes: finalLikes } : song))
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

      const currentMaxSortOrder = songs.reduce((max, song) => {
        const value = Number(song.sortOrder);
        return Number.isFinite(value) ? Math.max(max, value) : max;
      }, 0);

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
        sortOrder: editingOriginalSong?.sortOrder ?? currentMaxSortOrder + 1,
      });

      await saveSongToCloudflare(item);
      await backupSongToSupabase(item).catch((error) => {
        console.warn("Could not back up song to Supabase:", error);
      });

      if (editingSongId) {
        setSongs((prev) => prev.map((song) => (song.id === editingSongId ? item : song)));
        await autoCleanReplacedFiles({
          oldSong: editingOriginalSong,
          newCoverUrl: uploadedCoverUrl,
          newAudioUrl: uploadedAudioUrl,
        });
        setUploadSuccess(`✅ "$${item.title}" was updated successfully.`);
      } else {
        setSongs((prev) => [...prev, item]);
        setUploadSuccess(`🎵 "$${item.title}" was uploaded successfully.`);
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

    const confirmed = window.confirm(`Delete "$${songToDelete.title}"?`);
    if (!confirmed) return;

    try {
      await deleteSongFromCloudflare(id);
      await deleteSongFromSupabaseBackup(id).catch((error) => {
        console.warn("Could not delete Supabase song backup:", error);
      });
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
        setShowVolumeSlider(false);
        lastTrackedPlaySongIdRef.current = null;
      }
    } catch (error) {
      alert(error.message || "Failed to delete song");
    }
  };

  const handleDeleteRequest = async (requestId) => {
    const requestToDelete = requests.find((req) => req.id === requestId);
    if (!requestToDelete) return;

    const confirmed = window.confirm(
      `Delete request "$${requestToDelete.title}" from $${requestToDelete.name}?`
    );
    if (!confirmed) return;

    const { error } = await supabase.from("song_requests").delete().eq("id", requestId);
    if (error) {
      console.error("Could not delete request:", error);
      alert("Could not delete request.");
      return;
    }

    setRequests((prev) => prev.filter((req) => req.id !== requestId));
    if (selectedRequest?.id === requestId) {
      setSelectedRequest(null);
    }
  };

  const handleDeleteMessage = async (messageId) => {
    const messageToDelete = messages.find((msg) => msg.id === messageId);
    if (!messageToDelete) return;

    const confirmed = window.confirm(`Delete private message from "$${messageToDelete.from}"?`);
    if (!confirmed) return;

    const { error } = await supabase.from("private_messages").delete().eq("id", messageId);
    if (error) {
      console.error("Could not delete private message:", error);
      alert("Could not delete private message.");
      return;
    }

    setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
  };

  const toggleMessageStatus = async (messageId) => {
    const currentMessage = messages.find((msg) => msg.id === messageId);
    if (!currentMessage) return;

    const nextStatus = currentMessage.status === "new" ? "read" : "new";
    const { error } = await supabase
      .from("private_messages")
      .update({ status: nextStatus })
      .eq("id", messageId);

    if (error) {
      console.error("Could not update private message status:", error);
      alert("Could not update message status.");
      return;
    }

    setMessages((prev) =>
      prev.map((msg) => (msg.id === messageId ? { ...msg, status: nextStatus } : msg))
    );
  };

  const handleMoveSong = async (songId, direction) => {
    if (isReorderingSongs) return;

    const visibleList = [...adminSongs];
    const currentIndex = visibleList.findIndex((song) => song.id === songId);
    if (currentIndex === -1) return;

    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= visibleList.length) return;

    const currentSong = visibleList[currentIndex];
    const targetSong = visibleList[targetIndex];

    const currentSortOrder = Number.isFinite(Number(currentSong.sortOrder))
      ? Number(currentSong.sortOrder)
      : currentIndex + 1;
    const targetSortOrder = Number.isFinite(Number(targetSong.sortOrder))
      ? Number(targetSong.sortOrder)
      : targetIndex + 1;

    const updatedCurrentSong = { ...currentSong, sortOrder: targetSortOrder };
    const updatedTargetSong = { ...targetSong, sortOrder: currentSortOrder };

    const previousSongs = songs;

    setSongs((prev) =>
      prev.map((song) => {
        if (song.id === updatedCurrentSong.id) return updatedCurrentSong;
        if (song.id === updatedTargetSong.id) return updatedTargetSong;
        return song;
      })
    );

    try {
      setIsReorderingSongs(true);
      await Promise.all([
        saveSongToCloudflare(updatedCurrentSong),
        saveSongToCloudflare(updatedTargetSong),
      ]);
    } catch (error) {
      console.error("Could not reorder songs:", error);
      setSongs(previousSongs);
      alert("Could not reorder songs.");
    } finally {
      setIsReorderingSongs(false);
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

    const trimmedName = messageForm.from.trim();
    const trimmedReplyContact = messageForm.replyContact.trim();
    const trimmedMessage = messageForm.message.trim();
    const trimmedReplyPlatform = messageForm.replyPlatform.trim();

    if (!trimmedName) {
      alert("Please enter your name or username.");
      return;
    }

    if (!trimmedMessage) {
      alert("Please enter a message.");
      return;
    }

    const payload = {
      sender_name: trimmedName,
      sender_email:
        trimmedReplyPlatform && trimmedReplyContact
          ? `$${trimmedReplyPlatform}: $${trimmedReplyContact}`
          : trimmedReplyContact,
      message: trimmedMessage,
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
      replyContact: data.sender_email || "",
      message: data.message,
      status: data.status,
      createdAt: data.created_at,
    };

    setMessages((prev) => [newMessage, ...prev]);
    setMessageForm({ from: "", replyPlatform: "", replyContact: "", message: "" });
    setMessageSuccess("✉️ Private message sent successfully.");
  };

  const toggleRequestStatus = async (id) => {
    const request = requests.find((r) => r.id === id);
    if (!request) return;

    const nextStatus = request.status === "pending" ? "done" : "pending";
    const { error } = await supabase
      .from("song_requests")
      .update({ status: nextStatus })
      .eq("id", id);

    if (error) {
      console.error("Could not update request status:", error);
      return;
    }

    setRequests((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: nextStatus } : r))
    );
  };

  const linkSongToRequest = async (requestId, songId) => {
    const { error } = await supabase
      .from("song_requests")
      .update({ linked_song_id: songId, status: songId ? "done" : "pending" })
      .eq("id", requestId);

    if (error) {
      console.error("Could not link request:", error);
      return;
    }

    setRequests((prev) =>
      prev.map((r) =>
        r.id === requestId
          ? { ...r, linkedSongId: songId, status: songId ? "done" : "pending" }
          : r
      )
    );
  };

  const handleOpenSong = async (song) => {
    setPlayerSong(song);
    setPlayerMinimized(false);
    setPlayerCurrentTime(0);

    if (!trackedOpenSongIdsRef.current.has(song.id)) {
      trackedOpenSongIdsRef.current.add(song.id);
      try {
        const updatedRow = await incrementSongAnalytics(song.id, "opens");
        if (updatedRow) {
          setSongAnalytics((prev) => ({
            ...prev,
            [updatedRow.song_id]: updatedRow,
          }));
        }
      } catch (error) {
        console.error("Could not track open:", error);
      }
    }
  };

  const handleSeek = (time) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = time;
    setPlayerCurrentTime(time);
  };

  const handlePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play();
    } else {
      audio.pause();
    }
  };

  const handleNextSong = () => {
    if (!playerSong) return;
    const index = publicSongs.findIndex((s) => s.id === playerSong.id);
    if (index === -1) return;
    const next = publicSongs[index + 1];
    if (!next) return;
    shouldAutoplayOnSongChangeRef.current = isPlaying;
    setPlayerSong(next);
    lastTrackedPlaySongIdRef.current = null;
  };

  const handlePreviousSong = () => {
    if (!playerSong) return;
    const index = publicSongs.findIndex((s) => s.id === playerSong.id);
    if (index <= 0) return;
    const prev = publicSongs[index - 1];
    shouldAutoplayOnSongChangeRef.current = isPlaying;
    setPlayerSong(prev);
    lastTrackedPlaySongIdRef.current = null;
  };

  const handleVolumeChange = (value) => {
    setVolume(value);
    if (value > 0) {
      setPreviousVolume(value);
      setIsMuted(false);
    }
  };

  const handleToggleMute = () => {
    if (isMuted) {
      setIsMuted(false);
      setVolume(previousVolume || 1);
    } else {
      setPreviousVolume(volume);
      setIsMuted(true);
    }
  };

  const handleClosePlayer = () => {
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
    lastTrackedPlaySongIdRef.current = null;
    shouldAutoplayOnSongChangeRef.current = false;
  };

  const handleMinimizePlayer = () => {
    setPlayerMinimized(true);
  };

  const handleExpandPlayer = () => {
    setPlayerMinimized(false);
  };

  const downloadSong = (song) => {
    if (!song.audioUrl) {
      alert("No song file uploaded yet.");
      return;
    }

    const a = document.createElement("a");
    a.href = song.audioUrl;
    a.download = getFileNameFromUrl(song.audioUrl) || `$${song.title || "song"}.mp3`;
    a.click();
  };

  const downloadLyrics = async (song) => {
    if (!song.lyrics) {
      alert("No lyrics added yet.");
      return;
    }

    try {
      const doc = new jsPDF({
        orientation: "p",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginX = 18;
      const contentWidth = pageWidth - marginX * 2;
      const footerText = "Downloaded from www.DJ-BUANG.com";
      const songType = getSongTypeLabel(song);
      let y = 18;

      try {
        const logoData = await loadImageAsDataUrl("/hero-logo.png");
        if (logoData) {
          const logoWidth = 42;
          const logoHeight = 22;
          doc.addImage(logoData, "PNG", (pageWidth - logoWidth) / 2, y, logoWidth, logoHeight);
          y += 28;
        }
      } catch (logoError) {
        console.warn("Could not add logo to PDF:", logoError);
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.text(song.title || "Untitled Song", pageWidth / 2, y, { align: "center" });
      y += 10;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(90, 90, 90);
      doc.text(`Artist: $${song.artist || "DJ-Buang"}`, pageWidth / 2, y, { align: "center" });
      y += 6;
      doc.text(songType, pageWidth / 2, y, { align: "center" });
      y += 10;

      doc.setDrawColor(210, 210, 210);
      doc.line(marginX, y, pageWidth - marginX, y);
      y += 10;

      doc.setTextColor(20, 20, 20);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(12);

      const lyricsLines = doc.splitTextToSize(song.lyrics, contentWidth);

      const addFooter = () => {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(10);
        doc.setTextColor(110, 110, 110);
        doc.text(footerText, pageWidth / 2, pageHeight - 10, { align: "center" });
      };

      addFooter();

      const lineHeight = 6.6;
      for (let i = 0; i < lyricsLines.length; i += 1) {
        if (y > pageHeight - 18) {
          doc.addPage();
          y = 20;
          addFooter();
          doc.setFont("helvetica", "normal");
          doc.setFontSize(12);
          doc.setTextColor(20, 20, 20);
        }
        doc.text(lyricsLines[i], marginX, y);
        y += lineHeight;
      }

      const safeTitle = (song.title || "lyrics").replace(/[<>:"/\\|?*]+/g, "").trim();
      doc.save(`$${safeTitle}-lyrics.pdf`);
    } catch (error) {
      console.error("Could not create lyrics PDF:", error);
      alert("Could not generate PDF.");
    }
  };

  const copySongLink = async (songId) => {
    const url = `$${window.location.origin}$${window.location.pathname}?song=$${songId}`;
    try {
      await navigator.clipboard.writeText(url);
      alert("Song link copied!");
    } catch {
      alert(url);
    }
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
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 18,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      flexWrap: "wrap",
                      marginBottom: 18,
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
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
                    Feel free to explore the library, give your favorite tracks a thumbs-up,
                    and download songs or lyrics if something speaks to you. If you enjoy the
                    music and want to support what I do, it’s always appreciated — but most of
                    all, I’m just glad you’re here listening.
                  </p>

                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 24 }}>
                    <Button variant="secondary" onClick={openPayPalDonation}>
                      ♡ Support / Donate
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setRequestSent(false);
                        setMessageSuccess("");
                        setUploadSuccess("");
                        setView("request");
                      }}
                    >
                      🗒 Song Request
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setMessageSuccess("");
                        setUploadSuccess("");
                        setView("message");
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
                    alignItems: "flex-end",
                    gap: isMobile ? 14 : 24,
                    marginTop: 6,
                    minWidth: isMobile ? "100%" : 260,
                  }}
                >
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
                    {showSpotlights && featuredSpotlightSongs.length > 0 ? (
                      <div style={{ display: "grid", gap: 12 }}>
                        <SectionHeading icon="⭐" title="Featured Spotlight" tone="featured" />
                        {featuredSpotlightSongs.map((song) => (
                          <SongRow
                            key={`featured-${song.id}`}
                            song={song}
                            analytics={songAnalytics[song.id]}
                            onLike={handleLikeSong}
                            onOpenPlayer={handleOpenSong}
                            onDownloadSong={downloadSong}
                            onDownloadLyrics={downloadLyrics}
                            isMobile={isMobile}
                          />
                        ))}
                      </div>
                    ) : null}

                    {showSpotlights && newestSpotlightSongs.length > 0 ? (
                      <div style={{ display: "grid", gap: 12 }}>
                        <SectionHeading icon="🆕" title="Newest Drops" tone="new" />
                        {newestSpotlightSongs.map((song) => (
                          <SongRow
                            key={`newest-${song.id}`}
                            song={song}
                            analytics={songAnalytics[song.id]}
                            onLike={handleLikeSong}
                            onOpenPlayer={handleOpenSong}
                            onDownloadSong={downloadSong}
                            onDownloadLyrics={downloadLyrics}
                            isMobile={isMobile}
                          />
                        ))}
                      </div>
                    ) : null}

                    {remainingSongs.length > 0 ? (
                      <div style={{ display: "grid", gap: 12 }}>
                        <SectionHeading icon="🎵" title="More Songs" />
                        {remainingSongs.map((song) => (
                          <SongRow
                            key={song.id}
                            song={song}
                            analytics={songAnalytics[song.id]}
                            onLike={handleLikeSong}
                            onOpenPlayer={handleOpenSong}
                            onDownloadSong={downloadSong}
                            onDownloadLyrics={downloadLyrics}
                            isMobile={isMobile}
                          />
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: "rgba(255,255,255,0.70)" }}>No more songs found.</div>
                    )}
                  </div>
                </div>
              </Panel>

              <div style={{ display: "grid", gap: 22, alignContent: "start" }}>
                <Panel title="♡ Top 3 Most Liked Songs" subtitle="The crowd favorites as they build up.">
                  <div style={{ display: "grid", gap: 12 }}>
                    {topLikedSongs.length > 0 ? (
                      topLikedSongs.map((song, i) => (
                        <div
                          key={song.id}
                          onClick={() => handleOpenSong(song)}
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
                                  color:
                                    i === 0 ? "#fde68a" : i === 1 ? "#cbd5e1" : "#fdba74",
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
                      ))
                    ) : (
                      <div style={{ color: "rgba(255,255,255,0.7)" }}>
                        No likes yet — first listeners get the bragging rights.
                      </div>
                    )}
                  </div>
                </Panel>

                <Panel title="◉ Connect" subtitle="Song requests, private messages, and support are open.">
                  <div style={{ display: "grid", gap: 12 }}>
                    <Button
                      variant="primary"
                      onClick={() => {
                        setRequestSent(false);
                        setMessageSuccess("");
                        setUploadSuccess("");
                        setView("request");
                      }}
                    >
                      🗒 Open Song Request Form
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setMessageSuccess("");
                        setUploadSuccess("");
                        setView("message");
                      }}
                    >
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
                <div style={{ marginTop: 6, lineHeight: 1.5 }}>Thanks for sending a request.</div>
              </div>
            )}

            <form onSubmit={handleRequestSubmit} style={{ display: "grid", gap: 16, maxWidth: 760 }}>
              <Input
                label="Name"
                value={requestForm.name}
                onChange={(e) => setRequestForm((prev) => ({ ...prev, name: e.target.value }))}
              />
              <Input
                label="Song title / idea"
                value={requestForm.title}
                onChange={(e) => setRequestForm((prev) => ({ ...prev, title: e.target.value }))}
              />
              <TextArea
                label="Details"
                value={requestForm.details}
                onChange={(e) => setRequestForm((prev) => ({ ...prev, details: e.target.value }))}
              />
              <Select
                label="Delivery"
                value={requestForm.delivery}
                onChange={(e) =>
                  setRequestForm((prev) => ({ ...prev, delivery: e.target.value }))
                }
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
              />
              <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
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
          <Panel title="Private Message" subtitle="This goes to a separate private admin area.">
            {messageSuccess && (
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
                <strong>{messageSuccess}</strong>
              </div>
            )}

            <form onSubmit={handleMessageSubmit} style={{ display: "grid", gap: 16, maxWidth: 760 }}>
              <Input
                label="Name or username"
                value={messageForm.from}
                onChange={(e) => setMessageForm((prev) => ({ ...prev, from: e.target.value }))}
              />
              <Select
                label="Reply platform (optional)"
                value={messageForm.replyPlatform}
                onChange={(e) =>
                  setMessageForm((prev) => ({ ...prev, replyPlatform: e.target.value }))
                }
              >
                <option value="" style={{ color: "black" }}>
                  Select platform
                </option>
                <option value="email" style={{ color: "black" }}>
                  E-mail
                </option>
                <option value="discord" style={{ color: "black" }}>
                  Discord
                </option>
                <option value="dia" style={{ color: "black" }}>
                  DIA username
                </option>
              </Select>
              <Input
                label="Reply contact (optional)"
                helper={
                  messageForm.replyPlatform === "email"
                    ? "Enter your e-mail address if you want DJ-BUANG to reply."
                    : messageForm.replyPlatform === "discord"
                      ? "Enter your Discord username if you want DJ-BUANG to reply."
                      : messageForm.replyPlatform === "dia"
                        ? "Enter your DIA username if you want DJ-BUANG to reply."
                        : "Choose a reply platform above, then enter your contact if you want DJ-BUANG to reply."
                }
                value={messageForm.replyContact}
                onChange={(e) =>
                  setMessageForm((prev) => ({ ...prev, replyContact: e.target.value }))
                }
              />
              <TextArea
                label="Message"
                value={messageForm.message}
                onChange={(e) =>
                  setMessageForm((prev) => ({ ...prev, message: e.target.value }))
                }
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
              subtitle="Overview of requests, songs, likes, and analytics."
              right={
                <Button variant="secondary" onClick={handleLogout}>
                  Logout
                </Button>
              }
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile
                    ? "repeat(2, minmax(0, 1fr))"
                    : "repeat(7, minmax(0, 1fr))",
                  gap: 14,
                }}
              >
                <StatPill label="Total Plays" value={totalPlays} />
                <StatPill label="Total Opens" value={totalOpens} />
                <StatPill label="Total Likes" value={totalLikes} />
                <StatPill label="Songs Uploaded" value={songs.length} />
                <StatPill label="Pending Requests" value={pendingRequests} />
                <StatPill label="Done Requests" value={doneRequests} />
                <StatPill label="New Messages" value={newMessages} />
              </div>
            </Panel>

            <Panel title="Top 3 Played Songs" subtitle="Your most listened songs so far.">
              <div style={{ display: "grid", gap: 10 }}>
                {topPlayedSongs.map((song) => (
                  <div
                    key={song.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: 10,
                      borderRadius: 14,
                      background: "rgba(8,12,24,0.6)",
                    }}
                  >
                    <div>{song.title}</div>
                    <div style={{ fontSize: 14, color: "#94a3b8" }}>
                      {song.plays} plays • {song.opens} opens
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title={editingSongId ? "Edit Song" : "Admin Upload Panel"}>
              {uploadSuccess && (
                <div
                  style={{
                    padding: 18,
                    borderRadius: 18,
                    background: "rgba(34,197,94,0.15)",
                    border: "1px solid rgba(74,222,128,0.35)",
                    marginBottom: 18,
                  }}
                >
                  <strong>{uploadSuccess}</strong>
                </div>
              )}

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
                    Upload cover image
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
                      background: "rgba(8,12,24,0.64)",
                      color: "white",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <div>
                  <div style={{ marginBottom: 8, fontSize: 14, color: "rgba(255,255,255,0.82)" }}>
                    Upload MP3 song
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
                      background: "rgba(8,12,24,0.64)",
                      color: "white",
                      boxSizing: "border-box",
                    }}
                  />
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
                    style={{ minHeight: 180 }}
                  />
                </div>

                <div style={{ gridColumn: "1 / -1", display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <Button type="submit" variant="primary" disabled={isUploading}>
                    {isUploading ? "Saving..." : editingSongId ? "Save Changes" : "Upload Song"}
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
                  adminSongs.map((song, index) => (
                    <SongRow
                      key={song.id}
                      song={song}
                      analytics={songAnalytics[song.id]}
                      isAdmin
                      isMobile={isMobile}
                      onOpenPlayer={handleOpenSong}
                      onDownloadSong={downloadSong}
                      onDownloadLyrics={downloadLyrics}
                      onDelete={handleDeleteSong}
                      onCopyLink={copySongLink}
                      onEdit={startEditSong}
                      onMoveUp={(songId) => handleMoveSong(songId, "up")}
                      onMoveDown={(songId) => handleMoveSong(songId, "down")}
                      canMoveUp={index > 0 && !isReorderingSongs}
                      canMoveDown={index < adminSongs.length - 1 && !isReorderingSongs}
                    />
                  ))
                ) : (
                  <div style={{ color: "rgba(255,255,255,0.72)" }}>No songs uploaded yet.</div>
                )}
              </div>
            </Panel>

            <Panel
              title="Song Requests"
              subtitle="Live requests with review popup and song linking."
              right={
                <div style={{ minWidth: 220 }}>
                  <Select value={requestFilter} onChange={(e) => setRequestFilter(e.target.value)}>
                    <option value="all" style={{ color: "black" }}>
                      All requests
                    </option>
                    <option value="pending" style={{ color: "black" }}>
                      Pending
                    </option>
                    <option value="done" style={{ color: "black" }}>
                      Done
                    </option>
                    <option value="public" style={{ color: "black" }}>
                      Public
                    </option>
                    <option value="private" style={{ color: "black" }}>
                      Private
                    </option>
                  </Select>
                </div>
              }
            >
              <div style={{ display: "grid", gap: 14 }}>
                {filteredRequests.length === 0 ? (
                  <div style={{ color: "rgba(255,255,255,0.72)" }}>No requests yet.</div>
                ) : (
                  filteredRequests.map((req) => (
                    <div
                      key={req.id}
                      style={{
                        padding: 16,
                        borderRadius: 18,
                        background: "rgba(8,12,24,0.68)",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      <div style={{ display: "grid", gap: 10 }}>
                        <strong>{req.title}</strong>
                        <div style={{ color: "rgba(255,255,255,0.65)" }}>
                          by {req.name} • {timeAgo(req.createdAt)}
                        </div>
                        <div style={{ color: "rgba(255,255,255,0.78)" }}>
                          Status: {req.status} • Delivery: {req.delivery === "private" ? "Private" : "Public"}
                        </div>
                        <Select
                          label="Attach uploaded song"
                          value={req.linkedSongId || ""}
                          onChange={(e) => linkSongToRequest(req.id, e.target.value)}
                        >
                          <option value="" style={{ color: "black" }}>
                            Select a song
                          </option>
                          {ensureSongSortOrders(songs)
                            .sort(compareSongsForDisplay)
                            .map((song) => (
                              <option key={song.id} value={song.id} style={{ color: "black" }}>
                                {song.title} — {song.artist}
                              </option>
                            ))}
                        </Select>
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <Button variant="secondary" onClick={() => setSelectedRequest(req)}>
                            Review
                          </Button>
                          <Button
                            variant={req.status === "done" ? "secondary" : "success"}
                            onClick={() => toggleRequestStatus(req.id)}
                          >
                            {req.status === "done" ? "Mark Pending" : "Mark Done"}
                          </Button>
                          <Button variant="danger" onClick={() => handleDeleteRequest(req.id)}>
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Panel>

            <Panel title="Private Messages">
              <div style={{ display: "grid", gap: 14 }}>
                {messages.length === 0 ? (
                  <div style={{ color: "rgba(255,255,255,0.72)" }}>No messages yet.</div>
                ) : (
                  [...messages]
                    .sort((a, b) => {
                      if (a.status !== b.status) {
                        return a.status === "new" ? -1 : 1;
                      }
                      return new Date(b.createdAt) - new Date(a.createdAt);
                    })
                    .map((msg) => (
                      <div
                        key={msg.id}
                        style={{
                          padding: 16,
                          borderRadius: 18,
                          background: "rgba(8,12,24,0.68)",
                          border: "1px solid rgba(255,255,255,0.08)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 12,
                            alignItems: "flex-start",
                            flexWrap: "wrap",
                          }}
                        >
                          <div style={{ display: "grid", gap: 6 }}>
                            <strong>{msg.from}</strong>
                            <div
                              style={{
                                color: "rgba(255,255,255,0.65)",
                                display: "flex",
                                gap: 8,
                                alignItems: "center",
                                flexWrap: "wrap",
                              }}
                            >
                              <span>{formatDate(msg.createdAt)}</span>
                              <Badge
                                style={{
                                  background:
                                    msg.status === "new"
                                      ? "rgba(34,197,94,0.18)"
                                      : "rgba(255,255,255,0.06)",
                                  border:
                                    msg.status === "new"
                                      ? "1px solid rgba(74,222,128,0.30)"
                                      : "1px solid rgba(255,255,255,0.10)",
                                  color: msg.status === "new" ? "#bbf7d0" : "rgba(255,255,255,0.78)",
                                  fontWeight: 800,
                                  padding: "5px 10px",
                                }}
                              >
                                {msg.status === "new" ? "NEW" : "READ"}
                              </Badge>
                            </div>
                            <div style={{ color: "rgba(255,255,255,0.78)" }}>
                              Reply via: {msg.replyContact ? msg.replyContact : "No reply contact left"}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <Button
                              variant={msg.status === "new" ? "success" : "secondary"}
                              onClick={() => toggleMessageStatus(msg.id)}
                              style={{ padding: "9px 14px", fontSize: 14 }}
                            >
                              {msg.status === "new" ? "Mark Read" : "Mark New"}
                            </Button>
                            <Button
                              variant="danger"
                              onClick={() => handleDeleteMessage(msg.id)}
                              style={{ padding: "9px 14px", fontSize: 14 }}
                            >
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
          </div>
        )}
      </div>

      {selectedRequest ? (
        <RequestReviewModal
          request={selectedRequest}
          onClose={() => setSelectedRequest(null)}
          songs={songs}
          onOpenSong={handleOpenSong}
        />
      ) : null}

      {playerSong && !playerMinimized ? (
        <PlayerModal
          song={playerSong}
          onClose={handleClosePlayer}
          onMinimize={handleMinimizePlayer}
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
          isMobile={isMobile}
        />
      ) : null}

      {playerSong && playerMinimized ? (
        <MiniPlayer
          song={playerSong}
          onExpand={handleExpandPlayer}
          onClose={handleClosePlayer}
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
          isMobile={isMobile}
          showVolumeSlider={showVolumeSlider}
          onToggleVolumeSlider={() => setShowVolumeSlider((prev) => !prev)}
        />
      ) : null}
    </div>
  );
}

export default App;
