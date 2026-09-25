import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
const directory = 'docs/verification/nacar';
await mkdir(directory, { recursive: true });
const scenes = [
  ['costa', 'Costa · cobre y violeta'],
  ['cielo', 'Vuelo alto · escala y volumen'],
  ['oceano', 'Océano · turquesa y reflejos'],
];
const refs = await readdir('docs/capturas').catch(() => []);
const reference = (prefix, label) => {
  const name = refs.find((x) => x.startsWith(prefix));
  return name
    ? `<figure><img loading="lazy" src="../../capturas/${name}" alt="${label}"/><figcaption>${label} · referencia local del usuario</figcaption></figure>`
    : '';
};
await writeFile(
  `${directory}/comparison.html`,
  `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Nácar · Comparativa visual</title><style>
*{box-sizing:border-box}body{margin:0;background:#14121d;color:#e5d9d9;font:16px/1.6 'Segoe UI',sans-serif}main{max-width:1440px;margin:auto;padding:50px 36px}header{max-width:890px;margin-bottom:50px}small{color:#d99b80;letter-spacing:3px}h1{font-size:56px;line-height:1.1;font-weight:400;margin:16px 0 26px}h2{font-size:22px;font-weight:400;margin:40px 0 16px}p{color:#b9acbc}a{color:#edb99c}section{margin-bottom:50px}.compare{--cut:50%;position:relative;aspect-ratio:16/9;overflow:hidden;background:#25222e}.compare img{position:absolute;inset:0;width:100%;height:100%}.before{clip-path:inset(0 calc(100% - var(--cut)) 0 0)}.divider{position:absolute;left:var(--cut);height:100%;border-left:2px solid #eee9}.label{position:absolute;top:18px;padding:5px 12px;background:#16141cbb;font-size:13px}.left{left:18px}.right{right:18px}input{display:block;width:100%;accent-color:#dda886;margin:12px 0}figure{margin:0}figcaption{font-size:13px;color:#a99eae;margin-top:8px}.references{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}.references img{width:100%;aspect-ratio:16/9;object-fit:contain;background:#211c29}.gallery{display:grid;grid-template-columns:repeat(2,1fr);gap:22px}.gallery img{width:100%}video{width:100%;background:#000}footer{border-top:1px solid #453846;margin-top:50px;padding-top:20px}@media(max-width:760px){main{padding:26px 18px}h1{font-size:38px}.references,.gallery{grid-template-columns:1fr}.label{font-size:10px;top:6px}.left{left:6px}.right{right:6px}}
</style><main><header><small>EXOWEB / NÁCAR</small><h1>Del relieve al horizonte.</h1><p>Comparativa de la renovación gráfica en <code>codex/nacar-visual-fidelity</code>. 1920 × 1080, perfil medio, escala interna 100%. Arrastrá cada control para comparar.</p><p>La versión de partida es <code>master · 9922fac</code>, recompilada con cámara, tiempo y forma de nave igualados. El relieve y la presentación de cada versión se conservan. <a href="../../VALIDATION_NACAR.md">Método, pruebas y límites de aceptación</a>.</p></header>
<section><h2>Corrección posterior del parpadeo</h2><p>Las imágenes y el vídeo de esta página documentan la renovación inicial. <a href="flicker/index.html">Abrir la corrección de nubes, horizonte y reconstrucción temporal, con vídeo actualizado y resultados antes/después.</a></p></section>
${scenes.map(([name, title]) => `<section><h2>${title}</h2><div class="compare" id="${name}"><img src="${name}.png" alt="${title}, renovación"><img class="before" src="before-${name}.png" alt="${title}, versión de partida"><span class="divider"></span><span class="label left">MASTER · ENCUADRE IGUALADO</span><span class="label right">NÁCAR · RENOVACIÓN</span></div><input aria-label="Comparar ${title}" type="range" min="0" max="100" value="50" data-scene="${name}"></section>`).join('')}
<section><h2>Detalle y composición</h2><div class="gallery">${[
    ['rasante', 'Suelo cercano'],
    ['monolito', 'Monolitos y rocas suspendidas'],
    ['cima', 'Cumbres'],
    ['nube', 'Dentro de las nubes'],
    ['tormenta', 'Mar interior'],
  ]
    .map(
      ([name, label]) =>
        `<figure><a href="${name}.png"><img loading="lazy" src="${name}.png" alt="${label}"></a><figcaption>${label}</figcaption></figure>`,
    )
    .join('')}</div></section>
<section><h2>Movimiento</h2><video controls preload="metadata" src="motion.webm"></video><p>Rodadura, planeo y giros, agua, nubes y cambio de origen. El vídeo se graba por separado de las mediciones de FPS.</p></section>
<section><h2>Referencias artísticas</h2><p>Estos archivos pertenecen a la carpeta local de referencias del usuario. No se redistribuyen con el juego ni se incorporan al repositorio.</p><div class="references">${reference('9n2AVcm7', 'Cobre, reflejos y escala')}${reference('FMSxu5wJ', 'Masas de nubes y contraluz')}${reference('fmVy7Ayl', 'Océano verde y brillo fragmentado')}</div></section>
<footer><p>Recursos originales KTX2 y GLB. Distribución estática con Three.js/WebGPU. Medición local en RTX 5070 Ti; pendiente certificación en RTX 3060/RX 6600 y recorrido completo con mando físico.</p></footer></main><script>document.querySelectorAll('input[data-scene]').forEach(input=>{input.oninput=()=>document.getElementById(input.dataset.scene).style.setProperty('--cut',input.value+'%')})</script></html>`,
);
// Make the fixture adjustments explicit and reviewable without checking generated baseline files in.
await writeFile(
  `${directory}/baseline-fixture.json`,
  JSON.stringify(
    {
      commit: '9922fac',
      viewport: [1920, 1080],
      time: 30,
      form: 'disc',
      yaw: 0,
      pitch: 0.15,
      boomMeters: 65,
      settleFrames: 35,
      changes: [
        'camera distance only',
        'freeze menu time to 30s',
        'set disc/morph=1 at spawn',
        'hide HUD with CSS',
      ],
      presets: ['costa', 'cielo', 'oceano'],
    },
    null,
    2,
  ) + '\n',
);
const manifest = JSON.parse(await readFile('public/assets/materials/manifest.json', 'utf8'));
console.log(`Comparison generated; ${manifest.files.length} original surface assets registered.`);
