// One-time source generator, kept to document identical SQLite/PostgreSQL model contracts.
const fs = require('node:fs'); const path = require('node:path');
const root = path.resolve(__dirname, '..');
const schema = `

model AiSession {
  id String @id @default(uuid())
  userId String
  title String
  providerId String
  modelId String
  scenario String @default("CONCEPT_EXPLAIN")
  includeContext Boolean @default(false)
  retrievalMode String @default("keyword")
  embeddingProviderId String @default("")
  embeddingModelId String @default("")
  activeRequestId String @default("")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([userId, updatedAt])
}
model AiTurn {
  id String @id @default(uuid())
  sessionId String
  userId String
  clientRequestId String
  requestHash String
  status String @default("RUNNING")
  userText String
  assistantText String @default("")
  error String @default("")
  errorCode String @default("")
  sources String @default("[]")
  usage String @default("{}")
  providerId String
  modelId String
  expiresAt DateTime
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@unique([userId, clientRequestId])
  @@index([userId, sessionId, createdAt])
}
`;
for (const file of ['schema.prisma', 'schema.postgresql.prisma']) {
  const p = path.join(root, 'apps/server/prisma', file); let s = fs.readFileSync(p, 'utf8');
  if (!s.includes('model AiSession {')) fs.writeFileSync(p, s.replaceAll('\r\n', '\n') + schema);
}
