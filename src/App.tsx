import { Routes, Route } from "react-router-dom";
import RequireAuth from "./context/RequireAuth"; 
import DiscoverSection from "./sections/DiscoverSection";
import YourSessionsSection from "./sections/YourSessionsSection";
import SharedWithMeSection from "./sections/SharedWithMeSection";
import SettingsSection from "./sections/SettingsSection";
import AuthPage from "./pages/AuthPage";
import { Slide, ToastContainer } from "react-toastify";
import SessionDawPage from "./pages/SessionDawPage";
import HomePage from "./pages/HomePage";

export default function App() {
  return (
     <> 
    <Routes>
     
      <Route path="/login" element={<AuthPage />} />
  
      <Route element={<RequireAuth />}>
        
        
        <Route path="/" element={<HomePage />}>
          <Route index element={<DiscoverSection />} />
          <Route path="discover" element={<DiscoverSection />} />
          <Route path="your-sessions" element={<YourSessionsSection />} />
          <Route path="shared" element={<SharedWithMeSection />} />
          <Route path="settings" element={<SettingsSection />} />
        </Route>

        
        <Route path="/session/:sessionToken" element={<SessionDawPage />} />

      </Route>
    </Routes>
    <ToastContainer
    position="bottom-center"
    closeButton={false}
    closeOnClick={true}
    theme="dark"
    newestOnTop={true}
    hideProgressBar={true}
    autoClose={300000}
    transition={Slide}
    />
    </>
)};


