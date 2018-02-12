package main

import (
	"flag"
	"log"
	"net"

	irc "gopkg.in/irc.v1"
)

func main() {
	var homeDomain = flag.String("home-domain", "devmode.cloud", "DNS name of the master Stardust domain to start sessions against")
	var bindAddress = flag.String("bind-address", "localhost:6667", "host:port to bind the TCP listener to")
	var serverName = flag.String("server-name", "irc.devmode.cloud", "DNS name the IRC server will refer to itself as")
	flag.Parse()

	if *homeDomain == "" {
		log.Fatalln("Domain name is required")
	}
	if *bindAddress == "" {
		log.Fatalln("Bind address is required")
	}

	l, err := net.Listen("tcp", *bindAddress)
	if err != nil {
		log.Fatalln("Error listening:", err.Error())
	}
	defer l.Close()

	log.Println("Listening on", *bindAddress)
	for {
		conn, err := l.Accept()
		if err != nil {
			log.Println("Error accepting:", err.Error())
		}

		client := &Client{
			netConn:    conn,
			ircConn:    irc.NewConn(conn),
			homeDomain: *homeDomain,
			serverName: *serverName,
		}
		go client.Run()
	}
}
