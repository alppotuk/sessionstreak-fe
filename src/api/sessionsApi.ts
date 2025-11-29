import axiosInstance from "./axiosInstance";
import type { PaginationResponse, Response } from "./types/common";
import type { Session, CreateSessionRequest, UpdateSessionRequest, SessionsRequest } from "./types/session";

export const sessionsApi = {
  async getSessions(payload: SessionsRequest):  Promise<PaginationResponse<Session>> 
  {
    const { data } = await axiosInstance.post("/Session/Sessions", payload);
    return data;
  },

  async getSession(sessionToken: string, shareCode?: string): Promise<Response<Session>> {
    const { data } = await axiosInstance.get(`/Session/Session?sessionToken=${sessionToken}&shareCode=${shareCode || ""}`);
    return data;
  },

  async createSession(payload: CreateSessionRequest): Promise<Session> {
    const { data } = await axiosInstance.post("/Session/CreateSession", payload);
    return data;
  },

  async updateSession(payload: UpdateSessionRequest): Promise<Session> {
    const { data } = await axiosInstance.put(`/Session/${payload.id}`, payload);
    return data;
  },

  async deleteSession(id: string): Promise<void> {
    await axiosInstance.delete(`/Session/${id}`);
  }
};
