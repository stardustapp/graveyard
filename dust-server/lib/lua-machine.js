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
    return 0
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

class LuaContext {
  constructor(L, rootDevice) {
    this.lua = L;
    this.rootDevice = rootDevice;
  }

  compileLuaToStack(T, sourceText) {
    T.startStep({name: 'Lua loadstring', bytes: sourceText.length});

    const compileRes = lauxlib.luaL_loadstring(this.lua, fengari.to_luastring(sourceText));
    if (compileRes !== lua.LUA_OK) {
      const error = lua.lua_tojsstring(this.lua, -1);
      T.endStep();
      throw new Error('Lua compile fault. ' + error);
    }

    T.endStep();
  }

  readLuaEntry(T, index) {
    const L = this.lua;
    switch (lua.lua_type(L, index)) {

    case lua.LUA_TNIL:
      return null;

    case lua.LUA_TSTRING:
      return new StringLiteral("string",
        lua.lua_tojsstring(L, index));

    case lua.LUA_TNUMBER:
      return new StringLiteral("number",
        lua.lua_tonumber(L, index).toString());

    case lua.LUA_TBOOLEAN:
      const bool = lua.lua_toboolean(L, index);
      if (bool !== 0) {
        return new StringLiteral("boolean", "yes");
      } else {
        return new StringLiteral("boolean", "no");
      }

    case lua.LUA_TUSERDATA:
      // base.Context values are passed back by-ref
      // TODO: can have a bunch of other interesting userdatas
      const device = lauxlib.luaL_checkudata(L, 1, "stardust/root");
      T.log({text: "Lua passed native star-context", device: device.toString()});
      return device;

    case lua.LUA_TTABLE:
      // Tables become folders
      lua.lua_pushvalue(L, index);
      const folder = new FolderLiteral("input");
      lua.lua_pushnil(L); // Add nil entry on stack (need 2 free slots).
      while (lua.lua_next(L, -2)) {
        const entry = this.readLuaEntry(T, -1);
        entry.Name = lua.lua_tojsstring(L, -2);
        lua.lua_pop(L, 1); // Remove val, but need key for the next iter.
        folder.append(entry);
      }
      lua.lua_pop(L, 1);
      return folder;

    default:
      lauxlib.luaL_error(L, `Stardust received unmanagable thing of type ${lua.lua_typename(L, index)}`);
      throw new Error("unreachable");
    }
  }

  pushLuaTable(T, folder) {
    const L = this.lua;
    lua.lua_newtable(L);
    for (const child of folder.Children) {
      switch (child.Type) {

      case 'String':
        lua.lua_pushliteral(L, child.StringValue || '');
        break;

      case 'Folder':
        this.pushLuaTable(T, child);
        break;

      default:
        lauxlib.luaL_error(L, `Directory entry ${key} in ${folder.Name} wasn't a recognizable type ${child.Type}`);
        throw new Error("unreachable");
      }
      lua.lua_setfield(L, -2, fengari.to_luastring(child.Name));
    }
  }

  // Reads all the lua arguments and resolves a context for them
  // Reads off stack like: [base context,] names...
  resolveLuaPath(T) {
    T.startStep({name: 'Resolve tree-path'});
    const L = this.lua;

    // Discover the (optional) context at play
    let device = this.rootDevice;
    if (lua.lua_isuserdata(L, 1)) {
      device = lauxlib.luaL_checkudata(L, 1, "stardust/root").root;
      lua.lua_remove(L, 1);
      T.log({text: 'Processed arbitrary root'});
    }

    // Read in the path strings
    const n = lua.lua_gettop(L);
    const paths = new Array(n);
    for (let i = 0; i < n; i++) {
      paths[i] = fengari.to_jsstring(lauxlib.luaL_checkstring(L, i+1));
    }
    lua.lua_settop(L, 0);

    // Give deets
    const path = (n === 0) ? '' : ('/' + paths.join('/'));
    T.endStep({text: 'Built path', path});
    return {device, path};
  }
}

class LuaMachine extends LuaContext {
  constructor(rootDevice) {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);

    super(L, rootDevice);
    this.name = 'lua';
    this.nextThreadNum = 1;
    this.threads = new Map;
    this.luaThreads = new Map;

    // Type marker for native devices (including Environment)
    lauxlib.luaL_newmetatable(this.lua, "stardust/root");
    lua.lua_pop(this.lua, 1);

