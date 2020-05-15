CURRENT_LOADER.attachBehavior(class Builder {
  build({Machine, BaseDriver, EngineDriver}) {
    this.Machine = Machine;
    this.BaseDriver = BaseDriver;
    this.EngineDriver = EngineDriver;

    this.config = {
      engineDeps: new Array,
    };
    this.engineDeps = new Map;
    this.nodes = new Map;
    this.allRelations = new Set;
  }

  async withFieldTypes(key) {
    this.fieldDriver = await this
      .Machine.loadDriver('typeset', key);
  }
  needsEngine(key) {
    this.config.engineDeps.push(key);
  }

  node(name, config) {
    if (this.nodes.has(name)) throw new Error(
      `base.Engine Schema was already presented the name ${JSON.stringify(name)}`);

    this.nodes.set(name, this.BaseDriver
      ._newNamedObject('Node', {
        RelationBuilder: this.BaseDriver
          ._makeObjectFactory('Relation', r =>
            this.allRelations.add(r)),
        FieldDriver: this.fieldDriver,
        EngineDriver: this.EngineDriver,
        RawConfig: config,
      }));
  }

  resolveName(name) {
    if (this.nodes.has(name))
      return this.nodes.get(name);
    throw new Error(`No match for name ${name}`);
    return null;
  }

  async compile() {
    for (const engineDep of this.config.engineDeps) {
      this.engineDeps.set(engineDep, await this
        .Machine.loadDriver('engine', engineDep));
    }

    //console.log('building driver', this.nodes)
    const instance = this.BaseDriver
      ._newNamedObject('Driver', {
        EngineDriver: this.EngineDriver,
        EngineDeps: this.engineDeps,
        GraphBuilder: this.BaseDriver
          ._makeObjectFactory('Graph'),
        NodeMap: this.nodes,
        AllRelations: this.allRelations,
      });

    // links relations
    for (const [name, entry] of this.nodes) {
      console.log('linking', name);
      await entry.link(this);
    }

    return instance;
  }
/*
  constructor(key, cb) {
    this.key = key;
    this.names = new Map;
    this.engineDeps = new Set;
    this.allRelations = new Set;

    this.edges = builder.edges;

    this.topType = Array
      .from(this.edges)
      .find(x => x.constructor === TopRelationBuilder)
      .topType;

    this.nameAccessors = new Map;
    for (const [name, builder] of this.names) {
      this.nameAccessors.set(name, FieldAccessor
        .forType(builder.inner));
    }

    this.extensions = new Map;
  }
*/

});
