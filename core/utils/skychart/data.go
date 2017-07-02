package main

import (
	"log"
	"strings"

	"github.com/stardustapp/core/base"
	"github.com/stardustapp/core/inmem"
)

var chartList *ChartList

func mountChartList(ctx base.Context, path string) base.Folder {
	if ok := Mkdirp(ctx, path); !ok {
		panic("State path " + path + " couldn't be created")
	}

	dataRoot, ok := ctx.GetFolder(path)
	if !ok {
		panic("State path " + path + " not found")
	}

	ns := base.NewNamespace("skychart-data://", dataRoot)
	dataCtx := base.NewRootContext(ns)

	if _, ok := dataCtx.GetFolder("/charts"); !ok {
		if ok := dataCtx.Put("/charts", inmem.NewFolder("charts")); !ok {
			panic("Failed to create chart folder in " + path)
		}
		log.Println("Created charts/ in", path)
	}

	chartList = &ChartList{dataCtx}
	return dataRoot
}

type ChartList struct {
	ctx base.Context
}

func (l *ChartList) openChart(id string) *Chart {
	chartRoot, ok := l.ctx.GetFolder("/charts/" + id)
	if !ok {
		log.Println("Chart", id, "not found")
		return nil
	}

	ns := base.NewNamespace("skychart-data://", chartRoot)
	chartCtx := base.NewRootContext(ns)

	return &Chart{
		list: l,
		ctx:  chartCtx,
	}
}

func (l *ChartList) createChart(id string, ownerName string, ownerEmail string) *Chart {
	if strings.Contains(id, "/") {
		log.Println("Refusing to create chart", id)
		return nil
	}

	ok := l.ctx.Put("/charts/"+id, inmem.NewFolderOf(id,
		inmem.NewString("owner-name", ownerName),
		inmem.NewString("owner-email", ownerEmail),
		inmem.NewFolder("mounts"),
	))
	if !ok {
		log.Println("Couldn't store chart", id)
		return nil
	}

	return l.openChart(id)
}
