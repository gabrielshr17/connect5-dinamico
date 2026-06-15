// ===================================================================
//  Capa de red P2P usando PeerJS (broker público gratuito).
//  No requiere servidor propio: el anfitrión comparte un enlace.
// ===================================================================
//  PeerJS se carga como global `window.Peer` desde el CDN en index.html.

// STUN + múltiples TURN para atravesar CGNAT móvil.
// Se usan dos proveedores distintos; si uno falla el otro entra.
const ICE = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    // TURN gratuito — Metered.ca open relay
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
        'turn:openrelay.metered.ca:80?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    // TURN gratuito — relay.backups.cz (servidor comunitario alternativo)
    {
      urls: [
        'turn:relay.backups.cz',
        'turn:relay.backups.cz?transport=tcp',
      ],
      username: 'webrtc',
      credential: 'webrtc',
    },
  ],
  iceCandidatePoolSize: 10,
};

const PEER_OPTS = { debug: 0, config: ICE };

// Mensajes amigables para cada tipo de error de PeerJS.
export function peerErrMsg(err) {
  const type = err?.type || '';
  const map = {
    'network':              'No se pudo contactar el servidor de señalización. Revisa tu conexión.',
    'server-error':         'Error en el servidor. Inténtalo en unos segundos.',
    'peer-unavailable':     'El enlace expiró o el anfitrión cerró la sala.',
    'browser-incompatible': 'Tu navegador no soporta WebRTC. Usa Chrome, Firefox o Edge.',
    'ssl-unavailable':      'Se requiere HTTPS para jugar online (usa el enlace de GitHub Pages).',
    'disconnected':         'Se perdió la conexión con el servidor de señalización.',
    'socket-error':         'Error de red. Revisa tu conexión e inténtalo de nuevo.',
    'socket-closed':        'La conexión con el servidor se cerró inesperadamente.',
  };
  return map[type] || `Error de conexión (${type || err?.message || 'desconocido'}).`;
}

export class NetGame {
  constructor() {
    this.peer = null;
    this.conn = null;
    this.role   = null;     // 'host' | 'guest'
    this.myPlayer = null;   // 1 | 2
    this.onMessage   = () => {};
    this.onStatus    = () => {};
    this.onConnected = () => {};
    this._connTimeout = null;
  }

  _bindConn(conn) {
    this.conn = conn;

    const onOpen = () => {
      clearTimeout(this._connTimeout);
      this.onStatus('connected');
      this.onConnected();
    };

    // Guard contra race condition: en redes rápidas (o móvil con WebRTC
    // optimizado) el canal puede estar abierto antes de adjuntar el handler.
    if (conn.open) {
      onOpen();
    } else {
      conn.on('open', onOpen);
    }

    conn.on('data',  (data) => this.onMessage(data));
    conn.on('close', ()     => this.onStatus('closed'));
    conn.on('error', (err)  => {
      clearTimeout(this._connTimeout);
      this.onStatus('error', err);
    });
  }

  // El anfitrión crea la sala y devuelve su ID para generar el enlace.
  host() {
    return new Promise((resolve, reject) => {
      const openTimeout = setTimeout(() => {
        reject({ type: 'network', message: 'Tiempo de espera agotado al crear la sala.' });
      }, 15000);

      this.role = 'host';
      this.myPlayer = 1;
      this.peer = new window.Peer(undefined, PEER_OPTS);

      this.peer.on('open', (id) => {
        clearTimeout(openTimeout);
        this.onStatus('waiting');
        resolve(id);
      });

      this.peer.on('connection', (conn) => {
        this.onStatus('peer-found');
        // Si la negociación WebRTC no se completa en 25 s → error visible.
        this._connTimeout = setTimeout(() => {
          this.onStatus('error', {
            type: 'network',
            message: 'El rival se conectó al servidor pero el enlace WebRTC no pudo establecerse. ' +
                     'Verifica que ambos dispositivos tengan conexión estable.',
          });
        }, 25000);
        this._bindConn(conn);
      });

      this.peer.on('error', (err) => {
        clearTimeout(openTimeout);
        this.onStatus('error', err);
        reject(err);
      });
    });
  }

  // El invitado se une usando el ID del anfitrión.
  join(hostId) {
    // Timeout global: 25 s para completar toda la negociación.
    this._connTimeout = setTimeout(() => {
      this.onStatus('error', {
        type: 'network',
        message: 'Tiempo de espera agotado. El enlace puede haber expirado o hay problemas de red.',
      });
    }, 25000);

    this.role = 'guest';
    this.myPlayer = 2;
    this.peer = new window.Peer(undefined, PEER_OPTS);

    this.peer.on('open', () => {
      this.onStatus('connecting');
      // Sin serialization: 'json' → ambos lados usan el mismo formato por defecto.
      const conn = this.peer.connect(hostId, { reliable: true });
      this._bindConn(conn);
    });

    this.peer.on('error', (err) => {
      clearTimeout(this._connTimeout);
      this.onStatus('error', err);
    });
  }

  send(data) {
    if (this.conn && this.conn.open) this.conn.send(data);
  }

  destroy() {
    clearTimeout(this._connTimeout);
    try { if (this.conn) this.conn.close(); } catch (e) {}
    try { if (this.peer) this.peer.destroy(); } catch (e) {}
    this.peer = null;
    this.conn = null;
  }
}
