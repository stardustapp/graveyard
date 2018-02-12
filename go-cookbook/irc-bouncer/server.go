package main

import (
	"log"
	"net"
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
	for {
		// Listen for an incoming connection.
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
func HandleConn(conn net.Conn, domain string) {
	conn.Write([]byte(":irc-bouncer.devmode.cloud NOTICE * :*** Looking up your hostname...\n"))
	conn.Write([]byte(":irc-bouncer.devmode.cloud NOTICE * :*** Checking Ident\n"))
	conn.Write([]byte(":irc-bouncer.devmode.cloud NOTICE * :*** Got Ident response\n"))
	conn.Write([]byte(":irc-bouncer.devmode.cloud NOTICE * :*** Couldn't look up your hostname\n"))
	conn.Write([]byte(":irc-bouncer.devmode.cloud 001 danopia :Welcome to the Stardust Internet Relay Chat Network danopia\n"))
	conn.Write([]byte(":irc-bouncer.devmode.cloud 002 danopia :Your host is irc-bouncer.devmode.cloud[irc-bouncer.devmode.cloud/6667], running version charybdis-3.5.0\n"))
	conn.Write([]byte(":irc-bouncer.devmode.cloud 003 danopia :This server was created Wed Feb 17 22:23:45 UTC 2016\n"))
	conn.Write([]byte(":irc-bouncer.devmode.cloud 004 danopia irc-bouncer.devmode.cloud charybdis-3.5.0 DQRSZagiloswz CFILPQbcefgijklmnopqrstvz bkloveqjfI\n"))
	conn.Write([]byte(":irc-bouncer.devmode.cloud 005 danopia CPRIVMSG CNOTICE WHOX ETRACE MONITOR=100 SAFELIST ELIST=CTU KNOCK FNC CHANTYPES=&# EXCEPTS INVEX :are supported by this server\n"))
	conn.Write([]byte(":irc-bouncer.devmode.cloud 005 danopia CHANMODES=eIbq,k,flj,CFLPQcgimnprstz CHANLIMIT=&#:15 PREFIX=(ov)@+ MAXLIST=bqeI:100 MODES=4 NETWORK=Stardust STATUSMSG=@+ CALLERID=g CASEMAPPING=rfc1459 NICKLEN=30 MAXNICKLEN=31 CHANNELLEN=50 :are supported by this server\n"))
	conn.Write([]byte(":irc-bouncer.devmode.cloud 005 danopia TOPICLEN=390 DEAF=D TARGMAX=NAMES:1,LIST:1,KICK:1,WHOIS:1,PRIVMSG:4,NOTICE:4,ACCEPT:,MONITOR: CLIENTVER=3.0 :are supported by this server\n"))
	conn.Write([]byte(":irc-bouncer.devmode.cloud 251 danopia :There are 0 users and 1 invisible on 1 servers\n"))
	conn.Write([]byte(":irc-bouncer.devmode.cloud 255 danopia :I have 1 clients and 0 servers\n"))
	conn.Write([]byte(":irc-bouncer.devmode.cloud 265 danopia 1 1 :Current local users 1, max 1\n"))
	conn.Write([]byte(":irc-bouncer.devmode.cloud 266 danopia 1 1 :Current global users 1, max 1\n"))
	conn.Write([]byte(":irc-bouncer.devmode.cloud 250 danopia :Highest connection count: 1 (1 clients) (1 connections received)\n"))
	conn.Write([]byte(":irc-bouncer.devmode.cloud 375 danopia :- irc-bouncer.devmode.cloud Message of the Day -\n"))
	conn.Write([]byte(":irc-bouncer.devmode.cloud 372 danopia :- Thank you.\n"))
	conn.Write([]byte(":irc-bouncer.devmode.cloud 376 danopia :End of /MOTD command.\n"))
	conn.Write([]byte(":danopia MODE danopia :+i\n"))

	conn.Write([]byte(":danopia!...@... JOIN #asdf\n"))
	conn.Write([]byte(":irc-bouncer.devmode.cloud MODE #asdf :+nt\n"))
	conn.Write([]byte(":irc-bouncer.devmode.cloud 353 danopia = #asdf :@danopia\n"))
	conn.Write([]byte(":irc-bouncer.devmode.cloud 366 danopia #asdf :End of /NAMES list.\n"))

	// Close the connection when you're done with it.
	//conn.Close()
}
