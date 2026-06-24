'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ChevronDown,
  ChevronUp,
  Video,
  VideoOff,
  Database,
  Eye,
  EyeOff,
  Plus,
  PenLine,
  Trash2,
} from 'lucide-react';
import { HideConfirmDialog } from './HideConfirmDialog';
import { CreateLessonDialog } from './CreateLessonDialog';
import { DeleteLessonDialog } from './DeleteLessonDialog';

type Role = 'USER' | 'ADMIN' | 'SUPERADMIN';

interface Lesson {
  id: string;
  title: string;
  order: number;
  skillCategory: string;
  videoId: string | null;
  duration: number | null;
  isHidden: boolean;
  hiddenAt: Date | string | null;
  contentType: string;
  contentStatus: string;
}

interface CourseWithDetails {
  id: string;
  title: string;
  order: number;
  isHidden: boolean;
  hiddenAt: Date | string | null;
  _count: { lessons: number };
  chunkCount: number;
  lessons?: Lesson[];
}

interface CourseManagerProps {
  courses: CourseWithDetails[];
  currentUserRole: Role;
  /** SUPERADMIN-only toggle: include hidden lessons/courses in the list */
  includeHidden: boolean;
  onToggleIncludeHidden?: (next: boolean) => void;
}

const skillCategoryVariant: Record<string, 'analytics' | 'marketing' | 'content' | 'operations' | 'finance'> = {
  ANALYTICS: 'analytics',
  MARKETING: 'marketing',
  CONTENT: 'content',
  OPERATIONS: 'operations',
  FINANCE: 'finance',
};

export function CourseManager({
  courses,
  currentUserRole,
  includeHidden,
  onToggleIncludeHidden,
}: CourseManagerProps) {
  const [expandedCourse, setExpandedCourse] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const isSuperadmin = currentUserRole === 'SUPERADMIN';

  const moveCourse = trpc.admin.moveCourseToPosition.useMutation({
    onSuccess: () => {
      utils.admin.getCourses.invalidate();
    },
  });

  const updateCourseTitle = trpc.admin.updateCourseTitle.useMutation({
    onSuccess: () => {
      utils.admin.getCourses.invalidate();
    },
  });

  const toggleCourseHidden = trpc.admin.toggleCourseHidden.useMutation({
    onSuccess: () => {
      utils.admin.getCourses.invalidate();
    },
  });

  const handleMoveCourse = useCallback(
    (courseId: string, targetPosition: number) => {
      moveCourse.mutate({ courseId, targetPosition });
    },
    [moveCourse],
  );

  const handleUpdateCourseTitle = useCallback(
    (courseId: string, title: string) => {
      updateCourseTitle.mutate({ courseId, title });
    },
    [updateCourseTitle],
  );

  // Course-level hide confirmation state
  const [courseHideTarget, setCourseHideTarget] = useState<{
    courseId: string;
    title: string;
    action: 'hide' | 'unhide';
  } | null>(null);

  const handleRequestCourseHide = useCallback(
    (courseId: string, title: string, nextHidden: boolean) => {
      setCourseHideTarget({
        courseId,
        title,
        action: nextHidden ? 'hide' : 'unhide',
      });
    },
    [],
  );

  const handleConfirmCourseHide = useCallback(() => {
    if (!courseHideTarget) return;
    toggleCourseHidden.mutate(
      {
        courseId: courseHideTarget.courseId,
        hidden: courseHideTarget.action === 'hide',
      },
      {
        onSuccess: () => setCourseHideTarget(null),
      },
    );
  }, [courseHideTarget, toggleCourseHidden]);

  return (
    <>
      {/* SUPERADMIN-only: show/hide hidden content toggle */}
      {isSuperadmin && onToggleIncludeHidden && (
        <div className="flex items-center justify-end gap-2 pb-2">
          <label className="flex items-center gap-2 text-body-sm text-mp-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeHidden}
              onChange={(e) => onToggleIncludeHidden(e.target.checked)}
              className="w-4 h-4"
            />
            Показывать скрытый контент
          </label>
        </div>
      )}

      <div className="space-y-3">
        {courses.map((course) => (
          <CourseAccordion
            key={course.id}
            course={course}
            isExpanded={expandedCourse === course.id}
            onToggle={() => setExpandedCourse(expandedCourse === course.id ? null : course.id)}
            onMoveCourse={handleMoveCourse}
            onUpdateCourseTitle={handleUpdateCourseTitle}
            onRequestCourseHide={handleRequestCourseHide}
            currentUserRole={currentUserRole}
            includeHidden={includeHidden}
          />
        ))}
      </div>

      {courseHideTarget && (
        <HideConfirmDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setCourseHideTarget(null);
          }}
          kind="course"
          title={courseHideTarget.title}
          action={courseHideTarget.action}
          currentUserRole={currentUserRole}
          onConfirm={handleConfirmCourseHide}
          isPending={toggleCourseHidden.isPending}
        />
      )}
    </>
  );
}

