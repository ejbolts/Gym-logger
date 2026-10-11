import { useState } from 'react';
import { profileInitial } from './profileDisplay';
import type { User } from './types';

/** The account's photo, or its initial when there is no photo or it cannot load. */
export function ProfileAvatar({
  user,
  className,
}: {
  user: Pick<User, 'display_name' | 'username' | 'profile_photo_url'>;
  className: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const url = user.profile_photo_url ?? null;
  const showPhoto = url !== null && url !== failedUrl;
  return (
    <span className={showPhoto ? `${className} has-photo` : className} aria-hidden="true">
      {showPhoto ? (
        <img src={url} alt="" decoding="async" onError={() => setFailedUrl(url)} />
      ) : (
        profileInitial(user)
      )}
    </span>
  );
}
