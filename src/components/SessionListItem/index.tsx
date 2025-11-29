import { useNavigate } from "react-router-dom";
import type { Session } from "../../api/types/session";
import "./styles.scss"; // We will define specific styles here or in global

interface Props {
  session: Session;
}

export const SessionListItem = ({ session }: Props) => {
  const navigate = useNavigate();

  const handleClick = () => {
    // Navigate to details page. Assuming 'token' or 'id' is the guid you mentioned.
    // If your property is named 'id', change session.token to session.id
    navigate(`/session/${session.sessionToken}`);
  };

  return (
    <div className="session-card" onClick={handleClick}>
      <div className="card-header">
        <div className="info">
          <h3 className="session-name">{session.name}</h3>
          <span className="author">by @{session.ownerUsername}</span>
        </div>
        {/* Placeholder for an avatar or type icon */}
        <div className="avatar-placeholder">
            {session.ownerUsername.charAt(0).toUpperCase()}
        </div>
      </div>

      <div className="card-body">
        {/* Example: Displaying BPM or other tags */}
        <div className="tags">
            <span className="tag-bpm">{session.bpm || 120} BPM</span>
            {session.isPublic ? <span className="tag-public">Public</span> : <span className="tag-private">Private</span>}
        </div>
      </div>

      <div className="card-footer">
        <div className="stat-item" title="Stars">
            <span className="icon">★</span>
            <span className="value">{session.starCount}</span>
        </div>
        <div className="stat-item" title="Shares">
            <span className="icon">⤤</span>
            <span className="value">{session.shareCount}</span>
        </div>
        {session.isStarred && <div className="starred-badge">Starred</div>}
      </div>
    </div>
  );
};