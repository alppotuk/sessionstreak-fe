import { Link, NavLink, Outlet } from 'react-router-dom';
import './styles.scss';
import { useAuth } from '../../context/AuthContext';
import default_profile from '../../assets/default-profile.png';
import discovery_logo from '../../assets/discover_logo.png';
import your_sessions_logo from '../../assets/your_sessions_logo.png';
import shared_logo from '../../assets/shared_logo.png';
import settings_logo from '../../assets/settings_logo.png';
import logout_logo from '../../assets/logout_logo.png';


export default function MainPage() {
  const { account } = useAuth();
  
  return (
  <>
    <div className='flex-container'>
      <div className='side-bar'>
        <div className='header'>
        Session Streak

        
        </div>
        <div className='profile'>
        <img
                className="profile-image"
                src={account?.profileImageUrl || default_profile}
                alt={account?.username ? `${account.username}'s profile` : "Profile"}
              />
              <div className="profile-username">{account?.username ?? 'you dont have a username?'}</div>
        </div>
        <div className='menu'>

          <div className='menu-title'>Explore Sessions</div>
         
         
          <NavLink className="menu-item" to="/discover">
            <img src={discovery_logo} alt="" className="menu-icon" />
            Discover
          </NavLink>

          <NavLink className="menu-item" to="/your-sessions">
            <img src={your_sessions_logo} alt="" className="menu-icon" />
            My Sessions
          </NavLink>

          <NavLink className="menu-item" to="/shared">
            <img src={shared_logo} alt="" className="menu-icon" />
            Shared with me
          </NavLink>

          <NavLink className="menu-item" to="/settings">
            <img src={settings_logo} alt="" className="menu-icon" />
            Settings
          </NavLink>
        </div>
            <Link className="logout" to="/your-sessions">
            <img src={logout_logo} alt="" className="icon" />
            Logout
            </Link>

      </div>
      <div className='content'>
        <Outlet />
      </div>
    </div>
  
    
  </>
  );
}
