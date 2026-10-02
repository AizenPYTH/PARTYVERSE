import { Avatar, type AvatarProps } from '@/design-system';

import { avatarHue, displayNameOf, initialsFor } from '@/features/profile/avatars';

export interface PlayerAvatarProps extends Omit<AvatarProps, 'hue' | 'initials'> {
  player: { avatar_id?: string | null; display_name?: string | null; username?: string | null };
}

export function PlayerAvatar({ player, accessibilityLabel, ...rest }: PlayerAvatarProps) {
  const name = displayNameOf(player);
  return (
    <Avatar
      {...rest}
      hue={avatarHue(player.avatar_id)}
      initials={initialsFor(name)}
      accessibilityLabel={accessibilityLabel ?? name}
    />
  );
}
