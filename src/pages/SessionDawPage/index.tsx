import  { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as Tone from 'tone';
import { 
  Play, Square, Volume2, VolumeX,  Trash2, Save,  ArrowLeft, 
  Mic, Settings,  Loader
} from 'lucide-react';
import './styles.scss'; 

import { sessionsApi } from '../../api/sessionsApi'; 
import type { Session, SessionTrack, UpdateSessionRequest } from '../../api/types/session';
import { useAuth } from '../../context/AuthContext';

// Looper için sabitler
const DEFAULT_BARS = 4;
const LATENCY_STEP_MS = 10;

export default function SessionDawPage() {
  const { account } = useAuth();
  const { sessionToken } = useParams<{ sessionToken: string }>();
  const navigate = useNavigate();

  // --- STATE ---
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  // Looper State
  const [isPlaying, setIsPlaying] = useState(false);
  const [recordingState, setRecordingState] = useState<'idle' | 'counting' | 'recording'>('idle');
  const [countIn, setCountIn] = useState(0);
  const [progress, setProgress] = useState(0); // %0 - %100 arası global loop ilerlemesi
  const [editingTrackId, setEditingTrackId] = useState<number | null>(null); // Slip Edit açılan track

  // Audio Refs
  const playersRef = useRef<Map<number, Tone.Player>>(new Map());
  const channelRef = useRef<Map<number, Tone.Channel>>(new Map());
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  // --- INIT ---
  useEffect(() => {
    const loadSession = async () => {
      if (!sessionToken || !account) return;
      try {
        const response = await sessionsApi.getSession(sessionToken);
        const data = response.data;
        
        // Looper Varsayılanları (Veritabanında yoksa)
        if (!data.loopEndInSeconds) {
            const beatDuration = 60 / (data.bpm || 120);
            data.loopEndInSeconds = beatDuration * 4 * DEFAULT_BARS; 
        }

        setSession(data);
        const transport = Tone.getTransport();

        transport.bpm.value = data.bpm;
        transport.loop = true;
        transport.loopStart = 0;
        transport.loopEnd = data.loopEndInSeconds;

        await Tone.loaded();
        data.tracks.forEach(track => setupTrackAudio(track));
      } catch (err) {
        console.error("Failed to load session", err);
      } finally {
        setLoading(false);
      }
    };
    loadSession();
    return () => {
      playersRef.current.forEach(p => p.dispose());
      channelRef.current.forEach(c => c.dispose());
      cancelAnimationFrame(animationFrameRef.current!);
      Tone.Transport.stop();
    };
  }, [sessionToken, account]);

  // --- AUDIO SETUP ---
  const setupTrackAudio = (track: SessionTrack) => {
    // Kanal oluştur
    if(channelRef.current.has(track.id)) channelRef.current.get(track.id)?.dispose();
    const channel = new Tone.Channel({
      volume: track.volumeDb,
      mute: track.isMuted,
      solo: track.isSolo
    }).toDestination();
    channelRef.current.set(track.id, channel);

    // Player oluştur
    if(playersRef.current.has(track.id)) playersRef.current.get(track.id)?.dispose();

    if (track.audioFileUrl) {
        const player = new Tone.Player({
            url: track.audioFileUrl,
            loop: true, // Looper mantığı: her track loop döner
            onload: () => {
                player.sync().start(0);
                // Latency (Slip) ayarı buraya eklenebilir: player.start(offset) 
                // Ancak Tone.js sync modunda loop offset biraz trick'lidir, MVP için start(0) yeterli.
            },
        }).connect(channel);
        playersRef.current.set(track.id, player);
    }
  };

  // --- LOOP ENGINE ---
  useEffect(() => {
    if (isPlaying || recordingState === 'recording') {
        const loopDuration = Tone.Transport.loopEnd as number;
        
        const loopEngine = () => {
            // Tone.Transport.seconds, loop süresince artar ve sıfırlanır
            const current = Tone.Transport.seconds;
            const pct = (current / loopDuration) * 100;
            setProgress(pct);

            // Kayıt Bitiş Kontrolü
            if (recordingState === 'recording') {
                // Eğer döngü başa sardıysa (current çok küçükse) ve kayıt eskiyse durdur
                if (current < 0.1 && (Date.now() - startTimeRef.current > 1000)) {
                    finishRecording();
                }
            }
            animationFrameRef.current = requestAnimationFrame(loopEngine);
        };
        animationFrameRef.current = requestAnimationFrame(loopEngine);
    } else {
        cancelAnimationFrame(animationFrameRef.current!);
    }
  }, [isPlaying, recordingState]);


  // --- ACTIONS ---

  const handleRecordSequence = async () => {
    if (recordingState !== 'idle') return; // Zaten kayıttaysa çık
    if (Tone.context.state !== 'running') await Tone.start();

    // 1. Playback'i durdur, başa sar
    Tone.Transport.stop();
    setIsPlaying(false);
    setProgress(0);
    setRecordingState('counting');

    // 2. Count-In (Geri Sayım - 4 Beat)
    let count = 4;
    setCountIn(count);
    const interval = setInterval(() => {
        count--;
        setCountIn(count);
        if (count === 0) {
            clearInterval(interval);
            startRecording();
        }
    }, (60 / (session?.bpm || 120)) * 1000); // BPM'e göre hız
  };

  const startRecording = async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorderRef.current = new MediaRecorder(stream);
        audioChunksRef.current = [];

        mediaRecorderRef.current.ondataavailable = (e) => {
            if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };

        mediaRecorderRef.current.start();
        setRecordingState('recording');
        setIsPlaying(true);
        
        // Tam barda başlamak için
        Tone.Transport.stop();
        Tone.Transport.position = 0;
        Tone.Transport.start();
        startTimeRef.current = Date.now();

    } catch (err) {
        console.error("Mic Error", err);
        setRecordingState('idle');
        alert("Microphone access denied.");
    }
  };

  const finishRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
        // Stream tracks kapat
        mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
    }

    setRecordingState('idle');
    // Session güncelleme işlemi onstop eventinde yapılacak,
    // ama state senkronizasyonu için burada Tone.js'i durdurmuyoruz, loop devam etsin.
    
    // Blob'u işle
    setTimeout(async () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const blobUrl = URL.createObjectURL(blob);
        const arrayBuffer = await blob.arrayBuffer();
        const audioBuffer = await Tone.context.decodeAudioData(arrayBuffer);

        const newTrack: SessionTrack = {
            id: -Date.now(),
            sessionId: session!.id,
            name: `Loop ${session!.tracks.length + 1}`,
            audioFileUrl: blobUrl,
            durationInSeconds: audioBuffer.duration,
            startTimeInSeconds: 0,
            startTrimInSeconds: 0,
            endTrimInSeconds: 0,
            volumeDb: 0,
            pan: 0,
            isMuted: false,
            isSolo: false,
            isMono: false,
            order: session!.tracks.length,
            createdAtUtc: new Date().toISOString(),
            // @ts-ignore (Backend'de yoksa frontend state için ekliyoruz)
            latencyOffsetMs: 0 
        };

        setSession(prev => prev ? { ...prev, tracks: [...prev.tracks, newTrack] } : null);
        setupTrackAudio(newTrack);
        setHasUnsavedChanges(true);
    }, 200);
  };

  const togglePlay = async () => {
    if (Tone.context.state !== 'running') await Tone.start();
    
    if (isPlaying) {
        Tone.Transport.pause();
        setIsPlaying(false);
    } else {
        Tone.Transport.start();
        setIsPlaying(true);
    }
  };

  // --- TRACK MANIPULATION ---
  const toggleMute = (id: number) => {
    setSession(prev => {
        if(!prev) return null;
        const newTracks = prev.tracks.map(t => t.id === id ? { ...t, isMuted: !t.isMuted } : t);
        return { ...prev, tracks: newTracks };
    });
    const track = session?.tracks.find(t => t.id === id);
    if(track) channelRef.current.get(id)?.set({ mute: !track.isMuted });
    setHasUnsavedChanges(true);
  };

  const deleteTrack = (id: number) => {
    if(!window.confirm("Remove this loop?")) return;
    setSession(prev => prev ? { ...prev, tracks: prev.tracks.filter(t => t.id !== id) } : null);
    playersRef.current.get(id)?.dispose();
    playersRef.current.delete(id);
    channelRef.current.get(id)?.dispose();
    setHasUnsavedChanges(true);
  };

  const nudgeTrack = (id: number, deltaMs: number) => {
      // Slip edit: sadece state güncelliyoruz, görsel olarak kayıyor.
      setSession(prev => {
          if(!prev) return null;
          return {
              ...prev,
              tracks: prev.tracks.map(t => {
                  if (t.id !== id) return t;
                  // @ts-ignore
                  const currentOffset = t.latencyOffsetMs || 0;
                  return { ...t, latencyOffsetMs: currentOffset + deltaMs };
              })
          }
      });
      setHasUnsavedChanges(true);
  };

  const handleSave = async () => {
      if(!session) return;
      try {
          const payload: UpdateSessionRequest = { ...session };
          await sessionsApi.updateSession(payload);
          setHasUnsavedChanges(false);
      } catch (e) {
          alert("Save failed");
      }
  };

  if (loading || !session) return <div className="daw-container loading"><Loader className="spin" /> Loading Session...</div>;

  return (
    <div className="daw-container">
        
        {/* 1. HEADER (Compact) */}
        <header className="daw-header">
            <div className="left-group">
                <button className="icon-btn" onClick={() => navigate(-1)}><ArrowLeft /></button>
                <div className="project-meta">
                    <span className="title">{session.name}</span>
                    <div className="metrics">
                        <span>{session.bpm} BPM</span>
                        <span className="dot">•</span>
                        <span>{DEFAULT_BARS} BAR</span>
                    </div>
                </div>
            </div>
            
            <div className="right-group">
                <button 
                   onClick={handleSave} 
                   disabled={!hasUnsavedChanges}
                   className={`icon-btn ${hasUnsavedChanges ? 'unsaved' : ''}`}
                >
                   <Save size={20} />
                </button>
                <button 
                   onClick={togglePlay}
                   className={`play-btn ${isPlaying ? 'playing' : ''}`}
                >
                   {isPlaying ? <Square fill="currentColor" size={18} /> : <Play fill="currentColor" size={20} className="ml-0.5" />}
                </button>
            </div>
        </header>

        {/* 2. GLOBAL PROGRESS BAR (Timeline Viz) */}
        <div className="global-progress-track">
            <div 
                className="progress-fill" 
                style={{ width: `${progress}%`, transition: progress < 1 ? 'none' : 'width 0.1s linear' }} 
            />
        </div>

        {/* 3. TRACK LIST (Vertical Stack) */}
        <div className="track-list">
            {session.tracks.length === 0 && (
                <div className="empty-state">
                    <Mic size={48} />
                    <p>No loops yet.</p>
                    <p className="sub">Tap the red button to start jamming.</p>
                </div>
            )}

            {session.tracks.map(track => {
                // @ts-ignore
                const isEditing = editingTrackId === track.id;
                // @ts-ignore
                const offset = track.latencyOffsetMs || 0;

                return (
                    <div key={track.id} className={`track-card ${isEditing ? 'editing' : ''} ${track.isMuted ? 'muted' : ''}`}>
                        
                        {/* A. Card Main */}
                        <div className="card-main">
                            <div className="track-controls">
                                <button 
                                    className={`control-btn mute ${track.isMuted ? 'active' : ''}`}
                                    onClick={() => toggleMute(track.id)}
                                >
                                    {track.isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                                </button>
                            </div>

                            <div className="waveform-viz">
                                {/* Basit Fake Waveform - Gerçek veri yoksa */}
                                {Array.from({length: 20}).map((_, i) => (
                                    <div key={i} className="bar" style={{ height: `${30 + Math.random() * 70}%` }} />
                                ))}
                            </div>

                            <div className="track-actions">
                                <button className="icon-btn sm" onClick={() => setEditingTrackId(isEditing ? null : track.id)}>
                                    <Settings size={18} />
                                </button>
                            </div>
                        </div>

                        {/* B. Slip Edit Drawer */}
                        {isEditing && (
                            <div className="slip-drawer">
                                <div className="info-row">
                                    <span className="label">LATENCY FIX</span>
                                    <span className="value">{offset > 0 ? '+' : ''}{offset}ms</span>
                                </div>
                                
                                <div className="slip-visual">
                                    <div className="center-marker" />
                                    <div className="slip-content" style={{ transform: `translateX(${offset / 2}px)` }}>
                                        {/* Temsili kayan dalga */}
                                        <div className="wave-strip" />
                                    </div>
                                </div>

                                <div className="nudge-controls">
                                    <button onClick={() => nudgeTrack(track.id, -LATENCY_STEP_MS)}>&lt; Nudge</button>
                                    <button className="delete-btn" onClick={() => deleteTrack(track.id)}><Trash2 size={14} /> Delete</button>
                                    <button onClick={() => nudgeTrack(track.id, LATENCY_STEP_MS)}>Nudge &gt;</button>
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
            
            {/* Boşluk bırak ki FAB altında kalmasın */}
            <div style={{ height: '100px' }} />
        </div>

        {/* 4. OVERLAY: RECORDING STATE */}
        {recordingState !== 'idle' && (
            <div className="recording-overlay">
                {recordingState === 'counting' ? (
                    <div className="count-in">{countIn}</div>
                ) : (
                    <div className="recording-status">
                        <div className="rec-dot" />
                        <span>RECORDING...</span>
                        <div className="rec-progress-bar">
                            <div className="fill" style={{ width: `${progress}%` }} />
                        </div>
                    </div>
                )}
            </div>
        )}

        {/* 5. FAB (Action Button) */}
        <div className="fab-container">
            <button 
                className="record-fab"
                onClick={handleRecordSequence}
                disabled={recordingState !== 'idle'}
            >
                <div className="inner-circle" />
            </button>
        </div>
    </div>
  );
}