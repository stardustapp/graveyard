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

	network    string
	session    *ircClient.Session
	homeDomain string
	serverName string

	caps []string
}

func (client *Client) Run() {
	log.Println("Received new inbound connection")
	defer client.Close()

	// Get the user registered
	if err := client.Handshake(); err != nil {
		client.SendServerMessage(err.Error())
		return
	}

	// Run the main loop
	client.Bounce()
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
			Name: c.serverName,
		},
	})
}
