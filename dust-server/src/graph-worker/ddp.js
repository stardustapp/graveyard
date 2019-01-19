class DDPManager {
  constructor(contextFunc) {
    this.sessions = new Map;
    this.contexts = new LoaderCache(contextFunc);
    this.api = new PathRouter;

    this.api.registerHandler('/sockjs/info', async match => {
      var array = new Uint32Array(1);
      crypto.getRandomValues(array);
      return new Response(JSON.stringify({
        websocket: false,
        origins: ['*:*'],
        cookie_needed: false,
        entropy: array[0],
      }));
    });

    this.api.registerHandler('/sockjs/:server/:session/xhr', async ({params}, {request}) => {
      const sessionId = params.get('session');
      const serverId = params.get('server');

      if (this.sessions.has(sessionId)) {
        const session = this.sessions.get(sessionId);
        return session.nextPollResponse();
      } else {
        const session = new DDPSession({
          manager: this,
          request, serverId, sessionId,
        });
        this.sessions.set(sessionId, session);
        return new Response('o\n');
      }
    });

    this.api.registerHandler('/sockjs/:server/:session/xhr_send', async ({params}, {request}) => {
      const sessionId = params.get('session');
      if (this.sessions.has(sessionId)) {
        const session = this.sessions.get(sessionId);
        await session.processPollSend(await request.json());
        return new Response(null, {status: 204});
      } else {
        return new Response('no such session', {status: 400});
      }
    });
  }
}

class DDPSession {
  constructor({manager, request, serverId, sessionId}) {
    this.manager = manager;
    this.originalReq = request;
    this.serverId = serverId;
    this.sessionId = sessionId;

    this.session = randomString();
    this.outboundQueue = [];
    this.waitingPoll = null;
    this.closePacket = null;
    // [1000, 'Normal closure']
    // [3000, 'No response from heartbeat']

    this.packetFuncs = {
      async connect(packet) {
        // get version and support array
        if (packet.version !== '1') throw new Error(
          `bad sockjs version ${packet.version}`);
        this.queueResponses(
          {server_id: "0"},
          {msg: 'connected', session: this.session},
        );

        const referrer = PathFragment.parseUri(this.originalReq.referrer);
        const match = referrer.path.matchWith('/~/apps/by-id/:appId/:*rest');
        if (!match.ok) {
          console.warn('DDP session connected from non-app URL');
          return;
        }

        const appId = match.params.get('appId');
        this.context = await this.manager.contexts.getOne(appId, appId);
        this.context.connectSession(this);
      },
      ping(packet) {
        this.queueResponses({msg: 'pong'});
      },
    }
  }

  queueResponses(...packets) {
    packets
      .filter(pkt => pkt.msg !== 'pong')
      .forEach(pkt => console.log('>>', pkt));
    packets = packets
      .map(p => JSON.stringify(p));

    if (this.waitingPoll) {
      const resolve = this.waitingPoll;
      this.waitingPoll = null;
      resolve(new Response(`a${JSON.stringify(packets)}\n`));
    } else {
      packets.forEach(packet => {
        this.outboundQueue.push(packet);
      });
    }
  }

  async processPollSend(input) {
    for (const pkt of input.map(JSON.parse)) {
      if (pkt.msg !== 'ping')
        console.log('<<', pkt);
      const func = this.packetFuncs[pkt.msg];
      if (func) {
        try {
          await func.call(this, pkt);
        } catch (err) {
          console.error('DDP packet failure:', pkt, err);
        }
      } else {
        console.warn('weird sockjs packet', pkt);
      }
    }
  }

  async nextPollResponse() {
    // immediate return if closed
    if (this.closePacket && this.outboundQueue.length === 0) {
      return new Response(`c${this.closePacket}\n`);
    }

    // immediate return if data is queued
    if (this.outboundQueue.length) {
      const queue = this.outboundQueue;
      this.outboundQueue = [];
      return new Response(`a${JSON.stringify(queue)}\n`);
    }

    // wait for new stuff
    return new Promise(resolve => {
      setTimeout(() => {
        if (this.waitingPoll === resolve) {
          this.waitingPoll = null;
          resolve(new Response('h\n'));
          console.debug('keeping alive xhr');
        }
      }, 1000);
      if (this.waitingPoll) throw new Error(
        `concurrent xhr polling??`);
      this.waitingPoll = resolve;
    });

    //const sleep = m => new Promise(r => setTimeout(r, m));
    //await sleep(30000);
    //return new Response('h\n');
  }
}
