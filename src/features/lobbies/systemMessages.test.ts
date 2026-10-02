import type { LobbyMessage } from './api';
import { messageText } from './systemMessages';

const base: LobbyMessage = {
  id: '1',
  lobby_id: 'l',
  sender_id: null,
  sender_username: null,
  sender_display_name: null,
  sender_avatar_id: null,
  kind: 'system',
  body: 'member_joined',
  meta: { username: 'nova', display_name: 'Nova', role: 'player' },
  created_at: '2026-10-02T10:00:00Z',
};

describe('messageText', () => {
  it('renders system events', () => {
    expect(messageText(base)).toBe('Nova a rejoint le salon');
    expect(messageText({ ...base, meta: { ...base.meta, role: 'spectator' } })).toBe('Nova regarde la partie');
    expect(messageText({ ...base, body: 'host_changed' })).toBe('Nova est le nouvel hôte');
  });

  it('renders quick messages and plain text', () => {
    expect(messageText({ ...base, kind: 'quick', body: 'gg', sender_id: 'u' })).toBe('GG !');
    expect(messageText({ ...base, kind: 'text', body: 'salut', sender_id: 'u' })).toBe('salut');
  });
});
