import { useEffect, useRef, useState } from "react";
import ConfessionCard from "./ConfessionCard";

export default function Announcements({
  announcements,
  liked,
  onOpen,
  onLike
}) {
  const [collapsed, setCollapsed] = useState(false);
  const trackRef = useRef(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const updateArrows = () => {
    const track = trackRef.current;
    if (!track) return;
    setAtStart(track.scrollLeft <= 4);
    setAtEnd(Math.ceil(track.scrollLeft + track.clientWidth) >= track.scrollWidth - 4);
  };

  const scrollOneCard = (direction) => {
    const track = trackRef.current;
    if (!track) return;
    const firstCard = track.querySelector(".announcement_box");
    const step = firstCard ? firstCard.getBoundingClientRect().width + 16 : 296;
    track.scrollBy({ left: direction * step, behavior: "smooth" });
  };

  useEffect(() => {
    updateArrows();
    const track = trackRef.current;
    const observer = track ? new ResizeObserver(updateArrows) : null;
    if (track && observer) observer.observe(track);
    return () => observer?.disconnect();
  }, [announcements.length]);

  if (!announcements.length) return null;

  return (
    <section id="announcement_container">
      <div className="announcement_accordion">
        <button
          type="button"
          className={`announcement_toggle_btn${!collapsed ? " active" : ""}`}
          onClick={() => setCollapsed((value) => !value)}
        >
          <span>🚨 QUAN TRỌNG ({announcements.length})</span>
          <i className="fa-solid fa-chevron-down toggle_icon" />
        </button>

        <div className={`announcement_wrapper${collapsed ? " collapsed" : ""}`}>
          <button
            type="button"
            className={`carousel_btn prev_btn${atStart ? " hidden" : ""}`}
            title="Trước"
            aria-label="Thông báo trước"
            onClick={() => scrollOneCard(-1)}
          >
            <i className="fa-solid fa-chevron-left" />
          </button>

          <div
            className="announcement_carousel_track"
            ref={trackRef}
            onScroll={updateArrows}
          >
            {announcements.map((item) => (
              <ConfessionCard
                key={item.uuid}
                confession={item}
                isAnnouncement={true}
                liked={liked.includes(String(item.uuid))}
                onOpen={onOpen}
                onLike={onLike}
              />
            ))}
          </div>

          <button
            type="button"
            className={`carousel_btn next_btn${atEnd ? " hidden" : ""}`}
            title="Sau"
            aria-label="Thông báo sau"
            onClick={() => scrollOneCard(1)}
          >
            <i className="fa-solid fa-chevron-right" />
          </button>
        </div>
      </div>
    </section>
  );
}
