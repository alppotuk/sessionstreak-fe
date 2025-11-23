import { useEffect, useState } from "react";
import { sessionsApi } from "../../api/sessionsApi";
import type { Session, SessionsRequest } from '../../api/types/session';
import "./styles.scss";
import type { PaginationResponse } from "../../api/types/common";

export default function DiscoverSection() {
  const [items, setItems] = useState<Session[]>([]);
  const [searchText, setSearchText] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10); 
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
        const request : SessionsRequest = {
            pageNumber: 1,
            pageSize: 10,
        }
        
      const result: PaginationResponse<Session> = await sessionsApi.getSessions(request);

      setItems(result.data);
      setTotalCount(result.totalCount);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    //loadData();
  }, [page, searchText]);

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <section className="discover">
      <div className="header">Discover</div>

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
        {loading && <div className="loading">Loading...</div>}

        {!loading && items.length === 0 && (
          <div className="empty">No sessions found</div>
        )}

        {!loading &&
          items.map((item) => (
            <div className="list-item" key={item.id}>
              <div className="title">{item.title}</div>
              <div className="desc">{item.description}</div>
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
    </section>
  );
}
