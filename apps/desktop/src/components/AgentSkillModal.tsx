import React, { useEffect, useState } from 'react';
import { eventBus } from '../core/eventBus';
import { store } from '../core/store';
import type { AgentSkillProfile, SkillMeta, StudioAgent } from '../core/types';

interface AgentSkillModalProps {
  initialAgent: StudioAgent;
  allAgents: StudioAgent[];
  onClose: () => void;
}

// 5 Chức vụ cốt lõi và Trách nhiệm chính tương ứng
const ROLE_RESPONSIBILITIES: Record<
  string,
  {
    roleName: string;
    department: string;
    mission: string;
    tasks: string;
    output: string;
  }
> = {
  planner: {
    roleName: 'Trưởng Ban Nội Dung (Planner)',
    department: 'Ban Kế Hoạch & Định Hướng',
    mission: 'Chắt lọc tri thức cốt lõi từ 150 bài viết gốc và định hình lộ trình phát triển kênh.',
    tasks: 'Chọn lọc các câu trích dẫn đắt giá, xếp lịch phát hành 3-5 video mỗi ngày vào các khung giờ vàng sinh học.',
    output: 'Hàng đợi ý tưởng & lịch trình xuất bản video đã tối ưu.',
  },
  writer: {
    roleName: 'Biên Kịch (Writer)',
    department: 'Phòng Sáng Tác Kịch Bản',
    mission: 'Sáng tác kịch bản video ngắn 9:16 giữ chân người xem 100% theo triết lý Endogenism.',
    tasks: 'Viết 3 phương án hook mở vòng tò mò 2 giây đầu, căn nhịp đọc 2.4 từ/giây, phân đoạn cảm xúc & lời thoại.',
    output: 'Kịch bản hoàn chỉnh (Hook + Phân cảnh + Lời thoại + Visual B-roll prompts).',
  },
  critic: {
    roleName: 'Tổng Biên Tập (Critic)',
    department: 'Ban Kiểm Duyệt Chất Lượng',
    mission: 'Một cửa kiểm duyệt tối cao: Bảo vệ triết lý chuẩn mực và bảo đảm chất lượng kỹ thuật xuất xưởng.',
    tasks: 'Chấm điểm 6 tiêu chí triết lý (loại bỏ sáo rỗng/FOMO), rà soát safe-zone 9:16 và căn chỉnh thời lượng 15-60s.',
    output: 'Biên bản thẩm định (Duyệt cho sản xuất hoặc Góp ý chi tiết để viết lại).',
  },
  producer: {
    roleName: 'Kỹ Sư Sản Xuất (Producer)',
    department: 'Studio Audio & Visual',
    mission: 'Chịu trách nhiệm toàn trình khâu sản xuất video từ âm thanh, hình ảnh đến dựng phim hoàn chỉnh.',
    tasks: 'Tạo giọng đọc AI chân thực qua ElevenLabs, tuyển chọn B-roll điện ảnh Pexels, render motion typography qua Remotion.',
    output: 'File video MP4 chuẩn Full HD 1080x1920 sẵn sàng xuất bản.',
  },
  publisher: {
    roleName: 'Điều Phối Phát Hành (Publisher)',
    department: 'Trung Tâm Phát Hành & Tăng Trưởng',
    mission: 'Tự động hóa phát hành đa nền tảng và tối ưu hóa tăng trưởng khán giả thực chất.',
    tasks: 'Đăng tải video lên TikTok, Reels, YouTube Shorts đúng giờ vàng, tối ưu hashtag SEO và theo dõi retention metrics.',
    output: 'Video được tiếp cận đông đảo khán giả và báo cáo phân tích tăng trưởng.',
  },
};

