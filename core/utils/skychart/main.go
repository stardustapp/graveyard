package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/stardustapp/core/base"
	"github.com/stardustapp/core/inmem"
	"github.com/stardustapp/core/skylink"
	"github.com/stardustapp/core/toolbox"
)

func main() {
	var skyLinkUri = flag.String("skylink-uri", "skylink+wss://stardust.apt.danopia.net/pub/n/redis-ns", "Backing Skylink API root")
	var redisDriver = flag.String("redis-driver", "", "Backing redis-ns stardriver API root")
	var redisAddress = flag.String("redis-address", "sd-redis:6379", "Hostname of a redis instance")
	var statePath = flag.String("data-store", "/mnt/data/skychart", "Location on Skylink upstream to persist data in")
	var homeDomain = flag.String("home-domain", "devmode.cloud", "Unique constant DNS-based name for this chart server")
	var rootChart = flag.String("root-chart", "system", "Name of a primary chart to compile and boot at startup")
	var extraCharts = flag.String("extra-charts", "", "Comma-seperated names of extras charts to attempt to boot at startup. Failures will be ignored")
	flag.Parse()

	if *statePath == "" {
		panic("State storage path is required")
	}

	ctx := toolbox.NewOrbiter("starchart://")
	ctx.Put("/pub", pubFolder)
	ctx.Put("/tmp", inmem.NewFolder("tmp"))
	ctx.Put("/drivers", inmem.NewFolderOf("drivers",
		skylink.GetNsimportDriver(),
		skylink.GetNsexportDriver(),
	))

	upstreamUri := *skyLinkUri
	if *redisDriver != "" {
		log.Println("Launching redis driver nsimport...")
		if err := ctx.MountURI(*redisDriver, "/redis-ns"); err != nil {
			log.Fatalln(err)
		}

		log.Println("Dialing", *redisAddress)
		dialFunc, _ := ctx.GetFunction("/redis-ns/pub/dial/invoke")
		upstreamUri = dialFunc.Invoke(ctx, inmem.NewFolderOf("opts",
			inmem.NewString("address", *redisAddress),
		)).(base.String).Get()
		if upstreamUri == "" {
			log.Fatalln("redis-ns driver failed to dial redis at", *redisAddress)
		}

		upstreamUri += "/root"
		//upstreamUri = strings.Replace(upstreamUri, "10.244.0.135:9234", "apt:30022", 1)
		log.Println("Redis is at", upstreamUri)
	}

	if err := ctx.MountURI(upstreamUri, "/mnt"); err != nil {
		log.Fatalln(err)
	}

	engine = newEngine(*homeDomain, ctx, *statePath)
	ctx.Put("/data", engine.dataRoot)

	if *rootChart != "" {
		chart := engine.findChart(*rootChart)
		if ent := engine.launchChart(chart); ent == nil {
			log.Fatalln("Mandatory chart", *rootChart, "failed to launch")
		}
	}

	ctx.ExportPath("/pub")

	if *extraCharts != "" {
		go func(chartList []string) {
			time.Sleep(30 * time.Second)
			log.Println("Starting", len(chartList), "extra charts")
			defer log.Println("Done launching", len(chartList), "extra charts")

			for _, chartName := range chartList {
				if chart := engine.findChart(chartName); chart == nil {
					log.Println("WARN: Extra chart", chartName, "not found, ignoring")
				} else {
					if ent := engine.launchChart(chart); ent == nil {
						log.Println("WARN: Extra chart", chartName, "failed to launch, ignoring")
					}
				}
			}
		}(strings.Split(*extraCharts, ","))
	}

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
