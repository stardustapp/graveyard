package main

import (
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/stardustapp/core/base"
	"github.com/stardustapp/core/inmem"
	"github.com/stardustapp/core/toolbox"
	"github.com/stardustapp/core/utils/skychart/dag"
)

//var engine *Engine

type Engine struct {
	homeDomain string
	dataCtx    base.Context
	dataRoot   base.Folder

	findCache   map[string]*Chart
	launchCache map[string]base.Entry
	launchLocks map[string]*sync.Mutex
}

func newEngine(homeDomain string, ctx base.Context, path string) *Engine {
	if ok := toolbox.Mkdirp(ctx, path); !ok {
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

	if _, ok := dataCtx.GetFolder("/directories"); !ok {
		if ok := dataCtx.Put("/directories", inmem.NewFolder("directories")); !ok {
			panic("Failed to create directory folder in " + path)
		}
		log.Println("Created directories/ in", path)
	}

	engine := &Engine{
		homeDomain: homeDomain,
		dataCtx:    dataCtx,
		dataRoot:   dataRoot,

		findCache:   make(map[string]*Chart),
		launchCache: make(map[string]base.Entry),
		launchLocks: make(map[string]*sync.Mutex),
	}

	http.Handle("/", engine)
	return engine
}

func (e *Engine) expireCache(name string) {
	if chart, ok := e.findCache[name]; ok {
		log.Println("Expiring find cache", name)
		delete(e.findCache, name)

		if chart.sessionId != "" {
			log.Println("Culling session", chart.sessionId, "of", name)
			sessFolder.Put(chart.sessionId, nil)
		}

		if _, ok := e.launchCache[chart.String()]; ok {
			log.Println("Expiring launch cache", name)
			delete(e.launchCache, chart.String())
		}
		if _, ok := e.launchLocks[chart.String()]; ok {
			log.Println("WARN: Expiring launch lock for", name)
			delete(e.launchLocks, chart.String())
		}
	}
}

func (e *Engine) findChart(name string) *Chart {
	if chart, ok := e.findCache[name]; ok {
		return chart
	}

	chartRoot, ok := e.dataCtx.GetFolder("/charts/" + name)
	if !ok {
		log.Println("Chart", name, "not found")
		return nil
	}

	ns := base.NewNamespace("skylink://"+name+".chart.local", chartRoot)
	chart := &Chart{
		name:   name,
		engine: e,
		ctx:    base.NewRootContext(ns),
	}
	e.findCache[name] = chart
	return chart
}

func (e *Engine) createChart(name string, ownerName string, ownerEmail string) *Chart {
	if strings.Contains(name, "/") {
		log.Println("Refusing to create chart", name)
		return nil
	}

	ok := e.dataCtx.Put("/charts/"+name, inmem.NewFolderOf(name,
		inmem.NewString("owner-name", ownerName),
		inmem.NewString("owner-email", ownerEmail),
		inmem.NewString("home-domain", e.homeDomain),
		inmem.NewString("created-date", time.Now().Format(time.RFC3339)),
		inmem.NewFolder("entries"),
	))
	if !ok {
		log.Println("Couldn't store chart", name)
		return nil
	}

	return e.findChart(name)
}

func (e *Engine) launchChart(chart *Chart) base.Entry {
	lock, ok := e.launchLocks[chart.String()]
	if !ok {
		// TODO: this is still a bit racy
		lock = &sync.Mutex{}
		e.launchLocks[chart.String()] = lock
	}
	lock.Lock()
	defer lock.Unlock()

	if entry, ok := e.launchCache[chart.String()]; ok {
		return entry
	}

	log.Println("Compiling chart", chart.String())
	graph := dag.InflateGraphFromConfig(chart.ctx)
	graph.Compile()

	if entry := graph.Launch(e); entry != nil {
		e.launchCache[chart.String()] = entry
		log.Println("Successfully launched", chart.String())
		return entry
	}
	log.Println("Failed to launch", chart.String())
	return nil
}
