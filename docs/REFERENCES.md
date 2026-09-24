# Referencias y atribuciones

## Dirección visual

Exo One, desarrollado por Exbleative, sirve como referencia de escala, atmósfera, navegación por impulso y señales distantes. ExoWeb es una implementación independiente. No contiene modelos, música, texturas ni shaders extraídos del juego.

| Referencia                                                                                                             | Qué observar                                                                    |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [Paisaje frío y estructuras](https://image.api.playstation.com/vulcan/ap/rnd/202204/2016/9uxjpgyFcClgglT7V1kdMviH.jpg) | Desaturación, niebla por distancia, nave pequeña y contraste con hitos enormes. |
| [Relieve rojizo y horizonte](https://image.api.playstation.com/vulcan/ap/rnd/202204/2016/YIwCvSMeyTNlnVnsf72PTeOw.png) | Paleta cálida, capas de profundidad y señal luminosa.                           |
| [Galería oficial PlayStation](https://store.playstation.com/en-us/concept/10004642)                                    | Coherencia de escala y atmósfera entre escenarios.                              |
| [Descripción oficial Steam](https://store.steampowered.com/app/773370/Exo_One/)                                        | Gravedad, impulso, pendientes y corrientes ascendentes.                         |

Las capturas se enlazan como referencia editorial; no se incluyen en el build.

Para el ciclo de movimiento se consultó también la [explicación del creador con ejemplos de gravedad, planeo, térmicas y rebotes](https://www.exbleative.com/two-new-animated-gifs-of-exo-one-gameplay/), publicada durante el desarrollo en 2016. Las cifras de energía y aceleración de ExoWeb son ajustes propios; esa fuente no publica las ecuaciones finales del original.

## Fuentes técnicas

- [Three.js WebGPURenderer](https://threejs.org/manual/pages/webgpurenderer): migración a nodos/TSL y nuevo pipeline.
- [Nubes volumétricas oficiales](https://threejs.org/examples/webgpu_volume_cloud.html): raymarching de volúmenes. ExoWeb calcula su densidad procedural directamente en GPU.
- [Motion blur oficial](https://threejs.org/examples/webgpu_postprocessing_motion_blur.html): efecto basado en vectores de movimiento.
- [GitHub Pages con Actions](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
- [Vite en Pages](https://vite.dev/guide/static-deploy.html#github-pages).
- [Playwright Chromium headless](https://playwright.dev/docs/browsers#chromium-new-headless-mode): la suite GPU usa Chrome completo en modo headless, no headless shell.

Three.js se distribuye bajo licencia MIT, incluida en `node_modules/three/LICENSE` y reproducida en THIRD_PARTY_NOTICES.md. El ruido de este motor usa un hash entero y una implementación propia de ruido de valor; los shaders GLSL anteriores fueron retirados.
