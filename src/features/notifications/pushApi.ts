import { callRpc, voidResult } from '@/lib/rpc';

export const pushApi = {
  register: (token: string, platform: 'ios' | 'android', deviceName: string) =>
    callRpc('register_push_token', { p_token: token, p_platform: platform, p_device_name: deviceName }, voidResult),
  unregister: (token: string) => callRpc('unregister_push_token', { p_token: token }, voidResult),
};
