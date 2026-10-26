import { useState } from 'react';
import { store } from '../core/store';

interface ResetConfirmModalProps {
  onClose: () => void;
  onSuccess?: () => void;
}

export default function ResetConfirmModal({ onClose, onSuccess }: ResetConfirmModalProps) {
  const [deleteMedia, setDeleteMedia] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirmReset = async () => {
    setLoading(true);
    setError(null);
    try {
      if (window.studioAPI?.resetDatabase) {
        const res = await window.studioAPI.resetDatabase({ keepMedia: !deleteMedia });
        if (res.success) {
          store.clearAll();
          await store.refreshData();
          if (onSuccess) onSuccess();
          onClose();
        } else {
          setError(res.error || 'Có lỗi xảy ra khi reset hệ thống.');
        }
      } else {
        setError('Không tìm thấy API studioAPI.resetDatabase.');
      }
    } catch (err: any) {
      setError(err?.message || 'Lỗi không xác định khi reset.');
    } finally {
      setLoading(false);
    }
  };

  const handleStopOnly = async () => {
    setLoading(true);
    setError(null);
    try {
      if (window.studioAPI?.stopAllAgents) {
        await window.studioAPI.stopAllAgents();
        await store.refreshData();
        onClose();
      }
    } catch (err: any) {
      setError(err?.message || 'Lỗi khi dừng agents.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card"
        style={{
          maxWidth: 560,
          border: '1px solid rgba(239, 68, 68, 0.4)',
          boxShadow: '0 20px 50px rgba(239, 68, 68, 0.2), 0 0 0 1px rgba(239, 68, 68, 0.25)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header" style={{ borderBottomColor: 'rgba(239, 68, 68, 0.25)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22,
              }}
            >
              🛑
            </div>
            <div>
              <h2 style={{ color: '#f87171', fontSize: 18, margin: 0 }}>
                Dừng Agent & Reset Database
              </h2>
              <p className="modal-subtitle" style={{ margin: '4px 0 0 0' }}>
                Xoá trắng dữ liệu để khởi động lại quy trình sản xuất từ đầu
              </p>
            </div>
          </div>
          <button className="btn-close" onClick={onClose} disabled={loading}>✕</button>
        </div>

        <div className="modal-body" style={{ padding: '20px 0' }}>
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              borderRadius: 10,
              padding: '14px 16px',
              marginBottom: 18,
            }}
          >
            <div style={{ fontWeight: 600, color: '#fca5a5', marginBottom: 8, fontSize: 14 }}>
              ⚠️ Những tác vụ sẽ được thực hiện:
            </div>
            <ul style={{ margin: 0, paddingLeft: 20, color: '#e2e8f0', fontSize: 13, lineHeight: '1.6' }}>
              <li>
                <b>Dừng khẩn cấp:</b> Ngắt toàn bộ tiến trình AI ngầm (Writer, Critic, Voice, Remotion, Publisher).
              </li>
              <li>
                <b>Giải phóng lock:</b> Huỷ bỏ tất cả các file khoá tiến trình trong <code>data/locks</code>.
              </li>
              <li>
                <b>Xoá sạch Database:</b> Xoá toàn bộ hàng đợi video, bài viết, ý tưởng và dòng nhật ký trong SQLite.
              </li>
              <li>
                <b>Khởi tạo DB trắng:</b> Tự động tạo lại bảng rỗng theo cấu trúc chuẩn, đưa hệ thống về số 0.
              </li>
            </ul>
          </div>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 14px',
              borderRadius: 8,
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              cursor: 'pointer',
              userSelect: 'none',
              fontSize: 13,
              color: '#f1f5f9',
            }}
          >
            <input
              type="checkbox"
              checked={deleteMedia}
              onChange={(e) => setDeleteMedia(e.target.checked)}
              disabled={loading}
              style={{ width: 16, height: 16, accentColor: '#ef4444', cursor: 'pointer' }}
            />
            <span>
              Xoá sạch cả thư mục video và âm thanh đã kết xuất (<code>data/media/</code>)
            </span>
          </label>

          {error && (
            <div
              style={{
                marginTop: 14,
                padding: '10px 14px',
                borderRadius: 8,
                background: 'rgba(239, 68, 68, 0.2)',
                border: '1px solid #ef4444',
                color: '#fca5a5',
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}
        </div>

        <div
          className="modal-footer"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: 16,
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleStopOnly}
            disabled={loading}
            title="Chỉ dừng các Agent đang chạy ngầm, giữ nguyên dữ liệu Database"
          >
            ⏹ Chỉ Dừng Agent
          </button>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={loading}
            >
              Huỷ Bỏ
            </button>
            <button
              type="button"
              className="btn"
              onClick={handleConfirmReset}
              disabled={loading}
              style={{
                background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
                color: '#fff',
                borderColor: '#ef4444',
                boxShadow: '0 0 20px rgba(239, 68, 68, 0.4)',
                fontWeight: 600,
              }}
            >
              {loading ? 'Đang Dừng & Xoá...' : '🗑️ Xác Nhận Xoá & Bắt Đầu Lại'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
