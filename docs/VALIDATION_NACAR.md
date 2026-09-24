# Nácar: renovación gráfica

Implementación en `codex/nacar-visual-fidelity`, desde `master` (`9922fac`). Sin integración ni publicación. Fecha de trabajo: 24 de septiembre de 2026.

## Alcance entregado

Región completa y cinco destinos, con nueva costa, dunas, crestas suavizadas, nieve, monolitos y grupos de rocas suspendidas. Materiales físicos triplanares, recursos KTX2/GLB originales y decodificadores locales. Ambiente espacial compartido, sombras en cascada, reflejo ambiental actualizado por caras, oclusión próxima, nubes con profundidad integrada y sombra común. Océano con absorción, refracción, microondas filtradas, espuma, estela orientada y SSR en alto. Nave de metal oscuro, transformación continua, salpicaduras, polvo, estelas dobles y pulso sónico. Cámara con anticipación y barrido contra hitos; HUD contextual y óptica ajustable.

La paleta y la composición siguen la [lectura de las diez referencias](ART_DIRECTION.md). No se extrajeron recursos de Exo One. El parecido y la calidad artística necesitan valoración visual; la existencia de estas técnicas no certifica por sí sola un acabado AAA.

[Abrir comparativa interactiva](verification/nacar/comparison.html) · [Vídeo de movimiento, 65 s](verification/nacar/motion.webm) · [Métricas detalladas](verification/nacar/benchmark-summary.json).

El código gráfico medido corresponde a `06fc2e4`. Los commits posteriores de validación no modifican el render.

## Reproducción

```powershell
npm run check
$env:GPU_TESTS='1'
$env:RECORD_MOTION='1'
npm run test:e2e -- --output .cache/nacar-verification
Remove-Item Env:RECORD_MOTION
$env:ACTIVE_BENCHMARK_SECONDS='600'
npm run test:e2e -- tests/e2e/acceptance.spec.ts --grep 'sustained' --output .cache/nacar-benchmark
Remove-Item Env:ACTIVE_BENCHMARK_SECONDS
Remove-Item Env:GPU_TESTS
node scripts/collect-verification.mjs .cache/nacar-verification .cache/nacar-benchmark
node scripts/build-comparison.mjs
```

Las pruebas se ejecutan contra el build bajo `/ExoWeb/`. Un servidor de preview ya abierto en 4174 evita volver a compilar al iniciar cada suite. El benchmark se ejecuta sin vídeo ni otra carga gráfica de pruebas en paralelo.

Las ocho capturas nuevas utilizan 1920×1080, medio, escala 100%, tiempo 30 s, disco, yaw 0 y pitch 0.15. Se esperan 35 fotogramas tras el cambio para reconstruir historial y reflejos. En la comparativa se recompila `master` con una fixture que iguala únicamente distancia de cámara, tiempo y forma; se conservan materiales, relieve y render anteriores. Los cambios de geografía producen diferencias de silueta aun con igual posición global.

Para regenerar la versión de partida, extraer `git archive 9922fac` en `.cache/baseline`, ejecutar `node scripts/prepare-baseline.mjs` y compilar con `npx vite build .cache/baseline --config .cache/baseline/vite.config.ts`. Servir ese build en `localhost:4176/ExoWeb/` y ejecutar `node scripts/capture-baseline.mjs`. La fixture queda descrita en [baseline-fixture.json](verification/nacar/baseline-fixture.json). Las referencias JPEG siguen siendo archivos locales del usuario, excluidos de Git y del build.

## Resultados locales

Formato, lint, TypeScript, build, validación de recursos y **46 pruebas unitarias** aprobados. La suite con WebGPU y vídeo aprobó **14 pruebas de navegador**. Después se repitió calidad con resolución nativa y pasó la nueva prueba de recuperación de los cinco guardados; el benchmark activo pasó por separado: **16 casos distintos aprobados** en total. La prueba histórica de benchmark estático no se utiliza para certificar movimiento activo.

La distribución sin gzip suma **51.508.349 bytes (51,51 MB)**; la estimación conservadora inicial, **18.475.548 bytes (18,48 MB)**. Son diez KTX2 con mipmaps, cuatro GLB originales y decodificadores locales. Las capturas y el vídeo de documentación no se envían como recursos del juego.

Durante la revisión se corrigieron rotación residual al pasar a disco, discontinuidades de bordes de LOD y espuma falsa en el horizonte causada por una cobertura de terreno menor que la del océano. Se inspeccionaron las ocho vistas y muestras de las seis secuencias. La grabación no demuestra por sí sola ausencia de todo parpadeo: el visto bueno artístico y temporal completo sigue pendiente.

### Diez minutos activos: RTX 5070 Ti

Windows, controlador 610.88, Chromium **153.0.8010.12**, adaptador WebGPU `nvidia / blackwell`. Salida e interno **1920×1080**, medio, escala fijada en **100%** durante toda la medición. Se acumularon **604,29 s** y una media conjunta de **98,15 FPS**. Vídeo y otras pruebas gráficas se ejecutaron por separado.

