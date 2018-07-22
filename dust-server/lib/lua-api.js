const luaconf  = fengari.luaconf;
const lua      = fengari.lua;
const lauxlib  = fengari.lauxlib;
const lualib   = fengari.lualib;

const LUA_API = {

  async startRoutine(L, T) {
    // ctx.startRoutine("dial-server", {network=network})

    const routineName = lua.lua_tojsstring(L, 1);

    const sourceEntry = await this.machine.rootDevice.getEntry('/source/routines/'+routineName+'.lua');
    const source = await sourceEntry.get();
    let input = null;

    if (lua.lua_gettop(L) >= 2 && lua.lua_istable(L, 2)) {
      T.log({text: "Reading Lua table for routine input", routine: routineName});
      input = this.readLuaEntry(T, 2);
    }

    const thread = this.machine.startThread(atob(source.Data));
    const completion = thread.run(input);

    console.log("started routine", thread);
    // TODO: return routine's process
    return 0;
  },

  // ctx.mkdirp([pathRoot,] pathParts string...) Context
  // TODO: add readonly 'chroot' variant, returns 'nil' if not exist
  async mkdirp(L, T) {
    const {device, path} = this.resolveLuaPath(T);
    T.log({text: `mkdirp to ${path}`});

    T.startStep({name: 'mkdirp'});
    await mkdirp(device, path);
    T.endStep();

    const data = lua.lua_newuserdata(L, 0);
    data.root = device.pathTo(path);

    lauxlib.luaL_getmetatable(L, 'stardust/root');
    lua.lua_setmetatable(L, -2);
    return 1;
  },

/*
  // ctx.import(wireUri) Context
  {"import", func(l *lua.State) int {
    //checkProcessHealth(l)
    //extras.MetricIncr("runtime.syscall", "call:import", "app:"+p.App.AppName)

    wireUri := lua.CheckString(l, 1)
    log.Println(metaLog, "opening wire", wireUri)
    p.Status = "Waiting: Dialing " + wireUri

    // TODO: support abort interruptions
    if wire, ok := openWire(wireUri); ok {
      log.Println(metaLog, "Lua successfully opened wire", wireUri)

      // create a new base.Context
      subNs := base.NewNamespace(wireUri, wire)
      subCtx := base.NewRootContext(subNs)

      // return a Lua version of the ctx
      l.PushUserData(subCtx)
      lua.MetaTableNamed(l, "stardust/base.Context")
      l.SetMetaTable(-2)

    } else {
      log.Println(metaLog, "failed to open wire", wireUri)
      l.PushNil()
    }

    //checkProcessHealth(l)
    p.Status = "Running"
    return 1
  }},
  */

  // ctx.read([pathRoot,] pathParts string...) (val string)
  async read(L, T) {
    const {device, path} = this.resolveLuaPath(T);
    console.debug("read from", path);
    T.startStep({name: 'lookup entry'});
    const entry = await device.getEntry(path);
    T.endStep();

    if (entry && entry.get) {
      try {
        T.startStep({name: 'get entry'});
        const value = await entry.get();
        if (value.Type === 'String') {
          lua.lua_pushliteral(L, value.StringValue || '');
          T.endStep({extant: true});
          return 1;
        } else {
          T.endStep({extant: true, ok: false, text: 'Bad type', type: value.Type});
        }
      } catch (err) {
        console.debug('read() failed to find string at path', path, err);
        lua.lua_pushliteral(L, '');
        T.endStep({extant: false});
        return 1;
      }
    } else {
      T.log({text: `entry didn't exist or didn't offer a get()`});
    }

    console.debug('read() failed to find string at path', path);
    lua.lua_pushliteral(L, '');
    return 1;
  },

  /*
  // ctx.readDir([pathRoot,] pathParts string...) (val table)
  // TODO: reimplement as an enumeration
  {"readDir", func(l *lua.State) int {
    //checkProcessHealth(l)
    //extras.MetricIncr("runtime.syscall", "call:readDir", "app:"+p.App.AppName)

    ctx, path := resolveLuaPath(l, p.App.ctx)
    log.Println(metaLog, "readdir on", path, "from", ctx.Name())

    if folder, ok := ctx.GetFolder(path); ok {
      pushLuaTable(l, folder)
    } else {
      l.NewTable()
      log.Println(metaLog, "readdir() failed to find folder at path", path)
    }
    return 1
  }},
*/
  // ctx.store([pathRoot,] pathParts string..., thingToStore any) (ok bool)
  async store(L, T) {
    // get the thing to store off the end
    const value = this.readLuaEntry(T, -1);
    lua.lua_pop(L, 1);

    // make sure we're not unlinking
    if (value == null)
      throw new Error("store() can't store nils, use ctx.unlink()");

    // read all remaining args as a path
    const {device, path} = this.resolveLuaPath(T);
    console.debug("store to", path);
    T.startStep({name: 'lookup entry'});
    const entry = await device.getEntry(path);
    T.endStep();

    // do the thing
    //log.Println(metaLog, "store to", path, "from", ctx.Name(), "of", entry)
    T.startStep({name: 'put entry'});
    const ok = await entry.put(value);
    lua.lua_pushboolean(L, ok);
    T.endStep();
    return 1;
  },
/*
  // ctx.invoke([pathRoot,] pathParts string..., input any) (output any)
  {"invoke", func(l *lua.State) int {
    //checkProcessHealth(l)
    //extras.MetricIncr("runtime.syscall", "call:invoke", "app:"+p.App.AppName)

    // get the thing to store off the end, can be nil
    input := readLuaEntry(l, -1)
    l.Pop(1)

    // read all remaining args as a path
    ctx, path := resolveLuaPath(l, p.App.ctx)
    p.Status = "Blocked: Invoking " + ctx.Name() + path + " since " + time.Now().Format(time.RFC3339Nano)
    log.Println(metaLog, "invoke of", path, "from", ctx.Name(), "with input", input)

    ivk, ok := ctx.GetFunction(path + "/invoke")
    if !ok {
      lua.Errorf(l, "Tried to invoke function %s%s but did not exist", ctx.Name(), path)
      panic("unreachable")
    }

    output := ivk.Invoke(p.App.ctx, input)
    //checkProcessHealth(l)

    // try returning useful results
    switch output := output.(type) {

    case base.String:
      l.PushString(output.Get())

    default:
      // unknown = just return a context to it
      subNs := base.NewNamespace("output:/", output)
      subCtx := base.NewRootContext(subNs)

      l.PushUserData(subCtx)
      lua.MetaTableNamed(l, "stardust/base.Context")
      l.SetMetaTable(-2)
    }

    p.Status = "Running"
    return 1
  }},

  // ctx.unlink([pathRoot,] pathParts string...) (ok bool)
  {"unlink", func(l *lua.State) int {
    //checkProcessHealth(l)
    //extras.MetricIncr("runtime.syscall", "call:unlink", "app:"+p.App.AppName)

    ctx, path := resolveLuaPath(l, p.App.ctx)
    log.Println(metaLog, "unlink of", path, "from", ctx.Name())

    // do the thing
    l.PushBoolean(ctx.Put(path, nil))
    return 1
  }},
  */

  // ctx.enumerate([pathRoot,] pathParts string...) []Entry
  // Entry tables have: name, path, type, stringValue
  async enumerate(L, T) {
    const {device, path} = this.resolveLuaPath(T);

    T.startStep({name: 'get entry'});
    const enumer = new EnumerationWriter(1);
    const entry = await device.getEntry(path);
    if (!entry) {
      throw new Error(`Path not found: ${path}`);
    } else if (entry.enumerate) {
      T.startStep({name: 'perform enumeration'});
      await entry.enumerate(enumer);
      T.endStep();
    } else {
      throw new Error(`Entry at ${path} isn't enumerable`);
    }
    T.endStep();

    T.startStep({name: 'build lua result'});
    lua.lua_newtable(L); // entry array
    let idx = 0;
    enumer.entries.filter(x => x.Name).forEach((value, idx) => {
      lua.lua_newtable(L); // individual entry

      const baseName = decodeURIComponent(value.Name.split('/').slice(-1)[0]);
      lua.lua_pushliteral(L, baseName);
      lua.lua_setfield(L, 2, fengari.to_luastring("name"));
      lua.lua_pushliteral(L, value.Name);
      lua.lua_setfield(L, 2, fengari.to_luastring("path"));
      lua.lua_pushliteral(L, value.Type);
      lua.lua_setfield(L, 2, fengari.to_luastring("type"));
      lua.lua_pushliteral(L, value.StringValue);
      lua.lua_setfield(L, 2, fengari.to_luastring("stringValue"));

      lua.lua_rawseti(L, 1, idx+1);
    });
    T.endStep();
    return 1;
  },

  // ctx.log(messageParts string...)
  log(L, T) {
    const n = lua.lua_gettop(L);
    const parts = new Array(n);
    for (let i = 0; i < n; i++) {
      const type = lua.lua_type(L, i+1);
      switch (type) {
      case lua.LUA_TSTRING:
        parts[i] = fengari.to_jsstring(lauxlib.luaL_checkstring(L, i+1));
        break;
      case lua.LUA_TNUMBER:
        parts[i] = lauxlib.luaL_checknumber(L, i+1);
        break;
      case lua.LUA_TUSERDATA:
        const device = lauxlib.luaL_checkudata(L, i+1, "stardust/root");
        parts[i] = device;
        break;
      default:
        parts[i] = `[lua ${fengari.to_jsstring(lua.lua_typename(L, type))}]`;
      }
    }
    lua.lua_settop(L, 0);

    console.log("debug log:", ...parts);
    T.log({text: parts.join(' '), level: 'info'});
    return 0;
  },

  // ctx.sleep(milliseconds int)
  async sleep(L, T) {
    //checkProcessHealth(l)
    //extras.MetricIncr("runtime.syscall", "call:sleep", "app:"+p.App.AppName)
    // TODO: support interupting to abort

    const ms = lauxlib.luaL_checkinteger(L, 1);
    lua.lua_pop(L, 1);
    //p.Status = "Sleeping: Since " + time.Now().Format(time.RFC3339Nano);
    //time.Sleep(time.Duration(ms) * time.Millisecond);

    T.startStep({text: `sleeping`});
    function sleep(ms) {
      return new Promise(resolve =>
        setTimeout(resolve, ms));
    }
    await sleep(ms);
    T.endStep();

    //checkProcessHealth(l)
    //p.Status = "Running";
    return 0;
  },

/*
  // ctx.timestamp() string
  {"timestamp", func(l *lua.State) int {
    //extras.MetricIncr("runtime.syscall", "call:timestamp", "app:"+p.App.AppName)
    l.PushString(time.Now().UTC().Format(time.RFC3339))
    return 1
  }},

  // ctx.splitString(fulldata string, knife string) []string
  {"splitString", func(l *lua.State) int {
    //extras.MetricIncr("runtime.syscall", "call:splitString", "app:"+p.App.AppName)
    str := lua.CheckString(l, 1)
    knife := lua.CheckString(l, 2)
    l.SetTop(0)

    l.NewTable()
    for idx, part := range strings.Split(str, knife) {
      l.PushString(part)
      l.RawSetInt(1, idx + 1)
    }
    return 1
  }},

}, 0)
*/
};
