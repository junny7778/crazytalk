ALTER TABLE "ClassInJob" ALTER COLUMN "lessonId" DROP NOT NULL;
ALTER TABLE "ClassInJob" ADD COLUMN "classLocalId" TEXT;
ALTER TABLE "ClassInLesson" ADD COLUMN "classLocalId" TEXT, ADD COLUMN "activityId" TEXT, ADD COLUMN "externalUpdatedAt" INTEGER, ADD COLUMN "externalFacts" JSONB;
CREATE TABLE "ClassInClass" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "studentId" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "courseId" TEXT,
  "name" TEXT NOT NULL,
  "ownerAccountId" TEXT NOT NULL,
  "studentUid" TEXT,
  "teacherUids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "mainTeacherUid" TEXT,
  "ownerMode" TEXT NOT NULL DEFAULT 'headteacher',
  "externalUpdatedAt" INTEGER,
  "externalFacts" JSONB
);
CREATE UNIQUE INDEX "ClassInClass_studentId_teacherId_key" ON "ClassInClass"("studentId", "teacherId");
CREATE UNIQUE INDEX "ClassInClass_courseId_key" ON "ClassInClass"("courseId");
