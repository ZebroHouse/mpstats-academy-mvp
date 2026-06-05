'use client';

import { useParams } from 'next/navigation';
import { PartnerLessonView } from '@/components/mpstats-tools/PartnerLessonView';

export default function PartnerLessonPage() {
  const params = useParams();
  const lessonId = params.lessonId as string;

  return <PartnerLessonView lessonId={lessonId} />;
}
