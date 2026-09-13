import { expect, it } from 'vitest'
import { editorHistory, initialDocument, type EditorHistory } from './editorState'

it('can undo and redo dimensions, shapes and clearing without discarding earlier work', () => {
  let state: EditorHistory = { past: [], present: initialDocument(), future: [] }
  const first = { ...state.present, reference: { width: 90, height: 60 } }
  state = editorHistory(state, { type: 'commit', document: first })
  state = editorHistory(state, { type: 'commit', document: { ...first, shapes: [{ id: 'a', kind: 'rectangle', operation: 'add', x: 1, y: 2, width: 30, height: 20, radius: 2 }] } })
  state = editorHistory(state, { type: 'commit', document: { ...first, shapes: [] } })
  state = editorHistory(state, { type: 'undo' })
  expect(state.present.shapes).toHaveLength(1)
  state = editorHistory(state, { type: 'undo' })
  expect(state.present.reference).toEqual({ width: 90, height: 60 })
  state = editorHistory(state, { type: 'redo' })
  expect(state.present.shapes).toHaveLength(1)
  state = editorHistory(state, { type: 'commit', document: { ...state.present, constrain: false } })
  expect(state.future).toHaveLength(0)
})
