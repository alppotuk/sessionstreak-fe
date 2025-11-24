import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext"; // AuthProvider dosyanın yolu

export default function RequireAuth() {
  const { account, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <div className="loading-screen">Yükleniyor...</div>;
  }

  if (!account) {

    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <Outlet />;
}