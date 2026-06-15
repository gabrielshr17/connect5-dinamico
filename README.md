# Connect 5 Dinámico 🎮💥

Un juego tipo *Conecta 4* pero llevado al siguiente nivel: hay que **conectar 5 fichas**, el tablero es más grande y cada jugador cuenta con **fichas con superpoderes**. Interfaz **3D divertida**, modo **online por enlace** (sin servidor propio) y modo **contra la máquina**.

🕹️ **Jugar:** abre `index.html` o despliega en GitHub Pages (ver abajo).

## ✨ Modos de juego

- 🤖 **Contra la máquina** — una IA que ataca, defiende y usa las habilidades.
- 🛋️ **2 jugadores** — en el mismo dispositivo (pista compartida).
- 🌐 **Online** — el anfitrión crea una sala y comparte un enlace. Cuando el rival lo abre, empieza la partida. Usa **WebRTC (PeerJS)**, no hace falta servidor propio.

## 🎯 Reglas

Conecta **5 fichas** del mismo color en línea horizontal, vertical o diagonal en un tablero de **10 × 8**.

## 🧨 Fichas con habilidades

Cada jugador empieza con un número limitado de cada una:

| Habilidad | Efecto |
|-----------|--------|
| 💣 **Bomba** | La ficha cae y elimina todas las fichas adyacentes (luego se aplica gravedad). |
| 🧱 **Bloque** | Coloca **2 fichas tuyas apiladas** en una sola jugada. |
| 🧊 **Congelación** | Bloquea una columna para el rival durante su próximo turno. |
| 🔄 **Cambio de color** | Convierte una ficha del rival en una tuya. |

## 🎨 Interfaz

- Tablero **3D** con perspectiva — **arrástralo con el ratón/dedo para girarlo**.
- Animaciones de caída, explosiones, escarcha y destellos.
- Efectos de sonido sintetizados (se pueden silenciar con 🔇).

## 🛠️ Tecnología

- **HTML + CSS 3D + JavaScript (ES Modules)** — sin framework, sin build.
- **PeerJS** para el multijugador online P2P.
- Lógica del juego separada y testeable (`js/game.js`).

## 🚀 Cómo ejecutarlo localmente

Como usa módulos ES, sírvelo con un servidor estático:

```bash
# con Node
npx serve .
# o con Python
python -m http.server 8000
```

Luego abre `http://localhost:8000`.

## 🌍 Desplegar en GitHub Pages

1. *Settings → Pages*.
2. *Source*: rama `main`, carpeta `/ (root)`.
3. Tu juego quedará en `https://<usuario>.github.io/<repo>/`.

El enlace de invitación online funciona directamente sobre esa URL pública.

## 📁 Estructura

```
connect5-dinamico/
├── index.html
├── css/styles.css
└── js/
    ├── game.js   # lógica pura del juego
    ├── ai.js     # inteligencia artificial
    ├── net.js    # multijugador P2P (PeerJS)
    ├── audio.js  # efectos de sonido
    └── ui.js     # interfaz y control
```

---

Hecho con 💜 — ¡a conectar 5!
