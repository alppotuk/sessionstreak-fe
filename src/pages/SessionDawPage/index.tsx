import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import * as Tone from 'tone';
import { Play, Pause, Square, Repeat, Volume2, Plus, Trash2, Save, Share2 } from 'lucide-react'; // Added Icons
import './styles.scss'; 

import { sessionsApi } from '../../api/sessionsApi'; 
import type { Session, SessionTrack } from '../../api/types/session';
import { useAuth } from '../../context/AuthContext';

const PX_PER_SECOND = 50;

export default function SessionDawPage() {
  const { account } = useAuth();
  const { sessionToken } = useParams<{ sessionToken: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  
  // New States
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [editingTrackId, setEditingTrackId] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
   
  // Audio State
  const [isPlaying, setIsPlaying] = useState(false);
  const [transportTime, setTransportTime] = useState(0);
  const [isLooping, setIsLooping] = useState(false);
   
  const playersRef = useRef<Map<number, Tone.Player>>(new Map());
  const channelRef = useRef<Map<number, Tone.Channel>>(new Map());
  const animationFrameRef = useRef<number | null>(null);

  // --- 1. Initialization ---
  useEffect(() => {
    const loadSession = async () => {
      console.log("Loading session:", sessionToken);
      console.log("Current account:", account);
      if (!sessionToken || !account) return;
      try {
        const response = await sessionsApi.getSession(sessionToken);
        setSession(response.data); 
        setIsLooping(response.data.isLoopActive);
        
        console.log("Session loaded into DAW:", response.data);
        Tone.Transport.bpm.value = response.data.bpm;
        
        response.data.tracks.forEach(track => setupTrackAudio(track));
      } catch (err) {
        console.error("Failed to load session", err);
      } finally {
        console.log("Session loaded");
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

  // --- 2. Audio Engine ---
  const setupTrackAudio = (track: SessionTrack) => {
    // specific cleanup if re-adding same ID
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
      // Direct Tone access ensures accuracy
      setTransportTime(Tone.Transport.seconds);
      animationFrameRef.current = requestAnimationFrame(syncLoop);
    };
    
    if (isPlaying) {
      syncLoop();
    } else {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    }
  }, [isPlaying]);

  // --- 3. Transport & Global Actions ---
  const togglePlay = async () => {
    if (Tone.context.state !== 'running') await Tone.start();

    if (isPlaying) {
      Tone.Transport.pause();
      playersRef.current.forEach(p => p.stop());
    } else {
      // Simple play logic for demo - in prod, careful scheduling is needed
      playersRef.current.forEach((player, trackId) => {
        const track = session?.tracks.find(t => t.id === trackId);
        if (track && player.loaded) {
            const clipStart = track.startTimeInSeconds;
            const clipDuration = track.durationInSeconds - track.startTrimInSeconds - track.endTrimInSeconds;
            const current = Tone.Transport.seconds;
            
            if (current < clipStart + clipDuration) {
                 const offset = Math.max(0, current - clipStart) + track.startTrimInSeconds;
                 const startWhen = Math.max(0, clipStart - current);
                 
                 player.start(`+${startWhen}`, offset, clipDuration - (offset - track.startTrimInSeconds));
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

  const toggleLoop = () => {
    const newVal = !isLooping;
    setIsLooping(newVal);
    Tone.Transport.loop = newVal;
    if (session) {
        Tone.Transport.loopStart = session.loopStartInSeconds;
        Tone.Transport.loopEnd = session.lookEndInSeconds;
    }
  };

  const handleSave = async () => {
    if(!hasUnsavedChanges) return;
    console.log("Saving session...", session);
    // await sessionsApi.updateSession(session);
    setHasUnsavedChanges(false);
    alert("Saved (Mock)");
  };

  const handleShare = () => {
    console.log("Sharing session...");
    alert("Share dialog open");
  };

  // --- 4. Track Modifications ---
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

  const handleRemoveTrack = (trackId: number) => {
    if(!window.confirm("Delete this track?")) return;
    
    // Cleanup audio
    playersRef.current.get(trackId)?.dispose();
    channelRef.current.get(trackId)?.dispose();
    playersRef.current.delete(trackId);
    channelRef.current.delete(trackId);

    setSession(prev => prev ? { ...prev, tracks: prev.tracks.filter(t => t.id !== trackId) } : null);
    markChanged();
  };

  const handleNameChange = (trackId: number, newName: string) => {
    setSession(prev => prev ? {
        ...prev,
        tracks: prev.tracks.map(t => t.id === trackId ? { ...t, name: newName } : t)
    } : null);
    markChanged();
  };

  const handleVolumeChange = (trackId: number, val: number) => {
    const channel = channelRef.current.get(trackId);
    if (channel) channel.volume.value = val;
    setSession(prev => prev ? {
        ...prev, tracks: prev.tracks.map(t => t.id === trackId ? { ...t, volumeDb: val } : t)
    } : null);
    // Usually volume tweaks might not trigger "Unsaved" immediately to avoid spam, but let's do it
    markChanged(); 
  };

  const toggleMute = (trackId: number) => {
    const channel = channelRef.current.get(trackId);
    setSession(prev => {
        if(!prev) return null;
        return { ...prev, tracks: prev.tracks.map(t => {
            if (t.id === trackId) {
                if(channel) channel.mute = !t.isMuted;
                return { ...t, isMuted: !t.isMuted };
            }
            return t;
        })};
    });
  };

  const toggleSolo = (trackId: number) => {
    const channel = channelRef.current.get(trackId);
    setSession(prev => {
        if(!prev) return null;
        return { ...prev, tracks: prev.tracks.map(t => {
            if (t.id === trackId) {
                if(channel) channel.solo = !t.isSolo;
                return { ...t, isSolo: !t.isSolo };
            }
            return t;
        })};
    });
  };

  // --- 5. Timeline Dragging ---
  const [dragState, setDragState] = useState<{
    trackId: number, 
    type: 'move' | 'trim-left' | 'trim-right', 
    startX: number, 
    initialVal: number
  } | null>(null);

  const handleMouseDown = (e: React.MouseEvent, trackId: number, type: 'move' | 'trim-left' | 'trim-right') => {
    e.stopPropagation();
    const track = session?.tracks.find(t => t.id === trackId);
    if (!track) return;

    let initialVal = 0;
    if (type === 'move') initialVal = track.startTimeInSeconds;
    if (type === 'trim-left') initialVal = track.startTrimInSeconds;
    if (type === 'trim-right') initialVal = track.endTrimInSeconds;

    setDragState({ trackId, type, startX: e.clientX, initialVal });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragState || !session) return;

    const deltaPixels = e.clientX - dragState.startX;
    const deltaSeconds = deltaPixels / PX_PER_SECOND;

    setSession({
        ...session,
        tracks: session.tracks.map(t => {
            if (t.id !== dragState.trackId) return t;
            
            if (dragState.type === 'move') {
                return { ...t, startTimeInSeconds: Math.max(0, dragState.initialVal + deltaSeconds) };
            }
            if (dragState.type === 'trim-left') {
                const newTrim = Math.max(0, Math.min(t.durationInSeconds - 0.1, dragState.initialVal + deltaSeconds));
                return { ...t, startTrimInSeconds: newTrim, startTimeInSeconds: t.startTimeInSeconds + (newTrim - dragState.initialVal) };
            }
             if (dragState.type === 'trim-right') {
                const newEndTrim = Math.max(0, Math.min(t.durationInSeconds - t.startTrimInSeconds - 0.1, dragState.initialVal - deltaSeconds));
                return { ...t, endTrimInSeconds: newEndTrim };
             }
            return t;
        })
    });
  };

  const handleMouseUp = () => {
    if(dragState) markChanged();
    setDragState(null);
  };


  if (loading || !session || !account) return <div className="daw-container">Loading Studio...</div>;

  return (
    <div className="daw-container" onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>
      
      {/* Header */}
      <header className="daw-header">
        <div className="session-info">
          {session.name} <div className='bpm'> {session.bpm} BPM</div>  
        </div>
        
        <div className="transport-controls">
          <button onClick={toggleLoop} className={isLooping ? 'active' : ''} title="Loop"><Repeat size={16} /></button>
          <button onClick={stop} title="Stop"><Square size={16} fill="currentColor" /></button>
          <button onClick={togglePlay} className="primary" title={isPlaying ? "Pause" : "Play"}>
            {isPlaying ? <Pause size={18} fill="currentColor"/> : <Play size={18} fill="currentColor"/>}
          </button>
          <div className='time'>{transportTime.toFixed(2)}s</div>
        </div>

        <div className="action-buttons">
            <button className="share-btn" onClick={handleShare}>
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
              {/* Editable Name */}
              <div className="track-name-row">
                {editingTrackId === track.id ? (
                    <input 
                        autoFocus
                        type="text"
                        value={track.name}
                        onChange={(e) => handleNameChange(track.id, e.target.value)}
                        onBlur={() => setEditingTrackId(null)}
                        onKeyDown={(e) => e.key === 'Enter' && setEditingTrackId(null)}
                    />
                ) : (
                    <span onClick={() => setEditingTrackId(track.id)} className="name-label">
                        {track.name}
                    </span>
                )}
              </div>
              
              <div className="track-actions">
                <button className={`mute ${track.isMuted ? 'active' : ''}`} onClick={() => toggleMute(track.id)}>M</button>
                <button className={`solo ${track.isSolo ? 'active' : ''}`} onClick={() => toggleSolo(track.id)}>S</button>
                <button className="delete" onClick={() => handleRemoveTrack(track.id)} title="Remove Track"><Trash2 size={12}/></button>
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
        <div className="timeline-area">
          
          {/* Ruler */}
          <div className="timeline-ruler" >
             {Array.from({ length: Math.ceil((session.durationInSeconds + 30) / 5) }).map((_, i) => (
               <div key={i} style={{ position: 'absolute', left: i * 5 * PX_PER_SECOND, borderLeft: '1px solid #444', height: '100%', paddingLeft: '4px' }}>
                 {i * 5}s
               </div>
             ))}
          </div>

          {/* Playhead - Now covers Ruler and Tracks */}
          <div className="playhead" style={{ left: `${transportTime * PX_PER_SECOND}px` }} />

          {/* Tracks */}
          {session.tracks.sort((a,b) => a.order - b.order).map(track => {
             const visibleDuration = track.durationInSeconds - track.startTrimInSeconds - track.endTrimInSeconds;
             return (
              <div key={track.id} className="track-lane" >
                <div 
                  className="audio-clip"
                  style={{ left: `${track.startTimeInSeconds * PX_PER_SECOND}px`, width: `${visibleDuration * PX_PER_SECOND}px` }}
                  onMouseDown={(e) => handleMouseDown(e, track.id, 'move')}
                >
                    <div className="resize-handle left" onMouseDown={(e) => handleMouseDown(e, track.id, 'trim-left')} />
                    
                    <div className="clip-content">
                        <div className="clip-name">{track.name}</div>
                        {track.authorUsername && <div className="clip-author">{track.authorUsername}</div>}
                    </div>

                    <div className="resize-handle right" onMouseDown={(e) => handleMouseDown(e, track.id, 'trim-right')} />
                    
                    {/* Visual Waveform background logic remains similar */}
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