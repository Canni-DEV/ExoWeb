# Motor de Nácar

## Arranque y dependencias

Node 24.20.0, npm y Vite producen un sitio estático con base `/ExoWeb/`. Three.js 0.186.0 se importa por `three/webgpu` y `three/tsl`; no hay imports CDN ni fallback WebGL. TypeScript 6.0.3 es intencional: el parser de typescript-eslint 8.70.1 no admite TypeScript 7. La interfaz se carga antes que el módulo gráfico.

`main.ts` coordina el ciclo de vida, no implementa el render ni la física. Los contratos están en `src/types.ts`: InputFrame, PlayerState, WorldDefinition, WorldSampler, RenderSnapshot y SaveDataV1. Cada subsistema libera sus recursos al abandonar la página.

## Fuente de verdad del mundo

La región jugable mide 64 km por lado. WORLD.seed (7319) se inserta en el hash entero de las funciones WGSL al construirlas. Cambiarlo requiere regenerar el mundo y versionar el guardado; la ruta está diseñada para esta semilla.

TerrainStream genera sectores de 256 m con 257 × 257 alturas en un storage buffer mediante compute. El buffer reutilizable se copia a CPU una vez por sector. La cola se ordena por proximidad y se procesa en serie para que el uniform de coordenadas no cambie mientras una lectura está pendiente. No hay readbacks dentro de `simulate`.

El sampler divide cada celda por la diagonal a-c-b / b-c-d, igual que PlaneGeometry rotada sobre XZ. Los nueve sectores visuales próximos utilizan esas alturas como atributos; el desplazamiento sucede en el vertex shader. El terreno distante evalúa la misma función WGSL, con quadtree. Los vértices del borde fino interpolan el borde vecino más grueso; faldas de 4 m cubren el error residual. No se desplazan las coordenadas XZ durante las transiciones. Las normales del relieve se filtran según distancia y las normales de textura reservan el detalle superficial. La colisión no cambia con la calidad visual.

Se solicita un área próxima de 5 × 5 sectores y un corredor de cuatro segundos en la dirección de la velocidad. Las alturas se retienen hasta 4 km. Un paso de simulación que requiere datos ausentes se pospone con un aviso de carga. Al teletransportar, se espera la vecindad completa antes de activar el jugador.

La posición global usa números JavaScript de doble precisión. Al alejarse 2 km del origen gráfico, se actualiza el origen local, se reposicionan las mallas y se invalida el historial temporal. La simulación conserva sus coordenadas globales.

## Simulación

FixedClock integra a 120 Hz y permite hasta 12 pasos por frame. Volver de una pestaña oculta no acumula minutos de simulación. El render interpola estados anterior y actual.

La nave utiliza un volumen conservador esférico de radio 2.5 m durante ambas formas. Esto evita penetraciones durante el morph. La forma de disco modifica sustentación y resistencia; no es un simulador aerodinámico de un disco rígido. La dirección en vuelo rota el impulso horizontal sin añadir energía. La gravedad intensificada tiene prioridad sobre el planeo.

Desde el ajuste 2, el disco redirige gradualmente la velocidad descendente hacia delante, conservando su módulo antes de aplicar resistencia. El apoyo se mantiene dentro de un margen de 6 cm; salto anticipado (160 ms) y tolerancia de borde (100 ms) evitan perder pulsaciones por un cambio de contacto. La energía usa recarga de contacto, térmicas, rasante y picado, con histéresis tras agotarse. Valores y justificación en `FLIGHT_AND_TUNING.md`.

Las colisiones barren el desplazamiento en intervalos máximos de 1 m y refinan el contacto con ocho iteraciones. Se proyecta la velocidad sobre la superficie. `world/landmarks.ts` define cinco monolitos y 35 rocas suspendidas: render y cámara comparten sus posiciones, dimensiones, orientación y barrido contra cajas orientadas conservadoras, expandidas por el radio de la nave. Los GLB tienen dimensiones unitarias contenidas en esas cajas; la colisión no sigue cada irregularidad de una roca. Los límites del mundo y estados no finitos recuperan al jugador desde el checkpoint.

El océano usa tres ondas Gerstner con inversión aproximada del desplazamiento horizontal en CPU y WGSL. El disco rebota con velocidad horizontal >30 m/s e incidencia <20°. La alternativa es flotar y saltar de nuevo, evitando un estado de bloqueo en mar abierto. Los volúmenes de térmicas están declarados una vez y también generan el código de densidad de las columnas de nube.

## Render

La escena HDR produce color y velocidad. Los materiales TSL usan funciones WGSL tipadas mediante un único adaptador (`render/native.ts`) porque los tipos publicados de nativeFn no describen completamente el proxy invocable. No se desactiva TypeScript estricto.

Los materiales con desplazamiento escriben también `positionPrevious`; comparar con la malla plana produciría motion blur falso. Los vectores NDC se convierten a UV antes de la reconstrucción y se limitan para prevenir estelas extremas.

Orden de pases:

