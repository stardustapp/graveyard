package main

import (
	"log"

	"github.com/stardustapp/core/base"
	"github.com/stardustapp/core/inmem"
)

type chartManageFunc struct {
	chart *Chart
	dir   base.Folder
}

var _ base.Function = (*chartManageFunc)(nil)

func (e *chartManageFunc) Name() string {
	return "manage"
}

func (e *chartManageFunc) Invoke(ctx base.Context, input base.Entry) (output base.Entry) {
	// TODO: check auth from input
	return inmem.NewFolderOf("manage-"+e.dir.Name(),
		&chartEntriesFolder{e.chart, e.dir},
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

	return &chartEntryFolder{
		chart: e.chart,
		name:  name,
		dir:   dataFolder,
	}, true
}

func (e *chartEntriesFolder) Put(name string, entry base.Entry) (ok bool) {
	log.Println("put", name, entry)
	return false
}

type chartEntryFolder struct {
	chart *Chart
	name  string
	dir   base.Folder
}

var _ base.Folder = (*chartEntryFolder)(nil)

func (e *chartEntryFolder) Name() string {
	return e.name
}
func (e *chartEntryFolder) Children() []string {
	return e.dir.Children()
}
func (e *chartEntryFolder) Fetch(name string) (entry base.Entry, ok bool) {
	switch name {

	default:
		return e.dir.Fetch(name)
	}
}
func (e *chartEntryFolder) Put(name string, entry base.Entry) (ok bool) {
	log.Println("put ", e.name, name, entry)
	return false
}
