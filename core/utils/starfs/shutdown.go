package main

import (
	"log"
	"os"
	"os/signal"

	"github.com/hanwen/go-fuse/fuse"
)

func handleShutdown(server *fuse.Server) {
	sigchan := make(chan os.Signal, 10)
	signal.Notify(sigchan, os.Interrupt)
	<-sigchan

	shutdownNow(server)
	os.Exit(0)
}

func shutdownNow(server *fuse.Server) {
	log.Println("Unmounting...")
	server.Unmount()
}
