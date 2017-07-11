package main

import (
	"github.com/stardustapp/core/base"
)

type chartBrowseFunc struct {
	chart      *Chart
	entriesDir base.Folder
}

var _ base.Function = (*chartBrowseFunc)(nil)

func (e *chartBrowseFunc) Name() string {
	return "invoke"
}

func (e *chartBrowseFunc) Invoke(ctx base.Context, input base.Entry) (output base.Entry) {
	return engine.launchChart(e.chart)
}
