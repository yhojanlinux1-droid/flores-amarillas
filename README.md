# Flores Amarillas

Experiencia web interactiva: un ramo de flores amarillas crece sobre una galaxia, con luciérnagas y música, al primer toque de la pantalla.

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6%20Modules-F7DF1E?style=flat-square&logo=javascript&logoColor=black)

**Demo:** [yhojanlinux1-droid.github.io/flores-amarillas](https://yhojanlinux1-droid.github.io/flores-amarillas/)

Inspirada en la tradición de regalar flores amarillas. Vanilla JS, sin dependencias ni bundler.

---

## Qué hace

1. Pantalla de inicio sobre un fondo de galaxia (nebulosas en CSS, estrellas y estrellas fugaces en Canvas) con el texto *No eres espectadora*.
2. Al primer clic, toque o tecla (`Enter` / `Espacio`):
   - el texto se desvanece;
   - empieza `assets/audio/golden-hour.mp3` en bucle, con un fundido de volumen de 0 a 0.4 en 2.5 s (dentro del gesto del usuario, para cumplir la política de autoplay);
   - crecen tres tallos y los pétalos se abren de forma escalonada.
3. Ya abiertas, las flores se balancean con el viento y alrededor flotan luciérnagas doradas.

El dibujo es procedural en Canvas 2D: pétalos con curvas Bézier en tres capas, gradientes, pistilo con semillas en espiral de Fibonacci y tallo de grosor variable.

## Cómo ejecutarlo

Los módulos ES no cargan abriendo el archivo directamente (`file://`). Hace falta un servidor estático.

```bash
git clone https://github.com/yhojanlinux1-droid/flores-amarillas.git
cd flores-amarillas
python -m http.server 8080
```

Abre [http://localhost:8080](http://localhost:8080). En VS Code / Cursor, la extensión Live Server hace lo mismo.

## Estructura

```
flores-amarillas/
├── index.html              # Lienzos, capas de la galaxia y pantalla de inicio
├── css/
│   └── style.css           # Galaxia, nebulosas, viñeta y tipografía
├── js/
│   ├── main.js             # Bucle, resize, viento, estrellas y arranque
│   ├── classes/
│   │   ├── Flower.js       # Flor procedural (tallo, pétalos, pistilo)
│   │   └── Particle.js     # Luciérnagas
│   └── utils/
│       └── audio.js        # AudioPlayer: bucle y fade-in
├── assets/
│   └── audio/
│       └── golden-hour.mp3
├── .gitignore
└── README.md
```

## Personalizar

| Qué | Dónde |
| --- | --- |
| Textos de la intro | `index.html`, sección `#intro` |
| Colores, fuentes y fondo | variables `:root` y gradientes en `css/style.css` |
| Cantidad, altura, curvatura y retardo de las flores | arreglo `BOUQUET` en `js/main.js` |
| Forma y color de los pétalos | arreglo `LAYERS` en `js/classes/Flower.js` |
| Canción, volumen final y duración del fade-in | `new AudioPlayer(...)` en `js/main.js` |
| Cantidad de luciérnagas | `fireflyCount()` en `js/main.js` |

La pista va en `assets/audio/`. Si cambias el nombre del archivo, actualiza la ruta que se pasa a `AudioPlayer`.

## Licencia

[MIT](LICENSE). Úsalo, modifícalo y regálalo.

La música de `assets/audio/` pertenece a sus autores; este repositorio solo la incluye como parte de la experiencia.

---

Hecho por [Yhojan Mendoza](https://github.com/yhojanlinux1-droid).
