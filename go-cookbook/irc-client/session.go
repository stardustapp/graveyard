package ircClient

import (
	"log"

	"github.com/stardustapp/core/base"
	"github.com/stardustapp/core/inmem"
	"github.com/stardustapp/core/toolbox"
)

type Session struct {
	orbiter *toolbox.Orbiter
	ctx     base.Context
}

func NewSession(domain, profile, secret string) *Session {
	// Initialize a client, connected to the domain
	orbiter := toolbox.NewRemoteOrbiter("irc-client://", "wss://"+domain+"/~~export/ws")

	// Locate the login API
	apiCtx := orbiter.GetContextFor("/mnt/pub")
	startSessionFunc, ok := apiCtx.GetFunction("/start-session/invoke")
	if !ok {
		panic("start-session not found")
	}

	// Start an authenticated session
	sessionIdStr := startSessionFunc.Invoke(apiCtx, inmem.NewFolderOf("input",
		inmem.NewString("profile", profile),
		inmem.NewString("secret", secret),
	))

	// Check if the login worked
	output := sessionIdStr.(base.String).Get()
	if sessionIdStr.Name() == "error" {
		panic("Profile server said no: " + output)
	}
	log.Println("===")

	// Store a context into the session
	profileCtx := orbiter.GetContextFor("/mnt/pub/sessions/" + output + "/mnt")
	return &Session{orbiter, profileCtx}
}
