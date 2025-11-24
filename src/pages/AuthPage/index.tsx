import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { authApi } from "../../api/authApi"; 
import { useAuth } from "../../context/AuthContext";
import "./styles.scss";

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const navigate = useNavigate();
  const { login } = useAuth();

  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: ""
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      let token = "";

      if (isLogin) {
        const res = await authApi.login({
          source: formData.username, 
          password: formData.password
        });
        token = res.data.token;
      } else {
        const res = await authApi.register({
          username: formData.username,
          email: formData.email,
          password: formData.password
        });
        token = res.data.token;
      }

      login(token);
      navigate("/", { replace: true });

    } catch (err: any) {
      const msg = err.response?.data?.message || "Bir hata oluştu.";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setError(null);
    setFormData({ username: "", email: "", password: "" });
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h2>{isLogin ? "Hoş Geldiniz" : "Hesap Oluştur"}</h2>
       

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          {!isLogin && (
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                name="email"
                placeholder="ornek@mail.com"
                value={formData.email}
                onChange={handleInputChange}
                required
              />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="username">
              {isLogin ? "Kullanıcı Adı veya Email" : "Kullanıcı Adı"}
            </label>
            <input
              type="text"
              id="username"
              name="username"
              placeholder={isLogin ? "Kullanıcı adı veya email" : "Kullanıcı adı seçin"}
              value={formData.username}
              onChange={handleInputChange}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Şifre</label>
            <input
              type="password"
              id="password"
              name="password"
              placeholder="••••••••"
              value={formData.password}
              onChange={handleInputChange}
              required
            />
          </div>

          <button type="submit" className="btn-submit" disabled={isLoading}>
            {isLoading ? "İşleniyor..." : isLogin ? "Giriş Yap" : "Kayıt Ol"}
          </button>
        </form>

        <div className="toggle-section">
          {isLogin ? "Hesabınız yok mu?" : "Zaten hesabınız var mı?"}
          <button type="button" onClick={toggleMode}>
            {isLogin ? "Hemen Kaydol" : "Giriş Yap"}
          </button>
        </div>
      </div>
    </div>
  );
}