package main

import (
	"log"
	"net"

	irc "gopkg.in/irc.v1"
)

func RunServer(bindAddress string, domain string) {
	// Listen for incoming connections.
	l, err := net.Listen("tcp", bindAddress)
	if err != nil {
		log.Fatalln("Error listening:", err.Error())
	}

	// Close the listener when the application closes.
	defer l.Close()
	log.Println("Listening on", bindAddress)

	// Listen for an incoming connection.
	for {
		conn, err := l.Accept()
		if err != nil {
			log.Println("Error accepting:", err.Error())
		}
		log.Println("Received new inbound connection")

		// Handle connections in a new goroutine.
		go HandleConn(conn, domain)
	}
}

// Handles incoming requests.
func HandleConn(netConn net.Conn, homeDomain string) {

	// Create the protocol client
	client := &Client{
		netConn: netConn,
		ircConn: irc.NewConn(netConn),
	}
	defer client.Close()

	// Get the user signed in
	if err := client.Handshake(homeDomain); err != nil {
		client.SendServerMessage(err.Error())
		return
	}

	client.Welcome()
	client.Bounce()
}
