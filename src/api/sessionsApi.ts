import axiosInstance from "./axiosInstance";
import type { Entity, Response } from "./types/common";
import type { Session, CreateSessionRequest, UpdateSessionRequest, SessionsRequest, CreateSessionTrackRequest, SessionTrack } from "./types/session";

export const sessionsApi = {
  async getSessions(payload: SessionsRequest):  Promise<Response<Session[]>> 
  {
    const { data } = await axiosInstance.post("/Session/Sessions", payload);
    return data;
  },

  async getSession(sessionToken: string, shareCode?: string): Promise<Response<Session>> {
    const { data } = await axiosInstance.get(`/Session/Session?sessionToken=${sessionToken}&shareCode=${shareCode || ""}`);
    return data;
  },

  async createSession(payload: CreateSessionRequest): Promise<Response<boolean>> {
    const { data } = await axiosInstance.post("/Session/CreateSession", payload);
    return data;
  },

  async updateSession(payload: UpdateSessionRequest): Promise<Response<boolean>> {
    const { data } = await axiosInstance.post('/Session/UpdateSession', payload);
    return data;
  },

  async deleteSession(payload: Entity): Promise<Response<boolean>> {
    const { data } =  await axiosInstance.post('/Session/DeleteSession', payload);
    return data;
  },

  async createSessionTrack(payload: CreateSessionTrackRequest): Promise<Response<SessionTrack>> {
    const { data } = await axiosInstance.post("/Session/CreateSessionTrack", payload, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  }
};
