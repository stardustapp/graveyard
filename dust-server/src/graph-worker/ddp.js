class DDPManager {
  constructor(graphStore, graphFetcher) {
    this.graphStore = graphStore;
    this.fetchGraphFor = graphFetcher;

    this.sessions = new Map; // id -> DDPSession
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

    this.api.registerHandler('/sockjs/:server/:session/xhr', async ({params}, {request, clientId}) => {
      const sessionId = params.get('session');
      const serverId = params.get('server');

      if (this.sessions.has(sessionId)) {
        const session = this.sessions.get(sessionId);
        session.lastSeen = new Date;
        return session.nextPollResponse();
      } else {
        const session = new DDPSession({
          manager: this,
          request, serverId, sessionId, clientId,
        });
        session.lastSeen = new Date;
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

    // regular session cleanup
    setInterval(() => {
      // time out unattended DDP sessions (rather aggressively tbh)
      const pingCutoff = new Date() - 15000; // 15 seconds
      for (const session of this.sessions.values()) {
        if (session.lastSeen < pingCutoff && !session.closePacket) {
          console.warn('Closing abandoned DDP session', session);
          session.close(3000, 'No response from heartbeat');
        }
      }

      // delete ancient DDP sessions
      // once deleted, reusing the ID opens a new session instead of repeating the close packet
      const curateCutoff = new Date() - 5 * 60000; // 5 minutes
      const toDelete = new Set;
      for (const session of this.sessions.values()) {
        if (session.lastSeen < curateCutoff) {
          console.warn('Deleting ancient DDP session', session);
          toDelete.add(session.sessionId);
        }
      }
      // second pass so we don't edit the map while enumerating it
      for (const sessionId of toDelete) {
        this.sessions.delete(sessionId);
      }
    }, 15000);
  }
}


// mapping from packet 'msg'
const DdpPacketFuncs = {

  async connect(packet) {
    const {version, support} = packet;
    if (version !== '1') throw new Error(
      `bad sockjs version ${JSON.stringify(version)}, expected '1'`);

    await this.ready; // why not?

    this.queueResponses(
      {server_id: "0"},
      {msg: 'connected', session: this.session},
    );
  },

  async sub({id, name, params}) {
    // refuse the subscription by default
    this.queueResponses({
      msg: 'nosub',
      id: id,
      error: {
        errorType: 'Meteor.Error',
        error: 'missing-impl',
        reason: `Subscription ${name} is not implemented.`,
        message: `Subscription ${name} is not implemented. [missing-impl]`,
      }});
  },

  unsub({id}) {
    if (!this.subscriptions.has(id)) throw new Error(
      `Subscription "${id}" wasn't present, can't unsub`);

    const sub = this.subscriptions.get(id);
    return sub.unsub();
  },

  method(packet) {
    console.warn('Refusing missing method', packet.method, packet.params);
    this.queueResponses({
      msg: 'result',
      id: packet.id,
      error: {
        error: 404,
        reason: `Method '${packet.method}' not found`,
        message: `Method '${packet.method}' not found [404]`,
        errorType: 'Meteor.Error',
      },
    }, {
      msg: 'updated',
      methods: [packet.id],
    });
  },

  ping(packet) {
    this.queueResponses({
      msg: 'pong',
    });
  },
}

class DDPSession {
  constructor({manager, request, serverId, sessionId, clientId}) {
    this.manager = manager;
    this.originalReq = request;
    this.serverId = serverId;
    this.sessionId = sessionId;
    this.clientId = clientId.slice(0, 4);

    this.session = randomString();
    this.outboundQueue = [];
    this.waitingPoll = null;
    this.closePacket = null;
    // [1000, 'Normal closure']
    // [3000, 'No response from heartbeat']

    // Livedata state-keeping
    this.subscriptions = new Map;
    this.collections = new Map;

    this.ready = this.init();
  }

  // grab and init the relevant graph async
  async init() {
    // get a context on the relevant graph
    this.context = await this.manager
      .fetchGraphFor(this.originalReq.referrer);
    this.api = this.context.engine.extensions.ddpApi;
    if (!this.api) {
      console.warn(`DDPSession for ${this.context.engine.engineKey} missing ddp api`);
      this.api = {};
    }

    if ('init' in this.api) {
      await this.api.init.call(this);
    }
  }

  getCollection(collName) {
    if (this.collections.has(collName))
      return this.collections.get(collName);
    const collection = new DDPSessionCollection(this, collName);
    this.collections.set(collName, collection);
    return collection;
  }

  close(code, message) {
    if (!code || !message) throw new Error(
      `Cannot close DDP session without a code and message`);
    if (this.closePacket) throw new Error(
      `Cannot close DDP session with code ${code}, already closed`);

    // configure connection as closed
    this.closePacket = [code, message];
    if (this.waitingPoll) {
      const resolve = this.waitingPoll;
      this.waitingPoll = null;
      resolve(new Response(`c${JSON.stringify(this.closePacket)}\n`));
    }

    // shut off subs without retracting
    console.log('subs on closing sess:', this.subscriptions);
    for (const [subId, sub] of this.subscriptions.entries()) {
      sub.stop(false);
    }
    this.subscriptions.clear();
  }

  queueResponses(...packets) {
    if (this.closePacket) throw new Error(
      `Cannot queue packets for a closed DDP session`);

    for (const pkt of packets) {
      if (pkt.msg === 'pong') continue;
      const interesting = {};
      ['collection', 'id', 'name', 'subs']
        .filter(x => x in pkt)
        .forEach(x => interesting[x] = pkt[x]);
      console.debug(this.clientId, '<--', pkt.msg, interesting);
    }

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
      if (pkt.msg !== 'ping') {
        const interesting = {};
        ['session', 'id', 'name']
          .filter(x => x in pkt)
          .forEach(x => interesting[x] = pkt[x]);
        console.debug(this.clientId, '-->', pkt.msg, interesting);
      }

      //s ometimes this happens before the API is ready.
      const apiName = `${pkt.msg}Pkt`;
      try {
        if (this.api && apiName in this.api) {
          const ok = await this.api[apiName].call(this, pkt);
          if (ok) continue;
        }
      } catch (err) {
        console.error('DDP packet failure:', pkt, err);
      }

      const func = DdpPacketFuncs[pkt.msg];
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
      return new Response(`c${JSON.stringify(this.closePacket)}\n`);
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
      }, 5000);
      if (this.waitingPoll) throw new Error(
        `concurrent xhr polling??`);
      this.waitingPoll = resolve;
    });
  }
}