function CourseAccordion({
  course,
  isExpanded,
  onToggle,
  onMoveCourse,
  onUpdateCourseTitle,
  onRequestCourseHide,
  currentUserRole,
  includeHidden,
}: {
  course: CourseWithDetails;
  isExpanded: boolean;
  onToggle: () => void;
  onMoveCourse: (courseId: string, targetPosition: number) => void;
  onUpdateCourseTitle: (courseId: string, title: string) => void;
  onRequestCourseHide: (courseId: string, title: string, nextHidden: boolean) => void;
  currentUserRole: Role;
  includeHidden: boolean;
}) {
  const utils = trpc.useUtils();
  const router = useRouter();
  const isSuperadmin = currentUserRole === 'SUPERADMIN';

  const courseLessons = trpc.admin.getCourseLessons.useQuery(
    { courseId: course.id, includeHidden },
    { enabled: isExpanded },
  );
  const moveLesson = trpc.admin.moveLessonToPosition.useMutation({
    onSuccess: () => {
      utils.admin.getCourseLessons.invalidate({ courseId: course.id });
    },
  });
  const updateLessonTitle = trpc.admin.updateLessonTitle.useMutation({
    onSuccess: () => {
      utils.admin.getCourseLessons.invalidate({ courseId: course.id });
    },
  });
  const toggleLessonHidden = trpc.admin.toggleLessonHidden.useMutation({
    onSuccess: () => {
      utils.admin.getCourseLessons.invalidate({ courseId: course.id });
      utils.admin.getCourses.invalidate();
    },
  });
  const deleteLesson = trpc.admin.deleteLesson.useMutation({
    onSuccess: () => {
      utils.admin.getCourseLessons.invalidate({ courseId: course.id });
      utils.admin.getCourses.invalidate();
      toast.success('Урок удалён');
      setLessonDeleteTarget(null);
    },
    onError: (e) => toast.error('Ошибка удаления: ' + e.message),
  });

  // Lesson delete confirmation state
  const [lessonDeleteTarget, setLessonDeleteTarget] = useState<{
    lessonId: string;
    title: string;
  } | null>(null);

  // Lesson order editing state
  const [editingLessonOrderId, setEditingLessonOrderId] = useState<string | null>(null);
  const [lessonOrderValue, setLessonOrderValue] = useState('');

  // Course order editing state
  const [editingCourseOrder, setEditingCourseOrder] = useState(false);
  const [courseOrderValue, setCourseOrderValue] = useState('');

  // Course title editing state
  const [editingCourseTitle, setEditingCourseTitle] = useState(false);
  const [courseTitleValue, setCourseTitleValue] = useState('');

  // Lesson title editing state
  const [editingLessonTitleId, setEditingLessonTitleId] = useState<string | null>(null);
  const [lessonTitleValue, setLessonTitleValue] = useState('');

  // Lesson hide confirmation state
  const [lessonHideTarget, setLessonHideTarget] = useState<{
    lessonId: string;
    title: string;
    action: 'hide' | 'unhide';
  } | null>(null);

  // Phase 52: notify subscribers on unhide
  const [notifyOnUnhide, setNotifyOnUnhide] = useState(false);

  // Create-lesson dialog state
  const [createOpen, setCreateOpen] = useState(false);

  // --- Lesson order handlers ---
  const handleLessonOrderClick = useCallback((lessonId: string, currentOrder: number) => {
    setEditingLessonOrderId(lessonId);
    setLessonOrderValue(String(currentOrder));
  }, []);

  const handleLessonOrderSubmit = useCallback(
    (lessonId: string) => {
      const target = parseInt(lessonOrderValue, 10);
      if (!isNaN(target) && target >= 1) {
        moveLesson.mutate({ lessonId, targetPosition: target });
      }
      setEditingLessonOrderId(null);
    },
    [lessonOrderValue, moveLesson],
  );

  // --- Course order handlers ---
  const handleCourseOrderClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingCourseOrder(true);
    setCourseOrderValue(String(course.order));
  }, [course.order]);

  const handleCourseOrderSubmit = useCallback(() => {
    const target = parseInt(courseOrderValue, 10);
    if (!isNaN(target) && target >= 1) {
      onMoveCourse(course.id, target);
    }
    setEditingCourseOrder(false);
  }, [courseOrderValue, course.id, onMoveCourse]);

  const handleCourseOrderCancel = useCallback(() => {
    setEditingCourseOrder(false);
  }, []);

  // --- Course title handlers ---
  const handleCourseTitleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingCourseTitle(true);
    setCourseTitleValue(course.title);
  }, [course.title]);

  const handleCourseTitleSubmit = useCallback(() => {
    const trimmed = courseTitleValue.trim();
    if (trimmed.length > 0 && trimmed !== course.title) {
      onUpdateCourseTitle(course.id, trimmed);
    }
    setEditingCourseTitle(false);
  }, [courseTitleValue, course.id, course.title, onUpdateCourseTitle]);

  const handleCourseTitleCancel = useCallback(() => {
    setEditingCourseTitle(false);
  }, []);

  // --- Lesson title handlers ---
  const handleLessonTitleClick = useCallback((lessonId: string, currentTitle: string) => {
    setEditingLessonTitleId(lessonId);
    setLessonTitleValue(currentTitle);
  }, []);

  const handleLessonTitleSubmit = useCallback(
    (lessonId: string, originalTitle: string) => {
      const trimmed = lessonTitleValue.trim();
      if (trimmed.length > 0 && trimmed !== originalTitle) {
        updateLessonTitle.mutate({ lessonId, title: trimmed });
      }
      setEditingLessonTitleId(null);
    },
    [lessonTitleValue, updateLessonTitle],
  );

  const handleLessonTitleCancel = useCallback(() => {
    setEditingLessonTitleId(null);
  }, []);

  // --- Lesson hide handlers ---
  const handleRequestLessonHide = useCallback(
    (lessonId: string, title: string, nextHidden: boolean) => {
      setLessonHideTarget({
        lessonId,
        title,
        action: nextHidden ? 'hide' : 'unhide',
      });
    },
    [],
  );

  const handleConfirmLessonHide = useCallback(() => {
    if (!lessonHideTarget) return;
    const target = lessonHideTarget;
    const shouldNotify = target.action === 'unhide' && notifyOnUnhide;
    toggleLessonHidden.mutate(
      {
        lessonId: target.lessonId,
        hidden: target.action === 'hide',
      },
      {
        onSuccess: () => {
          setLessonHideTarget(null);
          setNotifyOnUnhide(false);
          // Phase 52: fan-out content-update notification (fire-and-forget)
          if (shouldNotify) {
            void fetch('/api/admin/notify-content-update', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                courseId: course.id,
                items: [
                  { kind: 'lesson', id: target.lessonId, title: target.title },
                ],
              }),
            }).catch((err) => {
              console.warn('[admin/lessons] notify-content-update failed:', err);
            });
          }
        },
      },
    );
  }, [lessonHideTarget, toggleLessonHidden, notifyOnUnhide, course.id]);

  const courseHiddenBadge = course.isHidden && isSuperadmin ? (
    <Badge variant="default" size="sm" className="bg-mp-gray-200 text-mp-gray-600">
      Скрыт
    </Badge>
  ) : null;

  return (
    <div
      className={`border rounded-lg overflow-hidden ${
        course.isHidden
          ? 'border-mp-gray-300 bg-mp-gray-50/50 opacity-80'
          : 'border-mp-gray-200 bg-white'
      }`}
    >
      {/* Course header */}
      <div className="flex items-stretch">
        <button
          onClick={onToggle}
          className="flex-1 flex items-center justify-between px-4 py-3 hover:bg-mp-gray-50 transition-colors text-left"
        >
          <div className="flex items-center gap-3">
            {/* Course order — click to edit */}
            {editingCourseOrder ? (
              <input
                type="number"
                min={1}
                value={courseOrderValue}
                onChange={(e) => setCourseOrderValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCourseOrderSubmit();
                  if (e.key === 'Escape') handleCourseOrderCancel();
                }}
                onBlur={handleCourseOrderSubmit}
                onClick={(e) => e.stopPropagation()}
                autoFocus
                onFocus={(e) => e.target.select()}
                className="w-10 h-6 text-xs font-mono text-center border border-mp-blue-400 rounded bg-white focus:outline-none focus:ring-1 focus:ring-mp-blue-500"
              />
            ) : (
              <span
                onClick={handleCourseOrderClick}
                className="text-body-sm font-medium text-mp-gray-400 w-6 hover:text-mp-blue-600 hover:bg-mp-blue-50 rounded px-1 py-0.5 transition-colors cursor-pointer text-center"
                title="Click to change position"
              >
                #{course.order}
              </span>
            )}

            {/* Course title — click to edit */}
            {editingCourseTitle ? (
              <input
                type="text"
                value={courseTitleValue}
                onChange={(e) => setCourseTitleValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCourseTitleSubmit();
                  if (e.key === 'Escape') handleCourseTitleCancel();
                }}
                onBlur={handleCourseTitleSubmit}
                onClick={(e) => e.stopPropagation()}
                autoFocus
                onFocus={(e) => e.target.select()}
                className="text-body-md font-semibold text-mp-gray-900 border-b-2 border-mp-blue-400 bg-transparent focus:outline-none focus:border-mp-blue-500 min-w-[200px]"
              />
            ) : (
              <span
                onClick={handleCourseTitleClick}
                className={`text-body-md font-semibold hover:text-mp-blue-600 cursor-pointer border-b border-transparent hover:border-mp-blue-300 transition-colors ${
                  course.isHidden ? 'text-mp-gray-500 line-through' : 'text-mp-gray-900'
                }`}
                title="Click to edit title"
              >
                {course.title}
              </span>
            )}
            {courseHiddenBadge}
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="primary" size="sm">
              {course._count.lessons} lessons
            </Badge>
            <div className="flex items-center gap-1 text-xs text-mp-gray-500">
              <Database className="w-3 h-3" />
              {course.chunkCount} chunks
            </div>
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-mp-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-mp-gray-400" />
            )}
          </div>
        </button>

        {/* Hide/Unhide course button */}
        {(!course.isHidden || isSuperadmin) && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRequestCourseHide(course.id, course.title, !course.isHidden);
            }}
            className={`px-3 border-l border-mp-gray-200 flex items-center justify-center transition-colors ${
              course.isHidden
                ? 'text-mp-gray-400 hover:bg-mp-green-50 hover:text-mp-green-600'
                : 'text-mp-gray-400 hover:bg-red-50 hover:text-red-600'
            }`}
            title={course.isHidden ? 'Вернуть курс' : 'Скрыть курс'}
          >
            {course.isHidden ? (
              <EyeOff className="w-4 h-4" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
          </button>
        )}
      </div>

      {/* Lessons list */}
      {isExpanded && (
        <div className="border-t border-mp-gray-200">
          {courseLessons.isLoading ? (
            <div className="p-4 text-center text-body-sm text-mp-gray-400">
              Loading lessons...
            </div>
          ) : courseLessons.data && courseLessons.data.length > 0 ? (
            <div className="divide-y divide-mp-gray-100">
              {courseLessons.data.map((lesson) => (
                <div
                  key={lesson.id}
                  className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${
                    lesson.isHidden ? 'bg-mp-gray-50/70 opacity-70' : 'hover:bg-mp-gray-50'
                  }`}
                >
                  {/* Order number — click to edit */}
                  {editingLessonOrderId === lesson.id ? (
                    <input
                      type="number"
                      min={1}
                      value={lessonOrderValue}
                      onChange={(e) => setLessonOrderValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleLessonOrderSubmit(lesson.id);
                        if (e.key === 'Escape') setEditingLessonOrderId(null);
                      }}
                      onBlur={() => handleLessonOrderSubmit(lesson.id)}
                      autoFocus
                      onFocus={(e) => e.target.select()}
                      className="w-10 h-6 text-xs font-mono text-center border border-mp-blue-400 rounded bg-white focus:outline-none focus:ring-1 focus:ring-mp-blue-500"
                    />
                  ) : (
                    <button
                      onClick={() => handleLessonOrderClick(lesson.id, lesson.order)}
                      disabled={moveLesson.isPending}
                      className="w-8 text-xs font-mono text-mp-gray-400 text-right hover:text-mp-blue-600 hover:bg-mp-blue-50 rounded px-1 py-0.5 transition-colors cursor-pointer"
                      title="Click to change position"
                    >
                      {lesson.order}
                    </button>
                  )}

                  {/* Lesson title — click to edit */}
                  <div className="flex-1 min-w-0">
                    {editingLessonTitleId === lesson.id ? (
                      <input
                        type="text"
                        value={lessonTitleValue}
                        onChange={(e) => setLessonTitleValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleLessonTitleSubmit(lesson.id, lesson.title);
                          if (e.key === 'Escape') handleLessonTitleCancel();
                        }}
                        onBlur={() => handleLessonTitleSubmit(lesson.id, lesson.title)}
                        autoFocus
                        onFocus={(e) => e.target.select()}
                        className="w-full text-body-sm text-mp-gray-900 border-b-2 border-mp-blue-400 bg-transparent focus:outline-none focus:border-mp-blue-500"
                      />
                    ) : (
                      <p
                        onClick={() => handleLessonTitleClick(lesson.id, lesson.title)}
                        className={`text-body-sm truncate hover:text-mp-blue-600 cursor-pointer border-b border-transparent hover:border-mp-blue-300 transition-colors ${
                          lesson.isHidden ? 'text-mp-gray-500 line-through' : 'text-mp-gray-900'
                        }`}
                        title="Click to edit title"
                      >
                        {lesson.title}
                      </p>
                    )}
                  </div>

                  {/* Hidden badge (SUPERADMIN only) */}
                  {lesson.isHidden && isSuperadmin && (
                    <Badge variant="default" size="sm" className="bg-mp-gray-200 text-mp-gray-600 shrink-0">
                      Скрыт
                    </Badge>
                  )}

                  {/* Draft badge (text/interactive lessons not yet published) */}
                  {lesson.contentStatus === 'DRAFT' && (
                    <Badge variant="default" size="sm" className="bg-amber-100 text-amber-700 shrink-0">
                      Черновик
                    </Badge>
                  )}

                  {/* Skill category badge */}
                  <Badge
                    variant={skillCategoryVariant[lesson.skillCategory] || 'default'}
                    size="sm"
                  >
                    {lesson.skillCategory}
                  </Badge>

                  {/* Video status */}
                  {lesson.videoId ? (
                    <Video className="w-4 h-4 text-mp-green-500 shrink-0" />
                  ) : (
                    <VideoOff className="w-4 h-4 text-mp-gray-300 shrink-0" />
                  )}

                  {/* Edit + Delete (text/interactive lessons only — never VIDEO) */}
                  {lesson.contentType !== 'VIDEO' && (
                    <>
                      <button
                        onClick={() => router.push(`/admin/content/lessons/${lesson.id}`)}
                        className="p-1 rounded transition-colors shrink-0 text-mp-gray-400 hover:bg-mp-blue-50 hover:text-mp-blue-600"
                        title="Редактировать урок"
                      >
                        <PenLine className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() =>
                          setLessonDeleteTarget({ lessonId: lesson.id, title: lesson.title })
                        }
                        className="p-1 rounded transition-colors shrink-0 text-mp-gray-400 hover:bg-red-50 hover:text-red-600"
                        title="Удалить урок"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}

                  {/* Hide/Unhide button */}
                  {(!lesson.isHidden || isSuperadmin) && (
                    <button
                      onClick={() =>
                        handleRequestLessonHide(lesson.id, lesson.title, !lesson.isHidden)
                      }
                      disabled={toggleLessonHidden.isPending}
                      className={`p-1 rounded transition-colors shrink-0 ${
                        lesson.isHidden
                          ? 'text-mp-gray-400 hover:bg-mp-green-50 hover:text-mp-green-600'
                          : 'text-mp-gray-400 hover:bg-red-50 hover:text-red-600'
                      }`}
                      title={lesson.isHidden ? 'Вернуть урок' : 'Скрыть урок'}
                    >
                      {lesson.isHidden ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 text-center text-body-sm text-mp-gray-400">
              No lessons in this course
            </div>
          )}

          <div className="border-t border-mp-gray-100 p-3 bg-mp-gray-50">
            <Button variant="outline" size="sm" className="w-full" onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-1" /> Создать урок
            </Button>
          </div>
          {createOpen && <CreateLessonDialog courseId={course.id} onClose={() => setCreateOpen(false)} />}
        </div>
      )}

      {lessonHideTarget && (
        <HideConfirmDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) {
              setLessonHideTarget(null);
              setNotifyOnUnhide(false);
            }
          }}
          kind="lesson"
          title={lessonHideTarget.title}
          action={lessonHideTarget.action}
          currentUserRole={currentUserRole}
          onConfirm={handleConfirmLessonHide}
          isPending={toggleLessonHidden.isPending}
          notifyOption={
            lessonHideTarget.action === 'unhide'
              ? {
                  checked: notifyOnUnhide,
                  onChange: setNotifyOnUnhide,
                }
              : undefined
          }
        />
      )}

      {lessonDeleteTarget && (
        <DeleteLessonDialog
          lessonTitle={lessonDeleteTarget.title}
          isDeleting={deleteLesson.isPending}
          onConfirm={() => deleteLesson.mutate({ lessonId: lessonDeleteTarget.lessonId })}
          onClose={() => setLessonDeleteTarget(null)}
        />
      )}
    </div>
  );
}
