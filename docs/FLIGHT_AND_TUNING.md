# Vuelo y detalle del terreno — ajuste 2

Fecha: 24 de septiembre de 2026. Parámetros versionados mediante `PHYSICS.tuningVersion = 2`. El guardado continúa siendo compatible: solo almacena checkpoint, progreso y ajustes, no el estado transitorio de vuelo.

## Qué fallaba

El suelo tenía un ruido de color de aproximadamente ocho metros por celda, sin detalle de relieve superficial. Cerca de la cámara se veía como manchas suaves; lejos, la concentración de variaciones en menos píxeles daba una falsa impresión de mayor detalle. A esto se sumaban el historial temporal y un motion blur demasiado fuerte para el desplazamiento próximo al terreno.

La simulación colocaba la nave cinco milímetros por encima del contacto. En el siguiente paso, si no volvía a penetrar el terreno, pasaba a estado aéreo. Esa alternancia quitaba tracción, recarga y oportunidades de salto mientras visualmente seguía rodando. El planeo reducía la velocidad vertical por amortiguación sin transferirla a movimiento horizontal: un picado podía terminar desperdiciando el impulso que acababa de generar.

Las mallas próximas también se reconstruían al cambiar de sector, con asignaciones y subidas de buffers evitables. Se añadió reutilización de geometría y preparación de los primeros pases antes de habilitar los controles.

## Referencia del original

El [creador de Exo One describe](https://www.exbleative.com/two-new-animated-gifs-of-exo-one-gameplay/) la secuencia de rodar, saltar, planear, aumentar gravedad para bajar, liberarla para subir y utilizar térmicas. También muestra rebotes sobre agua; esa publicación es de desarrollo, de 2016. La [descripción oficial de la versión publicada](https://store.steampowered.com/app/773370/Exo_One/) mantiene gravedad, impulso, pendientes y corrientes ascendentes como núcleo del recorrido.

El terreno es parte de la mecánica: una bajada acumula velocidad y una subida la convierte en altura. Mantener gravedad al subir hace más difícil salir del valle. El disco permite prolongar y orientar el recorrido, pero necesita impulso; no funciona como una nave con acelerador permanente.

Las fuentes oficiales citadas no publican las ecuaciones ni una tabla completa de consumo de energía del original. Los valores siguientes son decisiones de ExoWeb para lograr un ciclo más continuo y recuperable; no se presentan como una reproducción exacta de su física.

## Cómo pilotar esta versión

1. **Desde parado:** usá WASD o el stick para rodar. Hay asistencia de aceleración a baja velocidad. No hace falta mantener gravedad para arrancar.
2. **En bajada:** mantené Shift/click izquierdo/RT. Soltalo al comenzar la subida para no frenar el ascenso con gravedad intensificada.
3. **Despegue:** aprovechá la rampa o saltá con Espacio/A. El salto acepta una pulsación ligeramente anterior al contacto y una pequeña tolerancia al salir de un borde.
4. **Planeo:** soltá gravedad y mantené Ctrl/click derecho/LT. La velocidad de caída gira progresivamente hacia delante, conservando el módulo antes de aplicar resistencia. A muy baja velocidad la recuperación es limitada.
5. **Energía baja:** buscá una columna ascendente, un contacto con suelo/agua o un vuelo rasante. Si tenés altura, un picado con gravedad recupera energía a cambio de descender; después soltá gravedad y retomá el disco.
6. **Si caíste y frenaste:** volvé a rodar con las direcciones. En agua, acelerá flotando y saltá para relanzarte. Si insistís en subir una ladera muy empinada, girá hacia una bajada para construir impulso y volver a intentarlo.

Gravedad tiene prioridad sobre disco. Mantener ambos botones activa la esfera y el descenso intensificado. La cámara define las direcciones de control; orientala hacia la trayectoria que querés seguir. El disco gira con un límite angular, así que un giro de 180° requiere espacio.

## Energía y recuperación

| Situación                                    | Comportamiento actual                                                        |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| Disco en aire abierto                        | Consume 5/s: unos 20 s desde 100                                             |
| Contacto efectivo con terreno o agua         | Recarga completa, también en un roce o rebote                                |
| Apoyo dentro del margen de contacto          | Recupera 50/s; no consume por mantener disco apoyado                         |
| Corriente ascendente                         | Recupera 25/s; neto 20/s mientras planea                                     |
| Rasante a menos de 8 m y más de 25 m/s       | Recupera 12/s; neto 7/s en disco                                             |
| Gravedad activa y descenso superior a 10 m/s | Recupera 8/s; gasta altura, no es un impulso gratuito                        |
| Energía agotada                              | Vuelve a esfera y espera al menos 15 de energía para permitir disco otra vez |

La espera hasta 15 evita alternar entre formas cada pocos frames cuando entra una recarga pequeña. El indicador muestra origen de recarga, segundos aproximados de planeo en aire abierto y advertencia de energía baja. La ayuda contextual usa las teclas reasignadas.

En este mundo no toda nube es una térmica. Las columnas ascendentes definidas por el recorrido son las que aportan elevación y energía; el indicador **CORRIENTE · RECARGANDO** confirma que entraste en una. Eso explica por qué dos vuelos visualmente parecidos pueden durar distinto.

## Render y fluidez

- Detalle triplanar en tres escalas: aproximadamente 2.2 m, 37 cm y 7 cm, con normal superficial procedural. No desplaza la colisión.
- Filtrado por huella del píxel: las frecuencias demasiado pequeñas se atenúan para evitar ruido y parpadeo lejano.
- Menor peso del historial temporal cerca del suelo y motion blur que empieza a aparecer por encima de 60 m/s; confort sigue desactivándolo.
- Reutilización de las nueve mallas de colisión visible, actualizando alturas y faldas al cambiar de sector. Una prueba recorre varias ventanas y verifica que sigan siendo nueve geometrías y que sus datos cambien correctamente.
- Preparación del primer frame y espera de su trabajo GPU durante la carga. No se introduce una espera GPU dentro del bucle de simulación.

## Parámetros para la siguiente iteración

`src/config.ts` centraliza duración del disco, recarga, aceleración, asistencia, tolerancia de contacto y rapidez de recuperación del picado. `src/simulation/player.ts` implementa las reglas. `src/platform/flight-guide.ts` describe cada estado. `src/render/shaders.ts` contiene escalas y relieve del material; `src/render/pipeline.ts` controla la reconstrucción y el postprocesado.

Antes de ampliar el planeta, conviene probar tres circuitos: salida desde parado y salto, cadena de bajada/subida/picado/planeo, y caída al océano con relanzamiento. Después, recorrer las cinco señales y registrar dónde el relieve no ofrece una salida clara. Ajustar primero pendientes y corrientes en esos puntos, luego consumo y aceleración; aumentar la energía global no debe ocultar un tramo mal diseñado.

El siguiente trabajo visual es diferenciar roca, arena y nieve con patrones propios y revisar vídeo en movimiento, especialmente transiciones de LOD. La próxima medición sostenida debe recorrer el mundo; las vistas estáticas no detectan todos los tirones de streaming. La duración total y el equipo RTX 3060/RX 6600 siguen requiriendo su aceptación específica.