| Tramo            |   Tiempo | FPS medios |     p95 | Frame máximo | Memoria máxima estimada |
| ---------------- | -------: | ---------: | ------: | -----------: | ----------------------: |
| Rasante          | 100,81 s |     103,89 | 14,0 ms |      21,0 ms |               419,9 MiB |
| Pendiente        | 101,05 s |     100,27 | 14,0 ms |      27,8 ms |               416,4 MiB |
| Cumbre           | 101,11 s |      99,96 | 14,0 ms |      21,0 ms |               414,6 MiB |
| Interior de nube | 100,25 s |      97,17 | 14,0 ms |      27,8 ms |               418,7 MiB |
| Sobre nubes      | 100,48 s |      93,45 | 14,0 ms |      34,8 ms |               416,0 MiB |
| Mar interior     | 100,58 s |      94,13 | 14,0 ms |      27,9 ms |               415,4 MiB |

Se mantuvo entrada de avance y, salvo rodadura, de planeo. Cada tramo comienza en una escena diferente mediante la API de pruebas; dentro de los tramos no hubo reinicios ni muestras con tiempo de simulación detenido. Se observaron 31 cambios de origen. No equivale a completar la ruta de checkpoints sin ayudas.

Las **555 muestras**, tomadas aproximadamente cada segundo, no encontraron el aviso de streaming activo. Este muestreo no descarta pausas inferiores al intervalo; los tiempos de frame sí incluyen los intervalos de `requestAnimationFrame` sin recortar picos. Cero errores de página, consola y WebGPU durante la medición. [Datos completos](verification/nacar/active-1080p.json) y [resumen](verification/nacar/benchmark-summary.json).

### Perfiles y continuidad de partida

Las transiciones bajo → alto → medio conservaron salida de 1920×1080, tanto con interno 1440×810 (75%) como con interno nativo. Memoria estimada en la escena costera de prueba:

| Perfil | Interno 75% | Interno 100% |
| ------ | ----------: | -----------: |
| Bajo   |   264,2 MiB |    347,3 MiB |
| Medio  |   308,2 MiB |    391,3 MiB |
| Alto   |   366,1 MiB |    456,9 MiB |

Son instantáneas de la costa, no máximos de toda una partida; el máximo durante el recorrido medio fue 419,9 MiB. [Mediciones y dimensiones](verification/nacar/profiles.json). También pasó salida física 1920×1080 con viewport 960×540 y DPR 2.

Cinco contextos de navegador independientes cargaron guardados V1 sin los nuevos campos, continuaron desde cada destino y comprobaron progreso conservado, posición finita y altura sobre el relieve actual. Esto acredita recuperación segura, sin sustituir el recorrido manual entre destinos. La galería se abrió en navegador: 14 imágenes cargadas, comparador operable y vídeo 1920×1080/25 FPS de 64,92 s.

## Qué comprueban las pruebas

- Contacto y recuperación desde agua; conservación de energía; colisiones barridas a 450 m/s; cajas orientadas de obstáculos compartidas con cámara.
- Continuidad de alturas generadas en GPU (<5 cm), reciclaje de los nueve sectores próximos y carga anticipada del corredor de movimiento.
- Eventos acumulados entre subpasos, consumo único, pausa por tiempo simulado y limpieza tras teletransporte.
- Guardados V1 anteriores y predeterminados de los controles nuevos; posición recalculada sobre el relieve actual.
- Carga local, cambios bajo/alto/medio, salida nativa con escala interna 75%, estimación de memoria y error visible si falta una textura.
- Teclado, salto, cambio de forma, prioridad de gravedad y pausa; mando estándar emulado y desconexión. La emulación no acredita un mando físico.
- Capturas de costa, rasante, monolito, cumbre, nube, sobre nubes, océano y tormenta. Vídeo separado con rodadura, planeo, giro, impacto acuático, nube y cambio de origen.

## Recursos y límites de las mediciones

`npm run assets:check` verifica firmas KTX2, dimensiones, mipmaps, bytes y SHA-256; limita la distribución completa a 80 MB y la carga inicial conservadora a 20 MB, sin descontar gzip. Solo se cargan las texturas del perfil activo; alto selecciona 4K en arena/roca y conserva 2K en las otras familias. Las cuatro familias se comparten por toda la región y permanecen residentes. Los sectores físicos se precargan por dirección y se liberan por distancia.

La memoria es una estimación de buffers, texturas comprimidas, sombras, geometría y render targets administrados, con margen para efectos; no equivale a VRAM total del proceso ni incluye todas las decisiones internas del controlador. La referencia local es RTX 5070 Ti, controlador 610.88, Windows y Chromium con WebGPU. No extrapolar sus FPS a RTX 3060/RX 6600.

## Aceptación externa pendiente

- Medición en RTX 3060/RX 6600: 1080p nativo y resolución dinámica identificados por separado; media ≥60 FPS y p95 ≤20 ms durante diez minutos activos.
- Partida completa sin API de pruebas con teclado/mouse y mando físico: duración aproximada de 15–20 minutos, acceso a cinco destinos y ausencia de puntos de bloqueo.
- Aprobación artística de las comparativas y revisión humana de los vídeos a velocidad normal, especialmente reconstrucción temporal durante giros, LOD y entrada/salida de nubes.

El agua usa información visible para SSR y vuelve al ambiente fuera de pantalla. Nubes, dispersión y exposición son aproximaciones descritas en [Arquitectura](ARCHITECTURE.md). No se ofrecen reflejos de escena fuera de pantalla ni colisión de cada fragmento decorativo. La gravilla menor al radio de la nave es exclusivamente visual.
