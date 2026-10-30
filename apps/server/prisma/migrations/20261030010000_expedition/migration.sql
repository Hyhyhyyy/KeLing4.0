-- CreateTable
CREATE TABLE "MaterialVersion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "parseStatus" TEXT NOT NULL DEFAULT 'READY',
    "parserVersion" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "supersedesId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MaterialVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceSpan" (
    "id" TEXT NOT NULL,
    "materialVersionId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "startUtf16" INTEGER NOT NULL,
    "endUtf16" INTEGER NOT NULL,
    "page" INTEGER,
    "paragraphIndex" INTEGER,
    "heading" TEXT NOT NULL DEFAULT '',
    "textHash" TEXT NOT NULL,

    CONSTRAINT "SourceSpan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpeditionProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "contentVersion" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpeditionProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "progressId" TEXT NOT NULL,
    "taskId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "writerDeviceId" TEXT NOT NULL DEFAULT '',
    "leaseEpoch" INTEGER NOT NULL DEFAULT 0,
    "leaseTokenHash" TEXT NOT NULL DEFAULT '',
    "leaseExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpeditionOperation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "opId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "receipt" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpeditionOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stableKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "exp" INTEGER NOT NULL,
    "crystals" INTEGER NOT NULL,
    "ruleVersion" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewardGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpeditionAccount" (
    "userId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "legacySnapshot" TEXT NOT NULL,
    "world" TEXT NOT NULL,
    "quotaDay" TEXT NOT NULL DEFAULT '',
    "cycleCount" INTEGER NOT NULL DEFAULT 0,
    "selfReportCount" INTEGER NOT NULL DEFAULT 0,
    "crystalsGranted" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpeditionAccount_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "MaterialVersion_userId_courseId_createdAt_idx" ON "MaterialVersion"("userId", "courseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialVersion_userId_materialId_version_key" ON "MaterialVersion"("userId", "materialId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "SourceSpan_materialVersionId_ordinal_key" ON "SourceSpan"("materialVersionId", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "ExpeditionProgress_userId_courseId_chapterId_key" ON "ExpeditionProgress"("userId", "courseId", "chapterId");

-- CreateIndex
CREATE INDEX "QuestRun_userId_courseId_updatedAt_idx" ON "QuestRun"("userId", "courseId", "updatedAt");

-- CreateIndex
CREATE INDEX "ExpeditionOperation_userId_scope_scopeId_createdAt_idx" ON "ExpeditionOperation"("userId", "scope", "scopeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExpeditionOperation_userId_opId_key" ON "ExpeditionOperation"("userId", "opId");

-- CreateIndex
CREATE UNIQUE INDEX "RewardGrant_userId_stableKey_key" ON "RewardGrant"("userId", "stableKey");

-- AddForeignKey
ALTER TABLE "MaterialVersion" ADD CONSTRAINT "MaterialVersion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceSpan" ADD CONSTRAINT "SourceSpan_materialVersionId_fkey" FOREIGN KEY ("materialVersionId") REFERENCES "MaterialVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpeditionProgress" ADD CONSTRAINT "ExpeditionProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestRun" ADD CONSTRAINT "QuestRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpeditionOperation" ADD CONSTRAINT "ExpeditionOperation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardGrant" ADD CONSTRAINT "RewardGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpeditionAccount" ADD CONSTRAINT "ExpeditionAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

