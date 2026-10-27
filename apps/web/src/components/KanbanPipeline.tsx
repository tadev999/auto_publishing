import { store } from '../core/store';
import type { VideoItem } from '../core/types';

interface KanbanPipelineProps {
  videos: VideoItem[];
  onSelectVideo: (video: VideoItem) => void;
  onClose?: () => void;
}

export default function KanbanPipeline({ videos, onSelectVideo, onClose }: KanbanPipelineProps) {
  const getFormatBadge = (fmt: string) => {
    switch (fmt) {
      case 'goi-ten':
        return { label: 'Gọi tên', color: 'var(--accent-cyan)' };
      case 'cau-hoi':
        return { label: 'Câu hỏi', color: 'var(--accent-blue)' };
      case 'ngo-nhan':
        return { label: 'Ngộ nhận', color: 'var(--accent-purple)' };
      case 'thuc-hanh':
        return { label: 'Thực hành', color: 'var(--accent-green)' };
      case 'doc-cham':
        return { label: 'Đọc chậm', color: 'var(--accent-yellow)' };
      default:
        return { label: fmt, color: 'var(--text-muted)' };
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'planned':
        return { label: 'Lên lịch', cls: 'badge-blue' };
      case 'scripted':
        return { label: 'Đã viết kịch bản', cls: 'badge-cyan' };
      case 'approved':
        return { label: 'Đã duyệt', cls: 'badge-purple' };
      case 'rendered':
      case 'qa_passed':
        return { label: 'Đã dựng & QA', cls: 'badge-green' };
      case 'published':
        return { label: 'Đã xuất bản', cls: 'badge-published' };
      default:
        return { label: status, cls: 'badge-gray' };
    }
  };

  const formatDate = (iso: string) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('vi-VN', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="pipeline-panel">
      <div className="panel-header">
        <div className="panel-header-left">
          <h3>HÀNG ĐỢI XUẤT BẢN ({videos.length})</h3>
          <span className="subtitle">Video ngắn chuẩn 9:16 cho Reels & TikTok</span>
        </div>
        {onClose && (
          <button className="btn-close-drawer" onClick={onClose} title="Thu gọn hàng đợi">
            ✕ Thu gọn
          </button>
        )}
      </div>

      <div className="video-list">
        {videos.length === 0 ? (
          <div className="empty-state">
            <span>Chưa có video nào trong lịch. Bấm <b>"Lên lịch"</b> hoặc <b>"Chạy Demo"</b> để tạo hàng đợi.</span>
          </div>
        ) : (
          videos.map((v) => {
            const fmt = getFormatBadge(v.format);
            const st = getStatusBadge(v.status);
            return (
              <div
                key={v.id}
                className="video-card"
                onClick={() => onSelectVideo(v)}
              >
                <div className="card-top">
                  <span className="video-num">#{v.id}</span>
                  <span className="badge-format" style={{ backgroundColor: `color-mix(in srgb, ${fmt.color} 14%, transparent)`, color: fmt.color }}>
                    {fmt.label} #{v.episode}
                  </span>
                  <span className={`badge-status ${st.cls}`}>{st.label}</span>
                </div>

                <div className="card-title">
                  <b>{v.article_id}</b> · {formatDate(v.slot_at)}
                </div>

                {v.media && (
                  <div className="media-indicator">
                    <span>🎬 Có file video MP4 sẵn sàng</span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
