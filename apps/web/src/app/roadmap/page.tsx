'use client';

import { Onest } from 'next/font/google';
import { V8Header } from '@/components/v8/V8Header';
import { V8Footer } from '@/components/v8/V8Footer';
import { Reveal } from '@/components/v8/Reveal';

const onest = Onest({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '700'],
  display: 'swap',
});

/* -- Brand tokens ------------------------------------------------ */
const BLUE = '#2C4FF8';
const BLUE_HOVER = '#1D39C1';
const GREEN = '#87F50F';
const DARK = '#0F172A';
const GRAY_BG = '#f4f4f4';
const TEXT = '#121212';

/* -- Roadmap data ------------------------------------------------ */

const shippedItems = [
  { title: 'AI-диагностика 2.0', desc: 'Адаптивный тест за 10 минут по 5 осям навыков с IRT-моделью' },
  { title: 'Каталог по 5 осям навыков', desc: 'Аналитика, Маркетинг, Контент, Операции, Финансы — 400+ уроков, 150+ часов контента' },
  { title: 'AI-ассистент с таймкодами', desc: 'Ответы по материалу каталога с цитатами и таймкодами из видео' },
  { title: 'Плейбуки под бизнес-задачи', desc: 'Готовые сценарии под типовые задачи селлера: «снизить ДРР», «настроить автобиддер», «выбрать нишу» и др.' },
  { title: 'AI-поиск по задачам', desc: 'Опиши задачу своими словами — собираем подходящий плейбук и даём добавить в трек в один клик' },
  { title: 'AI «видит» экран в уроках', desc: 'Ассистент отвечает не только по аудио, но и по содержимому экрана — графикам, таблицам, кнопкам в видео' },
  { title: 'Онбординг-визард', desc: 'Знакомство с платформой за 3 шага: маркетплейсы, опыт, цели — дальше ведём в диагностику или каталог' },
  { title: 'Реферальная программа', desc: 'Приглашайте коллег и получайте бонусы к подписке — у каждого в кабинете персональная ссылка' },
  { title: 'Промо-коды', desc: 'Создание в админке, применение при оплате, многоразовые и одноразовые' },
];

const inProgressItems = [
  { title: 'Диагностика по плейбукам', desc: 'Диагностика будет рекомендовать готовые плейбуки целиком, а не отдельные уроки' },
  { title: 'Расширение каталога уроков', desc: 'Новые модули и обновление существующего контента' },
];

const exploringItems = [
  { title: 'Трекер задач', desc: 'Персональный список дел на основе пройденных уроков' },
  { title: 'Трекинг прогресса', desc: 'Детальная статистика обучения и достижения' },
  { title: 'Практические инструменты', desc: 'Калькуляторы, шаблоны, чек-листы внутри платформы' },
  { title: 'Живые разборы кабинетов', desc: 'Групповые сессии с экспертами по реальным аккаунтам' },
];

const changelogEntries = [
  { date: '25.05.2026', text: 'AI-поиск по задачам на странице обучения. Опишите задачу своими словами — например, «как снизить ДРР на Wildberries» или «хочу настроить автобиддер» — и получите подходящий плейбук с уроками. Кнопкой «В трек» добавляете весь набор в обучение одним кликом.' },
  { date: '22.05.2026', text: 'Запустили библиотеку плейбуков под бизнес-задачи. Теперь на странице обучения можно листать каталог двумя способами: «По задачам» — готовые сценарии вроде «настроить автобиддер» или «выбрать нишу» — или «Все курсы» как раньше. У каждого плейбука внутри — упорядоченный набор уроков под конкретный результат.' },
  { date: '19.05.2026', text: 'Новый онбординг-визард для тех, кто только зашёл на платформу. Три коротких шага — маркетплейсы, опыт, цели — и платформа предлагает: пройти диагностику или сразу открыть каталог. Уже зарегистрированным пользователям визард показывается один раз при следующем входе.' },
  { date: '18.05.2026', text: 'AI-ассистент в уроках теперь «видит» экран. Раньше отвечал только по тому, что произнесено вслух — теперь учитывает и содержимое экрана: графики, таблицы, кнопки интерфейсов в видео. Особенно полезно в курсах по AI и аналитике, где много визуальных деталей.' },
  { date: '04.05.2026', text: 'Запустили реферальную программу. У каждого из вас в личном кабинете появилась персональная ссылка — поделись с другом, и оба получите 14 дней бесплатного доступа к Платформе. Друзья регистрируются — у тебя в кабинете копятся пакеты, активируешь когда хочешь.' },
  { date: '30.04.2026', text: 'Когда сотрудники Академии отвечают на твои вопросы под уроками — теперь это видно в шторке уведомлений отдельным акцентом (синяя полоска и иконка учителя). И когда мы добавляем в курс новые уроки или материалы — приходит одно сводное уведомление за сутки, а не десяток отдельных. Только если ты уже учишься в этом курсе.' },
  { date: '27.04.2026', text: 'В курсе «Аналитика для маркетплейсов» под уроками появились материалы — презентации, таблицы расчётов, чек-листы и ссылки на сервисы. Скачиваете нужное в один клик, открываете сервисы в новой вкладке. Постепенно добавим и в остальные курсы.' },
  { date: '22.04.2026', text: 'Обновили сайт целиком: новая главная, страницы каждого курса, каталог, «О нас» и публичный роадмеп. Стало понятнее, что внутри платформы и что именно вы получаете по подписке.' },
  { date: '16.04.2026', text: 'Обновили AI-промпт диагностики. Теперь вопросы точнее попадают в реальные задачи селлеров.' },
  { date: '07.04.2026', text: 'Запустили промо-коды. Создание в админке, применение при оплате.' },
  { date: '29.03.2026', text: 'QA-аудит: закрыли 25 багов.' },
  { date: '14.03.2026', text: 'Мобильная адаптация всех страниц.' },
];

