import { Routes, Route } from 'react-router-dom';
import DetailsPage from './pages/DetailsPage/DetailsPage';
import MainPage from './pages/MainPage';
import DiscoverSection from './sections/DiscoverSection';
import YourSessionsSection from './sections/YourSessionsSection';
import SharedWithMeSection from './sections/SharedWithMeSection';
import SettingsSection from './sections/SettingsSection';

export default function App() {
  return (
    <Routes>
     <Route path="/" element={<MainPage />}>
        <Route index element={<DiscoverSection />} />
        <Route path="discover" element={<DiscoverSection />} />
        <Route path="your-sessions" element={<YourSessionsSection />} />
        <Route path="shared" element={<SharedWithMeSection />} />
        <Route path="settings" element={<SettingsSection />} />
      </Route>
      <Route path="/details/:id" element={<DetailsPage />} />
    </Routes>
  );
}