    lauxlib.luaL_newmetatable(this.lua, "stardust/api");
    for (const callName in LUA_API) {
      // TODO: should be a lambda, w/ an upvalue
      const impl = L => {
        const thread = this.luaThreads.get(L);
        const argCount = lua.lua_gettop(L);
        const T = thread.traceCtx.newTrace({name: callName, callName, argCount});
        thread.T = T; // TODO

        try {
          lua.lua_pushliteral(L, callName);
          lua.lua_yield(L, argCount+1);
        } catch (throwable) {
          if (throwable.status !== lua.LUA_YIELD) {
            throw throwable;
          }
        }
      };
      lua.lua_pushjsfunction(this.lua, impl);
      lua.lua_setfield(this.lua, -2, callName);
    }
    lua.lua_setglobal(this.lua, 'ctx');
  }

  startThread(sourceText) {
    console.debug("Starting lua thread");
    const threadNum = this.nextThreadNum++;
    const thread = new LuaThread(this, threadNum);
    this.threads.set(threadNum, thread);
    this.luaThreads.set(thread.lua, thread);

    thread.compile(sourceText);
    return thread;
  }
}

class LuaThread extends LuaContext {
  constructor(machine, number) {
    super(lua.lua_newthread(machine.lua), machine.rootDevice);
    this.machine = machine;
    this.number = number;
    this.name = `${machine.name}-#${number}`

    this.traceCtx = new TraceContext(this.name);
    const T = this.traceCtx.newTrace({name: 'lua setup'});
    this.createEnvironment(T);
    T.end();
  }

  createEnvironment(T) {
    T.startStep({name: 'create environment'});
    const L = this.lua;
    lua.lua_createtable(L, 0, 1);

    lua.lua_getglobal(L, 'ipairs');
    lua.lua_setfield(L, -2, fengari.to_luastring('ipairs'));

    lua.lua_getglobal(L, 'ctx');
    lua.lua_setfield(L, -2, fengari.to_luastring('ctx'));

    lua.lua_getglobal(L, 'ctx');
    lua.lua_getfield(L, -1, 'log');
    lua.lua_remove(L, -2);
    lua.lua_setfield(L, -2, fengari.to_luastring('print'));

    lua.lua_pushliteral(L, this.number.toString());
    lua.lua_setfield(L, -2, fengari.to_luastring('thread_number'));

    // take a proxy but otherwise scrap it
    this.luaEnv = lua.lua_toproxy(L, -1);
    lua.lua_pop(L, 1);
    T.endStep();
  }

  compile(sourceText) {
    const T = this.traceCtx.newTrace({name: 'lua compile'});
    const L = this.lua;

    // compile the script
    this.compileLuaToStack(T, sourceText);

    // attach the environment to the loaded string
    this.luaEnv(L);
    lua.lua_setupvalue(L, -2, 1);

    // take a proxy but otherwise scrap it
    this.runnable = lua.lua_toproxy(L, 1);
    this.sourceText = sourceText;
    lua.lua_pop(L, 1);
    T.end();
  }

  registerGlobal(name) {
    const L = this.lua;
    this.luaEnv(L);
    lua.lua_insert(L, -2);
    lua.lua_setfield(L, -2, fengari.to_luastring(name));
    lua.lua_pop(L, 1);
  }

  async run(input) {
    const L = this.lua;

    // pretend to update 'input' global properly
    if (input) {
      this.pushLuaTable({}, input);
    } else {
      lua.lua_pushnil(L);
    }
    this.registerGlobal('input');

    // be a little state machine
    if (this.running)
      throw new Error(`BUG: Lua thread can't start, is already started`);
    this.running = true;

    // stack should just be the function
    if (lua.lua_gettop(L) !== 0)
      throw new Error(`BUG: Lua thread can't start without an empty stack`);
    this.runnable(L);

    let outputNum = 0;
    while (this.running) {
      const evalRes = lua.lua_resume(L, null, outputNum);
      switch (evalRes) {

      case lua.LUA_OK:
        this.running = false;
        break;

      case lua.LUA_ERRRUN:
        const error = lua.lua_tojsstring(L, -1);
        const match = error.match(/^\[string ".+?"\]:(\d+): (.+)$/);
        if (match) {
          const sourceLine = this.sourceText.split('\n')[match[1]-1].trim();
          throw new Error(`Lua execution fault: ${match[2]} @ line ${match[1]}: ${sourceLine}`);
        }
        throw new Error('Lua execution fault. ' + error);

      case lua.LUA_YIELD:
        const callName = lua.lua_tojsstring(L, -1);
        const T = this.T; // TODO
        lua.lua_pop(L, 1);

        //checkProcessHealth(l)
        //console.debug('lua api:', callName, 'with', lua.lua_gettop(L), 'args');
        T.startStep({name: 'implementation'});
        try {
          const impl = LUA_API[callName];
          outputNum = await impl.call(this, L, T);
        } catch (err) {
          console.error('BUG: lua API crashed:', err);
          lauxlib.luaL_error(L, `[BUG] ctx.${callName}() crashed`);
        } finally {
          T.endStep();
        }

        // put the function back at the beginning
        this.runnable(L);
        lua.lua_insert(L, 1);
        T.end();
        break;

      default:
        throw new Error(`BUG: lua resume was weird (${evalRes})`);
      }
    }

    console.warn('lua thread completed');
  }
}