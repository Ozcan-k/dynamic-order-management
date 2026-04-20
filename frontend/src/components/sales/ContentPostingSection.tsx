import {
  CONTENT_POST_MATRIX,
  CONTENT_POST_TYPE_LABELS,
  ContentPostType,
  SALES_PLATFORM_LABELS,
  SalesPlatform,
} from '@dom/shared'
import type { ContentPostState } from '../../api/sales'

interface ContentPostingSectionProps {
  posts: ContentPostState[]
  onChange: (next: ContentPostState[]) => void
}

const PLATFORM_COLOR: Record<SalesPlatform, string> = {
  [SalesPlatform.FACEBOOK]: '#1877f2',
  [SalesPlatform.TIKTOK]: '#0f172a',
  [SalesPlatform.INSTAGRAM]: '#dc2743',
  [SalesPlatform.SHOPEE_VIDEO]: '#ee4d2d',
}

export default function ContentPostingSection({ posts, onChange }: ContentPostingSectionProps) {
  function update(platform: SalesPlatform, postType: ContentPostType, patch: Partial<ContentPostState>) {
    const next = posts.map((p) => (p.platform === platform && p.postType === postType ? { ...p, ...patch } : p))
    onChange(next)
  }

  return (
    <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
      {(Object.keys(CONTENT_POST_MATRIX) as SalesPlatform[]).map((platform) => (
        <div
          key={platform}
          style={{
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: PLATFORM_COLOR[platform],
              }}
            />
            <strong style={{ fontSize: '13px', color: '#0f172a' }}>{SALES_PLATFORM_LABELS[platform]}</strong>
          </div>

          {CONTENT_POST_MATRIX[platform].map((postType) => {
            const post = posts.find((p) => p.platform === platform && p.postType === postType)
            if (!post) return null
            return (
              <div key={postType} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: '#334155' }}>
                  <input
                    type="checkbox"
                    checked={post.completed}
                    onChange={(e) => update(platform, postType, { completed: e.target.checked })}
                    style={{ width: 16, height: 16, accentColor: PLATFORM_COLOR[platform] }}
                  />
                  <span style={{ fontWeight: 500 }}>{CONTENT_POST_TYPE_LABELS[postType]}</span>
                </label>
                {post.completed && (
                  <input
                    type="text"
                    placeholder="Optional note (link, caption ID...)"
                    value={post.note ?? ''}
                    onChange={(e) => update(platform, postType, { note: e.target.value || null })}
                    maxLength={500}
                    style={{
                      fontSize: '11px',
                      padding: '6px 10px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      background: '#f8fafc',
                      outline: 'none',
                    }}
                  />
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
