import { useEffect, useState } from "react";
import { sessionsApi } from "../../api/sessionsApi";
import type { CreateSessionRequest, Session, SessionsRequest } from '../../api/types/session';
import type { PaginationResponse } from "../../api/types/common";
import { Modal } from "../../components/Modal";
import { SessionListItem } from "../../components/SessionListItem"; // Import the new component
import "./styles.scss";

export default function DiscoverSection() {
  const [items, setItems] = useState<Session[]>([]);
  const [searchText, setSearchText] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10); 
  const [totalCount, setTotalCount] = useState(0);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [createSessionRequest, setCreateSessionRequest] = useState<CreateSessionRequest>({
    name: "",
    isPublic: true,
    bpm: 120
  });

  const loadData = async () => {
    try {
        const request : SessionsRequest = {
            pageNumber: page, // FIX: Use state, not hardcoded 1
            pageSize: pageSize,
            // searchText: searchText // Add this if your API supports it
        }
        
      const result: PaginationResponse<Session> = await sessionsApi.getSessions(request);
      setItems(result.data);
      setTotalCount(result.totalCount);
    } catch (error) {
        console.error("Failed to load sessions", error);
    }
  };

  const handleCreateSubmit = async () => {
    try{
      await sessionsApi.createSession(createSessionRequest);
      setIsModalOpen(false);
      setCreateSessionRequest({ name: "", isPublic: true, bpm: 120 });
      loadData(); // Reload list after create
    } catch (error) {
        console.error("Failed to create", error);
    }
  };

  useEffect(() => {
    loadData();
  }, [page, searchText]);

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <section className="discover">
      <div className="header">
        <p className="title">Discover</p> 
        <button className="btn-primary" onClick={() => setIsModalOpen(true)}>Create Session</button>
      </div>

      <div className="body">
        <div className="search-container">
            <input
            className="search-input"
            placeholder="Search sessions..."
            value={searchText}
            onChange={(e) => {
                setPage(1);
                setSearchText(e.target.value);
            }}
            />
        </div>

        <div className="list-grid">
            {items.length === 0 && (
            <div className="empty-state">No sessions found</div>
            )}

            {items.map((item) => (
                // We pass the whole object here
                <SessionListItem key={item.id} session={item} />
            ))}
        </div>

        {/* Hide pagination if empty */}
        {items.length > 0 && (
            <div className="pagination">
                <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                >
                Prev
                </button>

                <span className="page-info">
                {page} / {totalPages || 1}
                </span>

                <button
                disabled={page === totalPages || totalPages === 0}
                onClick={() => setPage((p) => p + 1)}
                >
                Next
                </button>
            </div>
        )}
      </div>

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title="Create New Session"
      >
        <div className="form-group">
            <label>Session Name</label>
            <input 
                type="text" 
                placeholder="My Awesome Session"
                value={createSessionRequest.name}
                onChange={(e) => setCreateSessionRequest({...createSessionRequest, name: e.target.value})}
            />
        </div>

        <div className="form-group">
            <label>BPM</label>
            <input 
                type="number" 
                value={createSessionRequest.bpm}
                onChange={(e) => setCreateSessionRequest({...createSessionRequest, bpm: Number(e.target.value)})}
            />
        </div>

        <div className="checkbox-group">
            <input 
                type="checkbox" 
                id="isPublic"
                checked={createSessionRequest.isPublic}
                onChange={(e) => setCreateSessionRequest({...createSessionRequest, isPublic: e.target.checked})}
            />
            <label htmlFor="isPublic">Make Public</label>
        </div>

        <div className="modal-actions">
            <button className="btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleCreateSubmit}>Create</button>
        </div>
      </Modal>
    </section>
  );
}