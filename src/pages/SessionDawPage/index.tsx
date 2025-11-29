import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as Tone from 'tone';
import { 
  Play, Pause, Square, Repeat, Volume2, Plus, Trash2, Save, Share2, ArrowLeft, 
  Mic, Upload, Circle, Disc 
} from 'lucide-react';
import './styles.scss'; 

import { sessionsApi } from '../../api/sessionsApi'; 
import type { Session, SessionTrack, UpdateSessionRequest } from '../../api/types/session';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../../components/Modal'; 

const PX_PER_SECOND = 50;

export default function SessionDawPage() {
  const { account } = useAuth();
  const { sessionToken } = useParams<{ sessionToken: string }>();
  const navigate = useNavigate();

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [editingTrackId, setEditingTrackId] = useState<number | null>(null);

  const timelineRef = useRef<HTMLDivElement>(null);
   
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [transportTime, setTransportTime] = useState(0);
  
  const [isLooping, setIsLooping] = useState(false);
  const [loopStart, setLoopStart] = useState(0);
  const [loopEnd, setLoopEnd] = useState(10); 

  // --- Recording State ---
  const [armedTrackId, setArmedTrackId] = useState<number | null>(null);
  const [recordingStartTime, setRecordingStartTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // --- Modal State ---
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addMode, setAddMode] = useState<'select' | 'upload'>('select');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const playersRef = useRef<Map<number, Tone.Player>>(new Map());
  const channelRef = useRef<Map<number, Tone.Channel>>(new Map());
  const animationFrameRef = useRef<number | null>(null);

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
    return () => {
      playersRef.current.forEach(p => p.dispose());
      channelRef.current.forEach(c => c.dispose());
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      Tone.Transport.stop();
    };
  }, [sessionToken, account]);

  useEffect(() => {
    Tone.Transport.loop = isLooping;
    Tone.Transport.loopStart = loopStart;
    Tone.Transport.loopEnd = loopEnd;
  }, [isLooping, loopStart, loopEnd]);

  const setupTrackAudio = (track: SessionTrack) => {
    // If track has no audio URL (empty track), just setup channel
    if(channelRef.current.has(track.id)) channelRef.current.get(track.id)?.dispose();

    const channel = new Tone.Channel({
      volume: track.volumeDb,
      pan: track.pan,
      mute: track.isMuted,
      solo: track.isSolo
    }).toDestination();
    channelRef.current.set(track.id, channel);

    if(playersRef.current.has(track.id)) playersRef.current.get(track.id)?.dispose();

    if (track.audioFileUrl) {
        const player = new Tone.Player({
            url: track.audioFileUrl,
            onload: () => {
                player.sync();
                const duration = track.durationInSeconds - track.startTrimInSeconds - track.endTrimInSeconds;
                player.start(track.startTimeInSeconds, track.startTrimInSeconds, duration);
            },
        }).connect(channel);
        playersRef.current.set(track.id, player);
    }
  };

  useEffect(() => {
    const syncLoop = () => {
      setTransportTime(Tone.Transport.seconds);
      animationFrameRef.current = requestAnimationFrame(syncLoop);
    };
    if (isPlaying) syncLoop();
    else if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
  }, [isPlaying]);

  const handleGoBack = () => {
    if (hasUnsavedChanges && !window.confirm("You have unsaved changes. Leave anyway?")) return;
    navigate(-1);
  };

  // --- Transport Logic ---

  const togglePlay = async () => {
    if (Tone.context.state !== 'running') await Tone.start();
    
    // If we are recording, hitting play acts as stop (standard DAW behavior usually)
    if (isRecording) {
        stop();
        return;
    }

    if (isPlaying) Tone.Transport.pause();
    else Tone.Transport.start();
    setIsPlaying(!isPlaying);
  };

  const handleRecordClick = async () => {
    if (isRecording) {
        stop(); // Clicking record while recording stops it
        return;
    }

    if (!armedTrackId) {
        alert("Please arm a track (R) first.");
        return;
    }

    // Start Recording Flow
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log(".",stream)
        mediaRecorderRef.current = new MediaRecorder(stream);
        audioChunksRef.current = [];

        mediaRecorderRef.current.ondataavailable = (e) => {
            if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };

        mediaRecorderRef.current.onstop = () => {
            handleRecordingStop(stream);
        };

        if (Tone.context.state !== 'running') await Tone.start();
        
        setRecordingStartTime(Tone.Transport.seconds); // Capture start time
        mediaRecorderRef.current.start();
        Tone.Transport.start();
        
        setIsRecording(true);
        setIsPlaying(true);
    } catch (err) {
        console.error("Mic Error", err);
        alert("Could not access microphone.");
    }
  };

  const handleRecordingStop = async (stream: MediaStream) => {
    const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    stream.getTracks().forEach(t => t.stop()); // Release mic

    if (!session || !armedTrackId) return;

    // Process new clip
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await Tone.context.decodeAudioData(arrayBuffer);
    const duration = audioBuffer.duration;
    const blobUrl = URL.createObjectURL(blob);

    // Update the armed track
    // Note: This replaces existing audio on that track. 
    setSession(prev => {
        if (!prev) return null;
        return {
            ...prev,
            tracks: prev.tracks.map(t => {
                if (t.id !== armedTrackId) return t;
                return {
                    ...t,
                    audioFileUrl: blobUrl,
                    durationInSeconds: duration,
                    startTimeInSeconds: recordingStartTime, // Placed where cursor was
                    startTrimInSeconds: 0,
                    endTrimInSeconds: 0,
                    name: `Rec_${new Date().toLocaleTimeString()}`, // Optional: Rename
                    file: new File([blob], "recording.webm", { type: 'audio/webm' }) // Prepare for save
                };
            })
        };
    });

    // Re-initialize audio for this track so we can hear it back immediately
    // Use timeout to let state update first or just force it using the vars
    // We can just call setupTrackAudio with the new data object logic manually if needed, 
    // but the effect/render cycle might need a nudge or we call setup explicitly.
    setTimeout(() => {
        const updatedTrack = session?.tracks.find(t => t.id === armedTrackId);
        // We construct a temp object because state update is async
        if (updatedTrack) {
             setupTrackAudio({
                 ...updatedTrack, 
                 audioFileUrl: blobUrl, 
                 startTimeInSeconds: recordingStartTime,
                 durationInSeconds: duration,
                 startTrimInSeconds: 0,
                 endTrimInSeconds: 0
             });
        }
    }, 100);

    setHasUnsavedChanges(true);
    setArmedTrackId(null); // Unarm after recording? Or keep armed? Usually keep armed. 
                           // For safety let's keep armed so they can do another take if they undo.
  };

  const stop = () => {
    if (isRecording && mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
    }
    Tone.Transport.stop();
    setIsPlaying(false);
    setTransportTime(0);
  };

  // --- Drag Logic (Unchanged) ---
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
    setDragState({ type, startX: e.clientX, initialVal: type === 'loop-start' ? loopStart : loopEnd });
  };

  const handleClipMouseDown = (e: React.MouseEvent, trackId: number, type: 'move-clip' | 'trim-left' | 'trim-right') => {
    e.stopPropagation();
    const track = session?.tracks.find(t => t.id === trackId);
    if (!track) return;
    setDragState({ 
        trackId, type, startX: e.clientX, 
        initialVal: type === 'move-clip' ? track.startTimeInSeconds : type === 'trim-right' ? track.endTrimInSeconds : track.startTrimInSeconds,
        initialStartTime: track.startTimeInSeconds, initialStartTrim: track.startTrimInSeconds 
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
            if (dragState.type === 'move-clip') return { ...t, startTimeInSeconds: Math.max(0, dragState.initialVal + deltaSeconds) };
            if (dragState.type === 'trim-left') {
                let newTrim = dragState.initialStartTrim! + deltaSeconds;
                newTrim = Math.max(0, Math.min(t.durationInSeconds - t.endTrimInSeconds - 0.1, newTrim));
                return { ...t, startTrimInSeconds: newTrim, startTimeInSeconds: dragState.initialStartTime! + (newTrim - dragState.initialStartTrim!) };
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
      console.error("Failed to save session", error);
      alert("Failed to save changes.");
    }
  };
  
  const handleNameChange = (id: number, val: string) => { setSession(prev => prev ? {...prev, tracks: prev.tracks.map(t => t.id === id ? {...t, name: val}: t)} : null); setHasUnsavedChanges(true);}
  const handleRemoveTrack = (id: number) => { 
      setSession(prev => prev ? {...prev, tracks: prev.tracks.filter(t => t.id !== id)} : null); 
      setHasUnsavedChanges(true);
      playersRef.current.get(id)?.dispose();
      playersRef.current.delete(id);
      channelRef.current.get(id)?.dispose();
      channelRef.current.delete(id);
  }
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
  
  const toggleArm = (id: number) => {
    // Logic: If clicking already armed, unarm. If clicking new, arm new (single track arming for simplicity)
    setArmedTrackId(prev => prev === id ? null : id);
  };

  // --- Add Track Flow ---

  const resetModal = () => {
    setAddMode('select');
    setIsAddModalOpen(false);
  };

  const handleCreateEmptyTrack = () => {
    if(!session) return;
    const newTrack: SessionTrack = {
        id: -Date.now(), // Temp ID
        sessionId: session.id,
        name: "Audio " + (session.tracks.length + 1),
        audioFileUrl: "", // Empty!
        durationInSeconds: 0,
        startTimeInSeconds: 0,
        startTrimInSeconds: 0,
        endTrimInSeconds: 0,
        volumeDb: 0,
        pan: 0,
        isMuted: false,
        isSolo: false,
        order: session.tracks.length + 1,
    } as any; 

    setSession(prev => prev ? { ...prev, tracks: [...prev.tracks, newTrack] } : null);
    setupTrackAudio(newTrack);
    setHasUnsavedChanges(true);
    resetModal();
  };

  const handleConfirmUpload = async (file: File) => {
    if (!session) return;
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await Tone.context.decodeAudioData(arrayBuffer);
    const duration = audioBuffer.duration;
    const tempUrl = URL.createObjectURL(file);
    const tempId = -Date.now(); 

    const newTrack: SessionTrack = {
        id: tempId,
        sessionId: session.id,
        name: file.name.replace(/\.[^/.]+$/, ""),
        audioFileUrl: tempUrl,
        durationInSeconds: duration,
        startTimeInSeconds: 0,
        startTrimInSeconds: 0,
        endTrimInSeconds: 0,
        volumeDb: 0,
        pan: 0,
        isMuted: false,
        isSolo: false,
        order: session.tracks.length + 1,
        file: file 
    } as any; 

    setSession(prev => prev ? { ...prev, tracks: [...prev.tracks, newTrack] } : null);
    setupTrackAudio(newTrack);
    setHasUnsavedChanges(true);
    resetModal();
  };


  if (loading || !session || !account) return <div className="daw-container">Loading...</div>;

  const bpm = session.bpm || 120;
  const secondsPerBeat = 60 / bpm;
  const secondsPerBar = secondsPerBeat * 4; 
  const pxPerBar = secondsPerBar * PX_PER_SECOND;
  const totalBars = Math.ceil((session.durationInSeconds + 30) / secondsPerBar);

  return (
    <div className="daw-container" onMouseMove={handleGlobalMouseMove} onMouseUp={handleGlobalMouseUp}>
      
      <header className="daw-header">
        <div className="left-group">
            <button className="back-btn" onClick={handleGoBack} title="Back">
                <ArrowLeft size={20} />
            </button>
            <div className="session-info">
            {session.name} <div className='bpm'> {session.bpm} BPM</div>  
            </div>
        </div>
        
        <div className="transport-controls">
          <button onClick={() => setIsLooping(!isLooping)} className={isLooping ? 'active' : ''} title="Loop"><Repeat size={16} /></button>
          <button onClick={stop} title="Stop"><Square size={16} fill="currentColor" /></button>
          
          <button onClick={handleRecordClick} className={`record-btn ${isRecording ? 'recording' : ''}`} title="Record">
             <Circle size={16} fill="currentColor" />
          </button>

          <button onClick={togglePlay} className="primary" title={isPlaying ? "Pause" : "Play"}>
            {isPlaying ? <Pause size={18} fill="currentColor"/> : <Play size={18} fill="currentColor"/>}
          </button>
          <div className='time'>{transportTime.toFixed(2)}s</div>
        </div>

        <div className="action-buttons">
            <button className="share-btn" onClick={() => alert("Share")}>
                <Share2 size={16} /> Share
            </button>
            <button 
                className={`save-btn ${hasUnsavedChanges ? 'unsaved' : ''}`} 
                onClick={handleSave}
                disabled={!hasUnsavedChanges}
            >
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
                        {/* Record Arm Button */}
                        <button 
                            className={`arm ${armedTrackId === track.id ? 'active' : ''}`} 
                            onClick={() => toggleArm(track.id)}
                            title="Arm for Recording"
                        >
                            R
                        </button>
                        
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
                <button className="btn-add-track" onClick={() => setIsAddModalOpen(true)}><Plus size={16} /> Add Track</button>
            </div>
        </div>

        <div className="timeline-area" ref={timelineRef}>
          <div className="timeline-ruler" onMouseDown={handleRulerMouseDown}>
             {Array.from({ length: totalBars }).map((_, i) => {
               const isMajor = i % 4 === 0;
               return (
                <div key={i} style={{ 
                    position: 'absolute', left: i * pxPerBar, 
                    borderLeft: isMajor ? '1px solid #666' : '1px solid #333', 
                    height: isMajor ? '100%' : '50%', bottom: 0, paddingLeft: '4px', 
                    pointerEvents: 'none', color: isMajor ? '#888' : 'transparent'
                }}>
                  {i + 1}
                </div>
             )})}
             <>
                <div className={`loop-region ${!isLooping ? 'inactive' : ''}`} style={{ left: loopStart * PX_PER_SECOND, width: (loopEnd - loopStart) * PX_PER_SECOND }} />
                <div className={`loop-handle start ${!isLooping ? 'inactive' : ''}`} style={{ left: loopStart * PX_PER_SECOND }} onMouseDown={(e) => handleLoopDragStart(e, 'loop-start')} title="Drag Loop Start" />
                <div className={`loop-handle end ${!isLooping ? 'inactive' : ''}`} style={{ left: loopEnd * PX_PER_SECOND }} onMouseDown={(e) => handleLoopDragStart(e, 'loop-end')} title="Drag Loop End" />
            </>
          </div>

          <div className="playhead" style={{ left: `${transportTime * PX_PER_SECOND}px` }} />

          {session.tracks.sort((a,b) => a.order - b.order).map(track => {
             const visibleDuration = track.durationInSeconds - track.startTrimInSeconds - track.endTrimInSeconds;
             const hasAudio = track.audioFileUrl && track.durationInSeconds > 0;
             return (
              <div key={track.id} className={`track-lane ${armedTrackId === track.id ? 'armed' : ''}`}>
                {hasAudio && (
                    <div className="audio-clip" style={{ left: `${track.startTimeInSeconds * PX_PER_SECOND}px`, width: `${visibleDuration * PX_PER_SECOND}px` }}
                    onMouseDown={(e) => handleClipMouseDown(e, track.id, 'move-clip')}
                    >
                        <div className="resize-handle left" onMouseDown={(e) => handleClipMouseDown(e, track.id, 'trim-left')} />
                        <div className="clip-content">
                            <div className="clip-name">{track.name}</div>
                        </div>
                        <div className="resize-handle right" onMouseDown={(e) => handleClipMouseDown(e, track.id, 'trim-right')} />
                    </div>
                )}
                {/* Visual indicator for empty/armed tracks if needed */}
                {!hasAudio && armedTrackId === track.id && isRecording && (
                    <div className="recording-indicator" style={{ left: `${recordingStartTime * PX_PER_SECOND}px`}}>
                         Recording...
                    </div>
                )}
              </div>
            );
          })}
          <div className="track-lane empty-lane"></div>
        </div>
      </div>

      <Modal 
        isOpen={isAddModalOpen} 
        onClose={resetModal} 
        title="Add Track"
      >
        <div className="add-track-modal-content">
            {addMode === 'select' && (
                <div className="modal-options">
                    <button className="modal-option-btn" onClick={() => setAddMode('upload')}>
                        <Upload size={32} />
                        <span>Upload Audio File</span>
                    </button>
                    <button className="modal-option-btn" onClick={handleCreateEmptyTrack}>
                        <Disc size={32} />
                        <span>Empty Audio Track</span>
                    </button>
                </div>
            )}

            {addMode === 'upload' && (
                 <div className="upload-section">
                    <p>Select an audio file (WAV, MP3, etc.)</p>
                    <input type="file" ref={fileInputRef} onChange={(e) => e.target.files?.[0] && handleConfirmUpload(e.target.files[0])} accept="audio/*" />
                    <div className="modal-footer">
                        <button onClick={() => setAddMode('select')}>Back</button>
                    </div>
                 </div>
            )}
        </div>
      </Modal>
    </div>
  );
}