const DEFAULT_SKILLS_FALLBACK: SkillMeta[] = [
  {
    id: 'hook-writing',
    name: 'hook-writing',
    title: 'Kỹ Thuật 3 Hook Giữ Chân 2s',
    description: '6 công thức hook mở vòng tò mò: recognition, naming, reversal, question, permission, micro-moment.',
    category: 'writing',
    icon: '🪝',
    badge: 'HOOK',
    targetRoles: ['writer'],
  },
  {
    id: 'viral-storytelling',
    name: 'viral-storytelling',
    title: 'Nghệ Thuật Kể Chuyện Lan Tỏa',
    description: 'Chạm đúng điểm nhức nhối thầm kín, tạo nhịp cầu cảm xúc giải tỏa áp lực tâm lý.',
    category: 'writing',
    icon: '🔥',
    badge: 'VIRAL',
    targetRoles: ['writer', 'publisher'],
  },
  {
    id: 'humor-satire',
    name: 'humor-satire',
    title: 'Hài Hước & Châm Biếm Nhẹ',
    description: 'Tự trào tinh tế, dùng tiếng cười xoa dịu nghịch lý và áp lực thường nhật.',
    category: 'writing',
    icon: '✨',
    badge: 'HÀI HƯỚC',
    targetRoles: ['writer'],
  },
  {
    id: 'short-form-retention',
    name: 'short-form-retention',
    title: 'Tối Ưu Retention Tổng Thể 9:16',
    description: 'Nhịp ngắt câu 2.4 từ/giây, visual pacing, looping câu kết giữ chân 100%.',
    category: 'retention',
    icon: '⚡',
    badge: 'RETENTION',
    targetRoles: ['writer', 'producer', 'publisher', 'critic'],
  },
  {
    id: 'endogenism-guardrails',
    name: 'endogenism-guardrails',
    title: 'Bảo Vệ Triết Lý & Luật Cứng',
    description: 'Bảo vệ giá trị cốt lõi: Cấm so sánh, cấm FOMO, cấm hứa hẹn suông, không dọa nạt người xem.',
    category: 'core',
    icon: '🛡️',
    badge: 'TRIẾT LÝ',
    targetRoles: ['critic', 'writer', 'planner'],
  },
  {
    id: 'hardcore-critique',
    name: 'hardcore-critique',
    title: 'Phản Biện Thép & Soi Chi Tiết',
    description: 'Chấm điểm nghiêm ngặt gấp đôi, gọt bỏ mọi dấu hiệu sáo rỗng hoặc lý thuyết suông.',
    category: 'quality',
    icon: '🔍',
    badge: 'PHẢN BIỆN',
    targetRoles: ['critic'],
  },
  {
    id: 'compliance-qa',
    name: 'compliance-qa',
    title: 'Kiểm Định Xuất Xưởng & Safe-Zone 9:16',
    description: 'Rà soát safe-zone 9:16, độ dài thời lượng, bản quyền âm thanh và độ rõ âm tiết.',
    category: 'quality',
    icon: '📐',
    badge: 'SAFE-ZONE',
    targetRoles: ['critic'],
  },
  {
    id: 'endogenism-voice',
    name: 'endogenism-voice',
    title: 'Giọng Văn Đồng Hành Sâu Lắng',
    description: 'Giọng đọc chân thành, ngang hàng, câu ngắn, giàu ẩn dụ đời thường như tri kỷ tâm sự.',
    category: 'core',
    icon: '🎙️',
    badge: 'GIỌNG ĐỌC',
    targetRoles: ['producer', 'writer'],
  },
  {
    id: 'voice-emotional',
    name: 'voice-emotional',
    title: 'Ngữ Điệu & Nhịp Thở Cảm Xúc',
    description: 'Căn chỉnh khoảng lặng 0.4s - 0.7s đắt giá, trầm ấm và rung động từng thanh âm.',
    category: 'production',
    icon: '🎧',
    badge: 'CẢM XÚC',
    targetRoles: ['producer'],
  },
  {
    id: 'visual-cinematic',
    name: 'visual-cinematic',
    title: 'Thị Giác Điện Ảnh (Cinematic B-Roll)',
    description: 'Tuyển chọn B-roll có chiều sâu tâm trạng, tương phản ánh sáng ấm và chuyển cảnh êm.',
    category: 'production',
    icon: '🎬',
    badge: 'B-ROLL',
    targetRoles: ['producer'],
  },
  {
    id: 'motion-typography',
    name: 'motion-typography',
    title: 'Kinetic Motion Typography 9:16',
    description: 'Căn nhịp chữ xuất hiện theo từng từ ngữ, highlight từ khóa vàng theo giọng đọc.',
    category: 'production',
    icon: '⚡',
    badge: 'CHỮ ĐỘNG',
    targetRoles: ['producer'],
  },
  {
    id: 'content-curation',
    name: 'content-curation',
    title: 'Chắt Lọc Tinh Hoa Ý Tưởng',
    description: 'Đọc toàn văn 150 bài viết gốc, nhận diện câu trích dẫn đắt giá và ẩn dụ gốc.',
    category: 'strategy',
    icon: '📚',
    badge: 'Ý TƯỞNG',
    targetRoles: ['planner'],
  },
  {
    id: 'golden-hour-strategy',
    name: 'golden-hour-strategy',
    title: 'Chiến Lược Khung Giờ Vàng',
    description: 'Điều phối 3-5 khung giờ vàng mỗi ngày (06:30, 11:30, 17:00, 20:00) theo nhịp sinh học.',
    category: 'strategy',
    icon: '🗓️',
    badge: 'GIỜ VÀNG',
    targetRoles: ['planner'],
  },
  {
    id: 'algorithm-distribution',
    name: 'algorithm-distribution',
    title: 'Tối Ưu Thuật Toán TikTok/Reels',
    description: 'Xuất bản đúng hẹn, caption chuẩn SEO video ngắn, kích hoạt Share to Feed.',
    category: 'distribution',
    icon: '🚀',
    badge: 'PHÁT HÀNH',
    targetRoles: ['publisher'],
  },
  {
    id: 'retention-analytics',
    name: 'retention-analytics',
    title: 'Phân Tích Biểu Đồ Giữ Chân Khán Giả',
    description: 'Đo lường tỷ lệ Save/View, Share/View và phản hồi ngược style hook cho Biên Kịch.',
    category: 'distribution',
    icon: '📊',
    badge: 'CHỈ SỐ',
    targetRoles: ['publisher'],
  },
  {
    id: 'format-cau-hoi',
    name: 'format-cau-hoi',
    title: 'Format: Câu Hỏi Phản Tư (15–20s)',
    description: 'Đặt câu hỏi xoáy sâu khiến người xem tự đối thoại với chính mình.',
    category: 'formats',
    icon: '❓',
    badge: 'CÂU HỎI',
    targetRoles: ['writer', 'planner'],
  },
  {
    id: 'format-doc-cham',
    name: 'format-doc-cham',
    title: 'Format: Đọc Chậm Chiêm Nghiệm (20–30s)',
    description: 'Khoảng lặng dài, câu chữ đắt giá, đánh thức sự bình yên nội tại.',
    category: 'formats',
    icon: '📖',
    badge: 'ĐỌC CHẬM',
    targetRoles: ['writer', 'planner'],
  },
  {
    id: 'format-goi-ten',
    name: 'format-goi-ten',
    title: 'Format: Gọi Tên Cảm Xúc (30–45s)',
    description: 'Định danh chính xác những cảm giác vô danh người xem đang gánh chịu.',
    category: 'formats',
    icon: '🏷️',
    badge: 'GỌI TÊN',
    targetRoles: ['writer', 'planner'],
  },
  {
    id: 'format-ngo-nhan',
    name: 'format-ngo-nhan',
    title: 'Format: Phá Vỡ Ngộ Nhận (30–40s)',
    description: 'Đảo ngược một niềm tin phổ biến gây kiệt sức để giải phóng tâm trí.',
    category: 'formats',
    icon: '💡',
    badge: 'NGỘ NHẬN',
    targetRoles: ['writer', 'planner'],
  },
  {
    id: 'format-thuc-hanh',
    name: 'format-thuc-hanh',
    title: 'Format: Bài Tập Thực Hành (40–60s)',
    description: 'Một hành động vi mô 30 giây để người xem áp dụng ngay lập tức.',
    category: 'formats',
    icon: '🧘',
    badge: 'THỰC HÀNH',
    targetRoles: ['writer', 'planner'],
  },
];

