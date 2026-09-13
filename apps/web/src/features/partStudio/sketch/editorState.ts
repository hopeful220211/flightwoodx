import type { UserPartCategory } from '@fwx/parts-schema'
import type { SketchShape } from './model'

export const REFERENCES: { category: UserPartCategory; label: string; width: number; height: number; source: string }[] = [
  { category: 'mainboard', label: '主机身', width: 130, height: 130, source: 'core_hub_01 · 约128 × 128 mm' },
  { category: 'landing', label: '起落架', width: 80, height: 50, source: 'arm_01 · 约79 × 47 mm' },
  { category: 'guard', label: '保护板', width: 110, height: 110, source: 'joint_01 · 约108 × 106 mm' },
  { category: 'joint', label: '连接件', width: 45, height: 40, source: 'deco_01 · 约44 × 37 mm' },
  { category: 'deco', label: '装饰件', width: 45, height: 40, source: 'deco_01 · 约44 × 37 mm' },
]

export interface SketchDocument {
  shapes: SketchShape[]
  reference: { width: number; height: number; shape?: 'rectangle' | 'ellipse' }
  category: UserPartCategory
  constrain: boolean
}
export interface EditorHistory { past: SketchDocument[]; present: SketchDocument; future: SketchDocument[] }
export type EditorAction = { type: 'commit'; document: SketchDocument } | { type: 'undo' | 'redo' | 'reset' }
export function initialDocument(): SketchDocument {
  return { shapes: [], reference: { width: 130, height: 130, shape: 'ellipse' }, category: 'mainboard', constrain: true }
}
export function editorHistory(state: EditorHistory, action: EditorAction): EditorHistory {
  if (action.type === 'reset') return { past: [], present: { ...state.present, shapes: [] }, future: [] }
  if (action.type === 'commit') return { past: [...state.past, state.present].slice(-60), present: action.document, future: [] }
  if (action.type === 'undo' && state.past.length) return { past: state.past.slice(0, -1), present: state.past[state.past.length - 1], future: [state.present, ...state.future] }
  if (action.type === 'redo' && state.future.length) return { past: [...state.past, state.present], present: state.future[0], future: state.future.slice(1) }
  return state
}
