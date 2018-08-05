class NsExport {
  constructor(namespace) {
    this.namespace = namespace;
  }

  inflateInput(raw) {
    if (!raw) {
      return null;
    }
    if (raw.constructor !== Object) {
      throw new Error(`Raw nsapi Input wasn't an Object, please read the docs`);
    }
    if (!raw.Type) {
      throw new Error(`Raw nsapi Input ${JSON.stringify(raw.Name||raw)} didn't have a Type, please check your payload`);
    }
    switch (raw.Type) {

      case 'String':
        return new StringLiteral(raw.Name || 'input', raw.StringValue);

      case 'Folder':
        const folder = new FolderLiteral(raw.Name || 'input');
        (raw.Children || []).forEach(child => {
          folder.append(this.inflateInput(child))
        });
        return folder;

      default:
        throw new Error(`nsapi Input had unimpl Type ${raw.Type}`);
    }
  }

  processOp(request, namespace) {
    const startTime = new Date;
    const promise = this
      .processOpInner(request, namespace);

    promise
      .then(resp => true, err => false)
      .then(ok => {
        const endTime = new Date;
        const elapsedMs = endTime - startTime;
        const op = request.Op || request.op;
        Datadog.Instance.count('skylink.op.invocation', 1, {op, ok});
        Datadog.Instance.gauge('skylink.op.elapsed_ms', elapsedMs, {op, ok});
      });

    return promise;
  }

  async processOpInner(request, namespace=this.namespace) {
    const Op = request.Op || request.op;
    const Path = request.Path || request.path;
    const Dest = request.Dest || request.dest;

    const Input = this.inflateInput(request.Input || request.input);
    console.debug('--> inbound operation:', Op, Path, Dest);

    switch (Op) {
      case 'ping':
        return;

      case 'get':
        var entry = await namespace.getEntry(Path);
        if (!entry) {
          throw new Error(`Path not found: ${Path}`);
        } else if (entry.get) {
          const value = await entry.get();
          if (value) return value;
          //throw new Error(`Path doesn't exist: ${Path}`);
          return null;
        } else {
          throw new Error(`Entry at ${Path} isn't gettable`);
        }

      case 'store':
        var entry = await namespace.getEntry(Dest);
        if (!entry) {
          throw new Error(`Path not found: ${Dest}`);
        } else if (entry.put) {
          return await entry.put(Input);
        } else {
          throw new Error(`Entry at ${Dest} isn't puttable`);
        }

      case 'unlink':
        var entry = await namespace.getEntry(Path);
        if (!entry) {
          throw new Error(`Path not found: ${Path}`);
        } else if (entry.put) {
          return await entry.put(null);
        } else {
          throw new Error(`Entry at ${Path} isn't unlinkable`);
        }

      case 'enumerate':
        var entry = await namespace.getEntry(Path);
        if (!entry) {
          throw new Error(`Path not found: ${Path}`);
        } else if (entry.enumerate) {
          const enumer = new EnumerationWriter(request.Depth || request.depth);
          await entry.enumerate(enumer);
          return enumer.toOutput();
        } else {
          throw new Error(`Entry at ${Path} isn't enumerable`);
        }

      case 'subscribe':
        // get the channel constructor, we'll want it
        const newChan = await namespace.getEntry('/channels/new/invoke');
        if (!newChan || !newChan.invoke) {
          throw new Error(`Transport doesn't support channels, cannot subscribe`);
        }

        var entry = await namespace.getEntry(Path);
        var depth = request.Depth || request.depth;
        if (!entry) {
          throw new Error(`Path not found: ${Path}`);
        } else if (entry.subscribe) {
          return await entry.subscribe(depth, newChan);
        } else if (entry.enumerate) {
          return await EnumerateIntoSubscription(entry.enumerate, depth, newChan);
        } else {
          throw new Error(`Entry at ${Path} isn't subscribable`);
        }

      case 'invoke':
        var entry = await namespace.getEntry(Path);
        var output;
        if (!entry) {
          throw new Error(`Path not found: ${Path}`);
        } else if (entry.invoke) {
          output = await entry.invoke(Input);
        } else {
          throw new Error(`Entry at ${Path} isn't invokable`);
        }

        // if Dest, store the rich output in the tree
        if (Dest) {
          var outEntry = await namespace.getEntry(Dest);
          if (!outEntry) {
            throw new Error(`Dest path not found: ${Dest}`);
          } else if (outEntry.put) {
            await outEntry.put(output);
          } else if (outEntry) {
            throw new Error(`Dest entry at ${Dest} isn't puttable`);
          }
          return;
        } else if (output.get) {
          // otherwise just return a flattened output
          return await output.get();
        } else if (output.Type) {
          return output;
        } else if (output) {
          throw new Error(`Output of ${Path} isn't gettable, please use Dest`);
        }

      default:
        throw new Error(`Server doesn't implement ${Op} operation`);
    }
  }

  mount(httpd) {
    httpd.addRoute('^/~~export$', SkylinkPostHandler.bind(null, this));
    httpd.addRoute('^/~~export/ws$', SkylinkWebsocketHandler.bind(null, this));
    httpd.addRoute('^/~~export/ping$', SkylinkPingHandler);
  }
}