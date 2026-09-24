# ExoWeb — Nácar

Una expedición contemplativa por una costa extraterrestre de 64 × 64 km. Rodá, aprovechá la gravedad, transformate en disco y buscá las corrientes entre las nubes. Cinco señales orientan el viaje; al alcanzar la última, la exploración continúa.

Motor renovado con TypeScript estricto, Three.js 0.186.0, WebGPU y shaders TSL/WGSL. Terreno generado por compute, colisiones a 120 Hz, océano Gerstner, nubes volumétricas, postprocesado temporal y audio sintetizado. Todos los escenarios y sonidos se generan localmente, sin CDN, backend ni telemetría.

## Ejecutar

Requiere Node **24** y Chrome o Edge de escritorio con WebGPU y aceleración gráfica. No hay fallback WebGL.

```sh
npm ci
npm run dev
```

Abrí `http://127.0.0.1:4173/ExoWeb/`. No abras `index.html` directamente: los módulos necesitan el servidor y el build de Vite.

```sh
npm run check       # lint, tipos, build y pruebas físicas
npx playwright install chromium
npm run test:e2e    # interfaz y rutas de producción; no requiere GPU
npm run build
npm run preview
```

Las pruebas gráficas se habilitan expresamente. En PowerShell:

```powershell
$env:GPU_TESTS='1'
npm run test:e2e -- tests/e2e/gpu.spec.ts
# Opcional: añadir una medición sostenida de diez minutos a 1080p.
$env:BENCHMARK_SECONDS='600'
npm run test:e2e -- tests/e2e/gpu.spec.ts
Remove-Item Env:GPU_TESTS, Env:BENCHMARK_SECONDS
```

## Controles

| Acción                 | Teclado y mouse              | Mando estándar  |
| ---------------------- | ---------------------------- | --------------- |
| Dirección              | WASD                         | Stick izquierdo |
| Cámara                 | Mouse con captura o arrastre | Stick derecho   |
| Gravedad intensificada | Shift / botón izquierdo      | RT              |
| Disco y planeo         | Ctrl / botón derecho         | LT              |
| Salto / relanzamiento  | Espacio                      | A               |
| Pausa                  | Esc                          | Start           |
| Regresar al checkpoint | R mantenida / menú           | Menú            |

Los ajustes permiten reasignar teclas y botones del mando, cambiar sensibilidad, invertir la cámara, seleccionar calidad y separar volúmenes. El modo de confort fija el FOV y desactiva motion blur y balanceo. F3 muestra el diagnóstico local.

El disco consume energía; el suelo, el agua y las corrientes ascendentes la recuperan. La gravedad intensificada tiene prioridad sobre el planeo. Un impacto rasante sobre agua puede rebotar; si perdés velocidad, flotás y podés saltar de nuevo. Al perder foco o desconectar el mando, el juego se pausa.

El progreso se guarda en este navegador al alcanzar señales. Una partida nueva reemplaza ese progreso. Si el almacenamiento falla, se informa y la sesión continúa en memoria.

## Publicación en GitHub Pages

El workflow `.github/workflows/pages.yml` valida pull requests. Un push a `master`, o una ejecución manual sobre `master`, construye y publica `dist` mediante las acciones oficiales fijadas por SHA. Los permisos de escritura se limitan al job de despliegue.

1. En el repositorio, abrir **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Integrar la rama de implementación en `master`.
3. Revisar la ejecución de **Verify and publish ExoWeb** y su entorno `github-pages`.
4. La dirección prevista es `https://canni-dev.github.io/ExoWeb/`.

Vite usa `/ExoWeb/` como base. Si cambia el nombre del repositorio, actualizar esa base y la URL del servidor de las pruebas. No se necesita rama `gh-pages`, service worker ni cabeceras de aislamiento. Para rollback, revertir el commit en `master`: el mismo workflow reconstruye y despliega la versión anterior.

La configuración está incluida en el código; el despliegue remoto no se da por realizado hasta que el workflow termine correctamente.

## Documentación

- [Arquitectura, contratos y parámetros](docs/ARCHITECTURE.md)
- [Registro de validación y criterios pendientes](docs/VALIDATION.md)
- [Referencias visuales y técnicas](docs/REFERENCES.md)
- [Avisos de dependencias](THIRD_PARTY_NOTICES.md)

La duración de 15–20 minutos, el acabado visual y el objetivo de 1080p/60 FPS en RTX 3060 o RX 6600 son criterios de aceptación. Las pruebas automáticas no sustituyen el recorrido completo con una persona ni una medición en esas GPU; el registro de validación diferencia lo probado de lo pendiente.
