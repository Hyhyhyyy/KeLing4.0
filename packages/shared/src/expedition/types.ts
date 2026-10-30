export type ObjectiveKey = 'bt.bfs.queue' | 'bt.dfs.stack' | 'bt.bst.bounds';
export type RunMode = 'TRAINING' | 'INDEPENDENT';
export type QuestKind = 'EXPLORE' | 'TEACH' | 'TRIAL' | 'REVIEW';
export type RunStatus = 'ACTIVE' | 'PAUSED' | 'AWAITING_FEEDBACK' | 'SETTLED' | 'CANCELLED' | 'CONTENT_STALE';
export type EvidenceKind = 'ATTEMPTED' | 'INDEPENDENT' | 'DELAYED';
export interface TreeNode { id: string; value: number; left: string | null; right: string | null }
export interface Tree { root: string; nodes: TreeNode[] }
export interface SourceRef { materialVersionId: string; spanId: string; contentHash: string; startUtf16: number; endUtf16: number; page: number | null; paragraphIndex: number | null }
export interface Exercise {
  id: string; version: string; objectiveKey: ObjectiveKey; template: 'ROUTE_REPAIR' | 'TEACH_COMPANION';
  role: 'PRACTICE' | 'FRESH' | 'REVIEW'; title: string; prompt: string; tree: Tree;
  hints: string[]; rubric: string[]; sourceParagraph: number;
  review: { ruleVerified: boolean; humanStatus: 'PENDING' | 'APPROVED'; reviewer: string | null; reviewedAt: string | null };
}
export interface Chapter {
  id: string; version: string; title: string; materialTitle: string; materialParagraphs: string[]; references: string[];
  objectives: { key: ObjectiveKey; title: string; description: string }[]; exercises: Exercise[];
}
export interface Feedback { kind: 'RULE_CHECKED' | 'SELF_REPORTED' | 'AI_SUGGESTION'; correct: boolean | null; firstDeviation: number | null; stepDeviation?: number | null; expectedOrder?: string[]; message: string; rubric: string[]; independentEligible: boolean }
export interface Evidence { id: string; objectiveKey: ObjectiveKey; kind: EvidenceKind; runId: string; exerciseId: string; exerciseVersion: string; at: string; sources: SourceRef[]; judgment: 'RULE_CHECKED' | 'SELF_REPORTED'; strict: boolean }
export interface ReviewCycle { id: string; objectiveKey: ObjectiveKey; dueAt: string; anchorAt: string; kind: 'PRACTICE_FOLLOWUP' | 'VALIDATION'; completedAt: string | null }
export interface ObjectiveProgress { objectiveKey: ObjectiveKey; state: 'UNEXPLORED' | 'ATTEMPTED' | 'INDEPENDENT' | 'DELAYED'; evidenceIds: string[]; review: ReviewCycle | null }
export interface CompanionMemory { id: string; objectiveKey: ObjectiveKey; text: string; sources: SourceRef[]; confirmedAt: string; verification: 'SELF_REPORTED'; deletedAt: string | null }
export interface ProgressState { schemaVersion: 1; objectives: ObjectiveProgress[]; seenExerciseIds: string[]; companionMemories: CompanionMemory[] }
export interface Attempt { id: string; exerciseId: string; exerciseVersion: string; answer: Answer; at: string; hintsUsed: number; firstSubmission: boolean; feedback: Feedback }
export interface Answer { order?: string[]; structure?: 'QUEUE' | 'STACK'; steps?: { type: 'PUSH' | 'POP'; nodeId: string }[]; validBst?: boolean; explanation?: string; selfCheck?: string[] }
export interface RunState {
  schemaVersion: 1; id: string; courseId: string; chapterId: string; contentVersion: string; questKind: QuestKind; mode: RunMode;
  objectiveKey: ObjectiveKey; exerciseIds: string[]; exerciseIndex: number; status: RunStatus; revision: number;
  hintsUsed: number; attempts: Attempt[]; feedback: Feedback | null; sources: SourceRef[];
  nextStep: string | null; reviewCycleId: string | null; startedAt: string; settledAt: string | null; freshExerciseIds: string[];
  pausedAt?: string | null; pausedMs?: number; endedAt?: string | null;
}
export interface SessionTiming { asOf: string; elapsedMs: number; pausedMs: number; runningMs: number; label: 'SESSION_TIME_NOT_STUDY' }
export interface RunView extends RunState { writerDeviceId: string | null; leaseEpoch: number; leaseExpiresAt: string | null; timing?: SessionTiming }
export interface Writer { deviceId: string; epoch: number; token: string }
export type Action = { type: 'SUBMIT'; answer: Answer } | { type: 'HINT' } | { type: 'ACK_FEEDBACK'; nextStep: string; saveCompanion?: boolean } | { type: 'NEXT' | 'PAUSE' | 'RESUME' | 'CANCEL' };
export interface Command { opId: string; expectedRevision: number; writer: Writer; action: Action }
export interface RewardCandidate { stableKey: string; kind: 'CYCLE' | 'INDEPENDENT' | 'REVIEW' | 'SELF_REPORT'; exp: number; crystals: number; reason: string; sourceId: string }
export interface RewardGrant extends Omit<RewardCandidate, 'kind'> { kind: RewardCandidate['kind'] | 'PURCHASE'; id: string; ruleVersion: string; createdAt: string }
export interface Decoration { id: string; name: string; price: number; description: string }
export interface WorldState { slot: { id: 'base-1'; decorationId: string | null }; ownedDecorationIds: string[] }
export interface AccountView { revision: number; level: number; exp: number; crystals: number; legacy: { level: number; exp: number; crystals: number; energy: number; capturedAt: string }; world: WorldState; quota: { day: string; cycleCount: number; crystalsGranted: number; selfReportCount?: number } }
export interface SelfReportInput { opId: string; courseId?: string | null; title: string; notes?: string; durationMinutes: number }
export interface ProgressView { id: string; courseId: string; chapterId: string; revision: number; contentVersion: string; state: ProgressState }
export interface Receipt { opId: string; revision: number; serverTime: string; run: RunView; progress: ProgressView; account: AccountView; feedback: Feedback | null; evidenceDelta: Evidence[]; rewardGrants: RewardGrant[]; replayed: boolean }
export interface StartRunInput { opId: string; courseId: string; questKind: QuestKind; objectiveKey?: ObjectiveKey; mode: RunMode; deviceId: string }
export interface StartRunResponse { run: RunView; writer: Writer; progress: ProgressView; account: AccountView }
export interface LeaseInput { opId: string; expectedRevision: number; deviceId: string; intent: 'acquire' | 'renew' | 'release' | 'takeover'; writer?: Writer }
export interface MaterialVersionInput { materialId: string; version: number; title: string; format: 'TEXT' | 'MARKDOWN' | 'PDF' | 'SEED'; content: string; contentHash: string; parseStatus: 'READY' | 'FAILED'; parserVersion: string; sourceName: string; supersedesId?: string }
