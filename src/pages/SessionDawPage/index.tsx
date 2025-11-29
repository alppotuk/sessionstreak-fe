import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as Tone from 'tone';
import { 
  Play, Pause, Square, Repeat, Volume2, Plus, Trash2, Save, Share2, ArrowLeft 
} from 'lucide-react';
import './styles.scss'; 

import { sessionsApi } from '../../api/sessionsApi'; 
import type { Session, SessionTrack, UpdateSessionRequest } from '../../api/types/session';
import { useAuth } from '../../context/AuthContext';

const PX_PER_SECOND = 50;

export default function SessionDawPage() {
  const { account } = useAuth();
  const { sessionToken } = useParams<{ sessionToken: string }>();
  const navigate = useNavigate();

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [editingTrackId, setEditingTrackId] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
   
  const [isPlaying, setIsPlaying] = useState(false);
  const [transportTime, setTransportTime] = useState(0);
  
  const [isLooping, setIsLooping] = useState(false);
  const [loopStart, setLoopStart] = useState(0);
  const [loopEnd, setLoopEnd] = useState(10); 

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

        // Initialize audio
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

  // Updated Audio Engine using .sync() for loop support
  const setupTrackAudio = (track: SessionTrack) => {
    // Dispose old instances
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
        // Essential for looping: Sync player to transport timeline
        player.sync();
        const duration = track.durationInSeconds - track.startTrimInSeconds - track.endTrimInSeconds;
        // start(startTimeInTransport, offsetInFile, durationOfClip)
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

  const handleGoBack = () => {
    if (hasUnsavedChanges && !window.confirm("You have unsaved changes. Leave anyway?")) return;
    navigate(-1);
  };

  // Simplified Play logic relying on Tone.Transport
  const togglePlay = async () => {
    if (Tone.context.state !== 'running') await Tone.start();

    if (isPlaying) {
      Tone.Transport.pause();
    } else {
      Tone.Transport.start();
    }
    setIsPlaying(!isPlaying);
  };

  const stop = () => {
    Tone.Transport.stop();
    setIsPlaying(false);
    setTransportTime(0);
  };

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
        const newStart = Math.max(0, Math.min(loopEnd - 0.5, dragState.initialVal + deltaSeconds));
        setLoopStart(newStart);
        return;
    }
    if (dragState.type === 'loop-end') {
        const newEnd = Math.max(loopStart + 0.5, dragState.initialVal + deltaSeconds);
        setLoopEnd(newEnd);
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
    // Re-sync audio for modified track on drop
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
    setHasUnsavedChanges(false);
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

  const handleAddTrack = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !session) return;

    try {
      const formData = new FormData();
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await Tone.context.decodeAudioData(arrayBuffer);
      const duration = audioBuffer.duration;

      formData.append('sessionId', session.id.toString());
      formData.append('audioFile', file);
      formData.append('name', file.name.replace(/\.[^/.]+$/, ""));
      formData.append('durationInSeconds', duration.toString()); 
      formData.append('startTimeInSeconds', '0');
      formData.append('order', (session.tracks.length + 1).toString());

      const response = await sessionsApi.createSessionTrack(formData as any);
      
      if (response.data) {
        const newTrack = response.data;
        setSession(prev => prev ? { ...prev, tracks: [...prev.tracks, newTrack] } : null);
        setupTrackAudio(newTrack);
        setHasUnsavedChanges(true); 
      }
    } catch (error) {
      console.error("Failed to upload track", error);
      alert("Error uploading track.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };
  


  if (loading || !session || !account) return <div className="daw-container">Loading...</div>;

  // Ruler Calculation
  const bpm = session.bpm || 120;
  const secondsPerBeat = 60 / bpm;
  const secondsPerBar = secondsPerBeat * 4; // 4/4 time signature
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

        <div className="timeline-area" ref={timelineRef}>
          
          {/* Updated Ruler: Showing Bars instead of Seconds */}
          <div className="timeline-ruler" onMouseDown={handleRulerMouseDown}>
             {Array.from({ length: totalBars }).map((_, i) => {
               // Only show number every 4 bars, but show ticks for every bar
               const isMajor = i % 4 === 0;
               return (
                <div key={i} style={{ 
                    position: 'absolute', 
                    left: i * pxPerBar, 
                    borderLeft: isMajor ? '1px solid #666' : '1px solid #333', 
                    height: isMajor ? '100%' : '50%',
                    bottom: 0,
                    paddingLeft: '4px', 
                    pointerEvents: 'none',
                    color: isMajor ? '#888' : 'transparent'
                }}>
                 {i + 1}
               </div>
             )})}

             {/* Loop Markers (Always rendered, styled via class) */}
             <>
                <div className={`loop-region ${!isLooping ? 'inactive' : ''}`} style={{
                    left: loopStart * PX_PER_SECOND,
                    width: (loopEnd - loopStart) * PX_PER_SECOND
                }} />
                
                <div 
                    className={`loop-handle start ${!isLooping ? 'inactive' : ''}`}
                    style={{ left: loopStart * PX_PER_SECOND }}
                    onMouseDown={(e) => handleLoopDragStart(e, 'loop-start')}
                    title="Drag Loop Start"
                />
                
                <div 
                    className={`loop-handle end ${!isLooping ? 'inactive' : ''}`}
                    style={{ left: loopEnd * PX_PER_SECOND }}
                    onMouseDown={(e) => handleLoopDragStart(e, 'loop-end')}
                    title="Drag Loop End"
                />
            </>
          </div>

          <div className="playhead" style={{ left: `${transportTime * PX_PER_SECOND}px` }} />

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
                        <div className='clip-author'>{track.authorUsername} </div>
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