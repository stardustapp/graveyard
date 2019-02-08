class PoCRecordClient {
  constructor(baseUrl, appId, queueResponses) {
    this.appId = appId;
    this.sendDownstream = queueResponses;

    this.serverNum = String(Math.floor(Math.random()*1000)).padStart(3, '0');
    this.sessionId = randomString();

    this.ws = new WebSocket(`${baseUrl}/sockjs/${this.serverNum}/${this.sessionId}/websocket`);
    this.ready = new Promise((resolve, reject) => {
      this.ws.onopen = () => {
        console.debug(`WebSocket open`);
      };
      this.done = new Promise((resolve2, reject2) => {
        this.ws.onerror = error => {
          console.log(`WebSocket error:`, error);
          reject(error);
          reject2(error);
        };
        this.ws.onclose = event => {
          console.log(`WebSocket close:`, event);
          reject(event);
          resolve2(event);
        };
      });
      this.ws.onmessage = e => {
        switch (e.data[0]) {
          case 'o':
            this.sendNow({"msg":"connect","version":"1","support":["1"]});
            resolve();
            break;
          case 'a':
            const packets = JSON.parse(e.data.slice(1));
            for (const rawPkt of packets) {
              this.processInbound(JSON.parse(rawPkt));
            }
            break;
          default:
            console.error('Bad poc DDP type:', e.data[0]);
        }
      };
    });
  }

  processInbound(packet) {
    if (['added', 'changed', 'removed', 'updated', 'ready', 'nosub', 'result'].includes(packet.msg))
      this.sendDownstream(packet);
    else if (packet.msg === 'ping')
      this.sendNow({ msg: 'pong' });
    else
      console.log('ignoring inbound pkt:', packet);
  }

  sendNow(packet) {
    this.ws.send(JSON.stringify([JSON.stringify(packet)]));
  }

  async subscribe(id, pubName, arg={}) {
    await this.ready;
    this.sendNow({
      id: id,
      msg: 'sub',
      name: '/dust/publication',
      params: [ this.appId, pubName, arg ],
    });
  }
}
