import { defineConfig } from 'tsup'

// The API loads this CJS entry. Bundle the shared TS contract rather than
// leaving require('@fwx/parts-schema') pointing at its browser TS entry.
export default defineConfig({ noExternal: ['@fwx/parts-schema'] })