/* -- Icons ------------------------------------------------------- */

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function LightbulbIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18h6M10 22h4M12 2a7 7 0 00-4 12.7V17h8v-2.3A7 7 0 0012 2z" />
    </svg>
  );
}

/* -- Page Component ---------------------------------------------- */

export default function DesignNewV8Roadmap() {
  return (
    <div className={onest.className} style={{ color: TEXT }}>

      <V8Header onDarkHero={true} />

      {/* -- 2. Hero (dark) --------------------------------------- */}
      <section style={{ backgroundColor: DARK }} className="pt-[120px] sm:pt-[140px] pb-[60px] sm:pb-[80px] px-4 sm:px-6 md:px-10 lg:px-0">
        <div className="max-w-[1160px] mx-auto text-center">
          <h1 className="text-[28px] sm:text-[36px] md:text-[48px] lg:text-[56px] font-bold leading-[1.1] tracking-tight text-white">
            Куда движется платформа
          </h1>
          <p className="mt-5 sm:mt-6 text-[16px] sm:text-[18px] leading-relaxed max-w-[600px] mx-auto" style={{ color: 'rgba(255,255,255,0.7)' }}>
            Мы строим — вы видите. Каждое обновление уже включено в вашу подписку.
          </p>
        </div>
      </section>

      {/* -- 3. Roadmap Board (3 columns like V2) ----------------- */}
      <section id="status" className="py-[60px] sm:py-[80px] lg:py-[100px] px-4 sm:px-6 md:px-10 lg:px-0" style={{ backgroundColor: GRAY_BG }}>
        <div className="max-w-[1160px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Column: Shipped */}
            {[
              { label: 'Готово', color: '#10B981', items: shippedItems },
              { label: 'В работе', color: BLUE, items: inProgressItems },
              { label: 'Исследуем', color: '#9CA3AF', items: exploringItems },
            ].map((col, ci) => (
              <Reveal key={col.label} className="flex flex-col gap-4" delay={ci * 100}>
                <div className="flex items-center gap-3 mb-2">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: col.color }} />
                  <h3 className="text-[18px] font-bold">{col.label}</h3>
                  <span
                    className="text-[13px] font-medium rounded-full px-3 py-0.5"
                    style={{ backgroundColor: `${col.color}15`, color: col.color }}
                  >
                    {col.items.length}
                  </span>
                </div>
                {col.items.map((item) => (
                  <div key={item.title} className="bg-white rounded-[40px] p-6 relative overflow-hidden transition-transform duration-300 hover:-translate-y-1">
                    <div className="absolute top-0 left-0 right-0 h-[4px]" style={{ backgroundColor: col.color }} />
                    <div className="flex items-start gap-3 mt-1">
                      <span className="w-2 h-2 rounded-full flex-shrink-0 mt-[7px]" style={{ backgroundColor: col.color }} />
                      <div>
                        <h4 className="text-[16px] font-bold leading-snug">{item.title}</h4>
                        <p className="mt-1 text-[14px] leading-relaxed" style={{ color: TEXT, opacity: 0.6 }}>{item.desc}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* -- 4. Changelog (timeline like V2) ---------------------- */}
      <section id="changelog" className="py-[60px] sm:py-[80px] lg:py-[100px] px-4 sm:px-6 md:px-10 lg:px-0 bg-white">
        <div className="max-w-[1160px] mx-auto">
          <h2 className="text-[24px] sm:text-[32px] md:text-[40px] font-bold mb-10 sm:mb-14 text-center" style={{ color: TEXT }}>
            От команды разработки
          </h2>
          <div className="relative max-w-[720px] mx-auto">
            {/* Vertical line */}
            <div className="absolute left-[20px] sm:left-[24px] top-0 bottom-0 w-[2px]" style={{ backgroundColor: `${BLUE}20` }} />
            <div className="flex flex-col gap-10">
              {changelogEntries.map((entry) => (
                <div key={entry.date} className="relative flex items-start gap-5 sm:gap-6 pl-[4px]">
                  <div
                    className="relative z-10 w-[34px] h-[34px] sm:w-[42px] sm:h-[42px] rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${BLUE}10` }}
                  >
                    <div className="w-[10px] h-[10px] sm:w-[12px] sm:h-[12px] rounded-full" style={{ backgroundColor: BLUE }} />
                  </div>
                  <div className="pt-1 sm:pt-2">
                    <span
                      className="inline-block rounded-full px-4 py-1 text-[12px] sm:text-[13px] font-bold text-white mb-3"
                      style={{ backgroundColor: BLUE }}
                    >
                      {entry.date}
                    </span>
                    <p className="text-[15px] sm:text-[16px] leading-relaxed" style={{ color: TEXT, opacity: 0.7 }}>
                      {entry.text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* -- 5. CTA (dark) ---------------------------------------- */}
      <section className="py-[60px] sm:py-[80px] lg:py-[100px] px-4 sm:px-6 md:px-10 lg:px-0" style={{ backgroundColor: DARK }}>
        <div className="max-w-[1160px] mx-auto text-center">
          <h2 className="text-[24px] sm:text-[32px] md:text-[40px] font-bold text-white mb-6">
            Попробуйте платформу
          </h2>
          <a
            href="/diagnostic"
            className="inline-flex items-center justify-center rounded-full h-[52px] sm:h-[62px] px-8 sm:px-10 text-[15px] sm:text-[16px] font-medium text-white transition-colors"
            style={{ backgroundColor: BLUE }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = BLUE_HOVER)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = BLUE)}
          >
            Начать диагностику
          </a>
        </div>
      </section>

      <V8Footer wrapperBg="dark" />
    </div>
  );
}
