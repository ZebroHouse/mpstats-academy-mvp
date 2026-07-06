# MAAL — деплой и заглушка технических работ

Версионируемые артефакты инфраструктуры прода. Nginx-конфиг и страница-заглушка
живут на **хосте VPS** (не в контейнере) — здесь их источник истины для воспроизводимости.

## Прод-редеплой (улучшенный раннбук)

**Было** (документированная команда): `docker compose down && docker compose build --no-cache && docker compose up -d`.
Минус: `down` кладёт контейнер на **всю** пересборку (`--no-cache` — это минуты), всё это время сайт недоступен.

**Стало** — сборка при работающем контейнере, короткий рекриэйт в конце:

```bash
ssh deploy@89.208.106.208
cd /home/deploy/maal
git pull origin master

# 1. Собираем новый образ — СТАРЫЙ контейнер продолжает обслуживать трафик
docker compose build --no-cache web

# 2. Рекриэйт: единственное «мёртвое» окно = подмена контейнера + прогрев Next (~40-60 сек)
docker compose up -d web

# 3. Дождаться healthy и проверить
docker compose ps
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/health   # ждём 200
```

Даунтайм ужимается с «минуты сборки» до «десятки секунд рекриэйта». **Это окно закрывает заглушка** (см. ниже): пока новый контейнер не стал healthy, nginx отдаёт `maintenance.html`, а не голый 502.

> Смена только runtime-env (напр. флаг `PARTNER_ENTRY_ENABLED`) — пересборка не нужна: правим `docker-compose.yml`/`.env.production` → `docker compose up -d web` (рекриэйт секунды).

## Заглушка «технические работы» (вариант A — автоматическая)

Nginx на хосте отдаёт `deploy/maintenance/maintenance.html`, когда апстрим `127.0.0.1:3000`
недоступен (пересборка/рекриэйт/краш). Инфра переживает падение контейнера, т.к. nginx — на хосте.

- **Установка / откат / детали** — в `deploy/nginx/maintenance.conf` (шапка файла).
- **Страница** — `deploy/maintenance/maintenance.html`: самодостаточная (инлайн-CSS, без внешних
  ресурсов), брендовая (палитра Academy), с авто-рефрешем 30 сек и контактом `clients@mpstats.academy`.

### Обновить страницу на проде

```bash
# с локали → на VPS
scp deploy/maintenance/maintenance.html deploy@89.208.106.208:/tmp/
ssh deploy@89.208.106.208 'sudo cp /tmp/maintenance.html /var/www/maintenance/'
```

Правка HTML на статику не требует reload nginx (файл читается с диска на каждый запрос).

## Smoke после релиза

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://platform.mpstats.academy/            # 200
curl -sS -o /dev/null -w "%{http_code}\n" https://platform.mpstats.academy/api/health  # 200
```

## Связанное

- Полная инфра-заметка: `.claude/memory/deploy-details.md`
- Staging-воркфлоу: `.claude/memory/staging-workflow.md`
- Сеть (AEZA-блок + KVMKA-мост `185.246.118.152`): память `project_aeza_block_kvmka_bridge.md`.
  KVMKA делает L4 TCP-passthrough → HTTP терминируется на хостовом nginx AEZA. Заглушка живёт
  именно там; на KVMKA правок не нужно.
