package main

import (
	//"log"

	"github.com/stardustapp/core/base"
	"github.com/stardustapp/core/extras"
	"github.com/stardustapp/core/inmem"
)

// TODO
var engine *Engine

var sessFolder *inmem.Folder = inmem.NewFolderOf("sessions")
var pubFolder *inmem.Folder = inmem.NewFolderOf("pub",
	inmem.NewFolderOf("open",
		inmem.NewFunction("invoke", openChart),
	).Freeze(),
	inmem.NewFolderOf("create",
		inmem.NewFunction("invoke", createChart),
	).Freeze(),
	sessFolder,
)

func openChart(ctx base.Context, input base.Entry) (output base.Entry) {
	inStr := input.(base.String)
	chartName := inStr.Get()

	chart := engine.findChart(chartName)
	if chart == nil {
		return nil
	}
	return chart.getApi()
}

func createChart(ctx base.Context, input base.Entry) (output base.Entry) {
	inputFolder := input.(base.Folder)
	chartName, _ := extras.GetChildString(inputFolder, "chart-name")
	ownerName, _ := extras.GetChildString(inputFolder, "owner-name")
	ownerEmail, _ := extras.GetChildString(inputFolder, "owner-email")

	chart := engine.createChart(chartName, ownerName, ownerEmail)
	if chart == nil {
		return nil
	}
	return chart.getApi()
}
