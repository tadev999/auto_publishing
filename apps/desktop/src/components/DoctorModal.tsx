import { useEffect, useState } from 'react';

interface DoctorModalProps {
  onClose: () => void;
}

const SERVICE_LABELS: Record<string, { label: string; icon: string }> = {
  gemini: { label: 'Google Gemini 3.8 Flash', icon: '✨' },
  openai: { label: 'OpenAI API (GPT-4o/Omni)', icon: '🧠' },
  anthropic: { label: 'Claude 3.5 Sonnet', icon: '🎭' },
  elevenlabs: { label: 'ElevenLabs Voice AI', icon: '🎙️' },
  pixabay: { label: 'Pixabay B-Roll Videos', icon: '🎬' },
  pexels: { label: 'Pexels B-Roll Videos', icon: '🎥' },
  youtube: { label: 'YouTube Shorts (OAuth)', icon: '▶️' },
  tiktok: { label: 'TikTok Content API', icon: '🎵' },
  instagram: { label: 'Instagram Graph API', icon: '📸' },
  r2_storage: { label: 'Cloudflare R2 Storage', icon: '☁️' },
  telegram: { label: 'Telegram Alert Bot', icon: '📢' },
};

export default function DoctorModal({ onClose }: DoctorModalProps) {
  const [output, setOutput] = useState('Đang kiểm tra hệ thống...');
  const [tokens, setTokens] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  const check = async () => {
    setLoading(true);
    if (window.studioAPI) {
      try {
        const [docRes, tokenRes] = await Promise.all([
          window.studioAPI.getDoctor(),
          window.studioAPI.getTokensStatus ? window.studioAPI.getTokensStatus() : Promise.resolve({}),
        ]);
        setOutput(docRes?.output || 'Không nhận được kết quả.');
        setTokens(tokenRes || {});
      } catch (err: any) {
        setOutput(`Lỗi kiểm tra: ${err.message}`);
      }
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
      <div className="modal-card" style={{ maxWidth: 850 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>🩺 Hệ Thống Doctor & Tình Trạng Tokens</h2>
            <p className="modal-subtitle">Kiểm toán API keys, ffmpeg, model và kết nối xuất bản nền tảng</p>
          </div>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
          {/* Visual Token Health Grid */}
          <div style={{ marginBottom: 18 }}>
            <h4 style={{ margin: '0 0 10px 0', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, color: '#94a3b8' }}>
              Trạng Thái Kết Nối API & Tokens
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {Object.entries(SERVICE_LABELS).map(([key, info]) => {
                const item = tokens[key];
                const isOk = item?.configured;
                return (
                  <div
                    key={key}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: `1px solid ${isOk ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.25)'}`,
                      background: isOk ? 'rgba(34, 197, 94, 0.06)' : 'rgba(239, 68, 68, 0.05)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 3,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>
                        {info.icon} {info.label.split(' ')[0]}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: 4,
                          color: isOk ? '#22c55e' : '#f87171',
                          background: isOk ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        }}
                      >
                        {isOk ? 'SẴN SÀNG' : 'THIẾU'}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{info.label}</span>
                      <span style={{ fontFamily: 'monospace', opacity: 0.8 }}>{item?.preview || '—'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <h4 style={{ margin: '0 0 8px 0', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, color: '#94a3b8' }}>
            Chi Tiết Chẩn Đoán Terminal
          </h4>
          <pre className="terminal-box" style={{ maxHeight: 260 }}>{output}</pre>

          <div className="modal-footer" style={{ marginTop: 14 }}>
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

