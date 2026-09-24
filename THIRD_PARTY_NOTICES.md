# Dependencias y referencias

Three.js 0.186.0 se distribuye dentro del bundle de la aplicación bajo la licencia MIT. Los escenarios, shaders propios y sonidos procedurales de ExoWeb no incluyen recursos extraídos de Exo One. Las capturas enlazadas en `docs/REFERENCES.md` son referencias externas y no se redistribuyen con el juego.

## Three.js

The MIT License

Copyright © 2010-2026 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

## Herramientas de desarrollo

Las versiones exactas y dependencias transitivas de TypeScript, Vite, ESLint, Vitest y Playwright se fijan en `package-lock.json`. Sus licencias se conservan en los paquetes instalados mediante `npm ci`. No se envían al navegador como dependencias de la aplicación.
