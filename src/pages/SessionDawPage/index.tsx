import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom'; // Added useNavigate
import * as Tone from 'tone';
import { 
  Play, Pause, Square, Repeat, Volume2, Plus, Trash2, Save, Share2, 
  ArrowLeft // Added ArrowLeft
} from 'lucide-react';
import './styles.scss'; 

import { sessionsApi } from '../../api/sessionsApi'; 
import type { Session, SessionTrack } from '../../api/types/session';
import { useAuth } from '../../context/AuthContext';

const PX_PER_SECOND = 50;

export default function SessionDawPage() {
  const { account } = useAuth();
  const { sessionToken } = useParams<{ sessionToken: string }>();
  const navigate = useNavigate(); // Hook for navigation

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [editingTrackId, setEditingTrackId] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null); // Ref for timeline scrolling calculations
   
  // Audio State
  const [isPlaying, setIsPlaying] = useState(false);
  const [transportTime, setTransportTime] = useState(0);
  
  // Loop State
  const [isLooping, setIsLooping] = useState(false);
  const [loopStart, setLoopStart] = useState(0);
  const [loopEnd, setLoopEnd] = useState(10); // Default 10s loop

  const playersRef = useRef<Map<number, Tone.Player>>(new Map());
  const channelRef = useRef<Map<number, Tone.Channel>>(new Map());
  const animationFrameRef = useRef<number | null>(null);

  // --- 1. Initialization ---
  useEffect(() => {
    const loadSession = async () => {
      if (!sessionToken || !account) return;
      try {
        const response = await sessionsApi.getSession(sessionToken);
        const data = response.data;
        setSession(data); 
        
        // Init Loop from session
        setIsLooping(data.isLoopActive);
        setLoopStart(data.loopStartInSeconds || 0);
        setLoopEnd(data.lookEndInSeconds || 10);
        
        Tone.Transport.bpm.value = data.bpm;
        Tone.Transport.loop = data.isLoopActive;
        Tone.Transport.loopStart = data.loopStartInSeconds || 0;
        Tone.Transport.loopEnd = data.lookEndInSeconds || 10;

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
    };
  }, [sessionToken, account]);

  // --- 2. Tone.js Loop Sync ---
  // Whenever React loop state changes, tell Tone.js
  useEffect(() => {
    Tone.Transport.loop = isLooping;
    Tone.Transport.loopStart = loopStart;
    Tone.Transport.loopEnd = loopEnd;
  }, [isLooping, loopStart, loopEnd]);


  // --- 3. Audio Engine ---
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
      onload: () => console.log(`${track.name} loaded`),
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

  // --- 4. Transport & Navigation ---
  const handleGoBack = () => {
    if (hasUnsavedChanges) {
        if (!window.confirm("You have unsaved changes. Leave anyway?")) return;
    }
    navigate(-1);
  };

  const togglePlay = async () => {
    if (Tone.context.state !== 'running') await Tone.start();

    if (isPlaying) {
      Tone.Transport.pause();
      playersRef.current.forEach(p => p.stop());
    } else {
      // Sync players to current Transport time
      playersRef.current.forEach((player, trackId) => {
        const track = session?.tracks.find(t => t.id === trackId);
        if (track && player.loaded) {
            const clipStart = track.startTimeInSeconds;
            const clipDuration = track.durationInSeconds - track.startTrimInSeconds - track.endTrimInSeconds;
            const current = Tone.Transport.seconds;
            
            // Logic: Is the playhead currently intersecting this clip?
            if (current >= clipStart && current < clipStart + clipDuration) {
                 const offset = (current - clipStart) + track.startTrimInSeconds;
                 player.start(Tone.now(), offset, clipDuration - (offset - track.startTrimInSeconds));
            } 
            // Logic: Is the clip in the future?
            else if (current < clipStart) {
                const startWhen = clipStart - current;
                player.start(`+${startWhen}`, track.startTrimInSeconds, clipDuration);
            }
        }
      });
      Tone.Transport.start();
    }
    setIsPlaying(!isPlaying);
  };

  const stop = () => {
    Tone.Transport.stop();
    playersRef.current.forEach(p => p.stop());
    setIsPlaying(false);
    setTransportTime(0);
  };

  // --- 5. Timeline Interactions (Seek & Drag) ---
  
  // Drag State Definition
  const [dragState, setDragState] = useState<{
    type: 'move-clip' | 'trim-left' | 'trim-right' | 'loop-start' | 'loop-end',
    trackId?: number, 
    startX: number, 
    initialVal: number, // Generic initial value (could be time or trim)
    initialStartTrim?: number, // Specifically for left trim calculations
    initialStartTime?: number  // Specifically for left trim calculations
  } | null>(null);

  // 5a. Seeking (Click on Ruler)
  const handleRulerMouseDown = (e: React.MouseEvent) => {
    // Only seek if clicking the background, not the loop handles
    if ((e.target as HTMLElement).classList.contains('loop-handle')) return;
    
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Calculate time based on click position relative to scroll container + scroll offset
    const scrollLeft = timelineRef.current?.scrollLeft || 0;
    const clickX = e.clientX - rect.left + scrollLeft; 
    const newTime = Math.max(0, clickX / PX_PER_SECOND);

    Tone.Transport.seconds = newTime;
    setTransportTime(newTime);
    
    // If playing, we need to restart players at new time (simplified logic: stop/start)
    if(isPlaying) {
        playersRef.current.forEach(p => p.stop());
        togglePlay(); // Toggle off
        setTimeout(togglePlay, 10); // Toggle on (hacky but works for react state sync)
    }
  };

  // 5b. Loop Dragging
  const handleLoopDragStart = (e: React.MouseEvent, type: 'loop-start' | 'loop-end') => {
    e.stopPropagation();
    setDragState({
        type,
        startX: e.clientX,
        initialVal: type === 'loop-start' ? loopStart : loopEnd
    });
  };

  // 5c. Clip Dragging & Trimming
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
        // Crucial for Trim Left: Capture both start time and trim amount
        initialStartTime: track.startTimeInSeconds,
        initialStartTrim: track.startTrimInSeconds 
    });
  };

  const handleGlobalMouseMove = (e: React.MouseEvent) => {
    if (!dragState) return;

    const deltaPixels = e.clientX - dragState.startX;
    const deltaSeconds = deltaPixels / PX_PER_SECOND;

    // 1. Handle Loop Dragging
    if (dragState.type === 'loop-start') {
        const newStart = Math.max(0, Math.min(loopEnd - 0.5, dragState.initialVal + deltaSeconds));
        setLoopStart(newStart);
        return;
    }
    if (dragState.type === 'loop-end') {
        const newEnd = Math.max(loopStart + 0.5, dragState.initialVal + deltaSeconds);
        setLoopEnd(newEnd);
        return;
    }

    // 2. Handle Clip Modifications
    if (!session || dragState.trackId === undefined) return;

    setSession({
        ...session,
        tracks: session.tracks.map(t => {
            if (t.id !== dragState.trackId) return t;
            
            if (dragState.type === 'move-clip') {
                return { ...t, startTimeInSeconds: Math.max(0, dragState.initialVal + deltaSeconds) };
            }
            
            if (dragState.type === 'trim-left') {
                // Determine new trim amount, bounded by 0 and duration
                let newTrim = dragState.initialStartTrim! + deltaSeconds;
                newTrim = Math.max(0, Math.min(t.durationInSeconds - t.endTrimInSeconds - 0.1, newTrim));
                
                // Calculate the ACTUAL change applied (after clamping min/max)
                const appliedDelta = newTrim - dragState.initialStartTrim!;
                
                // Shift start time by the EXACT same amount we trimmed
                return { 
                    ...t, 
                    startTrimInSeconds: newTrim, 
                    startTimeInSeconds: dragState.initialStartTime! + appliedDelta 
                };
            }
            
             if (dragState.type === 'trim-right') {
                // Inverted delta because moving mouse left increases trim from end
                const newEndTrim = Math.max(0, Math.min(t.durationInSeconds - t.startTrimInSeconds - 0.1, dragState.initialVal - deltaSeconds));
                return { ...t, endTrimInSeconds: newEndTrim };
             }
            return t;
        })
    });
    setHasUnsavedChanges(true);
  };

  const handleGlobalMouseUp = () => {
    setDragState(null);
  };

  // ... (Other handlers like save/share/add track remain the same) ...
  const handleSave = () => {
    console.log("Saving...", {session, loopStart, loopEnd});
    setHasUnsavedChanges(false);
  }
  
  // Standard handlers to keep TS happy with partial update
  const handleNameChange = (id: number, val: string) => { setSession(prev => prev ? {...prev, tracks: prev.tracks.map(t => t.id === id ? {...t, name: val}: t)} : null); setHasUnsavedChanges(true);}
  const handleRemoveTrack = (id: number) => { setSession(prev => prev ? {...prev, tracks: prev.tracks.filter(t => t.id !== id)} : null); setHasUnsavedChanges(true);}
  const handleVolumeChange = (id: number, val: number) => { setSession(prev => prev ? {...prev, tracks: prev.tracks.map(t => t.id === id ? {...t, volumeDb: val}: t)} : null); setHasUnsavedChanges(true);}
  const toggleMute = (id: number) => { setSession(prev => prev ? {...prev, tracks: prev.tracks.map(t => t.id === id ? {...t, isMuted: !t.isMuted}: t)} : null); }
  const toggleSolo = (id: number) => { setSession(prev => prev ? {...prev, tracks: prev.tracks.map(t => t.id === id ? {...t, isSolo: !t.isSolo}: t)} : null); }
  const markChanged = () => setHasUnsavedChanges(true);
  const handleAddTrack = async (e: React.ChangeEvent<HTMLInputElement>) => {

    const file = e.target.files?.[0];
    
    if (!file || !session) return;
    
    
    const newTrack: SessionTrack = {
    
    id: Date.now(),
    
    name: file.name.replace(/\.[^/.]+$/, ""),
    
    sessionId: session.id,
    
    sessionName: session.name,
    
    order: session.tracks.length + 1,
    
    audioFileUrl: URL.createObjectURL(file),
    
    waveformFileUrl: '',
    
    durationInSeconds: 15, // Mock
    
    startTimeInSeconds: 0,
    
    startTrimInSeconds: 0,
    
    endTrimInSeconds: 0,
    
    volumeDb: 0,
    
    isMuted: false,
    
    isSolo: false,
    
    isMono: false,
    
    pan: 0,
    
    createdAtUtc: new Date().toISOString(),
    
    authorUsername: account?.username ?? 'currentUser' // Added field
    
    };
    
    
    
    setSession(prev => prev ? { ...prev, tracks: [...prev.tracks, newTrack] } : null);
    
    setupTrackAudio(newTrack);
    
    markChanged();
    
    if (fileInputRef.current) fileInputRef.current.value = '';
    
    };


  if (loading || !session || !account) return <div className="daw-container">Loading...</div>;

  return (
    <div className="daw-container" onMouseMove={handleGlobalMouseMove} onMouseUp={handleGlobalMouseUp}>
      
      {/* Header */}
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

      {/* Main Area */}
      <div className="daw-workspace">
        
        {/* Track Headers (Left) */}
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
                <input type="file" ref={fileInputRef} onChange={handleAddTrack} style={{display: 'none'}} accept="audio/*" />
                <button className="btn-add-track" onClick={() => fileInputRef.current?.click()}><Plus size={16} /> Add Track</button>
            </div>
        </div>

        {/* Timeline (Right) */}
        <div className="timeline-area" ref={timelineRef}>
          
          {/* Ruler (Clickable for Seek) */}
          <div className="timeline-ruler" onMouseDown={handleRulerMouseDown}>
             {Array.from({ length: Math.ceil((session.durationInSeconds + 30) / 5) }).map((_, i) => (
               <div key={i} style={{ position: 'absolute', left: i * 5 * PX_PER_SECOND, borderLeft: '1px solid #444', height: '100%', paddingLeft: '4px', pointerEvents: 'none' }}>
                 {i * 5}s
               </div>
             ))}

             {/* Loop Markers (Only visible if loop is active or dragging) */}
             {isLooping && (
                <>
                    {/* Loop Region Overlay */}
                    <div className="loop-region" style={{
                        left: loopStart * PX_PER_SECOND,
                        width: (loopEnd - loopStart) * PX_PER_SECOND
                    }} />
                    
                    {/* Start Handle */}
                    <div 
                        className="loop-handle start" 
                        style={{ left: loopStart * PX_PER_SECOND }}
                        onMouseDown={(e) => handleLoopDragStart(e, 'loop-start')}
                        title="Drag Loop Start"
                    />
                    
                    {/* End Handle */}
                    <div 
                        className="loop-handle end" 
                        style={{ left: loopEnd * PX_PER_SECOND }}
                        onMouseDown={(e) => handleLoopDragStart(e, 'loop-end')}
                        title="Drag Loop End"
                    />
                </>
             )}
          </div>

          {/* Playhead */}
          <div className="playhead" style={{ left: `${transportTime * PX_PER_SECOND}px` }} />

          {/* Tracks */}
          {session.tracks.sort((a,b) => a.order - b.order).map(track => {
             const visibleDuration = track.durationInSeconds - track.startTrimInSeconds - track.endTrimInSeconds;
             return (
              <div key={track.id} className="track-lane">
                <div 
                  className="audio-clip"
                  style={{ 
                      left: `${track.startTimeInSeconds * PX_PER_SECOND}px`, 
                      width: `${visibleDuration * PX_PER_SECOND}px` 
                  }}
                  onMouseDown={(e) => handleClipMouseDown(e, track.id, 'move-clip')}
                >
                    <div className="resize-handle left" onMouseDown={(e) => handleClipMouseDown(e, track.id, 'trim-left')} />
                    
                    <div className="clip-content">
                        <div className="clip-name">{track.name}</div>
                    </div>

                    <div className="resize-handle right" onMouseDown={(e) => handleClipMouseDown(e, track.id, 'trim-right')} />
                </div>
              </div>
            );
          })}
          
          <div className="track-lane empty-lane"></div>
        </div>
      </div>
    </div>
  );
}