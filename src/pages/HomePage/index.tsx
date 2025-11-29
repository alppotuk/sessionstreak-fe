import { useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Compass, LayoutGrid, Users, Settings, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import './styles.scss';

export default function HomePage() {
  const { account, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.pathname === '/') {
      navigate('/discover', { replace: true });
    }
  }, [location, navigate]);

  return (
    <div className='flex-container'>
      <div className='app-header'>Session Streak</div>
      <div className='side-bar'>
        <div className='header'>
          Session Streak
        </div>
        
        <div className='profile'>
          {account?.profileImageUrl ? (
            <img
              className="profile-image"
              src={account.profileImageUrl}
              alt={account?.username || "Profile"}
            />
          ) : (
            <div className="profile-picture-placeholder">
              {account?.username?.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="profile-username">
            {account?.username ?? 'No Username'}
          </div>
        </div>

        <nav className='menu'>
          <div className='menu-title'>Explore Sessions</div>
          
          <NavLink className="menu-item" to="/discover">
            <Compass className="menu-icon" />
            <span className="menu-text">Discover</span>
          </NavLink>

          <NavLink className="menu-item" to="/your-sessions">
            <LayoutGrid className="menu-icon" />
            <span className="menu-text">My Sessions</span>
          </NavLink>

          <NavLink className="menu-item" to="/shared">
            <Users className="menu-icon" />
            <span className="menu-text">Shared</span>
          </NavLink>

          <NavLink className="menu-item" to="/settings">
            <Settings className="menu-icon" />
            <span className="menu-text">Settings</span>
          </NavLink>
        </nav>

        <div className="logout" onClick={logout}> 
          <LogOut className="icon" />
          <span>Logout</span>
        </div>
      </div>

      <main className='content'>
        <Outlet />
      </main>
    </div>
  );
}