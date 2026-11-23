import { useEffect, useRef, useState } from "react";
import { MAX_LENGTH } from "../constants";
import { formatTime } from "../utils";
import { gifUrl } from "../gifPicker";
import EmojiPicker from "./EmojiPicker";
import GifPicker from "./GifPicker";

export default function CommentSection({
  confession,
  onComment,
  fetchComments,
  isModalPane = false
}) {
  const [input, setInput] = useState("");
  const [selectedGif, setSelectedGif] = useState(null);
  const [activePicker, setActivePicker] = useState(null);
  const [loading, setLoading] = useState(confession.comments === null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);
  const emojiWrapperRef = useRef(null);
   const listEndRef = useRef(null);

  useEffect(() => {
    if (confession.comments === null) {
      setLoading(true);
      setError(false);
      fetchComments(confession.uuid)
        .catch(() => setError(true))
        .finally(() => setLoading(false));
    }
  }, [confession.uuid, confession.comments, fetchComments]);

  useEffect(() => {
    if (!activePicker) return;
    const handleDocumentClick = (event) => {
      if (emojiWrapperRef.current && !emojiWrapperRef.current.contains(event.target)) {
        setActivePicker(null);
      }
    };
    document.addEventListener("mousedown", handleDocumentClick);
    return () => document.removeEventListener("mousedown", handleDocumentClick);
  }, [activePicker]);

  const chooseGif = (id) => {
    setSelectedGif(id);
    setInput("");
    setActivePicker(null);
    setError(false);
  };

  const submit = async (event) => {
    event.preventDefault();

    if (submitting) return;
    const text = input.trim();
    if (Boolean(text) === Boolean(selectedGif)) {
      setError(true);
      return;
    }

    setSubmitting(true);
    setError(false);

    try {
      const success = await onComment(confession.uuid, {
        text: selectedGif ? "" : text,
        gifId: selectedGif
      });

      if (success === false) {
        setError(true);
        return;
      }

      setInput("");
      setSelectedGif(null);
      setActivePicker(null);

      setTimeout(() => {
        listEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      }, 100);

    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={`comments_section${isModalPane ? " modal_comments_mode" : ""}`}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="comment_list">
        {loading ? (
          <div className="comment_status">
            <i className="fa-solid fa-spinner fa-spin" /> Đang tải bình luận...
          </div>
        ) : error && !confession.comments?.length ? (
          <p className="comment_status">Không thể tải bình luận.</p>
        ) : confession.comments?.length ? (
          confession.comments.map((comment, index) => (
            <div
              className="comment_item"
              key={comment.id ?? `${comment.time || "comment"}-${index}`}
            >
              {comment.gif_id ? (
                <img
                  className="comment_gif"
                  src={gifUrl(comment.gif_id)}
                  alt="GIF bình luận"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="comment_text">{comment.content}</span>
              )}
              {comment.time && (
                <span className="comment_time">{formatTime(comment.time)}</span>
              )}
            </div>
          ))
        ) : (
          <p className="comment_status">Chưa có bình luận nào.</p>
        )}
        <div ref={listEndRef} aria-hidden="true" />
      </div>

      <div className="comment_form_wrapper" ref={emojiWrapperRef}>
        {selectedGif && (
          <div className="comment_gif_preview">
            <img
              src={gifUrl(selectedGif)}
              alt="GIF đã chọn"
              referrerPolicy="no-referrer"
            />
            <button
              type="button"
              onClick={() => setSelectedGif(null)}
              aria-label="Xóa GIF đã chọn"
              disabled={submitting}
            >
              ×
            </button>
          </div>
        )}

        <form className="comment_form" onSubmit={submit}>
          <textarea
            className="comment_input"
            rows="1"
            maxLength={MAX_LENGTH}
            placeholder={
              selectedGif
                ? "Đã chọn GIF. Xóa GIF để viết bình luận."
                : "Viết bình luận..."
            }
            value={input}
            disabled={Boolean(selectedGif) || submitting}
            onChange={(event) => {
              setInput(event.target.value);
              setError(false);
            }}
          />

          <button
            type="button"
            className="comment_emoji_btn"
            title="Chọn biểu cảm"
            aria-label="Chọn biểu cảm"
            disabled={Boolean(selectedGif) || submitting}
            onClick={() => setActivePicker(value => value === "emoji" ? null : "emoji")}
          >
            <i className="fa-regular fa-face-smile" />
          </button>

          <button
            type="button"
            className="comment_emoji_btn comment_gif_btn"
            title="Chọn GIF"
            aria-label="Chọn GIF"
            disabled={submitting}
            onClick={() => setActivePicker(value => value === "gif" ? null : "gif")}
          >
            <i className="fa-solid fa-image" />
            <span>GIF</span>
          </button>

          <button
            type="submit"
            className="comment_submit"
            disabled={submitting || (!selectedGif && !input.trim())}
          >
            {submitting ? <i className="fa-solid fa-spinner fa-spin" /> : "Gửi"}
          </button>
        </form>

        {error && (
          <p className="comment_error" role="alert">
            Không thể gửi bình luận. Hãy thử lại.
          </p>
        )}

        {activePicker === "emoji" && !selectedGif && (
          <div className="emoji_picker_container comment_emoji_container">
            <EmojiPicker
              onSelect={(emoji) => {
                setInput((value) => `${value}${emoji}`.slice(0, MAX_LENGTH));
                setActivePicker(null);
              }}
            />
          </div>
        )}
        {activePicker === "gif" && !selectedGif && (
          <GifPicker onSelect={chooseGif} />
        )}
      </div>
    </div>
  );
}
