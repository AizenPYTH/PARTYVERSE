import { admin, asUser, createUser, expectError, makeFriends, rpc } from './helpers';

interface Thread {
  conversation_id: string | null;
  blocked_reason: string | null;
  messages: { sender_id: string; body: string }[];
}
interface Conversation {
  conversation_id: string;
  unread: number;
  user: { id: string };
  last_message: { body: string };
}

describe('direct messages', () => {
  it('lets friends chat, tracks unread counts and notifies without the body', async () => {
    const a = await createUser();
    const b = await createUser();
    await makeFriends(a, b);
    const sent = await rpc<{ conversation_id: string }>(a, 'send_direct_message', [b.id, 'Salut, une partie ?']);
    await rpc(a, 'send_direct_message', [b.id, 'Je suis dispo']);

    expect(await rpc<number>(b, 'count_unread_messages')).toBe(2);
    const [conversation] = await rpc<Conversation[]>(b, 'list_conversations');
    expect(conversation).toMatchObject({ conversation_id: sent.conversation_id, unread: 2, user: { id: a.id }, last_message: { body: 'Je suis dispo' } });
    const notifications = await admin<{ payload: object }>(
      `select payload from public.notifications where user_id = $1 and type = 'direct_message'`,
      [b.id],
    );
    expect(notifications).toEqual([{ payload: { conversation_id: sent.conversation_id } }]);

    const thread = await rpc<Thread>(b, 'get_direct_thread', [a.id, null, 50]);
    expect(thread.messages.map((m) => m.body)).toEqual(['Je suis dispo', 'Salut, une partie ?']);
    await rpc(b, 'mark_conversation_read', [sent.conversation_id]);
    expect(await rpc<number>(b, 'count_unread_messages')).toBe(0);
    const [read] = await admin<{ n: string }>(
      `select count(*) as n from public.notifications where user_id = $1 and type = 'direct_message' and read_at is null`,
      [b.id],
    );
    expect(Number(read!.n)).toBe(0);
  });

  it('respects privacy settings and blocks', async () => {
    const a = await createUser();
    const b = await createUser();
    await expectError(rpc(a, 'send_direct_message', [b.id, 'hello']), 'PV_MESSAGES_FRIENDS_ONLY');
    await asUser(b, `update public.user_settings set messages_from = 'everyone' where user_id = $1`, [b.id]);
    await rpc(a, 'send_direct_message', [b.id, 'hello']);
    await asUser(b, `update public.user_settings set messages_from = 'nobody' where user_id = $1`, [b.id]);
    await expectError(rpc(a, 'send_direct_message', [b.id, 'encore']), 'PV_MESSAGES_CLOSED');
    await asUser(b, `update public.user_settings set messages_from = 'everyone' where user_id = $1`, [b.id]);

    await rpc(b, 'block_user', [a.id]);
    await expectError(rpc(a, 'send_direct_message', [b.id, 'tu es là ?']), 'PV_USER_UNAVAILABLE');
    await expectError(rpc(a, 'get_direct_thread', [b.id, null, 50]), 'PV_USER_UNAVAILABLE');
    expect(await rpc<Conversation[]>(b, 'list_conversations')).toEqual([]);
    await expectError(rpc(a, 'send_direct_message', [a.id, 'moi']), 'PV_CANNOT_TARGET_SELF');
  });

  it('rejects spam: empty, too long, duplicates and floods', async () => {
    const a = await createUser();
    const b = await createUser();
    await makeFriends(a, b);
    await expectError(rpc(a, 'send_direct_message', [b.id, '   ']), 'PV_MESSAGE_INVALID');
    await expectError(rpc(a, 'send_direct_message', [b.id, 'x'.repeat(1001)]), 'PV_MESSAGE_INVALID');
    await rpc(a, 'send_direct_message', [b.id, 'même message']);
    await expectError(rpc(a, 'send_direct_message', [b.id, 'même message']), 'PV_MESSAGE_DUPLICATE');
    for (let i = 0; i < 7; i++) await rpc(a, 'send_direct_message', [b.id, `message ${i}`]);
    await expectError(rpc(a, 'send_direct_message', [b.id, 'un de trop']), 'PV_RATE_LIMITED');
  });

  it('keeps conversations private', async () => {
    const a = await createUser();
    const b = await createUser();
    const stranger = await createUser();
    await makeFriends(a, b);
    const { conversation_id } = await rpc<{ conversation_id: string }>(a, 'send_direct_message', [b.id, 'secret']);
    expect(await asUser(stranger, 'select * from public.direct_messages where conversation_id = $1', [conversation_id])).toEqual([]);
    expect(await asUser(stranger, 'select * from public.conversations where id = $1', [conversation_id])).toEqual([]);
    await expectError(rpc(stranger, 'mark_conversation_read', [conversation_id]), 'PV_CONVERSATION_NOT_FOUND');
    await expect(asUser(a, `insert into public.direct_messages (conversation_id, sender_id, body) values ($1, $2, 'x')`, [conversation_id, a.id]))
      .rejects.toThrow(/permission denied/);
  });
});

describe('reporting private messages', () => {
  it('captures the reported messages as evidence', async () => {
    const a = await createUser();
    const b = await createUser();
    await makeFriends(a, b);
    await rpc(b, 'send_direct_message', [a.id, 'message insultant']);
    const reportId = await rpc<string>(a, 'report_user', [b.id, 'direct_message', 'harassment', '', null]);
    const [report] = await admin<{ evidence: { messages: { body: string }[] } }>('select evidence from public.reports where id = $1', [reportId]);
    expect(report!.evidence.messages.map((m) => m.body)).toEqual(['message insultant']);
  });
});
