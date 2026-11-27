import type { Request, Response } from 'express';
export const app: (req: Request, res: Response, next: () => void) => void;
export const registerLearningPlanetGenerator: (generator: (input: {subject:string;level:string;goal:string}, signal: AbortSignal) => Promise<unknown>) => void;
export type NativeAiMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type NativeAiRequest = { messages: NativeAiMessage[]; maxOutputTokens: number; signal: AbortSignal; purpose?: 'study-plan' };
export type NativeAiResult = { content: string; usage?: { inputTokens?: number; outputTokens?: number } };
export const registerNativeAiBridge: (bridge: { providerId: 'miaoda'; name: '妙搭公共模型'; modelId: 'miaoda-chat'; publicEnabled: boolean; complete: (request: NativeAiRequest) => Promise<NativeAiResult> }) => void;
