# Nácar — dirección visual

Rama: `codex/nacar-visual-fidelity`. Referencia: las diez imágenes locales de `docs/capturas`, excluidas del build y del repositorio.

## Lectura de las referencias

- `1uhan5BV`, `9n2AVcm7`, `ZuBrT2C6`: arena estriada, cobre iluminado, sombras violetas, humedad especular, nubes monumentales, rocas suspendidas y monolitos. Base de costa y pliegue.
- `FMSxu5wJ`: mar de nubes con bordes dorados, bases ciruela, cielo lavanda, nave diminuta y hitos que sobresalen. Base del vuelo alto.
- `fmVy7Ayl`: océano verde profundo, ondas pequeñas superpuestas, corredor de brillos solares, atmósfera tormentosa. Base del mar interior.
- `j9Bsvt3S`: cumbres nevadas, superficie rugosa húmeda, aerosol de contacto y resplandor de nave. Base de corona y respuesta de contacto.
- `Ch_qzbRB`: penetración en bruma, nave legible por resplandor y estelas dobles.
- `IQw_szZo`, `MJzg23Jw`, `ZBfzMmcF`: bosque y lava quedan fuera de Nácar; se toma únicamente escala y separación atmosférica.

## Reglas de composición

La orilla utiliza cobre, violeta y luz dorada; el pliegue suma roca estratificada; la corona tiene nieve azul y sombras frías; el mar interior pasa a turquesa y tormenta; la señal recupera un borde luminoso en el horizonte. La transición depende de posición, no del progreso guardado.

Suelo con formas a escala kilométrica, surcos de metros y relieve superficial centimétrico. La rugosidad y las normales crean brillo fragmentado, sin hornear luz en el color. El cielo tiene zonas limpias entre masas de nubes. La nave debe conservar contorno reconocible sobre terreno, nube y sol.

Los recursos se generan con `scripts/generate-materials.mjs` y `scripts/generate-models.mjs`. Son originales; no se extraen píxeles, modelos ni texturas del juego. Las cruces, logotipos y marcas de las capturas no se recrean.

## Aceptación

Comparar costa, rasante, monolito, cumbre, interior y techo de nubes, océano y tormenta a cámara/tiempo fijos. Revisar además movimiento: transiciones de LOD, sombras, origen flotante, estelas, agua y entrada/salida de nubes. Una captura atractiva no reemplaza esta revisión temporal.

1080p nativo, perfil medio: objetivo de 60 FPS y p95 ≤20 ms en RTX 3060/RX 6600. Las mediciones de la RTX 5070 Ti se informan por separado. Descarga inicial ≤20 MB; recursos distribuidos ≤80 MB. Memoria administrada ≤512 MiB en medio, ≤1 GiB en alto.
