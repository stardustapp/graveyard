package ircClient

import (
	"errors"
	"strconv"

	"github.com/stardustapp/core/base"
	"github.com/stardustapp/core/inmem"
)

// Implements a contract between an IRC application and the IRC Modem
// allowing the application to write arbitrary IRC payloads into the wire.
// This is rather low-level; make wrapper functions for your needs.

// takes Command, Params, Tags and sends it to the IRC server
func (c *IrcClient) SendPacket(network string, pkt Packet) error {
	if pkt.Command == "" {
		return errors.New("IRC Command is required")
	}

	// find the send-packet function
	statePath := "/runtime/apps/irc/namespace/state"
	wirePath := "/networks/" + network + "/wire"
	sendFunc, ok := c.ctx.GetFunction(statePath + wirePath + "/send/invoke")
	if !ok {
		return errors.New("IRC send function not found")
	}

	// send the packet
	out := sendFunc.Invoke(c.ctx, inmem.NewFolderOf("input",
		inmem.NewString("command", pkt.Command),
		buildArrayFolder("params", pkt.Params...),
		buildMapFolder("tags", pkt.Tags),
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

// maps a go string-slice into a 1-indexed Stardust "array" folder
func buildArrayFolder(name string, in ...string) base.Folder {
	folder := inmem.NewFolder(name)
	for idx, str := range in {
		idxStr := strconv.Itoa(idx + 1)
		folder.Put(idxStr, inmem.NewString(idxStr, str))
	}
	return folder
}

// maps a go string-string-map into an arbitrary Stardust folder
func buildMapFolder(name string, in map[string]string) base.Folder {
	folder := inmem.NewFolder(name)
	for key, val := range in {
		folder.Put(key, inmem.NewString(key, val))
	}
	return folder
}
