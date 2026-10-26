import type { AgentStatus } from './types';

export function agentIndicator(status: AgentStatus) {
  if (status === 'rejected') {
    return { label: 'GẶP LỖI', color: 0xf87171, background: 0x361e29, working: false };
  }
  if (['working', 'thinking', 'reviewing', 'assigned'].includes(status)) {
    return { label: 'ĐANG LÀM', color: 0xfbbf24, background: 0x342c1b, working: true };
  }
  if (status === 'walking') {
    return { label: 'DI CHUYỂN', color: 0x93c5fd, background: 0x1c2e48, working: false };
  }
  return { label: 'RẢNH RỖI', color: 0x6ee7b7, background: 0x17352e, working: false };
}
