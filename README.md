# Connect 5 Dinámico 🎮💥

Un juego tipo *Conecta 4* pero llevado al siguiente nivel: hay que **conectar 5 fichas**, el tablero es más grande y cada jugador cuenta con **fichas con superpoderes**. Interfaz **3D divertida**, modo **online por enlace** (sin servidor propio) y modo **contra la máquina**.

🕹️ **Jugar:** abre `index.html` o despliega en GitHub Pages (ver abajo).

## ✨ Modos de juego

- 🤖 **Contra la máquina** — IA con **3 niveles de dificultad** (Fácil 🙂 / Medio 😎 / Difícil 🔥). En difícil usa lookahead de 2 niveles, defiende amenazas y aprovecha las habilidades.
- 🛋️ **2 jugadores** — en el mismo dispositivo (pista compartida).
- 🌐 **Online** — el anfitrión crea una sala y comparte un enlace. Cuando el rival lo abre, empieza la partida. Usa **WebRTC (PeerJS)**, no hace falta servidor propio. Incluye **chat** 💬 en partida.

## ⏱️ Reglas extra

- **Límite de 7 segundos por jugada** en todos los modos: si se acaba el tiempo, se suelta automáticamente una ficha en una columna válida al azar.
- **Marcador de partidas** de la sesión, visible en la cabecera (se reinicia al volver al menú).

## 🎯 Reglas

Conecta **5 fichas** del mismo color en línea horizontal, vertical o diagonal en un tablero de **10 × 8**.

## 🧨 Fichas con habilidades

Cada jugador empieza con un número limitado de cada una:

| Habilidad | Efecto |
|-----------|--------|
| 💣 **Bomba** | La ficha cae y elimina todas las fichas adyacentes (luego se aplica gravedad). |
| 🧱 **Bloque** | Coloca **2 fichas tuyas apiladas** en una sola jugada. |
| 🧊 **Congelación** | Bloquea una columna para el rival durante sus **próximos 3 turnos** (la columna se ve helada con un contador ❄️). |
| 🔄 **Cambio de color** | Convierte una ficha del rival en una tuya. |

## 🎨 Interfaz

- Tablero **3D** con perspectiva — **arrástralo con el ratón/dedo para girarlo**.
- Animaciones de caída, explosiones, escarcha y destellos.
- Efectos de sonido sintetizados (se pueden silenciar con 🔇).

## 📋 Registro de eventos (depuración)

Durante la partida, el botón **📋** (arriba a la derecha) abre un registro con marca de tiempo de todo lo que ocurre: creación de sala, conexión WebRTC, cada jugada, envíos/confirmaciones de estado y errores. Puedes **copiarlo** o **descargarlo** para diagnosticar cualquier fallo. Todo se refleja también en la consola del navegador.

## 🔒 Sincronización online robusta

El modo online no usa "lockstep" (que se desincroniza si se pierde un mensaje). En su lugar, cada jugada envía el **estado completo del tablero** numerado y se **reenvía hasta recibir confirmación (ack)**. Así, aunque la red pierda, duplique o reordene mensajes, ambos jugadores siempre convergen al mismo estado y la partida nunca se queda congelada.

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
    ├── game.js   # lógica pura del juego (+ serialización de estado)
    ├── ai.js     # inteligencia artificial
    ├── net.js    # multijugador P2P (PeerJS)
    ├── audio.js  # efectos de sonido
    ├── logger.js # registro de eventos
    └── ui.js     # interfaz, control y sincronización online
```

---

Hecho con 💜 — ¡a conectar 5!
