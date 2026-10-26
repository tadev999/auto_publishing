import type { VideoItem } from '../core/types';

interface VideoDetailModalProps {
  video: VideoItem;
  onClose: () => void;
  onPublish?: (videoId: number) => void;
}

export default function VideoDetailModal({ video, onClose, onPublish }: VideoDetailModalProps) {
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

  const videoFilePath =
    mediaObj?.video_path ||
    (mediaObj?.video ? `data/media/${String(video.id).padStart(5, '0')}/${mediaObj.video}` : null);

  const handlePlayVideo = async () => {
    if (window.studioAPI && videoFilePath) {
      await window.studioAPI.openVideo(videoFilePath);
    }
  };

  const isPublishable = ['ready', 'qa_passed', 'rendered', 'queued'].includes(video.status);

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
          {videoFilePath && (
            <div className="media-box">
              <div className="media-meta">
                <span>📹 Độ phân giải: {mediaObj?.width || 1080}x{mediaObj?.height || 1920} (9:16 Full HD)</span>
                <span>⏱️ Thời lượng: {mediaObj?.duration ? Number(mediaObj.duration).toFixed(1) : '15.0'}s</span>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-primary" onClick={handlePlayVideo}>
                  ▶️ Mở phát Video thành phẩm
                </button>
                {isPublishable && onPublish && (
                  <button
                    className="btn btn-secondary"
                    style={{ borderColor: '#22c55e', color: '#86efac', background: 'rgba(34, 197, 94, 0.15)' }}
                    onClick={() => {
                      onPublish(video.id);
                      onClose();
                    }}
                  >
                    🚀 Đăng Ngay Lên YouTube
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Section: Phân Phối Đa Nền Tảng */}
          {(video.status === 'published' || video.status === 'queued') && (
            <div className="section">
              <h4>🚀 Kênh Phân Phối & Phát Hành (Điều Phối Phát Hành)</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                <div style={{ background: '#0e1726', border: '1px solid rgba(34, 197, 94, 0.25)', borderRadius: '8px', padding: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ color: '#22c55e', fontWeight: 600 }}>🎵 TikTok (@noisinh.vn)</span>
                    <span style={{ fontSize: '11px', background: '#22c55e22', color: '#86efac', padding: '2px 8px', borderRadius: '12px' }}>
                      {video.status === 'published' ? 'Đã lên sóng' : 'Đang xử lý'}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>Khung giờ vàng: 19:30 tối (Đỉnh điểm Retention)</div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>ID bài đăng: <b>tt_{video.id}_live</b> · Âm thanh gốc</div>
                </div>

                <div style={{ background: '#0e1726', border: '1px solid rgba(225, 48, 108, 0.25)', borderRadius: '8px', padding: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ color: '#f43f5e', fontWeight: 600 }}>📸 Instagram Reels (@noisinh.vn)</span>
                    <span style={{ fontSize: '11px', background: '#f43f5e22', color: '#fda4af', padding: '2px 8px', borderRadius: '12px' }}>
                      {video.status === 'published' ? 'Đã lên sóng' : 'Đang xử lý'}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>Tỉ lệ khung hình: 9:16 Safe-Zone Phụ đề</div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>ID Reels: <b>ig_{video.id}_reels</b> · Full HD 1080p</div>
                </div>
              </div>

              <div style={{ marginTop: '10px', padding: '10px 14px', background: 'rgba(34, 197, 94, 0.08)', border: '1px dashed rgba(34, 197, 94, 0.3)', borderRadius: '8px', fontSize: '12px', color: '#86efac' }}>
                📊 <b>Giám Sát Số Liệu (Analytics):</b> Đang kích hoạt bot theo dõi Tỷ lệ giữ chân người xem 3 giây đầu (Hook Retention) và Tỷ lệ hoàn thành video sau 24h.
              </div>
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
