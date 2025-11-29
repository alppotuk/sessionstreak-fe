import { useNavigate } from "react-router-dom";
import type { Session } from "../../api/types/session";
import type { PaginationResult } from "../../api/types/common";
import "./styles.scss";

interface Props {
  sessions: Session[];
  paginationResult: PaginationResult;
  onPageChange: (page: number) => void;
}

export const SessionList = ({ sessions, paginationResult, onPageChange }: Props) => {
  const navigate = useNavigate();
  const { pageNumber, totalPages, hasPreviousPage, hasNextPage } = paginationResult;

  const handleCardClick = (sessionToken: string) => {
    navigate(`/session/${sessionToken}`);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage > 0 && newPage <= totalPages) {
      onPageChange(newPage);
    }
  };

  return (
    <div className="session-list-container">
        {sessions.map((session) => (
          <div
            key={session.id || session.sessionToken}
            className="session-item"
            onClick={() => handleCardClick(session.sessionToken)}
          >
            <div className="left">
              <div className="info">
                <div className="session-name">{session.name}</div>
                <div className="session-author">
                  <div className="author-name">by @{session.ownerUsername}  </div>
                  <div className="author-avatar-placeholder">{session.ownerUsername.charAt(0).toUpperCase()}</div>
                </div>
              
              </div>
             
            </div>

          

            <div className="right">
            <div className="tags">
                <span className="tag-bpm">{session.bpm || 120} BPM</span>
                {/* {session.isPublic ? (
                  <span className="tag-public">Public</span>
                ) : (
                  <span className="tag-private">Private</span>
                )} */}
              </div>
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
        ))}

        <div className="placeholder"></div>

      <div className="pagination-controls">
        <button
          className="page-btn"
          disabled={!hasPreviousPage}
          onClick={() => handlePageChange(pageNumber - 1)}
        >
          Previous
        </button>

        <span className="page-info">
          Page {pageNumber} of {totalPages}
        </span>

        <button
          className="page-btn"
          disabled={!hasNextPage}
          onClick={() => handlePageChange(pageNumber + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
};