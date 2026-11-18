-- CreateTable
CREATE TABLE "Intake" (
    "token" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "chineseName" TEXT NOT NULL,
    "answers" JSONB,
    "nameEdited" BOOLEAN,
    "submittedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "creatorAccountId" TEXT NOT NULL,

    CONSTRAINT "Intake_pkey" PRIMARY KEY ("token")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "path" TEXT NOT NULL,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);
