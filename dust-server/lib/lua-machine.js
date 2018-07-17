const luaconf  = fengari.luaconf;
const lua      = fengari.lua;
const lauxlib  = fengari.lauxlib;
const lualib   = fengari.lualib;

const LUA_API = {

  /*
  this.addCtxFunction('startRoutine', () => {
      //checkProcessHealth(l)
      //extras.MetricIncr("runtime.syscall", "call:startRoutine", "app:"+p.App.AppName)

      //k, v := lua.CheckString(l, 2), l.ToValue(3)
      //steps = append(steps, step{name: k, function: v})
      params := &ProcessParams{
        ParentID: p.ProcessID,
        RoutineName: lua.CheckString(l, 1),
      }

      if l.Top() == 2 && l.IsTable(2) {
        log.Println(metaLog, "Reading Lua table for routine input", params.RoutineName)
        params.Input = readLuaEntry(l, 2).(base.Folder)
      }

      log.Printf(metaLog, "started routine %+v", params)
      p.App.StartRoutineImpl(params)
      // TODO: return routine's process
      return 0
    }},
    */

    /*/ ctx.mkdirp([pathRoot,] pathParts string...) Context
    // TODO: add readonly 'chroot' variant, returns 'nil' if not exist
    {"mkdirp", func(l *lua.State) int {
      //checkProcessHealth(l)
      //extras.MetricIncr("runtime.syscall", "call:mkdirp", "app:"+p.App.AppName)

      ctx, path := resolveLuaPath(l, p.App.ctx)
      log.Println(metaLog, "mkdirp to", path, "from", ctx.Name())

      if ok := toolbox.Mkdirp(ctx, path); !ok {
        lua.Errorf(l, "mkdirp() couldn't create folders for path %s", path)
        panic("unreachable")
      }

      subRoot, ok := ctx.GetFolder(path)
      if !ok {
        lua.Errorf(l, "mkdirp() couldn't find folder at path %s", path)
        panic("unreachable")
      }
      subNs := base.NewNamespace(ctx.Name() + path, subRoot)
      subCtx := base.NewRootContext(subNs)

      l.PushUserData(subCtx)
      lua.MetaTableNamed(l, "stardust/base.Context")
      l.SetMetaTable(-2)
      return 1
    }},

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
    read(L) {
      //checkProcessHealth(l)
      //extras.MetricIncr("runtime.syscall", "call:read", "app:"+p.App.AppName)

      const path = this.resolveLuaPath();
      console.log("read from", path)

      /*
      if str, ok := ctx.GetString(path); ok {
        l.PushString(str.Get())
      } else {
        log.Println(metaLog, "read() failed to find string at path", path)
        l.PushString("")
      }*/
      lua.lua_pushliteral(L, "#TODO");
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

    // ctx.store([pathRoot,] pathParts string..., thingToStore any) (ok bool)
    {"store", func(l *lua.State) int {
      //checkProcessHealth(l)
      //extras.MetricIncr("runtime.syscall", "call:store", "app:"+p.App.AppName)

      // get the thing to store off the end
      entry := readLuaEntry(l, -1)
      l.Pop(1)
      // read all remaining args as a path
      ctx, path := resolveLuaPath(l, p.App.ctx)

      // make sure we're not unlinking
      if entry == nil {
        lua.Errorf(l, "store() can't store nils, use ctx.unlink()")
        panic("unreachable")
      }

      // do the thing
      log.Println(metaLog, "store to", path, "from", ctx.Name(), "of", entry)
      l.PushBoolean(ctx.Put(path, entry))
      return 1
    }},

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
    async enumerate(L) {
      //checkProcessHealth(l)
      //extras.MetricIncr("runtime.syscall", "call:enumerate", "app:"+p.App.AppName)

        const path = this.resolveLuaPath(L);
/*      log.Println(metaLog, "enumeration on", path, "from", ctx.Name())

      startEntry, ok := ctx.Get(path)
      if !ok {
        lua.Errorf(l, "enumeration() couldn't find path %s", path)
        panic("unreachable")
      }

      enum := skylink.NewEnumerator(p.App.ctx, startEntry, 1)
      results := enum.Run() // <-chan nsEntry
      l.NewTable() // entry array
      idx := 0
      for res := range results {
        if idx > 0 {
          l.NewTable() // individual entry

          nameParts := strings.Split(res.Name, "/")
          baseName := nameParts[len(nameParts) - 1]

          l.PushString(baseName)
          l.SetField(2, "name")
          l.PushString(res.Name)
          l.SetField(2, "path")
          l.PushString(res.Type)
          l.SetField(2, "type")
          l.PushString(res.StringValue)
          l.SetField(2, "stringValue")

          l.RawSetInt(1, idx)
        }
        idx++
      }*/
      lua.lua_pushliteral(L, "");
      return 1;
    },

    // ctx.log(messageParts string...)
    log(L) {
      //checkProcessHealth(l)
      //extras.MetricIncr("runtime.syscall", "call:log", "app:"+p.App.AppName)

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
          const userRoot = lauxlib.luaL_checkuserdata(L, i+1, "stardust/root");
          parts[i] = userRoot;
          break;
        default:
          parts[i] = `[lua ${fengari.to_jsstring(lua.lua_typename(L, type))}]`;
        }
      }
      lua.lua_settop(L, 0);

      console.log("debug log:", ...parts);
      return 0;
    },

    // ctx.sleep(milliseconds int)
    async sleep(L) {
      //checkProcessHealth(l)
      //extras.MetricIncr("runtime.syscall", "call:sleep", "app:"+p.App.AppName)
      // TODO: support interupting to abort

      const ms = lauxlib.luaL_checkinteger(L, 1);
      lua.lua_pop(L, 1);
      //p.Status = "Sleeping: Since " + time.Now().Format(time.RFC3339Nano);
      //time.Sleep(time.Duration(ms) * time.Millisecond);

      function sleep(ms) {
        return new Promise(resolve =>
          setTimeout(resolve, ms));
      }
      await sleep(ms);

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

class LuaMachine {

  // Reads all the lua arguments and resolves a context for them
  // Reads off stack like: [base context,] names...
  resolveLuaPath(L) {
    // Discover the (optional) context at play
    let device = this.rootDevice;
    if (lua.lua_isuserdata(L, 1)) {
      device = lauxlib.luaL_checkudata(L, 1, "stardust/context");
      lua.lua_remove(L, 1);
    }

    // Read in the path strings
    const n = lua.lua_gettop(L);
    const paths = new Array(n);
    for (let i = 1; i <= n; i++) {
      paths[i] = fengari.to_jsstring(lauxlib.luaL_checkstring(L, i));
    }
    lua.lua_settop(L, 0);

    // Create a path
    if (n === 0) return '';
    return '/' + paths.join('/');
  }

  constructor(rootDevice) {
    this.rootDevice = rootDevice;

    const L = this.L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);

    // Type marker for native devices (including Environment)
    lauxlib.luaL_newmetatable(L, "stardust/root");
    lua.lua_pop(L, 1);

    lauxlib.luaL_newmetatable(L, "stardust/api");
    for (const callName in LUA_API) {
      // TODO: should be a lambda, w/ an upvalue
      const impl = L => {
        try {
          lua.lua_pushliteral(L, callName);
          const stackSize = lua.lua_gettop(L);
          lua.lua_yield(L, stackSize);
        } catch (throwable) {
          if (throwable.status !== lua.LUA_YIELD) {
            throw throwable;
          }
        }
      };
      lua.lua_pushjsfunction(L, impl);
      lua.lua_setfield(L, -2, callName);
    }
    lua.lua_setglobal(L, 'ctx');
  }

  async startThread(sourceText) {
    console.debug("Starting lua thread");

    const L = lua.lua_newthread(this.L);

    // this returns an error or a result
    const compileRes = lauxlib.luaL_loadstring(L, fengari.to_luastring(sourceText));
	if (compileRes !== lua.LUA_OK) {
      const error = fengari.to_jsstring(lua.lua_tostring(L, -1));
      throw new Error('Lua compile fault. ' + error);
    }
    const runnable = lua.lua_toproxy(L, 1);

    lua.lua_createtable(L, 0, 1);
    lua.lua_getglobal(L, 'ipairs');
    lua.lua_setfield(L, -2, fengari.to_luastring('ipairs'));
    lua.lua_getglobal(L, 'ctx');
    lua.lua_setfield(L, -2, fengari.to_luastring('ctx'));
    lua.lua_pushliteral(L, '1337');
    lua.lua_setfield(L, -2, fengari.to_luastring('id'));
    // TODO: add input
    lua.lua_setupvalue(L, -2, 1); // set environment for loaded string

    let running = true;
    let outputN = 0;
    while (running) {
      const evalRes = lua.lua_resume(L, null, outputN);

      if (evalRes === lua.LUA_ERRRUN) {
        const error = fengari.to_jsstring(lua.lua_tostring(L, -1));
        const match = error.match(/^\[string ".+?"\]:(\d+): (.+)$/);
        if (match) {
          const sourceLine = sourceText.split('\n')[match[1]-1].trim();
          throw new Error(`Lua execution fault: ${match[2]} @ line ${match[1]}: ${sourceLine}`);
        }
        throw new Error('Lua execution fault. ' + error);
      }

      if (evalRes === lua.LUA_OK) {
        console.log('lua worked!');
        const output = lua.lua_tostring(L, -1);
        return fengari.to_jsstring(output);
      }

      if (evalRes !== lua.LUA_YIELD) {
        throw new Error(`BUG: lua resume was weird`);
      }

      const callName = fengari.to_jsstring(lua.lua_tostring(L, -1));
      lua.lua_pop(L, 1);

      console.log('lua api:', callName, lua.lua_gettop(L));
      try {
        outputN = await LUA_API[callName].call(this, L);
      } catch (err) {
        console.error('BUG: lua API crashed:', err);
        lauxlib.luaL_error(L, `[BUG] ctx.${callName}() crashed`);
      }

      // put the function back at the beginning
      runnable(L);
      lua.lua_insert(L, 1);
    }
  }
}
