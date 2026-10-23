import { useEffect, useState } from 'react';

interface DoctorModalProps {
  onClose: () => void;
}

export default function DoctorModal({ onClose }: DoctorModalProps) {
  const [output, setOutput] = useState('Đang kiểm tra hệ thống...');
  const [loading, setLoading] = useState(true);

  const check = async () => {
    setLoading(true);
    if (window.studioAPI) {
      const res = await window.studioAPI.getDoctor();
      setOutput(res.output || 'Không nhận được kết quả.');
    } else {
      setOutput('Không tìm thấy API kết nối.');
    }
    setLoading(false);
  };

  useEffect(() => {
    check();
  }, []);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>🩺 Hệ Thống Doctor — Kiểm Tra Tình Trạng</h2>
            <p className="modal-subtitle">Kiểm tra API keys, ffmpeg, node, kho bài viết và kết nối nền tảng</p>
          </div>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <pre className="terminal-box">{output}</pre>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={check} disabled={loading}>
              {loading ? 'Đang kiểm tra...' : '🔄 Kiểm tra lại'}
            </button>
            <button className="btn btn-primary" onClick={onClose}>
              Đóng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
