import type { Profile } from '../types'

interface AvatarProps {
  profile: Pick<Profile, 'display_name' | 'avatar_url'>
  size?: 'small' | 'regular' | 'large'
}

export function Avatar({ profile, size = 'regular' }: AvatarProps) {
  const className = `avatar${size === 'regular' ? '' : ` ${size}`}`
  const initial = profile.display_name.trim().slice(0, 1).toUpperCase() || '?'

  if (profile.avatar_url) {
    return (
      <span className={className} aria-hidden="true">
        <img src={profile.avatar_url} alt="" />
      </span>
    )
  }

  return <span className={className} aria-hidden="true">{initial}</span>
}
