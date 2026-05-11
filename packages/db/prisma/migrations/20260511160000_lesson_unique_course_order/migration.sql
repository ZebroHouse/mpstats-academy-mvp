-- Lesson.order made unique per course (renumber done in-place on 2026-05-11)
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_courseId_order_key" UNIQUE ("courseId", "order");
