package main

import (
	"flag"
	"log"

	"github.com/stardustapp/go-cookbook/irc-client"
)

func main() {
	var domain = flag.String("domain", "devmode.cloud", "DNS name of your Stardust domain")
	var profile = flag.String("profile", "", "Username for authentication")
	var secret = flag.String("secret", "", "Fixed secret for authentication")
	flag.Parse()

	if *domain == "" {
		panic("Domain name is required")
	}
	if *profile == "" {
		panic("Profile name is required")
	}

	client := ircClient.NewSession(*domain, *profile, *secret)
	log.Println("Available networks:", client.ListNetworks())
	log.Println("Available freenode channels:", client.ListChannels("freenode"))

	client.SendPrivmsg("freenode", "#stardust-test", "hello world!")
}
