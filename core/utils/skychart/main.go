package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"

	"github.com/stardustapp/core/base"
	"github.com/stardustapp/core/inmem"
	"github.com/stardustapp/core/skylink"
)

func main() {
	var skyLinkUri = flag.String("skylink-uri", "wss://stardust.apt.danopia.net/~~export/ws", "Backing Skylink API root")
	var statePath = flag.String("data-store", "/mnt/pub/n/redis-ns/data/skychart", "Location on Skylink upstream to persist data in")
	var rootChart = flag.String("root-chart", "system", "Name of a primary chart to compile and boot at startup")
	flag.Parse()

	if *statePath == "" {
		panic("State storage path is required")
	}

	log.Println("Creating Stardust Orbiter...")
	root := inmem.NewFolderOf("/",
		pubFolder,
		inmem.NewFolder("tmp"),
		inmem.NewFolderOf("drivers",
			skylink.GetNsimportDriver(),
			skylink.GetNsexportDriver(),
		),
	)
	ns := base.NewNamespace("starchart://", root)
	ctx := base.NewRootContext(ns)

	log.Println("Launching nsimport...")
	importFunc, _ := ctx.GetFunction("/drivers/nsimport/invoke")
	remoteFs := importFunc.Invoke(ctx, inmem.NewFolderOf("opts",
		inmem.NewString("endpoint-url", *skyLinkUri),
	))

	ctx.Put("/mnt", remoteFs)
	ctx.Put("/data", mountChartList(ctx, *statePath))

	if *rootChart != "" {
		if ok := launchChart(ctx, *rootChart); !ok {
			log.Fatalln("Mandatory chart", *rootChart, "failed to launch")

		}
	}

	root.Freeze()

	log.Println("Starting nsexport...")
	exportFunc, _ := ctx.GetFunction("/drivers/nsexport/invoke")
	exportBase, _ := ctx.Get("/pub")
	exportFunc.Invoke(ctx, exportBase)

	host := fmt.Sprint("0.0.0.0:", 9236)
	log.Printf("Listening on %s...", host)
	if err := http.ListenAndServe(host, nil); err != nil {
		log.Println("ListenAndServe:", err)
	}
}

func launchChart(ctx base.Context, name string) (ok bool) {
	openFunc, _ := ctx.GetFunction("/pub/open/invoke")
	chartApi := openFunc.Invoke(ctx, inmem.NewString("", name))
	chartDir := chartApi.(base.Folder)
	manageEnt, _ := chartDir.Fetch("browse")
	manageFold := manageEnt.(base.Folder)
	browseIvkEnt, _ := manageFold.Fetch("invoke")
	browseFunc := browseIvkEnt.(base.Function)
	chartEnt := browseFunc.Invoke(ctx, nil)

	if chartEnt != nil {
		log.Println("Compiled", name, "into", chartEnt)
		ctx.Put("/pub/charts/"+name, chartEnt)
		return true
	}
	return false
}
