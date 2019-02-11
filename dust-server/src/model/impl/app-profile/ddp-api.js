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
    }

    if (this.database) {
      const [pubGraphId, pubObjName, parameter] = packet.params;
      const pubGraph = self.gs.graphs.get(pubGraphId);
      const pubObject = pubGraph.selectNamed(pubObjName);

      console.log('Starting subscription to', pubObject.data.name, 'with', parameter);
      const recordFilter = pubObject.getRecordFilter();
      const sub = await this.database.startSubscription(recordFilter, parameter);
      sub.sendToDDP(this, packet.id); // don't wait for it
      return true;
    }
  },

  async unsubPkt(packet) {
    if (this.pocClient) {
      await this.pocClient.unsubscribe(packet.id);
      return true;
    }

    if (this.database) {
      if (!this.subscriptions.has(packet.id)) throw new Error(
        `Subscription ${packet.id} doesn't exist to begin with, can't unsub`);
      const sub = this.subscriptions.get(packet.id);
      sub.stop();
      return true;
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