package main

import (
	"log"

	"github.com/stardustapp/core/base"
	"github.com/stardustapp/core/inmem"
)

type chartManageFunc struct {
	chart      *Chart
	entriesDir base.Folder
}

var _ base.Function = (*chartManageFunc)(nil)

func (e *chartManageFunc) Name() string {
	return "invoke"
}

func (e *chartManageFunc) Invoke(ctx base.Context, input base.Entry) (output base.Entry) {
	// TODO: check auth from input
	return inmem.NewFolderOf("manage-"+e.chart.name,
		&chartEntriesFolder{e.chart, e.entriesDir},
	)
}

type chartEntriesFolder struct {
	chart *Chart
	dir   base.Folder
}

var _ base.Folder = (*chartEntriesFolder)(nil)

func (e *chartEntriesFolder) Name() string {
	return "entries"
}

func (e *chartEntriesFolder) Children() []string {
	return e.dir.Children()
}

func (e *chartEntriesFolder) Fetch(name string) (entry base.Entry, ok bool) {
	dataEnt, ok := e.dir.Fetch(name)
	if !ok {
		return nil, false
	}

	dataFolder, ok := dataEnt.(base.Folder)
	if !ok {
		return nil, false
	}

	return dataFolder, ok
}

func (e *chartEntriesFolder) Put(name string, entry base.Entry) (ok bool) {
	if ok := entryShape.Check(e.chart.ctx, entry); !ok {
		log.Println("Inbound chart mount entry doesn't validate, refusing put")
		return false
	}

	return e.dir.Put(name, entry)
}
