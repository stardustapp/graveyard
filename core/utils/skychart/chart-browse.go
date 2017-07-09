package main

import (
	"log"

	"github.com/stardustapp/core/base"
	"github.com/stardustapp/core/utils/skychart/dag"
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
	graph := dag.InflateGraphFromConfig(e.chart.ctx)
	graph.Compile()
	log.Println("Launching compiled DAG for", e.chart.name)
	return graph.Launch(ctx)
}
