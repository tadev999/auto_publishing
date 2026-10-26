import { studioAPI } from '../core/api';
import React, { useEffect, useState } from 'react';

interface SettingsModalProps {
  onClose: () => void;
}

interface KeyField {
  key: string;
  label: string;
  desc: string;
  placeholder: string;
  isSecret?: boolean;
}

interface KeyGroup {
  group: string;
  icon: string;
  desc: string;
  fields: KeyField[];
}

const GROUPS: KeyGroup[] = [
  {
    group: 'Trí tuệ nhân tạo (AI Models)',
    icon: '🤖',
    desc: 'Cần thiết để phân tích bài viết, viết kịch bản, và phản biện triết lý.',
    fields: [
      {
        key: 'GEMINI_API_KEY',
        label: 'Google Gemini API Key',
        desc: 'Dùng cho các agent chọn Gemini trong Agent & kỹ năng.',
        placeholder: 'AIzaSy...',
        isSecret: true,
      },
      {
        key: 'ANTHROPIC_API_KEY',
        label: 'Anthropic Claude API Key',
        desc: 'Dùng cho các agent chọn Claude trong Agent & kỹ năng.',
        placeholder: 'sk-ant-api03-...',
        isSecret: true,
      },
      {
        key: 'OPENAI_API_KEY',
        label: 'OpenAI API Key',
        desc: 'Dùng cho các agent chọn GPT trong Agent & kỹ năng.',
        placeholder: 'sk-proj-...',
        isSecret: true,
      },
    ],
  },
  {
    group: 'Giọng đọc AI & Video Stock',
    icon: '🎙️',
    desc: 'Tạo giọng đọc từ giọng thật tác giả và tải video nền từ Pexels.',
    fields: [
      {
        key: 'ELEVENLABS_API_KEY',
        label: 'ElevenLabs API Key',
        desc: 'API tạo giọng đọc tiếng Việt kèm timestamp chính xác từng từ',
        placeholder: 'xi-...',
        isSecret: true,
      },
      {
        key: 'ELEVENLABS_VOICE_ID',
        label: 'ElevenLabs Voice ID',
        desc: 'Mã giọng clone của chính tác giả (lấy từ elevenlabs.io/voices)',
        placeholder: 'pNInz6obpgDQG5745Z...',
        isSecret: false,
      },
      {
        key: 'PIXABAY_API_KEY',
        label: 'Pixabay API Key (Khuyên dùng)',
        desc: 'Tải cảnh quay B-Roll miễn phí từ pixabay.com/api/docs (cấp key ngay lập tức)',
        placeholder: '12345678-abcdef...',
        isSecret: true,
      },
      {
        key: 'PEXELS_API_KEY',
        label: 'Pexels API Key',
        desc: 'Tải cảnh quay tĩnh lặng dọc 9:16 chất lượng cao từ pexels.com/api',
        placeholder: '563492ad6f91700001000001...',
        isSecret: true,
      },
    ],
  },
  {
    group: 'Lưu trữ đám mây (Cloudflare R2)',
    icon: '☁️',
    desc: 'Lưu trữ file video MP4 để cung cấp URL bảo mật khi đăng lên Instagram.',
    fields: [
      {
        key: 'R2_ACCOUNT_ID',
        label: 'Cloudflare Account ID',
        desc: 'ID tài khoản Cloudflare của bạn',
        placeholder: 'e.g. 7c98f82...',
        isSecret: false,
      },
      {
        key: 'R2_ACCESS_KEY_ID',
        label: 'R2 Access Key ID',
        desc: 'Khóa truy cập S3/R2 API Token',
        placeholder: '4f92bc3...',
        isSecret: false,
      },
      {
        key: 'R2_SECRET_ACCESS_KEY',
        label: 'R2 Secret Access Key',
        desc: 'Mật mã bảo mật S3/R2',
        placeholder: 'b9821ef...',
        isSecret: true,
      },
      {
        key: 'R2_BUCKET',
        label: 'R2 Bucket Name',
        desc: 'Tên Bucket lưu video (ví dụ: endogenism-videos)',
        placeholder: 'endogenism-videos',
        isSecret: false,
      },
    ],
  },
  {
    group: 'Mạng xã hội (Xuất bản tự động)',
    icon: '📱',
    desc: 'Cấu hình đăng video lên Instagram Reels và TikTok.',
    fields: [
      {
        key: 'IG_USER_ID',
        label: 'Instagram Business User ID',
        desc: 'ID tài khoản Instagram Professional/Creator',
        placeholder: '17841400...',
        isSecret: false,
      },
      {
        key: 'IG_ACCESS_TOKEN',
        label: 'Instagram Graph Access Token',
        desc: 'Mã truy cập Meta Graph API (thời hạn 60 ngày)',
        placeholder: 'EAAQ...',
        isSecret: true,
      },
      {
        key: 'TIKTOK_CLIENT_KEY',
        label: 'TikTok Client Key',
        desc: 'Khóa ứng dụng TikTok Developer Portal',
        placeholder: 'aw...',
        isSecret: false,
      },
      {
        key: 'TIKTOK_CLIENT_SECRET',
        label: 'TikTok Client Secret',
        desc: 'Mật mã ứng dụng TikTok Developer Portal',
        placeholder: 'sec_...',
        isSecret: true,
      },
      {
        key: 'TIKTOK_REDIRECT_URI',
        label: 'TikTok Redirect URI',
        desc: 'Địa chỉ redirect OAuth TikTok (thường là http://localhost:8000/callback)',
        placeholder: 'http://localhost:8000/callback',
        isSecret: false,
      },
    ],
  },
  {
    group: 'Thông báo Telegram (Tuỳ chọn)',
    icon: '💬',
    desc: 'Nhận thông báo khi video được đăng hoặc có sự cố cần can thiệp.',
    fields: [
      {
        key: 'TELEGRAM_BOT_TOKEN',
        label: 'Telegram Bot Token',
        desc: 'Token tạo từ @BotFather (ví dụ: 123456:ABC-DEF...)',
        placeholder: '123456789:AAH...',
        isSecret: true,
      },
      {
        key: 'TELEGRAM_CHAT_ID',
        label: 'Telegram Chat ID',
        desc: 'ID đoạn chat cá nhân hoặc nhóm nhận thông báo',
        placeholder: '-100123456789',
        isSecret: false,
      },
    ],
  },
];

