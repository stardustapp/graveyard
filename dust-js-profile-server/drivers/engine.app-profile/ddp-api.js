GraphEngine.extend('app-profile/v1-beta1').ddpApi = {

  async init() {
    const recordObj = this.context.selectNamed('Records');
    console.log('initing app profile', recordObj, 'for', this.clientId);

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
        console.log('local method', packet.method, packet.params);
      }

    }
    return false;
  },

};
