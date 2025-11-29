import axiosInstance from "./axiosInstance";
import type { Account, LoginRequest, RegisterRequest, TokenResponse } from "./types/auth";
import type { Response } from "./types/common";

export const authApi = {
    async register(payload: RegisterRequest): Promise<Response<TokenResponse>> {
        const { data } = await axiosInstance.post("/Authentication/Register", payload);
        return data;
      },

  async login(payload: LoginRequest): Promise<Response<TokenResponse>> {
    const { data } = await axiosInstance.post("/Authentication/Login", payload);
    return data;
  },

  async me() : Promise<Response<Account>> {
    const { data } = await axiosInstance.get("/Authentication/Me");
    return data;
  }
};
