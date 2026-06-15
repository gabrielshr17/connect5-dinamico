// ===================================================================
//  Capa de red P2P usando PeerJS (broker público gratuito).
//  No requiere servidor propio: el anfitrión comparte un enlace.
// ===================================================================
//  PeerJS se carga como global `window.Peer` desde el CDN en index.html.

// STUN + TURN gratuitos para atravesar NAT/routers simétricos.
const ICE = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    // Relay gratuito (openrelay.metered.ca) — sin cuenta requerida.
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
};

const PEER_OPTS = { debug: 0, config: ICE };

// Mensajes amigables para cada tipo de error de PeerJS.
export function peerErrMsg(err) {
  const type = err?.type || '';
  const map = {
    'network':            'No se pudo contactar el servidor de señalización. Revisa tu conexión a internet.',
    'server-error':       'Error en el servidor de señalización. Inténtalo en unos segundos.',
    'peer-unavailable':   'El enlace expiró o el anfitrión ya cerró la sala.',
    'browser-incompatible': 'Tu navegador no soporta WebRTC. Usa Chrome, Firefox o Edge actualizados.',
    'ssl-unavailable':    'Se requiere HTTPS para jugar online. Accede desde el enlace de GitHub Pages.',
    'disconnected':       'Se perdió la conexión con el servidor de señalización.',
    'socket-error':       'Error de red. Revisa tu conexión e inténtalo de nuevo.',
  };
  return map[type] || `Error de conexión (${type || err?.message || 'desconocido'}).`;
}

export class NetGame {
  constructor() {
    this.peer = null;
    this.conn = null;
    this.role = null;       // 'host' | 'guest'
    this.myPlayer = null;   // 1 (host) | 2 (guest)
    this.onMessage = () => {};
    this.onStatus = () => {};
    this.onConnected = () => {};
    this._connTimeout = null;
  }

  _bindConn(conn) {
    this.conn = conn;
    conn.on('open', () => {
      clearTimeout(this._connTimeout);
      this.onStatus('connected');
      this.onConnected();
    });
    conn.on('data', (data) => this.onMessage(data));
    conn.on('close', () => this.onStatus('closed'));
    conn.on('error', (err) => {
      clearTimeout(this._connTimeout);
      this.onStatus('error', err);
    });
  }

  // El anfitrión crea la sala y devuelve (vía callback) su id para el enlace.
  host() {
    return new Promise((resolve, reject) => {
      // Si el servidor de señalización no responde en 12 s, abortamos.
      const openTimeout = setTimeout(() => {
        reject({ type: 'network', message: 'Tiempo de espera agotado.' });
      }, 12000);

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
        // Timeout por si el rival conecta al broker pero falla el WebRTC.
        this._connTimeout = setTimeout(() => {
          this.onStatus('error', { type: 'network', message: 'El rival se conectó pero no completó la negociación WebRTC.' });
        }, 20000);
        this._bindConn(conn);
      });

      this.peer.on('error', (err) => {
        clearTimeout(openTimeout);
        this.onStatus('error', err);
        reject(err);
      });
    });
  }

  // El invitado se une usando el id del anfitrión.
  join(hostId) {
    // Timeout global: si en 20 s no hay conexión, mostramos el error.
    this._connTimeout = setTimeout(() => {
      this.onStatus('error', { type: 'network', message: 'Tiempo de espera agotado. El enlace puede haber expirado.' });
    }, 20000);

    this.role = 'guest';
    this.myPlayer = 2;
    this.peer = new window.Peer(undefined, PEER_OPTS);

    this.peer.on('open', () => {
      this.onStatus('connecting');
      const conn = this.peer.connect(hostId, { reliable: true, serialization: 'json' });
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
