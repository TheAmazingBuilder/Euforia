import type { Metadata } from "next";

import { QuizView } from "@/components/academy/quiz-view";

export const metadata: Metadata = {
  title: "Quiz",
};

export default async function AcademyQuizPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  return (
    <div className="mx-auto w-full max-w-3xl">
      <QuizView courseId={courseId} />
    </div>
  );
}
