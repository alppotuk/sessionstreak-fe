import axiosInstance from "./axiosInstance";
import type { PaginationResponse, Response } from "./types/common";
import type { Session, CreateSessionRequest, UpdateSessionRequest, SessionsRequest } from "./types/session";

export const sessionsApi = {
  async getSessions(payload: SessionsRequest):  Promise<PaginationResponse<Session>> 
  {
    const { data } = await axiosInstance.post("/session/sessions", payload);
    return data;
  },

  async getSessionDetail(guid: string, shareCode?: string): Promise<Response<Session>> {
    const { data } = await axiosInstance.get(`/sessions?guid=${guid}&shareCode=${shareCode || ""}`);
    return data;
  },

  async createSession(payload: CreateSessionRequest): Promise<Session> {
    const { data } = await axiosInstance.post("/session/createSession", payload);
    return data;
  },

  async updateSession(payload: UpdateSessionRequest): Promise<Session> {
    const { data } = await axiosInstance.put(`/session/${payload.id}`, payload);
    return data;
  },

  async deleteSession(id: string): Promise<void> {
    await axiosInstance.delete(`/session/${id}`);
  }
};
