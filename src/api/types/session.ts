import type { PaginationRequest } from "./common";

export interface Session {
    id: number;
    name: string;
    sessionToken: string;

    ownerUsername: string;

    durationInSeconds: number;
    bpm: number;

    loopStartInSeconds: number;
    loopEndInSeconds: number;

    isPublic: boolean;
    isStarred: boolean;
    isLoopActive: boolean;

    shareCount: number;
    starCount: number;
    trackCount: number;

    createdAtUtc: string;
    updatedAtUtc?: string;

    tracks: SessionTrack[];
  }

export interface SessionTrack{
  id: number,
  name: string,
  sessionId: number,
  sessionName: string,
  authorUsername: string,
  order: number,
  audioFileUrl: string,
  waveformFileUrl: string,
  durationInSeconds: number,
  startTimeInSeconds: number,
  startTrimInSeconds: number,
  endTrimInSeconds: number,

  volumeDb: number,
  isMuted: boolean,
  isSolo: boolean
  isMono: boolean,
  pan: number,

  createdAtUtc: string,
}
  
export interface SessionsRequest extends PaginationRequest {
    searchText?: string;
    isPublic?: boolean;
}
  
  export interface CreateSessionRequest {
    name: string;
    bpm: number;
    isPublic: boolean;
  }
  
  export interface UpdateSessionRequest {
    id: number;
    name: string;
    bpm: number;
    isPublic: boolean;
    isLoopActive: boolean;
    loopStartInSeconds: number;
    loopEndInSeconds: number;
    tracks: UpdateSessionTrackRequest[];
  }
  
  export interface UpdateSessionTrackRequest {
    id: number;
    name: string;
    audioFile?: File | null;
    durationInSeconds: number;
    startTimeInSeconds: number;
    startTrimInSeconds: number;
    endTrimInSeconds: number;
    volumeDb: number;
    isMuted: boolean;
    isSolo: boolean;
    isMono: boolean;
    pan: number;
    order: number;
  }

  export interface CreateSessionTrackRequest {
    name: string;
    sessionId: number;
    audioFile: File;
    durationInSeconds: number;
    startTimeInSeconds: number;
    startTrimInSeconds: number;
    endTrimInSeconds: number;
    volumeDb: number;
    isMuted: boolean;
    isSolo: boolean;
    isMono: boolean;
    pan: number;
    order: number;
  }