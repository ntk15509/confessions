import { useEffect } from "react";
import { formatTime } from "../utils";
import CommentSection from "./CommentSection";

export default function ConfessionModal({
  confession,
  liked,
  onClose,
  onLike,
  onComment,
  fetchComments,
}) {
  const important = confession.status === "important";

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="confession_modal_wrapper"
      role="dialog"
      aria-modal="true"
      aria-label={`Chi tiết confession #${confession.number || 0}`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* LEFT BOX: Confession details */}
      <div className={`modal_box confession_pane${important ? " announcement_box" : ""}`}>
        <div className="modal_pane_header">
          <div className="confession_title">
            {important ? "🚨 " : ""}Confession #{String(confession.number || 0).padStart(3, "0")}
          </div>
          <button
            type="button"
            className="close_modal_btn pane_close_btn"
            title="Đóng"
            aria-label="Đóng"
            onClick={onClose}
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div className="confession_content modal_content_scroll">
          <p>{confession.content}</p>
        </div>

        <div className="modal_pane_footer">
          <div className="confession_meta">
            <span className="confession_time">{formatTime(confession.time)}</span>
          </div>

          <div className="confession_actions">
            <button
              type="button"
              className={`heart_btn${liked ? " liked" : ""}`}
              onClick={() => onLike(confession.uuid)}
            >
              {liked ? "❤️" : "🤍"}{" "}
              <span className="heart_count">{confession.likes || 0}</span>
            </button>

            <span className="comment_count_badge">
              💬 {confession.commentCount || 0} bình luận
            </span>
          </div>
        </div>
      </div>

      {/* RIGHT BOX: Comment Section */}
      <div className="modal_box comments_pane">
        <div className="comments_pane_header">
          <div className="comments_pane_title">
            <i className="fa-solid fa-comments" />
            <span>Bình luận ({confession.commentCount || 0})</span>
          </div>
          <button
            type="button"
            className="close_modal_btn comments_close_btn"
            title="Đóng"
            aria-label="Đóng"
            onClick={onClose}
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div className="comments_pane_body">
          <CommentSection
            confession={confession}
            onComment={onComment}
            fetchComments={fetchComments}
            isModalPane={true}
          />
        </div>
      </div>
    </div>
  );
}

