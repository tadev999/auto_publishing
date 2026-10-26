import { studioAPI } from '../core/api';
import { useEffect, useRef, useState } from 'react';
import { store } from '../core/store';
import { agentIndicator } from '../core/agentIndicator';
import type { AgentSkillProfile, SkillMeta, StudioAgent } from '../core/types';
import { MODEL_PROVIDERS, modelProvider, type ModelProvider } from '@endo/core/modelProvider';

interface AgentSkillModalProps {
  initialAgent: StudioAgent;
  allAgents: StudioAgent[];
  onClose: () => void;
}

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

export default function AgentSkillModal({ initialAgent, allAgents, onClose }: AgentSkillModalProps) {
  const [selectedId, setSelectedId] = useState(initialAgent.id);
  const [agents, setAgents] = useState(allAgents);
  const [skills, setSkills] = useState<SkillMeta[]>([]);
  const [saved, setSaved] = useState<Record<string, AgentSkillProfile>>({});
  const [drafts, setDrafts] = useState<Record<string, AgentSkillProfile>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('recommended');
  const [discarding, setDiscarding] = useState(false);
  const [catalogs, setCatalogs] = useState<Partial<Record<ModelProvider, string[]>>>({});
  const [catalogErrors, setCatalogErrors] = useState<Partial<Record<ModelProvider, string>>>({});
  const [catalogLoading, setCatalogLoading] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const dirtyIds = Object.keys(drafts).filter((id) => JSON.stringify(drafts[id]) !== JSON.stringify(saved[id]));
  const dirty = dirtyIds.length > 0;
  const agent = agents.find((item) => item.id === selectedId) || initialAgent;
  const profile = drafts[selectedId];
  const provider = profile ? modelProvider(profile.model) : null;
  const indicator = agentIndicator(agent.status);
  const models = provider ? catalogs[provider] ?? [...MODEL_PROVIDERS[provider].models] : [];

  const loadModels = async () => {
    if (!provider) return;
    const selected = provider;
    setCatalogLoading(true);
    setCatalogErrors((previous) => ({ ...previous, [selected]: '' }));
    try {
      const result = await studioAPI.getModels(selected);
      setCatalogs((previous) => ({ ...previous, [selected]: result.models }));
    } catch (error) {
      setCatalogErrors((previous) => ({ ...previous, [selected]: errorMessage(error) }));
    } finally { setCatalogLoading(false); }
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await studioAPI.getAgentSkills();
      if (!allAgents.every((item) => result.savedProfiles[item.id])) throw new Error('Server trả về hồ sơ agent không đầy đủ.');
      setSkills(result.availableSkills);
      setSaved(result.savedProfiles);
      setDrafts(result.savedProfiles);
      setMessage('');
    } catch (error) { setError(errorMessage(error)); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    void load();
    return store.subscribe((state) => setAgents([...state.agents]));
  }, []);

  useEffect(() => {
    const previous = document.activeElement;
    dialogRef.current?.focus();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const close = () => {
    if (saving) return;
    if (dirty) setDiscarding(true);
    else onClose();
  };
  const update = (patch: Partial<AgentSkillProfile>) => {
    if (!profile || saving) return;
    setDrafts((previous) => ({ ...previous, [selectedId]: { ...profile, ...patch } }));
    setMessage('');
  };
  const save = async () => {
    setSaving(true);
    setError('');
    setMessage('');
    const changes = Object.fromEntries(dirtyIds.map((id) => [id, drafts[id]]));
    try {
      const success = await studioAPI.saveAgentSkills(changes);
      if (!success) throw new Error('Server chưa xác nhận lưu cấu hình.');
      setSaved({ ...saved, ...changes });
      setMessage(`Đã lưu cấu hình cho ${dirtyIds.length} agent.`);
    } catch (error) { setError(errorMessage(error)); }
    finally { setSaving(false); }
  };
  const visibleSkills = skills.filter((skill) => {
    const equipped = profile?.equippedSkills.includes(skill.id);
    const matches = `${skill.title} ${skill.id} ${skill.description}`.toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi').trim());
    return matches && (filter === 'all' || (filter === 'enabled' ? equipped : equipped || skill.targetRoles?.includes(agent.role)));
  });

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="agent-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="agent-settings-title"
        tabIndex={-1} ref={dialogRef} onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') { event.stopPropagation(); close(); }
          if (event.key === 'Tab') {
            const items = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')];
            const first = items[0], last = items[items.length - 1];
            if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
              event.preventDefault(); last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault(); first?.focus();
            }
          }
        }}>
        <header className="agent-settings-header">
          <div><h2 id="agent-settings-title">Agent & kỹ năng</h2><p>Thay đổi có hiệu lực sau khi lưu, từ tác vụ tiếp theo.</p></div>
          <button className="admin-button" onClick={close} disabled={saving} aria-label="Đóng hồ sơ agent">×</button>
        </header>
        {discarding && (
          <div className="agent-discard" role="alert">
            <p>Có thay đổi chưa lưu ở {dirtyIds.length} agent. Đóng sẽ bỏ những thay đổi này.</p>
            <button className="admin-button" onClick={() => setDiscarding(false)}>Tiếp tục chỉnh sửa</button>
            <button className="admin-button admin-danger" disabled={saving} onClick={onClose}>Bỏ thay đổi và đóng</button>
          </div>
        )}
        <div className="agent-settings-layout">
          <nav className="agent-settings-nav" aria-label="Chọn agent">
            {agents.map((item) => (
              <button key={item.id} className={item.id === selectedId ? 'selected' : ''}
                aria-current={item.id === selectedId ? 'true' : undefined}
                onClick={() => { setSelectedId(item.id); setQuery(''); setMessage(''); }}>
                <span>{item.name}</span><small>{item.role}{dirtyIds.includes(item.id) ? ' · chưa lưu' : ''}</small>
              </button>
            ))}
          </nav>
          <div className="agent-settings-content">
            {loading ? <p role="status">Đang tải cấu hình từ server…</p> : !profile ? (
              <div role="alert"><p>{error || 'Không có hồ sơ agent.'}</p><button className="admin-button" onClick={() => void load()}>Thử tải lại</button></div>
            ) : (
              <>
                <section className="agent-settings-section">
                  <div className="agent-heading"><h3>{agent.name}</h3><span style={{ color: `#${indicator.color.toString(16).padStart(6, '0')}` }}>{indicator.label}</span></div>
                  <p>{agent.thought || 'Chưa có tác vụ hiện tại.'}</p>
                </section>
                <fieldset className="agent-settings-section" disabled={saving}>
                  <legend>Cấu hình xử lý</legend>
                    <div className="agent-model-grid">
                      <label>Nhà cung cấp AI
                        <select disabled={catalogLoading} value={provider || ''} onChange={(event) => {
                          const value = event.target.value;
                          if (value === 'gemini' || value === 'openai' || value === 'anthropic') {
                            update({ model: MODEL_PROVIDERS[value].models[0] });
                          }
                        }}>
                          <option value="" disabled>Chọn nhà cung cấp</option>
                          {Object.entries(MODEL_PROVIDERS).map(([id, value]) => <option key={id} value={id}>{value.label}</option>)}
                        </select>
                        <small>Dùng API key tương ứng trong Kết nối & API keys.</small>
                      </label>
                      <label>Model
                        <select aria-label="Danh sách model" value={models.includes(profile.model) ? profile.model : ''}
                          onChange={(event) => update({ model: event.target.value })}>
                          <option value="" disabled>Chọn model từ danh sách</option>
                          {models.map((model) => <option key={model} value={model}>{model}</option>)}
                        </select>
                        <input list="agent-models" value={profile.model} maxLength={100}
                          aria-label="Model ID"
                          aria-invalid={!provider}
                          onChange={(event) => update({ model: event.target.value })} />
                        <datalist id="agent-models">{models.map((model) => <option key={model} value={model} />)}</datalist>
                        <small>{provider ? 'Chọn gợi ý hoặc nhập model ID được tài khoản hỗ trợ. Không tự chuyển model khi lỗi.'
                          : 'Model ID phải bắt đầu bằng gemini-, gpt- hoặc claude-.'}</small>
                      </label>
                      <label>Temperature ({profile.temperature})
                        <input type="range" min="0" max="2" step="0.05" value={profile.temperature}
                          onChange={(event) => update({ temperature: Number(event.target.value) })} />
                        <small>Thấp: ổn định · cao: đa dạng. Một số model mới dùng mức cố định.</small>
                      </label>
                    </div>
                  <div className="agent-heading">
                    <span>{models.length} model {provider && catalogs[provider] ? 'từ tài khoản' : 'tham khảo'}</span>
                    <button type="button" className="admin-button" disabled={!provider || catalogLoading}
                      onClick={() => void loadModels()}>{catalogLoading ? 'Đang tải…' : 'Tải model từ API'}</button>
                  </div>
                  {provider && catalogErrors[provider] && <p className="admin-error" role="alert">{catalogErrors[provider]}</p>}
                  <p className="agent-field-help">Danh sách tham khảo có thể gồm model cũ hoặc chưa được cấp quyền. Tải từ API để xem model hiện có; có thể nhập ID khác.</p>
                  <label>Vai trò & trách nhiệm
                    <textarea rows={3} maxLength={4000} value={profile.responsibility}
                      onChange={(event) => update({ responsibility: event.target.value })} />
                    <small>Nhiệm vụ và phạm vi phụ trách của agent.</small>
                  </label>
                  <label>Phong cách
                    <select value={profile.tone} onChange={(event) => {
                      const tone = event.target.value;
                      if (tone === 'philosophy' || tone === 'viral' || tone === 'satire' || tone === 'practical' || tone === 'strict') update({ tone });
                    }}>
                      <option value="philosophy">Sâu sắc, điềm tĩnh</option>
                      <option value="practical">Rõ ràng, thực tế</option>
                      <option value="strict">Nghiêm ngặt, có căn cứ</option>
                      <option value="viral">Thu hút, dễ chia sẻ</option>
                      <option value="satire">Tự trào nhẹ nhàng</option>
                    </select>
                  </label>
                  <label>Chỉ dẫn bổ sung
                    <textarea rows={4} maxLength={20000} value={profile.systemPromptExtra || ''}
                      placeholder="Quy tắc bổ sung về nội dung, giọng văn hoặc tiêu chí đánh giá…"
                      onChange={(event) => update({ systemPromptExtra: event.target.value })} />
                    <small>Yêu cầu riêng về nội dung, cách làm việc hoặc tiêu chí đánh giá.</small>
                  </label>
                </fieldset>
                <section className="agent-settings-section">
                  <div className="agent-heading"><h3>Kỹ năng</h3><span>{profile.equippedSkills.length} đã chọn</span></div>
                  <div className="agent-skill-filters">
                    <input aria-label="Tìm kỹ năng" type="search" placeholder="Tìm theo tên, ID hoặc mô tả…" value={query} onChange={(event) => setQuery(event.target.value)} />
                    <select aria-label="Lọc kỹ năng" value={filter} onChange={(event) => setFilter(event.target.value)}>
                      <option value="recommended">Phù hợp vai trò</option><option value="enabled">Đã chọn</option><option value="all">Tất cả</option>
                    </select>
                  </div>
                  <p className="agent-field-help">Chọn kỹ năng phù hợp với nhiệm vụ. Các quy tắc an toàn luôn được áp dụng.</p>
                  <div className="agent-skill-list">
                    {visibleSkills.map((skill) => (
                      <label className="agent-skill-option" key={skill.id}>
                        <input type="checkbox" disabled={saving} checked={profile.equippedSkills.includes(skill.id)}
                          onChange={() => update({ equippedSkills: profile.equippedSkills.includes(skill.id)
                            ? profile.equippedSkills.filter((id) => id !== skill.id) : [...profile.equippedSkills, skill.id] })} />
                        <span><strong>{skill.title}</strong><code>{skill.id}</code><span>{skill.description}</span></span>
                      </label>
                    ))}
                    {visibleSkills.length === 0 && <p>Không có kỹ năng khớp bộ lọc. Thử từ khóa khác hoặc chọn “Tất cả”.</p>}
                  </div>
                </section>
              </>
            )}
          </div>
        </div>
        <footer className="agent-settings-footer">
          <div>
            {error && profile && <p className="admin-error" role="alert">{error}</p>}
            <p role="status">{message || (dirty ? `${dirtyIds.length} agent có thay đổi chưa lưu` : 'Không có thay đổi chưa lưu')}</p>
          </div>
          <div className="agent-settings-actions">
            <button className="admin-button" disabled={!dirty || saving || discarding} onClick={() => { setDrafts(saved); setMessage('Đã hoàn tác thay đổi chưa lưu.'); setError(''); }}>Hoàn tác</button>
            <button className="admin-button admin-primary" disabled={!dirty || saving || loading || discarding || dirtyIds.some((id) => !modelProvider(drafts[id].model) || !drafts[id].responsibility.trim())}
              onClick={() => void save()}>{saving ? 'Đang lưu…' : 'Lưu thay đổi'}</button>
          </div>
        </footer>
      </div>
    </div>
  );
}
