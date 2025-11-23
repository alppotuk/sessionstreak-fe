import type { Entity } from "./common";

export interface TokenResponse {
    token: string;
    expires: string
}

export interface LoginRequest {
    source: string;
    password: string;
}

export interface RegisterRequest {
    username: string;
    email: string;
    password: string;
}

export interface Account extends Entity{
    username: string;
    email: string;
    profileImageUrl?: string;
}