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

GraphEngine.extend('app-profile/v1-beta1').ddpApi = {

  async init(request) {
    const recordObj = this.context.selectNamed('Records');
    console.log('initing app profile', recordObj);

    this.recordMode = Object.keys(recordObj.Target)[0];
    switch (this.recordMode) {

      case 'LegacyDDP':
        const {SocketBaseUrl, AppId, Schemas} = recordObj.Target.LegacyDDP;
        this.pocClient = new PoCRecordClient(SocketBaseUrl, AppId, this.queueResponses.bind(this));
        break;

      case 'LocalCollection':
        this.database = this.context.objects.get(recordObj.Target.LocalCollection);
        if (!this.database) throw new Error(
          `LocalCollection database ${recordObj.Target.LocalCollection} not found`);
        break;
    }
  },

  async subPkt(packet) {
    if (packet.name !== '/dust/publication')
      return false;

    if (this.pocClient) {
      await this.pocClient.subscribe(packet.id, ...packet.params.slice(1));
      return true;
    } else if (this.database) {

      const subId = packet.id;
      const pubGraph = self.gs.graphs.get(packet.params[0]);
      const pubObject = pubGraph.selectNamed(packet.params[1]);

      const recordFilter = pubObject.getRecordFilter();
      console.log('subscribing to', pubObject, recordFilter);

/*
      const publication = new DocPublication {
  constructor({sourceFunc, filterFunc, sort, fields, limit}) {

      const sub = this.database.buildSubscription()
        
      {
        onDocument: doc => {
          this.queueResponses({
            msg: 'added',
            collection: 'records',
            id: doc.id,
            fields: doc.fields,
          });

          //{
          //  msg: 'changed',
          //  collection: 'records',
          //  id: doc.id,
          //  fields: {
          //    version: 5,
          //  }}
        },
        onReady: () => {
          console.log('Database subscription is ready.');
          this.queueResponses({
            msg: 'ready',
            subs: [packet.id],
          });
        },
      });
      this.registerSub(sub);
      await sub.ready;
      console.log('finished sync of', records.length, 'records');
*/
      // TODO: subscribe to record events

      return false;
    }
  },

  async methodPkt(packet) {
    if (this.pocClient) {
      await this.pocClient.ready;
      // use a copy of the packet
      packet = JSON.parse(JSON.stringify(packet));

      if (packet.method === '/records/commit') {
        packet.params[0] = this.pocClient.appId;
        this.pocClient.sendNow(packet);
        return true;
      }
      if (packet.method === '/dust/method') {
        const record = packet.params[0];
        record.packageId = this.pocClient.appId;
        this.pocClient.sendNow(packet);
        return true;
      }

    } else if (this.database) {
      if (packet.method === '/records/commit') {
        const record = packet.params[0];
        let result;
        if (record.version > 0) {
          result = await this.database.update(record);
        } else {
          result = await this.database.insert(record);
        }

        this.queueResponses({
          msg: 'result',
          id: packet.id,
          result,
        });
        // TODO: don't delay once reactivity works
        setTimeout(() => {
          this.queueResponses({
            msg: 'updated',
            methods: [packet.id],
          });
        }, 2000);
        return true;

      } else {
        console.log('local method', packet.method, method.params);
      }

    }
    return false;
  },

};

/*
  this.queueResponses({
    msg: 'added',
    collection: 'records',
    id: 'E35kkKwQSLQa72wsH',
    fields: {
      type: 'DayOverview',
      packageId: 'diary',
      version: 23,
      scope: 'global',
      createdAt: {$date: 1546405175948},
      updatedAt: {$date: 1547535604661},
      Date: '2019-01-01',
      SentimentCode: [ 'stressed' ],
      Highlight: 'Diary creation sprint',
    }
  });
  this.queueResponses({
    msg: 'added',
    collection: 'records',
    id: 'QbthKyNHjeCoxuhWR',
    fields: {
      type: 'MealEntry',
      createdAt: {$date: 1546419753713},
      updatedAt: {$date: 1546832841093},
      packageId: 'diary',
      version:10,
      scope: 'global',
      Timestamp: {$date: 1546378200000},
      SentimentCode: 'fantastic',
      Foods: ['brown rice', 'garlic naan', 'chana masala', 'daal', 'spicy veggie chicken'],
      Drinks: ['water'],
      MealSize: 'Large meal',
      Origin: 'samosa house',
    },
    cleared: ['EndTime'],
  });

  this.queueResponses({
    msg: 'ready',
    subs: [packet.id],
  });
*/