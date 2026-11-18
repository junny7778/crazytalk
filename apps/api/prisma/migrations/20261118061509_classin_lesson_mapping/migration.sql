-- CreateTable
CREATE TABLE "ClassInLesson" (
    "lessonId" TEXT NOT NULL,
    "courseId" TEXT,
    "classId" TEXT,
    "teacherUid" TEXT,
    "studentUid" TEXT,

    CONSTRAINT "ClassInLesson_pkey" PRIMARY KEY ("lessonId")
);
