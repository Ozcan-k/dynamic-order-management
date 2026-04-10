import { colors } from '../../theme'

interface PlatformBadgeProps {
  platform: string
}

/**
 * PlatformBadge — pill badge with a colored dot for SHOPEE / LAZADA / TIKTOK / OTHER.
 * Replaces the duplicated local implementations in OrderTable and PickerAdmin.
 */
export default function PlatformBadge({ platform }: PlatformBadgeProps) {
  const c = colors.platform[platform] ?? colors.platform.OTHER
  const label = platform.charAt(0) + platform.slice(1).toLowerCase()

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        backgroundColor: c.bg,
        color: c.text,
        padding: '3px 10px',
        borderRadius: '9999px',
        fontSize: '12px',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          backgroundColor: c.dot,
          display: 'inline-block',
          flexShrink: 0,
        }}
      />
      {label}
    </span>
  )
}
