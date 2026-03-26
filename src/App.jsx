import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Music,
  Heart,
  Upload,
  MessageSquare,
  ClipboardList,
  Download,
  FileText,
  X,
  Shield,
  EyeOff,
  Search,
} from "lucide-react";

/* -------------------------
   SIMPLE UI HELPERS
-------------------------- */

const Button = ({ children, onClick }) => (
  <button
    onClick={onClick}
    style={{
      padding: "10px 14px",
      borderRadius: 10,
      border: "1px solid #333",
      background: "#111",
      color: "white",
      cursor: "pointer",
      marginRight: 6,
    }}
  >
    {children}
  </button>
);

const Input = (props) => (
  <input
    {...props}
    style={{
      width: "100%",
      padding: 10,
      marginBottom: 10,
      borderRadius: 8,
      border: "1px solid #333",
      background: "#111",
      color: "white",
    }}
  />
);

const Textarea = (props) => (
  <textarea
    {...props}
    style={{
      width: "100%",
      padding: 10,
      marginBottom: 10,
      borderRadius: 8,
      border: "1px solid #333",
      background: "#111",
      color: "white",
    }}
  />
);

/* -------------------------
   SAMPLE SONG DATA
-------------------------- */

const initialSongs = [
  {
    id: 1,
    title: "Midnight in Manila",
    artist: "DJ-Buang",
    genre: "EDM Pop",
    likes: 42,
    cover:
      "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f",
    audio:
      "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    lyrics: "City lights and ocean air...",
  },
];

/* -------------------------
   APP START
-------------------------- */

export default function App() {
  const [songs, setSongs] = useState(initialSongs);
  const [currentPlaying, setCurrentPlaying] = useState(null);
  const [selectedSong, setSelectedSong] = useState(null);

  const [isAdmin, setIsAdmin] = useState(false);

  const [uploadForm, setUploadForm] = useState({
    title: "",
    genre: "",
    cover: "",
    audio: "",
    lyrics: "",
  });

  function readFile(file, callback) {
    const reader = new FileReader();
    reader.onload = () => callback(reader.result);
    reader.readAsDataURL(file);
  }

  function handleCoverUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    readFile(file, (result) =>
      setUploadForm((s) => ({ ...s, cover: result }))
    );
  }

  function handleAudioUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    readFile(file, (result) =>
      setUploadForm((s) => ({ ...s, audio: result }))
    );
  }

  function addSong() {
    if (!uploadForm.title) return;

    const newSong = {
      id: Date.now(),
      title: uploadForm.title,
      genre: uploadForm.genre,
      cover: uploadForm.cover,
      audio: uploadForm.audio,
      lyrics: uploadForm.lyrics,
      likes: 0,
    };

    setSongs((s) => [newSong, ...s]);

    setUploadForm({
      title: "",
      genre: "",
      cover: "",
      audio: "",
      lyrics: "",
    });
  }

  function downloadLyrics(song) {
    const blob = new Blob([song.lyrics], {
      type: "text/plain",
    });

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `${song.title}.txt`;
    a.click();
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#09090b",
        color: "white",
        padding: 24,
        paddingBottom: currentPlaying ? 120 : 40,
      }}
    >
      <h1>🎧 DJ-Buang Song Website</h1>

      {!isAdmin && (
        <Button onClick={() => setIsAdmin(true)}>
          <Shield size={14} /> Admin Login
        </Button>
      )}

      {isAdmin && (
        <>
          <h2>
            <Upload size={16} /> Upload Song
          </h2>

          <Input
            placeholder="Song title"
            value={uploadForm.title}
            onChange={(e) =>
              setUploadForm((s) => ({
                ...s,
                title: e.target.value,
              }))
            }
          />

          <Input
            placeholder="Genre"
            value={uploadForm.genre}
            onChange={(e) =>
              setUploadForm((s) => ({
                ...s,
                genre: e.target.value,
              }))
            }
          />

          Cover:
          <input type="file" onChange={handleCoverUpload} />

          <br />
          <br />

          MP3:
          <input type="file" onChange={handleAudioUpload} />

          <Textarea
            placeholder="Paste lyrics"
            rows={5}
            value={uploadForm.lyrics}
            onChange={(e) =>
              setUploadForm((s) => ({
                ...s,
                lyrics: e.target.value,
              }))
            }
          />

          <Button onClick={addSong}>Add Song</Button>
        </>
      )}

      <h2>
        <Music size={18} /> Songs
      </h2>

      {songs.map((song) => (
        <div key={song.id}>
          <img src={song.cover} width="140" />

          <br />

          <Button
            onClick={() => {
              setSelectedSong(song);
              setCurrentPlaying(song);
            }}
          >
            Open
          </Button>
        </div>
      ))}

      {selectedSong && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "#000000cc",
            padding: 40,
          }}
        >
          <Button onClick={() => setSelectedSong(null)}>
            <X />
          </Button>

          <h2>{selectedSong.title}</h2>

          <img src={selectedSong.cover} width="260" />

          <audio controls src={selectedSong.audio} />

          <br />

          <Button
            onClick={() => {
              const a = document.createElement("a");
              a.href = selectedSong.audio;
              a.download = selectedSong.title + ".mp3";
              a.click();
            }}
          >
            <Download /> Download MP3
          </Button>

          <Button onClick={() => downloadLyrics(selectedSong)}>
            <FileText /> Download Lyrics
          </Button>

          <pre>{selectedSong.lyrics}</pre>
        </div>
      )}

      {currentPlaying && (
        <motion.div
          initial={{ y: 120 }}
          animate={{ y: 0 }}
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            background: "#111",
            padding: 12,
          }}
        >
          {currentPlaying.title}

          <audio controls autoPlay src={currentPlaying.audio} />

          <Button onClick={() => setCurrentPlaying(null)}>
            <X />
          </Button>
        </motion.div>
      )}
    </div>
  );
}