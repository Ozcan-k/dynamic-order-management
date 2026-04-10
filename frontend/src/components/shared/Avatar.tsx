import { colors } from '../../theme'

interface AvatarProps {
  username: string
  size?: number
}

/**
 * Avatar — shows the first letter of a username in an indigo circle.
 */
export default function Avatar({ username, size = 28 }: AvatarProps) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: colors.avatar.bg,
        color: colors.avatar.text,
        fontSize: Math.round(size * 0.43) + 'px',
        fontWeight: 700,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      {username.charAt(0).toUpperCase()}
    </span>
  )
}