function parseEnv(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const k = trimmed.slice(0, eqIdx).trim();
      let v = trimmed.slice(eqIdx + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      result[k] = v;
    }
  }
  return result;
}

function stringifyEnv(dict: Record<string, string>, originalRaw: string): string {
  const keysLeft = new Set(Object.keys(dict));
  const newLines: string[] = [];

  for (const line of originalRaw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      newLines.push(line);
      continue;
    }
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const k = trimmed.slice(0, eqIdx).trim();
      if (k in dict) {
        newLines.push(`${k}=${dict[k]}`);
        keysLeft.delete(k);
      } else {
        newLines.push(line);
      }
    } else {
      newLines.push(line);
    }
  }

  // Add keys not present in original raw text
  for (const k of keysLeft) {
    if (dict[k]) {
      newLines.push(`${k}=${dict[k]}`);
    }
  }

  return newLines.join('\n');
}

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'form' | 'raw'>('form');
  const [rawText, setRawText] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    studioAPI.getSettings().then((res) => {
      const content = res.content || '';
      setRawText(content);
      setValues(parseEnv(content));
    }).catch((error: unknown) => console.error('Failed to load settings:', error));
  }, []);

  const handleFieldChange = (key: string, val: string) => {
    const next = { ...values, [key]: val };
    setValues(next);
    setRawText(stringifyEnv(next, rawText));
  };

  const handleRawChange = (text: string) => {
    setRawText(text);
    setValues(parseEnv(text));
  };

  const toggleShowSecret = (key: string) => {
    setShowSecrets((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    const finalContent = activeTab === 'raw' ? rawText : stringifyEnv(values, rawText);
    try {
      await studioAPI.saveSettings(finalContent);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  };

  const filledCount = Object.values(values).filter((v) => v && v.trim().length > 0).length;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card settings-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2>⚙️ Cấu Hình API Keys & Bí Mật (.env)</h2>
              <span className="badge-count">
                {filledCount} / {GROUPS.reduce((acc, g) => acc + g.fields.length, 0)} khóa
              </span>
            </div>
            <p className="modal-subtitle">
              Kết nối các dịch vụ AI và nền tảng phát hành cho team
            </p>
          </div>
          <button className="btn-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Tab switch */}
        <div className="settings-tabs">
          <button
            className={`settings-tab-btn ${activeTab === 'form' ? 'active' : ''}`}
            onClick={() => setActiveTab('form')}
          >
            📋 Giao diện nhập liệu trực quan
          </button>
          <button
            className={`settings-tab-btn ${activeTab === 'raw' ? 'active' : ''}`}
            onClick={() => setActiveTab('raw')}
          >
            📝 Chế độ sửa file .env thô
          </button>
        </div>

        {/* Body */}
        <div className="modal-body settings-modal-body">
          {activeTab === 'form' ? (
            <div className="groups-container">
              {GROUPS.map((g) => (
                <div key={g.group} className="key-group-box">
                  <div className="key-group-header">
                    <span className="key-group-icon">{g.icon}</span>
                    <div>
                      <h3 className="key-group-title">{g.group}</h3>
                      <p className="key-group-desc">{g.desc}</p>
                    </div>
                  </div>

                  <div className="key-fields-list">
                    {g.fields.map((f) => {
                      const val = values[f.key] || '';
                      const isRevealed = Boolean(showSecrets[f.key]);
                      const isFilled = val.trim().length > 0;

                      return (
                        <div key={f.key} className="key-field-row">
                          <div className="key-field-label-block">
                            <div className="key-field-name-row">
                              <span className="key-field-name">{f.label}</span>
                              <span className={`key-status-dot ${isFilled ? 'filled' : 'missing'}`}>
                                {isFilled ? '✓ Đã nhập' : 'Chưa có'}
                              </span>
                            </div>
                            <span className="key-field-code">{f.key}</span>
                            <span className="key-field-hint">{f.desc}</span>
                          </div>

                          <div className="key-field-input-box">
                            <input
                              type={f.isSecret && !isRevealed ? 'password' : 'text'}
                              className="key-field-input"
                              placeholder={f.placeholder}
                              value={val}
                              onChange={(e) => handleFieldChange(f.key, e.target.value)}
                            />
                            {f.isSecret && (
                              <button
                                type="button"
                                className="btn-toggle-eye"
                                title={isRevealed ? 'Ẩn' : 'Hiện'}
                                onClick={() => toggleShowSecret(f.key)}
                              >
                                {isRevealed ? '🙈' : '👁️'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="raw-container">
              <p className="raw-hint">
                Chỉnh sửa hoặc dán trực tiếp nội dung file <code>.env</code> vào khung bên dưới:
              </p>
              <textarea
                className="settings-textarea"
                value={rawText}
                onChange={(e) => handleRawChange(e.target.value)}
                placeholder="ANTHROPIC_API_KEY=...\nOPENAI_API_KEY=...\nELEVENLABS_API_KEY=..."
                rows={16}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer settings-modal-footer">
          {saved && <span className="text-green">✓ Đã lưu cài đặt vào .env thành công!</span>}
          <button className="btn btn-secondary" onClick={onClose}>
            Đóng
          </button>
          <button className="btn btn-primary btn-glow" onClick={handleSave}>
            💾 Lưu cấu hình (.env)
          </button>
        </div>
      </div>
    </div>
  );
}
