import { useEffect, useRef, useState } from "react";
import { formatTime } from "../utils";

export default function ConfessionCard({
  confession,
  liked,
  highlighted,
  isAnnouncement,
  onOpen,
  onLike
}) {
  const important = confession.status === "important";
  const [showReadMore, setShowReadMore] = useState(confession.content.length > 120);
  const contentRef = useRef(null);

  useEffect(() => {
    if (contentRef.current) {
      setShowReadMore(
        contentRef.current.scrollHeight > contentRef.current.clientHeight ||
        confession.content.length > 120
      );
    }
  }, [confession.content]);

  const handleKeyDown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen(confession.uuid);
    }
  };

  return (
    <div
      id={isAnnouncement ? `announcement-${confession.uuid}` : `confession-feed-${confession.uuid}`}
      className={`box${important ? " announcement_box" : ""}${highlighted ? " highlighted_cfs" : ""}`}
      role="button"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onClick={() => onOpen(confession.uuid)}
    >
      <div className="confession_title">
        {important ? "🚨 " : ""}Confession #{String(confession.number || 0).padStart(3, "0")}
      </div>

      <div className="confession_content">
        <p ref={contentRef}>{confession.content}</p>
        {showReadMore && (
          <button
            type="button"
            className="read_more_btn"
            onClick={(event) => {
              event.stopPropagation();
              onOpen(confession.uuid);
            }}
          >
            Xem thêm
          </button>
        )}
      </div>

      <div className="confession_meta">
        <span className="confession_time">{formatTime(confession.time)}</span>
      </div>

      <div className="confession_actions">
        <button
          type="button"
          className={`heart_btn${liked ? " liked" : ""}`}
          onClick={(event) => {
            event.stopPropagation();
            onLike(confession.uuid);
          }}
        >
          {liked ? "❤️" : "🤍"}{" "}
          <span className="heart_count">{confession.likes || 0}</span>
        </button>

        <button
          type="button"
          className="comment_toggle"
          onClick={(event) => {
            event.stopPropagation();
            onOpen(confession.uuid);
          }}
        >
          💬 Bình luận ({confession.commentCount || 0})
        </button>
      </div>
    </div>
  );
}
