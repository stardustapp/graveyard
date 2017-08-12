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
	if e.chart.sessionId == "" {
		e.chart.sessionId = extras.GenerateId()
		sessFolder.Put(e.chart.sessionId, engine.launchChart(e.chart))
	}

	return inmem.NewString("session-id", e.chart.sessionId)
}
