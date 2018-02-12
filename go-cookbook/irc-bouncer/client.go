package main

import (
	"github.com/stardustapp/go-cookbook/irc-client"
	irc "gopkg.in/irc.v1"
	"log"
	"net"
)

type Client struct {
	netConn net.Conn
	ircConn *irc.Conn

	session *ircClient.Session
	network string

	caps []string
}

func (c *Client) Close() error {
	log.Println("Shutting down client connection")
	return c.netConn.Close()
}

func (c *Client) SendServerMessage(command string, params ...string) error {
	return c.ircConn.WriteMessage(&irc.Message{
		Command: command,
		Params:  params,
		Prefix: &irc.Prefix{
			Name: "irc.devmode.cloud",
		},
	})
}
