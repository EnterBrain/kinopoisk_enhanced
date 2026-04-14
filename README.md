# Kinopoisk Enhanced

UserJS-скрипт для улучшения пользовательского опыта на сайте Кинопоиска.

## Цели проекта

- Улучшать удобство интерфейса Кинопоиска без тяжелых зависимостей.
- Держать изменения изолированными и обратимыми.
- Сохранять код понятным, чтобы новые улучшения было легко добавлять.

## Возможности

- Добавляет кнопку на страницы фильмов и сериалов (`/film/:id/`, `/series/:id/`).
- Открывает соответствующую страницу на `kinopoisk.net` в новой вкладке.
- Состоит из двух уровней: `loader` и `core`.
- Позволяет через меню Violentmonkey/Tampermonkey добавлять и удалять сайты, на которых должен запускаться `core`.
- Из коробки запускает `core` на `kinopoisk.net` и `fbsite.top`.

## Установка для разработки

1. Установите расширение для UserJS-скриптов:
   - Tampermonkey
   - Violentmonkey
   - Greasemonkey
2. Выполните сборку:

   ```bash
   npm run build
   ```

3. Откройте файл [`dist/kinopoisk-enhanced-loader.user.js`](dist/kinopoisk-enhanced-loader.user.js).
4. Добавьте его содержимое в новый пользовательский скрипт расширения.
5. Откройте `https://www.kinopoisk.ru/` и проверьте работу скрипта.

## Структура

```text
.
├── dist
│   ├── kinopoisk-enhanced-core.js
│   ├── kinopoisk-enhanced-core.css
│   ├── kinopoisk-enhanced-dev.user.js
│   └── kinopoisk-enhanced-loader.user.js
├── README.md
├── package.json
├── scripts
│   └── build.mjs
└── src
    ├── core
    │   ├── main.js
    │   ├── meta.json
    │   └── styles.css
    └── loader
        ├── main.js
        ├── meta.json
        └── styles.css
```

## Разработка

Основная точка входа loader находится в `src/loader/main.js`.

Core находится в `src/core/main.js`. Loader не встраивает core в себя: он подтягивает собранный plain JS core и CSS как `@resource` и запускает core только на сайтах из пользовательского списка.

Для локального тестирования есть dev-монолит `dist/kinopoisk-enhanced-dev.user.js`: он встраивает loader, core JS и core CSS в один userscript, чтобы проверять изменения без пуша в GitHub и без кэша `@resource`.

Метаданные UserJS находятся в `meta.json`, а стили - в `styles.css` внутри соответствующего модуля.

Чтобы собрать готовый файл:

```bash
npm run build
```

Скрипт сборки создаст:

- `dist/kinopoisk-enhanced-loader.user.js` - основной userscript для установки.
- `dist/kinopoisk-enhanced-core.js` - plain JS core-артефакт без userscript-метаданных, который loader подтягивает на `kinopoisk.net` и других зеркалах.
- `dist/kinopoisk-enhanced-core.css` - стили core, которые loader подтягивает рядом с core-скриптом.
- `dist/kinopoisk-enhanced-dev.user.js` - монолитный userscript для локального тестирования.

Версия автоматически берется из `package.json`.

Чтобы собрать файл и проверить синтаксис:

```bash
npm run check
```

## Лицензия

Проект распространяется под лицензией Apache License 2.0. Она разрешает свободное использование, изменение и распространение кода, а также включает отказ от гарантий и ограничение ответственности авторов.

См. [`LICENSE`](LICENSE).
