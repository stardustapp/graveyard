package main

import (
	"log"
	"net"
	"net/url"
	"strings"

	"github.com/stardustapp/go-cookbook/irc-client"
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
	//netConn.Write([]byte(":irc.devmode.cloud NOTICE * :*** Looking up your hostname...\n"))
	//netConn.Write([]byte(":irc.devmode.cloud NOTICE * :*** Checking Ident\n"))
	//netConn.Write([]byte(":irc.devmode.cloud NOTICE * :*** Got Ident response\n"))
	//netConn.Write([]byte(":irc.devmode.cloud NOTICE * :*** Couldn't look up your hostname\n"))
	netConn.Write([]byte(":irc.devmode.cloud NOTICE * :*** Stay cool.\n"))

	// Create the protocol client
	ircConn := irc.NewConn(netConn)

	defer log.Println("Shutting down client connection")
	defer netConn.Close()

	var pass, nick, user, realname string
	var usingCap, doneCap bool
	var capReqs []string
	for {
		message, err := ircConn.ReadMessage()
		if err != nil {
			return
		}

		switch message.Command {

		// the basics
		case "NICK":
			nick = message.Params[0]
		case "USER":
			user = message.Params[0]
			realname = message.Params[3]
		case "PASS":
			pass = strings.Join(message.Params, " ")

			// elementary capability handshaking
		case "CAP":
			usingCap = true
			switch message.Params[0] {
			case "REQ":
				capReqs = append(capReqs, message.Params[1])
			case "END":
				doneCap = true
			}

		default:
			log.Println("Unhandled:", message)
		}

		if nick != "" && user != "" && (!usingCap || doneCap) {
			break
		}
	}
	log.Println("Received registration request:", nick, user, pass, realname, capReqs)

	var domain, profile, secret, network string
	var session *ircClient.Session
	if pass != "" {
		query, err := url.ParseQuery(pass)
		if err != nil {
			ircConn.WriteMessage(&irc.Message{
				Command: "ERROR",
				Params:  []string{"Password couldn't be parsed"},
			})
			return
		}

		domain = query.Get("domain")
		profile = query.Get("profile")
		secret = query.Get("secret")
		network = query.Get("network")

		if domain == "" {
			domain = homeDomain
		} else {
			netConn.Write([]byte(":irc.devmode.cloud NOTICE * :*** Connecting to outside domain: " + domain + "\n"))
		}

		// TODO: error handling
		log.Println("Starting session for", domain, profile, secret, network)
		session = ircClient.NewSession(domain, profile, secret)
	}

	netConn.Write([]byte(":irc.devmode.cloud 001 danopia :Welcome to the devmode.cloud Internet Relay Chat Headend danopia\n"))
	netConn.Write([]byte(":irc.devmode.cloud 002 danopia :Your host is irc.devmode.cloud[irc.devmode.cloud/6667], running network-bouncer.go\n"))
	netConn.Write([]byte(":irc.devmode.cloud 003 danopia :This server was created Wed Feb 17 22:23:45 UTC 2016\n"))
	netConn.Write([]byte(":irc.devmode.cloud 004 danopia irc.devmode.cloud stardust-irc-3.5.0 DQRSZagiloswz CFILPQbcefgijklmnopqrstvz bkloveqjfI\n"))
	netConn.Write([]byte(":irc.devmode.cloud 005 danopia CPRIVMSG CNOTICE WHOX ETRACE MONITOR=100 SAFELIST ELIST=CTU KNOCK FNC CHANTYPES=&# EXCEPTS INVEX :are supported by this server\n"))
	netConn.Write([]byte(":irc.devmode.cloud 005 danopia CHANMODES=eIbq,k,flj,CFLPQcgimnprstz CHANLIMIT=&#:15 PREFIX=(ov)@+ MAXLIST=bqeI:100 MODES=4 NETWORK=Stardust STATUSMSG=@+ CALLERID=g CASEMAPPING=rfc1459 NICKLEN=30 MAXNICKLEN=31 CHANNELLEN=50 :are supported by this server\n"))
	netConn.Write([]byte(":irc.devmode.cloud 005 danopia TOPICLEN=390 DEAF=D TARGMAX=NAMES:1,LIST:1,KICK:1,WHOIS:1,PRIVMSG:4,NOTICE:4,ACCEPT:,MONITOR: CLIENTVER=3.0 :are supported by this server\n"))
	//netConn.Write([]byte(":irc.devmode.cloud 251 danopia :There are 0 users and 1 invisible on 1 servers\n"))
	//netConn.Write([]byte(":irc.devmode.cloud 255 danopia :I have 1 clients and 0 servers\n"))
	//netConn.Write([]byte(":irc.devmode.cloud 265 danopia 1 1 :Current local users 1, max 1\n"))
	//netConn.Write([]byte(":irc.devmode.cloud 266 danopia 1 1 :Current global users 1, max 1\n"))
	//netConn.Write([]byte(":irc.devmode.cloud 250 danopia :Highest connection count: 1 (1 clients) (1 netConnections received)\n"))
	netConn.Write([]byte(":irc.devmode.cloud 375 danopia :- irc.devmode.cloud Message of the Day -\n"))
	netConn.Write([]byte(":irc.devmode.cloud 372 danopia :- Thank you for your attention.\n"))
	netConn.Write([]byte(":irc.devmode.cloud 376 danopia :End of /MOTD command.\n"))
	//netConn.Write([]byte(":danopia MODE danopia :+i\n"))

	for _, channel := range session.ListChannels(network) {
		netConn.Write([]byte(":danopia!...@... JOIN " + channel + "\n"))
		netConn.Write([]byte(":irc.devmode.cloud MODE " + channel + " :+nt\n"))
		netConn.Write([]byte(":irc.devmode.cloud 353 danopia = " + channel + " :@danopia\n"))
		netConn.Write([]byte(":irc.devmode.cloud 366 danopia " + channel + " :End of /NAMES list.\n"))
		//netConn.Write([]byte(":irc.devmode.cloud PRIVMSG "+channel+" :Hello world!\n"))

		go func(channel string) {
			channelSub, err := session.SubscribeToLog("/persist/irc/networks/"+network+"/channels/"+channel+"/log", "")
			if err != nil {
				log.Fatalln(err)
			}
			for pkt := range channelSub.C {
				log.Println("log activity:", pkt.PrefixName, pkt.Command, pkt.Params)
				if pkt.Source == "server" {
					ircConn.WriteMessage(&irc.Message{
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
		message, err := ircConn.ReadMessage()
		if err != nil {
			break
		}

		switch message.Command {

		case "PRIVMSG":
			session.SendPrivmsg(network, message.Params[0], message.Params[1])

		case "PING":
			ircConn.WriteMessage(&irc.Message{
				Command: "PONG",
				Params:  message.Params,
			})

		default:
			log.Println("Unhandled:", message)
		}
	}
}
