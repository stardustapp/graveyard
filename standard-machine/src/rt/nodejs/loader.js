const {
  luaconf,
  lua,
  lauxlib,
  lualib,
} = require('fengari');
const L = lauxlib.luaL_newstate();
 
lualib.luaL_openlibs(L);

lua.lua_pushliteral(L, "hello world!");
