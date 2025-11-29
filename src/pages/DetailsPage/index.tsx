import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import * as Tone from 'tone';
import { Play, Pause, Square, Repeat, Volume2, Plus } from 'lucide-react';
import './styles.scss'; 

import { sessionsApi } from '../../api/sessionsApi'; 
import type { Session, SessionTrack } from '../../api/types/session';

// --- Constants ---
const PX_PER_SECOND = 50;

export default function SessionDaw() {
  const { sessionToken } = useParams<{ sessionToken: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
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
      if (!sessionToken) return;
      try {
        const response = await sessionsApi.getSession(sessionToken);
        setSession(response.data); 
        setIsLooping(response.data.isLoopActive);
        
        await Tone.start();
        Tone.Transport.bpm.value = response.data.bpm;
        
        response.data.tracks.forEach(track => {
          setupTrackAudio(track);
        });

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
  }, [sessionToken]);

  // --- 2. Audio Engine Logic ---
  const setupTrackAudio = (track: SessionTrack) => {
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
    
    if (isPlaying) {
      syncLoop();
    } else {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    }
  }, [isPlaying]);


  // --- 3. Transport Controls ---
  const togglePlay = async () => {
    if (Tone.context.state !== 'running') await Tone.start();

    if (isPlaying) {
      Tone.Transport.pause();
      playersRef.current.forEach(p => p.stop());
    } else {
      playersRef.current.forEach((player, trackId) => {
        const track = session?.tracks.find(t => t.id === trackId);
        if (track && player.loaded) {
            const clipStart = track.startTimeInSeconds;
            const clipDuration = track.durationInSeconds - track.startTrimInSeconds - track.endTrimInSeconds;
            
            if (Tone.Transport.seconds < clipStart + clipDuration) {
                 const offset = Math.max(0, Tone.Transport.seconds - clipStart) + track.startTrimInSeconds;
                 const startWhen = Math.max(0, clipStart - Tone.Transport.seconds);
                 
                 player.start(
                   `+${startWhen}`, 
                   offset, 
                   clipDuration - (offset - track.startTrimInSeconds)
                 );
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

  // --- 4. Track Actions (Add, State, Audio) ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !session) return;

    try {
        // TODO: Replace with actual API call: const response = await sessionsApi.addTrack(sessionToken, file);
        // Simulating API response:
        const newTrack: SessionTrack = {
            id: Date.now(), // Mock ID
            name: file.name.replace(/\.[^/.]+$/, ""),
            sessionId: session.id,
            sessionName: session.name,
            order: session.tracks.length + 1,
            audioFileUrl: URL.createObjectURL(file), // Temp URL for immediate playback
            waveformFileUrl: '', // Placeholder
            durationInSeconds: 10, // Mock duration
            startTimeInSeconds: 0,
            startTrimInSeconds: 0,
            endTrimInSeconds: 0,
            volumeDb: 0,
            isMuted: false,
            isSolo: false,
            isMono: false,
            pan: 0,
            createdAtUtc: new Date().toISOString()
        };

        // 1. Update State
        setSession(prev => prev ? { ...prev, tracks: [...prev.tracks, newTrack] } : null);

        // 2. Initialize Audio for new track
        setupTrackAudio(newTrack);

    } catch (error) {
        console.error("Error adding track", error);
    } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleVolumeChange = (trackId: number, val: number) => {
    const channel = channelRef.current.get(trackId);
    if (channel) channel.volume.value = val;

    setSession(prev => {
        if(!prev) return null;
        return {
            ...prev,
            tracks: prev.tracks.map(t => t.id === trackId ? { ...t, volumeDb: val } : t)
        }
    });
  };

  const toggleMute = (trackId: number) => {
    const channel = channelRef.current.get(trackId);
    setSession(prev => {
        if(!prev) return null;
        const newTracks = prev.tracks.map(t => {
            if (t.id === trackId) {
                if(channel) channel.mute = !t.isMuted;
                return { ...t, isMuted: !t.isMuted };
            }
            return t;
        });
        return { ...prev, tracks: newTracks };
    });
  };

  const toggleSolo = (trackId: number) => {
    const channel = channelRef.current.get(trackId);
    setSession(prev => {
        if(!prev) return null;
        const newTracks = prev.tracks.map(t => {
            if (t.id === trackId) {
                if(channel) channel.solo = !t.isSolo;
                return { ...t, isSolo: !t.isSolo };
            }
            return t;
        });
        return { ...prev, tracks: newTracks };
    });
  };

  // --- 5. Timeline Interactions ---
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
                const trimDelta = newTrim - dragState.initialVal; 
                return { 
                    ...t, 
                    startTrimInSeconds: newTrim,
                    startTimeInSeconds: t.startTimeInSeconds + trimDelta
                };
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
    setDragState(null);
  };


  if (loading || !session) return <div className="daw-container">Loading Studio...</div>;

  return (
    <div className="daw-container" onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>
      
      {/* Header */}
      <header className="daw-header">
        <div className="session-info">
          {session.name} <div className='bpm'> {session.bpm} BPM</div>  
        </div>
        
        <div className="transport-controls">
          <button onClick={toggleLoop} className={isLooping ? 'active' : ''} title="Loop">
            <Repeat size={16} />
          </button>
          <button onClick={stop} title="Stop">
            <Square size={16} fill="currentColor" />
          </button>
          <button onClick={togglePlay} className="primary" title={isPlaying ? "Pause" : "Play"}>
            {isPlaying ? <Pause size={18} fill="currentColor"/> : <Play size={18} fill="currentColor"/>}
          </button>
          <div className='time'>
            {transportTime.toFixed(2)}s
          </div>
        </div>

        <div></div>
      </header>

      {/* Main Area */}
      <div className="daw-workspace">
        
        {/* Track Controls (Left) */}
        <div className="track-headers">
          <div className='timeline-ruler'></div>
          {session.tracks.sort((a,b) => a.order - b.order).map(track => (
            <div key={track.id} className="track-control-panel">
              <div className="track-name">{track.name}</div>
              
              <div className="track-actions">
                <button 
                  className={`mute ${track.isMuted ? 'active' : ''}`}
                  onClick={() => toggleMute(track.id)}>M
                </button>
                <button 
                  className={`solo ${track.isSolo ? 'active' : ''}`}
                  onClick={() => toggleSolo(track.id)}>S
                </button>
              </div>

              <div className="track-sliders">
                <Volume2 size={12} />
                <input 
                  type="range" 
                  min="-60" max="6" step="1" 
                  value={track.volumeDb}
                  onChange={(e) => handleVolumeChange(track.id, Number(e.target.value))} 
                />
              </div>
            </div>
          ))}

          {/* ADD TRACK BUTTON */}
          <div className="add-track-container">
             <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                style={{display: 'none'}} 
                accept="audio/*" 
             />
             <button className="btn-add-track" onClick={() => fileInputRef.current?.click()}>
                <Plus size={16} /> Add Track
             </button>
          </div>
        </div>

        {/* Timeline (Right) */}
        <div className="timeline-area">
          
          {/* Ruler */}
          <div className="timeline-ruler" >
             {Array.from({ length: Math.ceil(session.durationInSeconds / 5) }).map((_, i) => (
               <div key={i} style={{ 
                   position: 'absolute', 
                   left: i * 5 * PX_PER_SECOND, 
                   borderLeft: '1px solid #444', 
                   height: '100%',
                   paddingLeft: '4px' 
               }}>
                 {i * 5}s
               </div>
             ))}
          </div>

          {/* Playhead */}
          <div 
            className="playhead" 
            style={{ left: `${transportTime * PX_PER_SECOND}px` }} 
          />

          {/* Tracks */}
          {session.tracks.sort((a,b) => a.order - b.order).map(track => {
             const visibleDuration = track.durationInSeconds - track.startTrimInSeconds - track.endTrimInSeconds;
             const widthPx = visibleDuration * PX_PER_SECOND;
             const leftPx = track.startTimeInSeconds * PX_PER_SECOND;

             return (
              <div key={track.id} className="track-lane" >
                <div 
                  className="audio-clip"
                  style={{
                    left: `${leftPx}px`,
                    width: `${widthPx}px`
                  }}
                  onMouseDown={(e) => handleMouseDown(e, track.id, 'move')}
                >
                    <div 
                        className="resize-handle left" 
                        onMouseDown={(e) => handleMouseDown(e, track.id, 'trim-left')}
                    />

                    <div 
                        className="clip-waveform"
                        style={{ 
                            backgroundImage: track.waveformFileUrl ? `url(${track.waveformFileUrl})` : 'none',
                            backgroundColor: track.waveformFileUrl ? 'transparent' : '#445',
                            backgroundPosition: `-${track.startTrimInSeconds * PX_PER_SECOND}px center`,
                            backgroundSize: `${track.durationInSeconds * PX_PER_SECOND}px 100%`
                        }}
                    />
                    <span style={{position:'relative', zIndex: 1, padding: '2px', fontSize: '10px', textShadow: '0 0 2px black'}}>
                        {track.name}
                    </span>

                      <div 
                        className="resize-handle right" 
                        onMouseDown={(e) => handleMouseDown(e, track.id, 'trim-right')}
                    />
                </div>
              </div>
            );
          })}
          
          {/* Empty lane alignment for Add Track button */}
          <div className="track-lane empty-lane"></div>
        </div>
      </div>
    </div>
  );
}