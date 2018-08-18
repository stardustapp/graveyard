-- Queue an IRC payload for transmission to server
function sendPacket(command, params)
  ctx.invoke("state", "networks", input.network, "wire", "send", {
      command=command,
      params=params,
    })
end

--[[ #TODO: send simple PRIVMSG with word wrap
function sendComplexMessage(target, msg)
  -- wrap messages to prevent truncation at 512
  -- TODO: smarter message cutting based on measured prefix
  local maxLength = 400 - #target
  local msgCount = 0
  local offset = 0
  local 
  local thisMessage
  while 
  local sendNextChunk = () => {
    local thisChunk = msg.substr(offset, maxLength);
    if (thisChunk.length === 0) {
      return Promise.resolve(msgCount);
    }
    msgCount++;

    // not the last message? try chopping at a space
    local lastSpace = thisChunk.lastIndexOf(' ');
    if ((offset + thisChunk.length) < msg.length && lastSpace > 0) {
      thisChunk = thisChunk.slice(0, lastSpace);
      offset += thisChunk.length + 1;
    } else {
      offset += thisChunk.length;
    }

    return this
      .sendGenericPayload('PRIVMSG', [target, thisChunk])
      .then(sendNextChunk);
  };
  return sendNextChunk();
end
]]--

local aliases = {
  j = "join",
  p = "part",
  q = "quit",
}

local commands
commands = {
  say = function (arg) sendPacket("PRIVMSG", {["1"]=input.target, ["2"]=arg}) end,
  me = function (arg) sendPacket("CTCP", {["1"]=input.target, ["2"]="ACTION", ["3"]=arg}) end,
  shrug = function (arg)
    local emote = "¯\\_(ツ)_/¯"
    if #arg > 0 then
      emote = arg.." "..emote
    end
    commands.say(emote)
  end,
  slap = function (arg)
    if #arg == 0 then
      arg = "ChanServ"
    end
    commands.me("slaps "..arg.." ".."around a bit with a large trout")
  end,
  hi5 = function (arg)
    commands.say("_o/\\o_ "..arg)
  end,

  join = function (arg) sendPacket("JOIN", {["1"]=arg or input.target}) end,
  part = function (arg) sendPacket("PART", {["1"]=input.target, ["2"]=(arg or "Leaving")}) end,
  quit = function (arg) sendPacket("QUIT", {["1"]=arg or "Issued /quit"}) end,

--[[ #TODO

  // commands that pass as-is to IRC server
  case 'whois':
  case 'whowas':
  case 'who':
  case 'links':
  case 'map':
  case 'accept':
  case 'help':
  case 'userhost':
  case 'ison':
  case 'motd':
  case 'time':
  case 'nick':
  case 'mode':
  case 'stats':
  case 'ping':
  // and also some of these i guess
  case 'chanserv':
  case 'nickserv':
  case 'cs':
  case 'ns':
    promise = this.sendGenericPayload(cmd, args);
    break;

  case 'invite':
    promise = this
      .sendGenericPayload(cmd, [args[0], args[1] || this.context]);
    break;

  case 'who':
  case 'topic':
  case 'names':
    promise = this
      .sendGenericPayload(cmd, [args[0] || this.context]);
    break;

  case 'cycle':
    promise = this
      .sendGenericPayload('PART', [this.context, args.join(' ') || 'Cycling'])
      .then(() => this.sendGenericPayload('JOIN', [this.context]));
    break;

  case 'away':
    if (args.length) {
      promise = this.sendGenericPayload(cmd, [args.join(' ')]);
    } else {
      promise = this.sendGenericPayload(cmd, []);
    }
    break;

  case 'msg':
    promise = this
      .sendPrivateMessage(args[0], args.slice(1).join(' '));
    break;

  case 'notice':
    promise = this
      .sendGenericPayload(cmd, [args[0], args.slice(1).join(' ')]);
    break;

  case 'ctcp':
    promise = this
      .sendGenericPayload("CTCP", [args[0], args[1], args.slice(2).join(' ')]);
    break;

  case 'raw':
  case 'quote':
    local trailingIdx = args.findIndex(x => x.startsWith(':'));
    if (trailingIdx != -1) {
      local trailing = args.slice(trailingIdx).join(' ').slice(1);
      args.splice(trailingIdx, args.length-trailingIdx, trailing);
    }

    promise = this
      .sendGenericPayload(args[0], args.slice(1));
    break;

]]--
}

local command = aliases[input.command] or input.command

local impl = commands[command]
assert(impl, "/"..command.." is not implemented")
impl(input.argument)
