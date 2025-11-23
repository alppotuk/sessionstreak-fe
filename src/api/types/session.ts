import type { PaginationRequest } from "./common";

export interface Session {
    id: string;
    name: string;
    sessionToken: string;
    ownerUsername: string;
    createdAtUtc: string;
    updatedAtUtc?: string;
    duration: number;
    bpm: number;
    isPublic: boolean;
    isStarred: boolean;

    shareCount: number;
    starCount: number;
    trackCount: number;
  }
  
export interface SessionsRequest extends PaginationRequest {
    searchText?: string;
    isPublic?: boolean;
}
  
  export interface CreateSessionRequest {
    title: string;
    description?: string;
    isPublic: boolean;
  }
  
  export interface UpdateSessionRequest {
    id: string;
    title?: string;
    description?: string;
    isPublic?: boolean;
  }
  