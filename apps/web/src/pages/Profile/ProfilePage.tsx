import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Edit2, Save, X, Moon, Sun, Trash2, BookOpen, Palette, Calendar } from 'lucide-react'
import { PageContainer } from '../../components/layout/PageContainer'
import { Card } from '../../components/common/Card'
import { Button } from '../../components/common/Button'
import { EmptyState } from '../../components/common/EmptyState'
import { Modal } from '../../components/common/Modal'
import { useProfileStore } from '../../stores/profileStore'
import { useLearningStore } from '../../stores/learningStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useDesignStore } from '../../stores/designStore'
import { writeStorage } from '../../utils/localStorage'
import { STORAGE_KEYS } from '../../constants/storageKeys'
import { useToast } from '../../components/common/Toast'
import type { Design } from '../../types/design'
import { useAuthStore } from '../../stores/authStore'
import { getMe, updateProfile, deleteDroneDesignByLocal } from '../../utils/api'
import { NameDroneDialog } from '../Design/components/NameDroneDialog'

export function ProfilePage() {
  const accountId = useAuthStore(s => s.user?.id)
  return <ProfileContent key={accountId ?? 'anonymous'} />
}

function ProfileContent() {
  const nav = useNavigate()
  const { profile, update } = useProfileStore()
  const { progress } = useLearningStore()
  const { settings, setTheme } = useSettingsStore()
  const setActiveDesignId = useDesignStore((s) => s.setActiveDesignId)
  const designs = useDesignStore((s) => s.designs)
  const deleteDesign = useDesignStore((s) => s.deleteDesign)
  const createDesign = useDesignStore((s) => s.createDesign)
  const toast = useToast()
  const { user, token, setUser } = useAuthStore()
  const [saving, setSaving] = useState(false)
  const [showNewDesign, setShowNewDesign] = useState(false)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    void getMe().then(result => {
      if (cancelled || useAuthStore.getState().token !== token) return
      if (result.success && result.data) {
        const account = result.data
        update({ nickname: account.profile?.displayName || account.nickname || account.username, avatarUrl: account.profile?.avatar || account.avatarUrl, school: account.profile?.school || '', grade: account.profile?.grade || '' })
      } else toast.push('error', result.error || '账号资料加载失败，请重试')
    })
    return () => { cancelled = true }
  }, [token, update, toast])

  const [editing, setEditing] = useState(false)
  const [editNickname, setEditNickname] = useState(profile.nickname)
  const [editSchool, setEditSchool] = useState(profile.school || '')
  const [editGrade, setEditGrade] = useState(profile.grade || '')
  const [showClearModal, setShowClearModal] = useState(false)

  const myProjects = useMemo<Design[]>(() => designs, [designs])

  const handleSave = async () => {
    if (!editNickname.trim() || saving) return
    setSaving(true)
    if (token && user && !user.isGuest) {
      const result = await updateProfile({ profile: { displayName: editNickname.trim(), school: editSchool.trim(), grade: editGrade.trim() } })
      if (useAuthStore.getState().token !== token || useAuthStore.getState().user?.id !== user.id) { setSaving(false); return }
      if (!result.success || !result.data) { toast.push('error', result.error || '保存失败'); setSaving(false); return }
      setUser({ ...user, nickname: editNickname.trim() })
    }
    update({ nickname: editNickname, school: editSchool || undefined, grade: editGrade || undefined })
    setSaving(false)
    setEditing(false)
    toast.push('success', '保存成功')
  }

  const handleCancel = () => {
    setEditNickname(profile.nickname)
    setEditSchool(profile.school || '')
    setEditGrade(profile.grade || '')
    setEditing(false)
  }

  const handleClearData = () => {
    writeStorage(STORAGE_KEYS.DESIGN_STORE, { state: { designs: [], activeDesignId: null }, version: 0 })
    writeStorage(STORAGE_KEYS.LEARNING_PROGRESS, { completedLessons: [], totalStudyTime: 0, studyDays: [] })
    writeStorage(STORAGE_KEYS.USER_PROFILE, { nickname: '小小设计师' })
    writeStorage(STORAGE_KEYS.APP_SETTINGS, { theme: 'light', language: 'zh-CN' })
    window.location.reload()
  }

  const handleDeleteProject = async (id: string) => {
    if (token && !user?.isGuest) {
      const result = await deleteDroneDesignByLocal(id)
      if (useAuthStore.getState().token !== token || useAuthStore.getState().user?.id !== user?.id) return
      if (!result.success) { toast.push('error', result.error || '删除失败'); return }
    }
    deleteDesign(id)
    toast.push('success', '删除成功')
  }

  const handleCreateProject = () => {
    setShowNewDesign(true)
  }
  const createNamed = (name: string, mode: 'guided' | 'free') => {
    const id = createDesign(name || '未命名无人机', mode)
    setActiveDesignId(id)
    setShowNewDesign(false)
    nav(`/design/${id}`)
  }

  return (
    <PageContainer className="py-8">
      <NameDroneDialog open={showNewDesign} onCancel={() => setShowNewDesign(false)} onConfirm={createNamed} />
      <div className="space-y-6">
        {/* 用户信息卡片 */}
        <Card className="group">
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              {editing ? (
                <div className="space-y-4">
                  <div>
                    <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-200">昵称</label>
                    <input
                      type="text"
                      value={editNickname}
                      disabled={saving}
                      onChange={(e) => setEditNickname(e.target.value)}
                      className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-800 dark:text-white"
                      placeholder="请输入昵称"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-200">学校</label>
                    <input
                      type="text"
                      value={editSchool}
                      disabled={saving}
                      onChange={(e) => setEditSchool(e.target.value)}
                      className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-800 dark:text-white"
                      placeholder="请输入学校（可选）"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-200">年级</label>
                    <input
                      type="text"
                      value={editGrade}
                      disabled={saving}
                      onChange={(e) => setEditGrade(e.target.value)}
                      className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-slate-800 dark:text-white"
                      placeholder="请输入年级（可选）"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" loading={saving} disabled={!editNickname.trim()} leftIcon={<Save className="h-4 w-4" />} onClick={handleSave}>
                      保存
                    </Button>
                    <Button size="sm" variant="outline" disabled={saving} leftIcon={<X className="h-4 w-4" />} onClick={handleCancel}>
                      取消
                    </Button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="mb-4 flex items-center gap-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-sky-600 text-2xl font-extrabold text-white">
                      {profile.nickname[0] || '设'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="break-words text-2xl font-extrabold text-wood-900 dark:text-white">{profile.nickname}</h2>
                      {profile.school && (
                        <p className="mt-1 break-words text-sm text-slate-600 dark:text-slate-300">
                          {profile.school} {profile.grade && `· ${profile.grade}`}
                        </p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      leftIcon={<Edit2 className="h-4 w-4" />}
                      onClick={() => { setEditNickname(profile.nickname); setEditSchool(profile.school || ''); setEditGrade(profile.grade || ''); setEditing(true) }}
                    >
                      编辑
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* 学习统计 */}
        <Card>
          <h3 className="mb-4 text-lg font-extrabold text-wood-900 dark:text-white">本机学习记录</h3>
          <p>这些记录仅保存在当前浏览器，不与账号同步。课程功能暂未开放。</p>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg bg-wood-50 p-4 dark:bg-slate-800">
              <div className="mb-2 flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-sky-600" />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">已记录课时</span>
              </div>
              <div className="text-2xl font-extrabold text-wood-900 dark:text-white">
                {progress.completedLessons.length}
              </div>
            </div>
            <div className="rounded-lg bg-wood-50 p-4 dark:bg-slate-800">
              <div className="mb-2 flex items-center gap-2">
                <Calendar className="h-5 w-5 text-sky-600" />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">已记录时长</span>
              </div>
              <div className="text-2xl font-extrabold text-wood-900 dark:text-white">
                {Math.round(progress.totalStudyTime)} 分钟
              </div>
            </div>
            <div className="rounded-lg bg-wood-50 p-4 dark:bg-slate-800">
              <div className="mb-2 flex items-center gap-2">
                <Calendar className="h-5 w-5 text-sky-600" />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">已记录天数</span>
              </div>
              <div className="text-2xl font-extrabold text-wood-900 dark:text-white">{progress.studyDays.length} 天</div>
            </div>
          </div>
        </Card>

        {/* 我的作品 */}
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-extrabold text-wood-900 dark:text-white">我的作品</h3>
            <Button
              size="sm"
              variant="primary"
              leftIcon={<Palette className="h-4 w-4" />}
              onClick={handleCreateProject}
            >
              新建设计
            </Button>
          </div>
          {myProjects.length === 0 ? (
            <EmptyState
              icon={<Palette size={18} />}
              title="暂无设计作品"
              description="新建设计后，可以选择零件并组装无人机模型。"
              action={{ label: '新建设计', onClick: handleCreateProject, buttonProps: { variant: 'primary' } }}
            />
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-2 md:grid md:grid-cols-2 md:overflow-visible lg:grid-cols-3">
              {myProjects.map((project) => (
                <Card key={project.id} hoverable className="min-w-[260px] md:min-w-0">
                  <div className="aspect-video overflow-hidden rounded-lg bg-gradient-to-br from-sky-100 to-sky-200 dark:from-sky-900/30 dark:to-sky-800/30">
                    <div className="flex h-full items-center justify-center text-sm font-extrabold text-sky-600 dark:text-sky-400">
                      {project.parts.length} 个零件
                    </div>
                  </div>
                  <div className="mt-3">
                    <h4 className="mb-1 truncate font-extrabold text-wood-900 dark:text-white">{project.name}</h4>
                    <p className="mb-3 text-xs text-slate-600 dark:text-slate-300">
                      {new Date(project.updatedAt).toLocaleDateString('zh-CN')}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => {
                          setActiveDesignId(project.id)
                          nav('/design')
                        }}
                      >
                        打开
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDeleteProject(project.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </Card>

        {/* 设置区域 */}
        <Card>
          <h3 className="mb-4 text-lg font-extrabold text-wood-900 dark:text-white">设置</h3>
          <div className="mb-5 flex flex-wrap gap-5 text-sm text-sky-800">
            <Link to="/privacy/settings" className="underline underline-offset-4">隐私设置</Link>
            <Link to="/privacy" className="underline underline-offset-4">隐私与数据保护</Link>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {settings.theme === 'dark' ? (
                  <Moon className="h-5 w-5 text-slate-600 dark:text-slate-300" />
                ) : (
                  <Sun className="h-5 w-5 text-slate-600 dark:text-slate-300" />
                )}
                <div>
                  <div className="font-semibold text-slate-900 dark:text-white">主题</div>
                  <div className="text-sm text-slate-600 dark:text-slate-300">
                    {settings.theme === 'dark' ? '深色模式' : '浅色模式'}
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setTheme(settings.theme === 'dark' ? 'light' : 'dark')}
              >
                切换
              </Button>
            </div>
            <div className="border-t border-black/5 pt-4 dark:border-white/10">
              <Button
                variant="outline"
                leftIcon={<Trash2 className="h-4 w-4" />}
                onClick={() => setShowClearModal(true)}
                className="text-error hover:bg-error/10"
              >
                清除本机作品与设置
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* 清除数据确认模态框 */}
      <Modal
        open={showClearModal}
        onClose={() => setShowClearModal(false)}
        title="确认清除数据"
      >
        <div className="space-y-4">
          <p className="text-slate-700 dark:text-slate-200">
            此操作将清除当前浏览器中的以下数据，不会删除服务器中的作品：
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
            <li>本机设计作品，包括尚未同步的草稿</li>
            <li>学习进度</li>
            <li>本机个人资料与设置</li>
          </ul>
          <p className="text-sm text-error">此操作不可恢复，请谨慎操作！</p>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setShowClearModal(false)}>
              取消
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                handleClearData()
                setShowClearModal(false)
              }}
              className="bg-error hover:bg-error/90"
            >
              确认清除
            </Button>
          </div>
        </div>
      </Modal>
    </PageContainer>
  )
}
