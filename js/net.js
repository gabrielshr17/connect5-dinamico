// ===================================================================
//  Capa de red P2P usando PeerJS (broker público gratuito).
//  No requiere servidor propio: el anfitrión comparte un enlace.
// ===================================================================
//  PeerJS se carga como global `window.Peer` desde el CDN en index.html.

export class NetGame {
  constructor() {
    this.peer = null;
    this.conn = null;
    this.role = null;       // 'host' | 'guest'
    this.myPlayer = null;   // 1 (host) | 2 (guest)
    this.onMessage = () => {};
    this.onStatus = () => {};
    this.onConnected = () => {};
  }

  _bindConn(conn) {
    this.conn = conn;
    conn.on('open', () => {
      this.onStatus('connected');
      this.onConnected();
    });
    conn.on('data', (data) => this.onMessage(data));
    conn.on('close', () => this.onStatus('closed'));
    conn.on('error', (err) => this.onStatus('error', err));
  }

  // El anfitrión crea la sala y devuelve (vía callback) su id para el enlace.
  host() {
    return new Promise((resolve, reject) => {
      this.role = 'host';
      this.myPlayer = 1;
      this.peer = new window.Peer(undefined, { debug: 1 });
      this.peer.on('open', (id) => {
        this.onStatus('waiting');
        resolve(id);
      });
      this.peer.on('connection', (conn) => {
        this.onStatus('peer-found');
        this._bindConn(conn);
      });
      this.peer.on('error', (err) => {
        this.onStatus('error', err);
        reject(err);
      });
    });
  }

  // El invitado se une usando el id del anfitrión.
  join(hostId) {
    this.role = 'guest';
    this.myPlayer = 2;
    this.peer = new window.Peer(undefined, { debug: 1 });
    this.peer.on('open', () => {
      this.onStatus('connecting');
      const conn = this.peer.connect(hostId, { reliable: true });
      this._bindConn(conn);
    });
    this.peer.on('error', (err) => this.onStatus('error', err));
  }

  send(data) {
    if (this.conn && this.conn.open) this.conn.send(data);
  }

  destroy() {
    try { if (this.conn) this.conn.close(); } catch (e) {}
    try { if (this.peer) this.peer.destroy(); } catch (e) {}
    this.peer = null;
    this.conn = null;
  }
}
