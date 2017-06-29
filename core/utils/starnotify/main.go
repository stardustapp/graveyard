package main

import (
	"flag"
	"log"
	"time"
	"os"

	"github.com/stardustapp/core/base"
	"github.com/stardustapp/core/inmem"
	"github.com/stardustapp/core/skylink"
)

func main() {
	var starBase = flag.String("stardust-base", "ws://apt:32031/~~export/ws", "Skylink API root")
	var ircServer = flag.String("irc-server", "chat.freenode.net", "IRC server hostname")
	var ircPort = flag.String("irc-port", "6667", "IRC server port (not SSL)")
	var ircNick = flag.String("irc-nickname", "skylink", "Nickname to use on the IRC server")
	var ircPass = flag.String("irc-password", os.Getenv("IRC_PASSWORD"), "Optional IRC password")
	var ircChannel = flag.String("irc-channel", "", "REQUIRED: Channel to join & notify")
	var message = flag.String("message", "", "Message to send to channel. Blank to only join")
	flag.Parse()

	if *ircChannel == "" {
		panic("IRC channel is required")
	}

	log.Println("Creating Stardust Orbiter...")
	root := inmem.NewFolder("/")
	ns := base.NewNamespace("starnotify://", root)
	ctx := base.NewRootContext(ns)

	log.Println("Launching nsimport...")
	ctx.Put("/nsimport", skylink.GetNsimportDriver())
	importFunc, _ := ctx.GetFunction("/nsimport/invoke")
	remoteFs := importFunc.Invoke(ctx, inmem.NewFolderOf("opts",
		inmem.NewString("endpoint-url", *starBase),
	))
	ctx.Put("/mnt", remoteFs)

	openConn, ok := ctx.GetFunction("/mnt/pub/open/invoke")
	if !ok {
		panic("IRC client not found")
	}

	conn := openConn.Invoke(ctx, inmem.NewFolderOf("opts",
		inmem.NewString("hostname", *ircServer),
		inmem.NewString("port", *ircPort),
		inmem.NewString("nickname", *ircNick),
		inmem.NewString("username", *ircNick),
		inmem.NewString("realname", *ircNick),
		inmem.NewString("password", *ircPass),
	))
	if !ctx.Put("/irc-connection", conn) {
		panic("Couldn't store IRC connection")
	}
	log.Println("Got IRC connection")

	for {
		isConnStr, ok := ctx.GetString("/irc-connection/is-connected")
		if !ok {
			panic("IRC is-connected not found")
		}

		if isConnStr.Get() == "yes" {
			log.Println("IRC is connected")
			break
		}
		log.Println("Waiting for connection...")
		time.Sleep(time.Second)
	}

	getChan, ok := ctx.GetFunction("/irc-connection/get-channel/invoke")
	if !ok {
		panic("IRC channel getter not found")
	}
	channel := getChan.Invoke(ctx, inmem.NewString("chan", *ircChannel))
	if !ctx.Put("/irc-channel", channel) {
		panic("Couldn't store IRC channel")
	}
	log.Println("Got IRC channel")

	joinChan, ok := ctx.GetFunction("/irc-channel/join/invoke")
	if !ok {
		panic("IRC channel join func not found")
	}
	joinChan.Invoke(ctx, nil)
	log.Println("Join command sent")

	if *message != "" {
		sendMsg, ok := ctx.GetFunction("/irc-channel/send-message/invoke")
		if !ok {
			panic("IRC channel send-message func not found")
		}
		sendMsg.Invoke(ctx, inmem.NewString("msg", *message))
		log.Println("Message sent")
	}
}
