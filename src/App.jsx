import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import MarkdownIt from "markdown-it";
import { LIKED_KEY, MAX_LENGTH } from "./constants";
import { formatDate, readStoredLikes } from "./utils";
import { supabase } from "./supabase";
import Announcements from "./components/Announcements";
import ConfessionCard from "./components/ConfessionCard";
import ConfessionModal from "./components/ConfessionModal";
import EmojiPicker from "./components/EmojiPicker";
import Modal from "./components/Modal";
import incognitoLogo from "./assets/incognito.svg";
import readmeMarkdownContent from "./README.md?raw";

const PAGE_SIZE = 60;

const readmeMarkdownParser = new MarkdownIt({
  html: true,
  breaks: true,
  linkify: true
});

function getColumnCount() {
  if (typeof window === "undefined") return 3;
  if (window.innerWidth >= 1100) return 3;
  if (window.innerWidth >= 700) return 2;
  return 1;
}

function normalizeQuery(value) {
  return String(value || "").replace(/#/g, "").trim();
}

function normalizeConfession(item) {
  return {
    uuid: String(item.uuid),
    status: item.status || "approved",
    content: item.content || "",
    time: item.created_at,
    likes: Number(item.likes) || 0,
    commentCount: Number(item.comment_count) || 0,
    lastUpdated: item.last_updated ? new Date(item.last_updated).getTime() : Date.now(),
    comments: null,
    number: Number(item.display_number) || 0,
    dateLabel:
      item.date_label ||
      (item.created_at ? formatDate(item.created_at) : "Khác")
  };
}

function normalizeAnnouncement(item) {
  return {
    uuid: String(item.uuid),
    status: item.status || "important",
    content: item.content || "",
    time: item.created_at,
    likes: Number(item.likes) || 0,
    commentCount: Number(item.comment_count) || 0,
    lastUpdated: item.last_updated
      ? new Date(item.last_updated).getTime()
      : Date.now(),
    comments: null
  };
}

export default function App() {
  const [theme, setTheme] = useState(() =>
    localStorage.getItem("nhs_theme") === "dark" ? "dark" : "light"
  );
  const [confessions, setConfessions] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [liked, setLiked] = useState(readStoredLikes);
  const [expandedId, setExpandedId] = useState(null);
  const [search, setSearch] = useState("");
  const [dateSearch, setDateSearch] = useState("");
  const [readmeOpen, setReadmeOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [feedbackError, setFeedbackError] = useState("");
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [content, setContent] = useState("");
  const [mainEmojiOpen, setMainEmojiOpen] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [columns, setColumns] = useState(getColumnCount);
  const [scrollMargin, setScrollMargin] = useState(0);

  const listRef = useRef(null);
  const firstLoadRef = useRef(true);
  const offsetRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const requestIdRef = useRef(0);
  const expandedIdRef = useRef(expandedId);
  const mainEmojiRef = useRef(null);
  const activeQueryRef = useRef({
    query: "",
    dateQuery: ""
  });

  useEffect(() => {
    expandedIdRef.current = expandedId;
  }, [expandedId]);

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    localStorage.setItem("nhs_theme", theme);
  }, [theme]);

  useEffect(() => {
    const isModalOpen = Boolean(expandedId || readmeOpen || feedbackOpen);
    document.documentElement.classList.toggle("confession-modal-open", isModalOpen);
    document.body.classList.toggle("confession-modal-open", isModalOpen);
    return () => {
      document.documentElement.classList.remove("confession-modal-open");
      document.body.classList.remove("confession-modal-open");
    };
  }, [expandedId, readmeOpen, feedbackOpen]);

  useEffect(() => {
    const handleGlobalKeyDown = (event) => {
      if (event.key === "Escape") {
        if (expandedId) setExpandedId(null);
        if (readmeOpen) setReadmeOpen(false);
        if (feedbackOpen) setFeedbackOpen(false);
        if (mainEmojiOpen) setMainEmojiOpen(false);
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [expandedId, readmeOpen, feedbackOpen, mainEmojiOpen]);

  useEffect(() => {
    if (!mainEmojiOpen) return;
    const handleDocumentClick = (event) => {
      if (mainEmojiRef.current && !mainEmojiRef.current.contains(event.target)) {
        setMainEmojiOpen(false);
      }
    };
    document.addEventListener("mousedown", handleDocumentClick);
    return () => document.removeEventListener("mousedown", handleDocumentClick);
  }, [mainEmojiOpen]);

  useEffect(() => {
    const handleResize = () => setColumns(getColumnCount());
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useLayoutEffect(() => {
    const updateScrollMargin = () => {
      const next = listRef.current?.offsetTop ?? 0;
      setScrollMargin(current => (current === next ? current : next));
    };

    updateScrollMargin();
    window.addEventListener("resize", updateScrollMargin);

    const element = listRef.current;
    const observer = element ? new ResizeObserver(updateScrollMargin) : null;

    if (observer && element) {
      observer.observe(element);
    }

    return () => {
      window.removeEventListener("resize", updateScrollMargin);
      observer?.disconnect();
    };
  }, []);

  const fetchConfessionPage = useCallback(
    async ({ query, dateQuery, offset, limit = PAGE_SIZE }) => {
      if (!query && !dateQuery) {
        const { data, count, error } = await supabase
          .from("confessions")
          .select(
            "uuid, created_at, content, status, likes, comment_count, last_updated",
            { count: "exact" }
          )
          .eq("status", "approved")
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) throw error;

        const total = count || 0;

        const rows = (data || []).map((item, index) =>
          normalizeConfession({
            ...item,
            display_number: total - offset - index
          })
        );

        return { rows, total };
      }

      const { data, error } = await supabase.rpc(
        "search_confessions",
        {
          p_query: query,
          p_date_query: dateQuery,
          p_limit: limit,
          p_offset: offset
        }
      );

      if (error) throw error;

      const total =
        Array.isArray(data) && data.length > 0
          ? Number(data[0].total_count) || 0
          : 0;

      const rows = Array.isArray(data)
        ? data.map(normalizeConfession)
        : [];

      return { rows, total };
    },
    []
  );

  const fetchAnnouncements = useCallback(async () => {
    const { data, error: announcementError } = await supabase
      .from("confessions")
      .select(`
        uuid,
        created_at,
        content,
        status,
        likes,
        comment_count,
        last_updated
      `)
      .eq("status", "important")
      .order("created_at", { ascending: false });

    if (announcementError) throw announcementError;

    return Array.isArray(data) ? data.map(normalizeAnnouncement) : [];
  }, []);

  const reloadList = useCallback(
    async (query, dateQuery) => {
      const requestId = ++requestIdRef.current;

      activeQueryRef.current = {
        query,
        dateQuery
      };

      offsetRef.current = 0;
      setInitialLoading(true);
      setLoadError("");

      const announcementPromise = fetchAnnouncements().catch(error => {
        console.error("Announcement load error:", error);
        return null;
      });

      try {
        const confessionPage = await fetchConfessionPage({
          query,
          dateQuery,
          offset: 0,
          limit: PAGE_SIZE
        });

        if (requestId !== requestIdRef.current) return;

        setConfessions(confessionPage.rows);
        setTotalCount(confessionPage.total);
        offsetRef.current = confessionPage.rows.length;
        setHasMore(offsetRef.current < confessionPage.total);
        setInitialLoading(false);

        const announcementRows = await announcementPromise;

        if (requestId !== requestIdRef.current) return;
        if (announcementRows) {
          setAnnouncements(announcementRows);
        }
      } catch (error) {
        console.error("Supabase load error:", error);

        if (requestId === requestIdRef.current) {
          setLoadError(
            "Không thể tải dữ liệu. Vui lòng thử lại sau."
          );
          setInitialLoading(false);
        }
      }
    },
    [fetchConfessionPage, fetchAnnouncements]
  );

  useEffect(() => {
    const query = normalizeQuery(search);
    const dateQuery = normalizeQuery(dateSearch);

    if (firstLoadRef.current) {
      firstLoadRef.current = false;
      reloadList(query, dateQuery);
      return;
    }

    const timer = setTimeout(() => {
      reloadList(query, dateQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [
    search,
    dateSearch,
    reloadList
  ]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMore) return;

    loadingMoreRef.current = true;
    setLoadingMore(true);

    const requestId = requestIdRef.current;
    const { query, dateQuery } = activeQueryRef.current;
    const offset = offsetRef.current;

    try {
      const page = await fetchConfessionPage({
        query,
        dateQuery,
        offset,
        limit: PAGE_SIZE
      });

      if (requestId !== requestIdRef.current) return;

      setConfessions(current => {
        const existing = new Set(
          current.map(item => String(item.uuid))
        );

        const newRows = page.rows.filter(
          item => !existing.has(String(item.uuid))
        );

        return [...current, ...newRows];
      });

      offsetRef.current = offset + page.rows.length;
      setTotalCount(page.total);
      setHasMore(offsetRef.current < page.total);
    } catch (loadMoreError) {
      console.error("Load more error:", loadMoreError);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [hasMore, fetchConfessionPage]);

  const refreshLoaded = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const { query, dateQuery } = activeQueryRef.current;
    const currentlyLoaded = Math.max(PAGE_SIZE, offsetRef.current);

    try {
      const [confessionPage, announcementRows] = await Promise.all([
        fetchConfessionPage({
          query,
          dateQuery,
          offset: 0,
          limit: currentlyLoaded
        }),
        fetchAnnouncements()
      ]);

      if (requestId !== requestIdRef.current) return;

      setConfessions(current => {
        const previousById = new Map(
          current.map(item => [String(item.uuid), item])
        );

        return confessionPage.rows.map(row => {
          const previous = previousById.get(String(row.uuid));

          return previous ? {
            ...row,
            comments: previous.comments
          } : row;
        });
      });
      setAnnouncements(announcementRows);
      setTotalCount(confessionPage.total);

      offsetRef.current = confessionPage.rows.length;
      setHasMore(offsetRef.current < confessionPage.total);
    } catch (refreshError) {
      console.error("Refresh error:", refreshError);
    }
  }, [fetchConfessionPage, fetchAnnouncements]);

  useEffect(() => {
    let cancelled = false;
    let timer = null;

    const poll = async () => {
      if (cancelled) return;
      await refreshLoaded();
      if (!cancelled) {
        timer = setTimeout(poll, 15000);
      }
    };

    timer = setTimeout(poll, 15000);

    const visibilityHandler = () => {
      if (!document.hidden) {
        refreshLoaded();
      }
    };

    document.addEventListener("visibilitychange", visibilityHandler);

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
      document.removeEventListener("visibilitychange", visibilityHandler);
    };
  }, [refreshLoaded]);

  const fetchComments = useCallback(async uuid => {
    try {
      const { data, error: commentsError } = await supabase
        .from("comments")
        .select("id, content, gif_id, created_at")
        .eq("uuid", uuid)
        .order("created_at", { ascending: true });

      if (commentsError) throw commentsError;

      const comments = Array.isArray(data) ? data.map(comment => ({
        id: comment.id,
        content: comment.content || "",
        gif_id: comment.gif_id || null,
        time: comment.created_at
      })) : [];

      setConfessions(items =>
        items.map(item => String(item.uuid) === String(uuid) ? {
          ...item,
          comments,
          commentCount: comments.length
        } : item)
      );
    } catch (commentsError) {
      console.error("Comments request failed:", commentsError);
      throw commentsError;
    }
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("public-confessions")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "confessions"
        },
        () => {
          refreshLoaded().catch(error => {
            console.error("Realtime confession refresh error:", error);
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "comments"
        },
        (payload) => {
          if (
            expandedIdRef.current &&
            payload?.new?.uuid &&
            String(payload.new.uuid) === String(expandedIdRef.current)
          ) {
            fetchComments(expandedIdRef.current).catch(console.error);
          }
          refreshLoaded().catch(error => {
            console.error("Realtime comment refresh error:", error);
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [refreshLoaded, fetchComments]);

  const like = useCallback(
    async uuid => {
      const id = String(uuid);

      if (liked.includes(id)) return;

      const nextLiked = [...liked, id];

      setLiked(nextLiked);
      localStorage.setItem(LIKED_KEY, JSON.stringify(nextLiked));

      setConfessions(items =>
        items.map(item => String(item.uuid) === id ? {
          ...item,
          likes: (item.likes || 0) + 1
        } : item)
      );

      setAnnouncements(items =>
        items.map(item => String(item.uuid) === id ? {
          ...item,
          likes: (item.likes || 0) + 1
        } : item)
      );

      try {
        const { data, error: likeError } = await supabase.rpc("like_confession", { p_uuid: id });

        if (likeError) throw likeError;

        if (data && typeof data.likes === "number") {
          setConfessions(items =>
            items.map(item => String(item.uuid) === id ? {
              ...item,
              likes: data.likes
            } : item)
          );

          setAnnouncements(items =>
            items.map(item => String(item.uuid) === id ? { ...item, likes: data.likes } : item)
          );
        }
      } catch (likeError) {
        console.error("Lỗi cập nhật lượt thích:", likeError);

        setLiked(current => {
          const reverted = current.filter(value => value !== id);
          localStorage.setItem(LIKED_KEY, JSON.stringify(reverted));
          return reverted;
        });

        setConfessions(items =>
          items.map(item => String(item.uuid) === id ? {
            ...item,
            likes: Math.max(0, (item.likes || 1) - 1)
          } : item)
        );

        setAnnouncements(items =>
          items.map(item => String(item.uuid) === id ? {
            ...item,
            likes: Math.max(0, (item.likes || 1) - 1)
          } : item)
        );
      }
    },
    [liked]
  );

  const addComment = useCallback(
    async (uuid, { text, gifId } = {}) => {
      const value = String(text || "").trim();
      const selectedGifId = String(gifId || "").trim();

      if (Boolean(value) === Boolean(selectedGifId)) return false;

      try {
        const { data, error: commentError } = await supabase.rpc("add_comment", {
          p_uuid: uuid,
          p_content: selectedGifId ? "" : value,
          p_gif_id: selectedGifId || null
        });

        if (commentError) throw commentError;

        if (data?.status !== "success") {
          throw new Error(data?.message || "Comment rejected");
        }

        await fetchComments(uuid);
        return true;
      } catch (commentError) {
        console.error("Comment submit error:", commentError);
        alert("Không thể gửi bình luận. Vui lòng thử lại sau.");
        return false;
      }
    },
    [fetchComments]
  );

  const virtualRows = useMemo(() => {
    const rows = [];
    let currentDate = null;
    let currentGroup = null;

    for (const item of confessions) {
      const date =
        item.dateLabel ||
        (item.time ? formatDate(item.time) : "Khác");

      if (date !== currentDate) {
        currentDate = date;
        currentGroup = {
          type: "date",
          key: `date:${date}`,
          date,
          items: []
        };
        rows.push(currentGroup);
      }

      currentGroup.items.push(item);
    }

    if (hasMore) {
      rows.push({
        type: "loader",
        key: "loader"
      });
    }

    return rows;
  }, [confessions, hasMore]);

  const virtualizer = useWindowVirtualizer({
    count: virtualRows.length,
    estimateSize: index => {
      const row = virtualRows[index];

      if (row?.type === "loader") {
        return 64;
      }

      if (row?.type === "date") {
        const cardHeight = columns === 1 ? 250 : 240;
        const gap = 16;
        const rows = Math.ceil(row.items.length / columns);

        return (
          20 +
          42 +
          rows * cardHeight +
          Math.max(0, rows - 1) * gap +
          20
        );
      }

      return 250;
    },
    overscan: 5,
    scrollMargin,
    getItemKey: index => virtualRows[index]?.key ?? index
  });

  const virtualItems = virtualizer.getVirtualItems();

  useEffect(() => {
    const last = virtualItems[virtualItems.length - 1];

    if (!last) return;

    if (last.index >= virtualRows.length - 3 && hasMore && !loadingMore) {
      loadMore();
    }
  }, [
    virtualItems,
    virtualRows.length,
    hasMore,
    loadingMore,
    loadMore
  ]);

  const submitConfession = async event => {
    event.preventDefault();

    const value = content.trim();

    if (!value) {
      setFormError("Vui lòng nhập nội dung confession trước khi gửi.");
      return;
    }

    if (value.length > MAX_LENGTH) {
      setFormError(`Nội dung quá dài, giới hạn tối đa là ${MAX_LENGTH} ký tự.`);
      return;
    }

    setSubmitting(true);
    setFormError("");

    try {
      const { error: submitError } = await supabase.from("confessions").insert({
        content: value,
        status: "pending"
      });

      if (submitError) {
        throw submitError;
      }

      alert("Gửi bài thành công! Bài viết của bạn sẽ được hiển thị sau khi admin kiểm duyệt.");

      setContent("");
      setMainEmojiOpen(false);
    } catch (submitError) {
      console.error("Lỗi gửi confession:", submitError);
      alert("Đã xảy ra lỗi kết nối trong quá trình gửi. Vui lòng kiểm tra lại mạng hoặc thử lại sau!");
    } finally {
      setSubmitting(false);
    }
  };

  const submitFeedback = async event => {
    event.preventDefault();

    const value = feedback.trim();

    if (!value) {
      setFeedbackError("Vui lòng nhập nội dung góp ý.");
      return;
    }

    if (value.length > MAX_LENGTH) {
      setFeedbackError(`Nội dung quá dài, giới hạn tối đa là ${MAX_LENGTH} ký tự.`);
      return;
    }

    setFeedbackLoading(true);
    setFeedbackError("");

    try {
      const { error: feedbackSubmitError } =
        await supabase.from("feedback").insert({ content: value });

      if (feedbackSubmitError) {
        throw feedbackSubmitError;
      }

      setFeedback("");
      setFeedbackError("");
      setFeedbackOpen(false);

      alert("Cảm ơn bạn! Góp ý đã được gửi thành công.");
    } catch (feedbackSubmitError) {
      console.error("Lỗi gửi góp ý:", feedbackSubmitError);
      setFeedbackError("Không thể gửi góp ý. Vui lòng thử lại sau.");
    } finally {
      setFeedbackLoading(false);
    }
  };

  const expandedConfession = useMemo(() => {
    if (!expandedId) return null;
    return (
      confessions.find(item => String(item.uuid) === expandedId) ||
      announcements.find(item => String(item.uuid) === expandedId) ||
      null
    );
  }, [expandedId, confessions, announcements]);

  return (
    <>
      <div className="app_container">
        <header className="hero_section">
          <button
            id="readme_toggle_btn"
            title="Hướng dẫn sử dụng / README"
            aria-label="Hướng dẫn sử dụng và giới thiệu"
            onClick={() => setReadmeOpen(true)}
          >
            <i className="fa-solid fa-book-open" />
            <span>README</span>
          </button>

          <button
            id="theme_toggle_btn"
            title="Chuyển đổi giao diện"
            aria-label={theme === "dark" ? "Chuyển sang chế độ sáng" : "Chuyển sang chế độ tối"}
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            <i className={`fa-solid fa-${theme === "dark" ? "sun" : "moon"}`} />
            <span className="theme_text">
              {theme === "dark" ? "Chế độ sáng" : "Chế độ tối"}
            </span>
          </button>

          <div id="picture">
            <img src={incognitoLogo} alt="incognito logo" />
          </div>

          <div className="header_titles">
            <h1>NHSC Confessions</h1>
          </div>

          <div id="chu_thich">
            <span>
              Nơi chia sẻ ẩn danh tâm tư, kỷ niệm học đường một cách tự do và có chừng mực.
            </span>
          </div>


          {/* contact */}
          <a
            className="contact_us_btn"
            href="https://mail.google.com/mail/?view=cm&fs=1&to=cfs.workcontact@gmail.com"
            target="_blank"
            rel="noopener noreferrer"
            title="cfs.workcontact@gmail.com"
          >
            <i className="fa-regular fa-envelope" aria-hidden="true" />
            <span>Contact us</span>
            <i className="fa-solid fa-arrow-right contact_arrow" aria-hidden="true" />
          </a>
        </header>

        <Announcements
          announcements={announcements}
          liked={liked}
          onOpen={setExpandedId}
          onLike={like}
        />

        <section className="card_wrapper">
          <div id="send_confession">
            <h3>
              <i className="fa-solid fa-paper-plane" />{" "}
              Gửi Confession
            </h3>
          </div>

          <form
            id="confession_form"
            autoComplete="off"
            onSubmit={submitConfession}
          >
            <div className="input_group">
              <div className="textarea_wrapper" ref={mainEmojiRef}>
                <textarea
                  id="confession_input"
                  rows="2"
                  maxLength={MAX_LENGTH}
                  placeholder="Bạn có tâm sự gì?"
                  value={content}
                  disabled={submitting}
                  onChange={event => {
                    setContent(event.target.value);
                    setFormError("");
                  }}
                />

                <button
                  type="button"
                  className="emoji_toggle_btn inside_input"
                  title="Chọn biểu cảm"
                  aria-label="Chọn biểu cảm"
                  disabled={submitting}
                  onClick={() => setMainEmojiOpen(value => !value)}
                >
                  <i className="fa-regular fa-face-smile" />
                </button>

                {mainEmojiOpen && (
                  <div className="emoji_picker_container main_emoji_popup visible">
                    <EmojiPicker
                      onSelect={emoji => {
                        setContent(value => `${value}${emoji}`);
                        setMainEmojiOpen(false);
                      }}
                    />
                  </div>
                )}
              </div>

              <button type="submit" disabled={submitting}>
                <span>
                  {submitting ? "Đang gửi..." : "Gửi bài"}
                </span>
                <i className={`fa-solid fa-${submitting ? "spinner fa-spin" : "arrow-up-from-bracket"}`} />
              </button>
            </div>
          </form>

          <p id="form_error">
            {formError}
          </p>
        </section>

        <section id="search_container">
          <div className="search_box">
            <i className="fa-solid fa-hashtag search_icon" />
            <input
              id="search_input"
              type="text"
              placeholder="Tìm kiếm theo mã ID (Ví dụ: #001, #002...)"
              aria-label="Tìm kiếm theo mã ID"
              autoComplete="off"
              value={search}
              onChange={event => setSearch(event.target.value)}
            />
          </div>

          <div className="search_box">
            <i className="fa-regular fa-calendar-days search_icon" />
            <input
              id="search_date_input"
              type="text"
              placeholder="Tìm kiếm theo ngày (Ví dụ: #20/08/2026)"
              aria-label="Tìm kiếm theo ngày"
              autoComplete="off"
              value={dateSearch}
              onChange={event => setDateSearch(event.target.value)}
            />
          </div>
        </section>

        <main id="confession_list" ref={listRef}>
          {initialLoading ? (
            <p style={{
              textAlign: "center",
              color: "var(--text-muted)",
              padding: 20
            }}>
              Đang tải...
            </p>
          ) : loadError ? (
            <p style={{
              textAlign: "center",
              color: "var(--text-muted)",
              padding: 20
            }}>
              {loadError}
            </p>
          ) : confessions.length === 0 ? (
            <p style={{
              textAlign: "center",
              color: "var(--text-muted)",
              padding: 20
            }}>
              {search.trim() || dateSearch.trim()
                ? "Không tìm thấy bài viết phù hợp với điều kiện tìm kiếm."
                : "Chưa có bài viết nào được phê duyệt."}
            </p>
          ) : (
            <>
              <div style={{
                position: "relative",
                width: "100%",
                height: `${virtualizer.getTotalSize()}px`
              }}>
                {virtualItems.map(
                  virtualItem => {
                    const row = virtualRows[virtualItem.index];

                    if (!row) return null;

                    return (
                      <div
                        key={virtualItem.key}
                        data-index={virtualItem.index}
                        ref={virtualizer.measureElement}
                        style={{
                          position: "absolute",
                          top:
                            virtualItem.start -
                            virtualizer.options.scrollMargin,
                          left: 0,
                          width: "100%",
                          paddingBottom: 22
                        }}
                      >
                        {row.type === "date" && (
                          <div className="date_block">
                            <div className="date_block_header">
                              <span>📅 Ngày {row.date}</span>
                            </div>

                            <div
                              className="date_block_grid"
                              style={{
                                gridTemplateColumns:
                                  `repeat(${columns}, minmax(0, 1fr))`
                              }}
                            >
                              {row.items.map(item => (
                                <ConfessionCard
                                  key={item.uuid}
                                  confession={item}
                                  liked={liked.includes(
                                    String(item.uuid)
                                  )}
                                  onOpen={setExpandedId}
                                  onLike={like}
                                />
                              ))}
                            </div>
                          </div>
                        )}

                        {row.type === "loader" && (
                          <div
                            style={{
                              minHeight: 48,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "var(--text-muted)",
                              fontSize: "0.85rem"
                            }}
                          >
                            {loadingMore ? "Đang tải thêm..." : ""}
                          </div>
                        )}
                      </div>
                    );
                  }
                )}
              </div>

              <div
                aria-hidden="true"
                style={{
                  textAlign: "center",
                  color: "var(--text-muted)",
                  fontSize: "0.78rem",
                  marginTop: 8
                }}
              >
                {totalCount > 0
                  ? `${confessions.length.toLocaleString("vi-VN")} / ${totalCount.toLocaleString("vi-VN")} confession(s)`
                  : ""}
              </div>
            </>
          )}
        </main>
      </div>

      <div
        id="confession_backdrop"
        className={expandedConfession ? "active" : ""}
        onClick={() => setExpandedId(null)}
        onWheel={(e) => e.preventDefault()}
        onTouchMove={(e) => e.preventDefault()}
      />

      {expandedConfession && (
        <ConfessionModal
          confession={expandedConfession}
          liked={liked.includes(String(expandedConfession.uuid))}
          onClose={() => setExpandedId(null)}
          onLike={like}
          onComment={addComment}
          fetchComments={fetchComments}
        />
      )}

      <Modal
        open={readmeOpen}
        onClose={() => setReadmeOpen(false)}
      >
        <button
          type="button"
          className="close_readme_btn"
          title="Đóng bảng hướng dẫn"
          aria-label="Đóng bảng hướng dẫn"
          onClick={() => setReadmeOpen(false)}
        >
          <i className="fa-solid fa-xmark" />
        </button>

        <h2>
          <i
            className="fa-solid fa-book-open"
            style={{ color: "var(--accent-color)" }}
          />{" "}
          Hướng dẫn sử dụng & Giới thiệu
        </h2>

        <div
          className="readme_body"
          dangerouslySetInnerHTML={{
            __html: readmeMarkdownParser.render(readmeMarkdownContent)
          }}
        />

        <button
          type="button"
          className="feedback_toggle_btn"
          onClick={() => {
            setReadmeOpen(false);
            setFeedbackOpen(true);
          }}
        >
          <i className="fa-solid fa-comment-dots" />{" "}
          Gửi góp ý
        </button>
      </Modal>

      <Modal
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        className="feedback_modal_content"
      >
        <button
          type="button"
          className="close_readme_btn"
          title="Đóng bảng góp ý"
          aria-label="Đóng bảng góp ý"
          onClick={() => setFeedbackOpen(false)}
        >
          <i className="fa-solid fa-xmark" />
        </button>

        <h2>
          <i
            className="fa-solid fa-comment-dots"
            style={{
              color: "var(--accent-color)"
            }}
          />{" "}
          Gửi góp ý
        </h2>

        <form
          className="feedback_form"
          autoComplete="off"
          onSubmit={submitFeedback}
        >
          <label htmlFor="feedback_input">
            Chia sẻ góp ý của bạn
          </label>

          <textarea
            id="feedback_input"
            rows="5"
            maxLength={MAX_LENGTH}
            placeholder="Nhập góp ý hoặc đề xuất của bạn..."
            value={feedback}
            onChange={event => {
              setFeedback(event.target.value);
              setFeedbackError("");
            }}
          />

          <p id="feedback_error">
            {feedbackError}
          </p>

          <button
            type="submit"
            id="feedback_submit_btn"
            disabled={feedbackLoading}
          >
            {feedbackLoading ? (
              <>
                <i className="fa-solid fa-spinner fa-spin" />{" "}
                Đang gửi...
              </>
            ) : (
              <>
                <span>Gửi</span>
                <i className="fa-solid fa-paper-plane" />
              </>
            )}
          </button>
        </form>
      </Modal>
    </>
  );
}
