import React, { useEffect, useState } from 'react';
import { eventBus } from '../core/eventBus';
import type { AgentSkillProfile, SkillMeta, StudioAgent } from '../core/types';

interface AgentSkillModalProps {
  initialAgent: StudioAgent;
  allAgents: StudioAgent[];
  onClose: () => void;
}

const DEFAULT_SKILLS_FALLBACK: SkillMeta[] = [
  {
    id: 'endogenism-guardrails',
    name: 'endogenism-guardrails',
    title: 'Bảo Vệ Triết Lý & Luật Cứng',
    description: 'Bảo vệ giá trị cốt lõi: Cấm so sánh, cấm FOMO, cấm hứa hẹn suông, không dọa nạt người xem.',
    category: 'core',
    icon: '🛡️',
    badge: 'TRIẾT LÝ',
  },
  {
    id: 'endogenism-voice',
    name: 'endogenism-voice',
    title: 'Giọng Văn Đồng Hành Sâu Lắng',
    description: 'Giọng đọc chân thành, ngang hàng, câu ngắn, giàu ẩn dụ đời thường như tri kỷ tâm sự.',
    category: 'core',
    icon: '🎙️',
    badge: 'VOICE',
  },
  {
    id: 'hook-writing',
    name: 'hook-writing',
    title: 'Kỹ Thuật 3 Hook Giữ Chân 2s',
    description: '6 công thức hook mở vòng tò mò: recognition, naming, reversal, question, permission, micro-moment.',
    category: 'writing',
    icon: '🪝',
    badge: 'HOOK',
  },
  {
    id: 'viral-storytelling',
    name: 'viral-storytelling',
    title: 'Nghệ Thuật Kể Chuyện Lan Tỏa',
    description: 'Chạm đúng điểm nhức nhối thầm kín, tạo nhịp cầu cảm xúc giải tỏa áp lực tâm lý.',
    category: 'writing',
    icon: '🔥',
    badge: 'VIRAL',
  },
  {
    id: 'humor-satire',
    name: 'humor-satire',
    title: 'Hài Hước & Châm Biếm Nhẹ',
    description: 'Tự trào tinh tế, dùng tiếng cười xoa dịu nghịch lý và áp lực thường nhật.',
    category: 'writing',
    icon: '✨',
    badge: 'HÀI HƯỚC',
  },
  {
    id: 'short-form-retention',
    name: 'short-form-retention',
    title: 'Tối Ưu Retention 9:16',
    description: 'Nhịp ngắt câu 2.4 từ/giây, kinetic visual captions, looping câu kết giữ chân 100%.',
    category: 'retention',
    icon: '⚡',
    badge: 'RETENTION',
  },
  {
    id: 'hardcore-critique',
    name: 'hardcore-critique',
    title: 'Phản Biện Thép & Soi Chi Tiết',
    description: 'Chấm điểm nghiêm ngặt gấp đôi, gọt bỏ mọi dấu hiệu sáo rỗng hoặc lý thuyết suông.',
    category: 'quality',
    icon: '🔍',
    badge: 'GIÁM KHẢO',
  },
  {
    id: 'visual-cinematic',
    name: 'visual-cinematic',
    title: 'Thị Giác Điện Ảnh (Cinematic)',
    description: 'Tuyển chọn B-roll có chiều sâu tâm trạng, tương phản ánh sáng ấm và chuyển cảnh êm.',
    category: 'production',
    icon: '🎬',
    badge: 'VISUAL',
  },
  {
    id: 'voice-emotional',
    name: 'voice-emotional',
    title: 'Ngữ Điệu & Nhịp Thở Cảm Xúc',
    description: 'Căn chỉnh khoảng lặng 0.4s - 0.7s đắt giá, trầm ấm và rung động từng thanh âm.',
    category: 'production',
    icon: '🎧',
    badge: 'VOICE',
  },
  {
    id: 'format-cau-hoi',
    name: 'format-cau-hoi',
    title: 'Format: Câu Hỏi Phản Tư',
    description: 'Đặt câu hỏi xoáy sâu khiến người xem tự đối thoại với chính mình.',
    category: 'formats',
    icon: '❓',
    badge: 'FORMAT',
  },
  {
    id: 'format-doc-cham',
    name: 'format-doc-cham',
    title: 'Format: Đọc Chậm Chiêm Nghiệm',
    description: 'Khoảng lặng dài, câu chữ đắt giá, đánh thức sự bình yên nội tại.',
    category: 'formats',
    icon: '📖',
    badge: 'FORMAT',
  },
  {
    id: 'format-goi-ten',
    name: 'format-goi-ten',
    title: 'Format: Gọi Tên Cảm Xúc',
    description: 'Định danh chính xác những cảm giác vô danh người xem đang gánh chịu.',
    category: 'formats',
    icon: '🏷️',
    badge: 'FORMAT',
  },
  {
    id: 'format-ngo-nhan',
    name: 'format-ngo-nhan',
    title: 'Format: Phá Vỡ Ngộ Nhận',
    description: 'Đảo ngược một niềm tin phổ biến gây kiệt sức để giải phóng tâm trí.',
    category: 'formats',
    icon: '💡',
    badge: 'FORMAT',
  },
  {
    id: 'format-thuc-hanh',
    name: 'format-thuc-hanh',
    title: 'Format: Bài Tập Thực Hành',
    description: 'Một hành động vi mô 30 giây để người xem áp dụng ngay lập tức.',
    category: 'formats',
    icon: '🧘',
    badge: 'FORMAT',
  },
];

