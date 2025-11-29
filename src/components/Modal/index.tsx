import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as Tone from 'tone';
import { 
  Play, Pause, Square, Repeat, Volume2, Plus, Trash2, Save, Share2, ArrowLeft,
  Mic, Upload, Disc
} from 'lucide-react';
import './styles.scss'; 

import { sessionsApi } from '../../api/sessionsApi'; 
import type { Session, SessionTrack, UpdateSessionRequest } from '../../api/types/session';
import { useAuth } from '../../context/AuthContext';

// --- YOUR MODAL COMPONENT ---
import { createPortal } from "react-dom";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export const Modal = ({ isOpen, onClose, title, children }: ModalProps) => {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleEsc);
    }
    return () => {
      document.body.style.overflow = "unset";
      window.removeEventListener("keydown", handleEsc);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
};

const PX_PER_SECOND = 50;

export default function SessionDawPage() {
  const { account } = useAuth();
  const { sessionToken } = useParams<{ sessionToken: string }>();
  const navigate = useNavigate();

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [editingTrackId, setEditingTrackId] = useState<number | null>(null);

  // Playback State
  const [isPlaying, setIsPlaying] = useState(false);
  const [transportTime, setTransportTime] = useState(0);
  const [isLooping, setIsLooping] = useState(false);
  const [loopStart, setLoopStart] = useState(0);
  const [loopEnd, setLoopEnd] = useState(10); 

  // Recording State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalView, setModalView] = useState<'select' | 'record'>('select');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [inputDelay, setInputDelay] = useState(0); // Latency in ms
  const [recordingStartTime, setRecordingStartTime] = useState(0);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const playersRef = useRef<Map<number, Tone.Player>>(new Map());
  const channelRef = useRef<Map<number, Tone.Channel>>(new Map());
  const animationFrameRef = useRef<number | null>(null);
  
  // Audio Input Refs
  const micRef = useRef<Tone.UserMedia | null>(null);
  const recorderRef = useRef<Tone.Recorder | null>(null);

  // --- INITIALIZATION ---
  useEffect(() => {
    const loadSession = async () => {
      if (!sessionToken || !account) return;
      try {
        const response = await sessionsApi.getSession(sessionToken);
        const data = response.data;
        setSession(data); 
        
        setIsLooping(data.isLoopActive);
        setLoopStart(data.loopStartInSeconds || 0);
        setLoopEnd(data.lookEndInSeconds || 10);
        
        Tone.Transport.bpm.value = data.bpm;
        Tone.Transport.loop = data.isLoopActive;
        Tone.Transport.loopStart = data.loopStartInSeconds || 0;
        Tone.Transport.loopEnd = data.lookEndInSeconds || 10;

        await Tone.loaded();
        data.tracks.forEach(track => setupTrackAudio(track));
      } catch (err) {
        console.error("Failed to load session", err);
      } finally {
        setLoading(false);
      }
    };
    loadSession();

    // Init Mic and Recorder
    micRef.current = new Tone.UserMedia();
    recorderRef.current = new Tone.Recorder();
    micRef.current.connect(recorderRef.current);

    return () => {
      playersRef.current.forEach(p => p.dispose());
      channelRef.current.forEach(c => c.dispose());
      micRef.current?.dispose();
      recorderRef.current?.dispose();
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      Tone.Transport.stop();
    };
  }, [sessionToken, account]);

  useEffect(() => {
    Tone.Transport.loop = isLooping;
    Tone.Transport.loopStart = loopStart;
    Tone.Transport.loopEnd = loopEnd;
  }, [isLooping, loopStart, loopEnd]);

  // --- AUDIO ENGINE ---
  const setupTrackAudio = (track: SessionTrack) => {
    if(playersRef.current.has(track.id)) playersRef.current.get(track.id)?.dispose();
    if(channelRef.current.has(track.id)) channelRef.current.get(track.id)?.dispose();

    const channel = new Tone.Channel({
      volume: track.volumeDb,
      pan: track.pan,
      mute: track.isMuted,
      solo: track.isSolo
    }).toDestination();
    
    const player = new Tone.Player({
      url: track.audioFileUrl,
      onload: () => {
        player.sync();
        const duration = track.durationInSeconds - track.startTrimInSeconds - track.endTrimInSeconds;
        player.start(track.startTimeInSeconds, track.startTrimInSeconds, duration);
      },
    }).connect(channel);

    playersRef.current.set(track.id, player);
    channelRef.current.set(track.id, channel);
  };

  useEffect(() => {
    const syncLoop = () => {
      setTransportTime(Tone.Transport.seconds);
      animationFrameRef.current = requestAnimationFrame(syncLoop);
    };
    if (isPlaying) syncLoop();
    else if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
  }, [isPlaying]);

  // --- TRANSPORT ---
  const togglePlay = async () => {
    if (Tone.context.state !== 'running') await Tone.start();
    if (isPlaying) Tone.Transport.pause();
    else Tone.Transport.start();
    setIsPlaying(!isPlaying);
  };

  const stop = () => {
    Tone.Transport.stop();
    setIsPlaying(false);
    setTransportTime(0);
  };

  // --- MOUSE / DRAG HANDLERS ---
  const [dragState, setDragState] = useState<{
    type: 'move-clip' | 'trim-left' | 'trim-right' | 'loop-start' | 'loop-end',
    trackId?: number, 
    startX: number, 
    initialVal: number,
    initialStartTrim?: number, 
    initialStartTime?: number
  } | null>(null);

  const handleRulerMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).classList.contains('loop-handle')) return;
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return;
    const scrollLeft = timelineRef.current?.scrollLeft || 0;
    const clickX = e.clientX - rect.left + scrollLeft; 
    const newTime = Math.max(0, clickX / PX_PER_SECOND);
    Tone.Transport.seconds = newTime;
    setTransportTime(newTime);
  };

  const handleLoopDragStart = (e: React.MouseEvent, type: 'loop-start' | 'loop-end') => {
    e.stopPropagation();
    setDragState({
        type,
        startX: e.clientX,
        initialVal: type === 'loop-start' ? loopStart : loopEnd
    });
  };

  const handleClipMouseDown = (e: React.MouseEvent, trackId: number, type: 'move-clip' | 'trim-left' | 'trim-right') => {
    e.stopPropagation();
    const track = session?.tracks.find(t => t.id === trackId);
    if (!track) return;

    setDragState({ 
        trackId, 
        type, 
        startX: e.clientX, 
        initialVal: type === 'move-clip' ? track.startTimeInSeconds : 
                   type === 'trim-right' ? track.endTrimInSeconds : track.startTrimInSeconds,
        initialStartTime: track.startTimeInSeconds,
        initialStartTrim: track.startTrimInSeconds 
    });
  };

  const handleGlobalMouseMove = (e: React.MouseEvent) => {
    if (!dragState) return;
    const deltaPixels = e.clientX - dragState.startX;
    const deltaSeconds = deltaPixels / PX_PER_SECOND;

    if (dragState.type === 'loop-start') {
        setLoopStart(Math.max(0, Math.min(loopEnd - 0.5, dragState.initialVal + deltaSeconds)));
        return;
    }
    if (dragState.type === 'loop-end') {
        setLoopEnd(Math.max(loopStart + 0.5, dragState.initialVal + deltaSeconds));
        return;
    }

    if (!session || dragState.trackId === undefined) return;

    setSession({
        ...session,
        tracks: session.tracks.map(t => {
            if (t.id !== dragState.trackId) return t;
            if (dragState.type === 'move-clip') {
                return { ...t, startTimeInSeconds: Math.max(0, dragState.initialVal + deltaSeconds) };
            }
            if (dragState.type === 'trim-left') {
                let newTrim = dragState.initialStartTrim! + deltaSeconds;
                newTrim = Math.max(0, Math.min(t.durationInSeconds - t.endTrimInSeconds - 0.1, newTrim));
                const appliedDelta = newTrim - dragState.initialStartTrim!;
                return { 
                    ...t, 
                    startTrimInSeconds: newTrim, 
                    startTimeInSeconds: dragState.initialStartTime! + appliedDelta 
                };
            }
             if (dragState.type === 'trim-right') {
                const newEndTrim = Math.max(0, Math.min(t.durationInSeconds - t.startTrimInSeconds - 0.1, dragState.initialVal - deltaSeconds));
                return { ...t, endTrimInSeconds: newEndTrim };
             }
            return t;
        })
    });
    setHasUnsavedChanges(true);
  };

  const handleGlobalMouseUp = () => {
    if (dragState && dragState.trackId && session) {
        const track = session.tracks.find(t => t.id === dragState.trackId);
        if (track) setupTrackAudio(track);
    }
    setDragState(null);
  };

  // --- SAVE & TRACK OPERATIONS ---
  const handleSave = async () => {
    if (!session) return;
    try {
      const payload : UpdateSessionRequest = {
        ...session,
        isLoopActive: isLooping,
        loopStartInSeconds: loopStart,
        loopEndInSeconds: loopEnd
      };
      await sessionsApi.updateSession(payload);
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error("Failed to save", error);
    }
  }
  
  const handleNameChange = (id: number, val: string) => { setSession(prev => prev ? {...prev, tracks: prev.tracks.map(t => t.id === id ? {...t, name: val}: t)} : null); setHasUnsavedChanges(true);}
  const handleRemoveTrack = (id: number) => { setSession(prev => prev ? {...prev, tracks: prev.tracks.filter(t => t.id !== id)} : null); setHasUnsavedChanges(true);}
  const handleVolumeChange = (id: number, val: number) => { 
      setSession(prev => prev ? {...prev, tracks: prev.tracks.map(t => t.id === id ? {...t, volumeDb: val}: t)} : null); 
      setHasUnsavedChanges(true);
      channelRef.current.get(id)?.set({volume: val});
  }
  const toggleMute = (id: number) => { 
      setSession(prev => prev ? {...prev, tracks: prev.tracks.map(t => t.id === id ? {...t, isMuted: !t.isMuted}: t)} : null); 
      const t = session?.tracks.find(x => x.id === id);
      if(t) channelRef.current.get(id)?.set({mute: !t.isMuted});
  }
  const toggleSolo = (id: number) => { 
      setSession(prev => prev ? {...prev, tracks: prev.tracks.map(t => t.id === id ? {...t, isSolo: !t.isSolo}: t)} : null);
      const t = session?.tracks.find(x => x.id === id);
      if(t) channelRef.current.get(id)?.set({solo: !t.isSolo});
  }

  // --- UPLOAD & RECORDING HANDLERS ---

  // Called by the file input
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await uploadTrackFile(file, "Upload", 0);
    closeModal();
  };

  // Common function to send file to backend
  const uploadTrackFile = async (file: File, namePrefix: string, startOffset: number) => {
     if (!session) return;
     try {
      const formData = new FormData();
      // Decode locally just to get duration quickly
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await Tone.context.decodeAudioData(arrayBuffer);
      const duration = audioBuffer.duration;

      formData.append('sessionId', session.id.toString());
      formData.append('audioFile', file);
      formData.append('name', `${namePrefix} ${session.tracks.length + 1}`);
      formData.append('durationInSeconds', duration.toString()); 
      // Apply offset (recording start time)
      formData.append('startTimeInSeconds', startOffset.toFixed(4));
      formData.append('order', (session.tracks.length + 1).toString());

      const response = await sessionsApi.createSessionTrack(formData as any);
      
      if (response.data) {
        const newTrack = response.data;
        setSession(prev => prev ? { ...prev, tracks: [...prev.tracks, newTrack] } : null);
        setupTrackAudio(newTrack);
        setHasUnsavedChanges(true); 
      }
    } catch (error) {
      console.error("Failed to upload/save track", error);
      alert("Error saving track.");
    }
  };

  const startRecording = async () => {
    if (!micRef.current || !recorderRef.current) return;
    try {
        await Tone.start();
        await micRef.current.open();
        
        // Start playing backing tracks
        Tone.Transport.start();
        setIsPlaying(true);
        
        recorderRef.current.start();
        setRecordingStartTime(Tone.Transport.seconds);
        setIsRecording(true);
        setRecordingBlob(null);
    } catch (e) {
        console.error("Mic access denied or error", e);
        alert("Could not access microphone.");
    }
  };

  const stopRecording = async () => {
    if (!recorderRef.current) return;
    
    // Stop recording first
    const blob = await recorderRef.current.stop();
    
    // Stop playback
    Tone.Transport.stop();
    setIsPlaying(false);
    setIsRecording(false);
    
    micRef.current?.close();
    setRecordingBlob(blob);
  };

  const saveRecording = async () => {
      if (!recordingBlob) return;
      const file = new File([recordingBlob], "recording.webm", { type: "audio/webm" });
      
      // Calculate start time: The transport time when we started, minus user-defined latency
      let calculatedStart = recordingStartTime - (inputDelay / 1000);
      if (calculatedStart < 0) calculatedStart = 0;

      await uploadTrackFile(file, "Rec", calculatedStart);
      closeModal();
  };

  const openAddTrackModal = () => {
      setModalView('select');
      setRecordingBlob(null);
      setIsModalOpen(true);
  };

  const closeModal = () => {
      if (isRecording) stopRecording();
      setIsModalOpen(false);
  };

  if (loading || !session || !account) return <div className="daw-container">Loading...</div>;

  const bpm = session.bpm || 120;
  const secondsPerBar = (60 / bpm) * 4;
  const pxPerBar = secondsPerBar * PX_PER_SECOND;
  const totalBars = Math.ceil((session.durationInSeconds + 30) / secondsPerBar);

  return (
    <div className="daw-container" onMouseMove={handleGlobalMouseMove} onMouseUp={handleGlobalMouseUp}>
      
      <header className="daw-header">
        <div className="left-group">
            <button className="back-btn" onClick={() => hasUnsavedChanges && !window.confirm("Unsaved changes. Leave?") ? null : navigate(-1)}>
                <ArrowLeft size={20} />
            </button>
            <div className="session-info">
            {session.name} <div className='bpm'> {session.bpm} BPM</div>  
            </div>
        </div>
        
        <div className="transport-controls">
          <button onClick={() => setIsLooping(!isLooping)} className={isLooping ? 'active' : ''}><Repeat size={16} /></button>
          <button onClick={stop}><Square size={16} fill="currentColor" /></button>
          <button onClick={togglePlay} className="primary">
            {isPlaying ? <Pause size={18} fill="currentColor"/> : <Play size={18} fill="currentColor"/>}
          </button>
          <div className='time'>{transportTime.toFixed(2)}s</div>
        </div>

        <div className="action-buttons">
            <button className="share-btn"><Share2 size={16} /> Share</button>
            <button className={`save-btn ${hasUnsavedChanges ? 'unsaved' : ''}`} onClick={handleSave} disabled={!hasUnsavedChanges}>
                <Save size={16} /> Save
            </button>
        </div>
      </header>

      <div className="daw-workspace">
        <div className="track-headers">
            <div className='timeline-ruler-placeholder'></div>
            {session.tracks.sort((a,b) => a.order - b.order).map(track => (
                <div key={track.id} className="track-control-panel">
                    <div className="track-name-row">
                        {editingTrackId === track.id ? (
                            <input autoFocus value={track.name} onChange={(e) => handleNameChange(track.id, e.target.value)} onBlur={() => setEditingTrackId(null)} />
                        ) : (
                            <span onClick={() => setEditingTrackId(track.id)} className="name-label">{track.name}</span>
                        )}
                    </div>
                    <div className="track-actions">
                        <button className={`mute ${track.isMuted ? 'active' : ''}`} onClick={() => toggleMute(track.id)}>M</button>
                        <button className={`solo ${track.isSolo ? 'active' : ''}`} onClick={() => toggleSolo(track.id)}>S</button>
                        <button className="delete" onClick={() => handleRemoveTrack(track.id)}><Trash2 size={12}/></button>
                    </div>
                    <div className="track-sliders">
                        <Volume2 size={12} />
                        <input type="range" min="-60" max="6" step="1" value={track.volumeDb} onChange={(e) => handleVolumeChange(track.id, Number(e.target.value))} />
                    </div>
                </div>
            ))}
             <div className="add-track-container">
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} style={{display: 'none'}} accept="audio/*" />
                <button className="btn-add-track" onClick={openAddTrackModal}><Plus size={16} /> Add Track</button>
            </div>
        </div>

        <div className="timeline-area" ref={timelineRef}>
          <div className="timeline-ruler" onMouseDown={handleRulerMouseDown}>
             {Array.from({ length: totalBars }).map((_, i) => (
                <div key={i} className="ruler-mark" style={{ left: i * pxPerBar, borderLeft: i%4===0 ? '1px solid #666' : '1px solid #333' }}>
                 {i%4===0 && i + 1}
               </div>
             ))}
             {/* Loop markers omitted for brevity, same as previous */}
          </div>
          <div className="playhead" style={{ left: `${transportTime * PX_PER_SECOND}px` }} />
          {session.tracks.sort((a,b) => a.order - b.order).map(track => {
             const visibleDuration = track.durationInSeconds - track.startTrimInSeconds - track.endTrimInSeconds;
             return (
              <div key={track.id} className="track-lane">
                <div className="audio-clip" style={{ left: `${track.startTimeInSeconds * PX_PER_SECOND}px`, width: `${visibleDuration * PX_PER_SECOND}px` }} onMouseDown={(e) => handleClipMouseDown(e, track.id, 'move-clip')}>
                    <div className="resize-handle left" onMouseDown={(e) => handleClipMouseDown(e, track.id, 'trim-left')} />
                    <div className="clip-content">{track.name}</div>
                    <div className="resize-handle right" onMouseDown={(e) => handleClipMouseDown(e, track.id, 'trim-right')} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* --- ADD TRACK MODAL --- */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={closeModal} 
        title={modalView === 'select' ? "Add New Track" : "Record Audio"}
      >
        {modalView === 'select' ? (
             <div className="modal-options">
                <button className="modal-option-btn" onClick={() => fileInputRef.current?.click()}>
                    <Upload size={32} />
                    <span>Upload Audio File</span>
                </button>
                <div className="or-divider">OR</div>
                <button className="modal-option-btn" onClick={() => setModalView('record')}>
                    <Mic size={32} />
                    <span>Record Audio</span>
                </button>
             </div>
        ) : (
            <div className="recorder-ui">
                <div className="recorder-controls">
                    {!isRecording && !recordingBlob && (
                         <button className="record-btn start" onClick={startRecording}>
                            <Disc size={16} /> Start Recording
                         </button>
                    )}
                    {isRecording && (
                        <button className="record-btn stop" onClick={stopRecording}>
                            <Square size={16} /> Stop
                        </button>
                    )}
                    {recordingBlob && (
                         <div className="preview-actions">
                             <div className="blob-info">Recorded {recordingBlob.size} bytes</div>
                             <button className="record-btn reset" onClick={() => setRecordingBlob(null)}>Redo</button>
                         </div>
                    )}
                </div>

                <div className="latency-setting">
                    <label>Latency Compensation (ms):</label>
                    <input 
                        type="number" 
                        value={inputDelay} 
                        onChange={(e) => setInputDelay(Number(e.target.value))} 
                        placeholder="e.g. 150"
                    />
                    <small>Increase if recording sounds late.</small>
                </div>

                <div className="modal-actions-footer">
                     <button onClick={() => setModalView('select')}>Back</button>
                     <button 
                        className="save-primary" 
                        disabled={!recordingBlob} 
                        onClick={saveRecording}
                    >
                        Save Recording
                    </button>
                </div>
            </div>
        )}
      </Modal>

    </div>
  );
}