1. Cielo y escena opaca HDR con velocidad; copia de color y profundidad para el agua.
2. Agua: absorción, refracción y reflejo ambiental; raymarch de reflejos de pantalla en alto, con pérdida gradual de confianza hacia los bordes. Ondas anteriores utilizan el tiempo de simulación anterior.
3. Partículas, espuma, estelas y pulso sónico sobre el agua, con prueba de profundidad.
4. Nubes a resolución reducida: ruido 3D precalculado, erosión y perfiles verticales; salida de radiancia, opacidad y profundidad media ponderada por contribución. Su campo de densidad también atenúa la luz solar del suelo y del agua.
5. Reproyección de nubes con cámara y viento, rechazo por profundidad/opacidad y limitación del historial.
6. Oclusión de contacto y resolución temporal de la escena sin nubes: jitter Halton, vectores, rechazo por profundidad y limitación por vecindad. Motion blur independiente.
7. Ampliación de nubes guiada por profundidad y composición premultiplicada. No se vuelven a acumular dentro del TAA de escena.
8. Gotas de lente, bloom, viñeta, grano, exposición acotada y ACES. La UI permanece fuera del render.

La reproyección de nubes utiliza su profundidad media integrada y el viento del campo, no un campo de velocidades volumétrico completo. La exposición responde al ambiente espacial (`world/environment.ts`), independientemente del checkpoint, sin lectura de histograma. La atmósfera es una aproximación artística de dispersión. El horizonte se extiende hasta 120 km; terreno y océano incorporan un descenso cuadrático visual a partir de 8 km, sin alterar la colisión próxima. Absorción y espuma utilizan alturas canónicas para que esa curvatura no genere una costa falsa. No hay gravedad radial ni circunnavegación.

Materiales `MeshStandardNodeMaterial`: cuatro familias KTX2 con triplanar, normales y rugosidad, ambiente PMREM, sol con cascadas y luz hemisférica. El PMREM captura una cara por frame cada ocho segundos de simulación y filtra al terminar las seis; el primer cubo se prepara durante carga. El ruido de nube es un volumen periódico de 64³. Las texturas y modelos son originales y tienen generadores reproducibles; el manifest verifica SHA-256. KTX2 solicita BC/ETC2/ASTC soportados antes de crear el dispositivo; el loader selecciona el formato o recurre a RGBA, con decodificador WASM local.

Perfiles: bajo 1K, 32 pasos de nube a ½ por eje, una cascada; medio 2K, 64 a ½, dos cascadas; alto 4K en arena/roca y 2K en nieve/corteza, 96 a 0.66, tres cascadas y SSR. La escala interna cambia entre 75% y 100%, mientras el canvas conserva la resolución de pantalla. Cambios de escala, tamaño, cámara abrupta, respawn y origen invalidan los historiales. El modo de confort fija FOV 65°, desactiva blur y distorsión de lente; no hay balanceo periódico ni sacudidas automáticas.

Las familias de material y los cuatro modelos se comparten por toda la región, por lo que permanecen residentes en lugar de descargarse de nuevo al viajar. Al cambiar calidad, la sustitución es atómica y se liberan las texturas anteriores; los sectores físicos sí se precargan por trayectoria y liberan por distancia. El presupuesto de distribución completo y el de carga inicial se comprueban con `npm run assets:check` sobre el build sin comprimir.

Los eventos visuales tienen id creciente, tiempo, posición y velocidad copiados del paso físico. La cola acumula varios subpasos y el render los consume una sola vez. Emisión, envejecimiento, espuma y rotación de nave dependen de tiempo simulado; pausar los congela y teletransportar limpia los efectos. Pools limitan partículas por perfil; las estelas conservan posiciones globales para sobrevivir a un cambio de origen.

## Interacción y persistencia

Teclado/mouse y mandos con mapping estándar producen el mismo InputFrame. Las entradas se limpian al pausar o perder foco. Desconectar el mando pausa. La reasignación intercambia controles en conflicto y Escape cancela sin guardar una tecla nueva.

El guardado contiene versión, checkpoint, finalización y ajustes. No guarda posición arbitraria ni recursos gráficos. Al continuar se recalcula una altura segura sobre el terreno y el agua actuales. Los guardados V1 previos reciben valores predeterminados de HUD contextual y controles independientes de blur, grano, bloom y lente. JSON inválido o versiones desconocidas vuelven a valores iniciales. Si falla localStorage, el juego sigue en memoria y avisa.

Web Audio sintetiza ambiente y seis voces musicales originales. Solo comienza tras interacción; los buses de música y efectos se ajustan por separado. No hay audio descargado, analíticas ni backend.

## Parámetros y herramientas

- `src/config.ts`: física, ruta, térmicas, controles y perfiles.
- `src/world/field.ts`: relieve, ondas y hash de semilla.
- `src/render/shaders.ts`: paleta, atmósfera, nubes y materiales.
- F3: estadísticas de frame, GPU cuando está disponible, sectores y memoria estimada.
- `?scene=costa|rasante|monolito|pendiente|cima|nube|cielo|oceano|tormenta`: escenas visuales; no alteran el guardado.
- `?pass=scene|clouds|motion`: aislar pases para inspección gráfica.
- `?test=1`: habilita snapshot, muestras, costuras, escenas, inicio de simulación, tiempo fijo, orientación, forma, posición, velocidad, calidad, HUD y escala. Snapshot incluye memoria, cámara, salida/interno, efectos, sectores, invalidaciones y frames. No se activa por defecto.

La memoria mostrada es una estimación conservadora de recursos administrados, no una medida de la VRAM total del proceso. La verificación física y el rendimiento gráfico se validan por separado.
