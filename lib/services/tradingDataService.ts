import {
  createRiskSettingsSchema,
  createTradeSchema,
  createTradeSignalSchema,
  listTradesQuerySchema,
  parseOrThrow,
  updateRiskSettingsSchema,
  updateTradeSignalSchema,
} from '@/lib/validation/trading';
import {
  createRiskSettings,
  listRiskSettingsByUser,
  updateRiskSettings,
} from '@/lib/repositories/riskSettingsRepository';
import { createTrade, findTradeByIdempotencyKey, listTradesByUser } from '@/lib/repositories/tradeRepository';
import {
  createTradeSignal,
  deleteTradeSignal,
  listTradeSignalsByUser,
  updateTradeSignal,
} from '@/lib/repositories/tradeSignalRepository';

export async function getTradeSignalsForUser(userId: string) {
  return listTradeSignalsByUser(userId);
}

export async function createTradeSignalForUser(userId: string, payload: unknown) {
  const validated = parseOrThrow(createTradeSignalSchema, payload);
  return createTradeSignal(userId, validated as Record<string, unknown>);
}

export async function updateTradeSignalForUser(userId: string, id: string, payload: unknown) {
  const validated = parseOrThrow(updateTradeSignalSchema, payload);
  return updateTradeSignal(userId, id, validated as Record<string, unknown>);
}

export async function deleteTradeSignalForUser(userId: string, id: string) {
  return deleteTradeSignal(userId, id);
}

export async function getTradesForUser(userId: string, query: unknown) {
  const filters = parseOrThrow(listTradesQuerySchema, query);
  return listTradesByUser(userId, filters);
}

export async function createTradeForUser(userId: string, payload: unknown) {
  const validated = parseOrThrow(createTradeSchema, payload);
  return createTrade(userId, validated as Record<string, unknown>);
}

export async function getTradeByIdempotencyForUser(userId: string, idempotencyKey: string) {
  return findTradeByIdempotencyKey(userId, idempotencyKey);
}

export async function getRiskSettingsForUser(userId: string) {
  return listRiskSettingsByUser(userId);
}

export async function createRiskSettingsForUser(userId: string, payload: unknown) {
  const validated = parseOrThrow(createRiskSettingsSchema, payload);
  return createRiskSettings(userId, validated as Record<string, unknown>);
}

export async function updateRiskSettingsForUser(userId: string, id: string, payload: unknown) {
  const validated = parseOrThrow(updateRiskSettingsSchema, payload);
  return updateRiskSettings(userId, id, validated as Record<string, unknown>);
}