const PRESETS = [
  {
    id: 'viral-maestro',
    name: '🚀 Viral Maestro',
    desc: 'Bắt trend & chạm đỉnh cảm xúc',
    model: 'claude-3-7-sonnet',
    tone: 'viral' as const,
    temperature: 0.9,
    skills: ['endogenism-guardrails', 'hook-writing', 'viral-storytelling', 'short-form-retention'],
    stats: { creativity: 98, precision: 80, empathy: 92, velocity: 90 },
  },
  {
    id: 'deep-philosopher',
    name: '🧘 Triết Gia Trầm Mặc',
    desc: 'Sâu lắng, chữa lành & chuẩn mực',
    model: 'claude-3-7-sonnet',
    tone: 'philosophy' as const,
    temperature: 0.7,
    skills: ['endogenism-guardrails', 'endogenism-voice', 'format-doc-cham', 'short-form-retention'],
    stats: { creativity: 90, precision: 95, empathy: 99, velocity: 82 },
  },
  {
    id: 'ruthless-critic',
    name: '⚖️ Giám Khảo Thép',
    desc: 'Kỷ luật, soi lỗi & chống sáo rỗng',
    model: 'gpt-4o',
    tone: 'strict' as const,
    temperature: 0.2,
    skills: ['endogenism-guardrails', 'hardcore-critique', 'short-form-retention'],
    stats: { creativity: 70, precision: 100, empathy: 75, velocity: 95 },
  },
  {
    id: 'speed-runner',
    name: '⚡ Tốc Độ Tối Đa',
    desc: 'Tối ưu throughput sản xuất',
    model: 'gpt-4o-mini',
    tone: 'practical' as const,
    temperature: 0.5,
    skills: ['endogenism-guardrails', 'short-form-retention'],
    stats: { creativity: 82, precision: 90, empathy: 78, velocity: 100 },
  },
];

