# Motor de Nácar

## Arranque y dependencias

Node 24.20.0, npm y Vite producen un sitio estático con base `/ExoWeb/`. Three.js 0.186.0 se importa por `three/webgpu` y `three/tsl`; no hay imports CDN ni fallback WebGL. TypeScript 6.0.3 es intencional: el parser de typescript-eslint 8.70.1 no admite TypeScript 7. La interfaz se carga antes que el módulo gráfico.

`main.ts` coordina el ciclo de vida, no implementa el render ni la física. Los contratos están en `src/types.ts`: InputFrame, PlayerState, WorldDefinition, WorldSampler, RenderSnapshot y SaveDataV1. Cada subsistema libera sus recursos al abandonar la página.

## Fuente de verdad del mundo

La región jugable mide 64 km por lado. WORLD.seed (7319) se inserta en el hash entero de las funciones WGSL al construirlas. Cambiarlo requiere regenerar el mundo y versionar el guardado; la ruta está diseñada para esta semilla.

TerrainStream genera sectores de 256 m con 257 × 257 alturas en un storage buffer mediante compute. El buffer reutilizable se copia a CPU una vez por sector. La cola se ordena por proximidad y se procesa en serie para que el uniform de coordenadas no cambie mientras una lectura está pendiente. No hay readbacks dentro de `simulate`.

El sampler divide cada celda por la diagonal a-c-b / b-c-d, igual que PlaneGeometry rotada sobre XZ. Los nueve sectores visuales próximos utilizan esas alturas como atributos; el desplazamiento sucede en el vertex shader. El terreno distante evalúa la misma función WGSL, con quadtree, morphing espacial y faldas verticales en los bordes. La colisión no cambia con la calidad visual.

Se solicita un área próxima de 5 × 5 sectores y un corredor de cuatro segundos en la dirección de la velocidad. Las alturas se retienen hasta 4 km. Un paso de simulación que requiere datos ausentes se pospone con un aviso de carga. Al teletransportar, se espera la vecindad completa antes de activar el jugador.

La posición global usa números JavaScript de doble precisión. Al alejarse 2 km del origen gráfico, se actualiza el origen local, se reposicionan las mallas y se invalida el historial temporal. La simulación conserva sus coordenadas globales.

## Simulación

FixedClock integra a 120 Hz y permite hasta 12 pasos por frame. Volver de una pestaña oculta no acumula minutos de simulación. El render interpola estados anterior y actual.

La nave utiliza un volumen conservador esférico de radio 2.5 m durante ambas formas. Esto evita penetraciones durante el morph. La forma de disco modifica sustentación y resistencia; no es un simulador aerodinámico de un disco rígido. La dirección en vuelo rota el impulso horizontal sin añadir energía. La gravedad intensificada tiene prioridad sobre el planeo.

Las colisiones barren el desplazamiento en intervalos máximos de 1 m y refinan el contacto con ocho iteraciones. Se proyecta la velocidad sobre la superficie. Los cinco pilares tienen colisión radial próxima. Los límites del mundo y estados no finitos recuperan al jugador desde el checkpoint.

El océano usa tres ondas Gerstner con inversión aproximada del desplazamiento horizontal en CPU y WGSL. El disco rebota con velocidad horizontal >30 m/s e incidencia <20°. La alternativa es flotar y saltar de nuevo, evitando un estado de bloqueo en mar abierto. Los volúmenes de térmicas están declarados una vez y también generan el código de densidad de las columnas de nube.

## Render

La escena HDR produce color y velocidad. Los materiales TSL usan funciones WGSL tipadas mediante un único adaptador (`render/native.ts`) porque los tipos publicados de nativeFn no describen completamente el proxy invocable. No se desactiva TypeScript estricto.

Los materiales con desplazamiento escriben también `positionPrevious`; comparar con la malla plana produciría motion blur falso. Los vectores NDC se convierten a UV antes de la reconstrucción y se limitan para prevenir estelas extremas.

Orden de pases:

1. Terreno, océano con quadtree, nave, señales, cielo y partículas instanciadas.
2. Raymarch volumétrico a resolución reducida: densidad procedural 3D, erosión, extinción y muestreo hacia el sol.
3. Reproyección aproximada sobre la capa de nubes; rechazo por profundidad/opacidad y limitación del historial.
4. Ampliación de cuatro muestras guiada por profundidad y composición premultiplicada.
5. Resolución temporal de la escena con vectores de movimiento y limitación por vecindad.
6. Motion blur, bloom, viñeta, grano, exposición acotada y ACES. La UI permanece fuera del render.

La reproyección de nubes utiliza una distancia representativa de la capa, no un campo de velocidades volumétrico completo. Es una aproximación; hay que revisar especialmente la entrada/salida rápida de nubes. La exposición responde al clima y no usa una lectura de histograma. La atmósfera es una aproximación Rayleigh/Mie, no una simulación planetaria completa. El horizonte se extiende hasta 120 km; terreno y océano incorporan un descenso cuadrático visual a partir de 8 km para sugerir curvatura, sin alterar la colisión próxima. No hay gravedad radial ni circunnavegación.

Perfiles: bajo 32 pasos de nube a ¼ por eje; medio 64 a ½; alto 96 a ½. La escala interna cambia gradualmente entre 67% y 100%. Cada cambio invalida los buffers temporales. El modo de confort fija FOV 65°, elimina balanceo y pone el blur a cero.

## Interacción y persistencia

Teclado/mouse y mandos con mapping estándar producen el mismo InputFrame. Las entradas se limpian al pausar o perder foco. Desconectar el mando pausa. La reasignación intercambia controles en conflicto y Escape cancela sin guardar una tecla nueva.

El guardado contiene versión, checkpoint, finalización y ajustes. No guarda posición arbitraria ni recursos gráficos. Al continuar se vuelve a una ubicación segura. JSON inválido o versiones desconocidas vuelven a valores iniciales. Si falla localStorage, el juego sigue en memoria y avisa.

Web Audio sintetiza ambiente y seis voces musicales originales. Solo comienza tras interacción; los buses de música y efectos se ajustan por separado. No hay audio descargado, analíticas ni backend.

## Parámetros y herramientas

- `src/config.ts`: física, ruta, térmicas, controles y perfiles.
- `src/world/field.ts`: relieve, ondas y hash de semilla.
- `src/render/shaders.ts`: paleta, atmósfera, nubes y materiales.
- F3: estadísticas de frame, GPU cuando está disponible, sectores y memoria estimada.
- `?scene=costa|pendiente|cima|nube|cielo|oceano`: escenas visuales reproducibles; no alteran el guardado.
- `?pass=scene|clouds|motion`: aislar pases para inspección gráfica.
- `?test=1`: habilita una API local de aceptación con snapshot, muestras y teletransporte entre esas escenas. No se activa por defecto.

La memoria mostrada es una estimación conservadora de recursos administrados, no una medida de la VRAM total del proceso. La verificación física y el rendimiento gráfico se validan por separado.
