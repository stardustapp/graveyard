package main

import (
	"flag"
	"log"
)

func main() {
	var domain = flag.String("domain", "devmode.cloud", "DNS name of the master Stardust domain to start sessions against")
	var bindAddress = flag.String("bind-address", "localhost:6667", "host:port to bind the TCP listener to")
	flag.Parse()

	if *domain == "" {
		log.Fatalln("Domain name is required")
	}
	if *bindAddress == "" {
		log.Fatalln("Bind address is required")
	}

	RunServer(*bindAddress, *domain)
}
