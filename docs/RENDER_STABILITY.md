# Nácar: corrección del parpadeo

Corrección en `codex/nacar-visual-fidelity`, sobre la renovación `0012df1`. [Comparación y vídeo](verification/nacar/flicker/index.html).

El desplazamiento subpíxel usado para antialiasing se propagaba a los rayos de las nubes y a la imagen final. El trazado volumétrico cambiaba además todos sus intervalos al variar la profundidad de una montaña. El filtro de nubes interpolaba color antes de descartar profundidad incompatible. La combinación producía oscilación de densidad, bandas y contaminación de siluetas.

La corrección:

- Reconstruye color y profundidad en coordenadas de salida estables, compensando el desplazamiento de la proyección actual. Quita los desplazamientos actual/anterior de los vectores antes de reproyectar el historial y calcular motion blur.
- Da a las nubes proyección e historial propios sin jitter de geometría, con muestras estratificadas estables por píxel.
- Mantiene la distribución de intervalos del trazado independiente del relieve. Recorta únicamente el último intervalo visible y conserva profundidad válida incluso en rayos sin intersección con la capa.
- Comprueba la profundidad de cada muestra antes de interpolar, tanto en el filtro espacial como en reproyección y ampliación. Refuerza la acumulación del terreno lejano conservando rechazo por profundidad, movimiento y límites de vecindad.
- Reproyecta la profundidad del mismo volumen filtrado que produce el color. Un píxel vacío deja de colocar nubes vecinas a un metro de la cámara; el cielo despejado descarta ese historial para no estirarlo en bandas durante giros y transiciones.

Los cambios de resolución, teletransporte y origen gráfico siguen invalidando los historiales. No se añadieron render targets ni recursos gráficos. El grano cinematográfico conserva su control independiente y su variación intencional.

## Evidencia temporal

Dos pruebas WebGPU ejecutan la misma costa con 1920×1080, perfil medio, escala 100%, tiempo 30 s congelado, disco y cámara fija. Esperan 180 fotogramas para estabilizar seguimiento e historial y comparan 16 capturas. Se oculta la capa HTML para que no modifique la medida. Las nubes se evalúan aisladas; la montaña, con el render final y sus efectos normales.

| Medida, niveles RGB 0–255                         | Antes (`0012df1`) | Corregido |
| ------------------------------------------------- | ----------------: | --------: |
| Variación media del cielo, pase de nubes          |             0,755 |    <0,001 |
| Variación media del horizonte, pase de nubes      |             1,086 |    <0,001 |
| p99 de variación sobre montaña, salida final      |             28,33 |      6,33 |
| Valor máximo de nube sobre primer plano despejado |                 0 |         0 |

Las dos pruebas fallan en la versión anterior y pasan en la corregida. Los límites de regresión son media <0,05 en cielo, <0,15 en horizonte y p99 <15 en montaña. [Datos, métricas adicionales y regiones exactas](verification/nacar/flicker/temporal.json). No son una medida general de calidad artística ni garantizan ausencia de aliasing en toda posición posible.

Se capturaron las ocho vistas de referencia y un vídeo nuevo de 65 s con rodadura, planeo, giro, agua, entrada/salida de nubes y cambio de origen. La nueva galería conserva las evidencias de la renovación inicial como versión anterior; no las presenta como resultados del código corregido.

## Validación

Formato, lint, TypeScript, build, presupuestos de recursos y **46 pruebas unitarias** aprobados. **18 casos distintos de navegador** aprobados: la suite completa más la segunda prueba temporal de montaña. El benchmark estático histórico de diez minutos se omite; el recorrido activo se midió aparte del vídeo.

Control de rendimiento con RTX 5070 Ti, Chromium 153, WebGPU, 1920×1080 nativo, medio: **64,97 s activos**, **108,24 FPS medios**, p95 ≤14 ms en cada uno de los seis tramos, máximo 21,0 ms y memoria administrada estimada máxima 403,6 MiB. Cero errores de página, consola o WebGPU. [Registro completo](verification/nacar/flicker/active-1080p.json).

Este control breve verifica la corrección local. No reemplaza el benchmark original de diez minutos ni acredita rendimiento en RTX 3060/RX 6600.

## Reproducción

```powershell
npm run check
$env:GPU_TESTS='1'
npm run test:e2e -- tests/e2e/temporal.spec.ts
$env:RECORD_MOTION='1'
$env:ACTIVE_BENCHMARK_SECONDS='60'
npm run test:e2e
```

Para comprobar que la regresión detecta el problema, compilar `0012df1` en una carpeta separada y servirlo en otro puerto. Ejecutar las dos pruebas con `TEMPORAL_BASE_URL` apuntando a ese servidor: ambas deben fallar. Eliminar esa variable antes de probar el código corregido. La salida estándar de Playwright guarda las métricas `temporal.json` y las capturas primera/última de cada pase.
