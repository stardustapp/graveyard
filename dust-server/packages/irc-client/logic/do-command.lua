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

function sendSplittablePacket(command, target, fullMsg, maxLength)
  for i,line in ipairs(splitMessage(fullMsg, maxLength)) do
    sendPacket(command, {["1"]=target, ["2"]=line})
    ctx.sleep(1000)
  end
end


local aliases = {
  j = "join",
  p = "part",
  q = "quit",
  msg = "message",
  raw = "quote",
  cs = "chanserv",
  ns = "nickserv",
}

function sendGenericPayload (arg, command)
  -- TODO: proper argument parsing (detect trailing quoting?)
  sendPacket(command, {["1"]=arg})
end
function sendGenericPayloadForTarget (arg, command)
  if #arg > 0 then
    sendPacket(command, {["1"]=arg})
  else
    sendPacket(command, {["1"]=input.target})
  end
end

local commands
commands = {
  -- primitive message sends
  message = function (arg)
    local target = ctx.splitString(arg, " ")[1]
    local body = arg:sub(#target + 1)
    sendSplittablePacket("PRIVMSG", target, body, 400)
  end,
  notice = function (arg)
    local target = ctx.splitString(arg, " ")[1]
    local body = arg:sub(#target + 1)
    sendSplittablePacket("NOTICE", target, body, 400)
  end,
  ctcp = function (arg)
    local target = ctx.splitString(arg, " ")[1]
    local method = ctx.splitString(arg, " ")[2]:upper()
    local body = arg:sub(#target + 1 + #method + 1)
    sendPacket("CTCP", {["1"]=target, ["2"]=method, ["3"]=body})
  end,

  -- conversational message sends
  say = function (arg)
    sendSplittablePacket("PRIVMSG", input.target, arg, 400)
  end,
  me = function (arg)
    for i,line in ipairs(splitMessage(arg, 400)) do
      sendPacket("CTCP", {["1"]=input.target, ["2"]="ACTION", ["3"]=line})
      ctx.sleep(1000)
    end
  end,

  -- message macros
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
    commands.me("slaps "..arg.." around a bit with a large trout")
  end,
  hi5 = function (arg)
    commands.say("_o/\\o_ "..arg)
  end,

  -- context utilities
  join = function (arg) sendPacket("JOIN", {["1"]=arg or input.target}) end,
  part = function (arg) sendPacket("PART", {["1"]=input.target, ["2"]=(arg or "Leaving")}) end,
  quit = function (arg) sendPacket("QUIT", {["1"]=arg or "Issued /quit"}) end,
  cycle = function (arg)
    sendPacket("PART", {["1"]=input.target, ["2"]=(arg or "Cycling")})
    sendPacket("JOIN", {["1"]=input.target})
  end,
  invite = function (arg) sendPacket("INVITE", {["1"]=arg, ["2"]=input.target}) end,

  -- raw commands that pass as-is to IRC server
  whois = sendGenericPayload,
  whowas = sendGenericPayload,
  who = sendGenericPayload,
  links = sendGenericPayload,
  map = sendGenericPayload,
  accept = sendGenericPayload,
  help = sendGenericPayload,
  userhost = sendGenericPayload,
  ison = sendGenericPayload,
  motd = sendGenericPayload,
  time = sendGenericPayload,
  nick = sendGenericPayload,
  mode = sendGenericPayload,
  stats = sendGenericPayload,
  ping = sendGenericPayload,

  -- and also some of these i guess
  chanserv = sendGenericPayload,
  nickserv = sendGenericPayload,

  -- some raw commands are wrapped a bit

  away = function (arg)
    if #arg then
      sendPacket("AWAY", {["1"]=arg})
    else
      sendPacket("AWAY", {})
    end
  end,

  who = sendGenericPayloadForTarget,
  topic = sendGenericPayloadForTarget,
  names = sendGenericPayloadForTarget,

  -- #TODO: parse and send IRC protocol for /quote
}

local command = aliases[input.command] or input.command

local impl = commands[command]
assert(impl, "/"..command.." is not implemented")
impl(input.argument, command)
