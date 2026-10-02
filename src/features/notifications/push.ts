import { replayablePath } from '@/lib/pendingLink';

/** In-app destination carried by a push (`data.url`), or null if unusable. */
export function pushDestination(data: unknown): string | null {
  const url = (data as { url?: unknown } | null | undefined)?.url;
  return typeof url === 'string' ? replayablePath(url) : null;
}

export type PushStatus = 'unsupported' | 'unconfigured' | 'denied' | 'undetermined' | 'enabled';

export const PUSH_STATUS_TEXT: Record<PushStatus, string> = {
  unsupported: 'Les notifications push nécessitent l’app sur un téléphone (pas le web ni un simulateur).',
  unconfigured: 'Notifications push indisponibles dans cette version de l’app (projet EAS non configuré).',
  denied: 'Notifications refusées : active-les dans les réglages du téléphone.',
  undetermined: 'Reçois invitations, messages et défis même app fermée.',
  enabled: 'Notifications push activées sur cet appareil.',
};
