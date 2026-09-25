import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { PostCard } from '../../../hooks/useCommunityFeed'
import { WorkCard } from './WorkCard'

function renderCover(coverUrl: string) {
  const post: PostCard = {
    id: 'cover-test',
    authorId: 'author-test',
    author: { id: 'author-test', username: '测试用户' },
    projectId: 'project-test',
    title: '测试作品',
    coverUrl,
    likeCount: 0,
    favoriteCount: 0,
    likedByMe: false,
    createdAt: '2026-09-25T00:00:00Z',
  }
  return renderToStaticMarkup(<WorkCard post={post} onOpen={() => {}} />)
}

describe('WorkCard cover', () => {
  it('uses existing WebP thumbnails for the six built-in community examples', () => {
    for (let n = 1; n <= 6; n += 1) {
      const name = `work0${n}`
      const markup = renderCover(`/resource/picture/student_works/${name}.png`)
      expect(markup).toContain(`src="/optimized/picture/student_works/${name}.webp"`)
    }
  })

  it('does not change uploaded or external cover URLs', () => {
    const urls = ['/uploads/member-design.png', 'https://example.com/cover.png']
    for (const url of urls) {
      expect(renderCover(url)).toContain(`src="${url}"`)
    }
  })
})
