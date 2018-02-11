package ircClient

import (
	"errors"
	"time"
)

// describes one on-the-wire IRC packet
type Packet struct {
	Command string
	Params  []string

	Source    string // client, server
	Timestamp time.Time
	Tags      map[string]string

	PrefixHost string
	PrefixName string
	PrefixUser string
}

// enumerates network folder
func (s *Session) ListNetworks() []string {
	if folder, ok := s.ctx.GetFolder("/persist/irc/networks"); ok {
		return folder.Children()
	}
	return nil
}

// enumerates network's channel folder
func (s *Session) ListChannels(network string) []string {
	if folder, ok := s.ctx.GetFolder("/persist/irc/networks/" + network + "/channels"); ok {
		return folder.Children()
	}
	return nil
}

// enumerates network's query folder
func (s *Session) ListQueries(network string) []string {
	if folder, ok := s.ctx.GetFolder("/persist/irc/networks/" + network + "/queries"); ok {
		return folder.Children()
	}
	return nil
}

// sends a PRIVMSG to a target on a network
func (s *Session) SendPrivmsg(network string, target string, message string) error {
	if target == "" || message == "" {
		return errors.New("Target and message are required for SendPrivmsg")
	}

	return s.SendPacket(network, Packet{
		Command: "PRIVMSG",
		Params:  []string{target, message},
	})
}
