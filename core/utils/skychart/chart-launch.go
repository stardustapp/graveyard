package main

import (
	"github.com/stardustapp/core/base"
	"github.com/stardustapp/core/extras"
	"github.com/stardustapp/core/inmem"
)

type chartLaunchFunc struct {
	chart      *Chart
	entriesDir base.Folder
}

var _ base.Function = (*chartLaunchFunc)(nil)

func (e *chartLaunchFunc) Name() string {
	return "invoke"
}

func (e *chartLaunchFunc) Invoke(ctx base.Context, input base.Entry) (output base.Entry) {
	chart := engine.launchChart(e.chart)
	sessionId := extras.GenerateId()

	var secret string
	if inStr, ok := input.(base.String); ok {
		secret = inStr.Get()
	}

	if e.chart.name == "dan" {
		if secret != "butts lol" {
			return inmem.NewString("error", "Invalid secret for chart ~"+e.chart.name)
		}
	}

	s := &session{
		id:    sessionId,
		state: "Ready",
		root:  inmem.NewFolder(sessionId),
	}
	s.root.Put("mnt", chart)
	//s.root.Put("meta", e.chart)
	e.chart.sessions[sessionId] = s
	sessFolder.Put(sessionId, s.root)

	return inmem.NewString("session-id", sessionId)
}

type session struct {
	id, state string
	root      base.Folder
}
