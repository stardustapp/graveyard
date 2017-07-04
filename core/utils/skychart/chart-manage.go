package main

import (
	"log"

	"github.com/stardustapp/core/base"
	"github.com/stardustapp/core/inmem"
	"github.com/stardustapp/core/utils/skychart/dag"
)

// Function returning an API folder
type chartManageFunc struct {
	chart *Chart
}

var _ base.Function = (*chartManageFunc)(nil)

func (e *chartManageFunc) Name() string {
	return "invoke"
}

func (e *chartManageFunc) Invoke(ctx base.Context, input base.Entry) (output base.Entry) {
	// TODO: check auth from input
	return inmem.NewFolderOf("manage-"+e.chart.name,
		&chartEntriesFolder{e.chart},
		inmem.NewFolderOf("compile",
			&chartCompileFunc{e.chart},
		).Freeze(),
	)
}

// Folder mapping to /charts/:chart/entries
type chartEntriesFolder struct {
	chart *Chart
}

var _ base.Folder = (*chartEntriesFolder)(nil)

func (e *chartEntriesFolder) Name() string {
	return "entries"
}

func (e *chartEntriesFolder) Children() []string {
	if folder, ok := e.chart.ctx.GetFolder("/entries"); ok {
		return folder.Children()
	}
	return nil
}

func (e *chartEntriesFolder) Fetch(name string) (entry base.Entry, ok bool) {
	return e.chart.ctx.GetFolder("/entries/" + name)
}

func (e *chartEntriesFolder) Put(name string, entry base.Entry) (ok bool) {
	if entry == nil {
		log.Println("Allowing deletion of mount entry", name)
	} else if ok := entryShape.Check(e.chart.ctx, entry); !ok {
		log.Println("Inbound chart mount entry doesn't validate, refusing put")
		return false
	}

	return e.chart.ctx.Put("/entries/"+name, entry)
}

// Function, reads the mount table and assembles a mount DAG
type chartCompileFunc struct {
	chart *Chart
}

var _ base.Function = (*chartCompileFunc)(nil)

func (e *chartCompileFunc) Name() string {
	return "invoke"
}

func (e *chartCompileFunc) Invoke(ctx base.Context, input base.Entry) (output base.Entry) {
	graph := dag.InflateGraphFromConfig(e.chart.ctx)
	graph.Compile()
	log.Println("Compiled DAG for", e.chart.name)
	return graph.GetFolder()
}
