import { z } from 'zod';

import { callRpc, voidResult } from '@/lib/rpc';

const id = z.string().uuid();
const presence = z.string().nullable().optional();

const userSchema = z.object({
  id,
  username: z.string().nullable(),
  display_name: z.string().nullable(),
  avatar_id: z.string().nullable(),
  level: z.number().nullable(),
  presence,
});

export const conversationSchema = z.object({
  conversation_id: id,
  last_message_at: z.string(),
  user: userSchema,
  last_message: z.object({ body: z.string(), sender_id: id, created_at: z.string() }).nullable(),
  unread: z.number(),
});
export type Conversation = z.infer<typeof conversationSchema>;

export const directMessageSchema = z.object({ id, sender_id: id, body: z.string(), created_at: z.string() });
export type DirectMessage = z.infer<typeof directMessageSchema>;

export const threadSchema = z.object({
  conversation_id: id.nullable(),
  user: userSchema,
  blocked_reason: z.string().nullable(),
  other_read_at: z.string().nullable(),
  messages: z.array(directMessageSchema),
});
export type Thread = z.infer<typeof threadSchema>;

export const messagesApi = {
  conversations: () => callRpc('list_conversations', {}, z.array(conversationSchema)),
  thread: (userId: string, before?: string) =>
    callRpc('get_direct_thread', { p_user: userId, p_before: before ?? null, p_limit: 50 }, threadSchema),
  send: (userId: string, body: string) =>
    callRpc('send_direct_message', { p_recipient: userId, p_body: body }, directMessageSchema.extend({ conversation_id: id })),
  markRead: (conversationId: string) => callRpc('mark_conversation_read', { p_conversation: conversationId }, voidResult),
  unreadCount: () => callRpc('count_unread_messages', {}, z.number()),
};