// Bộ kỹ năng mặc định phân tách chuẩn hóa theo từng vị trí (5 Siêu Agent)
const DEFAULT_ROLE_PROFILES: Record<
  string,
  {
    model: string;
    temperature: number;
    skills: string[];
  }
> = {
  // 1. TRƯỞNG BAN NỘI DUNG: Chắt lọc tinh hoa bài viết & lên kế hoạch giờ vàng
  planner: {
    model: 'gpt-4o',
    temperature: 0.4,
    skills: [
      'content-curation',
      'golden-hour-strategy',
      'format-cau-hoi',
      'format-doc-cham',
      'endogenism-guardrails',
    ],
  },
  // 2. BIÊN KỊCH: Viết hook đỉnh cao, giữ chân, kể chuyện lan tỏa & giọng văn tri kỷ
  writer: {
    model: 'claude-3-7-sonnet',
    temperature: 0.85,
    skills: [
      'hook-writing',
      'viral-storytelling',
      'short-form-retention',
      'humor-satire',
      'endogenism-voice',
      'format-ngo-nhan',
    ],
  },
  // 3. TỔNG BIÊN TẬP: Phản biện thép, kiểm định 1 cửa safe-zone & triết lý
  critic: {
    model: 'gpt-4o',
    temperature: 0.2,
    skills: [
      'hardcore-critique',
      'compliance-qa',
      'endogenism-guardrails',
      'short-form-retention',
    ],
  },
  // 4. KỸ SƯ SẢN XUẤT: Giọng đọc AI cảm xúc, B-roll điện ảnh, Chữ động Kinetic Remotion
  producer: {
    model: 'claude-3-5-sonnet',
    temperature: 0.3,
    skills: [
      'voice-emotional',
      'visual-cinematic',
      'motion-typography',
      'endogenism-voice',
      'short-form-retention',
    ],
  },
  // 5. ĐIỀU PHỐI PHÁT HÀNH: Tối ưu thuật toán đa nền tảng, phân tích giữ chân & giờ vàng
  publisher: {
    model: 'gpt-4o',
    temperature: 0.4,
    skills: [
      'algorithm-distribution',
      'retention-analytics',
      'golden-hour-strategy',
      'viral-storytelling',
    ],
  },
};

