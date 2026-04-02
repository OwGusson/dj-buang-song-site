import React, { useEffect, useMemo, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import { supabase } from "./supabase";
import {
  makeSongId,
  autoCleanReplacedFiles,
  autoCleanDeletedSongFiles,
} from "./songs";

/* ================================
   STORAGE + GLOBAL CONSTANTS
================================ */

const STORAGE_KEYS = {
  songs: "djbuang_songs",
  admin: "djbuang_admin_logged_in",
  resetVersion: "djbuang_reset_version",
};

const PAYPAL_URL =
  "https://www.paypal.com/donate/?hosted_button_id=DWL7PTXG7BQ9A";

const DEFAULT_SONGS = [];

/* ================================
   LOCAL STORAGE HELPERS
================================ */

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

/* ================================
   SONG NORMALIZATION
================================ */

function normalizeSong(song) {
  if (!song) return song;

  return {
    id: song.id,
    title: song.title || "",
    artist: song.artist || "DJ-Buang",
    requestedBy: song.requestedBy || "",
    coverUrl: song.coverUrl || "",
    audioUrl: song.audioUrl || "",
    lyrics: song.lyrics || "",
    likes: Number(song.likes || 0),
    featured: !!song.featured,
    visibility: song.visibility || "public",
    status: song.status || "published",
    createdAt: song.createdAt || new Date().toISOString(),
    sortOrder: Number(song.sortOrder || 0),
  };
}

/* ================================
   ANALYTICS NORMALIZATION
================================ */

function normalizeAnalyticsRow(row) {
  if (!row) return null;

  return {
    song_id: row.song_id,
    opens: Number(row.opens || 0),
    plays: Number(row.plays || 0),
    updated_at: row.updated_at,
  };
}

/* ================================
   SORT ORDER HELPERS
================================ */

function ensureSongSortOrders(songs) {
  if (!Array.isArray(songs)) return [];

  return songs.map((song, index) => ({
    ...normalizeSong(song),
    sortOrder:
      typeof song.sortOrder === "number"
        ? song.sortOrder
        : index,
  }));
}

function compareSongsForDisplay(a, b) {
  if (!!b.featured !== !!a.featured) {
    return b.featured ? 1 : -1;
  }

  if ((a.sortOrder ?? 0) !== (b.sortOrder ?? 0)) {
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  }

  return new Date(b.createdAt) - new Date(a.createdAt);
}

/* ================================
   SONG TYPE HELPERS
================================ */

function isRequestedSong(song) {
  return !!song.requestedBy;
}

function isOriginalSong(song) {
  return !song.requestedBy;
}

function isNewSong(song) {
  if (!song.createdAt) return false;

  const created = new Date(song.createdAt).getTime();
  const now = Date.now();

  const diffDays = (now - created) / (1000 * 60 * 60 * 24);

  return diffDays <= 14;
}

function getSongTypeLabel(song) {
  if (song.featured) return "featured";
  if (isNewSong(song)) return "new";
  if (isRequestedSong(song)) return "request";
  return "original";
}

/* ================================
   DATE + TIME HELPERS
================================ */

function formatDate(dateString) {
  if (!dateString) return "";

  try {
    return new Date(dateString).toLocaleDateString();
  } catch {
    return "";
  }
}

function timeAgo(dateString) {
  if (!dateString) return "";

  const now = Date.now();
  const time = new Date(dateString).getTime();

  const diff = Math.floor((now - time) / 1000);

  if (diff < 60) return "just now";

  const minutes = Math.floor(diff / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  return formatDate(dateString);
}

function formatTime(seconds) {
  if (!seconds && seconds !== 0) return "0:00";

  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);

  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/* ================================
   FILE + IMAGE HELPERS
================================ */

function getFileNameFromUrl(url) {
  if (!url) return "";

  try {
    return decodeURIComponent(url.split("/").pop());
  } catch {
    return "";
  }
}

async function loadImageAsDataUrl(imageUrl) {
  if (!imageUrl) return null;

  try {
    const response = await fetch(imageUrl);
    const blob = await response.blob();

    return new Promise((resolve) => {
      const reader = new FileReader();

      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn("Could not load image:", error);
    return null;
  }
}


/* ================================
   UI STYLE HELPERS
================================ */

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

/* ================================
   BUTTON
================================ */

function Button({ children, variant = "secondary", type = "button", ...props }) {
  const isSmallScreen =
    typeof window !== "undefined" ? window.innerWidth < 640 : false;

  const variants = {
    primary: {
      background:
        "linear-gradient(180deg, rgba(255,255,255,0.96), rgba(232,236,245,0.92))",
      color: "#0b1020",
      border: "1px solid rgba(255,255,255,0.30)",
      boxShadow: "0 10px 24px rgba(255,255,255,0.08)",
    },
    secondary: {
      background:
        "linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.06))",
      color: "white",
      border: "1px solid rgba(255,255,255,0.12)",
      boxShadow: "0 10px 22px rgba(0,0,0,0.18)",
    },
    ghost: {
      background: "rgba(255,255,255,0.03)",
      color: "white",
      border: "1px solid rgba(255,255,255,0.10)",
      boxShadow: "0 8px 18px rgba(0,0,0,0.12)",
    },
    danger: {
      background:
        "linear-gradient(180deg, rgba(127,29,29,0.56), rgba(153,27,27,0.42))",
      color: "white",
      border: "1px solid rgba(248,113,113,0.24)",
      boxShadow: "0 10px 24px rgba(127,29,29,0.20)",
    },
    success: {
      background:
        "linear-gradient(180deg, rgba(21,128,61,0.34), rgba(22,101,52,0.22))",
      color: "white",
      border: "1px solid rgba(74,222,128,0.24)",
      boxShadow: "0 10px 24px rgba(21,128,61,0.16)",
    },
  };

  return (
    <button
      type={type}
      {...props}
      style={{
        padding: isSmallScreen ? "10px 14px" : "12px 18px",
        borderRadius: 16,
        fontWeight: 700,
        cursor: props.disabled ? "not-allowed" : "pointer",
        fontSize: isSmallScreen ? 15 : 16,
        transition: "0.2s ease",
        opacity: props.disabled ? 0.7 : 1,
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        ...variants[variant],
        ...props.style,
      }}
    >
      {children}
    </button>
  );
}

/* ================================
   INPUT
================================ */

function Input({ label, helper, ...props }) {
  return (
    <label style={{ display: "block" }}>
      {label ? (
        <div
          style={{
            marginBottom: 8,
            fontSize: 14,
            color: "rgba(255,255,255,0.82)",
          }}
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

/* ================================
   TEXT AREA
================================ */

function TextArea({ label, ...props }) {
  return (
    <label style={{ display: "block" }}>
      {label ? (
        <div
          style={{
            marginBottom: 8,
            fontSize: 14,
            color: "rgba(255,255,255,0.82)",
          }}
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

/* ================================
   SELECT
================================ */

function Select({ label, children, ...props }) {
  return (
    <label style={{ display: "block" }}>
      {label ? (
        <div
          style={{
            marginBottom: 8,
            fontSize: 14,
            color: "rgba(255,255,255,0.82)",
          }}
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

/* ================================
   BADGE
================================ */

function Badge({ children, style = {} }) {
  const text = String(children || "").toUpperCase();

  let toneStyle = {
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.05))",
    border: "1px solid rgba(255,255,255,0.10)",
    color: "rgba(255,255,255,0.88)",
    boxShadow: "0 8px 20px rgba(0,0,0,0.14)",
  };

  if (text.includes("FEATURED")) {
    toneStyle = {
      background:
        "linear-gradient(180deg, rgba(250,204,21,0.18), rgba(202,138,4,0.12))",
      border: "1px solid rgba(250,204,21,0.24)",
      color: "#fde68a",
      boxShadow: "0 10px 24px rgba(250,204,21,0.10)",
    };
  } else if (text.includes("NEW")) {
    toneStyle = {
      background:
        "linear-gradient(180deg, rgba(59,130,246,0.16), rgba(37,99,235,0.10))",
      border: "1px solid rgba(96,165,250,0.22)",
      color: "#bfdbfe",
      boxShadow: "0 10px 24px rgba(59,130,246,0.10)",
    };
  } else if (text.includes("REQUEST")) {
    toneStyle = {
      background:
        "linear-gradient(180deg, rgba(168,85,247,0.16), rgba(147,51,234,0.10))",
      border: "1px solid rgba(192,132,252,0.22)",
      color: "#e9d5ff",
      boxShadow: "0 10px 24px rgba(168,85,247,0.10)",
    };
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "7px 12px",
        borderRadius: 999,
        fontSize: 13,
        whiteSpace: "nowrap",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        ...toneStyle,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/* ================================
   STAT PILL
================================ */

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

/* ================================
   PANEL
================================ */

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
          {typeof title === "string" ? (
            <h2 style={{ margin: 0, fontSize: 22 }}>{title}</h2>
          ) : (
            title
          )}

          {subtitle ? (
            <p style={{ margin: "8px 0 0", color: "rgba(255,255,255,0.72)" }}>
              {subtitle}
            </p>
          ) : null}
        </div>

        {right}
      </div>

      {children}
    </section>
  );
}

/* ================================
   SECTION HEADING
================================ */

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

/* ================================
   SONG ROW (LIBRARY LIST ITEM)
================================ */

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

  const actionButtonStyle = isMobile
    ? {
        padding: "8px 11px",
        fontSize: 13,
        borderRadius: 14,
      }
    : {
        padding: "10px 14px",
        fontSize: 14,
        borderRadius: 14,
      };

  return (
    <div
      onClick={() => onOpenPlayer(song)}
      style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "64px 1fr" : "96px 1fr",
        gap: isMobile ? 8 : 16,
        padding: isMobile ? 12 : 16,
        borderRadius: isMobile ? 18 : 22,
        background: isFeatured
          ? "linear-gradient(180deg, rgba(33,24,8,0.88), rgba(8,12,24,0.92))"
          : "rgba(8,12,24,0.64)",
        border: isFeatured
          ? "1px solid rgba(250,204,21,0.22)"
          : "1px solid rgba(255,255,255,0.08)",
        alignItems: "center",
        cursor: "pointer",
      }}
    >
      {/* COVER */}
      <div
        style={{
          width: "100%",
          height: isMobile ? 58 : 84,
          borderRadius: isMobile ? 12 : 18,
          overflow: "hidden",
          background:
            "linear-gradient(135deg, rgba(89,55,150,0.8), rgba(41,73,120,0.8))",
          display: "grid",
          placeItems: "center",
          alignSelf: isMobile ? "start" : "center",
          boxShadow: isMobile ? "none" : "0 12px 28px rgba(0,0,0,0.22)",
        }}
      >
        {song.coverUrl ? (
          <img
            src={song.coverUrl}
            alt={song.title}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        ) : (
          <span style={{ fontSize: isMobile ? 22 : 28 }}>🎵</span>
        )}
      </div>

      {/* INFO */}
      <div style={{ display: "grid", gap: isMobile ? 5 : 8, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <strong
            style={{
              fontSize: isMobile ? 15 : 18,
              lineHeight: 1.25,
              wordBreak: "break-word",
            }}
          >
            {song.title}
          </strong>

          {isNew && (
            <Badge
              style={{
                padding: isMobile ? "5px 9px" : "7px 12px",
                fontSize: isMobile ? 11 : 13,
              }}
            >
              NEW
            </Badge>
          )}

          {isRequested && (
            <Badge
              style={{
                padding: isMobile ? "5px 9px" : "7px 12px",
                fontSize: isMobile ? 11 : 13,
              }}
            >
              REQUEST
            </Badge>
          )}

          {isFeatured && (
            <Badge
              style={{
                padding: isMobile ? "5px 9px" : "7px 12px",
                fontSize: isMobile ? 11 : 13,
              }}
            >
              FEATURED
            </Badge>
          )}
        </div>

        <div
          style={{
            fontSize: isMobile ? 13 : 14,
            opacity: 0.7,
            lineHeight: 1.4,
            wordBreak: "break-word",
          }}
        >
          {song.artist} • {songTypeLabel}
        </div>

        <div
          style={{
            display: "flex",
            gap: isMobile ? 10 : 14,
            flexWrap: "wrap",
            fontSize: isMobile ? 12 : 13,
            opacity: 0.65,
          }}
        >
          <span>♡ {song.likes || 0}</span>
          <span>▶ {songAnalytics.plays}</span>
          <span>👁 {songAnalytics.opens}</span>
        </div>

        {/* ACTION ROW */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            display: "flex",
            gap: isMobile ? 5 : 8,
            flexWrap: "wrap",
            marginTop: isMobile ? 4 : 6,
          }}
        >
          <Button
            variant="secondary"
            onClick={() => onLike(song.id)}
            style={actionButtonStyle}
          >
            ♡ Like
          </Button>

          <Button
            variant="secondary"
            onClick={() => onDownloadSong(song)}
            style={actionButtonStyle}
          >
            ⬇ Song
          </Button>

          <Button
            variant="secondary"
            onClick={() => onDownloadLyrics(song)}
            style={actionButtonStyle}
          >
            📄 Lyrics
          </Button>

          <Button
            variant="ghost"
            onClick={() => onCopyLink(song.id)}
            style={actionButtonStyle}
          >
            🔗 Copy link
          </Button>

          {isAdmin && (
            <>
              <Button
                variant="ghost"
                onClick={() => onEdit(song)}
                style={actionButtonStyle}
              >
                ✏ Edit
              </Button>

              <Button
                variant="danger"
                onClick={() => onDelete(song)}
                style={actionButtonStyle}
              >
                🗑 Delete
              </Button>

              {canMoveUp && (
                <Button
                  variant="ghost"
                  onClick={() => onMoveUp(song)}
                  style={actionButtonStyle}
                >
                  ↑
                </Button>
              )}

              {canMoveDown && (
                <Button
                  variant="ghost"
                  onClick={() => onMoveDown(song)}
                  style={actionButtonStyle}
                >
                  ↓
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================================
   MINI PLAYER (BOTTOM BAR)
================================ */

function MiniPlayer({
  song,
  isPlaying,
  onPlayPause,
  onExpand,
  onNext,
  onPrev,
}) {
  if (!song) return null;

  const isMobile =
    typeof window !== "undefined" ? window.innerWidth < 900 : false;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        padding: isMobile ? "12px 14px" : "14px 20px",
        background:
          "linear-gradient(180deg, rgba(10,14,28,0.96), rgba(6,10,22,0.99))",
        borderTop: "1px solid rgba(255,255,255,0.08)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 14,
        zIndex: 999,
        backdropFilter: "blur(14px)",
      }}
    >
      {/* SONG INFO */}
      <div
        onClick={onExpand}
        style={{
          cursor: "pointer",
          overflow: "hidden",
          minWidth: 0,
        }}
      >
        <strong
          style={{
            display: "block",
            fontSize: isMobile ? 14 : 16,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {song.title}
        </strong>

        <div
          style={{
            fontSize: isMobile ? 12 : 13,
            opacity: 0.6,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {song.artist}
        </div>
      </div>

      {/* CONTROLS */}
      <div
        style={{
          display: "flex",
          gap: isMobile ? 6 : 10,
        }}
      >
        <Button
          variant="ghost"
          onClick={onPrev}
          style={{ padding: isMobile ? "8px 10px" : "10px 12px" }}
        >
          ⏮
        </Button>

        <Button
          variant="secondary"
          onClick={onPlayPause}
          style={{ padding: isMobile ? "8px 16px" : "10px 18px" }}
        >
          {isPlaying ? "Pause" : "Play"}
        </Button>

        <Button
          variant="ghost"
          onClick={onNext}
          style={{ padding: isMobile ? "8px 10px" : "10px 12px" }}
        >
          ⏭
        </Button>
      </div>
    </div>
  );
}

/* ================================
   PLAYER MODAL (EXPANDED PLAYER)
================================ */

function PlayerModal({
  song,
  isPlaying,
  onPlayPause,
  onClose,
  onNext,
  onPrev,
}) {
  if (!song) return null;

  const isMobile =
    typeof window !== "undefined" ? window.innerWidth < 900 : false;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.75)",
        display: "grid",
        placeItems: "center",
        zIndex: 1000,
        padding: isMobile ? 18 : 32,
      }}
    >
      <div
        style={{
          width: "min(520px, 100%)",
          padding: isMobile ? 22 : 30,
          borderRadius: 26,
          background:
            "linear-gradient(180deg, rgba(10,14,28,0.98), rgba(6,10,22,0.98))",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 30px 80px rgba(0,0,0,0.45)",
        }}
      >
        {/* TITLE */}
        <h2
          style={{
            marginTop: 0,
            marginBottom: 6,
            fontSize: isMobile ? 20 : 26,
          }}
        >
          {song.title}
        </h2>

        {/* ARTIST */}
        <p
          style={{
            margin: 0,
            opacity: 0.7,
            fontSize: isMobile ? 14 : 15,
          }}
        >
          {song.artist}
        </p>

        {/* CONTROLS */}
        <div
          style={{
            display: "flex",
            gap: 10,
            marginTop: 22,
            flexWrap: "wrap",
          }}
        >
          <Button onClick={onPrev}>⏮</Button>

          <Button onClick={onPlayPause}>
            {isPlaying ? "Pause" : "Play"}
          </Button>

          <Button onClick={onNext}>⏭</Button>

          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ================================
   CLOUDFLARE FILE UPLOAD
================================ */

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

/* ================================
   CLOUDFLARE SONG CRUD
================================ */

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

/* ================================
   ADMIN LOGIN
================================ */

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

/* ================================
   SONG ANALYTICS
================================ */

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

/* ================================
   SUPABASE BACKUP SONG STORAGE
================================ */

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
  const { error } = await supabase
    .from("songs_backup")
    .delete()
    .eq("song_id", songId);

  if (error) {
    throw error;
  }
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
  const [adminSection, setAdminSection] = useState("dashboard");
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

  const [windowWidth, setWindowWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1200
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
    if (editingSongId && hasUnsavedSongChanges && editingSongId !== song.id) {
      const confirmed = window.confirm(
        "You have unsaved changes. Switch songs and lose those changes?"
      );
      if (!confirmed) return;
    }

    setEditingSongId(song.id);
    setEditingOriginalSong(song);
    setAdminSection("upload");

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
          const normalizedSongs = ensureSongSortOrders(cloudSongs);

          const { data: likesData, error: likesError } = await supabase
            .from("song_likes")
            .select("*");

          const likesMap = new Map(
            (likesData || []).map((row) => [row.song_id, Number(row.likes || 0)])
          );

          const songsWithLiveLikes = normalizedSongs.map((song) => ({
            ...song,
            likes: likesMap.has(song.id)
              ? likesMap.get(song.id)
              : Number(song.likes || 0),
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
        console.warn(
          "Could not load songs from Cloudflare, trying Supabase backup:",
          error
        );

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
          const localSongs = ensureSongSortOrders(
            getStored(STORAGE_KEYS.songs, DEFAULT_SONGS)
          );
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
              likes: likesMap.has(song.id)
                ? likesMap.get(song.id)
                : Number(song.likes || 0),
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
          const { data, error } = await supabase
            .from("song_analytics")
            .select("*");

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
    return [...publicSongs]
      .sort((a, b) => (b.likes || 0) - (a.likes || 0))
      .slice(0, 3);
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
      setAdminSection("dashboard");
      setLoginError("");
      setAdminPassword("");
    } catch (error) {
      setLoginError(error.message || "Wrong password.");
    }
  };

  const handleLogout = () => {
    setAdminLoggedIn(false);
    setView("home");
    setAdminSection("dashboard");
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

      let uploadedCoverUrl =
        editingOriginalSong?.coverUrl || newSong.coverUrl || "";
      let uploadedAudioUrl =
        editingOriginalSong?.audioUrl || newSong.audioUrl || "";

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
        setSongs((prev) =>
          prev.map((song) => (song.id === editingSongId ? item : song))
        );

        await autoCleanReplacedFiles({
          oldSong: editingOriginalSong,
          newCoverUrl: uploadedCoverUrl,
          newAudioUrl: uploadedAudioUrl,
        });

        setUploadSuccess(`✅ "${item.title}" was updated successfully.`);
      } else {
        setSongs((prev) => [...prev, item]);
        setUploadSuccess(`🎵 "${item.title}" was uploaded successfully.`);
      }

      setHasUnsavedSongChanges(false);
      resetSongForm();
      setAdminSection("songs");
    } catch (error) {
      alert(error.message || "Save failed");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteSong = async (songOrId) => {
    const id = typeof songOrId === "string" ? songOrId : songOrId?.id;
    const songToDelete = songs.find((song) => song.id === id);
    if (!songToDelete) return;

    const confirmed = window.confirm(`Delete "${songToDelete.title}"?`);
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
      `Delete request "${requestToDelete.title}" from ${requestToDelete.name}?`
    );
    if (!confirmed) return;

    const { error } = await supabase
      .from("song_requests")
      .delete()
      .eq("id", requestId);

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

    const confirmed = window.confirm(
      `Delete private message from "${messageToDelete.from}"?`
    );
    if (!confirmed) return;

    const { error } = await supabase
      .from("private_messages")
      .delete()
      .eq("id", messageId);

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
      prev.map((msg) =>
        msg.id === messageId ? { ...msg, status: nextStatus } : msg
      )
    );
  };

  const handleMoveSong = async (songOrId, direction) => {
    if (isReorderingSongs) return;

    const songId = typeof songOrId === "string" ? songOrId : songOrId?.id;
    const visibleList = [...adminSongs];
    const currentIndex = visibleList.findIndex((song) => song.id === songId);

    if (currentIndex === -1) return;

    const targetIndex =
      direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= visibleList.length) return;

    const currentSong = visibleList[currentIndex];
    const targetSong = visibleList[targetIndex];

    const currentSortOrder = Number.isFinite(Number(currentSong.sortOrder))
      ? Number(currentSong.sortOrder)
      : currentIndex + 1;

    const targetSortOrder = Number.isFinite(Number(targetSong.sortOrder))
      ? Number(targetSong.sortOrder)
      : targetIndex + 1;

    const updatedCurrentSong = {
      ...currentSong,
      sortOrder: targetSortOrder,
    };
    const updatedTargetSong = {
      ...targetSong,
      sortOrder: currentSortOrder,
    };
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
          ? `${trimmedReplyPlatform}: ${trimmedReplyContact}`
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
    setMessageForm({
      from: "",
      replyPlatform: "",
      replyContact: "",
      message: "",
    });
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
      .update({
        linked_song_id: songId,
        status: songId ? "done" : "pending",
      })
      .eq("id", requestId);

    if (error) {
      console.error("Could not link request:", error);
      return;
    }

    setRequests((prev) =>
      prev.map((r) =>
        r.id === requestId
          ? {
              ...r,
              linkedSongId: songId,
              status: songId ? "done" : "pending",
            }
          : r
      )
    );
  };

  const openPayPalDonation = () => {
    window.open(PAYPAL_URL, "_blank", "noopener,noreferrer");
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
    a.download =
      getFileNameFromUrl(song.audioUrl) || `${song.title || "song"}.mp3`;
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
          doc.addImage(
            logoData,
            "PNG",
            (pageWidth - logoWidth) / 2,
            y,
            logoWidth,
            logoHeight
          );
          y += 28;
        }
      } catch (logoError) {
        console.warn("Could not add logo to PDF:", logoError);
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      doc.setTextColor(20, 20, 20);
      doc.text(song.title || "Untitled Song", pageWidth / 2, y, {
        align: "center",
      });
      y += 10;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(90, 90, 90);
      doc.text(`Artist: ${song.artist || "DJ-Buang"}`, pageWidth / 2, y, {
        align: "center",
      });
      y += 6;

      doc.text(songType, pageWidth / 2, y, { align: "center" });
      y += 10;

      doc.setDrawColor(210, 210, 210);
      doc.line(marginX, y, pageWidth - marginX, y);
      y += 10;

      const addFooter = () => {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(10);
        doc.setTextColor(110, 110, 110);
        doc.text(footerText, pageWidth / 2, pageHeight - 10, {
          align: "center",
        });
      };

      const applyLyricsTextStyle = () => {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(12);
        doc.setTextColor(20, 20, 20);
      };

      const lyricsLines = doc.splitTextToSize(song.lyrics, contentWidth);

      addFooter();
      applyLyricsTextStyle();

      const lineHeight = 6.6;

      for (let i = 0; i < lyricsLines.length; i += 1) {
        if (y > pageHeight - 18) {
          doc.addPage();
          y = 20;
          addFooter();
          applyLyricsTextStyle();
        }

        doc.text(lyricsLines[i], marginX, y);
        y += lineHeight;
      }

      const safeTitle = (song.title || "lyrics")
        .replace(/[<>:"/\\|?*]+/g, "")
        .trim();

      doc.save(`${safeTitle}-lyrics.pdf`);
    } catch (error) {
      console.error("Could not create lyrics PDF:", error);
      alert("Could not generate PDF.");
    }
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

  function RequestReviewModal({ request, onClose, songs, onOpenSong }) {
    if (!request) return null;

    const linkedSong = songs.find((song) => song.id === request.linkedSongId);

    return (
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.72)",
          display: "grid",
          placeItems: "center",
          zIndex: 1100,
          padding: 16,
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: "min(680px, 100%)",
            maxHeight: "85vh",
            overflowY: "auto",
            padding: 24,
            borderRadius: 24,
            background:
              "linear-gradient(180deg, rgba(10,14,28,0.98), rgba(6,10,22,0.98))",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 18px 60px rgba(0,0,0,0.38)",
            color: "white",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "flex-start",
              marginBottom: 18,
            }}
          >
            <div>
              <h2 style={{ margin: 0, fontSize: 24 }}>Request Review</h2>
              <p style={{ margin: "8px 0 0", color: "rgba(255,255,255,0.70)" }}>
                Full request details and linked song preview.
              </p>
            </div>

            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>

          <div style={{ display: "grid", gap: 14 }}>
            <div
              style={{
                padding: 16,
                borderRadius: 18,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 6 }}>
                Requested by
              </div>
              <strong>{request.name || "Unknown"}</strong>
            </div>

            <div
              style={{
                padding: 16,
                borderRadius: 18,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 6 }}>
                Song idea
              </div>
              <strong>{request.title || "Untitled request"}</strong>
            </div>

            <div
              style={{
                padding: 16,
                borderRadius: 18,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 6 }}>
                Details
              </div>
              <div style={{ lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                {request.details || "No extra details provided."}
              </div>
            </div>

            <div
              style={{
                padding: 16,
                borderRadius: 18,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 6 }}>
                Delivery / notify / contact
              </div>
              <div style={{ lineHeight: 1.6 }}>
                <div>
                  Delivery: {request.delivery === "private" ? "Private" : "Public"}
                </div>
                <div>Notify: {request.notify ? "Yes" : "No"}</div>
                <div>Email: {request.email || "No email provided"}</div>
                <div>Status: {request.status || "pending"}</div>
                <div>Created: {formatDate(request.createdAt)}</div>
              </div>
            </div>

            <div
              style={{
                padding: 16,
                borderRadius: 18,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 10 }}>
                Linked song
              </div>

              {linkedSong ? (
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <strong>
                    {linkedSong.title} — {linkedSong.artist}
                  </strong>

                  <Button variant="secondary" onClick={() => onOpenSong(linkedSong)}>
                    Open Song
                  </Button>
                </div>
              ) : (
                <div style={{ color: "rgba(255,255,255,0.72)" }}>
                  No uploaded song linked yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

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
                  padding: isMobile ? "20px 16px" : 34,
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
                  width: "100%",
                  maxWidth: "100%",
                  overflowX: "hidden",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "nowrap",
                      marginBottom: isMobile ? 10 : 18,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        flexWrap: "nowrap",
                        overflow: "hidden",
                        alignItems: "center",
                        minWidth: 0,
                        flex: 1,
                      }}
                    >
                      <Badge
                        style={{
                          flex: isMobile ? "1 1 auto" : "0 0 auto",
                          justifyContent: "center",
                          minWidth: 0,
                        }}
                      >
                        DJ-Buang Official
                      </Badge>

                      <Badge
                        style={{
                          flex: isMobile ? "1 1 auto" : "0 0 auto",
                          justifyContent: "center",
                          minWidth: 0,
                        }}
                      >
                        🎤 Mobile ready
                      </Badge>

                      {isMobile ? (
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setMessageSuccess("");
                            setUploadSuccess("");
                            setAdminSection("dashboard");
                            setView(adminLoggedIn ? "admin" : "login");
                          }}
                          style={{
                            minWidth: "auto",
                            padding: "8px 12px",
                            fontSize: 13,
                            marginLeft: "auto",
                            flexShrink: 0,
                          }}
                        >
                          🔒 Admin
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <h1
                    style={{
                      margin: 0,
                      fontSize: isMobile ? "42px" : "clamp(44px, 7vw, 74px)",
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
                      fontSize: isMobile ? 16 : 18,
                      lineHeight: 1.45,
                      color: "rgba(255,255,255,0.76)",
                    }}
                  >
                    I’m DJ-BUANG, also known as OwGusson — making songs for the
                    Date In Asia community, friends, and the occasional private
                    request along the way.
                    <br />
                    <br />
                    Feel free to explore the library, give your favorite tracks a
                    thumbs-up, and download songs or lyrics if something speaks
                    to you. If you enjoy the music and want to support what I do,
                    it’s always appreciated — but most of all, I’m just glad
                    you’re here listening.
                  </p>

                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      flexWrap: "wrap",
                      marginTop: isMobile ? 14 : 24,
                    }}
                  >
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
                    alignItems: isMobile ? "stretch" : "flex-end",
                    gap: isMobile ? 14 : 18,
                    marginTop: 6,
                    minWidth: isMobile ? 0 : 260,
                  }}
                >
                  {!isMobile ? (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setMessageSuccess("");
                        setUploadSuccess("");
                        setAdminSection("dashboard");
                        setView(adminLoggedIn ? "admin" : "login");
                      }}
                      style={{
                        minWidth: "auto",
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
                      alignSelf: isMobile ? "center" : "flex-end",
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

                    <Select
                      value={filterMode}
                      onChange={(e) => setFilterMode(e.target.value)}
                    >
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
                        <SectionHeading
                          icon="⭐"
                          title="Featured Spotlight"
                          tone="featured"
                        />

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
                            onCopyLink={copySongLink}
                          />
                        ))}
                      </div>
                    ) : null}

                    {showSpotlights && newestSpotlightSongs.length > 0 ? (
                      <div style={{ display: "grid", gap: 12 }}>
                        <SectionHeading
                          icon="🆕"
                          title="Newest Drops"
                          tone="new"
                        />

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
                            onCopyLink={copySongLink}
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
                            onCopyLink={copySongLink}
                          />
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: "rgba(255,255,255,0.70)" }}>
                        No more songs found.
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
                                    i === 0
                                      ? "#fde68a"
                                      : i === 1
                                      ? "#cbd5e1"
                                      : "#fdba74",
                                  marginBottom: 8,
                                  fontWeight: 800,
                                  letterSpacing: "0.08em",
                                }}
                              >
                                #{i + 1}
                              </div>

                              <div style={{ fontSize: 20, fontWeight: 700 }}>
                                {song.title}
                              </div>

                              <div
                                style={{
                                  color: "rgba(255,255,255,0.70)",
                                  marginTop: 4,
                                }}
                              >
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

                <Panel
                  title="◉ Connect"
                  subtitle="Song requests, private messages, and support are open."
                >
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
          <Panel
            title="Song Request"
            subtitle="Send a request and it will show up in the admin panel."
          >
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
                </div>
              </div>
            )}

            <form
              onSubmit={handleRequestSubmit}
              style={{ display: "grid", gap: 16, maxWidth: 760 }}
            >
              <Input
                label="Name"
                value={requestForm.name}
                onChange={(e) =>
                  setRequestForm((prev) => ({ ...prev, name: e.target.value }))
                }
              />

              <Input
                label="Song title / idea"
                value={requestForm.title}
                onChange={(e) =>
                  setRequestForm((prev) => ({ ...prev, title: e.target.value }))
                }
              />

              <TextArea
                label="Details"
                value={requestForm.details}
                onChange={(e) =>
                  setRequestForm((prev) => ({ ...prev, details: e.target.value }))
                }
              />

              <Select
                label="Delivery"
                value={requestForm.delivery}
                onChange={(e) =>
                  setRequestForm((prev) => ({
                    ...prev,
                    delivery: e.target.value,
                  }))
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
                onChange={(e) =>
                  setRequestForm((prev) => ({ ...prev, email: e.target.value }))
                }
              />

              <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={requestForm.notify}
                  onChange={(e) =>
                    setRequestForm((prev) => ({
                      ...prev,
                      notify: e.target.checked,
                    }))
                  }
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
                  onClick={() => setView("home")}
                >
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

            <form
              onSubmit={handleMessageSubmit}
              style={{ display: "grid", gap: 16, maxWidth: 760 }}
            >
              <Input
                label="Name or username"
                value={messageForm.from}
                onChange={(e) =>
                  setMessageForm((prev) => ({ ...prev, from: e.target.value }))
                }
              />

              <Select
                label="Reply platform (optional)"
                value={messageForm.replyPlatform}
                onChange={(e) =>
                  setMessageForm((prev) => ({
                    ...prev,
                    replyPlatform: e.target.value,
                  }))
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
                  setMessageForm((prev) => ({
                    ...prev,
                    replyContact: e.target.value,
                  }))
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

                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setView("home")}
                >
                  Back Home
                </Button>
              </div>
            </form>
          </Panel>
        )}

        {view === "login" && !adminLoggedIn && (
          <Panel
            title="Admin Login"
            subtitle="Use this to open the private admin dashboard."
          >
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

                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setView("home")}
                >
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
              subtitle="Manage songs, requests, private messages, and uploads."
              right={
                <Button variant="secondary" onClick={handleLogout}>
                  Logout
                </Button>
              }
            >
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  marginBottom: 18,
                  flexWrap: "wrap",
                }}
              >
                <Button
                  variant={adminSection === "dashboard" ? "primary" : "secondary"}
                  onClick={() => setAdminSection("dashboard")}
                >
                  Dashboard
                </Button>

                <Button
                  variant={adminSection === "upload" ? "primary" : "secondary"}
                  onClick={() => setAdminSection("upload")}
                >
                  Upload
                </Button>

                <Button
                  variant={adminSection === "songs" ? "primary" : "secondary"}
                  onClick={() => setAdminSection("songs")}
                >
                  Songs
                </Button>

                <Button
                  variant={adminSection === "requests" ? "primary" : "secondary"}
                  onClick={() => setAdminSection("requests")}
                >
                  Requests ({pendingRequests})
                </Button>

                <Button
                  variant={adminSection === "messages" ? "primary" : "secondary"}
                  onClick={() => setAdminSection("messages")}
                >
                  Messages ({newMessages})
                </Button>
              </div>

              {adminSection === "dashboard" && (
                <div style={{ display: "grid", gap: 16 }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: isMobile
                        ? "repeat(2, minmax(0, 1fr))"
                        : "repeat(4, minmax(0, 1fr))",
                      gap: 14,
                    }}
                  >
                    <StatPill label="Songs" value={songs.length} />
                    <StatPill label="Likes" value={totalLikes} />
                    <StatPill label="Opens" value={totalOpens} />
                    <StatPill label="Plays" value={totalPlays} />
                  </div>

                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <Button
                      variant="secondary"
                      onClick={() => setAdminSection("upload")}
                    >
                      Open Upload
                    </Button>

                    <Button
                      variant="secondary"
                      onClick={() => setAdminSection("songs")}
                    >
                      See All Songs
                    </Button>

                    <Button
                      variant="secondary"
                      onClick={() => setAdminSection("requests")}
                    >
                      See All Requests
                    </Button>

                    <Button
                      variant="secondary"
                      onClick={() => setAdminSection("messages")}
                    >
                      See All Messages
                    </Button>
                  </div>
                </div>
              )}
            </Panel>

            {adminSection === "upload" && (
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
                    <div
                      style={{
                        marginBottom: 8,
                        fontSize: 14,
                        color: "rgba(255,255,255,0.82)",
                      }}
                    >
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
                    <div
                      style={{
                        marginBottom: 8,
                        fontSize: 14,
                        color: "rgba(255,255,255,0.82)",
                      }}
                    >
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

                  <div
                    style={{
                      gridColumn: "1 / -1",
                      display: "flex",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <Button type="submit" variant="primary" disabled={isUploading}>
                      {isUploading
                        ? "Saving..."
                        : editingSongId
                        ? "Save Changes"
                        : "Upload Song"}
                    </Button>

                    {editingSongId ? (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={cancelEditSong}
                      >
                        Cancel Edit
                      </Button>
                    ) : null}
                  </div>
                </form>
              </Panel>
            )}

            {adminSection === "songs" && (
              <Panel
                title="Song Library"
                subtitle="Manage uploaded songs, edit, delete, and reorder."
                right={
                  <div style={{ minWidth: 220 }}>
                    <Select
                      value={adminSongFilter}
                      onChange={(e) => setAdminSongFilter(e.target.value)}
                    >
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
                <div style={{ display: "grid", gap: 14 }}>
                  {adminSongs.length > 0 ? (
                    adminSongs.map((song, index) => (
                      <SongRow
                        key={song.id}
                        song={song}
                        analytics={songAnalytics[song.id]}
                        onLike={handleLikeSong}
                        onOpenPlayer={handleOpenSong}
                        onDownloadSong={downloadSong}
                        onDownloadLyrics={downloadLyrics}
                        onCopyLink={copySongLink}
                        isMobile={isMobile}
                        isAdmin
                        onEdit={() => startEditSong(song)}
                        onDelete={() => handleDeleteSong(song)}
                        onMoveUp={() => handleMoveSong(song, "up")}
                        onMoveDown={() => handleMoveSong(song, "down")}
                        canMoveUp={index > 0 && !isReorderingSongs}
                        canMoveDown={
                          index < adminSongs.length - 1 && !isReorderingSongs
                        }
                      />
                    ))
                  ) : (
                    <div style={{ color: "rgba(255,255,255,0.72)" }}>
                      No songs yet.
                    </div>
                  )}
                </div>
              </Panel>
            )}

            {adminSection === "requests" && (
              <Panel title="Requests" subtitle="Review and manage song requests.">
                <div style={{ display: "grid", gap: 12 }}>
                  {filteredRequests.length > 0 ? (
                    filteredRequests.map((req) => (
                      <div
                        key={req.id}
                        style={{
                          padding: 16,
                          borderRadius: 18,
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.08)",
                        }}
                      >
                        <strong>{req.title}</strong>

                        <div
                          style={{
                            fontSize: 13,
                            opacity: 0.7,
                            marginTop: 6,
                          }}
                        >
                          Requested by {req.name} • {timeAgo(req.createdAt)}
                        </div>

                        <div
                          style={{
                            fontSize: 13,
                            opacity: 0.7,
                            marginTop: 6,
                          }}
                        >
                          Status: {req.status} • Delivery:{" "}
                          {req.delivery === "private" ? "Private" : "Public"}
                        </div>

                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            marginTop: 12,
                            flexWrap: "wrap",
                          }}
                        >
                          <Button
                            variant="secondary"
                            onClick={() => setSelectedRequest(req)}
                          >
                            Review
                          </Button>

                          <Button
                            variant="secondary"
                            onClick={() => toggleRequestStatus(req.id)}
                          >
                            {req.status === "done" ? "Mark Pending" : "Mark Done"}
                          </Button>

                          <Button
                            variant="danger"
                            onClick={() => handleDeleteRequest(req.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ color: "rgba(255,255,255,0.72)" }}>
                      No requests yet.
                    </div>
                  )}
                </div>
              </Panel>
            )}

            {adminSection === "messages" && (
              <Panel title="Messages" subtitle="Read and manage private messages.">
                <div style={{ display: "grid", gap: 12 }}>
                  {messages.length > 0 ? (
                    messages.map((msg) => (
                      <div
                        key={msg.id}
                        style={{
                          padding: 16,
                          borderRadius: 18,
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.08)",
                        }}
                      >
                        <strong>{msg.from}</strong>

                        <div
                          style={{
                            fontSize: 13,
                            opacity: 0.7,
                            marginTop: 6,
                          }}
                        >
                          {msg.replyContact || "No reply contact"}
                        </div>

                        <p style={{ margin: "12px 0 0", lineHeight: 1.5 }}>
                          {msg.message}
                        </p>

                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            marginTop: 12,
                            flexWrap: "wrap",
                          }}
                        >
                          <Button
                            variant="secondary"
                            onClick={() => toggleMessageStatus(msg.id)}
                          >
                            {msg.status === "new" ? "Mark Read" : "Mark New"}
                          </Button>

                          <Button
                            variant="danger"
                            onClick={() => handleDeleteMessage(msg.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ color: "rgba(255,255,255,0.72)" }}>
                      No messages yet.
                    </div>
                  )}
                </div>
              </Panel>
            )}
          </div>
        )}

        <RequestReviewModal
          request={selectedRequest}
          onClose={() => setSelectedRequest(null)}
          songs={songs}
          onOpenSong={handleOpenSong}
        />

        {/* PLAYER UI */}
        {playerSong && !playerMinimized ? (
          <PlayerModal
            song={playerSong}
            isPlaying={isPlaying}
            onPlayPause={handlePlayPause}
            onClose={handleClosePlayer}
            onNext={handleNextSong}
            onPrev={handlePreviousSong}
          />
        ) : null}

        {playerSong && playerMinimized ? (
          <MiniPlayer
            song={playerSong}
            isPlaying={isPlaying}
            onPlayPause={handlePlayPause}
            onExpand={handleExpandPlayer}
            onNext={handleNextSong}
            onPrev={handlePreviousSong}
          />
        ) : null}
      </div>
    </div>
  );
}

export default App;