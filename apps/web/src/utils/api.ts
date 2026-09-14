import type { CommandProgram, DroneDesign, ParametricBodyParams } from '@fwx/shared'
import type { DroneDesignSnapshot, UserPartDef, UserPartDTO } from '@fwx/parts-schema'
import type { PartInstance } from '../types/design'
import { getAnalyticsHeaders } from '../features/analytics/client'

// API 基础配置
const API_URL = (
  import.meta.env.VITE_API_URL
  || '/api'
).replace(/\/+$/, '')

// 类型定义
export interface RegisterData {
  username: string
  email: string
  password: string
}

export interface LoginData {
  email: string
  password: string
}

export interface ApiResponse<T = unknown> {
  success: boolean
  status?: number
  data?: T
  message?: string
  error?: string
}

/** Do not re-label an envelope as a domain record, or treat missing data as saved. */
function payloadFailure<T>(response: ApiResponse<unknown>): ApiResponse<T> {
  return {
    success: false,
    status: response.status,
    message: response.message,
    error: response.error || '服务器返回的数据不完整，请重试',
  }
}

export interface UserResponse {
  id: string
  username: string
  nickname: string
  avatarUrl?: string
  createdAt: string
  email?: string
  role?: 'student' | 'teacher' | 'admin'
  lastLogin?: string
  profile?: { displayName?: string; avatar?: string; grade?: string; studentId?: string; school?: string }
}

export interface AuthResponse {
  user: UserResponse
  token: string
}

// ============= 工具函数 =============

/**
 * 获取保存的 token
 */
function getToken(): string | null {
  const authStorage = localStorage.getItem('auth-storage')
  if (!authStorage) return null

  try {
    const parsed = JSON.parse(authStorage)
    return parsed.state?.token || null
  } catch {
    return null
  }
}

/**
 * 通用的 fetch 封装
 */
export async function apiFetch<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = getToken()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(!endpoint.startsWith('/admin') && !endpoint.startsWith('/analytics') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes((options.method || 'GET').toUpperCase()) ? getAnalyticsHeaders() : {}),
    ...(options.headers as Record<string, string>),
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  // Attach admin access key for /admin/* endpoints
  if (endpoint.startsWith('/admin')) {
    const adminKey = sessionStorage.getItem('adminAccessKey')
    if (adminKey) {
      headers['X-Admin-Access-Key'] = adminKey
    }
  }

  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
      signal: options.signal ?? AbortSignal.timeout(20000),
    })

    if (response.status === 204) return { success: true, status: response.status }
    const result = await response.json().catch(() => null)

    if (!response.ok || result?.success === false || result === null) {
      // Clear admin key on 401 for admin endpoints
      if (response.status === 401 && endpoint.startsWith('/admin')) {
        sessionStorage.removeItem('adminAccessKey')
      }
      return {
        success: false,
        status: response.status,
        error: result?.error || result?.message || (response.status >= 500 ? '服务暂时不可用，请稍后重试' : '请求失败，请重试'),
      }
    }

    // 兼容不同的后端响应格式
    // 1. { data: [...] }
    // 2. { users: [...] }
    // 3. 直接返回数组 [...]
    const data = result.data ?? result.users ?? result

    return {
      success: true,
      status: response.status,
      data: data,
      message: result.message,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)
        ? '请求超时，请重试；当前编辑内容仍保留在本机'
        : '无法连接服务器，请检查网络后重试',
    }
  }
}

// ============= 认证相关 API =============

/**
 * 用户注册
 */
