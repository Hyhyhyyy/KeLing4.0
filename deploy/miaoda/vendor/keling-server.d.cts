import type { Request, Response } from 'express';
export const app: (req: Request, res: Response, next: () => void) => void;
export const registerLearningPlanetGenerator: (generator: (input: {subject:string;level:string;goal:string}, signal: AbortSignal) => Promise<unknown>) => void;
