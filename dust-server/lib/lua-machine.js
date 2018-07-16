const luaconf  = fengari.luaconf;
const lua      = fengari.lua;
const lauxlib  = fengari.lauxlib;
const lualib   = fengari.lualib;

class LuaMachine {
  addCtxFunction(name, impl) {
    lua.lua_pushjsfunction(this.L, impl) // closure with those upvalues
    lua.lua_setfield(this.L, -2, name)
  }

  // Reads all the lua arguments and resolves a context for them
  resolveLuaPath() {
    let device = this.rootDevice;

    // Discover the context at play
    const userDevice = lua.lua_testuserdata(this.L, 1, "stardust/device");
    if (userDevice) {
      device = userDevice;
      lua.lua_remove(this.L, 1);
    }

    // Read in the path strings
    const n = lua.lua_top(this.L)
    const paths = new Array(n);
    for (let i = 1; i <= n; i++) {
      paths[i] = lua.lua_checkstring(this.L, i);
    }
    lua.lua_settop(0)

    // Create a path
    if (n === 0) return '';
    return '/' + paths.join('/');
  }

  constructor(rootDevice) {
    this.rootDevice = rootDevice;

    const L = this.L = lauxlib.luaL_newstate();
    //lualib.luaL_openlibs(this.L);

    // Type marker for native devices (including Environment)
    lauxlib.luaL_newmetatable(L, "stardust/device");
    lua.lua_pop(L, 1);

    lauxlib.luaL_newmetatable(L, "stardust/contextMetaTable");
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
      this.addCtxFunction('read', () => {
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
      });

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
      this.addCtxFunction('enumerate', () => {
        //checkProcessHealth(l)
        //extras.MetricIncr("runtime.syscall", "call:enumerate", "app:"+p.App.AppName)

        const path = resolveLuaPath(l, p.App.ctx)
        log.Println(metaLog, "enumeration on", path, "from", ctx.Name())

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
        }
        lua.lua_pushliteral(L, []);
        return 1;
      });
      }},

/*
      // ctx.log(messageParts string...)
      {"log", func(l *lua.State) int {
        //checkProcessHealth(l)
        //extras.MetricIncr("runtime.syscall", "call:log", "app:"+p.App.AppName)

        n := l.Top()
        parts := make([]string, n)
        for i := range parts {
          switch l.TypeOf(i+1) {
          case lua.TypeString:
            parts[i] = lua.CheckString(l, i+1)
          case lua.TypeNumber:
            parts[i] = fmt.Sprintf("%v", lua.CheckNumber(l, i+1))
          case lua.TypeUserData:
            userCtx := lua.CheckUserData(l, i+1, "stardust/base.Context")
            parts[i] = userCtx.(base.Context).Name()

          default:
            parts[i] = fmt.Sprintf("[lua %s]", l.TypeOf(i+1).String())
          }
        }
        l.SetTop(0)

        log.Println(metaLog, "debug log:", strings.Join(parts, " "))
        return 0
      }},

      // ctx.sleep(milliseconds int)
      {"sleep", func(l *lua.State) int {
        //checkProcessHealth(l)
        //extras.MetricIncr("runtime.syscall", "call:sleep", "app:"+p.App.AppName)
        // TODO: support interupting to abort

        ms := lua.CheckInteger(l, 1)
        p.Status = "Sleeping: Since " + time.Now().Format(time.RFC3339Nano)
        time.Sleep(time.Duration(ms) * time.Millisecond)

        //checkProcessHealth(l)
        p.Status = "Running"
        return 0
      }},

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
    lua.lua_setglobal(L, 'ctx');
  }

  startThread(sourceText) {
    console.debug("Starting lua thread")

    const L = lua.lua_newthread(this.L);

    // this returns an error or a result
    const compileRes = lauxlib.luaL_loadstring(L, fengari.to_luastring(sourceText));
    if (compileRes !== lua.LUA_OK) {
      const error = lua.lua_tostring(L, -1);
      throw new Error('Lua compile fault. ' + fengari.to_jsstring(error));
    }

    // this throws on error
    lua.lua_pushliteral(L, "hello world!");
    lua.lua_call(L, 1, -1);
    const output = lua.lua_tostring(L, -1);
    return fengari.to_jsstring(output);
  }
}
