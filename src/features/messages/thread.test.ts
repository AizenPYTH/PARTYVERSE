import { dayLabel, groupMessages } from './thread';

const msg = (id: string, sender: string, at: string) => ({ id, sender_id: sender, body: id, created_at: at });

describe('message thread', () => {
  it('groups consecutive messages by sender and day', () => {
    const newestFirst = [
      msg('d', 'me', '2026-10-02T09:01:00Z'),
      msg('c', 'other', '2026-10-02T09:00:00Z'),
      msg('b', 'other', '2026-10-01T20:00:00Z'),
      msg('a', 'other', '2026-10-01T19:59:00Z'),
    ];
    const groups = groupMessages(newestFirst, 'me');
    expect(groups.map((g) => [g.mine, g.messages.map((m) => m.id), g.day])).toEqual([
      [false, ['a', 'b'], '2026-10-01'],
      [false, ['c'], '2026-10-02'],
      [true, ['d'], null],
    ]);
  });

  it('labels days in French', () => {
    const now = new Date('2026-10-02T12:00:00Z');
    expect(dayLabel('2026-10-02', now)).toBe('Aujourd’hui');
    expect(dayLabel('2026-10-01', now)).toBe('Hier');
    expect(dayLabel('2026-03-14', now)).toBe('14 mars');
    expect(dayLabel('2025-12-25', now)).toBe('25 déc. 2025');
  });
});