export async function register(data: RegisterData): Promise<ApiResponse<AuthResponse>> {
  return apiFetch<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

/**
 * 用户登录
 */
export async function login(data: LoginData): Promise<ApiResponse<AuthResponse>> {
  return apiFetch<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

/**
 * 获取当前用户信息
 */
export async function getMe(): Promise<ApiResponse<UserResponse>> {
  const result = await apiFetch<{ user: UserResponse }>('/auth/me')
  return { ...result, data: result.data?.user }
}

/**
 * 退出登录（如果后端需要处理）
 */
export async function logoutApi(): Promise<ApiResponse> {
  return apiFetch('/auth/logout', {
    method: 'POST',
  })
}

// ============= 用户相关 API =============

/**
 * 获取所有用户（管理员）
 */
export async function getAllUsers(): Promise<ApiResponse<UserResponse[]>> {
  return apiFetch<UserResponse[]>('/admin/users')
}

// ============= 管理后台 API =============

/**
 * Verify admin access key (pre-check for admin gate)
 */
export async function verifyAdminAccessKey(key: string): Promise<ApiResponse> {
  return apiFetch('/admin/verify-access-key', {
    method: 'POST',
    headers: { 'X-Admin-Access-Key': key },
  })
}

// ============= 设计导出 API =============

/**
 * Export design as CAD ZIP.
 * Returns a Blob for browser download.
 */
export async function exportDesignCad(
  designId: string,
): Promise<{ success: true; blob: Blob; fileName: string } | { success: false; error: string }> {
  const token = getToken()
  try {
    const response = await fetch(`${API_URL}/designs/${designId}/export-cad`, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      return { success: false, error: (err as { error?: string }).error || '导出失败' }
    }

    const blob = await response.blob()
    const disposition = response.headers.get('Content-Disposition') || ''
    const fileNameMatch = disposition.match(/filename="?([^"]+)"?/)
    const fileName = fileNameMatch ? decodeURIComponent(fileNameMatch[1]) : `flightwoodx-export-${designId}.zip`

    return { success: true, blob, fileName }
  } catch {
    return { success: false, error: '网络请求失败' }
  }
}

/**
 * 更新用户信息
 */
export async function updateUser(
  userId: string,
  data: Partial<{ nickname: string; avatarUrl: string }>
): Promise<ApiResponse<UserResponse>> {
  return apiFetch<UserResponse>(`/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

/**
 * 修改密码
 */
export async function changePassword(data: {
  oldPassword: string
  newPassword: string
}): Promise<ApiResponse> {
  return apiFetch('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

// ============= 设计作品相关 API =============

export interface Design {
  id: string
  name: string
  userId: string
  parts: PartInstance[]
  thumbnailUrl?: string
  createdAt: string
  updatedAt: string
}

/**
 * 获取用户的所有设计
 */
export async function getUserDesigns(): Promise<ApiResponse<Design[]>> {
  return apiFetch<Design[]>('/designs')
}

/**
 * 获取单个设计详情
 */
export async function getDesign(designId: string): Promise<ApiResponse<Design>> {
  return apiFetch<Design>(`/designs/${designId}`)
}

/**
 * 创建新设计
 */
export async function createDesign(data: {
  name: string
  parts: PartInstance[]
  thumbnailUrl?: string
}): Promise<ApiResponse<Design>> {
  return apiFetch<Design>('/designs', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

/**
 * 更新设计
 */
export async function updateDesign(
  designId: string,
  data: Partial<{ name: string; parts: PartInstance[]; thumbnailUrl: string }>
): Promise<ApiResponse<Design>> {
  return apiFetch<Design>(`/designs/${designId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

/**
 * 删除设计
 */
export async function deleteDesign(designId: string): Promise<ApiResponse> {
  return apiFetch(`/designs/${designId}`, {
    method: 'DELETE',
  })
}

/**
 * 获取公开的设计作品（作品展示页）
 */
export async function getPublicDesigns(): Promise<ApiResponse<Design[]>> {
  return apiFetch<Design[]>('/designs/public')
}

// ============= 文件上传相关 API =============

/**
 * 上传文件（头像、设计缩略图等）
 */
export async function uploadFile(file: File): Promise<ApiResponse<{ url: string }>> {
  const token = getToken()
  const formData = new FormData()
  formData.append('file', file)

  try {
    const response = await fetch(`${API_URL}/upload`, {
      method: 'POST',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      body: formData,
    })

    const result = await response.json()

    if (!response.ok) {
      return {
        success: false,
        error: result.error || '上传失败',
      }
    }

    return {
      success: true,
      data: result,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '上传失败',
    }
  }
}

// ============= 项目 (2.0) 相关 API =============

export interface ProjectData {
  id: string
  ownerId: string
  name: string
  designId?: string
  programId?: string
  coverUrl?: string
  visibility: 'private' | 'public'
  createdAt: string
  updatedAt: string
}

/**
 * 拉取分页接口的全部条目。后端 RFC-014 W3 列表默认每页 20，
 * 这里按 total 翻页拉全，保证调用方拿到完整列表（不静默截断成 20 条）。
 */
async function fetchAllItems<T>(path: string): Promise<ApiResponse<T[]>> {
  const all: T[] = []
  const pageSize = 100
  let page = 1
  let last: ApiResponse<{ items: T[]; total: number }> | null = null
  for (;;) {
    const sep = path.includes('?') ? '&' : '?'
    const res = await apiFetch<{ items: T[]; total: number }>(`${path}${sep}page=${page}&pageSize=${pageSize}`)
    last = res
    if (!res.success || !res.data) return res as unknown as ApiResponse<T[]>
    const body = res.data as unknown as { items?: T[]; total?: number }
    const items = body.items ?? (res.data as unknown as T[])
    all.push(...items)
    const total = typeof body.total === 'number' ? body.total : all.length
    if (items.length === 0 || all.length >= total) break
    page++
  }
  return { ...(last as ApiResponse<{ items: T[]; total: number }>), data: all } as unknown as ApiResponse<T[]>
}

/** 获取当前用户的所有项目（后端分页，前端翻页拉全） */
export async function getProjects(): Promise<ApiResponse<ProjectData[]>> {
  return fetchAllItems<ProjectData>('/projects')
}

/** 获取单个项目 */
export async function getProject(projectId: string): Promise<ApiResponse<ProjectData>> {
  const res = await apiFetch<{ project: ProjectData }>(`/projects/${projectId}`)
  if (res.success && res.data) {
    const project = (res.data as unknown as { project?: ProjectData }).project ?? res.data
    return { ...res, data: project as ProjectData }
  }
  return payloadFailure<ProjectData>(res)
}

/** 创建新项目 */
export async function createProject(data: {
  name: string
  designId?: string
  programId?: string
  visibility?: string
}): Promise<ApiResponse<ProjectData>> {
  const res = await apiFetch<{ project: ProjectData }>('/projects', {
    method: 'POST',
    body: JSON.stringify(data),
  })
  if (res.success && res.data) {
    const project = (res.data as unknown as { project?: ProjectData }).project ?? res.data
    return { ...res, data: project as ProjectData }
  }
  return payloadFailure<ProjectData>(res)
}

/** 更新项目 */
export async function updateProject(
  projectId: string,
  data: Partial<{ name: string; designId: string; programId: string; coverUrl: string; visibility: string }>,
): Promise<ApiResponse<ProjectData>> {
  const res = await apiFetch<{ project: ProjectData }>(`/projects/${projectId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
  // 后端返回 { project }，与 getProject/createProject 一致地解包，否则上层拿到的是包裹层而非项目本体
  if (res.success && res.data) {
    const project = (res.data as unknown as { project?: ProjectData }).project ?? res.data
    return { ...res, data: project as ProjectData }
  }
  return payloadFailure<ProjectData>(res)
}

/**
 * 上传项目封面（当前阶段无人机定格图）。
 * 直接传图片二进制（canvas.toBlob 的 Blob 当 body），不用 FormData。
 */
export async function uploadProjectCover(
  projectId: string,
  blob: Blob,
): Promise<ApiResponse<{ coverUrl: string }>> {
  return apiFetch<{ coverUrl: string }>(`/projects/${projectId}/cover`, {
    method: 'POST',
    headers: { 'Content-Type': blob.type || 'image/webp' },
    body: blob,
  })
}

/** 删除项目 */
export async function deleteProject(projectId: string): Promise<ApiResponse> {
  return apiFetch(`/projects/${projectId}`, {
    method: 'DELETE',
  })
}

// ============= 我的成就统计 / 活动 API =============

/** 上报学习/设计活跃时长（秒，后端累加；单次上限由后端限制为 3600） */
export async function postActivity(
  type: 'study' | 'design',
  seconds: number,
): Promise<ApiResponse<{ studyMinutes: number; designMinutes: number }>> {
  return apiFetch('/me/activity', {
    method: 'POST',
    body: JSON.stringify({ type, seconds }),
  })
}

/** 标记某课时完成（lessonId 去重累加，重复调不重复计） */
export async function completeLesson(
  lessonId: string,
): Promise<ApiResponse<{ lessonsCompleted: number }>> {
  return apiFetch('/me/lessons/complete', {
    method: 'POST',
    body: JSON.stringify({ lessonId }),
  })
}

/** 更新用户个人资料 */
export async function updateProfile(data: {
  username?: string
  profile?: { displayName?: string; avatar?: string; grade?: string; school?: string }
}): Promise<ApiResponse<UserResponse>> {
  const result = await apiFetch<{ user: UserResponse }>('/auth/profile', {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
  return { ...result, data: result.data?.user }
}

// ============= 无人机设计 (DroneDesign) API =============

export interface DroneDesignData extends Omit<DroneDesign, 'designData' | 'params'> {
  _id?: string
  params?: ParametricBodyParams
  parts: PartInstance[]
  /** 经过共享 schema 校验并带版本的设计快照；存量无快照记录可为 null。 */
  designData?: DroneDesignSnapshot | null
}

/** List current user's drone designs（后端分页，前端翻页拉全） */
export async function getDroneDesigns(): Promise<ApiResponse<DroneDesignData[]>> {
  return fetchAllItems<DroneDesignData>('/drone-designs')
}

/** Save (create) a drone design to backend */
export async function createDroneDesign(data: {
  name: string
  params?: DroneDesignData['params']
  parts?: unknown[]
  weightG?: number
  localId?: string
}): Promise<ApiResponse<DroneDesignData>> {
  const res = await apiFetch<{ design: DroneDesignData }>('/drone-designs', {
    method: 'POST',
    body: JSON.stringify(data),
  })
  if (res.success && res.data) {
    const design = (res.data as unknown as { design?: DroneDesignData }).design ?? res.data
    return { ...res, data: design as DroneDesignData }
  }
  return payloadFailure<DroneDesignData>(res)
}

/**
 * Idempotent upsert by localId（RFC-013 正路）——同一 localId 只对应一条记录，
 * 抗重复、抗弱网重试。存整份 designData 快照，支撑跨设备还原。
 */
const designWriteQueues = new Map<string, Map<string, Promise<ApiResponse<unknown>>>>()

function designQueueAccountKey(token: string): string {
  try {
    const id = JSON.parse(localStorage.getItem('auth-storage') || 'null')?.state?.user?.id
    if (typeof id === 'string' && id) return `user:${id}`
  } catch { /* Legacy sessions without a usable account id remain token-isolated. */ }
  return `token:${token}`
}

// All callers (dashboard, publish dialog and editor) share ordering, including
// across React unmounts. Recheck identity when a waiting write reaches the front.
function enqueueDesignWrite<T>(localId: string, write: () => Promise<ApiResponse<T>>): Promise<ApiResponse<T>> {
  const token = getToken()
  if (!token) return Promise.resolve({ success: false, status: 401, error: '请登录后保存作品' })
  // Account identity stays stable across reauthentication/token rotation.
  const accountKey = designQueueAccountKey(token)
  const queue = designWriteQueues.get(accountKey) ?? new Map<string, Promise<ApiResponse<unknown>>>()
  designWriteQueues.set(accountKey, queue)
  const previous = queue.get(localId)
  const run = (): Promise<ApiResponse<T>> => getToken() === token
    ? write()
    : Promise.resolve({ success: false, status: 401, error: '账号已变化，本次操作未执行' })
  const pending = (previous ?? Promise.resolve()).then(run, run)
  queue.set(localId, pending)
  const cleanUp = () => {
    if (queue.get(localId) === pending) queue.delete(localId)
    if (queue.size === 0) designWriteQueues.delete(accountKey)
  }
  void pending.then(cleanUp, cleanUp)
  return pending
}

export async function putDroneDesign(data: {
  localId: string
  name: string
  designData: DroneDesignSnapshot
  weightG?: number
  thumbnailUrl?: string
  status?: string
}): Promise<ApiResponse<DroneDesignData>> {
  const body = JSON.stringify(data)
  return enqueueDesignWrite(data.localId, async () => {
    const res = await apiFetch<{ design: DroneDesignData }>('/drone-designs', { method: 'PUT', body })
    if (res.success && res.data) {
      const design = (res.data as unknown as { design?: DroneDesignData }).design ?? res.data
      return { ...res, data: design as DroneDesignData }
    }
    return payloadFailure<DroneDesignData>(res)
  })
}

/** 按 localId 删除作品（与 putDroneDesign 的 upsert-by-localId 对称）。幂等：服务器没有该记录也返回成功。 */
export async function deleteDroneDesignByLocal(localId: string): Promise<ApiResponse> {
  return enqueueDesignWrite(localId, () => apiFetch(`/drone-designs/by-local/${encodeURIComponent(localId)}`, {
    method: 'DELETE',
  }))
}

/**
 * Update a drone design（PATCH by server id）。作品库合一后也用于「发布」时设公开/可复用。
 * 后端返回 { design } 包裹，这里与 create/put 一致地解包。
 */
export async function updateDroneDesign(
  designId: string,
  data: Partial<{
    name: string
    params: DroneDesignData['params']
    parts: unknown[]
    weightG: number
    status: string
    visibility: 'private' | 'public'
    reusable: boolean
    coverUrl: string
    programId: string
  }>,
): Promise<ApiResponse<DroneDesignData>> {
  const res = await apiFetch<{ design: DroneDesignData }>(`/drone-designs/${designId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
  if (res.success && res.data) {
    const design = (res.data as unknown as { design?: DroneDesignData }).design ?? res.data
    return { ...res, data: design as DroneDesignData }
  }
  return payloadFailure<DroneDesignData>(res)
}

/** Delete a drone design */
export async function deleteDroneDesign(designId: string): Promise<ApiResponse> {
  return apiFetch(`/drone-designs/${designId}`, { method: 'DELETE' })
}

/**
 * 上传作品封面（3D 定格图）到 drone-design 记录（取代按 Project 的封面上传）。
 * 直接传图片二进制（canvas.toBlob 的 Blob 当 body），不用 FormData。
 */
export async function uploadDroneDesignCover(
  designId: string,
  blob: Blob,
): Promise<ApiResponse<{ coverUrl: string }>> {
  return apiFetch<{ coverUrl: string }>(`/drone-designs/${designId}/cover`, {
    method: 'POST',
    headers: { 'Content-Type': blob.type || 'image/webp' },
    body: blob,
  })
}

// ============= 积木程序 (Program) API =============

export interface ProgramRecord {
  id: string
  _id?: string
  ownerId: string
  name: string
  blocklyXml: string
  commandProgram: CommandProgram
  createdAt: string
  updatedAt: string
}

/** 规整后端 { program } / { programs } 包裹，统一返回 id（兼容 _id）。 */
function normalizeProgram(p: ProgramRecord): ProgramRecord {
  return { ...p, id: p.id || (p as unknown as { _id: string })._id }
}

/** List current user's programs（按 updatedAt 倒序，后端分页前端翻页拉全） */
export async function getPrograms(): Promise<ApiResponse<ProgramRecord[]>> {
  const res = await fetchAllItems<ProgramRecord>('/programs')
  if (res.success && res.data) {
    return { ...res, data: res.data.map(normalizeProgram) }
  }
  return res
}

/** Get a single program by id */
export async function getProgram(programId: string): Promise<ApiResponse<ProgramRecord>> {
  const res = await apiFetch<{ program: ProgramRecord }>(`/programs/${programId}`)
  if (res.success && res.data) {
    const program = (res.data as unknown as { program?: ProgramRecord }).program ?? res.data
    return { ...res, data: normalizeProgram(program as ProgramRecord) }
  }
  return payloadFailure<ProgramRecord>(res)
}

/** Create (save) a program to backend */
export async function createProgram(data: {
  name: string
  blocklyXml: string
  commandProgram: CommandProgram
}): Promise<ApiResponse<ProgramRecord>> {
  const res = await apiFetch<{ program: ProgramRecord }>('/programs', {
    method: 'POST',
    body: JSON.stringify(data),
  })
  if (res.success && res.data) {
    const program = (res.data as unknown as { program?: ProgramRecord }).program ?? res.data
    return { ...res, data: normalizeProgram(program as ProgramRecord) }
  }
  return payloadFailure<ProgramRecord>(res)
}

/** Update a program */
export async function updateProgram(
  programId: string,
  data: Partial<{ name: string; blocklyXml: string; commandProgram: CommandProgram }>,
): Promise<ApiResponse<ProgramRecord>> {
  const res = await apiFetch<{ program: ProgramRecord }>(`/programs/${programId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
  if (res.success && res.data) {
    const program = (res.data as unknown as { program?: ProgramRecord }).program ?? res.data
    return { ...res, data: normalizeProgram(program as ProgramRecord) }
  }
  return payloadFailure<ProgramRecord>(res)
}

/** Delete a program */
export async function deleteProgram(programId: string): Promise<ApiResponse> {
  return apiFetch(`/programs/${programId}`, { method: 'DELETE' })
}

// ============= 学习课程相关 API =============

export interface Course {
  id: string
  title: string
  description: string
  thumbnailUrl: string
  duration: string
  difficulty: string
}

/**
 * 获取所有课程
 */
export async function getCourses(): Promise<ApiResponse<Course[]>> {
  return apiFetch<Course[]>('/courses')
}

/**
 * 获取课程详情
 */
export async function getCourse(courseId: string): Promise<ApiResponse<Course>> {
  return apiFetch<Course>(`/courses/${courseId}`)
}

// ===== 社区（RFC-017）=====
// 展示 DTO 在前端本地组合；社交原语契约来自 @fwx/shared，不在此重定义。

export interface CommunityAuthor {
  id: string
  username: string
  avatar?: string
}

export interface CommunityPostCard {
  id: string
  title: string
  description: string
  authorId: string
  author: CommunityAuthor | null
  projectId: string
  coverUrl?: string
  forkFromId?: string
  likeCount: number
  favoriteCount: number
  likedByMe: boolean
  createdAt: string
}

export interface CommunityPostDetail {
  id: string
  title: string
  description: string
  author: CommunityAuthor | null
  project: { id: string; name: string; coverUrl?: string; designId?: string; programId?: string; reusable: boolean } | null
  /** 完整作品页用：设计零件（含 3D 摆放），供复用 AssembledDrone / PartsList 渲染。无设计的示例作品为 null。 */
  design: { parts: PartInstance[] } | null
  forkFrom: { postId: string; title: string; authorName?: string } | null
  likeCount: number
  favoriteCount: number
  likedByMe: boolean
  createdAt: string
}

export interface CommunityListResult {
  items: CommunityPostCard[]
  total: number
  page: number
  pageSize: number
}

export interface CommunityListQuery {
  page?: number
  pageSize?: number
  sort?: 'new' | 'hot'
  q?: string
}

/** 社区作品分页列表（公域，游客可看） */
export async function getCommunityPosts(query: CommunityListQuery = {}): Promise<ApiResponse<CommunityListResult>> {
  const params = new URLSearchParams()
  if (query.page) params.set('page', String(query.page))
  if (query.pageSize) params.set('pageSize', String(query.pageSize))
  if (query.sort) params.set('sort', query.sort)
  if (query.q) params.set('q', query.q)
  const qs = params.toString()
  return apiFetch<CommunityListResult>(`/community/posts${qs ? `?${qs}` : ''}`)
}

/** 社区作品详情 */
export async function getCommunityPost(id: string): Promise<ApiResponse<CommunityPostDetail>> {
  const res = await apiFetch<{ post: CommunityPostDetail }>(`/community/posts/${id}`)
  if (res.success && res.data) {
    const post = (res.data as unknown as { post?: CommunityPostDetail }).post ?? (res.data as unknown as CommunityPostDetail)
    return { ...res, data: post as CommunityPostDetail }
  }
  return payloadFailure<CommunityPostDetail>(res)
}

/**
 * 发布作品到社区（幂等）。作品库合一后走 designId（DroneDesign 为真相源）；
 * 后端仍兼容旧 projectId，故两者都可选，新流程只传 designId。
 */
export async function createCommunityPost(data: {
  designId?: string
  projectId?: string
  title?: string
  description?: string
  reusable?: boolean
  forkFromPostId?: string
}): Promise<ApiResponse<{ post: { id: string; projectId: string; title: string }; alreadyPublished?: boolean }>> {
  return apiFetch(`/community/posts`, { method: 'POST', body: JSON.stringify(data) })
}

/** 点赞（幂等） */
export async function likeCommunityPost(id: string): Promise<ApiResponse<{ likeCount: number; likedByMe: boolean }>> {
  return apiFetch(`/community/posts/${id}/like`, { method: 'POST' })
}

/** 取消点赞（幂等） */
export async function unlikeCommunityPost(id: string): Promise<ApiResponse<{ likeCount: number; likedByMe: boolean }>> {
  return apiFetch(`/community/posts/${id}/like`, { method: 'DELETE' })
}

// ===== 自制零件工坊（UserPart v2 / RFC-024 §4.3）=====
// 契约类型来自 @fwx/parts-schema（前后端同源，不在此重定义）；全部端点需登录。

/** 「我的零件」分页列表返回体（后端 { items, total, page, pageSize }）。 */
export interface CustomPartListResult {
  items: UserPartDTO[]
  total: number
  page: number
  pageSize: number
}

/** 保存一件新自制零件（服务端补 id/ownerId、默认 status=draft）。 */
export async function createCustomPart(def: UserPartDef): Promise<ApiResponse<UserPartDTO>> {
  return apiFetch<UserPartDTO>('/custom-parts', {
    method: 'POST',
    body: JSON.stringify(def),
  })
}

/** 列出「我的零件」（仅本人，按更新时间倒序）。 */
export async function listCustomParts(page = 1, pageSize = 50): Promise<ApiResponse<CustomPartListResult>> {
  return apiFetch<CustomPartListResult>(`/custom-parts?page=${page}&pageSize=${pageSize}`)
}

/** 取单件自制零件（仅本人）。 */
export async function getCustomPart(id: string): Promise<ApiResponse<UserPartDTO>> {
  return apiFetch<UserPartDTO>(`/custom-parts/${id}`)
}

/** 更新自制零件（仅本人，幂等 upsert）。 */
export async function updateCustomPart(id: string, def: UserPartDef): Promise<ApiResponse<UserPartDTO>> {
  return apiFetch<UserPartDTO>(`/custom-parts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(def),
  })
}

/** 删除自制零件（仅本人）。 */
export async function deleteCustomPart(id: string): Promise<ApiResponse<{ id: string }>> {
  return apiFetch<{ id: string }>(`/custom-parts/${id}`, { method: 'DELETE' })
}
