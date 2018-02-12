package main

import (
	"errors"
	"log"
	"net/url"
	"strings"

	"github.com/stardustapp/go-cookbook/irc-client"
)

func (c *Client) Handshake() error {
	//c.SendServerMessage("NOTICE", "*", "*** Looking up your hostname...")
	//c.SendServerMessage("NOTICE", "*", "*** Checking Ident")
	//c.SendServerMessage("NOTICE", "*", "*** Got Ident response")
	//c.SendServerMessage("NOTICE", "*", "*** Couldn't look up your hostname")
	c.SendServerMessage("NOTICE", "*", "*** Stay cool.")

	// let the client make its offering
	var pass, nick, user, realname string
	var usingCap, doneCap bool
	for {
		message, err := c.ircConn.ReadMessage()
		if err != nil {
			return err
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
				c.caps = append(c.caps, message.Params[1])
			case "END":
				doneCap = true
			}

		default:
			log.Println("Unhandled:", message)
		}

		// break once the client sent enough
		if nick != "" && user != "" && (!usingCap || doneCap) {
			break
		}
	}
	log.Println("Received registration request:", nick, user, pass, realname, c.caps)

	// parse the registration
	if pass == "" {
		return errors.New("This server requires a password.")
	}
	query, err := url.ParseQuery(pass)
	if err != nil {
		return errors.New("Password couldn't be parsed")
	}

	// pull out the info we want
	var domain, profile, secret, network string
	domain = query.Get("domain")
	profile = query.Get("profile")
	secret = query.Get("secret")
	network = query.Get("network")

	// find session server
	if domain == "" {
		domain = c.homeDomain
	} else {
		c.SendServerMessage("NOTICE", "*", "*** Connecting to third-party domain: "+domain)
	}

	// start a session
	log.Println("Starting session for", domain, profile, secret, network)
	c.session = ircClient.NewSession(domain, profile, secret)
	c.network = network
	c.nickname = c.session.GetCurrentNick(network)
	return nil
}
