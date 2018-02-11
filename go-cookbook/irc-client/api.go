package ircClient

import (
	"errors"

	"github.com/stardustapp/core/base"
	"github.com/stardustapp/core/inmem"
)

// enumerates network folder
func (c *IrcClient) ListNetworks() []string {
	if folder, ok := c.ctx.GetFolder("/persist/irc/networks"); ok {
		return folder.Children()
	}
	return nil
}

// enumerates network's channel folder
func (c *IrcClient) ListChannels(network string) []string {
	if folder, ok := c.ctx.GetFolder("/persist/irc/networks/" + network + "/channels"); ok {
		return folder.Children()
	}
	return nil
}

// enumerates network's query folder
func (c *IrcClient) ListQueries(network string) []string {
	if folder, ok := c.ctx.GetFolder("/persist/irc/networks/" + network + "/queries"); ok {
		return folder.Children()
	}
	return nil
}

// tries sending a PRIVMSG to a target on a network
func (c *IrcClient) SendPrivmsg(network string, target string, message string) error {
	if target == "" || message == "" {
		return errors.New("Target and message are required for SendPrivmsg")
	}

	// find the send-packet function
	driverPrefix := "/runtime/apps/irc/namespace/state"
	sendFunc, ok := c.ctx.GetFunction(driverPrefix + "/networks/" + network + "/wire/send/invoke")
	if !ok {
		return errors.New("IRC send function not found")
	}

	// send the packet
	out := sendFunc.Invoke(c.ctx, inmem.NewFolderOf("input",
		inmem.NewString("command", "PRIVMSG"),
		inmem.NewFolderOf("params",
			inmem.NewString("1", target),
			inmem.NewString("2", message),
		),
	))

	// check if it sent
	if out, ok := out.(base.String); ok {
		if out.Get() == "Ok" {
			return nil
		} else {
			return errors.New("From server: " + out.Get())
		}
	} else {
		return errors.New("IRC-send didn't return anything")
	}
}
