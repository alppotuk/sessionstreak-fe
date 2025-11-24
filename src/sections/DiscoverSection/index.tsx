import { useEffect, useState } from "react";
import { sessionsApi } from "../../api/sessionsApi";
import type { CreateSessionRequest, Session, SessionsRequest } from '../../api/types/session';
import "./styles.scss";
import type { PaginationResponse } from "../../api/types/common";
import { Modal } from "../../components/Modal";

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
            pageNumber: 1,
            pageSize: 10,
        }
        
      const result: PaginationResponse<Session> = await sessionsApi.getSessions(request);

      console.log("Fetched sessions:", result);
      setItems(result.data);
      setTotalCount(result.totalCount);
    } finally {
    }
  };

  const handleCreateSubmit = async () => {
    setIsModalOpen(false);
    setCreateSessionRequest({ name: "", isPublic: true, bpm: 120 });
    try{
      const result : Session = await sessionsApi.createSession(createSessionRequest);
      console.log("Created session:", result);

      
    }finally {
      loadData();
    }
  };

  useEffect(() => {
    loadData();
  }, [page, searchText]);

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <section className="discover">
      <div className="header">
        <p>Discover</p> 
        <button onClick={() => setIsModalOpen(true)}>Create Session</button>
        </div>

    <div className="body">
      <div className="search">
        <input
          placeholder="Search sessions..."
          value={searchText}
          onChange={(e) => {
            setPage(1);
            setSearchText(e.target.value);
          }}
        />
      </div>

      <div className="list">
        {items.length === 0 && (
          <div className="empty">No sessions found</div>
        )}

        {
          items.map((item) => (
            <div className="list-item" key={item.id}>
              <div className="left">
                <div className="name">{item.name}</div>
                <div className="author">{item.ownerUsername}</div>
              </div>
              <div className="right">
                <div className="star-count">{item.starCount}</div>
                <div className="share-count">{item.shareCount}</div>
                <div className="starred">{item.isStarred}</div>
              </div>
            </div>
          ))}
      </div>

      <div className="pagination">
        <button
          disabled={page === 1}
          onClick={() => setPage((p) => p - 1)}
        >
          Prev
        </button>

        <span>
          {page} / {totalPages || 1}
        </span>

        <button
          disabled={page === totalPages || totalPages === 0}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>
      </div>
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title="Create New Session"
      >
        <label>Session Name</label>
        <input 
            type="text" 
            placeholder="My Awesome Session"
            value={createSessionRequest.name}
            onChange={(e) => setCreateSessionRequest({...createSessionRequest, name: e.target.value})}
        />

        <label>BPM</label>
        <input 
            type="number" 
            value={createSessionRequest.bpm}
            onChange={(e) => setCreateSessionRequest({...createSessionRequest, bpm: Number(e.target.value)})}
        />

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
            <button className="cancel" onClick={() => setIsModalOpen(false)}>Cancel</button>
            <button className="save" onClick={handleCreateSubmit}>Create</button>
        </div>
      </Modal>
    </section>
  );
}
