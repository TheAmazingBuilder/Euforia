import type { Metadata } from "next";

import { LessonView } from "@/components/academy/lesson-view";

export const metadata: Metadata = {
  title: "Lesson",
};

export default async function AcademyLessonPage({
  params,
}: {
  params: Promise<{ courseId: string; lessonId: string }>;
}) {
  const { lessonId } = await params;
  return <LessonView lessonId={lessonId} />;
}
