package main

import (
	"github.com/stardustapp/core/base"
	"github.com/stardustapp/core/inmem"
)

type chartApi struct {
	chart *Chart
}

var _ base.Folder = (*chartApi)(nil)

func (a *chartApi) Name() string {
	return a.chart.name
}

func (a *chartApi) Children() []string {
	return []string{
    "manage",
    "browse",
    "owner-name",
    "owner-email",
    "created-date",
    "home-domain",
  }
}

func (a *chartApi) Fetch(name string) (child base.Entry, ok bool) {
	switch name {

  case "manage":
    return inmem.NewFolderOf("manage",
			&chartManageFunc{a.chart},
		).Freeze(), true

  case "browse":
  	entriesDir, _ := a.chart.ctx.GetFolder("/entries")
    return inmem.NewFolderOf("browse",
			&chartBrowseFunc{a.chart, entriesDir},
		).Freeze(), true

  case "owner-name":
    return a.chart.ctx.GetString("/owner-name")
  case "owner-email":
    return a.chart.ctx.GetString("/owner-email")
  case "created-date":
    return a.chart.ctx.GetString("/created-date")
  case "home-domain":
    return a.chart.ctx.GetString("/home-domain")
  }
  return
}

func (a *chartApi) Put(name string, child base.Entry) (ok bool) {
  return false
}
