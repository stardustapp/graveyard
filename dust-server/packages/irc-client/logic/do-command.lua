function splitMessage(msg, maxLength)
  local lines = {}
  local maxLength = maxLength or 400
  for i,remainingText in ipairs(ctx.splitString(msg, "\n")) do
    while #remainingText > 0 do
      local line = remainingText
      local lineOffset = 2
      if #line > maxLength then
        line = ""
        for i,word in ipairs(ctx.splitString(remainingText, " ")) do
          --print(word, #word, #line, #word + #line + 1 > maxLength)
          if #word + #line > maxLength then
            break
          end
          if #line > 0 then
            line = line.." "..word
          else
            line = word
          end
        end
        if #line == 0 then
          line = remainingText:sub(0, maxLength)
          lineOffset = 1
        end
      end

      print(#line, maxLength, line)
      table.insert(lines, line)
      remainingText = remainingText:sub(#line + lineOffset)
    end
  end
  return lines
end

--[[ some tests
print(dump(splitMessage("The quick brown fox jumps over the lazy dog",4)))
print(dump(splitMessage("The quick brown fox jumps over the lazy dog",5)))
print(dump(splitMessage("The quick brown fox jumps over the lazy dog",6)))
print(dump(splitMessage("The\nquick\nbrown fox jumps over the lazy dog",18)))
print(dump(splitMessage("The quick brown fox jumps over the lazy dog",10)))
print(dump(splitMessage("The quick brown fox jumps over the lazy dog",30)))
print(dump(splitMessage("The quick brownbrownbrownbrownbrownbrownbrownbrownbrownbrownbrownbrownbrownbrownbrown fox jumps over the lazy dog",22)))
print(dump(splitMessage("The quick    brown fox jumps over     the lazy dog",19)))
]]--


-- Queue an IRC payload for transmission to server
function sendPacket(command, params)
  ctx.invoke("state", "networks", input.network, "wire", "send", {
      command=command,
      params=params,
    })
end

function sendSplittablePacket(command, fullMsg, maxLength)
  for i,line in ipairs(splitMessage(fullMsg, maxLength)) do
    sendPacket(command, {["1"]=input.target, ["2"]=line})
    ctx.sleep(1000)
  end
end


local aliases = {
  j = "join",
  p = "part",
  q = "quit",
}

local commands
commands = {
  say = function (arg) sendSplittablePacket("PRIVMSG", arg, 400) end,
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
