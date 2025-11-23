import type { Register } from "react-router-dom";
import axiosInstance from "./axiosInstance";
import type { Account, LoginRequest, TokenResponse } from "./types/auth";
import type { Response } from "./types/common";

export const authApi = {
    async register(payload: Register): Promise<Response<TokenResponse>> {
        const { data } = await axiosInstance.post("/authentication/register", payload);
        return data;
      },

  async login(payload: LoginRequest): Promise<Response<TokenResponse>> {
    const { data } = await axiosInstance.post("/authentication/login", payload);
    return data;
  },

  async me() : Promise<Response<Account>> {
    const { data } = await axiosInstance.get("/authentication/me");
    return data;
  }
};
