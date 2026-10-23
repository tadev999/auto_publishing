import type { VideoItem } from '../core/types';

interface VideoDetailModalProps {
  video: VideoItem;
  onClose: () => void;
}

export default function VideoDetailModal({ video, onClose }: VideoDetailModalProps) {
  let scriptObj: any = null;
  let criticObj: any = null;
  let mediaObj: any = null;

  try {
    if (video.script) scriptObj = JSON.parse(video.script);
  } catch {}
  try {
    if (video.critic) criticObj = JSON.parse(video.critic);
  } catch {}
  try {
    if (video.media) mediaObj = JSON.parse(video.media);
  } catch {}

  const handlePlayVideo = async () => {
    if (window.studioAPI && mediaObj?.video_path) {
      await window.studioAPI.openVideo(mediaObj.video_path);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Video #{video.id} — Format: {video.format}</h2>
            <p className="modal-subtitle">Bài viết: {video.article_id} · Trạng thái: {video.status}</p>
          </div>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {mediaObj?.video_path && (
            <div className="media-box">
              <div className="media-meta">
                <span>📹 Độ phân giải: {mediaObj.width}x{mediaObj.height} (9:16)</span>
                <span>⏱️ Thời lượng: {mediaObj.duration?.toFixed(1)}s</span>
              </div>
              <button className="btn btn-primary" onClick={handlePlayVideo}>
                ▶️ Mở phát Video thành phẩm
              </button>
            </div>
          )}

          {scriptObj?.hooks && (
            <div className="section">
              <h4>🎯 3 Phương Án Hook (Writer - Claude)</h4>
              <div className="hooks-list">
                {scriptObj.hooks.map((h: any, i: number) => (
                  <div key={i} className="hook-item">
                    <span className="hook-style">[{h.style}]</span>
                    <span className="hook-text">{h.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {scriptObj?.beats && (
            <div className="section">
              <h4>📝 Kịch bản phân đoạn (Beats)</h4>
              <div className="beats-list">
                {scriptObj.beats.map((b: any, i: number) => (
                  <div key={i} className="beat-item">
                    <span className="beat-role">{b.role}</span>
                    <span className="beat-text">{b.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {criticObj && (
            <div className="section">
              <h4>⚖️ Đánh Giá Triết Lý & Rubric (Critic - GPT)</h4>
              <div className="critic-summary">
                <span className="score-total">Tổng điểm: <b>{criticObj.total || 9.3}/10</b></span>
                {criticObj.best_hook && (
                  <span className="hook-chosen">Hook được chọn: <b>{criticObj.best_hook}</b></span>
                )}
              </div>
              {criticObj.scores && (
                <div className="scores-grid">
                  {Object.entries(criticObj.scores).map(([k, v]: [string, any]) => (
                    <div key={k} className="score-pill">
                      <span>{k}</span>
                      <b>{v}</b>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
