import { describe, expect, it } from 'vitest'
import * as shared from './index'

// Keep the first red run executable against the old package (no analytics export).
const contracts = shared as unknown as Record<string, { safeParse: (v: unknown) => { success: boolean } }>
const event = {
  eventId: '19f24427-de44-4a02-b899-e76c9aa75cdf',
  sessionId: 'ba161784-14e2-4c2a-ab32-9beced992bd7',
  occurredAt: '2026-09-14T12:00:00.000Z',
  eventName: 'design_opened', route: 'design', release: '7a46441',
  properties: { designId: 'design-123' },
}

describe('analytics boundary', () => {
  it('classifies private resource routes without retaining IDs or query text', () => {
    expect(shared.normalizeAnalyticsRoute('/design/private-design?token=secret')).toBe('design')
    expect(shared.normalizeAnalyticsRoute('/design/export-preview/private-design')).toBe('export')
    expect(shared.normalizeAnalyticsRoute('/community/private-post#private')).toBe('community_post')
    expect(shared.normalizeAnalyticsRoute('/part-studio/')).toBe('part_studio')
    expect(shared.normalizeAnalyticsRoute('/private-student-input')).toBe('other')
  })
  it('drops unknown source labels and unrelated query values', () => {
    expect(shared.analyticsAttribution('?utm_source=school&utm_campaign=teacher_pilot&email=private')).toEqual({ source: 'school', campaign: 'teacher_pilot' })
    expect(shared.analyticsAttribution('?utm_source=student-name&utm_campaign=phone-number')).toEqual({})
  })
  it('accepts an explicitly named minimal event', () => {
    expect(contracts.AnalyticsBatchSchema?.safeParse({ events: [event] }).success).toBe(true)
  })
  it.each([
    { ...event, email: 'student@example.com' },
    { ...event, properties: { designId: 'design-123', name: 'student' } },
    { ...event, route: '/design/private?token=secret' },
    { ...event, properties: { designId: 'student@example.com' } },
    { ...event, eventName: 'design_saved', properties: { designId: 'd', change: 'created', nonempty: true } },
    { ...event, eventId: 'not-an-id' },
    { ...event, properties: { designId: 'd', svg: '<svg/>' } },
  ])('rejects extra fields, private content and forged business events', (input) => {
    expect(contracts.AnalyticsBatchSchema?.safeParse({ events: [input] }).success).toBe(false)
  })
  it('bounds batch size', () => {
    expect(contracts.AnalyticsBatchSchema?.safeParse({ events: [] }).success).toBe(false)
    expect(contracts.AnalyticsBatchSchema?.safeParse({ events: Array(21).fill(event) }).success).toBe(false)
  })
  it('requires explicit current-notice age confirmation', () => {
    const input = { anonymousId: event.sessionId, noticeVersion: 1, ageConfirmation: 'age_14_or_over' }
    expect(contracts.AnalyticsConsentRequestSchema?.safeParse(input).success).toBe(true)
    expect(contracts.AnalyticsConsentRequestSchema?.safeParse({ ...input, ageConfirmation: 'guardian' }).success).toBe(false)
    expect(contracts.AnalyticsConsentRequestSchema?.safeParse({ ...input, noticeVersion: 0 }).success).toBe(false)
  })
  it('requires an account program ID for completed binding', () => {
    expect(contracts.AnalyticsClientEventSchema?.safeParse({ ...event, eventName: 'program_bound', properties: { designId: 'd', destination: 'account' } }).success).toBe(false)
  })
  it('accepts server records only in the server contract', () => {
    const business = { ...event, eventId: 'server-business-key', eventName: 'design_saved', properties: { designId: 'd', change: 'created', nonempty: false } }
    expect(contracts.AnalyticsServerEventSchema?.safeParse(business).success).toBe(true)
    expect(contracts.AnalyticsClientEventSchema?.safeParse(business).success).toBe(false)
  })
  it('distinguishes first observed existing work from a verified edit', () => {
    expect(shared.AnalyticsServerEventSchema.safeParse({ ...event, eventName: 'design_saved', properties: { designId: 'd', change: 'observed', nonempty: true } }).success).toBe(true)
  })
  it('accepts a safe local design reference alongside the server identity', () => {
    const saved = { ...event, eventName: 'design_saved', properties: { designId: '507f1f77bcf86cd799439011', localDesignId: 'design-123', change: 'edited', nonempty: true } }
    expect(shared.AnalyticsServerEventSchema.safeParse(saved).success).toBe(true)
    expect(shared.AnalyticsServerEventSchema.safeParse({ ...saved, properties: { ...saved.properties, localDesignId: 'student@example.com' } }).success).toBe(false)
  })
  it('accepts only bounded report inputs and aggregate responses', () => {
    expect(contracts.AnalyticsReportQuerySchema?.safeParse({ environment: 'test' }).success).toBe(true)
    expect(contracts.AnalyticsReportQuerySchema?.safeParse({ userId: 'someone' }).success).toBe(false)
    expect(contracts.AnalyticsReportSchema?.safeParse({ environment: 'test', from: event.occurredAt, to: event.occurredAt, firstCollectedAt: null, events: [], registeredActiveCreators: 0, guestActiveBrowsers: 0, uniqueSavedDesigns: 0, uniqueSavedParts: 0, totalEvents: 0 }).success).toBe(true)
  })
})
