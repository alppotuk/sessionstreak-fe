import { useEffect, useState } from "react";
import { sessionsApi } from "../../api/sessionsApi";
import type { CreateSessionRequest, Session, SessionsRequest } from '../../api/types/session';
import type { PaginationResult, Response } from "../../api/types/common";
import { Modal } from "../../components/Modal";
import { SessionList } from "../../components/SessionList";
import "./styles.scss";

export default function DiscoverSection() {
  const [items, setItems] = useState<Session[]>([]);
  // paginationResult can be undefined initially
  const [paginationResult, setPaginationResult] = useState<PaginationResult>();
  const [searchText, setSearchText] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10); 
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [createSessionRequest, setCreateSessionRequest] = useState<CreateSessionRequest>({
    name: "",
    isPublic: true,
    bpm: 120
  });

  const loadData = async () => {
    try {
        const request : SessionsRequest = {
            pageNumber: page,
            pageSize: pageSize,
            // searchText: searchText 
        }
        
      const result: Response<Session[]> = await sessionsApi.getSessions(request);
      
      if (result.success && result.data) {
        setItems(result.data);
        setPaginationResult(result.paginationResult);
      }
    } catch (error) {
        console.error("Failed to load sessions", error);
    }
  };

  const handleCreateSubmit = async () => {
    try{
      await sessionsApi.createSession(createSessionRequest);
      setIsModalOpen(false);
      setCreateSessionRequest({ name: "", isPublic: true, bpm: 120 });
      loadData();
    } catch (error) {
        console.error("Failed to create", error);
    }
  };

  useEffect(() => {
    loadData();
  }, [page, searchText]);

  return (
    <section className="discover">
      <div className="header">
        <p className="title">Discover</p> 
        <button className="btn-primary" onClick={() => setIsModalOpen(true)}>Create Session</button>
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

        {/* Check for items AND paginationResult to be safe */}
        {items.length > 0 && paginationResult ? (
             <SessionList 
                sessions={items}
                paginationResult={paginationResult} 
                onPageChange={setPage} 
            />
        ) : (
            <div className="empty-state">No sessions found</div>
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