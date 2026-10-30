-- CreateTable
CREATE TABLE "AiSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "scenario" TEXT NOT NULL DEFAULT 'CONCEPT_EXPLAIN',
    "includeContext" BOOLEAN NOT NULL DEFAULT false,
    "retrievalMode" TEXT NOT NULL DEFAULT 'keyword',
    "embeddingProviderId" TEXT NOT NULL DEFAULT '',
    "embeddingModelId" TEXT NOT NULL DEFAULT '',
    "activeRequestId" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AiTurn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "userText" TEXT NOT NULL,
    "assistantText" TEXT NOT NULL DEFAULT '',
    "error" TEXT NOT NULL DEFAULT '',
    "errorCode" TEXT NOT NULL DEFAULT '',
    "sources" TEXT NOT NULL DEFAULT '[]',
    "usage" TEXT NOT NULL DEFAULT '{}',
    "providerId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "AiSession_userId_updatedAt_idx" ON "AiSession"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "AiTurn_userId_sessionId_createdAt_idx" ON "AiTurn"("userId", "sessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiTurn_userId_clientRequestId_key" ON "AiTurn"("userId", "clientRequestId");
