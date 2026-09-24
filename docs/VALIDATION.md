# Registro de validación

La renovación gráfica en `codex/nacar-visual-fidelity` tiene su registro separado en [Validación de Nácar](VALIDATION_NACAR.md). Los resultados de esta página son históricos, anteriores a esa renovación.

## Actualización: ajuste 2, 24 de septiembre de 2026

Material próximo, contacto estable, recuperación de picados, recarga y guía contextual corregidos. **36 pruebas unitarias y 9 pruebas de navegador aprobadas**, incluyendo WebGPU real, controles de disco/gravedad y benchmark optativo de 60 segundos. Formato, lint, tipos y build correctos.

El recorrido activo desde parado atravesó unos **1.11 km en 12.2 s**, sin cambiar de escena ni teletransportar: **143.9 FPS**, p95 **7.1 ms**, máximo **7.3 ms**, sin frames >25 ms en esa ejecución. Salida 1920×1080, perfil medio, RTX 5070 Ti, Chromium 153.0.8010.12. Memoria administrada estimada: 299.9 MiB. [Datos del recorrido](verification/tuning-v2/traversal-1080p.json).

Una ejecución anterior había mostrado un tirón inicial de 253.8 ms. Se movió la preparación de shaders y buffers al estado de carga y se repitió la prueba: el informe anterior al cambio no se usa para declarar el tirón resuelto durante cualquier recorrido; el resultado nuevo acredita únicamente los 12.2 segundos medidos.

Las seis vistas, durante aproximadamente diez segundos cada una, dieron **115.1–143.9 FPS**, p95 máximo **13.9 ms**, resolución interna final 100% en todas ellas. [Datos gráficos](verification/tuning-v2/benchmark-60s.json). La medición histórica de diez minutos que figura más abajo corresponde al motor anterior a estos ajustes.

Comparación del suelo: [antes](verification/costa.png), [después](verification/tuning-v2/costa.png), [durante el recorrido](verification/tuning-v2/moving-terrain.png). El detalle visible se revisó en las capturas; el contacto y la conservación de energía tienen pruebas físicas. La sensación subjetiva y una partida completa todavía necesitan revisión con una persona.

La nueva prueba de geometría desplaza la ventana de sectores varias veces, comprueba el reemplazo de alturas y faldas y confirma que se reutilizan nueve mallas. Las nuevas pruebas físicas cubren tracción continua, salida desde parado, picado sin creación de energía mecánica, salto anticipado, recuperación desde agua, recarga por picado y ausencia de parpadeo entre formas al agotarse el disco.

Detalles y guía para continuar: [Vuelo y ajuste 2](FLIGHT_AND_TUNING.md).

## Registro inicial

Fecha local: 23 de septiembre de 2026. Rama de trabajo: `codex/webgpu-planet`. El código anterior se conserva en el historial Git, a partir de `ee323a1`.

## Comprobaciones ejecutadas

| Comprobación                                                      | Resultado                                   |
| ----------------------------------------------------------------- | ------------------------------------------- |
| Formato, ESLint y TypeScript estricto                             | Correcto                                    |
| Build de producción con base `/ExoWeb/`                           | Correcto; sin imports CDN                   |
| Pruebas unitarias                                                 | 26 aprobadas                                |
| Interfaz sin GPU, ajustes, reasignación y almacenamiento corrupto | 4 aprobadas                                 |
| Seis escenas con WebGPU real                                      | Renderizadas sin errores del dispositivo    |
| Teclado: movimiento, salto, pausa y continuación                  | Aprobado en navegador                       |
| Mando estándar emulado: movimiento y desconexión                  | Aprobado en navegador                       |
| Medición gráfica sostenida                                        | Diez minutos completados; resultados debajo |
| Dependencias                                                      | `npm install` informó 0 vulnerabilidades    |

Las pruebas físicas cubren reproducción de entradas a 30/60/144 FPS con tolerancia inferior a 1 cm, límite de recuperación de pasos, prioridad de gravedad, impulso durante transformación, energía, térmicas, salto, giro sin aceleración horizontal gratuita, velocidad máxima, barrido contra terreno, rebote y relanzamiento acuático. El muestreo de terreno tiene pruebas de coordenadas negativas, interpolación triangular y coincidencia de bordes.

La suite WebGPU verifica también continuidad de los bordes generados por compute (<5 cm) y origen gráfico próximo al jugador, conservando la velocidad después de visitar las escenas. Las pruebas de interfaz se ejecutan sobre el build servido bajo la base de producción, con detección de recursos HTTP ausentes.

## Medición de diez minutos

Equipo local Windows, **NVIDIA GeForce RTX 5070 Ti**, controlador 32.0.16.1088. WebGPU identificó el adaptador como `nvidia / blackwell`. Chromium completo en modo headless, Playwright 1.63.0, salida 1920 × 1080, perfil medio, resolución interna 100% al terminar cada escena. Unos 100 segundos por escena, 603.9 segundos en total. La cadencia observada se estabiliza cerca de 144 FPS en las escenas de menor coste.

