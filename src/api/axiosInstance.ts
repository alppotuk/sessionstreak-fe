import axios from "axios";
import { toast } from "react-toastify";

const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: {
    "Content-Type": "application/json"
  }
});

axiosInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

axiosInstance.interceptors.response.use((response) => {
  const message = response?.data?.message;
  if (message) {
    toast(message);
  }
  return response;
}, (error) => {
  const status = error.response?.status;
  if (status === 401) {
    toast.error("Yetkisiz erişim. Lütfen giriş yapın.");
    localStorage.removeItem("token");
    window.location.href = "/login";
    return;
  }
});

export default axiosInstance;
