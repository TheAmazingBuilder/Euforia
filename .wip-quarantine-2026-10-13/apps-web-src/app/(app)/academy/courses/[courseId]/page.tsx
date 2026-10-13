import type { Metadata } from "next";

import { CourseDetailView } from "@/components/academy/course-detail-view";

export const metadata: Metadata = {
  title: "Course",
};

export default async function AcademyCoursePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  return <CourseDetailView courseId={courseId} />;
}
