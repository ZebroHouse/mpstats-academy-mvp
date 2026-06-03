import type { DriveStep } from 'driver.js';

export type TourPage = 'dashboard' | 'learn' | 'lesson';

const TOUR_PAGES: Record<string, TourPage> = {
  '/dashboard': 'dashboard',
  '/learn': 'learn',
};

// Learn sub-section routes (D-01). `/learn` server-redirects to one of these, so
// the learn tour fires here rather than on the (now content-less) `/learn` entry.
const LEARN_SUB_ROUTES = ['/learn/plan', '/learn/solutions', '/learn/library', '/learn/favorites'];

export function getTourForPage(pathname: string): TourPage | null {
  if (TOUR_PAGES[pathname]) return TOUR_PAGES[pathname];
  if (LEARN_SUB_ROUTES.includes(pathname)) return 'learn';
  // Individual lesson pages (/learn/<lessonId>) keep the lesson tour.
  if (pathname.startsWith('/learn/')) return 'lesson';
  return null;
}

export function getLocalStorageKey(page: TourPage): string {
  return `tour_${page}_completed`;
}

// --- Dashboard Tour (4 steps) ---

export const dashboardSteps: DriveStep[] = [
  {
    element: '[data-tour="sidebar-nav"]',
    popover: {
      title: 'Навигация',
      description: 'Здесь находятся все разделы: диагностика, обучение, профиль и тарифы.',
    },
  },
  {
    element: '[data-tour="dashboard-diagnostic-cta"]',
    popover: {
      title: 'Начните с диагностики',
      description: 'Пройдите тест из 15 вопросов, чтобы узнать свои сильные и слабые стороны.',
    },
  },
  {
    element: '[data-tour="dashboard-skill-radar"]',
    popover: {
      title: 'Профиль навыков',
      description: 'После диагностики здесь появится ваш Radar Chart по 5 компетенциям.',
    },
  },
  {
    element: '[data-tour="dashboard-learn-cta"]',
    popover: {
      title: 'Персональный трек',
      description: 'На основе результатов мы подберём уроки именно для вас.',
    },
  },
];

// --- Learn Tour: "База знаний" variant (no diagnostic plan) ---
// Fires on /learn/library and /learn/solutions, where the search box and the
// courses block live. Anchors re-homed for the 4-route split (D-10, 61-02).

const learnCoursesSteps: DriveStep[] = [
  {
    element: '[data-tour="learn-submenu"]',
    popover: {
      title: 'Разделы обучения',
      description: 'Персональный план, решения под задачу, База знаний и Избранное — переключайтесь между ними здесь.',
    },
  },
  {
    element: '[data-tour="learn-search"]',
    popover: {
      title: 'Поиск по урокам',
      description: 'Ищите уроки по ключевым словам. AI найдёт релевантные фрагменты.',
    },
  },
  {
    element: '[data-tour="learn-add-to-track"]',
    popover: {
      title: 'База знаний',
      description: 'Здесь собраны все курсы платформы. Откройте любой курс, чтобы начать обучение.',
    },
  },
];

// --- Learn Tour: "Персональный план" variant (diagnostic completed) ---
// Fires on /learn/plan, where the diagnostic sections live.

const learnTrackSteps: DriveStep[] = [
  {
    element: '[data-tour="learn-submenu"]',
    popover: {
      title: 'Разделы обучения',
      description: 'Персональный план, решения под задачу, База знаний и Избранное — переключайтесь между ними здесь.',
    },
  },
  {
    element: '[data-tour="learn-sections"]',
    popover: {
      title: 'Секции плана',
      description: 'Ваш план разделён по приоритету: «Ошибки» — темы, где диагностика выявила пробелы; «Углубление» — закрепление базовых навыков; «Развитие» — новые компетенции; «Продвинутый» — темы для опытных.',
    },
  },
];

// --- Lesson Tour (5 steps) ---

export const lessonSteps: DriveStep[] = [
  {
    element: '[data-tour="lesson-video"]',
    popover: {
      title: 'Видеоурок',
      description: 'Основной контент урока. Используйте таймкоды из AI-ответов для быстрой навигации.',
    },
  },
  {
    element: '[data-tour="lesson-summary"]',
    popover: {
      title: 'AI-конспект',
      description: 'Автоматическое резюме урока с ключевыми тезисами и ссылками на таймкоды.',
    },
  },
  {
    element: '[data-tour="lesson-chat"]',
    popover: {
      title: 'AI-чат',
      description: 'Задайте вопрос по уроку — AI ответит с цитатами из видео.',
    },
  },
  {
    element: '[data-tour="lesson-comments"]',
    popover: {
      title: 'Комментарии',
      description: 'Обсуждайте урок с другими студентами. Можно отвечать на комментарии.',
    },
  },
  {
    element: '[data-tour="lesson-nav"]',
    popover: {
      title: 'Навигация',
      description: 'Переходите к следующему или предыдущему уроку одним нажатием.',
    },
  },
];

// --- Shared config ---

export const tourConfig = {
  popoverClass: 'mpstats-tour-popover',
  nextBtnText: 'Далее',
  prevBtnText: 'Назад',
  doneBtnText: 'Готово',
  progressText: '{{current}} из {{total}}',
};

// --- Get steps with context-aware adaptation ---

export function getSteps(page: TourPage, isMobile: boolean): DriveStep[] {
  let steps: DriveStep[];

  if (page === 'learn') {
    // Choose learn tour variant based on which sub-route is mounted:
    // /learn/plan renders the diagnostic sections (`learn-sections`) → plan tour.
    // /learn/library and /learn/solutions render the search + catalog → catalog tour.
    const hasPlanSections = !!document.querySelector('[data-tour="learn-sections"]');

    if (hasPlanSections) {
      steps = learnTrackSteps.map((s) => ({ ...s }));
    } else {
      steps = learnCoursesSteps.map((s) => ({ ...s }));
    }
  } else {
    const base = page === 'dashboard' ? dashboardSteps : lessonSteps;
    steps = base.map((s) => ({ ...s }));
  }

  // Dashboard step 1: swap sidebar-nav → mobile-nav on mobile
  if (page === 'dashboard' && isMobile && steps[0]) {
    steps[0] = {
      ...steps[0],
      element: '[data-tour="mobile-nav"]',
    };
  }

  return steps;
}
