package main

import (
	"log"

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

	// TODO: cache this
	ns := base.NewNamespace("//"+e.chart.name+".chart.local", chart)
	chartCtx := base.NewRootContext(ns)

	var offeredSecret string
	if inStr, ok := input.(base.String); ok {
		offeredSecret = inStr.Get()
	}

	if chartSecret, ok := chartCtx.GetString("/persist/launch-secret"); ok {
		if offeredSecret == chartSecret.Get() {
			log.Println("Verified correct launch secret for ~%s", e.chart.name)
		} else {
			log.Println("Rejecting incorrect launch secret for ~%s - %q", e.chart.name, offeredSecret)
			return inmem.NewString("error", "Invalid secret for chart ~"+e.chart.name)
		}
	}

	s := &session{
		id:    sessionId,
		state: "Ready",
		root:  inmem.NewFolder(sessionId),
	}
	s.root.Put("mnt", chart)

	s.root.Put("system", inmem.NewFolderOf("system",
		inmem.NewFolder("chart-name"),
		inmem.NewFolder("sessions"),
		inmem.NewFolder("sessions"),
	))
	s.root.Put("session", inmem.NewFolder("session"))
	//s.root.Put("meta", e.chart)

	e.chart.sessions[sessionId] = s
	sessFolder.Put(sessionId, s.root)

	return inmem.NewString("session-id", sessionId)
}

type session struct {
	id, state string
	root      base.Folder
	ctx       base.Context
}