| Escena                      | FPS medios | p95 del frame | Memoria estimada |
| --------------------------- | ---------: | ------------: | ---------------: |
| Costa                       |     143.85 |        7.0 ms |        289.5 MiB |
| Pendiente                   |     143.80 |        7.0 ms |        291.9 MiB |
| Cima                        |     143.86 |        7.0 ms |        286.8 MiB |
| Nube, configuración inicial |     107.19 |       13.9 ms |        293.8 MiB |
| Sobre nubes                 |     143.83 |        7.1 ms |        293.8 MiB |
| Océano                      |     118.18 |       13.9 ms |        284.9 MiB |

Esta primera medición precede a las últimas correcciones de normales del océano, curvatura visual distante y ubicación de la escena `nube`. En esa medición, `nube` se ajustaba a la ladera de la montaña a 2961 m; se corrigió para que el preset esté en aire dentro de una térmica. Una comprobación gráfica posterior verifica el build final; no se presenta esta tabla como una medición de diez minutos de ese build.

La carga medida son vistas estáticas con tiempo de animación activo, tras precargar los sectores de cada vista. No equivale a diez minutos de viaje con streaming continuo. La memoria es una estimación de recursos administrados, no una lectura de VRAM del controlador. El timestamp GPU mostrado en el panel es una ayuda de diagnóstico, no un perfil completo de todos los pases.

### Comprobación del render final

Después de las correcciones, se repitieron las seis escenas durante unos diez segundos cada una: **118.4–143.8 FPS**, p95 máximo **13.9 ms**, resolución interna **100%** y memoria estimada máxima **291.9 MiB**. Navegador: Chromium **153.0.8010.12**. Los datos están en [benchmark-final-60s.json](verification/benchmark-final-60s.json). Esta comprobación de un minuto no sustituye una medición sostenida del recorrido.

Capturas del render final: [costa](verification/costa.png), [pendiente](verification/pendiente.png), [cima](verification/cima.png), [interior de nube](verification/nube.png), [sobre nubes](verification/cielo.png) y [océano](verification/oceano.png).

La descarga de HTML, CSS y JavaScript del build ronda **0.28 MB comprimidos con gzip**, muy por debajo de 15 MB. No hay texturas o pistas de audio que descargar. El shader se compila en el navegador y el terreno se genera al iniciar.

## Matriz de entrega

| Etapa          | Implementado                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------ |
| Estabilización | npm, lockfile, Vite, TypeScript, diagnóstico WebGPU, pérdida de dispositivo, CI                              |
| Arquitectura   | Contratos tipados, simulación fija, entrada, cámara, render, mundo, audio y guardado separados               |
| Render         | Compute de alturas, streaming, LOD con morphing y faldas, origen local, cielo, océano, nubes y postprocesado |
| Mecánicas      | Gravedad, rodadura, salto, disco, energía, térmicas, agua, colisiones y recuperación                         |
| Región jugable | Cinco checkpoints, señal distante, transición de clima, audio reactivo, ajustes y exploración libre          |
| Distribución   | Perfiles, resolución dinámica, diagnóstico y workflow Pages con acciones fijadas por SHA                     |

## Aceptación manual pendiente

- Recorrer toda la ruta con teclado/mouse y con un mando físico, sin teletransportes ni API de pruebas. Registrar duración, puntos de bloqueo y ajustes necesarios para los 15–20 minutos previstos.
- Medir diez minutos de recorrido activo en **RTX 3060 o RX 6600**, Chrome y Edge, perfil medio, 1080p. Criterios: media ≥60 FPS y p95 ≤20 ms, registrando la evolución de resolución interna.
- Repetir el recorrido para comprobar estabilidad de memoria durante streaming, además de las mediciones estáticas realizadas.
- Revisar vídeo de giros bruscos, transiciones rápidas de LOD, cruce de nubes y reaparición; las capturas y la ausencia de errores GPU no certifican la ausencia total de artefactos temporales.
- Escuchar la mezcla con auriculares y altavoces, y revisar la experiencia con sensibilidad y confort modificados.
- Configurar Pages con origen GitHub Actions e integrar la rama. El workflow está preparado; no se ha ejecutado ni verificado un despliegue remoto desde esta rama.

El acabado visual es procedural y las técnicas de atmósfera y reconstrucción temporal son aproximaciones descritas en `ARCHITECTURE.md`. Los resultados no se presentan como equivalencia visual certificada con Exo One.

## Reproducción

Los comandos están en el README. Las escenas están disponibles con `?scene=costa`, `pendiente`, `cima`, `nube`, `cielo` y `oceano`. `?test=1` habilita la API local usada por Playwright; no se activa en una partida normal. `GPU_TESTS=1` selecciona Chromium completo con acceso a GPU; el shell headless reducido no ofreció un adaptador en este equipo.

El benchmark escribe `benchmark.json` en su carpeta de `test-results`; incluye navegador, adaptador, frames, p95, resolución y memoria. Es optativo y se excluye de CI. Una ejecución sin GPU nunca acredita la calidad de shaders ni el rendimiento.
