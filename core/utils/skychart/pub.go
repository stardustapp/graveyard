package main

import (
	//"log"

	"github.com/stardustapp/core/base"
	"github.com/stardustapp/core/extras"
	"github.com/stardustapp/core/inmem"
)

var pubFolder *inmem.Folder = inmem.NewFolderOf("pub",
	inmem.NewFolderOf("open",
		inmem.NewFunction("invoke", openChart),
	).Freeze(),
	inmem.NewFolderOf("create",
		inmem.NewFunction("invoke", createChart),
	).Freeze(),
)

var chartCache map[string]*Chart = make(map[string]*Chart)

func openChart(ctx base.Context, input base.Entry) (output base.Entry) {
	inStr := input.(base.String)
	chartName := inStr.Get()

	if chart, ok := chartCache[chartName]; ok {
		return chart.getEntry()
	}

	chart := chartList.openChart(chartName)
	if chart == nil {
		return nil
	}

	chartCache[chartName] = chart
	return chart.getEntry()
}

func createChart(ctx base.Context, input base.Entry) (output base.Entry) {
	inputFolder := input.(base.Folder)
	chartName, _ := extras.GetChildString(inputFolder, "chart-name")
	ownerName, _ := extras.GetChildString(inputFolder, "owner-name")
	ownerEmail, _ := extras.GetChildString(inputFolder, "owner-email")

	chart := chartList.createChart(chartName, ownerName, ownerEmail)
	if chart == nil {
		return nil
	}

	return openChart(ctx, inmem.NewString("chart-name", chartName))
}
