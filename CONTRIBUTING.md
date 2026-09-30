# Contributing

Install Node.js 22+, run `npm ci`, then `npm run dev` on Windows. Keep Electron capabilities narrow and put heavy filesystem work in the worker. Do not add destructive actions without a separate design and review.

Before opening a pull request, run lint, typecheck, unit tests, production build and Electron tests. Add regression tests for scanner changes using temporary real files. Document limits accurately. Screenshots must come from the running application.

Please use issues for reproducible bugs or focused feature proposals. Do not include private file paths or file contents. Security concerns should not include working attacks against other people's files.
