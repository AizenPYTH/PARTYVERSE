/**
 * Error model shared by every feature. Server RPCs raise stable `PV_*`
 * codes (supabase/migrations); Supabase Auth returns its own codes. Both are
 * mapped to French user-facing messages here, in one place.
 */
export const errorMessages = {
  PV_NOT_AUTHENTICATED: 'Ta session a expiré. Reconnecte-toi.',
  PV_ACCOUNT_SUSPENDED: 'Ce compte est suspendu.',
  PV_RATE_LIMITED: 'Doucement ! Réessaie dans quelques instants.',
  PV_INVALID_INPUT: 'Saisie invalide.',
  PV_USERNAME_TAKEN: 'Ce pseudo est déjà pris.',
  PV_USERNAME_INVALID: '3 à 20 caractères : lettres minuscules, chiffres ou _.',
  PV_USERNAME_RESERVED: 'Ce pseudo n’est pas autorisé.',
  PV_ONBOARDING_REQUIRED: 'Termine la création de ton profil pour continuer.',
  PV_USER_NOT_FOUND: 'Joueur introuvable.',
  PV_USER_UNAVAILABLE: 'Ce joueur n’est pas disponible.',
  PV_CANNOT_TARGET_SELF: 'Impossible avec ton propre compte.',
  PV_ALREADY_FRIENDS: 'Vous êtes déjà amis.',
  PV_FRIEND_REQUESTS_DISABLED: 'Ce joueur n’accepte pas de demandes d’ami.',
  PV_REQUEST_NOT_FOUND: 'Cette demande n’existe plus.',
  PV_ITEM_NOT_OWNED: 'Tu ne possèdes pas encore cet objet.',
  PV_GAME_NOT_FOUND: 'Jeu introuvable.',
  PV_GAME_UNAVAILABLE: 'Ce jeu n’est pas encore disponible.',
  PV_GAME_NOT_PLAYABLE: 'Ce jeu n’est pas encore jouable.',
  PV_INVALID_SETTINGS: 'Ces réglages ne sont pas valides.',
  PV_LOBBY_NOT_FOUND: 'Ce salon n’existe plus.',
  PV_LOBBY_CLOSED: 'Ce salon est fermé.',
  PV_LOBBY_FULL: 'Ce salon est complet.',
  PV_LOBBY_FORBIDDEN: 'Tu ne peux pas rejoindre ce salon.',
  PV_LOBBY_IN_GAME: 'Une partie est en cours dans ce salon.',
  PV_NOT_LOBBY_HOST: 'Seul l’hôte peut faire ça.',
  PV_NOT_LOBBY_MEMBER: 'Tu ne fais pas partie de ce salon.',
  PV_ALREADY_IN_LOBBY: 'Ce joueur est déjà dans le salon.',
  PV_PLAYERS_NOT_READY: 'Tous les joueurs doivent être prêts.',
  PV_NOT_ENOUGH_PLAYERS: 'Il manque des joueurs.',
  PV_TOO_MANY_PLAYERS: 'Il y a trop de joueurs pour ce jeu.',
  PV_ALREADY_IN_MATCH: 'Termine d’abord ta partie en cours.',
  PV_SPECTATORS_DISABLED: 'Les spectateurs ne sont pas autorisés.',
  PV_INVITES_DISABLED: 'Ce joueur n’accepte pas d’invitations.',
  PV_NOT_FRIENDS: 'Tu ne peux inviter que tes amis.',
  PV_INVITATION_NOT_FOUND: 'Cette invitation n’existe plus.',
  PV_INVITATION_EXPIRED: 'Invitation expirée.',
  PV_MATCH_NOT_FOUND: 'Partie introuvable.',
  PV_MATCH_NOT_ACTIVE: 'Cette partie est terminée.',
  PV_NOT_A_PLAYER: 'Tu n’es pas joueur dans cette partie.',
  PV_NOT_YOUR_TURN: 'Ce n’est pas ton tour.',
  PV_STALE_STATE: 'La partie a changé, mise à jour…',
  PV_INVALID_MOVE: 'Coup invalide.',
  PV_COLUMN_FULL: 'Cette colonne est pleine.',
  PV_TURN_EXPIRED: 'Temps écoulé pour ce tour.',
  PV_TURN_NOT_EXPIRED: 'Le temps n’est pas encore écoulé.',
  PV_WRONG_GAME: 'Action incompatible avec ce jeu.',
  PV_MUTED: 'Tu ne peux pas envoyer de message pour le moment.',
  PV_MESSAGE_INVALID: 'Message invalide (300 caractères max).',
  PV_MESSAGE_DUPLICATE: 'Tu viens d’envoyer ce message.',
  PV_PROFILE_PRIVATE: 'Ce profil est privé.',
  PV_RANKED_UNAVAILABLE: 'Pas de partie classée pour ce mode.',
  PV_NETWORK: 'Connexion impossible. Vérifie ton réseau.',
  PV_BAD_RESPONSE: 'Réponse inattendue du serveur.',
  PV_NOT_CONFIGURED: 'Le service n’est pas configuré.',
  PV_UNKNOWN: 'Une erreur est survenue. Réessaie.',
  // Supabase Auth
  invalid_credentials: 'E-mail ou mot de passe incorrect.',
  email_not_confirmed: 'Confirme ton adresse e-mail avant de te connecter.',
  user_already_exists: 'Un compte existe déjà avec cet e-mail.',
  email_exists: 'Un compte existe déjà avec cet e-mail.',
  weak_password: 'Mot de passe trop faible.',
  over_email_send_rate_limit: 'Trop d’e-mails envoyés. Réessaie plus tard.',
  over_request_rate_limit: 'Trop de tentatives. Réessaie plus tard.',
  same_password: 'Choisis un mot de passe différent de l’actuel.',
  session_not_found: 'Ta session a expiré. Reconnecte-toi.',
  otp_expired: 'Ce lien a expiré. Demande-en un nouveau.',
  bad_code_verifier: 'Ce lien doit être ouvert sur l’appareil où tu as fait la demande.',
} as const;

export type ErrorCode = keyof typeof errorMessages;

export class AppError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, options?: { cause?: unknown }) {
    super(errorMessages[code], options);
    this.name = 'AppError';
    this.code = code;
  }
}

const isErrorCode = (value: unknown): value is ErrorCode =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(errorMessages, value);

/** Normalizes Postgrest, Auth, network and unknown errors. */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error && typeof error === 'object') {
    const { message, code } = error as { message?: unknown; code?: unknown };
    if (typeof message === 'string') {
      const pv = message.match(/PV_[A-Z_]+/)?.[0];
      if (isErrorCode(pv)) return new AppError(pv, { cause: error });
      if (/network request failed|failed to fetch|load failed|networkerror/i.test(message)) {
        return new AppError('PV_NETWORK', { cause: error });
      }
    }
    if (isErrorCode(code)) return new AppError(code, { cause: error });
  }
  return new AppError('PV_UNKNOWN', { cause: error });
}

export function errorMessage(error: unknown): string {
  return toAppError(error).message;
}