export default function AgentSkillModal({
  initialAgent,
  allAgents: initialAgents,
  onClose,
}: AgentSkillModalProps) {
  const [selectedAgentId, setSelectedAgentId] = useState(initialAgent.id);
  const [liveAgents, setLiveAgents] = useState<StudioAgent[]>(store.get().agents);
  const [availableSkills, setAvailableSkills] = useState<SkillMeta[]>(DEFAULT_SKILLS_FALLBACK);
  const [profiles, setProfiles] = useState<Record<string, AgentSkillProfile>>({});
  const [showSkillPicker, setShowSkillPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  useEffect(() => {
    return store.subscribe((s) => {
      setLiveAgents([...s.agents]);
    });
  }, []);

  const allAgents = liveAgents.length > 0 ? liveAgents : initialAgents;
  const currentAgent = allAgents.find((a) => a.id === selectedAgentId) || initialAgent;
  const defaultRole = DEFAULT_ROLE_PROFILES[currentAgent.role] || DEFAULT_ROLE_PROFILES.writer;

  // Lấy hoặc khởi tạo profile riêng biệt theo chức vụ
  const rawProfile = profiles[selectedAgentId];
  // Kiểm tra nếu database cũ lưu nhầm bộ skill trùng lặp
  const isGenericDuplicate =
    rawProfile &&
    rawProfile.equippedSkills &&
    rawProfile.equippedSkills.length === 3 &&
    rawProfile.equippedSkills.includes('hook-writing') &&
    rawProfile.equippedSkills.includes('endogenism-guardrails') &&
    currentAgent.role !== 'writer';

  const currentProfile: AgentSkillProfile = (!rawProfile || isGenericDuplicate)
    ? {
        id: currentAgent.id,
        name: currentAgent.name,
        title: currentAgent.title,
        role: currentAgent.role,
        department: currentAgent.department,
        avatarIcon: currentAgent.statusIcon || '🤖',
        color: currentAgent.color,
        model: defaultRole.model,
        temperature: defaultRole.temperature,
        tone: 'philosophy',
        systemPromptExtra: '',
        equippedSkills: defaultRole.skills,
        stats: { creativity: 90, precision: 95, empathy: 90, velocity: 90 },
      }
    : rawProfile;

  useEffect(() => {
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

  const updateModel = (model: string) => {
    setProfiles((prev) => ({
      ...prev,
      [selectedAgentId]: {
        ...currentProfile,
        model,
      },
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

    setProfiles((prev) => ({
      ...prev,
      [selectedAgentId]: {
        ...currentProfile,
        equippedSkills: nextSkills,
      },
    }));
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

      setToastMsg(`✓ Đã lưu cài đặt cho ${currentAgent.name}!`);
      eventBus.emit('agent:skills-updated', {
        id: currentAgent.id,
        speech: `⚡ Đã cập nhật xong! Tôi là ${currentAgent.name}, sẵn sàng làm việc!`,
      });

      setTimeout(() => setToastMsg(''), 2500);
    } catch (e: any) {
      setToastMsg(`❌ Lỗi khi lưu: ${e.message}`);
      setTimeout(() => setToastMsg(''), 3000);
    } finally {
      setSaving(false);
    }
  };

  // 1. TÊN CHỨC VỤ & PHÒNG BAN
  const respInfo = ROLE_RESPONSIBILITIES[currentAgent.role] || {
    roleName: currentAgent.name,
    department: currentAgent.department,
    mission: 'Thực hiện các nhiệm vụ chuyên môn theo quy trình sản xuất video tự động.',
    tasks: 'Tiếp nhận dữ liệu, xử lý nghiệp vụ chuyên môn và chuyển giao khâu tiếp theo.',
    output: 'Sản phẩm đầu ra đạt chuẩn chất lượng của kênh.',
  };

  // 5. ĐANG THỰC HIỆN VIỆC GÌ HAY ĐANG RẢNH RỖI
  const isIdle = !currentAgent.status || currentAgent.status === 'idle';
  const currentActionDescription =
    currentAgent.status === 'working'
      ? (currentAgent.thought || currentAgent.speech || 'Đang tập trung xử lý dữ liệu và tác vụ tự động...')
      : 'Sẵn sàng nhận nhiệm vụ tiếp theo';

  // 3. CÁC SKILL HIỆN CÓ
  const equippedSkillList = availableSkills.filter((sk) =>
    currentProfile.equippedSkills.includes(sk.id)
  );

  const unequippedSkills = availableSkills.filter(
    (sk) => !currentProfile.equippedSkills.includes(sk.id)
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="agent-detail-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          borderColor: currentAgent.color,
          boxShadow: `0 0 35px ${currentAgent.color}28, 0 20px 50px rgba(0, 0, 0, 0.8)`,
        }}
      >
        {/* HEADER: Chuyển nhanh giữa 5 nhân vật + Nút đóng */}
        <div className="agent-modal-top-bar">
          <div className="agent-switch-tabs">
            {allAgents.map((ag) => {
              const isSelected = ag.id === selectedAgentId;
              const isWorking = ag.status === 'working';
              const defaultIcon = ag.role === 'writer' ? '✍️' : ag.role === 'critic' ? '⚖️' : ag.role === 'producer' ? '🎬' : ag.role === 'publisher' ? '🚀' : '📚';

              return (
                <button
                  key={ag.id}
                  className={`agent-tab-btn ${isSelected ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedAgentId(ag.id);
                    setShowSkillPicker(false);
                  }}
                  style={{
                    borderColor: isSelected ? ag.color : isWorking ? `${ag.color}88` : 'transparent',
                    color: isSelected ? '#ffffff' : 'var(--text-secondary)',
                    position: 'relative',
                  }}
                >
                  <span className="tab-emoji">{ag.statusIcon || defaultIcon}</span>
                  <span className="tab-name">{ag.name}</span>
                  {isWorking && (
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        backgroundColor: '#fbbf24',
                        boxShadow: '0 0 8px #fbbf24',
                        display: 'inline-block',
                        marginLeft: 4,
                      }}
                      title="Đang làm việc"
                    ></span>
                  )}
                </button>
              );
            })}
          </div>

          <button className="btn-icon-close" onClick={onClose} title="Đóng cửa sổ">
            ✕
          </button>
        </div>

        {/* BODY: ĐÚNG 5 THÔNG TIN THEO YÊU CẦU */}
        <div className="agent-detail-body">
          {/* MỤC 1: TÊN CHỨC VỤ */}
          <div className="agent-info-card role-identity-card" style={{ borderColor: `${currentAgent.color}44` }}>
            <div className="role-avatar-box" style={{ backgroundColor: `${currentAgent.color}22`, borderColor: currentAgent.color }}>
              <span className="role-avatar-emoji">{currentProfile.avatarIcon || '🤖'}</span>
            </div>
            <div className="role-text-box">
              <div className="role-field-label">1. TÊN CHỨC VỤ</div>
              <h2 className="role-main-title">{respInfo.roleName}</h2>
              <div className="role-dept-tag" style={{ color: currentAgent.color }}>
                🏢 {respInfo.department} · {currentAgent.title}
              </div>
            </div>
          </div>

          {/* MỤC 5: ĐANG THỰC HIỆN VIỆC GÌ HAY ĐANG RẢNH RỖI */}
          <div className="agent-info-card current-activity-card">
            <div className="section-header-compact">
              <span className="section-num">2. TRẠNG THÁI HIỆN TẠI</span>
              {isIdle ? (
                <span className="status-badge-idle">
                  <span className="dot-pulse-green"></span>
                  🟢 ĐANG RẢNH RỖI
                </span>
              ) : (
                <span className="status-badge-busy">
                  <span className="dot-pulse-yellow"></span>
                  ⚡ ĐANG THỰC HIỆN CÔNG VIỆC
                </span>
              )}
            </div>
            <div className="activity-desc-box">
              {isIdle ? (
                <p className="activity-text idle">
                  Hiện nhân sự đang ở trạng thái <b>Rảnh rỗi</b>, sẵn sàng tiếp nhận nhiệm vụ kế hoạch, kịch bản hoặc sản xuất video mới.
                </p>
              ) : (
                <p className="activity-text busy">
                  <b>Đang thực hiện:</b> {currentActionDescription}
                </p>
              )}
            </div>
          </div>

          {/* MỤC 2: TRÁCH NHIỆM CHÍNH */}
          <div className="agent-info-card responsibilities-card">
            <div className="section-header-compact">
              <span className="section-num">3. TRÁCH NHIỆM CHÍNH</span>
            </div>
            <div className="resp-grid">
              <div className="resp-card-item">
                <span className="resp-icon">🎯</span>
                <div className="resp-content">
                  <div className="resp-title">Sứ mệnh cốt lõi</div>
                  <div className="resp-desc">{respInfo.mission}</div>
                </div>
              </div>
              <div className="resp-card-item">
                <span className="resp-icon">⚙️</span>
                <div className="resp-content">
                  <div className="resp-title">Công việc chính</div>
                  <div className="resp-desc">{respInfo.tasks}</div>
                </div>
              </div>
              <div className="resp-card-item">
                <span className="resp-icon">📦</span>
                <div className="resp-content">
                  <div className="resp-title">Sản phẩm đầu ra</div>
                  <div className="resp-desc">{respInfo.output}</div>
                </div>
              </div>
            </div>
          </div>

          {/* MỤC 4: MÔ HÌNH AI */}
          <div className="agent-info-card ai-model-card">
            <div className="section-header-compact">
              <span className="section-num">4. MÔ HÌNH AI</span>
            </div>
            <div className="ai-model-row">
              <div className="ai-model-select-wrap">
                <select
                  className="ai-model-select"
                  value={currentProfile.model}
                  onChange={(e) => updateModel(e.target.value)}
                >
                  <option value="claude-3-7-sonnet">🟣 Claude 3.7 Sonnet (Anthropic - Chuyên sâu kịch bản & văn học)</option>
                  <option value="gpt-4o">🟢 GPT-4o (OpenAI - Phản biện thép, tư duy logic & kiểm định)</option>
                  <option value="claude-3-5-sonnet">🔵 Claude 3.5 Sonnet (Anthropic - Tự nhiên, sâu lắng & cân bằng)</option>
                  <option value="gemini-2.0-flash">💎 Gemini 2.0 Flash (Google - Tốc độ cao & tối ưu đa nhiệm)</option>
                  <option value="gpt-4o-mini">⚡ GPT-4o Mini (OpenAI - Siêu tốc & tiết kiệm chi phí)</option>
                </select>
              </div>
              <span className="ai-model-indicator-badge">
                Đang kích hoạt: <b>{currentProfile.model}</b>
              </span>
            </div>
          </div>

          {/* MỤC 3: CÁC SKILL HIỆN CÓ */}
          <div className="agent-info-card skills-card">
            <div className="section-header-compact space-between">
              <div className="skills-header-title">
                <span className="section-num">5. CÁC SKILL HIỆN CÓ</span>
                <span className="skills-counter" style={{ backgroundColor: `${currentAgent.color}22`, color: currentAgent.color }}>
                  {equippedSkillList.length} Kỹ năng
                </span>
              </div>
              <button
                className="btn-toggle-skill-picker"
                onClick={() => setShowSkillPicker(!showSkillPicker)}
              >
                {showSkillPicker ? '✕ Đóng kho bổ sung' : '+ Thêm / Bớt kỹ năng'}
              </button>
            </div>

            {/* Danh sách các skill hiện có */}
            <div className="skills-badge-grid">
              {equippedSkillList.length === 0 ? (
                <div className="no-skills-notice">Chưa có kỹ năng nào được gán cho nhân sự này.</div>
              ) : (
                equippedSkillList.map((sk) => (
                  <div key={sk.id} className="skill-badge-card" style={{ borderColor: `${currentAgent.color}55` }}>
                    <div className="skill-badge-top">
                      <span className="skill-badge-icon">{sk.icon}</span>
                      <span className="skill-badge-name">{sk.title}</span>
                      <span className="skill-badge-tag">{sk.badge}</span>
                      {showSkillPicker && (
                        <button
                          className="btn-remove-badge"
                          onClick={() => toggleSkill(sk.id)}
                          title="Gỡ kỹ năng này"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    <div className="skill-badge-desc">{sk.description}</div>
                  </div>
                ))
              )}
            </div>

            {/* Bảng chọn thêm kỹ năng từ kho (chỉ mở khi bấm nút) */}
            {showSkillPicker && (
              <div className="skill-picker-subpanel animate-fade">
                <div className="picker-panel-title">KHO KỸ NĂNG CÓ THỂ BỔ SUNG (Click để nạp ngay):</div>
                <div className="picker-grid">
                  {unequippedSkills.map((sk) => (
                    <button
                      key={sk.id}
                      className="picker-skill-btn"
                      onClick={() => toggleSkill(sk.id)}
                    >
                      <span className="picker-icon">{sk.icon}</span>
                      <div className="picker-text">
                        <span className="picker-name">{sk.title}</span>
                        <span className="picker-tag">{sk.badge}</span>
                      </div>
                      <span className="picker-plus">+ Nạp</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* FOOTER: Lưu và Đóng */}
        <div className="agent-detail-footer">
          <div className="footer-toast">{toastMsg && <span className="toast-text animate-fade">{toastMsg}</span>}</div>
          <div className="footer-actions">
            <button className="btn btn-ghost" onClick={onClose}>
              Đóng
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving}
              style={{
                backgroundColor: currentAgent.color,
                boxShadow: `0 0 16px ${currentAgent.color}66`,
              }}
            >
              {saving ? '⏳ Đang lưu...' : 'Lưu thay đổi'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
