import { customConnectors, officialConnectors, type AssemblyConnector } from '@fwx/geometry'
import type { DesignPartInstance } from '@fwx/parts-schema'
import { getCustomPart } from '../../utils/api'
import { useAuthStore } from '../../stores/authStore'
import { resolveCustomPart } from './customAssembly'

export async function loadAssemblySource(instance: DesignPartInstance): Promise<{ name: string; connectors: AssemblyConnector[] }> {
  if (!instance.source) return { name: instance.partId, connectors: officialConnectors(instance.partId) }
  const { token, user } = useAuthStore.getState()
  if (!token || !user) throw new Error('登录原账号后可读取插接口')
  const result = await getCustomPart(instance.source.id)
  if (useAuthStore.getState().token !== token) throw new Error('账号已切换，请重试')
  if (!result.success || !result.data) throw new Error(result.error || '原零件不可用')
  const source = resolveCustomPart(result.data, instance, user.id)
  return { name: source.name, connectors: customConnectors(source) }
}
