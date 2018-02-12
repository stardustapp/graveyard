package main

import (
	irc "gopkg.in/irc.v1"
	"log"
)

func (c *Client) Bounce() {
	c.Welcome()
	//c.netConn.Write([]byte(":danopia", "MODE", "danopia", "+i"))

	for _, channel := range c.session.ListChannels(c.network) {
		c.ircConn.WriteMessage(&irc.Message{
			Command: "JOIN",
			Params:  []string{channel},
			Prefix:  &irc.Prefix{"danopia", "...", "..."},
		})

		c.SendServerMessage("MODE", channel, "+nt")
		c.SendServerMessage("353", "danopia", "=", channel, "@danopia")
		c.SendServerMessage("366", "danopia", channel, "End of /NAMES list.")
		//c.SendServerMessage("PRIVMSG", channel, "Hello world!")

		go func(channel string) {
			channelSub, err := c.session.SubscribeToLog("/persist/irc/networks/"+c.network+"/channels/"+channel+"/log", "")
			if err != nil {
				log.Fatalln(err)
			}
			for pkt := range channelSub.C {
				log.Println("log activity:", pkt.PrefixName, pkt.Command, pkt.Params)
				if pkt.Source == "server" {
					c.ircConn.WriteMessage(&irc.Message{
						Command: pkt.Command,
						Params:  pkt.Params,
						Prefix: &irc.Prefix{
							Name: pkt.PrefixName,
							User: pkt.PrefixUser,
							Host: pkt.PrefixHost,
						},
						// TODO: tags
					})
				}
			}
		}(channel)
	}

	for {
		message, err := c.ircConn.ReadMessage()
		if err != nil {
			break
		}

		switch message.Command {

		case "PRIVMSG":
			c.session.SendPrivmsg(c.network, message.Params[0], message.Params[1])

		case "PING":
			c.ircConn.WriteMessage(&irc.Message{
				Command: "PONG",
				Params:  message.Params,
			})

		default:
			log.Println("Unhandled:", message)
		}
	}
}