export default function AgentSkillModal({
  initialAgent,
  allAgents,
  onClose,
}: AgentSkillModalProps) {
  const [selectedAgentId, setSelectedAgentId] = useState(initialAgent.id);
  const [availableSkills, setAvailableSkills] = useState<SkillMeta[]>(DEFAULT_SKILLS_FALLBACK);
  const [profiles, setProfiles] = useState<Record<string, AgentSkillProfile>>({});
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  // Lấy dữ liệu profile của Agent đang được chọn
  const currentAgent = allAgents.find((a) => a.id === selectedAgentId) || initialAgent;

  // Lấy hoặc tạo profile hiện tại
  const currentProfile: AgentSkillProfile = profiles[selectedAgentId] || {
    id: currentAgent.id,
    name: currentAgent.name,
    title: currentAgent.title,
    role: currentAgent.role,
    avatarIcon: currentAgent.statusIcon || '🤖',
    color: currentAgent.color,
    model: currentAgent.role === 'writer' ? 'claude-3-7-sonnet' : 'gpt-4o',
    temperature: currentAgent.role === 'writer' ? 0.85 : 0.4,
    tone: 'philosophy',
    systemPromptExtra: '',
    equippedSkills: [
      'endogenism-guardrails',
      'endogenism-voice',
      'hook-writing',
      'short-form-retention',
    ],
    stats: { creativity: 90, precision: 88, empathy: 92, velocity: 85 },
  };

  useEffect(() => {
    // Tải skills & profiles từ electron main
    if (window.studioAPI?.getAgentSkills) {
      window.studioAPI.getAgentSkills().then((res) => {
        if (res.availableSkills && res.availableSkills.length > 0) {
          setAvailableSkills(res.availableSkills);
        }
        if (res.savedProfiles && Object.keys(res.savedProfiles).length > 0) {
          setProfiles(res.savedProfiles);
        }
      });
    }
  }, []);

  const updateCurrentProfile = (updater: (prev: AgentSkillProfile) => AgentSkillProfile) => {
    setProfiles((prev) => ({
      ...prev,
      [selectedAgentId]: updater(currentProfile),
    }));
  };

  const toggleSkill = (skillId: string) => {
    const isEquipped = currentProfile.equippedSkills.includes(skillId);
    let nextSkills: string[];
    if (isEquipped) {
      nextSkills = currentProfile.equippedSkills.filter((s) => s !== skillId);
    } else {
      nextSkills = [...currentProfile.equippedSkills, skillId];
    }

    // Tự động điều chỉnh stats dựa trên kỹ năng trang bị
    const extraCreativity = nextSkills.includes('viral-storytelling') ? 5 : 0;
    const extraPrecision = nextSkills.includes('hardcore-critique') ? 8 : 0;
    const extraEmpathy = nextSkills.includes('voice-emotional') ? 6 : 0;

    updateCurrentProfile((p) => ({
      ...p,
      equippedSkills: nextSkills,
      stats: {
        ...p.stats,
        creativity: Math.min(100, Math.max(50, (p.stats?.creativity || 85) + (isEquipped ? -extraCreativity : extraCreativity))),
        precision: Math.min(100, Math.max(50, (p.stats?.precision || 85) + (isEquipped ? -extraPrecision : extraPrecision))),
        empathy: Math.min(100, Math.max(50, (p.stats?.empathy || 85) + (isEquipped ? -extraEmpathy : extraEmpathy))),
      },
    }));
  };

  const applyPreset = (preset: (typeof PRESETS)[0]) => {
    updateCurrentProfile((p) => ({
      ...p,
      model: preset.model,
      tone: preset.tone,
      temperature: preset.temperature,
      equippedSkills: [...preset.skills],
      stats: { ...preset.stats },
    }));

    showToast(`⚡ Đã nạp Preset [${preset.name}]!`);
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updatedProfiles = {
        ...profiles,
        [selectedAgentId]: currentProfile,
      };

      if (window.studioAPI?.saveAgentSkills) {
        await window.studioAPI.saveAgentSkills(updatedProfiles);
      }

      setSaveSuccess(true);
      showToast(`🎉 Kỹ năng của ${currentAgent.name} đã được cập nhật thành công!`);

      // Gửi event để nhân vật trên PixiJS phản ứng ngay lập tức
      eventBus.emit('agent:skills-updated', {
        id: currentAgent.id,
        speech: `⚡ Kỹ năng mới đã được kích hoạt! Sẵn sàng tỏa sáng!`,
      });

      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (e: any) {
      showToast(`❌ Lỗi khi lưu: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleTestSay = () => {
    eventBus.emit('agent:speak', currentAgent.id, `Tôi là ${currentAgent.name}! Sẵn sàng vận hành với ${currentProfile.equippedSkills.length} kỹ năng mới!`);
    showToast(`💬 ${currentAgent.name} đang nói trên sân khấu!`);
  };

  // Lọc kỹ năng theo danh mục
  const filteredSkills = availableSkills.filter((s) => {
    if (selectedCategory === 'all') return true;
    return s.category === selectedCategory;
  });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="skill-studio-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          boxShadow: `0 0 40px ${currentAgent.color}33, 0 25px 50px -12px rgba(0, 0, 0, 0.7)`,
          borderColor: `${currentAgent.color}66`,
        }}
      >
        {/* Top Header */}
        <div className="skill-modal-header">
          <div className="skill-modal-title-group">
            <div className="agent-avatar-badge" style={{ backgroundColor: `${currentAgent.color}22`, borderColor: currentAgent.color }}>
              <span className="avatar-emoji">{currentProfile.avatarIcon || '🤖'}</span>
              <span className="live-pulse" style={{ backgroundColor: currentAgent.color }}></span>
            </div>
            <div>
              <div className="agent-title-row">
                <h2>{currentAgent.name}</h2>
                <span className="agent-role-pill" style={{ color: currentAgent.color, borderColor: `${currentAgent.color}55` }}>
                  {currentAgent.title}
                </span>
                <span className="agent-engine-pill">
                  {currentProfile.model}
                </span>
              </div>
              <p className="agent-subtitle">
                Đang trực chiến tại bàn: <b>{currentAgent.deskId.toUpperCase()}</b> · Tùy biến kỹ năng và mô hình AI theo thời gian thực
              </p>
            </div>
          </div>

          <div className="skill-modal-actions">
            {toastMsg && <div className="skill-toast-pill animate-fade">{toastMsg}</div>}
            <button className="btn-icon-close" onClick={onClose} title="Đóng cửa sổ">
              ✕
            </button>
          </div>
        </div>

        {/* Agent Switcher Strip (Chuyển đổi nhanh giữa 10 Agents) */}
        <div className="agent-switcher-strip">
          <span className="switcher-label">ĐỘI NGŨ AGENTS:</span>
          <div className="switcher-cards">
            {allAgents.map((ag) => {
              const isSelected = ag.id === selectedAgentId;
              const agProfile = profiles[ag.id];
              const skillCount = agProfile?.equippedSkills?.length ?? 4;
              return (
                <button
                  key={ag.id}
                  className={`agent-chip-btn ${isSelected ? 'active' : ''}`}
                  onClick={() => setSelectedAgentId(ag.id)}
                  style={{
                    borderColor: isSelected ? ag.color : 'transparent',
                    boxShadow: isSelected ? `0 0 14px ${ag.color}55` : 'none',
                  }}
                >
                  <span className="chip-icon">{ag.statusIcon || '🤖'}</span>
                  <div className="chip-info">
                    <span className="chip-name">{ag.name}</span>
                    <span className="chip-badge">{skillCount} skills</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Modal Main Content */}
        <div className="skill-modal-body">
          {/* CỘT TRÁI: Hologram Stats, Preset Builds, Tuning */}
          <div className="skill-left-pane">
            {/* Presets */}
            <div className="skill-section">
              <div className="section-title-row">
                <span className="section-icon">⚡</span>
                <span className="section-label">PRESET BUILDS (NẠP NHANH)</span>
              </div>
              <div className="preset-grid">
                {PRESETS.map((pr) => (
                  <button
                    key={pr.id}
                    className="preset-card-btn"
                    onClick={() => applyPreset(pr)}
                    title={pr.desc}
                  >
                    <span className="preset-name">{pr.name}</span>
                    <span className="preset-desc">{pr.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Live Stat Meters */}
            <div className="skill-section">
              <div className="section-title-row">
                <span className="section-icon">📊</span>
                <span className="section-label">CHỈ SỐ THỰC CHIẾN (STAT RADAR)</span>
              </div>
              <div className="stat-bars-container">
                <div className="stat-bar-item">
                  <div className="stat-label-row">
                    <span>🎨 Sáng tạo & Biến hóa</span>
                    <b>{currentProfile.stats?.creativity || 85}%</b>
                  </div>
                  <div className="stat-progress-track">
                    <div
                      className="stat-progress-fill stat-fill-purple"
                      style={{ width: `${currentProfile.stats?.creativity || 85}%` }}
                    />
                  </div>
                </div>

                <div className="stat-bar-item">
                  <div className="stat-label-row">
                    <span>🛡️ Kỷ luật & Chuẩn mực</span>
                    <b>{currentProfile.stats?.precision || 90}%</b>
                  </div>
                  <div className="stat-progress-track">
                    <div
                      className="stat-progress-fill stat-fill-blue"
                      style={{ width: `${currentProfile.stats?.precision || 90}%` }}
                    />
                  </div>
                </div>

                <div className="stat-bar-item">
                  <div className="stat-label-row">
                    <span>💖 Thấu cảm & Chiêm nghiệm</span>
                    <b>{currentProfile.stats?.empathy || 92}%</b>
                  </div>
                  <div className="stat-progress-track">
                    <div
                      className="stat-progress-fill stat-fill-green"
                      style={{ width: `${currentProfile.stats?.empathy || 92}%` }}
                    />
                  </div>
                </div>

                <div className="stat-bar-item">
                  <div className="stat-label-row">
                    <span>⚡ Tốc độ xử lý</span>
                    <b>{currentProfile.stats?.velocity || 88}%</b>
                  </div>
                  <div className="stat-progress-track">
                    <div
                      className="stat-progress-fill stat-fill-yellow"
                      style={{ width: `${currentProfile.stats?.velocity || 88}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* LLM Engine & Temperature */}
            <div className="skill-section">
              <div className="section-title-row">
                <span className="section-icon">🧠</span>
                <span className="section-label">MÔ HÌNH TRÍ TUỆ NHÂN TẠO</span>
              </div>

              <div className="form-group-compact">
                <label>AI Model Engine:</label>
                <select
                  className="input-select"
                  value={currentProfile.model}
                  onChange={(e) => updateCurrentProfile((p) => ({ ...p, model: e.target.value }))}
                >
                  <option value="claude-3-7-sonnet">🟣 Claude 3.7 Sonnet (Anthropic - Đỉnh cao văn học)</option>
                  <option value="gpt-4o">🟢 GPT-4o (OpenAI - Sắc sảo, logic & phản biện)</option>
                  <option value="claude-3-5-sonnet">🔵 Claude 3.5 Sonnet (Cân bằng & tự nhiên)</option>
                  <option value="gpt-4o-mini">⚡ GPT-4o Mini (Siêu tốc độ & tiết kiệm)</option>
                  <option value="gemini-2.0-flash">💎 Gemini 2.0 Flash (Đột phá thế hệ mới)</option>
                </select>
              </div>

              <div className="form-group-compact" style={{ marginTop: 12 }}>
                <div className="slider-label-row">
                  <label>Nhiệt độ Sáng tạo (Temperature):</label>
                  <b className="temp-badge">{currentProfile.temperature}</b>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  className="input-slider"
                  value={currentProfile.temperature}
                  onChange={(e) =>
                    updateCurrentProfile((p) => ({ ...p, temperature: parseFloat(e.target.value) }))
                  }
                />
                <div className="slider-hints">
                  <span>0.0 (Chính xác)</span>
                  <span>0.5 (Cân bằng)</span>
                  <span>1.0 (Hoang dại)</span>
                </div>
              </div>

              {/* Personality Tone */}
              <div className="form-group-compact" style={{ marginTop: 12 }}>
                <label>Tông Giọng & Khí Chất (Tone):</label>
                <div className="tone-pill-group">
                  {[
                    { id: 'philosophy', label: '🧘 Triết lý' },
                    { id: 'viral', label: '🔥 Cuốn hút' },
                    { id: 'satire', label: '✨ Tự trào' },
                    { id: 'practical', label: '🛠️ Thực tế' },
                    { id: 'strict', label: '⚔️ Thép' },
                  ].map((t) => (
                    <button
                      key={t.id}
                      className={`tone-pill-btn ${currentProfile.tone === t.id ? 'active' : ''}`}
                      onClick={() => updateCurrentProfile((p) => ({ ...p, tone: t.id as any }))}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* CỘT PHẢI: Ma trận kỹ năng tùy biến (Equippable Skills Matrix) */}
          <div className="skill-right-pane">
            <div className="skill-matrix-header">
              <div className="matrix-title-group">
                <span className="section-icon">⚔️</span>
                <div>
                  <h3 className="matrix-title">KHO KỸ NĂNG VÀ MÔ-ĐUN CHUYÊN BIỆT</h3>
                  <span className="matrix-counter">
                    Đã trang bị: <b style={{ color: currentAgent.color }}>{currentProfile.equippedSkills.length}</b> / {availableSkills.length} kỹ năng
                  </span>
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="category-filter-tabs">
                {[
                  { id: 'all', label: 'Tất cả' },
                  { id: 'core', label: '🛡️ Triết lý' },
                  { id: 'writing', label: '✍️ Viết lách' },
                  { id: 'formats', label: '📜 Formats' },
                  { id: 'retention', label: '⚡ Retention' },
                  { id: 'quality', label: '🔍 Chất lượng' },
                  { id: 'production', label: '🎬 Sản xuất' },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    className={`cat-tab-btn ${selectedCategory === cat.id ? 'active' : ''}`}
                    onClick={() => setSelectedCategory(cat.id)}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Danh sách thẻ kỹ năng (Cards Grid) */}
            <div className="skills-cards-grid">
              {filteredSkills.map((sk) => {
                const isEquipped = currentProfile.equippedSkills.includes(sk.id);
                return (
                  <div
                    key={sk.id}
                    className={`skill-card ${isEquipped ? 'equipped' : ''}`}
                    onClick={() => toggleSkill(sk.id)}
                    style={{
                      borderColor: isEquipped ? currentAgent.color : 'rgba(255, 255, 255, 0.08)',
                    }}
                  >
                    <div className="skill-card-top">
                      <div className="skill-icon-badge">
                        <span className="skill-emoji">{sk.icon}</span>
                        <span className="skill-badge-tag">{sk.badge}</span>
                      </div>
                      <div className="skill-toggle-switch">
                        <span className={`switch-knob ${isEquipped ? 'on' : 'off'}`} />
                      </div>
                    </div>

                    <h4 className="skill-title">{sk.title}</h4>
                    <p className="skill-desc">{sk.description}</p>

                    <div className="skill-card-footer">
                      <span className="skill-file-link">skills/{sk.name}/SKILL.md</span>
                      <span className="skill-status-tag">
                        {isEquipped ? '✓ ĐÃ NẠP' : '+ BẤM ĐỂ NẠP'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Custom System Instruction / Prompt Modifier */}
            <div className="skill-section custom-prompt-section">
              <div className="section-title-row">
                <span className="section-icon">✍️</span>
                <span className="section-label">CHỈ THỊ ĐẶC BIỆT DÀNH RIÊNG CHO AGENT NÀY (PROMPT INJECTION)</span>
              </div>
              <textarea
                className="input-textarea"
                rows={3}
                placeholder={`Nhập chỉ thị bổ sung riêng cho ${currentAgent.name}... (Ví dụ: Ưu tiên dùng các ẩn dụ về giọt sương và ánh nắng ban mai, viết câu ngắn dưới 10 từ...)`}
                value={currentProfile.systemPromptExtra || ''}
                onChange={(e) =>
                  updateCurrentProfile((p) => ({ ...p, systemPromptExtra: e.target.value }))
                }
              />
            </div>
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div className="skill-modal-footer">
          <div className="footer-left">
            <button className="btn btn-secondary" onClick={handleTestSay}>
              💬 Cho {currentAgent.name} nói thử
            </button>
            <span className="footer-tip">
              💡 Mẹo: Nhấp vào bất kỳ Agent nào trên sân khấu 3D để mở nhanh bảng này.
            </span>
          </div>

          <div className="footer-right">
            <button className="btn btn-ghost" onClick={onClose}>
              Đóng
            </button>
            <button
              className={`btn btn-primary btn-glow ${saveSuccess ? 'btn-success' : ''}`}
              onClick={handleSave}
              disabled={saving}
              style={{
                backgroundColor: saveSuccess ? '#10b981' : currentAgent.color,
                boxShadow: `0 0 20px ${currentAgent.color}88`,
              }}
            >
              {saving ? '⏳ Đang nạp kỹ năng...' : saveSuccess ? '✓ ĐÃ NẠP THÀNH CÔNG!' : `⚡ NẠP VÀO ${currentAgent.name.toUpperCase()} (EQUIP)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
